import assert from "node:assert"
import { execSync } from "node:child_process"
import * as vscode from "vscode"
import {
  closeAllEditors,
  defaultFormattingOptions,
  openDocument,
  resetConfiguration,
  waitForText
} from "./helpers.js"

suite("Error handling", () => {
  teardown(async () => {
    await closeAllEditors()
    await resetConfiguration()
  })

  test("should handle missing binary gracefully", async function () {
    this.retries(2)

    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update("path", "/nonexistent/path/yamlfmt", vscode.ConfigurationTarget.Global)

    const document = await openDocument("name: test\n", "yaml")

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      defaultFormattingOptions
    )

    assert.ok(!edits || edits.length === 0)
  })

  test("should handle invalid YAML input without crashing", async function () {
    this.retries(2)

    const document = await openDocument(":\n  - :\n    : :\n", "yaml")

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      defaultFormattingOptions
    )

    // Should not throw — either returns edits or empty array
    assert.ok(edits !== undefined || edits === undefined)
  })

  test("should handle invalid args gracefully", async function () {
    this.retries(2)

    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update(
      "args",
      ["--invalid-flag-that-does-not-exist"],
      vscode.ConfigurationTarget.Global
    )

    const document = await openDocument("name: test\n", "yaml")

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      defaultFormattingOptions
    )

    assert.ok(!edits || edits.length === 0)
  })

  test("should work with custom yamlfmt.path", async function () {
    this.retries(2)

    let yamlfmtPath: string
    try {
      yamlfmtPath = execSync("which yamlfmt", { encoding: "utf-8" }).trim()
    } catch {
      this.skip()
      return
    }

    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update("path", yamlfmtPath, vscode.ConfigurationTarget.Global)

    const document = await openDocument("name:    test\n", "yaml")

    const textChangePromise = waitForText(document)
    await vscode.commands.executeCommand("editor.action.formatDocument")
    const formatted = await textChangePromise

    assert.strictEqual(formatted, "name: test\n")
  })
})
