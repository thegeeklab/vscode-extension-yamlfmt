import eslint from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended"

export default [
  {
    ignores: ["out/**", "dist/**", "node_modules/**", ".vscode-test/**"]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser
      },
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "prefer-arrow-callback": "error",
      "prefer-template": "error",
      "object-shorthand": "error",
      "no-loop-func": "error",
      "no-new-object": "error",
      "no-array-constructor": "error",
      "no-prototype-builtins": "error",
      "prefer-spread": "error",
      "prefer-rest-params": "error",
      "default-param-last": "error",
      "no-useless-constructor": "error",
      "no-duplicate-imports": "error",
      "prefer-destructuring": [
        "error",
        {
          VariableDeclarator: {
            array: true,
            object: true
          },
          AssignmentExpression: {
            array: false,
            object: false
          }
        }
      ]
    }
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      // VS Code extension standard rule adjustments
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  },
  eslintPluginPrettierRecommended,
  {
    files: ["esbuild.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  }
]
