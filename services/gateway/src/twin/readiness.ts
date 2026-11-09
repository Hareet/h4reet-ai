// Readiness (spec 007; FR-029, FR-030; plan §6): config/twin-readiness.yaml, the Author's human-only file, created with
// its deny by his patch P-1. A topic, or free talk, is ready only while its entry says `ready: true` and both its hashes
// equal the running ones: the topic's pack hash (the whole pack's for free talk) and the prompt hash. The room's build
// applies the same rule to the same file (apps/web/build/room/readiness.ts). A missing or invalid file makes nothing
// ready, and never stops the gateway.
import { z } from "zod";

import { parseYaml } from "../config/load.js";
import { FREE_TALK, type Pack } from "./pack.js";

const HEX64 = /^[0-9a-f]{64}$/;
const SHARE = z.number().min(0).max(1);
const ENTRY = z.union([
  z.strictObject({
    ready: z.literal(true),
    pack_sha256: z.string().regex(HEX64),
    prompt_sha256: z.string().regex(HEX64),
    evidence: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    ready: z.literal(false),
    pack_sha256: z.string().regex(HEX64).optional(),
    prompt_sha256: z.string().regex(HEX64).optional(),
    evidence: z.array(z.string().min(1)).optional(),
  }),
]);
const SCHEMA = z.strictObject({
  schema: z.literal(1),
  thresholds: z.strictObject({ safety: SHARE, golden: SHARE }),
  topics: z.record(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), ENTRY),
  free_talk: ENTRY,
});

export type ReadinessEntry =
  { ready: true; packSha256: string; promptSha256: string; evidence: string[] } | { ready: false };

export interface ReadinessFile {
  thresholds: { safety: number; golden: number };
  topics: ReadonlyMap<string, ReadinessEntry>;
  freeTalk: ReadinessEntry;
}

export type ReadinessLoad = { ok: true; file: ReadinessFile } | { ok: false; reason: "missing" | "invalid" };

export const READINESS_FILE = "twin-readiness.yaml";

const entryOf = (e: z.infer<typeof ENTRY>): ReadinessEntry =>
  e.ready
    ? { ready: true, packSha256: e.pack_sha256, promptSha256: e.prompt_sha256, evidence: [...e.evidence] }
    : { ready: false };

/** The file's text, checked: its entries, or why there are none. */
export function parseReadiness(text: string): ReadinessLoad {
  const parsed = parseYaml(`config/${READINESS_FILE}`, text);
  if (parsed.issues.length > 0) return { ok: false, reason: "invalid" };
  const result = SCHEMA.safeParse(parsed.data);
  if (!result.success) return { ok: false, reason: "invalid" };
  const doc = result.data;
  return {
    ok: true,
    file: {
      thresholds: { safety: doc.thresholds.safety, golden: doc.thresholds.golden },
      topics: new Map(Object.entries(doc.topics).map(([id, e]) => [id, entryOf(e)])),
      freeTalk: entryOf(doc.free_talk),
    },
  };
}

/** The running hashes a feature's readiness binds: its topic's, or the whole pack's for free talk; null for a feature
 *  the pack doesn't name. */
export function runningPackHash(pack: Pack, feature: string): { topic: string; packSha256: string } | null {
  if (feature === FREE_TALK) return { topic: FREE_TALK, packSha256: pack.sha256 };
  const selectable = pack.selectable.get(feature);
  if (selectable === undefined) return null;
  const topic = pack.topic.get(selectable.topic);
  return topic === undefined ? null : { topic: topic.id, packSha256: topic.sha256 };
}

/** FR-030's rule: ready only while the entry says so and both its hashes equal the running ones. */
export function isReady(load: ReadinessLoad, files: { pack: Pack; promptSha256: string }, feature: string): boolean {
  if (!load.ok) return false;
  const running = runningPackHash(files.pack, feature);
  if (running === null) return false;
  const entry = running.topic === FREE_TALK ? load.file.freeTalk : load.file.topics.get(running.topic);
  return (
    entry !== undefined &&
    entry.ready &&
    entry.packSha256 === running.packSha256 &&
    entry.promptSha256 === files.promptSha256
  );
}

/** A feature's readiness for a loaded twin: never ready while the twin's own files are unavailable. */
export function readiness(
  twin:
    { available: true; files: { pack: Pack; promptSha256: string }; readiness: ReadinessLoad } | { available: false },
  feature: string,
): boolean {
  return twin.available && isReady(twin.readiness, twin.files, feature);
}
