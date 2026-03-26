import { cpSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { platform, tmpdir } from "node:os"
import { caseDirTest, closeAllEditors } from "./helpers.js"

suite("Config resolution (files)", () => {
  const casesDir = join(import.meta.dirname, "../../test/suite/testdata/files")
  const testCases = readdirSync(casesDir).filter((entry) =>
    statSync(join(casesDir, entry)).isDirectory()
  )

  // Copy test cases to a temp directory so that yamlfmt cannot walk up
  // the directory tree and discover the project root .yamlfmt.yaml.
  const tmpBase = mkdtempSync(join(tmpdir(), "yamlfmt-files-"))
  for (const tc of testCases) {
    cpSync(join(casesDir, tc), join(tmpBase, tc), { recursive: true })
  }

  suiteTeardown(() => {
    rmSync(tmpBase, { recursive: true, force: true })
  })

  teardown(async () => {
    await closeAllEditors()
    delete process.env.XDG_CONFIG_HOME
  })

  for (const tc of testCases) {
    if (tc === "config-xdg" && platform() === "win32") {
      continue
    }

    test(tc, async function () {
      this.retries(2)
      const dirPath = join(tmpBase, tc)

      process.env.XDG_CONFIG_HOME = join(dirPath, "xdg-config-home")

      await caseDirTest(dirPath)
    })
  }
})
