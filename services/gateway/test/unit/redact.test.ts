// The gateway's redactor (contracts/telemetry.md §6.3, §5.3): every secret shape is masked in text, and log
// records lose the keys that could hold a credential or a payload. Secrets are assembled here at run time from the
// recipes in test/fixtures/secret-shapes.json, so no file holds one.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CENSORED, REDACTED, SECRET_PATTERNS, censorKeys, redactSecrets } from "../../src/telemetry/redact.js";

type Part = string | { repeat: string; times: number };
interface Case {
  shape: string;
  before: string;
  parts: Part[];
  after: string;
}
const { cases } = JSON.parse(readFileSync(new URL("../fixtures/secret-shapes.json", import.meta.url), "utf8")) as {
  cases: Case[];
};
const assemble = (parts: Part[]): string =>
  parts.map((p) => (typeof p === "string" ? p : p.repeat.repeat(p.times))).join("");

describe("redactSecrets", () => {
  it.each(cases)("masks a $shape", ({ before, parts, after }) => {
    const secret = assemble(parts);
    const masked = redactSecrets(`${before}${secret}${after}`);
    expect(masked).toBe(`${before}${REDACTED}${after}`);
    expect(masked).not.toContain(secret);
  });

  it("covers every shape the contract lists, each with a recipe", () => {
    expect(SECRET_PATTERNS.map((p) => p.name)).toEqual([
      "PEM block",
      "Langfuse key",
      "AWS access key ID",
      "Telegram bot token",
      "operator token",
      "JWT",
      "Bearer or Basic credential",
      "URL credentials",
      "key=value secret",
    ]);
    for (const { name, pattern } of SECRET_PATTERNS) {
      const matched = cases.filter((c) => new RegExp(pattern.source, pattern.flags).test(assemble(c.parts)));
      expect(matched.length, name).toBeGreaterThan(0);
    }
  });

  it("masks every occurrence, and is idempotent", () => {
    const token = assemble([{ repeat: "1", times: 9 }, ":", { repeat: "Ab", times: 16 }]);
    const once = redactSecrets(`${token} and ${token}`);
    expect(once).toBe(`${REDACTED} and ${REDACTED}`);
    expect(redactSecrets(once)).toBe(once);
  });

  it("leaves ordinary text alone", () => {
    for (const text of [
      "Hello! This is the h4reet.ai stack's hello test answering.",
      "http://model-server:8080/v1/chat/completions",
      "the token count was 128, and the password field is empty",
      "Bearer of good news",
      "",
    ]) {
      expect(redactSecrets(text)).toBe(text);
    }
  });
});

describe("censorKeys (telemetry.md §5.3)", () => {
  it("censors keys that name a credential, at any depth and in any case", () => {
    const record = {
      event: "alert.retry",
      authorization: "x",
      nested: { apiToken: "x", Session_Secret: "x", cookie: { a: 1 }, API_KEY: "x", db_password: "x" },
      list: [{ password: "x" }, "plain"],
      error_class: "timeout",
    };
    expect(censorKeys(record)).toEqual({
      event: "alert.retry",
      authorization: CENSORED,
      nested: {
        apiToken: CENSORED,
        Session_Secret: CENSORED,
        cookie: CENSORED,
        API_KEY: CENSORED,
        db_password: CENSORED,
      },
      list: [{ password: CENSORED }, "plain"],
      error_class: "timeout",
    });
  });

  it("keeps a count whose key mentions tokens: call.completed's input_tokens and output_tokens", () => {
    expect(censorKeys({ input_tokens: 71, output_tokens: 14, max_tokens: 128, token_ok: true })).toEqual({
      input_tokens: 71,
      output_tokens: 14,
      max_tokens: 128,
      token_ok: true,
    });
    expect(censorKeys({ input_tokens: "71" })).toEqual({ input_tokens: CENSORED });
  });

  it("censors every payload key, whatever its value", () => {
    expect(
      censorKeys({ messages: [{ role: "user" }], prompt: 1, completion: null, answer: "a", system: "s", body: {} }),
    ).toEqual({
      messages: CENSORED,
      prompt: CENSORED,
      completion: CENSORED,
      answer: CENSORED,
      system: CENSORED,
      body: CENSORED,
    });
  });

  it("returns a copy, and survives a cycle", () => {
    const input: Record<string, unknown> = { password: "x", keep: { n: 1 } };
    input.self = input;
    const out = censorKeys(input) as Record<string, unknown>;
    expect(input.password).toBe("x");
    expect(out.password).toBe(CENSORED);
    expect(out.self).toBe("[circular]");
    expect(out.keep).toEqual({ n: 1 });
  });
});
