// The twin's grounding pack as the gateway loads it (spec 007; FR-007, FR-054; plan §4): config/twin/corpus.json, which
// apps/web/build/twin-pack.ts generates from the corpus and make test keeps fresh. A strict schema, so an unknown key at
// any depth is invalid; every hash recomputed, whole and per topic, so a pack edited by hand without its build is
// invalid; and every selectable's files among the pack's. An invalid pack leaves the twin unavailable and never stops
// the gateway (FR-054): parsePack returns a reason and throws nothing.
import { z } from "zod";

import { canonicalHash } from "./hash.js";

export const PROFILE_FILE = "corpus/00-profile.md";
export const FREE_TALK = "free_talk";

const HEX64 = /^[0-9a-f]{64}$/;
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const FILE = /^corpus\/\d{2}-[a-z0-9-]+\.md$/;

const GOLDEN = z.strictObject({
  n: z.number().int().positive(),
  question: z.string().min(1),
  answer: z.string().min(1),
  tags: z.array(z.string()),
});
const SECTION = z.strictObject({
  id: z.string().min(1).max(128),
  file: z.string().regex(FILE),
  heading: z.string(),
  kind: z.enum(["lead", "section", "golden"]),
  text: z.string().min(1),
  chars: z.number().int().nonnegative(),
  golden: GOLDEN.nullable(),
});
const QUOTE = z.strictObject({
  file: z.string().regex(FILE),
  answer: z.string().min(1),
  spans: z.array(z.string().min(1)).min(1),
});
const SCHEMA = z.strictObject({
  schema: z.literal(1),
  generated_by: z.string(),
  files: z.array(z.string().regex(FILE)).min(1),
  sections: z.array(SECTION).min(1),
  rules: z.strictObject({
    do_not_claim: z.array(z.strictObject({ file: z.string().regex(FILE), text: z.string().min(1) })),
    rulings: z.strictObject({
      file: z.string().regex(FILE),
      text: z.string().min(1),
      entries: z.array(z.strictObject({ system: z.string().min(1), verbs: z.array(z.string().min(1)).min(1) })).min(1),
    }),
    ownership_verbs: z.array(z.string().min(1)).min(1),
    artifacts: z.array(z.string().min(1)),
  }),
  quotes: z.strictObject({ privacy: QUOTE, agents_share: QUOTE }),
  selectables: z.array(
    z.strictObject({
      id: z.string().regex(ID),
      topic: z.string().regex(ID),
      files: z.array(z.string().regex(FILE)).min(1),
      lead: z.string().nullable(),
    }),
  ),
  topics: z.array(
    z.strictObject({
      id: z.string().regex(ID),
      files: z.array(z.string().regex(FILE)).min(1),
      sha256: z.string().regex(HEX64),
    }),
  ),
  sha256: z.string().regex(HEX64),
});

export type PackJson = z.infer<typeof SCHEMA>;
export type PackSection = PackJson["sections"][number];
export type Ruling = PackJson["rules"]["rulings"]["entries"][number];
export type Quotes = PackJson["quotes"];
export type Selectable = PackJson["selectables"][number];

export interface Pack extends PackJson {
  /** A selectable by its ID. */
  readonly selectable: ReadonlyMap<string, Selectable>;
  /** A topic's files and hash, by its ID. */
  readonly topic: ReadonlyMap<string, PackJson["topics"][number]>;
}

export type PackLoad = { ok: true; pack: Pack } | { ok: false; reason: "invalid"; detail: string };

type HashBody = Pick<PackJson, "rules" | "quotes" | "sections" | "selectables">;

/** What a topic's hash covers, as the builder's topicHashInput: the rules, the quotes, `00`, the topic's files, and
 *  its selectables. */
export function topicHashInput(pack: HashBody, topic: string, files: readonly string[]): unknown {
  return {
    rules: pack.rules,
    quotes: pack.quotes,
    profile: pack.sections.filter((s) => s.file === PROFILE_FILE),
    sections: pack.sections.filter((s) => files.includes(s.file) && s.file !== PROFILE_FILE),
    selectables: pack.selectables.filter((s) => s.topic === topic),
  };
}

/** What the whole pack's hash, free talk's, covers: everything but the hashes. */
export function wholeHashInput(pack: HashBody): unknown {
  return { rules: pack.rules, quotes: pack.quotes, sections: pack.sections, selectables: pack.selectables };
}

/** The pack's JSON with its hashes recomputed: what the builder would write for the same body. */
export function recompute<T extends PackJson>(pack: T): T {
  return {
    ...pack,
    topics: pack.topics.map((t) => ({ ...t, sha256: canonicalHash(topicHashInput(pack, t.id, t.files)) })),
    sha256: canonicalHash(wholeHashInput(pack)),
  };
}

/** config/twin/corpus.json's text, checked. */
export function parsePack(text: string): PackLoad {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid", detail: "not JSON" };
  }
  const parsed = SCHEMA.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: "invalid", detail: `schema: ${(issue?.path ?? []).join(".") || "(top)"}` };
  }
  const json = parsed.data;
  if (canonicalHash(wholeHashInput(json)) !== json.sha256) return { ok: false, reason: "invalid", detail: "sha256" };
  for (const t of json.topics) {
    if (canonicalHash(topicHashInput(json, t.id, t.files)) !== t.sha256)
      return { ok: false, reason: "invalid", detail: `topics.${t.id}.sha256` };
  }
  const files = new Set(json.files);
  for (const s of json.selectables) {
    if (!s.files.every((f) => files.has(f)))
      return { ok: false, reason: "invalid", detail: `selectables.${s.id}.files` };
    if (!json.topics.some((t) => t.id === s.topic))
      return { ok: false, reason: "invalid", detail: `selectables.${s.id}.topic` };
  }
  if (json.selectables.some((s) => s.id === FREE_TALK))
    return { ok: false, reason: "invalid", detail: "selectables.free_talk" };
  return {
    ok: true,
    pack: {
      ...json,
      selectable: new Map(json.selectables.map((s) => [s.id, s])),
      topic: new Map(json.topics.map((t) => [t.id, t])),
    },
  };
}
