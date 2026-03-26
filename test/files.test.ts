import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { platform } from "node:os"
import { caseDirTest, closeAllEditors } from "./helpers.js"

suite("Config resolution (files)", () => {
  const casesDir = join(import.meta.dirname, "../../test/suite/testdata/files")
  const testCases = readdirSync(casesDir).filter((entry) =>
    statSync(join(casesDir, entry)).isDirectory()
  )

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
      const dirPath = join(casesDir, tc)

      process.env.XDG_CONFIG_HOME = join(dirPath, "xdg-config-home")

      await caseDirTest(dirPath)
    })
  }
})
