// The room's build (spec 002, plan §1; research.md R-01, R-02): Vite writes apps/web/dist/, a static site the web
// image serves and spec 001's edge will serve unchanged. Every URL in it is relative ("./"), so the same files work
// at any path on the site's own origin, and nothing is loaded from another host (FR-057).
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { roomDataFile } from "./build/approvals";
import { disclosurePage } from "./build/disclosure";
import { DEFAULT_POLICY_DIR } from "./build/policy";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("."),
  base: "./",
  publicDir: false,
  build: {
    outDir: here("dist"),
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: false,
    // No inline script: the image's CSP is script-src 'self' (contracts/web-serving.md §3).
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  plugins: [
    disclosurePage({ source: here("../../docs/data-flow-disclosure.md") }),
    // main's policy: the image's named context (ROOM_POLICY_DIR), or what a checkout's prebuild read from main.
    roomDataFile({ root: here("../.."), policyDir: () => process.env.ROOM_POLICY_DIR || DEFAULT_POLICY_DIR }),
  ],
});
