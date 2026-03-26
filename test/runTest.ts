import { runTests } from "@vscode/test-electron"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

async function main() {
  try {
    const extensionDevelopmentPath = resolve(import.meta.dirname, "../..")
    const extensionTestsPath = resolve(import.meta.dirname, "./index.js")
    const userDataDir = join(tmpdir(), "yamlfmt-test")

    // Clean up stale user data from previous test runs
    rmSync(userDataDir, { recursive: true, force: true })

    const version = process.env.VSCODE_TEST_VERSION ?? "stable"

    await runTests({
      version,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        "--new-window",
        "--disable-extensions",
        "--disable-gpu",
        "--user-data-dir",
        userDataDir
      ]
    })
  } catch (err) {
    console.error("Failed to run tests", err)
    process.exit(1)
  }
}

main()
