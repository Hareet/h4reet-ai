// Each channel's form (spec 011, FR-023, FR-025, FR-028, FR-030, FR-031; plan §6.1; tasks.md T006), with stub designed
// renderers: the chooser's table in its order. The switch at plain, or no renderer registered; the row already plain,
// its reason kept; facts that don't decode, not_rendered; a renderer that throws, or output that fails its check,
// render_failed; output past its bound, over_limit, through a renderer seam that returns a long form; otherwise
// designed. A designed form is never cut.
import { describe, expect, it, vi } from "vitest";

import { factsOf } from "../../src/alerts/facts.js";
import type { AlertContext, AlertSpec } from "../../src/alerts/format.js";
import {
  HTML_MAX_BYTES,
  TELEGRAM_MAX_UNITS,
  formsFor,
  type DesignedEmail,
  type DesignedRenderers,
  type FormInput,
  type TelegramMessage,
} from "../../src/alerts/forms.js";
import { everyKind } from "../helpers/alert-cases.js";

const [CTX, SPEC] = everyKind()[3] as [AlertContext, AlertSpec]; // the trip
const KEY = CTX.dedupeKey;

const goodTelegram = (): TelegramMessage => ({
  text: "Critical\nKILL SWITCH",
  entities: [{ type: "bold", offset: 9, length: 11 }],
});
const goodEmail = (): DesignedEmail => ({
  subject: "🔴 🛑 [h4reet.ai prod] KILL SWITCH",
  html: "<!DOCTYPE html><html></html>",
});

const designs = (o: Partial<DesignedRenderers> = {}): DesignedRenderers => ({
  telegram: vi.fn(() => goodTelegram()),
  email: vi.fn(() => goodEmail()),
  ...o,
});
const input = (o: Partial<FormInput> = {}): FormInput => ({
  facts: factsOf(CTX, SPEC),
  dedupeKey: KEY,
  form: null,
  fallback: null,
  ...o,
});
const DESIGNED = { telegram: "designed", email: "designed" } as const;

