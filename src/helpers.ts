import { createGunzip } from "node:zlib"
import { access, chmod, mkdir, rename, writeFile, rm } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { join } from "node:path"
import { spawn } from "node:child_process"
import * as vscode from "vscode"

const GITHUB_API_LATEST = "https://api.github.com/repos/google/yamlfmt/releases/latest"

/** Default binary name used when no explicit path is configured. */
export const DEFAULT_YAMLFMT_PATH = "yamlfmt"

/**
 * Checks if a file exists at the given path.
 *
 * @param filePath The path to check.
 * @returns A promise that resolves to `true` if the file exists, `false` otherwise.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Fetch the latest yamlfmt release tag and download URL from GitHub.
 *
 * @param platform The OS identifier (e.g., "Darwin", "Linux", "Windows").
 * @param arch The architecture identifier (e.g., "arm64", "x86_64", "i386").
 * @param outputChannel The output channel for logging.
 * @returns A promise that resolves to an object containing the version tag and the download URL for the appropriate asset.
 * @throws {Error} If the GitHub API request fails, the response is invalid, or the expected asset is not found.
 */
export async function fetchLatestRelease(
  platform: string,
  arch: string,
  outputChannel: vscode.LogOutputChannel
): Promise<{ version: string; downloadUrl: string }> {
  outputChannel.debug("  Fetching latest yamlfmt version from GitHub…")
  const response = await httpsGet(GITHUB_API_LATEST)
  if (response.statusCode !== 200) {
    const body = response.body.toString("utf8").slice(0, 200)
    throw new Error(`GitHub API returned status ${response.statusCode}\n${body}`)
  }

  let data: { tag_name?: string; assets?: { name: string; browser_download_url: string }[] }
  try {
    data = JSON.parse(response.body.toString())
  } catch (error) {
    throw new Error("Failed to parse GitHub API response", { cause: error })
  }

  if (!data.tag_name) {
    throw new Error("Invalid response from GitHub API: missing tag_name")
  }

  const version = data.tag_name
  const versionNum = version.replace(/^v/, "")
  const expectedAssetName = `yamlfmt_${versionNum}_${platform}_${arch}.tar.gz`

  const asset = data.assets?.find((a) => a.name === expectedAssetName)
  if (!asset) {
    throw new Error(`No release asset found matching ${expectedAssetName}`)
  }

  return { version, downloadUrl: asset.browser_download_url }
}

/**
 * Download and install yamlfmt into `installDir`.
 *
 * @param installDir The directory where the binary should be installed.
 * @param outputChannel The output channel for logging.
 * @returns A promise that resolves to the path of the installed binary.
 * @throws {Error} If the download, extraction, or installation fails.
 */
export async function installYamlFmt(
  installDir: string,
  outputChannel: vscode.LogOutputChannel
): Promise<string> {
  const platform = getPlatformId()
  const arch = getArchId()
  const binaryName = getBinaryName()

  const { version, downloadUrl } = await fetchLatestRelease(platform, arch, outputChannel)

  outputChannel.info(`  Downloading yamlfmt ${version} for ${platform}/${arch}…`)
  outputChannel.debug(`  URL: ${downloadUrl}`)

  const response = await httpsGet(downloadUrl)
  if (response.statusCode !== 200) {
    const body = response.body.toString("utf8").slice(0, 200)
    throw new Error(`Download failed with status ${response.statusCode}: ${downloadUrl}\n${body}`)
  }

  outputChannel.debug("  Extracting binary from archive…")
  const binaryContent = await extractFileFromTarGz(response.body, binaryName)

  try {
    await mkdir(installDir, { recursive: true })
  } catch (error) {
    throw new Error("Failed to create installation directory", { cause: error })
  }

  const destPath = join(installDir, binaryName)
  const tmpPath = `${destPath}.tmp`

  try {
    await writeFile(tmpPath, binaryContent)

    // Make executable on Unix
    if (process.platform !== "win32") {
      await chmod(tmpPath, 0o755)
    }

    // Atomic rename
    await rename(tmpPath, destPath)
  } catch (error) {
    // Attempt to clean up the temporary file
    try {
      await rm(tmpPath, { force: true })
    } catch {
      // Ignore cleanup errors
    }
    throw new Error("Failed to install yamlfmt", { cause: error })
  }

  outputChannel.info(`  yamlfmt installed to: ${destPath}`)
  return destPath
}

