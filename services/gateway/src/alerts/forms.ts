// Each channel's form (spec 011, FR-023 to FR-031; plan §6.1): at each delivery attempt, the dispatcher asks
// formsFor which form a channel sends, designed or plain, and why it is plain when it is.
//
//   formats.<channel> is plain, or no design is registered    plain    no reason (the Author's switch)
//   the row's <channel>_form is already plain                  plain    the earlier reason, kept (FR-028)
//   the facts aren't version 2, or don't decode                plain    not_rendered (FR-030)
//   the renderer throws, or its output fails its check         plain    render_failed (FR-014, FR-025)
//   the output passes its bound                                plain    over_limit (FR-023): never cut
//   otherwise                                                  designed
//
// The designs render from the decoded facts alone (facts.ts), here, at send time, never in a cause's transaction
// (plan D1). They are registered in RENDERERS, which the dispatcher reads unless it is handed others (tests).
import { decodeFacts } from "./facts.js";
import type { AlertContext, AlertSpec } from "./format.js";
import { designTelegram } from "./telegram-design.js";

export type AlertForm = "designed" | "plain";
export const FALLBACK_REASONS = [
  "entities_refused",
  "message_refused",
  "render_failed",
  "over_limit",
  "not_rendered",
] as const;
export type FallbackReason = (typeof FALLBACK_REASONS)[number];

/** A sample's marks (FR-036): who asked. Every form says it is a sample, and that nothing happened on the stack. */
export interface SampleMark {
  /** The first 8 hex of the requester's operator token's SHA-256. */
  fingerprint: string;
}

/** Telegram's four entity types (FR-009): nothing that links, mentions, or hides text. */
export const ENTITY_TYPES = ["bold", "italic", "code", "pre"] as const;
export interface TelegramEntity {
  type: (typeof ENTITY_TYPES)[number];
  /** In UTF-16 code units of the text, as the Bot API counts them (FR-010). */
  offset: number;
  length: number;
}
export interface TelegramMessage {
  text: string;
  entities: TelegramEntity[];
}
export interface DesignedEmail {
  /** The severity's emoji, the kind's, and the plain text's first line (FR-016). */
  subject: string;
  html: string;
}

export interface DesignedRenderers {
  telegram?: (ctx: AlertContext, spec: AlertSpec, sample?: SampleMark) => TelegramMessage;
  email?: (ctx: AlertContext, spec: AlertSpec, sample?: SampleMark) => DesignedEmail;
}

/** The designs the gateway sends: each channel's renderer, once its user story registers it. */
export const RENDERERS: DesignedRenderers = {
  // User Story 1 (spec 011, plan §4): Telegram's message with its entities.
  telegram: designTelegram,
};

/** The bounds (FR-023; Q3's answer): Telegram's text in UTF-16 code units, the HTML part in UTF-8 bytes. */
export const TELEGRAM_MAX_UNITS = 2_000;
export const HTML_MAX_BYTES = 32 * 1_024;

/**
 * Telegram's check (FR-014; plan §4.3), before a message is used: every entity of an allowed type, with no other key;
 * offset ≥ 0, length ≥ 1, inside the text; no end on a low surrogate, which would split a pair; sorted, with no
 * overlap. A failure is render_failed; a text past its bound, and only that, is over_limit.
 */
export function checkTelegram(message: TelegramMessage): "ok" | "render_failed" | "over_limit" {
  const { text, entities } = message;
  if (typeof text !== "string" || text.length === 0 || !Array.isArray(entities)) return "render_failed";
  const lowSurrogate = (i: number): boolean => {
    const c = text.charCodeAt(i);
    return c >= 0xdc00 && c <= 0xdfff;
  };
  let end = 0;
  for (const e of entities) {
    if (e === null || typeof e !== "object") return "render_failed";
    const keys = Object.keys(e).sort().join(",");
    if (keys !== "length,offset,type") return "render_failed"; // a `language`, or anything else, is refused
    if (!(ENTITY_TYPES as readonly string[]).includes(e.type)) return "render_failed";
    if (!Number.isSafeInteger(e.offset) || !Number.isSafeInteger(e.length)) return "render_failed";
    if (e.offset < 0 || e.length < 1 || e.offset + e.length > text.length) return "render_failed";
    if (lowSurrogate(e.offset) || (e.offset + e.length < text.length && lowSurrogate(e.offset + e.length))) {
      return "render_failed";
    }
    if (e.offset < end) return "render_failed"; // out of order, or overlapping the one before
    end = e.offset + e.length;
  }
  return text.length > TELEGRAM_MAX_UNITS ? "over_limit" : "ok";
}

/** The email's check: a subject on one line, and an HTML part; the bound is its UTF-8 size. */
function checkEmail(email: DesignedEmail): "ok" | "render_failed" | "over_limit" {
  if (typeof email?.subject !== "string" || email.subject === "" || /[\r\n]/.test(email.subject))
    return "render_failed";
  if (typeof email.html !== "string" || email.html === "") return "render_failed";
  return Buffer.byteLength(email.html, "utf8") > HTML_MAX_BYTES ? "over_limit" : "ok";
}

export interface FormInput {
  /** The row's facts, or an in-memory alert's. */
  facts: unknown;
  dedupeKey: string;
  sample?: SampleMark;
  /** The form and fallback reason the channel's last attempt recorded, or null before its first. */
  form: AlertForm | null;
  fallback: FallbackReason | null;
}

export interface FormOptions {
  /** config/alerts.yaml's formats (FR-031), designed where absent. */
  formats: { telegram: AlertForm; email: AlertForm };
  renderers: DesignedRenderers;
}

/**
 * A channel's form. A plain one carries its reason, or null, and `kept` when an earlier attempt's fallback decided it,
 * so the fallback is counted once, in the attempt that fell back.
 */
export type Chosen<T> =
  { form: "designed"; designed: T } | { form: "plain"; reason: FallbackReason | null; kept: boolean };

export function formsFor(channel: "telegram", input: FormInput, opts: FormOptions): Chosen<TelegramMessage>;
export function formsFor(channel: "email", input: FormInput, opts: FormOptions): Chosen<DesignedEmail>;
export function formsFor(
  channel: "telegram" | "email",
  input: FormInput,
  opts: FormOptions,
): Chosen<TelegramMessage> | Chosen<DesignedEmail> {
  const plain = (reason: FallbackReason | null, kept = false) => ({ form: "plain" as const, reason, kept });
  const render = opts.renderers[channel];
  if (opts.formats[channel] === "plain" || render === undefined) return plain(null);
  if (input.form === "plain") return plain(input.fallback, true);
  const decoded = decodeFacts(input.facts, input.dedupeKey);
  if (decoded === undefined) return plain("not_rendered");
  let designed: TelegramMessage | DesignedEmail;
  let verdict: "ok" | "render_failed" | "over_limit";
  try {
    designed = render(decoded.ctx, decoded.spec, input.sample);
    verdict =
      channel === "telegram" ? checkTelegram(designed as TelegramMessage) : checkEmail(designed as DesignedEmail);
  } catch {
    return plain("render_failed");
  }
  if (verdict !== "ok") return plain(verdict);
  return { form: "designed", designed } as Chosen<TelegramMessage> | Chosen<DesignedEmail>;
}
