// A twin call on a paid adapter sends no temperature when the adapter's settings say its model takes none (spec 010
// FR-017, built early for spec 007's live runs; spec 007's plan, departure D22). The twin asks for 0.3
// (src/twin/turn.ts), and Claude Haiku 5.5 refuses any temperature but its default with a 400: "it takes no temperature
// but its default, 1" (spec 000's contracts/provider-adapter.md §5.4).
// The stack runs on prod's own config/routing.yaml and config/prices.yaml, as committed, so its Bedrock adapter is
// configured as prod's is; aws-sdk-client-mock answers its ConverseCommand, and nothing leaves the process. The test is
// about Bedrock's committed settings, so its copy of routing.yaml pins prod's fallback to bedrock, whichever paid
// adapter the committed route names: the Author's switch changes that one line alone (spec 010, FR-002; its plan's
// B16). Through Bedrock, the Author's evaluation call (POST /admin/twin/turn, which spec 007's T075 and T077 make) and
// a visitor's turn on prod's paid fallback (POST /room/turn) send no temperature, and the local adapter still gets the
// twin's 0.3.
import { randomBytes } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parseDocument } from "yaml";

import { testStack, type TestStack } from "../helpers/stack.js";
import { stubBedrock, type StubBedrock } from "../helpers/stub-bedrock.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { TWIN_LIMITS_BLOCK } from "../helpers/twin-stack.js";
import { allReady, REPO, ROOM, short } from "../helpers/twin.js";

type Rec = Record<string, unknown>;
const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
/** An evaluation call's reason, as evals/run.py writes it for a generated case. */
const REASON = `evals product twin-${short(ROOM.lead.files[0] ?? "")}-q1-engineer`;
/** An opening on the piece with a lead: a turn the model answers. */
const OPENING = { feature: ROOM.lead.id, path: "engineer", turns: [] };

let openai: StubOpenAI;
let bedrock: StubBedrock;
const stacks: TestStack[] = [];
const dirs: string[] = [];
beforeAll(async () => {
  openai = await stubOpenAI({ model: "stand-in" });
  bedrock = stubBedrock();
});
afterAll(async () => {
  bedrock.restore();
  await openai.close();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  openai.reset();
  bedrock.reset();
  for (const s of stacks.splice(0)) await s.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

/**
 * prod's committed routing.yaml, its fallback pinned to bedrock and every other line as committed, and its committed
 * prices.yaml, beside the fixtures' alerts and their budgets with limits.twin.
 */
async function prodConfigDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "h4-config-prod-routing-"));
  dirs.push(dir);
  const routing = parseDocument(await readFile(join(REPO, "config", "routing.yaml"), "utf8"));
  // Spec 001's schema 2: prod's route on the laptop is envs.prod.hosts.laptop.
  const laptop = ["envs", "prod", "hosts", "laptop", "fallback"];
  expect(routing.hasIn(laptop), "the committed prod route names a paid fallback").toBe(true);
  routing.setIn(laptop, "bedrock");
  await writeFile(join(dir, "routing.yaml"), routing.toString());
  await copyFile(join(REPO, "config", "prices.yaml"), join(dir, "prices.yaml"));
  await copyFile(join(FIXTURES, "alerts.yaml"), join(dir, "alerts.yaml"));
  const budgets = await readFile(join(FIXTURES, "budgets.yaml"), "utf8");
  await writeFile(join(dir, "budgets.yaml"), `${budgets.trimEnd()}\n${TWIN_LIMITS_BLOCK}`);
  return dir;
}

/** Short-lived credentials for Bedrock's health check, made at run time, ending in an hour (tasks.md T194). */
function credentials(): void {
  // The default chain skips the environment while a profile is set (credential-provider-node 3.972.84).
  vi.stubEnv("AWS_PROFILE", undefined);
  vi.stubEnv("AWS_ACCESS_KEY_ID", `test-${randomBytes(8).toString("hex")}`);
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", randomBytes(30).toString("base64url"));
  vi.stubEnv("AWS_SESSION_TOKEN", randomBytes(30).toString("base64url"));
  vi.stubEnv("AWS_CREDENTIAL_EXPIRATION", new Date(Date.now() + 3_600_000).toISOString());
}

/** prod on that configuration, every topic ready, the store initialized with renewal granted, probed `probes` times. */
async function prod(probes: number): Promise<TestStack> {
  const s = await testStack({
    stack: "prod",
    configDir: await prodConfigDir(),
    twin: allReady(),
    env: { LOCAL_MODEL_BASE_URL: openai.baseUrl },
  });
  stacks.push(s);
  const init = await s.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers: { ...s.auth(), "content-type": "application/json" },
    payload: JSON.stringify({
      reason: "A fresh prod stack for the paid temperature test.",
      confirm_zero: true,
      renew: true,
    }),
  });
  expect(init.statusCode).toBe(200);
  for (let i = 0; i < probes; i += 1) await s.services.gateway.probeAll();
  return s;
}

const visitorTurn = (s: TestStack) =>
  s.api.inject({
    method: "POST",
    url: "/room/turn",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
    payload: JSON.stringify(OPENING),
  });

/** What each ConverseCommand carried as its inferenceConfig. */
const bedrockInference = (): unknown[] => bedrock.requests().map((r) => (r.body as Rec).inferenceConfig);

describe("the twin's temperature on prod's committed routing (spec 010 FR-017; spec 007 D22)", () => {
  it("sends Bedrock no temperature on the Author's evaluation call, POST /admin/twin/turn", async () => {
    const s = await prod(3);
    bedrock.next({ ok: { text: "An answer.", inputTokens: 1_000, outputTokens: 20, finish: "stop" } });
    const res = await s.admin.inject({
      method: "POST",
      url: "/admin/twin/turn",
      headers: { ...s.auth(), "content-type": "application/json" },
      payload: JSON.stringify({ ...OPENING, adapter: "bedrock", reason: REASON }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ route: "bedrock" });
    // limits.twin.max_output_tokens is the cap, and nothing else: the model's own default temperature applies.
    expect(bedrockInference()).toEqual([{ maxTokens: 300 }]);
  });

  it("sends Bedrock no temperature on a visitor's turn that falls back, POST /room/turn", async () => {
    credentials();
    const s = await prod(1); // local needs three passes in a row; Bedrock, one
    expect(s.services.gateway.routedAdapters().map((a) => [a.id, a.health.healthy])).toEqual([
      ["local", false],
      ["bedrock", true],
    ]);
    bedrock.next({ ok: { text: "An answer.", inputTokens: 1_000, outputTokens: 20, finish: "stop" } });
    const res = await visitorTurn(s);
    expect(res.statusCode).toBe(200);
    expect(bedrockInference()).toEqual([{ maxTokens: 300 }]);
  });

  it("still sends the local adapter the twin's 0.3, on the same routing", async () => {
    const s = await prod(3);
    openai.next({ ok: { text: "An answer.", inputTokens: 900, outputTokens: 9, finish: "stop" } });
    const res = await visitorTurn(s);
    expect(res.statusCode).toBe(200);
    const calls = openai.requests().filter((r) => r.method === "POST" && r.path.endsWith("/chat/completions"));
    expect(calls.map((r) => (r.body as Rec).temperature)).toEqual([0.3]);
    expect(bedrock.requests()).toEqual([]);
  });
});