/**
 * Resolve the yamlfmt binary path.
 *
 * Resolution order:
 *  1. Explicitly configured `yamlfmt.path` (if it differs from the default "yamlfmt")
 *  2. Binary found in system PATH (by trying to spawn it)
 *  3. Previously auto-installed binary in extension global storage
 *  4. Auto-install (if `yamlfmt.autoInstall` is enabled)
 *
 * @param configuredPath The path configured by the user in settings.
 * @param autoInstall Whether auto-install is enabled in settings.
 * @param installDir The directory where the auto-installed binary should be located.
 * @param outputChannel The output channel for logging.
 * @returns A promise that resolves to the resolved path of the yamlfmt binary.
 * @throws {Error} If auto-install is enabled and fails.
 */
export async function resolveYamlFmtPath(
  configuredPath: string,
  autoInstall: boolean,
  installDir: string,
  outputChannel: vscode.LogOutputChannel
): Promise<string> {
  // 1. Explicit non-default path configured by the user - always wins
  if (configuredPath !== DEFAULT_YAMLFMT_PATH) {
    outputChannel.debug(`  Using configured path: ${configuredPath}`)
    return configuredPath
  }

  // 2. Check system PATH by probing the binary (user has yamlfmt installed).
  if (await checkInPath(DEFAULT_YAMLFMT_PATH)) {
    outputChannel.debug("  Using yamlfmt from system PATH")
    return DEFAULT_YAMLFMT_PATH
  }

  // 3. Previously auto-installed binary (fallback from previous auto-install)
  const installedBinary = join(installDir, getBinaryName())
  if (await fileExists(installedBinary)) {
    outputChannel.debug(`  Using previously installed binary: ${installedBinary}`)
    return installedBinary
  }

  // 4. Auto-install if enabled
  if (autoInstall) {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "yamlfmt: Installing…",
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: "Downloading yamlfmt from GitHub releases…" })
        try {
          const installedPath = await installYamlFmt(installDir, outputChannel)
          vscode.window.showInformationMessage(`yamlfmt installed successfully: ${installedPath}`)
          return installedPath
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          vscode.window.showErrorMessage(`Failed to install yamlfmt: ${message}`)
          throw error
        }
      }
    )
  }

  // Fall back to the default name and let the spawn error surface naturally
  return DEFAULT_YAMLFMT_PATH
}

/**
 * Check whether `binaryName` is available in the system PATH by attempting
 * to spawn it with `--version`.
 *
 * @param binaryName The name of the binary to check.
 * @returns A promise that resolves to `true` if the binary is found and executable, `false` otherwise.
 */
export function checkInPath(binaryName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(binaryName, ["--version"])
    let hasError = false
    proc.on("error", () => {
      hasError = true
      resolve(false)
    })
    proc.on("close", () => {
      if (!hasError) {
        // The binary was found and spawned successfully; the exit code of
        // --version is irrelevant for the purposes of this check.
        resolve(true)
      }
    })
  })
}

/**
 * Maps the current Node.js platform to the corresponding OS identifier used in yamlfmt release assets.
 *
 * @returns The OS identifier string (e.g., "Darwin", "Linux", "Windows").
 * @throws {Error} If the current platform is not supported.
 */
