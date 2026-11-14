// The corpus size check (spec 027; ADR 0054; plan §4): measures what the twin is built from and how much of it a turn
// holds, by the fit check's model (`fitProblems` in ./twin-pack.ts; spec 007's plan, D5 and D20), and writes the record,
// docs/corpus-size.json, with the stage ADR 0054's thresholds call for. A crossed threshold is a note, never a failure
// (Q4). Nothing at run time reads the record (FR-013).
//
// Reads only the corpus's topic and facts files, config/twin/corpus.json, config/twin/prompt.md, and
// config/budgets.yaml (FR-008). The record holds no commit and no date, so two runs over a tree agree (FR-009).
import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import {
  BUDGETS_PATH,
  FRAMING_CHARS,
  PACK_PATH,
  PER_TURN_CHARS,
  PROFILE_FILE,
  PROMPT_PATH,
  REPO_ROOT,
  fitLimits,
  fsReader,
  instructionsChars,
  renderRules,
  renderSection,
} from "./twin-pack";
import type { PackReader, PackSection, TwinPack } from "./twin-pack";

/** ADR 0054's Decision 2: the one place the thresholds live. A change to one is an ADR amendment in the same commit. */
export const THRESHOLDS = {
  t1_band: 0.95, // a selectable topic's grounding ÷ the room
  t2_share: 0.05, // free talk's room ÷ the rankable sections' characters: crossed below
  t2_band: 0.075,
  t3_pack_bytes: 10_485_760,
  t3_sections: 10_000,
  t3_band: 0.5, // of either T3 figure
} as const;
export const RECORD_PATH = "docs/corpus-size.json";
export const ADR_PATH = "docs/adr/0054-when-file-context-stops-being-enough.md";
export const GENERATED_BY = "apps/web/build/corpus-size.ts (npm run twin:pack -w apps/web)";
export const UNIT =
  "characters: a JavaScript string's length, which the gateway counts as one token each before a call";
/** What the record's figures are (FR-010): the fit check's model, not the characters the gateway sends. */
export const MODEL =
  "the fit check's model (spec 007's plan, D5, D20): leaves out the selectable's lead (counted beside each topic as lead), JSON escaping of each quoted turn beyond PER_TURN_CHARS, and estimates the framing at FRAMING_CHARS against CONVERSATION_HEAD, CONVERSATION_TAIL, and the line breaks";

/** The selectable's lead as the gateway's prompt writes it (services/gateway/src/twin/render.ts, `renderLead`); a test
 *  holds the two templates equal. */
export const renderLead = (lead: string | null): string => (lead === null ? "" : `The piece's lead: ${lead}\n\n`);

const TOPIC_FILE = /^\d{2}-[a-z0-9-]+\.md$/;
const FACTS_FILE = /^[a-z0-9-]+\.yaml$/;

export interface FileSize {
  readonly path: string;
  readonly bytes: number;
  readonly words: number;
  readonly chars: number;
}
export interface GroupSize {
  readonly files: number;
  readonly bytes: number;
  readonly words: number;
  readonly chars: number;
}
export interface FilesMeasure {
  readonly topic: GroupSize;
  readonly facts: GroupSize;
  readonly total: GroupSize;
  readonly by_file: readonly FileSize[];
}

export interface TopicMeasure {
  readonly id: string;
  readonly files: readonly string[];
  readonly rendered: number;
  readonly grounding: number;
  readonly share: number;
  readonly margin: number;
  /** Information outside T1: the longest rendered lead of the topic's selectables (0 when none has one). */
  readonly lead: number;
  readonly margin_after_lead: number;
}
export interface FileTopicMeasure {
  readonly file: string;
  readonly rendered: number;
  readonly grounding: number;
  readonly share: number;
  readonly margin: number;
  readonly in_topics: readonly string[];
}
export interface PackMeasure {
  readonly limits: {
    readonly source: "config/budgets.yaml" | "defaults";
    readonly max_input_chars: number;
    readonly history_max_chars: number;
    readonly history_max_turns: number;
  };
  readonly room: {
    readonly instructions: number;
    readonly framing: number;
    readonly conversation: number;
    readonly room: number;
  };
  readonly base: { readonly rules: number; readonly profile: number; readonly base: number };
  readonly topics: readonly TopicMeasure[];
  readonly by_file: readonly FileTopicMeasure[];
  readonly free_talk: { readonly room: number; readonly rankable: number; readonly share: number };
  readonly pack: {
    readonly sections: number;
    readonly bytes: number;
    readonly rendered: number;
    readonly longest_section: number;
  };
}
export type Threshold = "T1" | "T2" | "T3";
export interface Stage {
  readonly stage: number;
  readonly crossed: readonly Threshold[];
  readonly band: readonly Threshold[];
  readonly notes: readonly string[];
}

