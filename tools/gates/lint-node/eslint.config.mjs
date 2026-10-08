// The post-edit hook's ESLint configuration (plan §9, research R-25). It is installed with this toolchain into
// ~/.local/share/h4reet/lint-node and passed with --config, so the hook never loads the repository's eslint.config.js
// or node_modules. Its rules match the repository's, without type information: the hook lints one file at a time.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  prettier,
]);
