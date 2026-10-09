// What the gateway checks of its own environment at startup, and exits 78 for (contracts/env-files.md §4, §11;
// plan §5.8; config-files.md §4.4). Preflight checks the same things earlier, but the gateway never relies on it:
// a container can be started without `make up`. Every message names keys, never a value.
import type { ConfigIssue } from "./load.js";

/**
 * SHA-256 of the dev-cpu stack's public dummy operator token, H4_DEVCPU_OPERATOR_TOKEN in
 * deploy/env.agents/dev-cpu.vars. Prod refuses to start with it (data-model.md §5); validate-env.test.ts and
 * validate-config check this constant against that file. Its name carries no credential keyword, so gitleaks'
 * generic-api-key rule doesn't read a public hash as a secret.
 */
export const DEVCPU_DUMMY_OPERATOR_SHA256 = "a2d31213fa06fe88ace640f1a44aa2a1ae9131e6cfed89384db03311a3217f48";

export type GatewayEnv = Readonly<Record<string, string | undefined>>;

export interface EnvRefusal {
  /** The reason code (env-files.md §11). */
  reason: string;
  /** The env key, never its value. */
  key: string;
  message: string;
}

export interface ValidateEnvOptions {
  /** validate-config's mode for env templates: __GENERATE__ and __ASK__ count as present values of the right shape. */
  template?: boolean;
}

const STACK_CLASS: Readonly<Record<string, "prod" | "dev">> = { prod: "prod", dev: "dev", "dev-cpu": "dev" };
const TELEGRAM_BOT_API = "https://api.telegram.org";
/** config-files.md §4.4's missing_alert_env list, in its order. */
export const REAL_DELIVERY_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "ALERT_EMAIL_FROM",
  "ALERT_EMAIL_TO",
] as const;

const isTemplateValue = (v: string | undefined): boolean => v === "__GENERATE__" || v === "__ASK__";
/** What a SCRAM verifier takes unchanged (SASLprep): printable ASCII, no space. */
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

