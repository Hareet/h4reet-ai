// The twin's pipeline, which both its routes share (spec 007; FR-002, FR-006 to FR-008, FR-021 to FR-027; plan §2):
// POST /room/turn for visitors and POST /admin/twin/turn for the Author's evaluation runs.
// - twinRuntime: the twin's files as loaded at start, the per-turn limits (limits.twin; FR-027's defaults on dev and
//   dev-cpu while it's absent; none on prod, whose turns are then twin_unavailable), the ranking, and the turn route's
//   own per-client bucket, which hello's requests don't fill.
// - parseTurn: a turn's body, `{feature, path, turns}` exactly (FR-002), and any keys a route adds (the admin route's
//   adapter and reason), each breach naming its field. No body enters a log, a span, or a store.
// - twinCall: the gateway call with the purpose `twin`, whose messages are a function the gateway calls only after its
//   state read passes, so a degraded turn builds no grounding and no prompt (FR-025); its input bound and output cap
//   from limits.twin; its feature and topic.
// - guardFor: the answer through the guards, against the grounding the call was built with.
import type { TwinFiles, TwinLoad, VisitPath } from "../config/twin.js";
import { TWIN_LIMIT_DEFAULTS, type Budgets, type EnvClass, type TwinLimits } from "../config/validate.js";
import type { GatewayCall } from "../core/gateway.js";
import { ClientCap } from "../core/limits.js";
import type { FinishReason } from "../core/types.js";
import { buildGrounding, type Grounding, type Turn } from "./grounding.js";
import { guardAnswer, type Guarded } from "./guards.js";
import { FREE_TALK, type Pack } from "./pack.js";
import { buildMessages, instructionChars, userText } from "./prompt.js";
import { Ranker } from "./retrieve.js";

export interface TwinRuntime {
  readonly load: TwinLoad;
  /** limits.twin, or FR-027's defaults on dev and dev-cpu; null on prod without it, where every turn is unavailable. */
  readonly limits: TwinLimits | null;
  /** Whether dev or dev-cpu uses the defaults, logged once at start as twin.limits_default. */
  readonly limitsDefault: boolean;
  readonly ranker: Ranker | null;
  /** The turn route's own per-client cap, spec 000's limits in a bucket of its own (FR-028). */
  readonly clientCap: ClientCap;
}

export const NO_TWIN: TwinLoad = {
  available: false,
  reason: "pack_missing",
  readiness: { ok: false, reason: "missing" },
};

export function twinRuntime(load: TwinLoad, budgets: Budgets, envClass: EnvClass): TwinRuntime {
  const configured = budgets.limits.twin;
  const limits = configured ?? (envClass === "prod" ? null : TWIN_LIMIT_DEFAULTS);
  return {
    load,
    limits,
    limitsDefault: configured === undefined && envClass !== "prod",
    ranker: load.available ? new Ranker(load.files.pack.sections) : null,
    clientCap: new ClientCap(budgets.limits.perClient),
  };
}

export interface TurnInput {
  readonly feature: string;
  readonly path: VisitPath;
  readonly turns: readonly Turn[];
}

type Invalid = { ok: false; field: string; detail: string };
const invalid = (field: string, detail: string): Invalid => ({ ok: false, field, detail });
const FEATURE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const codePoints = (s: string): number => [...s].length;

