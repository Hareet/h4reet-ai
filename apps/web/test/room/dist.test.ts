// T069's built-site half (spec 004; FR-012, FR-066; R-43, R-67; contracts/room-bundle.md §3.3, §14): what the room's
// bundle hands the built site, over the fixture set.
// - compose()'s public outputs, the index, the 3D part, the drafts modules, room_text, and the manifest, hold no value
//   of a † field (`work_order` fields, `origin.point`, `words_from`, `exclude`, `claims`, a `lead`,
//   `retired[].reason`, `survey`, `material_notes`, and an outline's `intent_ref`, `source`, and `tool`) and no pending
//   line: in a release compose under a policy approving every room-text file, so room_text holds them all, and in a
//   drafts compose, over the fixture set and over the same with a chalk line's claims and a UI word's. Each output is
//   read as spec 002's content check reads a file of dist/ (tools/gates/content_check.py's `readable`: a JSON file's
//   strings, keys and values; any other file with HTML's character references, \u escapes, and a bundle's string
//   escapes undone; whitespace collapsed), a value of 12 characters or more matched anywhere as text, a shorter one
//   only as a whole JSON string. The values are read from the fixture data when the test runs. `survey` holds a
//   placement's ID and an anchor's name, which the outputs carry by their own right, so its keys are held out instead.
// - roomBundle()'s resolveId throws `fixtures and lookdev are drafts-only (FR-066)` for `virtual:room-fixtures` and
//   `virtual:room-lookdev` in a release build, and resolves them in a drafts build.
// The checks of the site's own builds (test/global-build.ts) need the room's first data in the site's build, so they
// come with it (T093), and the lookdev page's with the page (T121).
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { serialize } from "../../build/room/emit";
import { loadRoom, UI_WORDS_FILE } from "../../build/room/load";
import type { LoadedRoom } from "../../build/room/load";
import { roomBundle } from "../../build/room/plugin";
import { noPolicy, policyFrom } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import { goodFiles, goodTree, overlay } from "../helpers/room-fixtures";
import { callHook, hookContext } from "../helpers/vite-plugin";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** The † fields contracts/room-bundle.md §14 names, and the pending lines, as `secrets` labels their values. */
const FIELDS = [
  "work_order",
  "origin.point",
  "words_from",
  "exclude",
  "claims",
  "lead",
  "retired[].reason",
  "material_notes",
  "intent_ref",
  "source",
  "tool",
  "pending line",
] as const;
type Field = (typeof FIELDS)[number];

/** A value the built site never holds, and the field it came from. */
interface Secret {
  readonly field: Field;
  readonly value: string;
}

/** Every † field's value and every pending line the room's data holds, but the survey's (see the header). */
function secrets(room: LoadedRoom): Secret[] {
  const out: Secret[] = [];
  const add = (field: Field, ...values: (string | undefined)[]): void => {
    for (const value of values) if (value !== undefined && value !== "") out.push({ field, value });
  };
  const quotes = (field: Field, refs: readonly { file: string; quote: string }[] | undefined): void => {
    for (const r of refs ?? []) add(field, r.file, r.quote);
  };
  for (const { value: c } of room.catalog) {
    add("origin.point", c.origin.point);
    const w = c.work_order;
    add("work_order", w.method, ...w.shots, ...w.measurements, w.studio_notes);
  }
  const scene = room.scene?.value;
  for (const s of scene?.selectables ?? []) add("lead", s.action.talk?.lead);
  for (const r of scene?.retired ?? []) add("retired[].reason", r.reason);
  for (const t of room.topics?.value.topics ?? []) quotes("words_from", t.words_from);
  for (const { value: b } of room.blocks) {
    quotes("words_from", b.words_from);
    add("exclude", ...(b.exclude ?? []));
    for (const line of b.lines) {
      if (line.pending) add("pending line", line.text);
      quotes("claims", line.claims);
    }
  }
  for (const word of Object.values(room.ui?.value.words ?? {}))
    if (typeof word !== "string") quotes("claims", word.claims);
  for (const { value: l } of room.looks) add("material_notes", l.material_notes);
  for (const { value: o } of room.outlines) {
    add("intent_ref", o.intent_ref);
    add("source", o.source.type, o.source.id);
    add("tool", o.tool.name, o.tool.version, o.tool.license);
  }
  return out;
}

// ---- Reading a file as the content check reads dist/ ----

const collapse = (text: string): string =>
  text
    .split(/\s+/)
    .filter((part) => part !== "")
    .join(" ");

/** Each key and string value in a JSON value, as the content check's `json_strings` gives them. */
function jsonStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) jsonStrings(v, out);
  else if (value !== null && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      jsonStrings(v, out);
    }
  return out;
}

