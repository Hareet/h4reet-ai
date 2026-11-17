// T-DS01 (a) (spec 030; FR-024, FR-025, SC-007; plan.md §R-D4): the image skin at build.
// - Files absent: the build falls back to the image skin's CSS fallback, whole (`metal`), and prints one line naming
//   the skin, the fallback, and the first reason; the page's root carries the fallback's ID and `css` (rework, N-3).
// - Files present (fixture PNGs this file writes into its own temporary folder, their SHA-256s in a fixture YAML): each
//   state's image inlined as a `data:` URI (--btn-<variant>-<state>-image), its insets as numbers (-slice), and the
//   width it is drawn at, half the image's pixels in CSS px (-bw); the panel frame's the same (--half-frame-*); the
//   fallback's tokens beneath, with the skin's `labels` on every state of their variant (rework, I-2); the root's
//   data-skin the image skin's and data-skin-kind `image`; the image component's rules (src/ui/button-image.css) in
//   the served stylesheet.
// - One hash wrong, a file over 48,000 bytes, the eleven over 96,000 bytes, a `pending` hash: the fallback, the line
//   naming the reason and, for a file, the file.
// - The schema refuses an image skin without `labels`, and one whose files aren't the eleven, or whose paths, hashes,
//   or insets aren't of their form.
// No binary is committed: every PNG is written here, by zlib, into a folder made for the test and removed after it.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SKIN_MODULE, readSkins, resolveSkin, skinCss, uiSkins } from "../build/ui-skins";
import type { CssSkin } from "../build/ui-skins";
import { WEB, parseCss } from "./helpers/room";
import { callHook, hookContext } from "./helpers/vite-plugin";

const VARIANTS = ["primary", "secondary"] as const;
const STATES = ["normal", "hover", "pressed", "disabled", "selected"] as const;
type Variant = (typeof VARIANTS)[number];
type ButtonState = (typeof STATES)[number];

const REPO_TEXT = readFileSync(join(WEB, "content", "ui-skins.yaml"), "utf8");
const METAL = readSkins(REPO_TEXT).skins.metal as CssSkin;

/** A PNG of w × h RGBA pixels, by zlib; `level` 0 stores the pixels uncompressed (for the size limits). */
function png(w: number, h: number, pixel: (x: number, y: number) => readonly number[], level = 9): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x += 1) {
      const p = pixel(x, y);
      for (let c = 0; c < 4; c += 1) raw[y * (w * 4 + 1) + 1 + x * 4 + c] = p[c] ?? 0;
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The eleven files' paths, as the brief names them (studio-round-1.md), under the repository's root. */
const fileOf = (variant: Variant, state: ButtonState): string => `assets/ui/buttons/btn-${variant}-${state}.png`;
const PANEL = "assets/ui/buttons/panel-frame.png";
const ALL = [...VARIANTS.flatMap((v) => STATES.map((s) => fileOf(v, s))), PANEL];

/** A fixture file's insets: every button 24 but primary's hover, which is uneven so the order and the halving show. */
const sliceOf = (path: string): [number, number, number, number] =>
  path === PANEL ? [48, 48, 48, 48] : path === fileOf("primary", "hover") ? [24, 20, 16, 12] : [24, 24, 24, 24];

/** The fixture labels: neither metal's, so their reach shows. */
const LABELS = { primary: "#0b0d10", secondary: "#f4fdff" } as const;

const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

interface Fixture {
  /** The repository's root as the build reads it: a temporary folder. */
  readonly root: string;
  /** Each file's bytes, by path. */
  readonly bytes: Map<string, Buffer>;
}

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A temporary root holding the eleven fixture PNGs (each a different face, so each hash differs), or none of them;
 *  `make` replaces one file's bytes. */
function fixture(options: { files?: boolean; make?: (path: string, i: number) => Buffer | undefined } = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), "h4-ui-skin-image-"));
  dirs.push(root);
  const bytes = new Map<string, Buffer>();
  ALL.forEach((path, i) => {
    const [w, h] = path === PANEL ? [256, 256] : [192, 96];
    const made =
      options.make?.(path, i) ??
      png(w, h, (x, y) => {
        const band = path === PANEL ? 48 : 24;
        const inside = x >= band && y >= band && x < w - band && y < h - band;
        return inside ? [20 + i * 10, 40, 60, 255] : [90, 90 + i * 5, 100, 200];
      });
    bytes.set(path, made);
    if (options.files !== false) {
      mkdirSync(join(root, "assets", "ui", "buttons"), { recursive: true });
      writeFileSync(join(root, path), made);
    }
  });
  return { root, bytes };
}

