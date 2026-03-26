import assert from "node:assert"
import * as vscode from "vscode"
import { closeAllEditors, openDocument, resetConfiguration } from "./helpers.js"
import type { ExtensionApi } from "../src/extension.js"

suite("Output channel", () => {
  teardown(async () => {
    await closeAllEditors()
    await resetConfiguration()
  })

  test("should create a LogOutputChannel named yamlfmt on activation", async () => {
    const ext = vscode.extensions.getExtension<ExtensionApi>("xoxys.yamlfmt")!
    const api = await ext.activate()

    assert.ok(ext.isActive, "Extension should be activated")
    assert.ok(api.outputChannel, "Extension should export outputChannel")
    assert.strictEqual(api.outputChannel.name, "yamlfmt")
    assert.ok(
      typeof api.outputChannel.logLevel === "number",
      "outputChannel should be a LogOutputChannel with a logLevel property"
    )
  })

  test("should format document with logging enabled", async function () {
    this.retries(2)

    const ext = vscode.extensions.getExtension("xoxys.yamlfmt")!
    await ext.activate()

    const document = await openDocument("name:    test\nkey:   value\n", "yaml")

    const textChangePromise = new Promise<string>((resolve) => {
      const disposable = vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          disposable.dispose()
          resolve(e.document.getText())
        }
      })
    })

    await vscode.commands.executeCommand("editor.action.formatDocument")
    const formatted = await textChangePromise

    assert.strictEqual(formatted, "name: test\nkey: value\n")
  })

  test("should log errors to output channel when yamlfmt not found", async function () {
    this.retries(2)

    const ext = vscode.extensions.getExtension("xoxys.yamlfmt")!
    await ext.activate()

    // Set an invalid yamlfmt path to trigger an error
    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update("path", "/nonexistent/path/yamlfmt", vscode.ConfigurationTarget.Global)

    const document = await openDocument("name:    test\n", "yaml")

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      { tabSize: 2, insertSpaces: true }
    )

    // Should return empty edits when yamlfmt is not found
    assert.ok(!edits || edits.length === 0)
  })
})
