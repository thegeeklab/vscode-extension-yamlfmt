import * as vscode from "vscode"
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import {
  DEFAULT_YAMLFMT_PATH,
  checkForUpdates,
  fileExists,
  getBinaryName,
  promptForUpdate,
  resolveYamlFmtPath
} from "./helpers.js"

const yamlformattedLanguages = [
  "yaml",
  "github-actions-workflow",
  "dockercompose",
  "ansible",
  "azure-pipelines"
]

export let outputChannel: vscode.LogOutputChannel

class YamlFmtProvider
  implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider
{
  constructor(private readonly installDir: string) {}

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

    const configuredPath = config.get<string>("yamlfmt.path", DEFAULT_YAMLFMT_PATH)
    const autoInstall = config.get<boolean>("yamlfmt.autoInstall", false)

    const args = config.get<string[]>("yamlfmt.args", []).filter((arg) => arg !== "-in")
    args.push("-in")

    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : dirname(document.uri.fsPath)

    outputChannel.info(`Formatting document: ${document.uri.fsPath}`)
    outputChannel.debug(`  configured path: ${configuredPath}`)
    outputChannel.debug(`  auto-install: ${autoInstall}`)
    outputChannel.debug(`  arguments: ${args.join(" ")}`)
    outputChannel.debug(`  working directory: ${cwd}`)

    let yamlfmtPath: string
    try {
      yamlfmtPath = await resolveYamlFmtPath(
        configuredPath,
        autoInstall,
        this.installDir,
        outputChannel
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      outputChannel.error(`  Failed to resolve yamlfmt: ${message}`)
      vscode.window.showErrorMessage(`yamlfmt: ${message}`)
      return []
    }

    outputChannel.debug(`  resolved yamlfmt path: ${yamlfmtPath}`)

    // Get text for the full document or just the range
    const text = range ? document.getText(range) : document.getText()

    try {
      const formattedText = await this.runYamlFmt(
        yamlfmtPath,
        args,
        cwd,
        text,
        token,
        document.uri.fsPath
      )

      if (!formattedText) {
        outputChannel.info("  No formatting changes needed")
        return []
      }

      // Determine the range to replace
      const editRange =
        range ?? new vscode.Range(document.positionAt(0), document.positionAt(text.length))

      outputChannel.info("  Formatting completed successfully")
      return [vscode.TextEdit.replace(editRange, formattedText)]
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      outputChannel.error(`  Error: ${message}`)
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
    token: vscode.CancellationToken,
    _filePath: string
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
              `yamlfmt executable not found at '${yamlfmtPath}'. Please ensure it is installed and in your PATH, configure 'yamlfmt.path', or enable 'yamlfmt.autoInstall'.`
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

export interface ExtensionApi {
  outputChannel: vscode.LogOutputChannel
  installDir: string
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  outputChannel = vscode.window.createOutputChannel("yamlfmt", { log: true })
  context.subscriptions.push(outputChannel)

  outputChannel.info("yamlfmt extension activated")
  outputChannel.info(`Supported languages: ${yamlformattedLanguages.join(", ")}`)

  const installDir = join(context.globalStorageUri.fsPath, "bin")
  outputChannel.debug(`  install directory: ${installDir}`)

  const provider = new YamlFmtProvider(installDir)

  for (const lang of yamlformattedLanguages) {
    // Register both document and range formatting providers
    const disposable = vscode.languages.registerDocumentFormattingEditProvider(lang, provider)
    const rangeDisposable = vscode.languages.registerDocumentRangeFormattingEditProvider(
      lang,
      provider
    )
    context.subscriptions.push(disposable, rangeDisposable)
  }

  // Check for updates if auto-install is enabled and we have an installed binary
  const config = vscode.workspace.getConfiguration("yamlfmt")
  const autoInstall = config.get<boolean>("autoInstall", false)

  if (autoInstall) {
    const installedBinary = join(installDir, getBinaryName())

    // Schedule update check after activation (non-blocking)
    setTimeout(async () => {
      if (await fileExists(installedBinary)) {
        outputChannel.debug("  Checking for yamlfmt updates…")
        const updateInfo = await checkForUpdates(installedBinary, outputChannel)

        if (updateInfo?.updateAvailable) {
          outputChannel.info(`  Update available: ${updateInfo.latestVersion}`)
          await promptForUpdate(
            updateInfo.currentVersion,
            updateInfo.latestVersion,
            installDir,
            outputChannel
          )
        }
      }
    }, 2000) // Delay to not block extension activation
  }

  return { outputChannel, installDir }
}

export function deactivate() {}
