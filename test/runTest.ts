import * as path from "node:path";
import * as os from "node:os";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(import.meta.dirname, "../../");
    const extensionTestsPath = path.resolve(import.meta.dirname, "./suite/index.js");

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        "--disable-extensions",
        "--user-data-dir", path.join(os.tmpdir(), "yamlfmt-test")
      ],
    });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