const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;
const n = (x: number): string => x.toLocaleString("en-US");
const pct = (x: number): string => `${(Math.round(x * 1_000) / 10).toFixed(1)}%`;

const sizeOf = (path: string, text: string): FileSize => ({
  path,
  bytes: Buffer.byteLength(text, "utf8"),
  words: text.match(/\S+/g)?.length ?? 0,
  chars: text.length,
});
const sum = (rows: readonly FileSize[]): GroupSize => ({
  files: rows.length,
  bytes: rows.reduce((a, r) => a + r.bytes, 0),
  words: rows.reduce((a, r) => a + r.words, 0),
  chars: rows.reduce((a, r) => a + r.chars, 0),
});

/** The topic files (`corpus/NN-<topic>.md`) and `corpus/facts/*.yaml`, sorted: bytes (UTF-8), words (`\S+` runs), and
 *  characters, per file, per group, and together. Lists only `corpus` and `corpus/facts`. */
export function measureFiles(reader: PackReader): FilesMeasure {
  const read = (dir: string, names: readonly string[]): FileSize[] =>
    names.flatMap((name) => {
      const path = `${dir}/${name}`;
      const text = reader.read(path);
      return text === null ? [] : [sizeOf(path, text)];
    });
  const topic = read(
    "corpus",
    reader
      .list("corpus")
      .filter((f) => TOPIC_FILE.test(f))
      .sort(),
  );
  const facts = read(
    "corpus/facts",
    reader
      .list("corpus/facts")
      .filter((f) => FACTS_FILE.test(f))
      .sort(),
  );
  return { topic: sum(topic), facts: sum(facts), total: sum([...topic, ...facts]), by_file: [...topic, ...facts] };
}

const cost = (sections: readonly PackSection[]): number => sections.reduce((a, s) => a + renderSection(s).length, 0);

/** The room and each grounding, exactly as `fitProblems` computes them, with the leads and each file as information. */
export function measurePack(o: {
  pack: TwinPack;
  packBytes: number;
  prompt: string;
  budgetsText: string | null;
}): PackMeasure {
  const { pack } = o;
  const limits = fitLimits(o.budgetsText);
  const twin = (parseTwin(o.budgetsText) ?? {}) as Record<string, unknown>;
  const own = ["max_input_chars", "history_max_chars", "history_max_turns"].every(
    (k) => typeof twin[k] === "number" && Number.isInteger(twin[k]),
  );
  const instructions = instructionsChars(o.prompt);
  const conversation = limits.history_max_chars + limits.history_max_turns * PER_TURN_CHARS;
  const room = limits.max_input_chars - instructions - FRAMING_CHARS - conversation;
  const rules = renderRules(pack).length;
  const profile = cost(pack.sections.filter((s) => s.file === PROFILE_FILE));
  const base = rules + profile;

  const topics = pack.topics.map((t): TopicMeasure => {
    const rendered = cost(pack.sections.filter((s) => t.files.includes(s.file) && s.file !== PROFILE_FILE));
    const grounding = base + rendered;
    const margin = room - grounding;
    const lead = Math.max(0, ...pack.selectables.filter((s) => s.topic === t.id).map((s) => renderLead(s.lead).length));
    return {
      id: t.id,
      files: [...t.files],
      rendered,
      grounding,
      share: round4(grounding / room),
      margin,
      lead,
      margin_after_lead: margin - lead,
    };
  });

  const topicFiles = [...new Set(pack.sections.map((s) => s.file).filter((f) => f !== PROFILE_FILE))].sort();
  const by_file = topicFiles.map((file): FileTopicMeasure => {
    const rendered = cost(pack.sections.filter((s) => s.file === file));
    const grounding = base + rendered;
    return {
      file,
      rendered,
      grounding,
      share: round4(grounding / room),
      margin: room - grounding,
      in_topics: pack.topics.filter((t) => t.files.includes(file)).map((t) => t.id),
    };
  });

  const rankable = cost(pack.sections.filter((s) => s.file !== PROFILE_FILE));
  const freeRoom = room - base;
  return {
    limits: { source: own ? "config/budgets.yaml" : "defaults", ...limits },
    room: { instructions, framing: FRAMING_CHARS, conversation, room },
    base: { rules, profile, base },
    topics,
    by_file,
    free_talk: { room: freeRoom, rankable, share: rankable === 0 ? 1 : round4(freeRoom / rankable) },
    pack: {
      sections: pack.sections.length,
      bytes: o.packBytes,
      rendered: cost(pack.sections),
      longest_section: Math.max(0, ...pack.sections.map((s) => renderSection(s).length)),
    },
  };
}

