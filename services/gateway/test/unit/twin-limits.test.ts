// T011 (spec 007; FR-024, FR-027, FR-028; Amendment 0-2; plan §3): the twin's per-turn limits and what a `twin` call
// asks of the gateway. config/budgets.yaml's `limits.twin` is optional, each key held to its bounds with spec 000's
// error form, and the Author's P-2 block passes as written; a `twin` call's reservation counts its own input bound and
// output cap while hello's keep `per_call`; the client's one metered call in flight holds a `twin` call that carries a
// client key; and a `messages` function is called once, only after the state read passes, never for a degraded state.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { metrics, trace } from "@opentelemetry/api";
import { beforeAll, describe, expect, it } from "vitest";

import { ADAPTER_TYPE_SPECS } from "../../src/adapters/_settings.js";
import { parseYaml } from "../../src/config/load.js";
import {
  loadConfig,
  PriceTable,
  validateBudgets,
  type AdapterConfig,
  type LoadedConfig,
  type PriceVersion,
} from "../../src/config/validate.js";
import { GatewayClock } from "../../src/core/clock.js";
import { Gateway, type GatewayCall } from "../../src/core/gateway.js";
import type { AdapterResult, ChatMessage, ProviderAdapter } from "../../src/core/types.js";
import { maxMicroOf } from "../../src/meter/admission.js";
import type { StateRead, Store } from "../../src/meter/store.js";
import type { AdmitRequest, AdmitResult, MeterPort } from "../../src/meter/types.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { REPO } from "../helpers/twin.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const budgetsText = readFileSync(`${FIXTURES}budgets.yaml`, "utf8");
const budgets = (text: string) => validateBudgets(parseYaml("config/budgets.yaml", text));

/** The fixture's budgets with a `limits.twin` block appended under `limits`. */
const withTwin = (block: string): string => `${budgetsText.trimEnd()}\n  twin: ${block}\n`;
const DEFAULTS =
  "{ turn_max_chars: 600, history_max_turns: 8, history_max_chars: 4000, max_input_chars: 32000, max_output_tokens: 300 }";

describe("limits.twin in config/budgets.yaml (Amendment 0-2)", () => {
  it("is optional: the fixture without it still validates, with no twin limits", () => {
    const result = budgets(budgetsText);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.value?.limits.twin).toBeUndefined();
  });

  it("passes the Author's P-2 block as written, read from the patch beside the note", () => {
    const patch = readFileSync(`${REPO}docs/merge-requests/2026-11-07-feat-007-p2-twin-limits.patch`, "utf8");
    const line = patch.split("\n").find((l) => l.startsWith("+  twin:"));
    expect(line).toBeDefined();
    const result = budgets(`${budgetsText.trimEnd()}\n${(line ?? "").slice(1)}\n`);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.value?.limits.twin).toEqual({
      turnMaxChars: 600,
      historyMaxTurns: 8,
      historyMaxChars: 4_000,
      maxInputChars: 32_000,
      maxOutputTokens: 300,
    });
  });

  const bounds: [string, number, number][] = [
    ["turn_max_chars", 50, 2_000],
    ["history_max_turns", 1, 20],
    ["max_input_chars", 4_000, 64_000],
  ];
  for (const [key, low, high] of bounds) {
    it(`holds ${key} to ${low} to ${high}, and refuses one past either end`, () => {
      for (const ok of [low, high]) {
        const text = withTwin(DEFAULTS.replace(new RegExp(`${key}: \\d+`), `${key}: ${ok}`));
        const fixed =
          key === "turn_max_chars" && ok > 4_000
            ? text.replace("history_max_chars: 4000", "history_max_chars: 4000")
            : text;
        expect(
          budgets(fixed).issues.filter((i) => i.severity === "error"),
          `${key}: ${ok}`,
        ).toEqual([]);
      }
      for (const bad of [low - 1, high + 1]) {
        const errors = budgets(withTwin(DEFAULTS.replace(new RegExp(`${key}: \\d+`), `${key}: ${bad}`))).issues.filter(
          (i) => i.severity === "error",
        );
        expect(
          errors.map((e) => [e.path, e.rule]),
          `${key}: ${bad}`,
        ).toContainEqual([`limits.twin.${key}`, "B5"]);
      }
    });
  }

  it("holds history_max_chars between turn_max_chars and 16,000, and max_output_tokens to per_call's cap", () => {
    const err = (block: string) =>
      budgets(withTwin(block))
        .issues.filter((i) => i.severity === "error")
        .map((e) => e.path);
    expect(err(DEFAULTS.replace("history_max_chars: 4000", "history_max_chars: 599"))).toContain(
      "limits.twin.history_max_chars",
    );
    expect(err(DEFAULTS.replace("history_max_chars: 4000", "history_max_chars: 16001"))).toContain(
      "limits.twin.history_max_chars",
    );
    expect(err(DEFAULTS.replace("max_output_tokens: 300", "max_output_tokens: 513"))).toContain(
      "limits.twin.max_output_tokens",
    );
    expect(err(DEFAULTS.replace("max_output_tokens: 300", "max_output_tokens: 31"))).toContain(
      "limits.twin.max_output_tokens",
    );
    expect(err(DEFAULTS.replace("max_output_tokens: 300", "max_output_tokens: 512"))).toEqual([]);
  });

  it("refuses an unknown key inside it", () => {
    const errors = budgets(withTwin(DEFAULTS.replace(" }", ", extra: 1 }"))).issues.filter(
      (i) => i.severity === "error",
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.path).toMatch(/^limits\.twin/);
  });
});

