import * as fs from "node:fs";
import * as path from "node:path";
import { caseDirTest } from "./lib.js";
import { platform } from "node:os";
import * as vscode from "vscode";

suite("files", () => {
  // Point back to the original source directory
  const casesDir = path.resolve(import.meta.dirname, "../../../test/suite/testdata/files");
  const testCases = fs
    .readdirSync(casesDir)
    .filter((entry) => fs.statSync(path.join(casesDir, entry)).isDirectory());

  for (const tc of testCases) {
    if (tc === "config-xdg" && platform() === "win32") {
      vscode.window.showInformationMessage(
        "skipping XDG_CONFIG_HOME test due to windows platform!",
      );
      continue;
    }

    test(tc, async () => {
      const dirPath = path.join(casesDir, tc);
      await caseDirTest(dirPath);
    });
  }
});
