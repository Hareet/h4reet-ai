// What the gateway checks of its own environment at startup (contracts/env-files.md §4, §11; plan §5.8;
// config-files.md §4.4): each refusal exits 78 with a named reason, and no message carries a value.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatIssue } from "../../src/config/load.js";
import {
  DEVCPU_DUMMY_OPERATOR_SHA256,
  gatewayEnvFromFile,
  parseEnvFile,
  validateGatewayEnv,
  type EnvRefusal,
} from "../../src/config/validate-env.js";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const DEVCPU_VARS = `${REPO}deploy/env.agents/dev-cpu.vars`;

// Values built here, at run time: none of them is a credential.
const HASH = "ab".repeat(32);
const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

const REAL_CHANNELS = {
  TELEGRAM_API_BASE: "https://api.telegram.org",
  TELEGRAM_BOT_TOKEN: "present",
  TELEGRAM_CHAT_ID: "present",
  SMTP_HOST: "present",
  SMTP_PORT: "465",
  SMTP_TLS: "implicit",
  SMTP_USER: "present",
  SMTP_PASSWORD: "present",
  ALERT_EMAIL_FROM: "present",
  ALERT_EMAIL_TO: "present",
};

const PROD = {
  H4_STACK: "prod",
  H4_ENV: "prod",
  OPERATOR_TOKEN_SHA256: HASH,
  ALERT_DELIVERY: "real",
  ...REAL_CHANNELS,
  AWS_PROFILE: "h4reet-bedrock",
  GATEWAY_TEST_CLOCK: "0",
  GATEWAY_TEST_SYNTHETIC_SPEND: "0",
  TELEMETRY_PAYLOAD_SAMPLING: "off",
};

const DEV = {
  H4_STACK: "dev",
  H4_ENV: "dev",
  OPERATOR_TOKEN_SHA256: HASH,
  ALERT_DELIVERY: "standin",
  TELEGRAM_API_BASE: "https://api.telegram.org",
  GATEWAY_TEST_CLOCK: "1",
  GATEWAY_TEST_SYNTHETIC_SPEND: "1",
  TELEMETRY_PAYLOAD_SAMPLING: "off",
  AWS_PROFILE: "none",
};

const DEV_CPU = { ...DEV, H4_STACK: "dev-cpu", OPERATOR_TOKEN_SHA256: DEVCPU_DUMMY_OPERATOR_SHA256 };

const reasons = (refusals: EnvRefusal[]): [string, string][] => refusals.map((r) => [r.reason, r.key]);

describe("a valid environment", () => {
  it("starts prod, dev, and dev-cpu", () => {
    expect(validateGatewayEnv(PROD)).toEqual([]);
    expect(validateGatewayEnv(DEV)).toEqual([]);
    expect(validateGatewayEnv(DEV_CPU)).toEqual([]);
  });

  it("treats unset switches as off, as compose's ${KEY:-0} would", () => {
    const bare = { ...PROD, GATEWAY_TEST_CLOCK: undefined, GATEWAY_TEST_SYNTHETIC_SPEND: undefined };
    expect(validateGatewayEnv({ ...bare, TELEMETRY_PAYLOAD_SAMPLING: undefined })).toEqual([]);
    expect(validateGatewayEnv({ ...bare, TELEMETRY_PAYLOAD_SAMPLING: "" })).toEqual([]);
  });
});

describe("the stack's identity", () => {
  it("refuses an H4_STACK that isn't prod, dev, or dev-cpu", () => {
    expect(reasons(validateGatewayEnv({ ...DEV, H4_STACK: "staging" }))).toEqual([["invalid_stack", "H4_STACK"]]);
    expect(reasons(validateGatewayEnv({ ...DEV, H4_STACK: undefined }))).toEqual([["invalid_stack", "H4_STACK"]]);
    // Not through the prototype either.
    expect(reasons(validateGatewayEnv({ ...DEV, H4_STACK: "constructor" }))).toEqual([["invalid_stack", "H4_STACK"]]);
  });

  it("refuses an H4_ENV that isn't the stack's class", () => {
    expect(
      reasons(
        validateGatewayEnv({
          ...DEV,
          H4_ENV: "prod",
          ALERT_DELIVERY: "real",
          ...REAL_CHANNELS,
          AWS_PROFILE: "p",
          GATEWAY_TEST_CLOCK: "0",
          GATEWAY_TEST_SYNTHETIC_SPEND: "0",
        }),
      ),
    ).toEqual([["stack_env_mismatch", "H4_ENV"]]);
    expect(reasons(validateGatewayEnv({ ...PROD, H4_ENV: "dev" }))).toEqual([["stack_env_mismatch", "H4_ENV"]]);
    expect(reasons(validateGatewayEnv({ ...DEV_CPU, H4_ENV: "dev-cpu" }))).toContainEqual([
      "stack_env_mismatch",
      "H4_ENV",
    ]);
  });
});