/** FR-002's body: exactly feature, path, and turns, plus the keys a route names; each breach names its field. */
export function parseTurn(
  body: unknown,
  o: { pack: Pack | null; limits: TwinLimits; extraKeys?: readonly string[] },
): { ok: true; turn: TurnInput; extra: Readonly<Record<string, unknown>> } | Invalid {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return invalid("body", "must be a JSON object");
  const b = body as Record<string, unknown>;
  const allowed = new Set(["feature", "path", "turns", ...(o.extraKeys ?? [])]);
  const keys = Object.keys(b);
  if (keys.some((k) => !allowed.has(k))) return invalid("body", `the fields are ${[...allowed].join(", ")}`);
  if (!("feature" in b) || !("path" in b) || !("turns" in b))
    return invalid("body", "feature, path, and turns are required");
  const { feature, path, turns } = b;
  if (typeof feature !== "string" || !FEATURE.test(feature))
    return invalid("feature", "must be a selectable's ID or free_talk");
  const known = feature === FREE_TALK || o.pack === null || o.pack.selectable.has(feature);
  if (!known) return invalid("feature", "must be a selectable's ID or free_talk");
  if (path !== "engineer" && path !== "non-engineer") return invalid("path", "must be engineer or non-engineer");
  if (!Array.isArray(turns)) return invalid("turns", "must be a list");
  const { limits } = o;
  if (turns.length > limits.historyMaxTurns) return invalid("turns", `at most ${limits.historyMaxTurns} turns`);
  const out: Turn[] = [];
  let total = 0;
  for (const raw of turns) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
      return invalid("turns", "each turn is {role, text}");
    const t = raw as Record<string, unknown>;
    if (Object.keys(t).length !== 2 || !("role" in t) || !("text" in t))
      return invalid("turns", "each turn is {role, text}");
    if (t.role !== "visitor" && t.role !== "twin") return invalid("turns", "a role is visitor or twin");
    if (typeof t.text !== "string") return invalid("turns", "a turn's text is a string");
    const text = t.text.trim();
    if (text.includes("\u0000")) return invalid("turns", "a turn's text holds no U+0000");
    const length = codePoints(text);
    if (length === 0) return invalid("turns", "a turn's text has at least 1 character");
    const cap = t.role === "visitor" ? limits.turnMaxChars : limits.historyMaxChars;
    if (length > cap) return invalid("turns", `a ${t.role} turn has at most ${cap} characters`);
    total += length;
    out.push({ role: t.role, text });
  }
  if (total > limits.historyMaxChars) return invalid("turns", `at most ${limits.historyMaxChars} characters in all`);
  if (out.length === 0 && feature === FREE_TALK) return invalid("turns", "free talk needs a visitor turn");
  if (out.length > 0 && out.at(-1)?.role !== "visitor") return invalid("turns", "the last turn is the visitor's");
  const extra = Object.fromEntries(keys.filter((k) => !["feature", "path", "turns"].includes(k)).map((k) => [k, b[k]]));
  return { ok: true, turn: { feature, path, turns: out }, extra };
}

/** The topic a feature opens: its selectable's topic, or free_talk. */
export function topicOf(pack: Pack, feature: string): string {
  return feature === FREE_TALK ? FREE_TALK : (pack.selectable.get(feature)?.topic ?? FREE_TALK);
}

/** The gateway call for a turn, and the grounding it was built with once the gateway has called its messages. */
export function twinCall(
  files: TwinFiles,
  runtime: { ranker: Ranker | null; limits: TwinLimits },
  input: TurnInput,
  o: {
    requestId: string;
    arrivedAt: number;
    signal: AbortSignal;
    freeTalkReady: boolean;
    clientKey?: string;
    clientLabel?: string;
  },
): { call: GatewayCall; grounding: () => Grounding | null } {
  let grounding: Grounding | null = null;
  const ranker = runtime.ranker ?? new Ranker(files.pack.sections);
  const selectable = files.pack.selectable.get(input.feature);
  const topic = topicOf(files.pack, input.feature);
  const messages = () => {
    // The bound left for the grounding: the input bound, less the instructions and the conversation as sent.
    // The grounding counts its own rules, sections, and lead.
    const shell = { topic, lead: selectable?.lead ?? null };
    const used = instructionChars(files, input.path) + userText(shell, input.feature, input.turns).length;
    grounding = buildGrounding({
      pack: files.pack,
      ranker,
      feature: input.feature,
      turns: input.turns,
      freeTalkReady: o.freeTalkReady,
      budgetChars: runtime.limits.maxInputChars - used,
    });
    return buildMessages({ files, grounding, feature: input.feature, path: input.path, turns: input.turns });
  };
  return {
    call: {
      requestId: o.requestId,
      purpose: "twin",
      messages,
      maxOutputTokens: runtime.limits.maxOutputTokens,
      maxInputChars: runtime.limits.maxInputChars,
      temperature: 0.3,
      arrivedAt: o.arrivedAt,
      signal: o.signal,
      room: { feature: input.feature, topic },
      ...(o.clientKey === undefined ? {} : { clientKey: o.clientKey }),
      ...(o.clientLabel === undefined ? {} : { clientLabel: o.clientLabel }),
    },
    grounding: () => grounding,
  };
}

/** The answer through the trim and the guards, against the turn's grounding; with no grounding, withheld (fail closed). */
export function guardFor(files: TwinFiles, grounding: Grounding | null, text: string, finish: FinishReason): Guarded {
  if (grounding === null) return { kind: "withheld", guard: "error", text: files.lines.withheld };
  return guardAnswer(text, finish, {
    groundingText: grounding.text,
    rulings: files.pack.rules.rulings.entries,
    quotes: files.pack.quotes,
    instructions: files.prompt.text,
    canary: files.prompt.canary,
    withheld: files.lines.withheld,
  });
}
