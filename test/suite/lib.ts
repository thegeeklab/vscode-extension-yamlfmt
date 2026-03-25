import * as path from "node:path"
import * as vscode from "vscode"
import * as assert from "node:assert"
import * as util from "node:util"

export const sleep = util.promisify(setTimeout)

/**
 * Run tests against a case dir.
 * @param dirPath absolute path to test case directory
 */
export async function caseDirTest(dirPath: string) {
  process.env.XDG_CONFIG_HOME = path.join(dirPath, "xdg-config-home")

  const inputUri = vscode.Uri.file(path.join(dirPath, "input.yaml"))
  const resultUri = vscode.Uri.file(path.join(dirPath, "result.yaml"))

  const give = (await vscode.workspace.openTextDocument(inputUri)).getText()
  const want = (await vscode.workspace.openTextDocument(resultUri)).getText()

  // construct the uri for the temporary test document
  const testDocUri = vscode.Uri.file(path.join(dirPath, "test.yaml"))

  // create the test file and add the give contents to it
  const edit = new vscode.WorkspaceEdit()
  edit.createFile(testDocUri, {
    ignoreIfExists: true,
    overwrite: true,
    contents: new TextEncoder().encode(give)
  })
  await vscode.workspace.applyEdit(edit)

  // get the document and save the edits
  const doc = await vscode.workspace.openTextDocument(testDocUri)
  await doc.save()

  // open the document, format it and save it
  await vscode.window.showTextDocument(doc)
  await vscode.commands.executeCommand("editor.action.formatDocument")
  await doc.save()

  // check if give == wants
  assert.deepEqual(doc.getText(), want)
}
