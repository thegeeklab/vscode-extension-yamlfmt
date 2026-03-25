import Mocha from "mocha";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

// @ts-expect-error - Mocha internal override for ESM support
import mochaEsmUtils from "mocha/lib/nodejs/esm-utils.js";

// Hack to force Mocha to use dynamic imports in strict ESM environments
// https://github.com/mochajs/mocha/issues/5599#issuecomment-3982072912
mochaEsmUtils.requireOrImport = async (file: string) => {
  const { default: def, ...rest } = (await mochaEsmUtils.doImport(
    pathToFileURL(file),
  )) as Record<string, unknown>;
  return def ?? rest;
};

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 1000 * 60 * 10,
  });

  const testsRoot = import.meta.dirname;

  // Add tests in this particular order so the workspace is opened first
  // and then the files, preventing extra window reloads mid-test.
  mocha.addFile(path.resolve(testsRoot, "workspace.test.js"));
  mocha.addFile(path.resolve(testsRoot, "files.test.js"));

  await mocha.loadFilesAsync();

  return new Promise((resolve, reject) => {
    try {
      mocha.run(failures => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
