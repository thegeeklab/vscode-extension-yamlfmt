import assert from "node:assert"
import { resolve } from "node:path"
import * as vscode from "vscode"
import { closeAllEditors, openDocument, resetConfiguration, waitForText } from "./helpers.js"

suite("Config resolution (settings)", () => {
  teardown(async () => {
    await closeAllEditors()
    await resetConfiguration()
  })

  test("should use custom config via -conf arg", async function () {
    this.retries(2)

    const testdataDir = resolve(import.meta.dirname, "../../test/suite/testdata")
    const configPath = resolve(testdataDir, "indent4.yamlfmt")

    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update("args", ["-conf", configPath], vscode.ConfigurationTarget.Global)

    const document = await openDocument("items:\n  - one\n  - two\n", "yaml")

    const textChangePromise = waitForText(document)
    await vscode.commands.executeCommand("editor.action.formatDocument")
    const formatted = await textChangePromise

    assert.ok(formatted.includes("    - one"))
    assert.ok(formatted.includes("    - two"))
  })

  test("should strip -in from user args and still format", async function () {
    this.retries(2)

    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update("args", ["-in"], vscode.ConfigurationTarget.Global)

    const document = await openDocument("name:    test\n", "yaml")

    const textChangePromise = waitForText(document)
    await vscode.commands.executeCommand("editor.action.formatDocument")
    const formatted = await textChangePromise

    assert.strictEqual(formatted, "name: test\n")
  })

  test("should pass -formatter flag via args", async function () {
    this.retries(2)

    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update(
      "args",
      ["-formatter=include_document_start=true"],
      vscode.ConfigurationTarget.Global
    )

    const document = await openDocument("name: test\n", "yaml")

    const textChangePromise = waitForText(document)
    await vscode.commands.executeCommand("editor.action.formatDocument")
    const formatted = await textChangePromise

    assert.ok(formatted.startsWith("---\n"))
    assert.ok(formatted.includes("name: test"))
  })
})
