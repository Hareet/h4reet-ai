// The lookdev page's phone copy (spec 004; FR-066, FR-069, Q1's option A; research.md R-42, R-43; contracts/lookdev.md
// §7.1, §8 layer 5): `npm run build:lookdev-phone -w apps/web` is Vite's build with this file, which refuses to run
// unless ROOM_DRAFTS=1 and writes the gitignored apps/web/dist-phone/lookdev.html, outside dist/, which is all the web
// image's runtime stage copies. Vite's library mode, in IIFE format, as one chunk, from the copy's entry,
// src/lookdev/phone.ts: Chromium refuses module scripts and fetch from a local file, so everything the entry reaches,
// the room's bundle as roomBundle() composes it with drafts among it, is one classic script, its dynamic imports
// inlined, and library mode inlines every asset, the typefaces among them, as data: URLs. build/single-file.ts then
// writes the script and the CSS into the one file under a policy that admits only them and allows no request. Two
// builds of one tree under one policy write the same bytes; the Author's copy is the Dockerfile's lookdev-phone target,
// built from a commit's git archive export (§7.1, §7.3).
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import type { UserConfig } from "vite";

import { draftsOn } from "./build/approvals";
import { roomBundle } from "./build/room/plugin";
import { PHONE_REFUSAL, singleFile } from "./build/single-file";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig((): UserConfig => {
  // Before anything is read or written: the copy is a drafts build, never a release one (FR-066).
  if (!draftsOn(process.env)) throw new Error(PHONE_REFUSAL);
  return {
    root: here("."),
    base: "./",
    publicDir: false,
    // Library mode leaves process.env.NODE_ENV for a library's user to set, where the site's build replaces it; the
    // copy runs the site's code, so it gets the site's value.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: here("dist-phone"),
      emptyOutDir: true,
      sourcemap: false,
      reportCompressedSize: false,
      lib: {
        entry: here("src/lookdev/phone.ts"),
        name: "h4LookdevPhone",
        formats: ["iife"],
        fileName: () => "lookdev.js",
        cssFileName: "lookdev",
      },
      // One chunk: every dynamic import inlined, as IIFE needs and single-file.ts holds the build to.
      rolldownOptions: { output: { codeSplitting: false } },
    },
    plugins: [
      roomBundle({ root: here("../.."), messages: here("content/messages.yaml") }),
      // The root is src/lookdev/phone.ts's PHONE_ROOT, which the copy starts in.
      singleFile({ title: "Lookdev, the phone's copy", root: "lookdev-phone" }),
    ],
  };
});
