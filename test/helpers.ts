import assert from "node:assert"
import { join } from "node:path"
import * as vscode from "vscode"

let _documentIndex = 0

/** Default formatting options used across tests. */
export const defaultFormattingOptions = { tabSize: 2, insertSpaces: true }

/**
 * Open a new untitled document with the given content and language,
 * then show it in an editor.
 */
export async function openDocument(
  content: string,
  language: string
): Promise<vscode.TextDocument> {
  const uri = vscode.Uri.parse(`untitled:/document-${++_documentIndex}`)

  let document = await vscode.workspace.openTextDocument(uri)
  document = await vscode.languages.setTextDocumentLanguage(document, language)
  const editor = await vscode.window.showTextDocument(document)
  await editor.edit((editBuilder) => {
    editBuilder.setEndOfLine(vscode.EndOfLine.LF)
    if (content.length > 0) {
      editBuilder.insert(new vscode.Position(0, 0), content)
    }
  })

  return editor.document
}

/**
 * Wait for a document's text to change.
 *
 * Uses `vscode.workspace.onDidChangeTextDocument` for event-based waiting.
 * Register this BEFORE triggering the action that changes the text to avoid
 * missing the event.
 */
export function waitForText(document: vscode.TextDocument, timeout = 10000): Promise<string> {
  const event = new Promise<string>((resolve) => {
    const disposable = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) {
        return
      }
      disposable.dispose()
      resolve(e.document.getText())
    })
  })

  const timer = new Promise<never>((_resolve, reject) =>
    setTimeout(
      () => reject(new Error(`Timed out after ${timeout}ms waiting for text change`)),
      timeout
    )
  )

  return Promise.race([event, timer])
}

/**
 * Close all open editors. Call this in `teardown()` to ensure a clean
 * state between tests.
 */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors")
}

/**
 * Reset yamlfmt configuration to defaults.
 */
export async function resetConfiguration(): Promise<void> {
  const config = vscode.workspace.getConfiguration("yamlfmt")
  await config.update("path", undefined, vscode.ConfigurationTarget.Global)
  await config.update("args", undefined, vscode.ConfigurationTarget.Global)
}

/**
 * Run a data-driven test against a case directory. The directory should
 * contain at least two files: `input.yaml` and `result.yaml`.
 *
 * A temporary `test.yaml` file is created from `input.yaml`, formatted
 * via the extension, and compared against `result.yaml`.
 *
 * If a `.vscode/settings.json` exists in the directory, any `yamlfmt.args`
 * setting is applied before formatting.
 *
 * @param dirPath absolute path to test case directory
 */
export async function caseDirTest(dirPath: string): Promise<void> {
  const { readFileSync } = await import("node:fs")

  const inputUri = vscode.Uri.file(join(dirPath, "input.yaml"))
  const resultUri = vscode.Uri.file(join(dirPath, "result.yaml"))

  const give = (await vscode.workspace.openTextDocument(inputUri)).getText()
  const want = (await vscode.workspace.openTextDocument(resultUri)).getText()

  // Apply .vscode/settings.json if present
  const settingsPath = join(dirPath, ".vscode", "settings.json")
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"))
    if (settings["yamlfmt.args"]) {
      const config = vscode.workspace.getConfiguration("yamlfmt")
      await config.update("args", settings["yamlfmt.args"], vscode.ConfigurationTarget.Global)
    }
  } catch {
    // No settings file
  }

  // Create the temporary test file
  const testDocUri = vscode.Uri.file(join(dirPath, "test.yaml"))
  const edit = new vscode.WorkspaceEdit()
  edit.createFile(testDocUri, {
    ignoreIfExists: true,
    overwrite: true,
    contents: new TextEncoder().encode(give)
  })
  await vscode.workspace.applyEdit(edit)

  // Open, format, and save
  const doc = await vscode.workspace.openTextDocument(testDocUri)
  await doc.save()
  await vscode.window.showTextDocument(doc)
  await vscode.commands.executeCommand("editor.action.formatDocument")
  await doc.save()

  assert.deepStrictEqual(doc.getText(), want)
}
