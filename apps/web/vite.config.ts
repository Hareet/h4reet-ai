// The room's build (spec 002, plan §1; research.md R-01, R-02): Vite writes apps/web/dist/, a static site the web
// image serves and spec 001's edge will serve unchanged. Every URL in it is relative ("./"), so the same files work
// at any path on the site's own origin, and nothing is loaded from another host (FR-057).
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { draftsOn, roomDataFile } from "./build/approvals";
import { resumePart } from "./build/content";
import { creditsPage, likenessLines } from "./build/credits";
import { degradedAnswer } from "./build/degraded";
import { disclosurePage } from "./build/disclosure";
import { resumeDownloadName } from "./build/download-name";
import { narrationPart } from "./build/narration";
import { DEFAULT_POLICY_DIR } from "./build/policy";
import { roomBundle } from "./build/room/plugin";
import { roomTextPart } from "./build/room/text";
import { statusPage } from "./build/status";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// The room's bundle, composed from apps/web/room/ under main's policy (spec 004, T096; its contracts/room-bundle.md §3,
// §12): spec 002's fixed messages and the manifest, now Amendment B7's, with the index, in the entry; the 3D part in the
// lazy 3D chunk; dist/room-manifest.json; and each set model's gzip copy under dist/a/. Named, since spec 028, so the
// Credits page reads the likeness lines it carries.
const room = roomBundle({ root: here("../.."), messages: here("content/messages.yaml") });

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
    // The 3D chunk is Three.js, about 580 KB (150 KB compressed), loaded behind the choice screen (spec 002, T041).
    chunkSizeWarningLimit: 640,
    // The lookdev page is an input of a drafts build only (spec 004, T131; its contracts/lookdev.md §8, layer 1), so a
    // release build has no lookdev/ at all. The room's page keeps the input name "index" in both.
    ...(draftsOn(process.env)
      ? { rolldownOptions: { input: { index: here("index.html"), lookdev: here("lookdev/index.html") } } }
      : {}),
  },
  plugins: [
    disclosurePage({ source: here("../../docs/data-flow-disclosure.md") }),
    // Spec 001 (contracts/edge.md §4): the edge's own degraded answer, /_degraded/api.json, when it can't reach the relay.
    degradedAnswer(),
    // Spec 016 (FR-042, FR-043): the credits page from assets/CREDITS.md, which the toolbar's Credits link opens.
    // Spec 028 (FR-013): with the AI-made figures' lines the room's bundle carries, from main's approvals.
    creditsPage({ source: here("../../assets/CREDITS.md"), likeness: () => likenessLines(room.api.composed()) }),
    // Spec 001 (contracts/public-view.md §3; T138): /status/, the public view, its script an entry of its own.
    statusPage({ entry: here("status/main.ts") }),
    // main's policy: the image's named context (ROOM_POLICY_DIR), or what a checkout's prebuild read from main.
    // The resume's part (build/content.ts): the citation check, its items when main approves them, and resume.pdf.
    // Narration's (build/narration.ts): N1–N5, and each published item's scripts, per path, when they're published.
    // The room's text (build/room/text.ts, spec 004): room_text, the room-text files main approves, and in a drafts
    // build the drafts too, which the room fetches with the rest at Enter.
    roomDataFile({
      root: here("../.."),
      policyDir: () => process.env.ROOM_POLICY_DIR || DEFAULT_POLICY_DIR,
      parts: [resumePart, narrationPart, roomTextPart],
    }),
    // The PDF's download name, from main's resume-header.json in the same policy directory (build/download-name.ts;
    // spec 002's amendment of 2026-11-09): defined for the scripts, and written into index.html's plain link.
    resumeDownloadName({ policyDir: () => process.env.ROOM_POLICY_DIR || DEFAULT_POLICY_DIR }),
    // The room's bundle (above).
    room,
  ],
});
