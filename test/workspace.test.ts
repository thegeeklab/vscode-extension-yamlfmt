import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { caseDirTest, closeAllEditors, resetConfiguration } from "./helpers.js"

suite("Config resolution (workspace)", () => {
  const casesDir = join(import.meta.dirname, "../../test/suite/testdata/workspace")
  const testCases = readdirSync(casesDir).filter((entry) =>
    statSync(join(casesDir, entry)).isDirectory()
  )

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