describe("the dev-only switches (D1–D3)", () => {
  it("refuses the test clock and synthetic spend outside H4_ENV=dev", () => {
    expect(reasons(validateGatewayEnv({ ...PROD, GATEWAY_TEST_CLOCK: "1" }))).toEqual([
      ["dev_switch_outside_dev", "GATEWAY_TEST_CLOCK"],
    ]);
    expect(reasons(validateGatewayEnv({ ...PROD, GATEWAY_TEST_SYNTHETIC_SPEND: "1" }))).toEqual([
      ["dev_switch_outside_dev", "GATEWAY_TEST_SYNTHETIC_SPEND"],
    ]);
  });

  it("refuses payload sampling outside H4_ENV=dev, and allows it in dev", () => {
    expect(reasons(validateGatewayEnv({ ...PROD, TELEMETRY_PAYLOAD_SAMPLING: "on" }))).toEqual([
      ["dev_switch_outside_dev", "TELEMETRY_PAYLOAD_SAMPLING"],
    ]);
    expect(validateGatewayEnv({ ...DEV, TELEMETRY_PAYLOAD_SAMPLING: "on" })).toEqual([]);
  });

  it("refuses any value but those listed, even in dev", () => {
    expect(reasons(validateGatewayEnv({ ...DEV, GATEWAY_TEST_CLOCK: "yes" }))).toEqual([
      ["invalid_switch_value", "GATEWAY_TEST_CLOCK"],
    ]);
    expect(reasons(validateGatewayEnv({ ...DEV, GATEWAY_TEST_SYNTHETIC_SPEND: "true" }))).toEqual([
      ["invalid_switch_value", "GATEWAY_TEST_SYNTHETIC_SPEND"],
    ]);
    expect(reasons(validateGatewayEnv({ ...DEV, TELEMETRY_PAYLOAD_SAMPLING: "1" }))).toEqual([
      ["invalid_switch_value", "TELEMETRY_PAYLOAD_SAMPLING"],
    ]);
  });
});

describe("alert delivery (config-files.md §4.4)", () => {
  it("alert_delivery_not_real: prod refuses the stand-ins", () => {
    expect(reasons(validateGatewayEnv({ ...PROD, ALERT_DELIVERY: "standin" }))).toEqual([
      ["alert_delivery_not_real", "ALERT_DELIVERY"],
    ]);
  });

  it("refuses a delivery mode that is neither real nor standin", () => {
    expect(reasons(validateGatewayEnv({ ...DEV, ALERT_DELIVERY: "none" }))).toEqual([
      ["invalid_alert_delivery", "ALERT_DELIVERY"],
    ]);
    expect(reasons(validateGatewayEnv({ ...DEV, ALERT_DELIVERY: undefined }))).toEqual([
      ["invalid_alert_delivery", "ALERT_DELIVERY"],
    ]);
  });

  it("telegram_base_not_bot_api: real delivery goes to exactly https://api.telegram.org", () => {
    for (const base of ["https://api.telegram.org/", "http://api.telegram.org", "https://telegram-standin:8080", ""]) {
      expect(reasons(validateGatewayEnv({ ...PROD, TELEGRAM_API_BASE: base })), base).toEqual([
        ["telegram_base_not_bot_api", "TELEGRAM_API_BASE"],
      ]);
    }
    // The dev stack's real run, the Author's DELIVERY=real overlay, is held to the same rules.
    expect(
      reasons(validateGatewayEnv({ ...DEV, ALERT_DELIVERY: "real", ...REAL_CHANNELS, TELEGRAM_API_BASE: "http://x" })),
    ).toEqual([["telegram_base_not_bot_api", "TELEGRAM_API_BASE"]]);
  });

  it("smtp_without_tls: implicit TLS on 465, or STARTTLS on 587", () => {
    expect(validateGatewayEnv({ ...PROD, SMTP_TLS: "starttls", SMTP_PORT: "587" })).toEqual([]);
    for (const [tls, port] of [
      ["none", "25"],
      ["implicit", "587"],
      ["starttls", "465"],
      ["IMPLICIT", "465"],
      ["implicit", "25"],
    ]) {
      expect(reasons(validateGatewayEnv({ ...PROD, SMTP_TLS: tls, SMTP_PORT: port })), `${tls} ${port}`).toEqual([
        ["smtp_without_tls", "SMTP_TLS"],
      ]);
    }
  });

  it("missing_alert_env: real delivery needs every channel key, each named", () => {
    const refusals = validateGatewayEnv({ ...PROD, SMTP_PASSWORD: "", TELEGRAM_CHAT_ID: undefined });
    expect(reasons(refusals)).toEqual([
      ["missing_alert_env", "TELEGRAM_CHAT_ID"],
      ["missing_alert_env", "SMTP_PASSWORD"],
    ]);
  });

  it("ignores the real channel keys in stand-in mode, as dev's optional keys may stay empty", () => {
    expect(validateGatewayEnv({ ...DEV, TELEGRAM_API_BASE: "", SMTP_TLS: "none" })).toEqual([]);
  });
});

