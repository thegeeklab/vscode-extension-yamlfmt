import { Glob } from "glob"
import Mocha from "mocha"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

// @ts-expect-error internal mocha ESM utils
import mochaEsmUtils from "mocha/lib/nodejs/esm-utils.js"

// Suppress SIGPIPE errors that can crash the renderer process in CI environments.
// This happens when spawning processes that fail immediately (e.g., missing binary).
process.on("SIGPIPE", () => {})

// https://github.com/mochajs/mocha/issues/5599#issuecomment-3982072912
mochaEsmUtils.requireOrImport = async (file: string) => {
  const result = (await mochaEsmUtils.doImport(pathToFileURL(file))) as Record<string, unknown>
  const { default: def, ...rest } = result
  return def ?? rest
}

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 30000
  })

  const testsRoot = import.meta.dirname

  for await (const file of new Glob("**/**.test.js", { cwd: testsRoot })) {
    mocha.addFile(resolve(testsRoot, file))
  }

  await mocha.loadFilesAsync()

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`))
      } else {
        resolve()
      }
    })
  })
}
