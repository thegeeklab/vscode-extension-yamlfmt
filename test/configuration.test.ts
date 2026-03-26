import assert from "node:assert"
import * as vscode from "vscode"
import { closeAllEditors, resetConfiguration } from "./helpers.js"

suite("Configuration", () => {
  teardown(async () => {
    await closeAllEditors()
    await resetConfiguration()
  })

  test("should have default yamlfmt.path", () => {
    const config = vscode.workspace.getConfiguration("yamlfmt")
    const path = config.get<string>("path")

    assert.strictEqual(path, "yamlfmt")
  })

  test("should have default yamlfmt.args", () => {
    const config = vscode.workspace.getConfiguration("yamlfmt")
    const args = config.get<string[]>("args")

    assert.ok(Array.isArray(args))
    assert.strictEqual(args!.length, 0)
  })

  test("should allow setting custom path", async () => {
    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update("path", "/custom/path/yamlfmt", vscode.ConfigurationTarget.Global)

    const updatedConfig = vscode.workspace.getConfiguration("yamlfmt")
    assert.strictEqual(updatedConfig.get<string>("path"), "/custom/path/yamlfmt")
  })

  test("should allow setting custom args", async () => {
    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update("args", ["-conf", ".yamlfmt"], vscode.ConfigurationTarget.Global)

    const updatedConfig = vscode.workspace.getConfiguration("yamlfmt")
    assert.deepStrictEqual(updatedConfig.get<string[]>("args"), ["-conf", ".yamlfmt"])
  })

  test("should store -in flag in raw args", async () => {
    const config = vscode.workspace.getConfiguration("yamlfmt")
    await config.update("args", ["-in", "-conf", ".yamlfmt"], vscode.ConfigurationTarget.Global)

    const updatedConfig = vscode.workspace.getConfiguration("yamlfmt")
    const args = updatedConfig.get<string[]>("args")
    assert.ok(args!.includes("-in"))
  })

  test("should have resource scope for path", () => {
    const config = vscode.workspace.getConfiguration("yamlfmt")
    const inspect = config.inspect<string>("path")

    assert.ok(inspect)
    assert.strictEqual(inspect!.defaultValue, "yamlfmt")
  })

  test("should have resource scope for args", () => {
    const config = vscode.workspace.getConfiguration("yamlfmt")
    const inspect = config.inspect<string[]>("args")

    assert.ok(inspect)
    assert.deepStrictEqual(inspect!.defaultValue, [])
  })
})
