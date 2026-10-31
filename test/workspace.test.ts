import { readdirSync } from "node:fs"
import { join } from "node:path"
import { caseDirTest, closeAllEditors, resetConfiguration } from "./helpers.js"

suite("Config resolution (workspace)", () => {
  const casesDir = join(import.meta.dirname, "../../test/suite/testdata/workspace")
  const testCases = readdirSync(casesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  teardown(async () => {
    await closeAllEditors()
    await resetConfiguration()
  })

  for (const tc of testCases) {
    test(tc, async function () {
      this.timeout(15000)
      this.retries(2)
      await caseDirTest(join(casesDir, tc))
    })
  }
})
