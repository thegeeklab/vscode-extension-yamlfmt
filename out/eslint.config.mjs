import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export default [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: ["out/**", "dist/**", "node_modules/**", ".vscode-test/**"],
    },
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            // VS Code extension standard rule adjustments
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_" },
            ],
        },
    },
];
//# sourceMappingURL=eslint.config.mjs.map