const NAMED: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML's character references undone: numeric ones, and the named ones a page of the site can hold. */
const unescapeHtml = (text: string): string =>
  text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, (whole, dec?: string, hex?: string, name?: string) =>
    dec !== undefined
      ? String.fromCodePoint(Number(dec))
      : hex !== undefined
        ? String.fromCodePoint(parseInt(hex, 16))
        : (NAMED[name ?? ""] ?? whole),
  );

/** A file of the built site as the content check reads it: its text, and its whole JSON strings. */
interface Read {
  readonly text: string;
  readonly strings: ReadonlySet<string>;
}

function readFile(name: string, body: string): Read {
  if (name.endsWith(".json")) {
    try {
      const strings = jsonStrings(JSON.parse(body));
      return { text: collapse(strings.join("\n")), strings: new Set(strings) };
    } catch {
      // Not JSON after all: read as any other file.
    }
  }
  const text = unescapeHtml(body)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replaceAll("\\'", "'")
    .replaceAll('\\"', '"')
    .replaceAll("\\n", " ")
    .replaceAll("\\\\", "\\");
  const strings = new Set<string>();
  for (const literal of body.match(/"(?:[^"\\\n]|\\.)*"/g) ?? []) {
    try {
      strings.add(JSON.parse(literal) as string);
    } catch {
      // A literal JSON doesn't read isn't a JSON string.
    }
  }
  return { text: collapse(text), strings };
}

/** Whether a file holds `value`: anywhere as text at 12 characters or more, else only as a whole JSON string. */
const holds = (file: Read, value: string): boolean =>
  value.length >= 12 ? file.text.includes(collapse(value)) : file.strings.has(value);

/** compose()'s public outputs, each read as the site holds it: the index (the entry chunk's `room`), the 3D part (its
 *  chunk's), the drafts modules, room_text (in room-data.json), and the manifest (room-manifest.json). */
function publicFiles(result: ComposeResult): Map<string, Read> {
  return new Map([
    ["the index", readFile("index.json", serialize(result.index))],
    ["the 3D part", readFile("scene.json", serialize(result.scene))],
    ["the drafts modules", readFile("drafts.json", serialize(result.drafts))],
    ["room_text", readFile("room-data.json", serialize({ room_text: result.roomText }))],
    ["the manifest", readFile("room-manifest.json", `${JSON.stringify(result.manifest, null, 2)}\n`)],
  ]);
}

// ---- The data: the fixture set, and the same with claims ----

/** A corpus file the claims cite, about no one. */
const CORPUS = [
  "# Fixture topic: the fixture work",
  "",
  "A synthetic corpus file for the room's built-site test, about no one.",
  "",
  "## Role at a glance",
  "",
  "- `[A 2026-01-01]` The fixture keeper designed the fixture desk for the fixture room.",
  "- `[A 2026-01-01]` The fixture keeper founded the fixture club for the fixture town.",
  "",
].join("\n");

/** The fixture set with claims: its chalk block's first line cites the corpus, and so does a UI word about the Author. */
function withClaims(): Tree {
  const room = loadRoom(goodTree());
  const chalk = room.blocks.find((b) => b.value.renderer === "chalk");
  if (!chalk) throw new Error("the fixture set has no chalk block");
  const corpus = room.topics?.value.topics[0]?.corpus[0];
  if (!corpus) throw new Error("the fixture set's topic names no corpus file");
  const block = parse(decoder.decode(goodFiles().get(chalk.file))) as { lines: { claims?: unknown }[] };
  (block.lines[0] as { claims?: unknown }).claims = [
    { file: corpus, quote: "designed the fixture desk for the fixture room" },
  ];
  const ui = parse(decoder.decode(goodFiles().get(UI_WORDS_FILE))) as { words: Record<string, unknown> };
  const key = "sign.not_affiliated";
  ui.words[key] = {
    text: ui.words[key],
    about_author: true,
    claims: [{ file: corpus, quote: "founded the fixture club for the fixture town" }],
  };
  return overlay({ [corpus]: CORPUS, [chalk.file]: stringify(block), [UI_WORDS_FILE]: stringify(ui) });
}

/** A policy approving every room-text file of `tree` by its SHA-256, as main's content approvals would. */
function approving(tree: Tree): RoomPolicy {
  const room = loadRoom(tree);
  const approvals = [...room.blocks, ...room.outlines].map(({ file }) => ({
    sha256: sha256(tree.read(file) ?? new Uint8Array()),
    kind: "room-text",
  }));
  return policyFrom(
    { caps: null, approvals: encoder.encode(JSON.stringify({ schema: 1, approvals })), header: null },
    "policy-dir",
  );
}

const DATA: readonly (readonly [string, () => Tree])[] = [
  ["the fixture set", goodTree],
  ["the fixture set with claims", withClaims],
];

