// The lookdev page's phone copy as one file (spec 004; FR-066, FR-069, Q1's option A; research.md R-42, R-43;
// contracts/lookdev.md §7.1, §8 layer 5): the Vite plugin that ends vite.phone.config.ts's library build with one file,
// lookdev.html, in place of everything else the build would write. Chromium refuses module scripts and fetch from a
// local file, so the build's one IIFE chunk goes in one classic inline <script> and its CSS in one <style>, and the
// head, before either, holds a meta policy that admits those two elements by their SHA-256, fonts and images only from
// data: URLs, and no request of any kind: `connect-src 'none'` refuses every fetch, beacon, and socket, so the copy has
// no network even on a phone that has one.
// - The script's text is the chunk's code with "<!--", "<script", and "</script", in any case, written "\x3C!--",
//   "\x3Cscript", and "\x3C/script", as the HTML standard advises, so nothing in it ends the element or re-enters it.
//   The escape means the same `<` in a string, a template, a regular expression, or a comment, where an IIFE holds such
//   text. The style's text is the CSS, refused if it holds "</style".
// - Each hash is a browser's for its element: base64 of the SHA-256 of the element's text as UTF-8. A browser hashes
//   what its HTML parser made of the text, so a text the parser would change (a carriage return, which it makes a line
//   feed; a NUL; a lone surrogate, which UTF-8 can't hold) is refused rather than hashed as written.
// - Everything else the build wrote is dropped: the room's own files beside the bundle (room-manifest.json, the set
//   models' gzip copies and cards) are the site's, not the copy's, which holds no model; every model reaches the copy
//   through the page's pickers. A build of more than one chunk or one stylesheet is refused, since the copy has no way
//   to load a second.
// The output is a function of the chunk and the CSS alone, so two builds of one tree write the same bytes.
import { createHash } from "node:crypto";

import type { Plugin } from "vite";

/** The one file the copy is, under the build's folder: apps/web/dist-phone/ for `npm run build:lookdev-phone`. */
export const PHONE_FILE = "lookdev.html";

/** What `npm run build:lookdev-phone` says, and does nothing else, without ROOM_DRAFTS=1 (vite.phone.config.ts). */
export const PHONE_REFUSAL =
  "build:lookdev-phone: the phone copy is drafts-only; run it with ROOM_DRAFTS=1 (FR-066, FR-069; contracts/lookdev.md §7.1)";

/** The page around the script and the style. */
export interface PhonePage {
  /** The document's title. */
  readonly title: string;
  /** The ID of the element the copy's entry starts in: src/lookdev/phone.ts's PHONE_ROOT. */
  readonly root: string;
}

/** A policy's source for an inline element: 'sha256-<base64>' of its text as UTF-8, as a browser hashes it. */
export function cspHash(text: string): string {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

/** lookdev.md §7.1's policy: the one script and the one style by hash; fonts and images from data:; nothing else. */
export function phonePolicy(script: string, style: string): string {
  return [
    "default-src 'none'",
    `script-src ${cspHash(script)}`,
    `style-src ${cspHash(style)}`,
    "font-src data:",
    "img-src data:",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** Refuses a text an HTML parser would change before a browser hashes it. */
function asParsed(what: string, text: string): string {
  if (/[\r\0]/.test(text)) throw new Error(`single-file: the ${what} holds a carriage return or a NUL`);
  if (new TextDecoder().decode(new TextEncoder().encode(text)) !== text) {
    throw new Error(`single-file: the ${what} holds a lone surrogate, which UTF-8 can't carry`);
  }
  return text;
}

/** The IIFE as a classic inline script's text: "<!--", "<script", and "</script", in any case, start "\x3C". */
export function scriptText(code: string): string {
  return asParsed("script", code).replace(/<(?=!--|\/?script)/gi, "\\x3C");
}

/** The CSS as a style element's text, refused if it would end the element. */
export function styleText(css: string): string {
  if (/<\/style/i.test(css)) throw new Error("single-file: the CSS holds </style, which would end its element");
  return asParsed("style", css);
}

/** Text in a double-quoted attribute, or in an element's content. */
const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The copy: the policy first in the head after the charset, the style, then the root and the script in the body. */
export function singleFileHtml(page: PhonePage, code: string, css: string): string {
  const script = scriptText(code);
  const style = styleText(css);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(phonePolicy(script, style))}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="h4-lookdev" content="drafts-only">',
    `<title>${escapeHtml(page.title)}</title>`,
    `<style>${style}</style>`,
    "</head>",
    "<body>",
    `<main id="${escapeHtml(page.root)}"></main>`,
    `<script>${script}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/**
 * The comment Vite appends to the CSS it extracts, which its css-post plugin strips in an app build; in library mode,
 * as of Vite 8.3.3, the one stylesheet keeps it. Only that comment goes: the CSS is otherwise as Vite minified it.
 */
const VITE_CSS_MARKER = /\/\*\$vite\$:\d+\*\//g;

/** The plugin: last in the build, it turns the bundle into lookdev.html alone. */
export function singleFile(page: PhonePage): Plugin {
  return {
    name: "h4-single-file",
    apply: "build",
    enforce: "post",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const files = Object.values(bundle);
        const chunks = files.filter((f) => f.type === "chunk");
        const [entry] = chunks;
        if (chunks.length !== 1 || !entry?.isEntry) {
          this.error(`single-file: the copy is one chunk, its entry; the build made ${chunks.length}`);
        }
        const styles = files.filter((f) => f.type === "asset" && f.fileName.endsWith(".css"));
        if (styles.length > 1) this.error(`single-file: the copy has one stylesheet; the build made ${styles.length}`);
        const [sheet] = styles;
        const css =
          sheet?.type !== "asset"
            ? ""
            : typeof sheet.source === "string"
              ? sheet.source
              : new TextDecoder().decode(sheet.source);
        const html = singleFileHtml(page, entry.code, css.replace(VITE_CSS_MARKER, ""));
        for (const name of Object.keys(bundle)) delete bundle[name];
        this.emitFile({ type: "asset", fileName: PHONE_FILE, source: html });
      },
    },
  };
}
