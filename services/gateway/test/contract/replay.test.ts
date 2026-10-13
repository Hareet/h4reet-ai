// The live contract run's replay (contracts/provider-adapter.md §5.3, §5.4; tasks.md T101). `operator.py
// contract-record` captures each case of live-cases.json through POST /admin/adapters/{id}/complete, with the
// /admin/status reads around them; this file holds a recording to the assertions a real provider can be held to.
// - The cases file itself is checked on every run: its names, §5's body rules, and hello's own system prompt.
// - A recording made here, through the real endpoint against the stub OpenAI server, replays on every run, so the
//   endpoint's bodies and the live assertions can't drift apart.
// - With H4_CONTRACT_RECORDING naming a recording, `make contract-live` replays it too, in the devcontainer image with
//   --network none.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { loadConfig, type PriceTable } from "../../src/config/validate.js";
import type { ChatMessage, ProviderAdapter } from "../../src/core/types.js";
import { adapterCallRequestOf } from "../../src/routes/adapters.js";
import { HELLO_SYSTEM_PROMPT } from "../../src/routes/hello.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { testStack, type TestStack } from "../helpers/stack.js";
import { describeAdapterContract, type ContractSubject, type LiveRecording } from "./adapter-contract.js";

interface LiveCase {
  name: string;
  messages: ChatMessage[];
  max_output_tokens: number;
  temperature?: number;
}

const CASES = (JSON.parse(readFileSync(new URL("./live-cases.json", import.meta.url), "utf8")) as { cases: LiveCase[] })
  .cases;
const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const REPO_CONFIG = fileURLToPath(new URL("../../../../config/", import.meta.url));
const NAMES = [
  "hello-shape",
  "cap-length",
  "short-stop",
  "multi-turn",
  "non-ascii",
  "temperature-one",
  "system-only-once",
  "repeat-cost",
];

describe("live-cases.json (§5.4)", () => {
  it("names §5.4's eight cases, once each", () => {
    expect(CASES.map((c) => c.name)).toEqual(NAMES);
  });

  it("holds every case to §5's body rules, at the stack's limits", async () => {
    const config = await loadConfig(FIXTURES, { allowPlanned: false });
    const limits = config.budgets?.limits.perCall;
    if (limits === undefined) throw new Error("the fixtures have no limits");
    for (const c of CASES) {
      const { name, ...request } = c;
      const parsed = adapterCallRequestOf(
        { ...request, purpose: "contract", reason: "contract-live cases check" },
        limits,
      );
      expect([name, parsed.ok]).toEqual([name, true]);
    }
  });

  it("sends hello's own system prompt, and repeat-cost sends hello-shape again", () => {
    const shape = CASES.find((c) => c.name === "hello-shape");
    expect(shape?.messages[0]).toEqual({ role: "system", content: HELLO_SYSTEM_PROMPT });
    const repeat = CASES.find((c) => c.name === "repeat-cost");
    expect({ ...repeat, name: "hello-shape" }).toEqual(shape);
  });
});

/** The recorded adapter, as /admin/status reported it: a recording makes no calls, so nothing here calls out. */
function recordedAdapter(recording: LiveRecording): ProviderAdapter {
  const status = recording.statusBefore as { adapters?: Record<string, unknown>[] } | undefined;
  const entry = status?.adapters?.find((a) => a.id === recording.adapter);
  if (entry === undefined) throw new Error(`the recording's status names no adapter ${recording.adapter}`);
  const refuse = async (): Promise<never> => {
    throw new Error("a recording makes no calls");
  };
  return {
    id: recording.adapter,
    type: "recorded",
    provider: String(entry.provider),
    kind: entry.kind === "paid" ? "paid" : "local",
    model: String(entry.model),
    // Both shipped adapters name a port, so their spans carry server.port.
    server: { address: "recorded", port: 0 },
    retry: { on: [], max: 0, backoffMs: 0 },
    complete: refuse,
    health: refuse,
  };
}

/** A case's request, as POST /admin/adapters/{id}/complete takes it and the recording keeps it. */
function requestOf(c: LiveCase): LiveRecording["cases"][number]["request"] {
  return {
    messages: c.messages,
    max_output_tokens: c.max_output_tokens,
    ...(c.temperature === undefined ? {} : { temperature: c.temperature }),
  };
}

/** Each recorded case was sent as live-cases.json has it, so a recording can't stand for other cases. */
function expectCasesMatch(recording: LiveRecording): void {
  for (const c of recording.cases) {
    const sent = CASES.find((x) => x.name === c.name);
    expect(sent, c.name).toBeDefined();
    if (sent !== undefined) expect(c.request, c.name).toEqual(requestOf(sent));
  }
}

// A recording made here: the local adapter, through the endpoint, against the stub OpenAI server.
const opened: { openai?: StubOpenAI; stack?: TestStack } = {};
afterAll(async () => {
  await opened.stack?.close();
  await opened.openai?.close();
});

async function recordHere(): Promise<LiveRecording> {
  const openai = await stubOpenAI({ model: "stand-in" });
  opened.openai = openai;
  const s = await testStack({ env: { LOCAL_MODEL_BASE_URL: openai.baseUrl } });
  opened.stack = s;
  const headers = { ...s.auth(), "content-type": "application/json" };
  const init = await s.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers,
    payload: JSON.stringify({ reason: "A fresh stack for the replay test.", confirm_zero: true, renew: true }),
  });
  expect(init.statusCode).toBe(200);
  const status = async () => (await s.admin.inject({ method: "GET", url: "/admin/status", headers: s.auth() })).json();
  const statusBefore: unknown = await status();
  const cases: LiveRecording["cases"][number][] = [];
  for (const c of CASES) {
    // cap-length's answer runs past its cap of 8, so the model server cuts it, as a real one would.
    openai.next({
      ok: { text: "Hello there.", inputTokens: 24, outputTokens: c.max_output_tokens === 8 ? 40 : 3, finish: "stop" },
    });
    const { name, ...request } = c;
    const res = await s.admin.inject({
      method: "POST",
      url: "/admin/adapters/local/complete",
      headers,
      payload: JSON.stringify({ ...request, purpose: "contract", reason: "contract-live replay test, recorded here" }),
    });
    cases.push({ name, request, status: res.statusCode, body: res.json() as unknown });
  }
  return { adapter: "local", statusBefore, statusAfter: await status(), cases };
}

async function subjectOf(recording: LiveRecording, prices: () => Promise<PriceTable>): Promise<ContractSubject> {
  expectCasesMatch(recording);
  return { adapter: recordedAdapter(recording), prices: await prices(), recording };
}

const pricesFrom = (dir: string, allowPlanned: boolean) => async (): Promise<PriceTable> => {
  const config = await loadConfig(dir, { allowPlanned });
  if (config.prices === undefined) throw new Error(`${dir} has no prices.yaml`);
  return config.prices;
};

describeAdapterContract(
  "recorded here: local, through the endpoint",
  async () => subjectOf(await recordHere(), pricesFrom(FIXTURES, false)),
  "live",
);

// The Author's recording, from make contract-live, priced with the repository's own price table.
const recordingPath = process.env.H4_CONTRACT_RECORDING;
if (recordingPath !== undefined && recordingPath !== "") {
  const recording = JSON.parse(readFileSync(recordingPath, "utf8")) as LiveRecording;
  describeAdapterContract(
    `recorded live: ${recording.adapter}`,
    async () => subjectOf(recording, pricesFrom(REPO_CONFIG, true)),
    "live",
  );
}