describe("the operator credential's hash (data-model.md §5)", () => {
  it("operator_hash_malformed: 64 lowercase hex characters", () => {
    for (const value of [HASH.toUpperCase(), HASH.slice(1), `${HASH}0`, "", undefined, `sha256:${HASH.slice(7)}`]) {
      expect(reasons(validateGatewayEnv({ ...DEV, OPERATOR_TOKEN_SHA256: value })), String(value)).toEqual([
        ["operator_hash_malformed", "OPERATOR_TOKEN_SHA256"],
      ]);
    }
  });

  it("operator_hash_is_dummy: prod refuses the published dev-cpu dummy's hash; dev and dev-cpu may use it", () => {
    expect(reasons(validateGatewayEnv({ ...PROD, OPERATOR_TOKEN_SHA256: DEVCPU_DUMMY_OPERATOR_SHA256 }))).toEqual([
      ["operator_hash_is_dummy", "OPERATOR_TOKEN_SHA256"],
    ]);
    expect(validateGatewayEnv(DEV_CPU)).toEqual([]);
    expect(validateGatewayEnv({ ...DEV, OPERATOR_TOKEN_SHA256: DEVCPU_DUMMY_OPERATOR_SHA256 })).toEqual([]);
  });

  it("holds the dummy's hash as a constant in the source", () => {
    expect(DEVCPU_DUMMY_OPERATOR_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.skipIf(!existsSync(DEVCPU_VARS))(
    "matches the dummy token in deploy/env.agents/dev-cpu.vars (skipped until tasks.md T031 creates it)",
    () => {
      const { vars, issues } = parseEnvFile(readFileSync(DEVCPU_VARS, "utf8"), "deploy/env.agents/dev-cpu.vars");
      expect(issues).toEqual([]);
      const token = vars.H4_DEVCPU_OPERATOR_TOKEN ?? "";
      expect(token).toMatch(/^h4op_devcpu_[A-Za-z0-9_-]{43}$/);
      expect(vars.OPERATOR_TOKEN_SHA256, "dev-cpu.vars' hash is its own token's").toBe(sha256(token));
      expect(DEVCPU_DUMMY_OPERATOR_SHA256, "set the constant in src/config/validate-env.ts to this hash").toBe(
        sha256(token),
      );
    },
  );
});

describe("prod's AWS profile", () => {
  it("aws_profile_unset: prod's gateway runs as the runtime identity's profile", () => {
    for (const value of [undefined, "", "none"]) {
      expect(reasons(validateGatewayEnv({ ...PROD, AWS_PROFILE: value })), String(value)).toEqual([
        ["aws_profile_unset", "AWS_PROFILE"],
      ]);
    }
    expect(validateGatewayEnv({ ...DEV, AWS_PROFILE: undefined })).toEqual([]);
  });
});

describe("messages", () => {
  it("name keys and never carry a value", () => {
    const secretish = "zz-value-that-must-not-appear-zz";
    const refusals = [
      ...validateGatewayEnv({
        ...DEV,
        H4_STACK: secretish,
        H4_ENV: secretish,
        ALERT_DELIVERY: secretish,
        OPERATOR_TOKEN_SHA256: secretish,
        GATEWAY_TEST_CLOCK: secretish,
        TELEMETRY_PAYLOAD_SAMPLING: secretish,
      }),
      ...validateGatewayEnv({ ...PROD, TELEGRAM_API_BASE: secretish, SMTP_TLS: secretish, AWS_PROFILE: "" }),
    ];
    expect(new Set(refusals.map((r) => r.reason)).size).toBe(9);
    expect(JSON.stringify(refusals)).not.toContain(secretish);
  });
});

describe("template mode, for validate-config (config-files.md §5)", () => {
  it("counts __GENERATE__ and __ASK__ as present values of the right shape", () => {
    const template = {
      ...PROD,
      OPERATOR_TOKEN_SHA256: "__ASK__",
      TELEGRAM_BOT_TOKEN: "__ASK__",
      SMTP_PORT: "__ASK__",
      SMTP_TLS: "__ASK__",
      SMTP_PASSWORD: "__GENERATE__",
    };
    expect(validateGatewayEnv(template, { template: true })).toEqual([]);
    expect(reasons(validateGatewayEnv(template))).toEqual([
      ["smtp_without_tls", "SMTP_TLS"],
      ["operator_hash_malformed", "OPERATOR_TOKEN_SHA256"],
    ]);
  });

  it("still refuses a template that enables a dev-only switch on prod (FR-036)", () => {
    expect(reasons(validateGatewayEnv({ ...PROD, GATEWAY_TEST_CLOCK: "1" }, { template: true }))).toEqual([
      ["dev_switch_outside_dev", "GATEWAY_TEST_CLOCK"],
    ]);
  });
});

describe("the env-file grammar (env-files.md §1.1)", () => {
  it("reads KEY=VALUE lines, comments, blank lines, and single-quoted values", () => {
    const { vars, issues } = parseEnvFile(
      "# a comment\n\nH4_STACK=dev\nEMPTY=\nQUOTED='a$b#c d'\nURL=http://model-server:8080/v1\n",
      "x.vars",
    );
    expect(issues).toEqual([]);
    expect(vars).toEqual({ H4_STACK: "dev", EMPTY: "", QUOTED: "a$b#c d", URL: "http://model-server:8080/v1" });
  });

  it("refuses what compose and preflight could read differently, by key and line, never with the value", () => {
    const cases: [string, string][] = [
      ["export H4_STACK=dev", "x.vars: line 1: no export"],
      ["H4_STACK = dev", "x.vars: line 1: not KEY=VALUE"],
      ["h4_stack=dev", "x.vars: line 1: not KEY=VALUE"],
      [
        "H4_STACK=dev prod",
        "x.vars: line 1: H4_STACK: an unquoted value can't hold whitespace, $, quotes, a backslash, or #",
      ],
      [
        'H4_STACK="dev"',
        "x.vars: line 1: H4_STACK: an unquoted value can't hold whitespace, $, quotes, a backslash, or #",
      ],
      [
        "H4_STACK=$OTHER",
        "x.vars: line 1: H4_STACK: an unquoted value can't hold whitespace, $, quotes, a backslash, or #",
      ],
      ["H4_STACK='${OTHER}'", "x.vars: line 1: H4_STACK: values are never interpolated: no ${...}"],
      ["H4_STACK='it''s'", "x.vars: line 1: H4_STACK: a single-quoted value can't hold a quote"],
      [
        "H4_STACK=dev\r",
        "x.vars: line 1: H4_STACK: an unquoted value can't hold whitespace, $, quotes, a backslash, or #",
      ],
      ["H4_STACK=dev\nH4_STACK=prod", "x.vars: line 2: H4_STACK: appears twice"],
      ["  # an indented comment", "x.vars: line 1: not KEY=VALUE"],
    ];
    for (const [text, line] of cases) {
      const lines = parseEnvFile(text, "x.vars").issues.map(formatIssue);
      expect(lines, text).toEqual([line]);
      expect(lines.join("\n")).not.toMatch(/OTHER|prod\b|it''s/);
    }
  });
});

describe("the gateway's environment from an env file (env-files.md §4, as compose maps it)", () => {
  it("renames the keys compose renames, and defaults the switches the way ${KEY:-0} does", () => {
    const env = gatewayEnvFromFile({
      H4_STACK: "prod",
      H4_ENV: "prod",
      MODEL_ALIAS: "the-model",
      GATEWAY_AWS_PROFILE: "h4reet-bedrock",
      LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1",
      TELEMETRY_PAYLOAD_SAMPLING: "off",
      GATEWAY_DB_PASSWORD: "not-read-here",
    });
    expect(env.LOCAL_MODEL_NAME).toBe("the-model");
    expect(env.AWS_PROFILE).toBe("h4reet-bedrock");
    expect(env.GATEWAY_TEST_CLOCK).toBe("0");
    expect(env.GATEWAY_TEST_SYNTHETIC_SPEND).toBe("0");
    expect(env.TELEMETRY_PAYLOAD_SAMPLING).toBe("off");
    expect("GATEWAY_AWS_PROFILE" in env || "MODEL_ALIAS" in env).toBe(false);
    expect(gatewayEnvFromFile({ GATEWAY_AWS_PROFILE: "" }).AWS_PROFILE).toBe("none");
    expect(gatewayEnvFromFile({ GATEWAY_TEST_CLOCK: "1" }).GATEWAY_TEST_CLOCK).toBe("1");
  });
});