/** `limits.twin` from config/budgets.yaml's text, or null: the source is "config/budgets.yaml" only when it holds all
 *  three of the fit check's keys as integers, as `fitLimits` takes them. */
function parseTwin(text: string | null): Record<string, unknown> | null {
  const doc = parseYaml(text ?? "") as { limits?: { twin?: Record<string, unknown> } } | null;
  return doc?.limits?.twin ?? null;
}

/** The stage the figures call for (ADR 0054's Decision 2): T1 on the pack topics alone; `by_file` and `lead` never set
 *  it. One note per crossed threshold, and one per topic or figure in a band. */
export function stageOf(m: PackMeasure): Stage {
  const crossed: Threshold[] = [];
  const band: Threshold[] = [];
  const notes: string[] = [];
  const room = m.room.room;

  const t1Band = Math.ceil(room * THRESHOLDS.t1_band);
  const past = m.topics.filter((t) => t.grounding > room);
  const near = m.topics.filter((t) => t.grounding <= room && t.grounding >= t1Band);
  for (const t of past) {
    notes.push(
      `corpus:size: T1 crossed: the topic ${t.id} needs ${n(t.grounding)} characters of grounding, past the room's ${n(room)}; ADR 0054 says stage 1 (retrieval within a topic) is due`,
    );
  }
  for (const t of near) {
    notes.push(
      `corpus:size: T1 band: the topic ${t.id} is within ${n(t.margin)} characters of T1 (${n(t.grounding)} of the room's ${n(room)}; ADR 0054)`,
    );
  }
  if (past.length > 0) crossed.push("T1");
  else if (near.length > 0) band.push("T1");

  const ft = m.free_talk;
  if (ft.rankable > 0 && ft.room < ft.rankable * THRESHOLDS.t2_share) {
    crossed.push("T2");
    notes.push(
      `corpus:size: T2 crossed: free talk's room is ${pct(ft.room / ft.rankable)} of the rankable sections' ${n(ft.rankable)} characters, under ${pct(THRESHOLDS.t2_share)}; ADR 0054 says stage 2 (vector retrieval, in-process) is due`,
    );
  } else if (ft.rankable > 0 && ft.room < ft.rankable * THRESHOLDS.t2_band) {
    band.push("T2");
    notes.push(
      `corpus:size: T2 band: free talk's room is ${pct(ft.room / ft.rankable)} of the rankable sections' ${n(ft.rankable)} characters, under ${pct(THRESHOLDS.t2_band)} (ADR 0054)`,
    );
  }

  const { bytes, sections } = m.pack;
  if (bytes > THRESHOLDS.t3_pack_bytes || sections > THRESHOLDS.t3_sections) {
    crossed.push("T3");
    notes.push(
      `corpus:size: T3 crossed: the pack is ${n(bytes)} bytes in ${n(sections)} sections, past ${n(THRESHOLDS.t3_pack_bytes)} bytes or ${n(THRESHOLDS.t3_sections)} sections; ADR 0054 says stage 3 (a vector database) is due`,
    );
  } else if (
    bytes >= THRESHOLDS.t3_pack_bytes * THRESHOLDS.t3_band ||
    sections >= THRESHOLDS.t3_sections * THRESHOLDS.t3_band
  ) {
    band.push("T3");
    notes.push(
      `corpus:size: T3 band: the pack is ${n(bytes)} bytes in ${n(sections)} sections, at half of T3 or more (ADR 0054)`,
    );
  }

  const stage = Math.max(0, ...crossed.map((t) => Number(t.slice(1))));
  return { stage, crossed, band, notes };
}

