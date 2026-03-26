import assert from "node:assert"
import * as vscode from "vscode"
import { closeAllEditors, openDocument } from "./helpers.js"

suite("Extension activation", () => {
  teardown(async () => {
    await closeAllEditors()
  })

  test("should be present", () => {
    const ext = vscode.extensions.getExtension("xoxys.yamlfmt")
    assert.ok(ext, "Extension should be found by its ID")
  })

  test("should activate on YAML files", async () => {
    const ext = vscode.extensions.getExtension("xoxys.yamlfmt")!
    await openDocument("key: value\n", "yaml")

    await ext.activate()

    assert.strictEqual(ext.isActive, true, "Extension should be activated for yaml")
  })

  test("should activate on dockercompose files", async () => {
    const ext = vscode.extensions.getExtension("xoxys.yamlfmt")!
    await openDocument("services:\n  web:\n    image: nginx\n", "dockercompose")

    await ext.activate()

    assert.strictEqual(ext.isActive, true, "Extension should be activated for dockercompose")
  })

  test("should register document formatting provider", async () => {
    const ext = vscode.extensions.getExtension("xoxys.yamlfmt")!
    await ext.activate()

    assert.strictEqual(ext.isActive, true)
  })

  test("should declare all activation languages", () => {
    const ext = vscode.extensions.getExtension("xoxys.yamlfmt")!
    const activationEvents = ext.packageJSON.activationEvents as string[]

    const expectedLanguages = [
      "onLanguage:yaml",
      "onLanguage:github-actions-workflow",
      "onLanguage:dockercompose",
      "onLanguage:ansible",
      "onLanguage:azure-pipelines"
    ]

    for (const lang of expectedLanguages) {
      assert.ok(activationEvents.includes(lang), `Activation events should include ${lang}`)
    }
  })
})