describe("the chooser's table, in its order (plan §6.1)", () => {
  it("sends plain with no fallback while the switch says plain, whatever else holds (FR-031)", () => {
    const renderers = designs();
    expect(formsFor("telegram", input(), { formats: { telegram: "plain", email: "designed" }, renderers })).toEqual({
      form: "plain",
      reason: null,
      kept: false,
    });
    expect(formsFor("email", input(), { formats: { telegram: "designed", email: "plain" }, renderers })).toEqual({
      form: "plain",
      reason: null,
      kept: false,
    });
    // The switch comes first: a row that fell back before, or facts that don't decode, change nothing.
    expect(
      formsFor("telegram", input({ form: "plain", fallback: "entities_refused", facts: { kind: "warn" } }), {
        formats: { telegram: "plain", email: "plain" },
        renderers,
      }),
    ).toEqual({ form: "plain", reason: null, kept: false });
    expect(renderers.telegram).not.toHaveBeenCalled();
  });

  it("treats a channel with no designed renderer registered as the switch at plain", () => {
    expect(formsFor("telegram", input(), { formats: DESIGNED, renderers: {} })).toEqual({
      form: "plain",
      reason: null,
      kept: false,
    });
    expect(formsFor("email", input(), { formats: DESIGNED, renderers: {} })).toEqual({
      form: "plain",
      reason: null,
      kept: false,
    });
  });

  it("keeps a row that fell back plain on every later attempt, with its earlier reason (FR-028)", () => {
    const renderers = designs();
    expect(
      formsFor("telegram", input({ form: "plain", fallback: "entities_refused" }), { formats: DESIGNED, renderers }),
    ).toEqual({ form: "plain", reason: "entities_refused", kept: true });
    expect(
      formsFor("email", input({ form: "plain", fallback: "message_refused" }), { formats: DESIGNED, renderers }),
    ).toEqual({ form: "plain", reason: "message_refused", kept: true });
    expect(renderers.telegram).not.toHaveBeenCalled();
    expect(renderers.email).not.toHaveBeenCalled();
  });

  it("sends plain as not_rendered when the facts don't decode, as a row queued before the change (FR-030)", () => {
    const renderers = designs();
    for (const facts of [{ kind: "warn" }, null, { ...factsOf(CTX, SPEC), facts_version: 1 }]) {
      expect(formsFor("telegram", input({ facts }), { formats: DESIGNED, renderers })).toEqual({
        form: "plain",
        reason: "not_rendered",
        kept: false,
      });
      expect(formsFor("email", input({ facts }), { formats: DESIGNED, renderers })).toEqual({
        form: "plain",
        reason: "not_rendered",
        kept: false,
      });
    }
    expect(renderers.telegram).not.toHaveBeenCalled();
  });

  it("sends plain as render_failed when a renderer throws (FR-025)", () => {
    const throwing = designs({
      telegram: () => {
        throw new Error("a design bug");
      },
      email: () => {
        throw new TypeError("another");
      },
    });
    expect(formsFor("telegram", input(), { formats: DESIGNED, renderers: throwing })).toEqual({
      form: "plain",
      reason: "render_failed",
      kept: false,
    });
    expect(formsFor("email", input(), { formats: DESIGNED, renderers: throwing })).toEqual({
      form: "plain",
      reason: "render_failed",
      kept: false,
    });
  });

  it("sends plain as render_failed when Telegram's output fails its check (FR-014)", () => {
    const bad: TelegramMessage[] = [
      { text: "abc", entities: [{ type: "bold", offset: 2, length: 5 }] },
      { text: "abc", entities: [{ type: "url" as "bold", offset: 0, length: 1 }] },
      { text: "", entities: [] },
    ];
    for (const message of bad) {
      expect(
        formsFor("telegram", input(), { formats: DESIGNED, renderers: designs({ telegram: () => message }) }),
        JSON.stringify(message),
      ).toEqual({ form: "plain", reason: "render_failed", kept: false });
    }
    const emptyHtml = designs({ email: () => ({ subject: "s", html: "" }) });
    expect(formsFor("email", input(), { formats: DESIGNED, renderers: emptyHtml })).toEqual({
      form: "plain",
      reason: "render_failed",
      kept: false,
    });
  });

  it("sends plain as over_limit when a form passes its bound, and never cuts it (FR-023)", () => {
    const long = designs({
      telegram: () => ({ text: "x".repeat(TELEGRAM_MAX_UNITS + 1), entities: [] }),
      email: () => ({ subject: "s", html: `<!DOCTYPE html>${"x".repeat(HTML_MAX_BYTES)}` }),
    });
    expect(formsFor("telegram", input(), { formats: DESIGNED, renderers: long })).toEqual({
      form: "plain",
      reason: "over_limit",
      kept: false,
    });
    expect(formsFor("email", input(), { formats: DESIGNED, renderers: long })).toEqual({
      form: "plain",
      reason: "over_limit",
      kept: false,
    });
    // At the bound exactly, in UTF-16 code units and in UTF-8 bytes: an emoji counts two units, and four bytes.
    const atBound = designs({
      telegram: () => ({ text: `🔴${"x".repeat(TELEGRAM_MAX_UNITS - 2)}`, entities: [] }),
      email: () => ({ subject: "s", html: `🔴${"x".repeat(HTML_MAX_BYTES - 4)}` }),
    });
    expect(formsFor("telegram", input(), { formats: DESIGNED, renderers: atBound }).form).toBe("designed");
    expect(formsFor("email", input(), { formats: DESIGNED, renderers: atBound }).form).toBe("designed");
  });

  it("otherwise sends the designed form, rendered from the decoded facts and a sample's mark", () => {
    const renderers = designs();
    expect(formsFor("telegram", input(), { formats: DESIGNED, renderers })).toEqual({
      form: "designed",
      designed: goodTelegram(),
    });
    expect(renderers.telegram).toHaveBeenCalledWith(CTX, SPEC, undefined);
    const sample = { fingerprint: "1a2b3c4d" };
    expect(formsFor("email", input({ sample }), { formats: DESIGNED, renderers })).toEqual({
      form: "designed",
      designed: goodEmail(),
    });
    expect(renderers.email).toHaveBeenCalledWith(CTX, SPEC, sample);
  });
});