/** Each compose the test reads: a release build approving every room-text file, and a drafts build. */
function composes(tree: () => Tree): [string, ComposeResult][] {
  return [
    ["a release build", compose(tree(), approving(tree()), { mode: "strict", drafts: false })],
    ["a drafts build", compose(tree(), noPolicy(), { mode: "strict", drafts: true })],
  ];
}

describe("what compose() hands the built site (FR-012; contracts/room-bundle.md §14)", () => {
  it("is read from data holding a value of every † field and a pending line, which composes with no finding", () => {
    expect([...new Set(secrets(loadRoom(withClaims())).map((s) => s.field))].sort()).toEqual([...FIELDS].sort());
    for (const [, tree] of DATA)
      for (const [build, result] of composes(tree))
        expect(
          result.findings.map((f) => f.rule),
          build,
        ).toEqual([]);
  });

  it.each(DATA)("holds no † field's value and no pending line: %s", (_, tree) => {
    const values = secrets(loadRoom(tree()));
    for (const [build, result] of composes(tree)) {
      const leaks: string[] = [];
      for (const [name, file] of publicFiles(result))
        for (const s of values) if (holds(file, s.value)) leaks.push(`${build}: ${name} holds a ${s.field} value`);
      expect(leaks).toEqual([]);
      // The room text a build publishes is there to be read: its lines, but never a pending one.
      const lines = result.roomText.blocks.flatMap((b) => b.lines.map((l) => l.text));
      expect(lines.length, build).toBeGreaterThan(0);
    }
  });

  it("holds no survey: its keys are nowhere, since its values are a placement's ID and an anchor's name", () => {
    const survey = loadRoom(goodTree()).scene?.value.survey;
    expect(survey).toBeDefined();
    for (const [, tree] of DATA)
      for (const [build, result] of composes(tree))
        for (const [name, file] of publicFiles(result))
          for (const key of ["survey", ...Object.keys(survey ?? {})])
            expect(file.strings.has(key), `${build}: ${name} holds ${key}`).toBe(false);
  });

  it("reads a value as the content check does: at 12 characters or more as text, a shorter one only whole", () => {
    const values = secrets(loadRoom(goodTree()));
    const long = values.find((s) => s.value.length >= 12 && s.field === "work_order")?.value ?? "";
    const short = values.find((s) => s.value.length < 12 && s.field === "pending line")?.value ?? "";
    expect([long.length >= 12, short.length > 0 && short.length < 12]).toEqual([true, true]);
    const json = (value: unknown): Read => readFile("x.json", JSON.stringify(value));
    expect(holds(json({ note: `before ${long} after` }), long)).toBe(true);
    expect(holds(json({ note: long.replaceAll(" ", "\n  ") }), long)).toBe(true);
    expect(holds(json({ [short]: 1 }), short)).toBe(true);
    expect(holds(json({ note: short }), short)).toBe(true);
    expect(holds(json({ note: `${short}, and more` }), short)).toBe(false);
    // In a script, its escapes undone: a string literal with \u escapes, and one in single quotes.
    const escaped = [...long].map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
    expect(holds(readFile("x.js", `const a = "${escaped}";`), long)).toBe(true);
    expect(holds(readFile("x.js", `const a = 'it\\'s ${long}';`), long)).toBe(true);
    expect(holds(readFile("x.js", `const a = ${JSON.stringify(short)};`), short)).toBe(true);
    expect(holds(readFile("x.html", `<p>${long.replaceAll(" ", "&#32;")}</p>`), long)).toBe(true);
  });
});

describe("the drafts-only modules (FR-066; R-43; contracts/room-bundle.md §3.3)", () => {
  const MODULES = ["virtual:room-fixtures", "virtual:room-lookdev"];
  const started = (): { plugin: ReturnType<typeof roomBundle>; context: object } => {
    const plugin = roomBundle({ root: "/nonexistent", messages: "/nonexistent", tree: goodTree, policy: noPolicy });
    const { context } = hookContext();
    callHook(plugin, "buildStart", context, {});
    return { plugin, context };
  };

  it("fail a release build at resolveId: fixtures and lookdev are drafts-only", () => {
    vi.stubEnv("ROOM_DRAFTS", "");
    const { plugin, context } = started();
    for (const id of MODULES)
      expect(() => callHook(plugin, "resolveId", context, id, undefined, {})).toThrowError(
        /^fixtures and lookdev are drafts-only \(FR-066\)$/,
      );
  });

  it("resolve in a drafts build", () => {
    vi.stubEnv("ROOM_DRAFTS", "1");
    const { plugin, context } = started();
    for (const id of MODULES) expect(callHook(plugin, "resolveId", context, id, undefined, {})).toBe(`\0${id}`);
  });
});
