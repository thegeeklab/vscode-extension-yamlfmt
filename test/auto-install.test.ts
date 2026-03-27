import assert from "node:assert"
import { execFileSync } from "node:child_process"
import { access, rm } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { join } from "node:path"
import * as vscode from "vscode"
import { type ExtensionApi } from "../src/extension.js"
import {
  extractFileFromTarGz,
  getArchId,
  getBinaryName,
  getPlatformId,
  installYamlFmt,
  parseTar
} from "../src/helpers.js"
import {
  buildTar,
  closeAllEditors,
  EXTENSION_ID,
  gzip,
  openDocument,
  resetConfiguration,
  waitForText
} from "./helpers.js"

suite("Tar archive parsing", () => {
  test("should extract a file by exact name", () => {
    const content = Buffer.from("hello world")
    const tar = buildTar("yamlfmt", content)

    const result = parseTar(tar, "yamlfmt")

    assert.ok(result, "Expected a result buffer")
    assert.strictEqual(result.toString(), "hello world")
  })

  test("should extract a file by suffix match (path prefix)", () => {
    const content = Buffer.from("binary content")
    const tar = buildTar("yamlfmt_0.21.0_Darwin_arm64/yamlfmt", content)

    const result = parseTar(tar, "yamlfmt")

    assert.ok(result, "Expected a result buffer")
    assert.strictEqual(result.toString(), "binary content")
  })

  test("should return null when file is not found", () => {
    const content = Buffer.from("data")
    const tar = buildTar("other-file", content)

    const result = parseTar(tar, "yamlfmt")

    assert.strictEqual(result, null)
  })

  test("should handle empty tar (only EOF blocks)", () => {
    const eof = Buffer.alloc(1024, 0)
    const result = parseTar(eof, "yamlfmt")

    assert.strictEqual(result, null)
  })

  test("should handle binary file content correctly", () => {
    const content = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]) // ELF magic
    const tar = buildTar("yamlfmt", content)

    const result = parseTar(tar, "yamlfmt")

    assert.ok(result)
    assert.deepStrictEqual(Array.from(result), Array.from(content))
  })

  test("should handle multiple entries and return the first match", () => {
    const first = Buffer.from("first")
    const second = Buffer.from("second")

    const tar1 = buildTar("yamlfmt", first)
    const tar2 = buildTar("yamlfmt", second)

    // Concatenate two archives (strip the EOF blocks from the first)
    // For simplicity, just test that the first match is returned
    const combined = Buffer.concat([
      tar1.subarray(0, tar1.length - 1024), // strip EOF
      tar2
    ])

    const result = parseTar(combined, "yamlfmt")

    assert.ok(result)
    assert.strictEqual(result.toString(), "first")
  })
})

suite("Tar archive extraction", () => {
  test("should extract a file from a .tar.gz buffer", async () => {
    const content = Buffer.from("yamlfmt binary data")
    const tar = buildTar("yamlfmt", content)
    const tarGz = await gzip(tar)

    const result = await extractFileFromTarGz(tarGz, "yamlfmt")

    assert.strictEqual(result.toString(), "yamlfmt binary data")
  })

  test("should reject when the target file is not in the archive", async () => {
    const content = Buffer.from("other data")
    const tar = buildTar("other-file", content)
    const tarGz = await gzip(tar)

    await assert.rejects(() => extractFileFromTarGz(tarGz, "yamlfmt"), /not found in archive/)
  })

  test("should reject on invalid gzip data", async () => {
    const notGzip = Buffer.from("this is not gzip data")

    await assert.rejects(() => extractFileFromTarGz(notGzip, "yamlfmt"))
  })
})

suite("Auto-install platform helpers", () => {
  test("should map the current platform to a known release OS name", () => {
    // We can only test the current platform; just verify it doesn't throw
    // and returns one of the expected values.
    const id = getPlatformId()
    assert.ok(["Darwin", "Linux", "Windows"].includes(id), `Unexpected platform id: ${id}`)
  })

  test("should map the current architecture to a known release arch name", () => {
    const id = getArchId()
    assert.ok(["arm64", "x86_64", "i386"].includes(id), `Unexpected arch id: ${id}`)
  })

  test("should return 'yamlfmt' as binary name on non-Windows platforms", () => {
    if (process.platform !== "win32") {
      assert.strictEqual(getBinaryName(), "yamlfmt")
    }
  })

  test("should return 'yamlfmt.exe' as binary name on Windows", () => {
    if (process.platform === "win32") {
      assert.strictEqual(getBinaryName(), "yamlfmt.exe")
    }
  })
})

suite("Auto-install integration", () => {
  let installDir: string
  let outputChannel: vscode.LogOutputChannel

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID)!
    const api = await ext.activate()
    installDir = api.installDir
    outputChannel = api.outputChannel
  })

  teardown(async () => {
    await closeAllEditors()
    await resetConfiguration()
  })

  test("should download and install yamlfmt binary from GitHub releases", async function () {
    // This test makes a real network request — allow extra time.
    this.timeout(60000)

    // Remove any previously cached binary so we always exercise the download path.
    const binaryPath = join(installDir, getBinaryName())
    try {
      await rm(binaryPath, { force: true })
    } catch {
      // Ignore if it doesn't exist
    }

    const installedPath = await installYamlFmt(installDir, outputChannel)

    // Binary must exist at the returned path
    await assert.doesNotReject(
      () => access(installedPath, fsConstants.F_OK),
      "Installed binary should exist on disk"
    )

    // Binary must be executable on Unix
    if (process.platform !== "win32") {
      await assert.doesNotReject(
        () => access(installedPath, fsConstants.X_OK),
        "Installed binary should be executable"
      )
    }

    // Binary must produce output when invoked with --version
    const version = execFileSync(installedPath, ["--version"], { encoding: "utf8" })
    assert.ok(version.trim().length > 0, "yamlfmt --version should produce output")
  })

  test("should format a document using the auto-installed binary", async function () {
    // This test makes a real network request if the binary is not yet cached.
    this.timeout(60000)
    this.retries(2)

    // Install the binary and get its path.
    const installedPath = await installYamlFmt(installDir, outputChannel)

    // Set yamlfmt.path to the auto-installed binary path.
    // This tests that the auto-installed binary works correctly for formatting.
    // Note: We set the path explicitly because on test machines yamlfmt may be
    // installed in PATH, and the resolution order checks PATH before the auto-installed binary.
    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update("path", installedPath, vscode.ConfigurationTarget.Global)

    try {
      const document = await openDocument("name:    test\nkey:   value\n", "yaml")

      const textChangePromise = waitForText(document)
      await vscode.commands.executeCommand("editor.action.formatDocument")
      const formatted = await textChangePromise

      assert.strictEqual(formatted, "name: test\nkey: value\n")
    } finally {
      // Reset path to default
      await config.update("path", undefined, vscode.ConfigurationTarget.Global)
    }
  })
})
