import * as vscode from "vscode"
import { spawn } from "node:child_process"
import { dirname } from "node:path"

const yamlformattedLanguages = [
  "yaml",
  "github-actions-workflow",
  "dockercompose",
  "ansible",
  "azure-pipelines"
]

class YamlFmtProvider
  implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider
{
  async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.TextEdit[]> {
    return this.provideFormattingEdits(document, undefined, token)
  }

  async provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    _options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.TextEdit[]> {
    return this.provideFormattingEdits(document, range, token)
  }

  private async provideFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range | undefined,
    token: vscode.CancellationToken
  ): Promise<vscode.TextEdit[]> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    const config = vscode.workspace.getConfiguration("", document.uri)

    const yamlfmtPath = config.get<string>("yamlfmt.path", "yamlfmt")

    const args = config.get<string[]>("yamlfmt.args", []).filter((arg) => arg !== "-in")
    args.push("-in")

    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : dirname(document.uri.fsPath)

    // Get text for the full document or just the range
    const text = range ? document.getText(range) : document.getText()

    try {
      const formattedText = await this.runYamlFmt(yamlfmtPath, args, cwd, text, token)

      if (!formattedText) {
        return []
      }

      // Determine the range to replace
      const editRange =
        range ?? new vscode.Range(document.positionAt(0), document.positionAt(text.length))

      return [vscode.TextEdit.replace(editRange, formattedText)]
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message !== "Formatting cancelled") {
        vscode.window.showErrorMessage(`yamlfmt: ${message}`)
      }
      return []
    }
  }

  private async runYamlFmt(
    yamlfmtPath: string,
    args: string[],
    cwd: string,
    input: string,
    token: vscode.CancellationToken
  ): Promise<string> {
    // Create a promise that can be rejected by cancellation
    const processPromise = new Promise<string>((resolve, reject) => {
      const proc = spawn(yamlfmtPath, args, { cwd })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []

      // Suppress EPIPE errors when the process exits before stdin is fully written
      proc.stdin.on("error", () => {
        // Intentionally empty - EPIPE errors are expected and harmless
      })

      proc.stdout.on("data", (data: Buffer) => stdoutChunks.push(data))
      proc.stderr.on("data", (data: Buffer) => stderrChunks.push(data))

      proc.on("error", (err) => {
        // Handle common errors gracefully (e.g., yamlfmt not installed)
        const nodeErr = err as NodeJS.ErrnoException
        if (nodeErr.code === "ENOENT") {
          reject(
            new Error(
              `yamlfmt executable not found at '${yamlfmtPath}'. Please ensure it is installed and in your PATH, or configure 'yamlfmt.path'.`
            )
          )
        } else {
          reject(err)
        }
      })

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              Buffer.concat(stderrChunks).toString().trim() || `Process exited with code ${code}`
            )
          )
        } else {
          resolve(Buffer.concat(stdoutChunks).toString())
        }
      })

      // Write the document text to stdin once the process has spawned
      proc.on("spawn", () => {
        proc.stdin.write(input)
        proc.stdin.end()
      })

      // Gracefully handle the user cancelling the format (e.g., closing the file before it finishes)
      token.onCancellationRequested(() => {
        proc.kill()
        reject(new Error("Formatting cancelled"))
      })
    })

    return processPromise
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new YamlFmtProvider()

  for (const lang of yamlformattedLanguages) {
    // Register both document and range formatting providers
    const disposable = vscode.languages.registerDocumentFormattingEditProvider(lang, provider)
    const rangeDisposable = vscode.languages.registerDocumentRangeFormattingEditProvider(
      lang,
      provider
    )
    context.subscriptions.push(disposable, rangeDisposable)
  }
}

export function deactivate() {}