export function validateGatewayEnv(env: GatewayEnv, opts: ValidateEnvOptions = {}): EnvRefusal[] {
  const out: EnvRefusal[] = [];
  const refuse = (reason: string, key: string, message: string): void => void out.push({ reason, key, message });
  /** In template mode, a placeholder stands for a value of the right shape. */
  const shaped = (key: string, test: (v: string) => boolean): boolean => {
    const v = env[key];
    return (opts.template === true && isTemplateValue(v)) || (v !== undefined && test(v));
  };

  // The stack and its class: H4_ENV is prod for prod, and dev for dev and dev-cpu.
  const stack = env.H4_STACK;
  const stackClass = stack !== undefined && Object.hasOwn(STACK_CLASS, stack) ? STACK_CLASS[stack] : undefined;
  if (stackClass === undefined) refuse("invalid_stack", "H4_STACK", "H4_STACK must be prod, dev, or dev-cpu");
  const envClass = env.H4_ENV;
  if (envClass !== "prod" && envClass !== "dev") {
    refuse("stack_env_mismatch", "H4_ENV", "H4_ENV must be prod or dev: the class of H4_STACK");
  } else if (stackClass !== undefined && envClass !== stackClass) {
    refuse(
      "stack_env_mismatch",
      "H4_ENV",
      "H4_ENV must be the class of H4_STACK: prod for prod, dev for dev and dev-cpu",
    );
  }
  const dev = envClass === "dev";
  const prod = envClass === "prod";

  // The dev-only switches (env-files.md §7.1, D1–D3). Anywhere but H4_ENV=dev they would get around FR-034.
  for (const key of ["GATEWAY_TEST_CLOCK", "GATEWAY_TEST_SYNTHETIC_SPEND"]) {
    const v = env[key];
    if (v !== undefined && v !== "" && v !== "0" && v !== "1") {
      refuse("invalid_switch_value", key, `${key} must be unset, 0, or 1`);
    } else if (v === "1" && !dev) {
      refuse(
        "dev_switch_outside_dev",
        key,
        `${key} is on outside H4_ENV=dev; the test machinery exists only in dev (FR-036)`,
      );
    }
  }
  const sampling = env.TELEMETRY_PAYLOAD_SAMPLING;
  if (sampling !== undefined && sampling !== "" && sampling !== "off" && sampling !== "on") {
    refuse("invalid_switch_value", "TELEMETRY_PAYLOAD_SAMPLING", "TELEMETRY_PAYLOAD_SAMPLING must be off or on");
  } else if (sampling === "on" && !dev) {
    refuse(
      "dev_switch_outside_dev",
      "TELEMETRY_PAYLOAD_SAMPLING",
      "TELEMETRY_PAYLOAD_SAMPLING is on outside H4_ENV=dev; payload sampling is dev only (FR-029)",
    );
  }

  // Alert delivery (config-files.md §4.4). Stand-in mode uses alerts.yaml's standin endpoints and ignores the rest.
  const delivery = env.ALERT_DELIVERY;
  if (delivery !== "real" && delivery !== "standin") {
    refuse("invalid_alert_delivery", "ALERT_DELIVERY", "ALERT_DELIVERY must be real or standin");
  } else if (prod && delivery !== "real") {
    refuse(
      "alert_delivery_not_real",
      "ALERT_DELIVERY",
      "prod's ALERT_DELIVERY must be real; prod refuses the stand-ins",
    );
  }
  if (delivery === "real") {
    if (env.TELEGRAM_API_BASE !== TELEGRAM_BOT_API) {
      refuse(
        "telegram_base_not_bot_api",
        "TELEGRAM_API_BASE",
        `with ALERT_DELIVERY=real, TELEGRAM_API_BASE must be exactly ${TELEGRAM_BOT_API}`,
      );
    }
    const tls = env.SMTP_TLS;
    const portFits = (want: string): boolean => shaped("SMTP_PORT", (p) => p === want);
    const tlsOk =
      (opts.template === true && isTemplateValue(tls)) ||
      (tls === "implicit" && portFits("465")) ||
      (tls === "starttls" && portFits("587"));
    if (!tlsOk) {
      refuse(
        "smtp_without_tls",
        "SMTP_TLS",
        "with ALERT_DELIVERY=real, SMTP_TLS must be implicit with SMTP_PORT 465, or starttls with SMTP_PORT 587",
      );
    }
    for (const key of REAL_DELIVERY_KEYS) {
      if (!shaped(key, (v) => v !== ""))
        refuse("missing_alert_env", key, `with ALERT_DELIVERY=real, ${key} must be set`);
    }
  }

  // The operator credential's hash (data-model.md §5).
  if (!shaped("OPERATOR_TOKEN_SHA256", (v) => /^[0-9a-f]{64}$/.test(v))) {
    refuse(
      "operator_hash_malformed",
      "OPERATOR_TOKEN_SHA256",
      "OPERATOR_TOKEN_SHA256 must be 64 lowercase hex characters",
    );
  } else if (prod && env.OPERATOR_TOKEN_SHA256 === DEVCPU_DUMMY_OPERATOR_SHA256) {
    refuse(
      "operator_hash_is_dummy",
      "OPERATOR_TOKEN_SHA256",
      "OPERATOR_TOKEN_SHA256 is the published dev-cpu dummy's hash; prod refuses it",
    );
  }

  // grafana_ro's password becomes a SCRAM-SHA-256 verifier at every start (data-model.md §2.9), which takes printable
  // ASCII only. The store would refuse any other value at every retry, unreachable for good, so the gateway refuses
  // it here. Unset or empty, the role's login stays off.
  const grafanaRo = env.GATEWAY_GRAFANA_RO_PASSWORD;
  if (grafanaRo !== undefined && grafanaRo !== "" && !PRINTABLE_ASCII.test(grafanaRo)) {
    refuse(
      "grafana_ro_password_invalid",
      "GATEWAY_GRAFANA_RO_PASSWORD",
      "GATEWAY_GRAFANA_RO_PASSWORD must be printable ASCII without spaces, as init_env.py's 64 hex is",
    );
  }

  // Prod's AWS profile: compose sets AWS_PROFILE from the env file's GATEWAY_AWS_PROFILE, or `none` without it.
  if (prod && (env.AWS_PROFILE === undefined || env.AWS_PROFILE === "" || env.AWS_PROFILE === "none")) {
    refuse(
      "aws_profile_unset",
      "AWS_PROFILE",
      "AWS_PROFILE, from the env file's GATEWAY_AWS_PROFILE, is unset; prod's gateway runs as the runtime identity's profile",
    );
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Env files as data (env-files.md §1.1): preflight, init_env.py, validate-config, and the CLI parse them alike.
// ---------------------------------------------------------------------------------------------------------------

const LINE = /^([A-Z][A-Z0-9_]*)=(.*)$/s; // s: a stray \r is part of the value, and refused there
const UNQUOTED = /^[^\s$"'`\\#]*$/;
const SINGLE_QUOTED = /^'([^'\n]*)'$/;

/** KEY=VALUE lines, never sourced. Problems name the line and the key, never the value. */
export function parseEnvFile(text: string, file: string): { vars: Record<string, string>; issues: ConfigIssue[] } {
  const vars: Record<string, string> = {};
  const issues: ConfigIssue[] = [];
  const problem = (line: number, key: string | undefined, message: string): void =>
    void issues.push({
      severity: "error",
      file,
      path: key === undefined ? `line ${line}` : `line ${line}: ${key}`,
      rule: "ENV_GRAMMAR",
      message,
    });
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  lines.forEach((raw, i) => {
    const n = i + 1;
    if (raw.trim() === "" || raw.startsWith("#")) return;
    if (/^export\s/.test(raw)) return problem(n, undefined, "no export");
    const m = LINE.exec(raw);
    if (!m) return problem(n, undefined, "not KEY=VALUE");
    const key = m[1] as string;
    const value = m[2] as string;
    if (key in vars) return problem(n, key, "appears twice");
    if (value.startsWith("'")) {
      const q = SINGLE_QUOTED.exec(value);
      if (!q) return problem(n, key, "a single-quoted value can't hold a quote");
      if ((q[1] as string).includes("${")) return problem(n, key, "values are never interpolated: no ${...}");
      vars[key] = q[1] as string;
    } else if (UNQUOTED.test(value)) {
      vars[key] = value;
    } else {
      problem(n, key, "an unquoted value can't hold whitespace, $, quotes, a backslash, or #");
    }
  });
  return { vars, issues };
}

/**
 * The gateway's environment as deploy/compose.yaml builds it from an env file (env-files.md §4: "Set by compose on
 * the gateway"): only the keys the gateway reads, under the names it reads them by.
 */
export function gatewayEnvFromFile(
  file: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const orDefault = (key: string, fallback: string): string => {
    const v = file[key];
    return v === undefined || v === "" ? fallback : v; // compose's ${KEY:-default}
  };
  const env: Record<string, string | undefined> = {};
  for (const key of [
    "H4_STACK",
    "H4_ENV",
    "H4_LANGFUSE_PORT",
    "H4_GRAFANA_PORT",
    "OPERATOR_TOKEN_SHA256",
    "ALERT_DELIVERY",
    "TELEGRAM_API_BASE",
    ...REAL_DELIVERY_KEYS,
    "SMTP_TLS",
    "TELEMETRY_PAYLOAD_SAMPLING",
    "LOCAL_MODEL_BASE_URL",
    "GATEWAY_DB_PASSWORD",
    "GATEWAY_GRAFANA_RO_PASSWORD",
  ]) {
    env[key] = file[key];
  }
  env.LOCAL_MODEL_NAME = file.MODEL_ALIAS;
  env.AWS_PROFILE = orDefault("GATEWAY_AWS_PROFILE", "none");
  env.GATEWAY_TEST_CLOCK = orDefault("GATEWAY_TEST_CLOCK", "0");
  env.GATEWAY_TEST_SYNTHETIC_SPEND = orDefault("GATEWAY_TEST_SYNTHETIC_SPEND", "0");
  return env;
}
