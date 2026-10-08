// Redaction in the gateway (contracts/telemetry.md §5.3, §6.3).
//
// - redactSecrets masks the known secret shapes in text: the list the collector's redaction processor also applies,
//   so the collector is the second layer, not the only one. It is what the gateway runs on payloads before a dev
//   span samples them (§3.4).
// - censorKeys is the logger's key rule: any key, at any depth, whose name says it may hold a credential, and every
//   payload key, is replaced, because pino's own `redact` matches whole path segments only.

export const REDACTED = "****";
export const CENSORED = "[redacted]";

export interface SecretPattern {
  readonly name: string;
  /** Global, so every occurrence is masked. */
  readonly pattern: RegExp;
}

/**
 * telemetry.md §6.3's patterns, in RE2 there, as JavaScript here: RE2's leading (?i) becomes the `i` flag. The PEM
 * block goes first, because it spans lines and holds text the shorter patterns would split.
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: "PEM block", pattern: /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g },
  { name: "Langfuse key", pattern: /(?:sk|pk)-lf-[0-9A-Za-z-]{8,}/g },
  { name: "AWS access key ID", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "Telegram bot token", pattern: /(?:bot)?[0-9]{6,12}:[A-Za-z0-9_-]{30,}/g },
  { name: "operator token", pattern: /h4op_(?:prod|dev|devcpu)_[A-Za-z0-9_-]{43}/g },
  { name: "JWT", pattern: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { name: "Bearer or Basic credential", pattern: /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi },
  { name: "URL credentials", pattern: /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/g },
  { name: "key=value secret", pattern: /\b(?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi },
];

/** Every secret shape in `text`, masked with ****. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const { pattern } of SECRET_PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

const CREDENTIAL_KEY = /token|password|secret|authorization|cookie|api_key/i;
const PAYLOAD_KEYS = new Set(["messages", "prompt", "completion", "answer", "system", "body"]);

/**
 * A copy of `value` with every credential-named key and every payload key censored. A number or a boolean under a
 * credential-named key is kept: it can't be a credential, and call.completed's input_tokens and output_tokens are
 * counts (§5.2).
 */
export function censorKeys<T>(value: T): T {
  return censor(value, new WeakSet()) as T;
}

/** `ancestors` holds the objects on the path from the root, so only a real cycle reads as one. */
function censor(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  if (ancestors.has(value)) return "[circular]";
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((v) => censor(v, ancestors));
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      const keep = typeof v === "number" || typeof v === "boolean";
      out[key] = PAYLOAD_KEYS.has(key) || (CREDENTIAL_KEY.test(key) && !keep) ? CENSORED : censor(v, ancestors);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}
