// An image skin's files at build (spec 030, FR-024, FR-025; plan.md §R-D4): each file the skin names, read from the
// repository's root (/src in the web image, where the `ui-assets` context lands, FR-027), held to its bytes and its
// SHA-256 as the round recorded them, and inlined as a `data:` URI, so the page loads no image of its own and the
// CSP's `img-src` needs nothing new. Any file absent, unreadable, over 48,000 bytes, or of another hash, the eleven
// over 96,000 bytes, or a hash still `pending`: the caller (build/ui-skins.ts) falls back to the skin's CSS fallback,
// whole, and prints the first reason. Each file gives three custom properties under its prefix: `-image` (the URI),
// `-slice` (its insets, top right bottom left, in the image's pixels), and `-bw` (the width it is drawn at, each inset
// halved in CSS px: the images are drawn at twice the CSS size). src/ui/button-image.css reads them.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** One file's bytes at most, and the eleven's together (plan §R-D4). */
export const IMAGE_FILE_MAX = 48_000;
export const IMAGE_TOTAL_MAX = 96_000;

/** The hash an entry holds until the round's record gives the real one; it always falls back. */
export const PENDING = "pending";

/** A file of an image skin, as build/ui-skins.ts's schema reads it, with the custom properties' prefix it fills
 *  (`--btn-primary-normal`, `--half-frame`). */
export interface ImageFile {
  readonly prefix: string;
  /** From the repository's root: `assets/ui/…/<name>.png`. */
  readonly file: string;
  /** 64 hex digits, or `pending`. */
  readonly sha256: string;
  /** The insets, top, right, bottom, left, in the image's pixels. */
  readonly slice: readonly [number, number, number, number];
}

/** Reads a file by its path from the repository's root; throws as node:fs does (ENOENT for a file absent). */
export type ReadFile = (path: string) => Uint8Array;

/** The repository's root as the build reads it by default: this file's, two folders above apps/web/build/. */
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export function readFromRoot(root: string): ReadFile {
  return (path) => readFileSync(join(root, path));
}

export type ImageResult =
  | { readonly ok: true; readonly properties: readonly (readonly [string, string])[]; readonly bytes: number }
  | { readonly ok: false; readonly reason: string };

/** Whether a read failed because the file isn't there (the build's "files absent"), not because it can't be read. */
function absent(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** The files read, checked, and turned into custom properties, in the order given; or the first reason they can't be. */
export function resolveImageSkin(files: readonly ImageFile[], read: ReadFile): ImageResult {
  const properties: [string, string][] = [];
  let total = 0;
  for (const f of files) {
    if (f.sha256 === PENDING) return { ok: false, reason: "hash pending" };
    let bytes: Uint8Array;
    try {
      bytes = read(f.file);
    } catch (error) {
      return { ok: false, reason: absent(error) ? `files absent: ${f.file}` : `unreadable: ${f.file}` };
    }
    if (bytes.length > IMAGE_FILE_MAX) return { ok: false, reason: `over ${IMAGE_FILE_MAX} bytes: ${f.file}` };
    if (createHash("sha256").update(bytes).digest("hex") !== f.sha256)
      return { ok: false, reason: `hash differs: ${f.file}` };
    total += bytes.length;
    properties.push(
      // The `;` of `data:image/png;base64,` is written as the CSS escape `\3b ` (one URL to a browser, CSS Syntax 3's
      // string escapes), so no reader that splits a rule's declarations at `;` (test/helpers/room.ts's parseCss, which
      // B's cascade reads) cuts the URI; the CSP's `img-src 'self' data:` admits it (nginx.conf).
      [`${f.prefix}-image`, `url("data:image/png\\3b base64,${Buffer.from(bytes).toString("base64")}")`],
      [`${f.prefix}-slice`, f.slice.join(" ")],
      [`${f.prefix}-bw`, f.slice.map((n) => `${n / 2}px`).join(" ")],
    );
  }
  if (total > IMAGE_TOTAL_MAX) return { ok: false, reason: `over ${IMAGE_TOTAL_MAX} bytes in all` };
  return { ok: true, properties, bytes: total };
}
