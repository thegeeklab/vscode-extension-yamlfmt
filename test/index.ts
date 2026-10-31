import Mocha from "mocha"
import { glob } from "node:fs/promises"
import { resolve as resolvePath } from "node:path"
import { pathToFileURL } from "node:url"

// @ts-expect-error internal mocha ESM utils
import mochaEsmUtils from "mocha/lib/nodejs/esm-utils.cjs"

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

  for await (const file of glob("**/**.test.js", { cwd: testsRoot })) {
    mocha.addFile(resolvePath(testsRoot, file))
  }

  await mocha.loadFilesAsync()

  const { promise, resolve, reject } = Promise.withResolvers<void>()

  mocha.run((failures) => {
    if (failures > 0) {
      reject(new Error(`${failures} tests failed.`))
    } else {
      resolve()
    }
  })

  return promise
}