export interface CorpusSizeRecord {
  readonly schema: 1;
  readonly generated_by: string;
  readonly adr: string;
  readonly unit: string;
  readonly files: FilesMeasure;
  readonly limits: PackMeasure["limits"];
  readonly model: string;
  readonly room: PackMeasure["room"];
  readonly base: PackMeasure["base"];
  readonly topics: readonly TopicMeasure[];
  readonly by_file: readonly FileTopicMeasure[];
  readonly free_talk: PackMeasure["free_talk"];
  readonly pack: PackMeasure["pack"];
  readonly thresholds: typeof THRESHOLDS;
  readonly stage: {
    readonly stage: number;
    readonly crossed: readonly Threshold[];
    readonly band: readonly Threshold[];
  };
}

/** The record, its keys in a fixed order (plan §4), holding no commit and no date. */
export function buildRecord(files: FilesMeasure, m: PackMeasure, stage: Stage): CorpusSizeRecord {
  return {
    schema: 1,
    generated_by: GENERATED_BY,
    adr: ADR_PATH,
    unit: UNIT,
    files: { topic: files.topic, facts: files.facts, total: files.total, by_file: files.by_file },
    limits: m.limits,
    model: MODEL,
    room: m.room,
    base: m.base,
    topics: m.topics,
    by_file: m.by_file,
    free_talk: m.free_talk,
    pack: m.pack,
    thresholds: THRESHOLDS,
    stage: { stage: stage.stage, crossed: stage.crossed, band: stage.band },
  };
}

export const recordJson = (record: CorpusSizeRecord): string => `${JSON.stringify(record, null, 2)}\n`;

/** The record from a tree, through its reader: the committed pack, the prompt, the budgets, and the corpus's files.
 *  Throws when the pack is missing or isn't JSON. */
export function computeRecord(reader: PackReader): { record: CorpusSizeRecord; stage: Stage; measure: PackMeasure } {
  const packText = reader.read(PACK_PATH);
  if (packText === null) throw new Error(`${PACK_PATH} is missing: run npm run twin:pack -w apps/web`);
  let pack: TwinPack;
  try {
    pack = JSON.parse(packText) as TwinPack;
  } catch {
    throw new Error(`${PACK_PATH} isn't JSON: run npm run twin:pack -w apps/web`);
  }
  const measure = measurePack({
    pack,
    packBytes: Buffer.byteLength(packText, "utf8"),
    prompt: reader.read(PROMPT_PATH) ?? "",
    budgetsText: reader.read(BUDGETS_PATH),
  });
  const stage = stageOf(measure);
  return { record: buildRecord(measureFiles(reader), measure, stage), stage, measure };
}

/** The CLI, `twin:pack`'s second step: writes the record, prints each note on stderr and a summary on stdout, and exits
 *  0 whatever the stage (Q4); 1, writing nothing, when the pack can't be read. */
export function main(root: string = REPO_ROOT): number {
  let computed: ReturnType<typeof computeRecord>;
  try {
    computed = computeRecord(fsReader(root));
  } catch (error) {
    process.stderr.write(`corpus:size: ${(error as Error).message}\n`);
    return 1;
  }
  const { record, stage, measure } = computed;
  const out = join(root, RECORD_PATH);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, recordJson(record));
  for (const note of stage.notes) process.stderr.write(`${note}\n`);
  const closest = [...measure.topics].sort((a, b) => a.margin - b.margin)[0];
  const lead = closest === undefined ? "no topics" : `${closest.id} ${n(closest.grounding)} of ${n(measure.room.room)}`;
  process.stdout.write(`corpus:size: wrote ${RECORD_PATH}: stage ${stage.stage}; ${lead}\n`);
  return 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