/** The image skin's entry in YAML, with each file's hash (from `hashes`, else the fixture's bytes), its insets. */
function entry(
  fx: Fixture,
  o: { id?: string; labels?: boolean; hashes?: Record<string, string>; extra?: string } = {},
): string {
  const line = (indent: string, key: string, path: string): string => {
    const hash = o.hashes?.[path] ?? sha(fx.bytes.get(path) ?? Buffer.alloc(0));
    return `${indent}${key}: { file: ${path}, sha256: ${hash}, slice: [${sliceOf(path).join(", ")}] }`;
  };
  return [
    `  ${o.id ?? "fixture-image"}:`,
    "    kind: image",
    "    fallback: metal",
    ...(o.labels === false ? [] : [`    labels: { primary: "${LABELS.primary}", secondary: "${LABELS.secondary}" }`]),
    ...(o.extra ? [o.extra] : []),
    "    files:",
    ...VARIANTS.flatMap((v) => [`      ${v}:`, ...STATES.map((s) => line("        ", s, fileOf(v, s)))]),
    line("      ", "panel", PANEL),
    "",
  ].join("\n");
}

/** The repository's skin file with the fixture's image skin added after its skins, and made the active one. */
function skinFile(fx: Fixture, o: Parameters<typeof entry>[1] = {}): string {
  const id = o.id ?? "fixture-image";
  return `${REPO_TEXT.replace(/^active: .*$/m, `active: ${id}`).trimEnd()}\n${entry(fx, o)}`;
}

/** The custom properties of the served stylesheet's root rule. */
function rootRule(css: string): { selector: string; decl: Map<string, string> } {
  const rule = parseCss(css).rules.find((r) => r.selector.startsWith(":root[data-skin="));
  if (!rule) throw new Error("no root rule in the stylesheet");
  return { selector: rule.selector, decl: rule.declarations };
}

const dataUri = (b: Buffer): string => `url("data:image/png;base64,${b.toString("base64")}")`;
const widths = (s: readonly number[]): string => s.map((n) => `${n / 2}px`).join(" ");

/** The plugin, through its hooks as Vite calls them, over a skin file and a root: its line, stylesheet, and page. */
function build(text: string, root: string): { css: string; html: string; printed: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "h4-ui-skin-image-src-"));
  dirs.push(dir);
  const source = join(dir, "ui-skins.yaml");
  writeFileSync(source, text);
  const printed: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    printed.push(args.map(String).join(" "));
  });
  const plugin = uiSkins({ source, root });
  const { context } = hookContext();
  callHook(plugin, "buildStart", context, {});
  const id = callHook(plugin, "resolveId", context, SKIN_MODULE, undefined, {});
  const css = String(callHook(plugin, "load", context, id));
  const hook: unknown = plugin.transformIndexHtml;
  const handler = typeof hook === "function" ? hook : (hook as { handler?: unknown } | undefined)?.handler;
  if (typeof handler !== "function") throw new Error("the plugin has no transformIndexHtml hook");
  const html = String(
    (handler as (h: string, c: unknown) => unknown).call(context, '<html lang="en"><body></body></html>', {
      path: "/index.html",
    }),
  );
  vi.restoreAllMocks();
  return { css, html, printed };
}