export function getPlatformId(): string {
  switch (process.platform) {
    case "darwin":
      return "Darwin"
    case "linux":
      return "Linux"
    case "win32":
      return "Windows"
    default:
      throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

/**
 * Maps the current Node.js architecture to the corresponding architecture identifier used in yamlfmt release assets.
 *
 * @returns The architecture identifier string (e.g., "arm64", "x86_64", "i386").
 * @throws {Error} If the current architecture is not supported.
 */
export function getArchId(): string {
  switch (process.arch) {
    case "arm64":
      return "arm64"
    case "x64":
      return "x86_64"
    case "ia32":
      return "i386"
    default:
      throw new Error(`Unsupported architecture: ${process.arch}`)
  }
}

/**
 * Returns the expected binary name for the current platform.
 *
 * @returns "yamlfmt.exe" on Windows, "yamlfmt" on other platforms.
 */
export function getBinaryName(): string {
  return process.platform === "win32" ? "yamlfmt.exe" : "yamlfmt"
}

/**
 * Performs an HTTP GET request using the global `fetch` API.
 *
 * Using the global `fetch` (provided by Node 22+ / VS Code 1.83+) ensures
 * that VS Code's proxy settings (`http.proxy`, `http.proxyStrictSSL`) are
 * respected automatically. Redirects are followed by default.
 *
 * @param url The URL to fetch.
 * @returns A promise that resolves to an object containing the status code and response body as a Buffer.
 */
export async function httpsGet(url: string): Promise<{
  statusCode: number
  body: Buffer
}> {
  const response = await fetch(url, {
    headers: { "User-Agent": "vscode-yamlfmt-extension" },
    signal: AbortSignal.timeout(60000),
    redirect: "follow"
  })

  const arrayBuffer = await response.arrayBuffer()
  return {
    statusCode: response.status,
    body: Buffer.from(arrayBuffer)
  }
}

/**
 * Extracts a single file from a .tar.gz buffer.
 *
 * @param tarGzBuffer The gzipped tar archive buffer.
 * @param targetName The name of the file to extract. The function returns the content of the first entry whose name ends with this string.
 * @returns A promise that resolves to the extracted file content as a Buffer.
 * @throws {Error} If the target file is not found in the archive.
 */
export function extractFileFromTarGz(tarGzBuffer: Buffer, targetName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip()
    const chunks: Buffer[] = []

    gunzip.on("data", (chunk: Buffer) => chunks.push(chunk))
    gunzip.on("error", reject)
    gunzip.on("end", () => {
      const tarBuffer = Buffer.concat(chunks)
      const result = parseTar(tarBuffer, targetName)
      if (result) {
        resolve(result)
      } else {
        reject(new Error(`File '${targetName}' not found in archive`))
      }
    })

    gunzip.write(tarGzBuffer)
    gunzip.end()
  })
}

/**
 * A minimal POSIX tar parser that reads 512-byte blocks.
 *
 * @param buffer The uncompressed tar archive buffer.
 * @param targetName The name of the file to extract.
 * @returns The content of the first entry whose name ends with `targetName`, or `null` if not found.
 */
export function parseTar(buffer: Buffer, targetName: string): Buffer | null {
  let offset = 0

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)

    // End-of-archive: two consecutive zero blocks
    if (header.every((b) => b === 0)) {
      break
    }

    const name = header.subarray(0, 100).toString("utf8").replace(/\0/g, "")
    const sizeOctal = header.subarray(124, 136).toString("utf8").replace(/\0/g, "").trim()
    const size = parseInt(sizeOctal, 8)
    if (isNaN(size)) {
      break
    }
    const [typeFlag] = header.subarray(156, 157)

    offset += 512 // move past header

    // typeFlag 0 or 0x30 = regular file, 0x35 = directory
    if ((typeFlag === 0 || typeFlag === 0x30) && name.endsWith(targetName)) {
      return buffer.subarray(offset, offset + size)
    }

    // Skip file content (rounded up to 512-byte boundary)
    offset += Math.ceil(size / 512) * 512
  }

  return null
}

/**
 * Gets the version of an installed yamlfmt binary by running `--version`.
 *
 * @param yamlfmtPath The path to the yamlfmt binary.
 * @param outputChannel The output channel for logging.
 * @returns A promise that resolves to the version string (e.g., "v0.12.1") or `null` if the version could not be determined.
 */