describe("a twin call's reservation bound (data-model.md §7.2, amended)", () => {
  it("counts the twin's input bound and its own output cap: $0.00335 at Claude Haiku 5.5's price", async () => {
    const config = await loadConfig(`${REPO}config/`, { allowPlanned: true });
    const version = config.prices?.versions.at(-1) as PriceVersion;
    const entry = PriceTable.lookup(version, "aws.bedrock", "us.anthropic.claude-haiku-5-5");
    if (entry === undefined) throw new Error("no Haiku price in config/prices.yaml");
    expect(maxMicroOf(entry, { maxInputChars: 32_000, maxOutputTokens: 300 })).toBe(3_350n);
    expect(maxMicroOf(entry, { maxInputChars: 2_000, maxOutputTokens: 128 })).toBe(264n);
  });
});

describe("Gateway.complete for a twin call (plan §3)", () => {
  let config: LoadedConfig;
  beforeAll(async () => {
    config = await loadConfig(FIXTURES, { allowPlanned: false });
  });

  const normal: StateRead = {
    kind: "ok",
    state: "normal",
    since: new Date(0),
    crossed: [],
    fallbackAwaitingRenewal: false,
    fallbackAwaitingSince: null,
    testClockOffsetMs: null,
  };
  const tripped: StateRead = { ...normal, state: "degraded", crossed: ["day"] };

  function rig(read: StateRead, localHealthy: boolean) {
    const answer: AdapterResult = {
      text: "an answer",
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "stop",
      responseModel: "stand-in",
      latencyMs: 1,
    };
    const seen: ChatMessage[][] = [];
    const adapter = (id: string, kind: "local" | "synthetic"): ProviderAdapter => ({
      id,
      type: kind === "local" ? "openai-compatible" : "synthetic",
      provider: kind === "local" ? "local" : "synthetic",
      kind,
      model: kind === "local" ? "stand-in" : "metered-test",
      server: { address: id },
      retry: { on: [], max: 0, backoffMs: 0 },
      ...(kind === "synthetic" ? { fixedUsage: { inputTokens: 0, outputTokens: 1_000 } } : {}),
      complete: async (req) => {
        seen.push(req.messages);
        return answer;
      },
      health: async () => ({ healthy: kind === "local" ? localHealthy : true, checkedAt: new Date(0).toISOString() }),
    });
    const admits: AdmitRequest[] = [];
    const meter: MeterPort = {
      admit: async (r): Promise<AdmitResult> => {
        admits.push(r);
        return {
          ok: true,
          admitted: {
            reservationId: "6f0f3a3e-29d8-4c9c-a6f5-0cbbd0f3e0a1",
            attribution: r.attribution,
            adapterId: r.adapter.id,
            provider: r.adapter.provider,
            model: r.adapter.model,
            price: config.prices?.versions[0] as PriceVersion,
            maxMicro: 100_000n,
            periodDay: "2026-11-07",
            periodMonth: "2026-11",
            createdAt: 0,
            expiresAt: 120_000,
            retryUntil: Date.now() + 120_000,
            requestId: r.requestId,
            traceId: r.traceId,
            purpose: r.purpose,
            routeReason: r.routeReason,
            routingSha: "ab".repeat(32),
          },
        };
      },
      settle: async () => ({ committed: true, costMicro: 100_000n }),
      counters: () => ({ inFlight: 0, lastMinute: 0 }),
      start: () => {},
      stop: async () => {},
    };
    const store = {
      readStackState: async () => read,
      outageStartedAt: () => undefined,
      query: async () => ({ rows: [] }),
      readMeters: async () => [],
    } as unknown as Store;
    const local = config.routing?.adapters.get("local");
    if (!config.routing || !config.prices || !config.budgets || !local) throw new Error("fixtures");
    const synthetic: AdapterConfig = {
      id: "synthetic",
      type: "synthetic",
      kind: "synthetic",
      provider: "synthetic",
      settings: { model: "metered-test", output_tokens: 1_000 },
      spec: ADAPTER_TYPE_SPECS.get("synthetic") as AdapterConfig["spec"],
      placeholders: [],
    };
    const g = new Gateway({
      stack: "dev",
      envClass: "dev",
      version: "0.1.0",
      routing: config.routing,
      prices: config.prices,
      budgets: config.budgets,
      adapters: [
        { role: "primary", config: local, adapter: adapter("local", "local") },
        { role: "fallback", config: synthetic, adapter: adapter("synthetic", "synthetic") },
      ],
      store,
      clock: new GatewayClock(),
      tracer: trace.getTracer("twin-limits"),
      metrics: new GatewayMetrics(metrics.getMeter("twin-limits")),
      logger: { info() {}, warn() {}, error() {} },
      payloadSampling: false,
      testMachinery: { clock: true, synthetic: true },
      meter,
    });
    return { g, admits, seen };
  }

  const built: ChatMessage[] = [
    { role: "system", content: "the twin's instructions" },
    { role: "user", content: "a turn" },
  ];
  function twinCall(messages: GatewayCall["messages"]): GatewayCall {
    return {
      requestId: "ef".repeat(16),
      purpose: "twin",
      messages,
      maxOutputTokens: 300,
      maxInputChars: 32_000,
      arrivedAt: Date.now(),
      signal: new AbortController().signal,
      clientKey: "198.51.100.7",
      room: { feature: "fx-piece", topic: "fx-topic" },
    };
  }

  it("builds the messages once, after the state read passes, and sends what it built", async () => {
    const { g, seen } = rig(normal, true);
    await g.probeAll();
    await g.probeAll();
    await g.probeAll();
    let calls = 0;
    const a = await g.complete(
      twinCall(() => {
        calls += 1;
        return built;
      }),
    );
    expect(a).toMatchObject({ kind: "answered", route: "local" });
    expect(calls).toBe(1);
    expect(seen).toEqual([built]);
  });

  it("never builds the messages for a degraded state", async () => {
    const { g, seen } = rig(tripped, true);
    let calls = 0;
    const a = await g.complete(
      twinCall(() => {
        calls += 1;
        return built;
      }),
    );
    expect(a).toMatchObject({ kind: "degraded", decision: { cause: "kill_switch_tripped" } });
    expect(calls).toBe(0);
    expect(seen).toEqual([]);
  });

  it("admits a twin call with its own input bound, its output cap, its client, and its feature; hello's keep per_call", async () => {
    const { g, admits } = rig(normal, false);
    await g.probeAll(); // the fallback is healthy; local isn't
    const a = await g.complete(twinCall(() => built));
    expect(a).toMatchObject({ kind: "answered", route: "fallback" });
    expect(admits[0]).toMatchObject({
      purpose: "twin",
      maxInputChars: 32_000,
      maxOutputTokens: 300,
      clientKey: "198.51.100.7",
      room: { feature: "fx-piece", topic: "fx-topic" },
    });
    await g.complete({ ...twinCall(built), purpose: "hello", maxOutputTokens: 128 } as GatewayCall);
    const hello = { ...twinCall(built), purpose: "hello" as const, maxOutputTokens: 128 };
    delete (hello as Partial<GatewayCall>).maxInputChars;
    delete (hello as Partial<GatewayCall>).room;
    await g.complete(hello);
    expect(admits.at(-1)).not.toHaveProperty("maxInputChars");
    expect(admits.at(-1)).not.toHaveProperty("room");
  });
});
