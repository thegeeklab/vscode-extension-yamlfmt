import assert from "node:assert"
import * as vscode from "vscode"
import { closeAllEditors, defaultFormattingOptions, openDocument, waitForText } from "./helpers.js"

suite("Document formatting", () => {
  teardown(async () => {
    await closeAllEditors()
  })

  test("should format extra spaces", async function () {
    this.retries(2)

    const document = await openDocument("name:    test\nkey:   value\n", "yaml")

    const textChangePromise = waitForText(document)
    await vscode.commands.executeCommand("editor.action.formatDocument")
    const formatted = await textChangePromise

    assert.strictEqual(formatted, "name: test\nkey: value\n")
  })

  test("should normalize inconsistent indentation", async function () {
    this.retries(2)

    const document = await openDocument("items:\n    - one\n    - two\n", "yaml")

    const textChangePromise = waitForText(document)
    await vscode.commands.executeCommand("editor.action.formatDocument")
    const formatted = await textChangePromise

    assert.strictEqual(formatted, "items:\n  - one\n  - two\n")
  })

  test("should not modify already formatted YAML", async function () {
    this.retries(2)

    const input = "name: test\nkey: value\n"
    const document = await openDocument(input, "yaml")

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      defaultFormattingOptions
    )

    if (edits && edits.length > 0) {
      const edit = new vscode.WorkspaceEdit()
      for (const textEdit of edits) {
        edit.replace(document.uri, textEdit.range, textEdit.newText)
      }
      await vscode.workspace.applyEdit(edit)
    }

    assert.strictEqual(document.getText(), input)
  })

  test("should handle empty document", async function () {
    this.retries(2)

    const document = await openDocument("", "yaml")

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      defaultFormattingOptions
    )

    if (edits && edits.length > 0) {
      const edit = new vscode.WorkspaceEdit()
      for (const textEdit of edits) {
        edit.replace(document.uri, textEdit.range, textEdit.newText)
      }
      await vscode.workspace.applyEdit(edit)
    }

    assert.ok(document.getText().trim().length === 0)
  })

  test("should format complex nested structures", async function () {
    this.retries(2)

    const input = [
      "services:",
      "    web:",
      "        image:   nginx",
      "        ports:",
      "            -  80:80",
      ""
    ].join("\n")
    const document = await openDocument(input, "yaml")

    const textChangePromise = waitForText(document)
    await vscode.commands.executeCommand("editor.action.formatDocument")
    const formatted = await textChangePromise

    assert.ok(formatted.includes("services:"))
    assert.ok(formatted.includes("image: nginx"))
    assert.ok(!formatted.includes("    web:"))
  })

  test("should handle multiple documents", async function () {
    this.retries(2)

    const document = await openDocument("---\nname: doc1\n---\nname: doc2\n", "yaml")

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      defaultFormattingOptions
    )

    if (edits && edits.length > 0) {
      const edit = new vscode.WorkspaceEdit()
      for (const textEdit of edits) {
        edit.replace(document.uri, textEdit.range, textEdit.newText)
      }
      await vscode.workspace.applyEdit(edit)
    }

    const result = document.getText()
    assert.ok(result.includes("name: doc1"))
    assert.ok(result.includes("name: doc2"))
  })

  test("should handle large documents without timeout", async function () {
    this.timeout(15000)
    this.retries(2)

    const lines = ["items:"]
    for (let i = 0; i < 500; i++) {
      lines.push(`    -  key${i}:   value${i}`)
    }
    lines.push("")

    const document = await openDocument(lines.join("\n"), "yaml")

    const textChangePromise = waitForText(document, 15000)
    await vscode.commands.executeCommand("editor.action.formatDocument")
    const formatted = await textChangePromise

    assert.ok(formatted.includes("- key0: value0"))
    assert.ok(formatted.includes("- key499: value499"))
    assert.ok(!formatted.includes("    -"))
  })

  test("should preserve comments", async function () {
    this.retries(2)

    const document = await openDocument(
      "# Top comment\nname:    test\n# Inline comment\nkey:   value\n",
      "yaml"
    )

    const textChangePromise = waitForText(document)
    await vscode.commands.executeCommand("editor.action.formatDocument")
    const formatted = await textChangePromise

    assert.ok(formatted.includes("# Top comment"))
    assert.ok(formatted.includes("name: test"))
  })
})

suite("Range formatting", () => {
  teardown(async () => {
    await closeAllEditors()
  })

  test("should format a selected range", async function () {
    this.retries(2)

    const document = await openDocument("name:    test\nkey:   value\n", "yaml")
    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 14))

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatRangeProvider",
      document.uri,
      range,
      defaultFormattingOptions
    )

    assert.ok(edits !== undefined)
  })
})