export async function getInstalledVersion(
  yamlfmtPath: string,
  outputChannel: vscode.LogOutputChannel
): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(yamlfmtPath, ["--version"])
    let stdout = ""
    let stderr = ""
    let settled = false

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on("error", () => {
      if (settled) return
      settled = true
      outputChannel.debug(
        `  Could not determine installed version: ${stderr || "binary not found"}`
      )
      resolve(null)
    })

    proc.on("close", () => {
      if (settled) return
      settled = true
      // Try to parse version from output (format: "yamlfmt version 0.12.1" or similar)
      const versionMatch =
        stdout.match(/version\s+(v?[\d.]+)/) || stderr.match(/version\s+(v?[\d.]+)/)
      if (versionMatch) {
        const version = versionMatch[1].startsWith("v") ? versionMatch[1] : `v${versionMatch[1]}`
        outputChannel.debug(`  Installed version: ${version}`)
        resolve(version)
      } else {
        outputChannel.debug(`  Could not parse version from output: ${stdout || stderr}`)
        resolve(null)
      }
    })
  })
}

/**
 * Compares two version strings.
 *
 * @param a First version (e.g., "v0.12.0").
 * @param b Second version (e.g., "v0.12.1").
 * @returns A negative number if a < b, positive if a > b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number)
  const partsA = parse(a)
  const partsB = parse(b)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0
    const numB = partsB[i] ?? 0
    if (numA !== numB) {
      return numA - numB
    }
  }
  return 0
}

/**
 * Checks if an update is available for the installed yamlfmt binary.
 *
 * @param yamlfmtPath The path to the installed yamlfmt binary.
 * @param outputChannel The output channel for logging.
 * @returns A promise that resolves to an object containing the current and latest versions, or `null` if no update check was performed.
 */
export async function checkForUpdates(
  yamlfmtPath: string,
  outputChannel: vscode.LogOutputChannel
): Promise<{ currentVersion: string; latestVersion: string; updateAvailable: boolean } | null> {
  // Get installed version
  const currentVersion = await getInstalledVersion(yamlfmtPath, outputChannel)
  if (!currentVersion) {
    outputChannel.debug("  Could not determine installed version, skipping update check")
    return null
  }

  // Get latest version from GitHub
  let latestVersion: string
  try {
    const platform = getPlatformId()
    const arch = getArchId()
    latestVersion = (await fetchLatestRelease(platform, arch, outputChannel)).version
  } catch (error) {
    outputChannel.debug(`  Could not fetch latest version: ${error}`)
    return null
  }

  const updateAvailable = compareVersions(currentVersion, latestVersion) < 0

  outputChannel.info(
    `  Update check: current=${currentVersion}, latest=${latestVersion}, updateAvailable=${updateAvailable}`
  )

  return { currentVersion, latestVersion, updateAvailable }
}

/**
 * Prompts the user that an update is available with options to update or dismiss.
 *
 * @param currentVersion The currently installed version.
 * @param latestVersion The latest available version.
 * @param installDir The directory where the binary is installed.
 * @param outputChannel The output channel for logging.
 * @returns A promise that resolves to `true` if the user chose to update, `false` otherwise.
 */
export async function promptForUpdate(
  currentVersion: string,
  latestVersion: string,
  installDir: string,
  outputChannel: vscode.LogOutputChannel
): Promise<boolean> {
  const response = await vscode.window.showInformationMessage(
    `A new yamlfmt version is available: ${latestVersion} (currently installed: ${currentVersion})`,
    { modal: false },
    "Update Now",
    "Dismiss"
  )

  if (response === "Update Now") {
    outputChannel.info("  User chose to update yamlfmt")
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "yamlfmt: Updating…",
          cancellable: false
        },
        async (progress) => {
          progress.report({ message: "Downloading yamlfmt from GitHub releases…" })
          await installYamlFmt(installDir, outputChannel)
        }
      )
      vscode.window.showInformationMessage(`yamlfmt updated successfully to ${latestVersion}`)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      vscode.window.showErrorMessage(`Failed to update yamlfmt: ${message}`)
      return false
    }
  }

  outputChannel.debug("  User dismissed update notification")
  return false
}