describe("the image skin falls back to its CSS skin, whole, and says why (FR-025)", () => {
  it("files absent: metal, its line naming the skin, the fallback, and the first file missing", () => {
    const fx = fixture({ files: false });
    const out = build(skinFile(fx), fx.root);
    expect(out.printed).toEqual([
      `fixture-image: falling back to metal (files absent: ${fileOf("primary", "normal")})`,
    ]);
    expect(out.html).toBe('<html lang="en" data-skin="metal" data-skin-kind="css"><body></body></html>');
    const { selector, decl } = rootRule(out.css);
    expect(selector).toBe(':root[data-skin="metal"]');
    expect([...decl.keys()].filter((k) => /-(image|slice|bw)$/.test(k))).toEqual([]);
    expect(decl.get("--btn-primary-normal-label")).toBe(METAL.tokens.primary.normal.label);
    expect(decl.get("--btn-secondary-hover-label")).toBe(METAL.tokens.secondary.hover.label);
    // No rule of the image component is served with a CSS skin.
    expect(out.css).not.toContain('data-skin-kind="image"');
  });

  it("one hash wrong: metal, the line naming that file", () => {
    const fx = fixture();
    const wrong = fileOf("secondary", "hover");
    const text = skinFile(fx, { hashes: { [wrong]: "0".repeat(64) } });
    const resolved = resolveSkin(readSkins(text), { root: fx.root });
    expect(resolved.id).toBe("metal");
    expect(resolved.kind).toBe("css");
    expect(resolved.line).toBe(`fixture-image: falling back to metal (hash differs: ${wrong})`);
    expect(skinCss(resolved)).not.toContain("data:image/png");
  });

  it("a file over 48,000 bytes: metal, the line naming that file", () => {
    const big = fileOf("primary", "pressed");
    const fx = fixture({
      make: (path) =>
        path === big ? png(192, 96, (x, y) => [(x * 7 + y * 13) % 256, x % 256, y % 256, 255], 0) : undefined,
    });
    expect(fx.bytes.get(big)?.length).toBeGreaterThan(48_000);
    const resolved = resolveSkin(readSkins(skinFile(fx)), { root: fx.root });
    expect(resolved.id).toBe("metal");
    expect(resolved.line).toBe(`fixture-image: falling back to metal (over 48000 bytes: ${big})`);
  });

  it("the eleven over 96,000 bytes, each under 48,000: metal, the line naming the total", () => {
    const fx = fixture({
      make: (_path, i) => png(48, 48, (x, y) => [(x * 31 + y * 17 + i) % 256, (x + i) % 256, y % 256, 255], 0),
    });
    const sizes = [...fx.bytes.values()].map((b) => b.length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(48_000);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeGreaterThan(96_000);
    const resolved = resolveSkin(readSkins(skinFile(fx)), { root: fx.root });
    expect(resolved.id).toBe("metal");
    expect(resolved.line).toBe("fixture-image: falling back to metal (over 96000 bytes in all)");
  });

  it("a `pending` hash: metal, `hash pending`, even with every file there", () => {
    const fx = fixture();
    const text = skinFile(fx, { hashes: { [fileOf("primary", "selected")]: "pending" } });
    const resolved = resolveSkin(readSkins(text), { root: fx.root });
    expect(resolved.id).toBe("metal");
    expect(resolved.line).toBe("fixture-image: falling back to metal (hash pending)");
  });

  it("a fallback keeps the fallback's tokens whole: its labels, not the image skin's", () => {
    const fx = fixture({ files: false });
    const decl = rootRule(skinCss(resolveSkin(readSkins(skinFile(fx)), { root: fx.root }))).decl;
    for (const v of VARIANTS)
      for (const s of STATES) expect(decl.get(`--btn-${v}-${s}-label`), `${v} ${s}`).toBe(METAL.tokens[v][s].label);
  });
});

describe("the image skin with its files (FR-024)", () => {
  it("inlines each state's image as a data: URI, with its insets and half its pixels as CSS widths", () => {
    const fx = fixture();
    const out = build(skinFile(fx), fx.root);
    expect(out.printed).toEqual(["ui-skins: fixture-image (image)"]);
    const { selector, decl } = rootRule(out.css);
    expect(selector).toBe(':root[data-skin="fixture-image"]');
    for (const v of VARIANTS)
      for (const s of STATES) {
        const path = fileOf(v, s);
        expect(decl.get(`--btn-${v}-${s}-image`), path).toBe(dataUri(fx.bytes.get(path) ?? Buffer.alloc(0)));
        expect(decl.get(`--btn-${v}-${s}-slice`), path).toBe(sliceOf(path).join(" "));
        expect(decl.get(`--btn-${v}-${s}-bw`), path).toBe(widths(sliceOf(path)));
      }
    expect(decl.get("--btn-primary-hover-bw")).toBe("12px 10px 8px 6px");
    expect(decl.get("--half-frame-image")).toBe(dataUri(fx.bytes.get(PANEL) ?? Buffer.alloc(0)));
    expect(decl.get("--half-frame-slice")).toBe("48 48 48 48");
    expect(decl.get("--half-frame-bw")).toBe("24px 24px 24px 24px");
  });

  it("keeps the fallback's tokens beneath, and sets the skin's labels on every state of their variant (rework, I-2)", () => {
    const fx = fixture();
    const decl = rootRule(build(skinFile(fx), fx.root).css).decl;
    for (const v of VARIANTS)
      for (const s of STATES) {
        expect(decl.get(`--btn-${v}-${s}-label`), `${v} ${s}`).toBe(LABELS[v]);
        expect(decl.get(`--btn-${v}-${s}-face`), `${v} ${s}`).toBe(METAL.tokens[v][s].face);
        expect(decl.get(`--btn-${v}-${s}-border`), `${v} ${s}`).toBe(METAL.tokens[v][s].border);
      }
    expect(decl.get("--btn-chamfer")).toBe(METAL.tokens.chamfer);
    expect(decl.get("--btn-secondary-selected-glow")).toBe(METAL.tokens.secondary.selected.glow);
    expect(decl.get("--btn-primary-ring")).toBe(METAL.tokens.primary.ring);
  });

  it("writes the image skin's ID and `image` on the page's root (rework, N-3), and serves the image component's rules", () => {
    const fx = fixture();
    const out = build(skinFile(fx), fx.root);
    expect(out.html).toBe('<html lang="en" data-skin="fixture-image" data-skin-kind="image"><body></body></html>');
    const component = readFileSync(join(WEB, "src", "ui", "button-image.css"), "utf8");
    expect(out.css).toContain(component.trim());
    expect(parseCss(out.css).rules.some((r) => r.selector.includes('[data-skin-kind="image"]'))).toBe(true);
  });

  it("reads each file from the root it is given, never past it", () => {
    const fx = fixture();
    const empty = fixture({ files: false });
    expect(resolveSkin(readSkins(skinFile(fx)), { root: fx.root }).kind).toBe("image");
    expect(resolveSkin(readSkins(skinFile(fx)), { root: empty.root }).kind).toBe("css");
  });
});

describe("the image skin's schema (FR-024)", () => {
  // The schema reads no file: each path's hash from bytes held here, no folder made.
  const fx: Fixture = { root: "/nonexistent", bytes: new Map(ALL.map((p) => [p, Buffer.from(p)])) };
  const valid = skinFile(fx);

  it("reads a valid image skin", () => {
    const skin = readSkins(valid).skins["fixture-image"];
    expect(skin?.kind).toBe("image");
  });

  const refusals: [string, string, RegExp][] = [
    ["an image skin without labels", skinFile(fx, { labels: false }), /labels/],
    ["a label that isn't a colour", valid.replace(`primary: "${LABELS.primary}"`, "primary: yellow"), /labels/],
    ["a state's file missing", valid.replace(/^ {8}pressed: \{ file: [^\n]*\n/m, ""), /pressed/],
    ["no panel frame", valid.replace(/^ {6}panel: [^\n]*\n/m, ""), /panel/],
    ["an unknown key", skinFile(fx, { extra: "    sparkle: 1" }), /sparkle/],
    ["a hash of another form", valid.replace(/sha256: [0-9a-f]{64}/, "sha256: abc"), /sha256/],
    ["a path outside assets/ui", valid.replace(`file: ${PANEL}`, "file: assets/policy/caps.json"), /file/],
    ["a path climbing out", valid.replace(`file: ${PANEL}`, "file: assets/ui/../policy/x.png"), /file/],
    ["an inset of 0", valid.replace("slice: [48, 48, 48, 48]", "slice: [48, 0, 48, 48]"), /slice/],
    ["three insets", valid.replace("slice: [48, 48, 48, 48]", "slice: [48, 48, 48]"), /slice/],
  ];
  for (const [what, text, named] of refusals)
    it(`refuses ${what}, naming it`, () => {
      expect(() => readSkins(text)).toThrow(named);
    });
});
