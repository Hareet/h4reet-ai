// ESLint for the repository's TypeScript and JavaScript, run by `make lint` inside the sandbox (plan §9).
// The post-edit hook never loads this file or node_modules: it uses the human-only copy in tools/gates/lint-node.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      ".specify/**",
      "tools/gates/lint-node/**",
      ".claude/**",
      // Intent 015's films: compositions the Author renders with the Author's own tools, and their vendored third-party
      // runtimes (GSAP, huashu-motion's om.js) kept as they shipped; nothing in the site or the stack loads them.
      "films/*/vendor/**",
    ],
  },
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
