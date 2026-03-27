import assert from "node:assert"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createGzip } from "node:zlib"
import * as vscode from "vscode"

const _filename = fileURLToPath(import.meta.url)
const _dirname = dirname(_filename)
const pkg = JSON.parse(readFileSync(join(_dirname, "..", "..", "package.json"), "utf-8"))

/** Extension ID derived from package.json (`publisher.name`). */
export const EXTENSION_ID: string = `${pkg.publisher}.${pkg.name}`

let _documentIndex = 0

/** Default formatting options used across tests. */
export const defaultFormattingOptions = { tabSize: 2, insertSpaces: true }

/**
 * Open a new untitled document with the given content and language,
 * then show it in an editor.
 *
 * @param content The initial content of the document.
 * @param language The language identifier (e.g., "yaml").
 * @returns A promise that resolves to the opened TextDocument.
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
 *
 * @param document The document to watch for changes.
 * @param timeout The maximum time to wait in milliseconds (default: 10000).
 * @returns A promise that resolves to the new text content.
 * @throws {Error} If the timeout is reached before a change occurs.
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
 *
 * @returns A promise that resolves when all editors are closed.
 */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors")
}

/**
 * Reset yamlfmt configuration to defaults.
 *
 * @returns A promise that resolves when the configuration is reset.
 */
export async function resetConfiguration(): Promise<void> {
  const config = vscode.workspace.getConfiguration("yamlfmt")
  await config.update("path", undefined, vscode.ConfigurationTarget.Global)
  await config.update("args", undefined, vscode.ConfigurationTarget.Global)
  await config.update("autoInstall", undefined, vscode.ConfigurationTarget.Global)
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
 * @returns A promise that resolves when the test completes.
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

/**
 * Build a minimal POSIX tar buffer containing a single regular file.
 *
 * @param name Entry name (≤ 100 bytes).
 * @param data File content as a Buffer.
 * @returns A Buffer containing the tar archive.
 */
export function buildTar(name: string, data: Buffer): Buffer {
  const header = Buffer.alloc(512, 0)

  // Name (offset 0, 100 bytes)
  header.write(name, 0, "utf8")

  // File mode (offset 100, 8 bytes) — "0000755\0"
  header.write("0000755\0", 100, "utf8")

  // UID / GID (offset 108 / 116, 8 bytes each)
  header.write("0000000\0", 108, "utf8")
  header.write("0000000\0", 116, "utf8")

  // File size in octal (offset 124, 12 bytes)
  const sizeOctal = `${data.length.toString(8).padStart(11, "0")}\0`
  header.write(sizeOctal, 124, "utf8")

  // Modification time (offset 136, 12 bytes)
  header.write("00000000000\0", 136, "utf8")

  // Type flag (offset 156): '0' = regular file
  header[156] = 0x30

  // UStar magic (offset 257)
  //cspell:words ustar
  header.write("ustar\0", 257, "utf8")
  header.write("00", 263, "utf8")

  // Compute checksum (offset 148, 8 bytes)
  // Fill checksum field with spaces first
  header.fill(0x20, 148, 156)
  let checksum = 0
  for (let i = 0; i < 512; i++) {
    checksum += header[i]
  }
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "utf8")

  // Pad data to 512-byte boundary (zero-length files produce no data blocks)
  const paddedSize = data.length > 0 ? Math.ceil(data.length / 512) * 512 : 0
  const paddedData = Buffer.alloc(paddedSize, 0)
  data.copy(paddedData)

  // Two 512-byte zero blocks mark end-of-archive
  const eof = Buffer.alloc(1024, 0)

  return Buffer.concat([header, paddedData, eof])
}

/**
 * Gzip a buffer.
 *
 * @param input The buffer to compress.
 * @returns A promise that resolves to the gzipped buffer.
 */
export function gzip(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const gz = createGzip()
    const chunks: Buffer[] = []
    gz.on("data", (c: Buffer) => chunks.push(c))
    gz.on("end", () => resolve(Buffer.concat(chunks)))
    gz.on("error", reject)
    gz.write(input)
    gz.end()
  })
}
