import { runTests } from "@vscode/test-electron"
import { readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

async function main() {
  try {
    const extensionDevelopmentPath = resolve(import.meta.dirname, "../..")
    const extensionTestsPath = resolve(import.meta.dirname, "./index.js")
    const userDataDir = join(tmpdir(), "yamlfmt-test")

    // Clean up stale user data from previous test runs
    rmSync(userDataDir, { recursive: true, force: true })

    // Test against the VS Code version declared in package.json (@types/vscode),
    // unless overridden via VSCODE_TEST_VERSION
    const packageJson = JSON.parse(
      readFileSync(resolve(extensionDevelopmentPath, "package.json"), "utf-8")
    ) as { devDependencies: { "@types/vscode": string } }

    const version = process.env.VSCODE_TEST_VERSION ?? packageJson.devDependencies["@types/vscode"]

    await runTests({
      version,
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: { ...process.env, SHELL: "/bin/sh" },
      launchArgs: [
        "--new-window",
        "--disable-extensions",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-crash-reporter",
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
