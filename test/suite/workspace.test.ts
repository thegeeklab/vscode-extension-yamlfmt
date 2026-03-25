import * as assert from "node:assert"
import * as fs from "node:fs"
import * as path from "node:path"
import * as vscode from "vscode"
import { before } from "mocha"
import { sleep, caseDirTest } from "./lib.js"

suite("workspace", () => {
  // Point back to the original source directory so we don't have to copy test files
  const casesDir = path.resolve(import.meta.dirname, "../../../test/suite/testdata/workspace")
  const testCases = fs
    .readdirSync(casesDir)
    .filter((entry) => fs.statSync(path.join(casesDir, entry)).isDirectory())

  before(async () => {
    // Add workspace folders one at a time to ensure proper registration
    for (const tc of testCases) {
      vscode.workspace.updateWorkspaceFolders(
        vscode.workspace.workspaceFolders?.length ?? 0,
        null,
        { uri: vscode.Uri.file(path.join(casesDir, tc)) }
      )
      await sleep(1000)
    }
    await sleep(2000)
  })

  for (const tc of testCases) {
    test(tc, async () => {
      const tcPath = path.join(casesDir, tc)
      const wsf = vscode.workspace.workspaceFolders?.find((f) => f.uri.fsPath === tcPath)

      if (wsf) {
        await caseDirTest(wsf.uri.fsPath)
      } else {
        assert.fail(`Workspace folder not found for ${tc}`)
      }
    })
  }
})
