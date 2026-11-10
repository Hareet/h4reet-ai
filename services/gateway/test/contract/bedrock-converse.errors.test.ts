// What the Bedrock adapter's own column of §2.5 lists past C4's shared cases, and the rest of §3.2 the suite doesn't
// reach (contracts/provider-adapter.md §5.2, "Past C4"): every SDK exception by name, the connection's and the
// handler's errors, the stop reasons, the request's optional parts, the health probe, and the SSO token cache.
// aws-sdk-client-mock stands in for Bedrock, as in the contract suite, and nothing leaves the process.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BedrockRuntimeClient, BedrockRuntimeServiceException } from "@aws-sdk/client-bedrock-runtime";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  BedrockConverseAdapter,
  fromSdk,
  readSsoSessionEnd,
  type BedrockDeps,
  type BedrockSettings,
} from "../../src/adapters/bedrock-converse.js";
import { AdapterConfigError } from "../../src/adapters/registry.js";
import { ProviderError, type CompletionRequest } from "../../src/core/types.js";
import { stubBedrock } from "../helpers/stub-bedrock.js";

const MODEL = "us.anthropic.claude-test-v1:0";
const SETTINGS: BedrockSettings = {
  region: "us-east-1",
  model: MODEL,
  additional_request_fields: {},
  timeouts: { connect_ms: 100, request_ms: 3_000 },
  retry: { on: ["rate_limited"], max: 1, backoff_ms: 250 },
  circuit: { failures: 3, open_s: 30 },
  health: { interval_ms: 10_000 },
  credentials_warn_before_s: 7_200,
};
const logger = { info() {}, warn() {}, error() {} };

const stub = stubBedrock();
afterAll(() => stub.restore());
afterEach(() => stub.reset());

function adapter(o: { settings?: Partial<BedrockSettings>; deps?: Partial<BedrockDeps> } = {}): BedrockConverseAdapter {
  return new BedrockConverseAdapter(
    "bedrock",
    { ...SETTINGS, ...o.settings },
    { env: {}, logger, realNow: Date.now },
    {
      client: new BedrockRuntimeClient({ region: "us-east-1", maxAttempts: 1 }),
      credentials: async () => ({ expiration: new Date(Date.now() + 3_600_000) }),
      ssoSessionEnd: async () => undefined,
      ...o.deps,
    },
  );
}

const request = (o: Partial<CompletionRequest> = {}): CompletionRequest => ({
  requestId: "ab".repeat(16),
  purpose: "contract",
  messages: [{ role: "user", content: "Say hello." }],
  maxOutputTokens: 16,
  deadline: Date.now() + 5_000,
  signal: new AbortController().signal,
  ...o,
});

/** The ProviderError complete() rejects with, as kind, retryable, possiblyBilled, status, and code. */
async function failure(a: BedrockConverseAdapter, req = request()): Promise<unknown[]> {
  try {
    await a.complete(req);
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    return [err.kind, err.retryable, err.possiblyBilled, err.status, err.code];
  }
  throw new Error("complete() resolved");
}

const exception = (name: string, status?: number): Error =>
  new BedrockRuntimeServiceException({
    name,
    $fault: "server",
    message: `${name}: ${stub.canary}`,
    $metadata: status === undefined ? {} : { httpStatusCode: status },
  });

describe("the Bedrock adapter's errors past C4 (§2.5's Bedrock column)", () => {
  it.each([
    ["ServiceUnavailableException", 503, "unavailable", true, false],
    ["ModelNotReadyException", 429, "unavailable", true, false],
    ["ModelTimeoutException", 408, "timeout", true, true],
    ["ServiceQuotaExceededException", 400, "rate_limited", true, false],
    ["UnrecognizedClientException", 403, "auth", false, false],
    ["ExpiredTokenException", 403, "auth", false, false],
    ["ResourceNotFoundException", 404, "bad_request", false, false],
    ["ModelErrorException", 424, "provider_error", true, false],
    ["ConflictException", 409, "provider_error", true, false],
  ])("%s is %s", async (name, status, kind, retryable, billed) => {
    stub.nextError(exception(name, status));
    expect(await failure(adapter())).toEqual([kind, retryable, billed, status, name]);
  });

  it("a credential- or token-provider error is auth, with no status", async () => {
    // TokenProviderError is token-providers' answer for an SSO token that's missing, expired, or can't be refreshed.
    for (const name of ["CredentialsProviderError", "TokenProviderError"]) {
      stub.nextError(Object.assign(new Error(`no credentials ${stub.canary}`), { name }));
      expect(await failure(adapter())).toEqual(["auth", false, false, undefined, name]);
    }
  });

  it.each([
    ["ECONNREFUSED"],
    ["EHOSTUNREACH"],
    ["ENETUNREACH"],
    ["EADDRNOTAVAIL"],
    ["ENOTFOUND"],
    ["EAI_AGAIN"],
    ["ETIMEOUT"],
    ["ESERVFAIL"],
  ])("%s, no connection or no address, is unavailable and not billed", async (code) => {
    stub.nextError(Object.assign(new Error(`${code} ${stub.canary}`), { code }));
    expect(await failure(adapter())).toEqual(["unavailable", true, false, undefined, code]);
  });

  it("the handler's connect timeout is unavailable, since nothing reached Bedrock; any other timeout is billed", async () => {
    stub.nextError(
      Object.assign(
        new Error(
          "@smithy/node-http-handler - the request socket did not establish a connection with the server within the configured timeout of 100 ms.",
        ),
        { name: "TimeoutError" },
      ),
    );
    expect(await failure(adapter())).toEqual(["unavailable", true, false, undefined, "ETIMEDOUT"]);
    stub.nextError(Object.assign(new Error("socket timed out after 3000 ms of inactivity"), { name: "TimeoutError" }));
    expect(await failure(adapter())).toEqual(["timeout", true, true, undefined, "TimeoutError"]);
    stub.nextError(Object.assign(new Error("aborted"), { name: "AbortError" }));
    expect(await failure(adapter())).toEqual(["timeout", true, true, undefined, "AbortError"]);
  });

  it("a reset or a broken pipe is a billed timeout under its own code: Bedrock may have had the request", async () => {
    for (const code of ["ECONNRESET", "EPIPE"]) {
      // As the handler passes them on: renamed TimeoutError, the code kept.
      stub.nextError(Object.assign(new Error(`read ${code} ${stub.canary}`), { name: "TimeoutError", code }));
      expect(await failure(adapter())).toEqual(["timeout", true, true, undefined, code]);
    }
    stub.nextError(Object.assign(new Error(`socket hang up ${stub.canary}`), { code: "ECONNRESET" }));
    expect(await failure(adapter())).toEqual(["timeout", true, true, undefined, "ECONNRESET"]);
  });

  it("an unnamed error is provider_error with no code, and no error carries the provider's text", async () => {
    stub.nextError(new Error(`something broke ${stub.canary}`));
    expect(await failure(adapter())).toEqual(["provider_error", true, false, undefined, undefined]);
    const err = fromSdk(exception("ThrottlingException", 429));
    expect(err.message).toBe("rate_limited");
    expect(JSON.stringify(err) + String(err)).not.toContain(stub.canary);
    expect((err as { cause?: unknown }).cause).toBeUndefined();
  });

  it("a code that isn't one is dropped", () => {
    expect(fromSdk(Object.assign(new Error("x"), { name: "Not A Name!" })).code).toBeUndefined();
  });
});

describe("the Bedrock adapter's answers (§3.2's response row)", () => {
  const answer = (stopReason: string, extra: object = {}) => ({
    output: { message: { role: "assistant" as const, content: [{ text: "Hi" }, { text: " there." }] } },
    usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
    stopReason: stopReason as never,
    metrics: { latencyMs: 1 },
    $metadata: { httpStatusCode: 200, requestId: "4f1c-request-id" },
    ...extra,
  });

  it.each([
    ["end_turn", "stop"],
    ["stop_sequence", "stop"],
    ["max_tokens", "length"],
    ["content_filtered", "content_filter"],
    ["guardrail_intervened", "content_filter"],
    ["tool_use", "other"],
  ])("stopReason %s is %s", async (stopReason, finish) => {
    stub.nextOutput(answer(stopReason));
    expect((await adapter().complete(request())).finishReason).toBe(finish);
  });

  it("joins the text blocks, keeps the cache counts and the request ID, and names the configured model", async () => {
    stub.nextOutput(
      answer("end_turn", {
        output: {
          message: { role: "assistant", content: [{ text: "Hi" }, { reasoningContent: {} }, { text: " there." }] },
        },
        usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13, cacheReadInputTokens: 4, cacheWriteInputTokens: 2 },
      }),
    );
    const r = await adapter().complete(request());
    expect(r).toMatchObject({
      text: "Hi there.",
      usage: { inputTokens: 10, outputTokens: 3, cacheReadInputTokens: 4, cacheWriteInputTokens: 2 },
      responseModel: MODEL,
      responseId: "4f1c-request-id",
    });
  });

  it("drops a request ID that isn't short and printable", async () => {
    stub.nextOutput(answer("end_turn", { $metadata: { httpStatusCode: 200, requestId: "bad id\n" } }));
    expect((await adapter().complete(request())).responseId).toBeUndefined();
  });
});

describe("the Bedrock adapter's requests (§3.2's request row)", () => {
  it("sends no system block without a system message, and no temperature unless one is given", async () => {
    await adapter().complete(request());
    const body = stub.requests()[0]?.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["inferenceConfig", "messages", "modelId"]);
    expect(body.inferenceConfig).toEqual({ maxTokens: 16 });
  });

  it("sends the temperature as given, and the settings' additional fields when there are any", async () => {
    const fields = { reasoning_config: { type: "disabled" } };
    await adapter({ settings: { additional_request_fields: fields } }).complete(request({ temperature: 0 }));
    const body = stub.requests()[0]?.body as Record<string, unknown>;
    expect(body.inferenceConfig).toEqual({ maxTokens: 16, temperature: 0 });
    expect(body.additionalModelRequestFields).toEqual(fields);
    expect(body.modelId).toBe(MODEL);
  });

  const inference = (): unknown[] => stub.requests().map((r) => (r.body as Record<string, unknown>).inferenceConfig);

  it("sends no temperature under temperature: model_default, whatever the request carries (spec 010 FR-017)", async () => {
    const a = adapter({ settings: { temperature: "model_default" } });
    for (const temperature of [0.3, 0, 1]) await a.complete(request({ temperature }));
    await a.complete(request());
    expect(inference()).toEqual([{ maxTokens: 16 }, { maxTokens: 16 }, { maxTokens: 16 }, { maxTokens: 16 }]);
  });

  it("sends the temperature as given under temperature: as_requested, as with no setting", async () => {
    await adapter({ settings: { temperature: "as_requested" } }).complete(request({ temperature: 0.3 }));
    await adapter().complete(request({ temperature: 0.3 }));
    expect(inference()).toEqual([
      { maxTokens: 16, temperature: 0.3 },
      { maxTokens: 16, temperature: 0.3 },
    ]);
  });
});

describe("the Bedrock adapter's health (§3.2's health probe)", () => {
  it("passes on credentials that resolve and haven't expired, and reports the SSO session's end", async () => {
    const end = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const status = await adapter({ deps: { ssoSessionEnd: async () => end } }).health(AbortSignal.timeout(1_000));
    expect(status).toMatchObject({ healthy: true, credentialsExpireAt: end });
    expect(stub.requests()).toEqual([]); // it never calls Bedrock
  });

  it("is credentials when they have expired, when the chain fails, or when it outlasts the probe", async () => {
    const expired = adapter({ deps: { credentials: async () => ({ expiration: new Date(Date.now() - 1) }) } });
    expect(await expired.health(AbortSignal.timeout(1_000))).toMatchObject({ healthy: false, reason: "credentials" });
    // A long-term key never expires, and FR-013 allows none (tasks.md T194).
    const forever = adapter({ deps: { credentials: async () => ({}) } });
    expect(await forever.health(AbortSignal.timeout(1_000))).toMatchObject({ healthy: false, reason: "credentials" });
    const failing = adapter({
      deps: {
        credentials: async () => {
          throw Object.assign(new Error("no SSO session"), { name: "CredentialsProviderError" });
        },
      },
    });
    expect(await failing.health(AbortSignal.timeout(1_000))).toMatchObject({ healthy: false, reason: "credentials" });
    const slow = adapter({ deps: { credentials: () => new Promise(() => {}) } });
    const started = performance.now(); // monotonic: a step of the wall clock can't move it
    expect(await slow.health(AbortSignal.timeout(200))).toMatchObject({ healthy: false, reason: "credentials" });
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("refuses to be built with routing.yaml's placeholder model", () => {
    expect(() => adapter({ settings: { model: "<inference-profile ID the Author confirms>" } })).toThrow(
      AdapterConfigError,
    );
  });

  it("is unavailable after close(), and releases what the client doesn't", async () => {
    let released = 0;
    const a = adapter({ deps: { release: () => void (released += 1) } });
    await a.close();
    expect(released).toBe(1);
    expect(await failure(a)).toEqual(["unavailable", true, false, undefined, undefined]);
    expect(await a.health(AbortSignal.timeout(1_000))).toMatchObject({ healthy: false, reason: "unreachable" });
  });
});

describe("the SSO session's end, from the token cache (§3.2's health probe, 2)", () => {
  const homes: string[] = [];
  afterAll(async () => {
    for (const home of homes) await rm(home, { recursive: true, force: true });
  });
  async function home(config: string, cache?: { key: string; body: unknown }): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "h4-aws-home-"));
    homes.push(dir);
    await mkdir(join(dir, ".aws", "sso", "cache"), { recursive: true });
    await writeFile(join(dir, ".aws", "config"), config);
    if (cache !== undefined) {
      const name = createHash("sha1").update(cache.key).digest("hex");
      await writeFile(join(dir, ".aws", "sso", "cache", `${name}.json`), JSON.stringify(cache.body));
    }
    return dir;
  }
  // A made-up token, built at run time: the reader must never hand it back.
  const token = `token-${Date.now().toString(36)}`;
  const config =
    "[default]\nregion = us-east-1\n\n[profile h4reet-bedrock]\nsso_session = h4reet\nregion = us-east-1\n";

  it("reads expiresAt from the sso_session's cache file, and nothing else", async () => {
    const dir = await home(config, { key: "h4reet", body: { accessToken: token, expiresAt: "2026-10-29T18:00:00Z" } });
    const end = await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, dir);
    expect(end).toBe("2026-10-29T18:00:00.000Z");
    expect(String(end)).not.toContain(token);
  });

  it("reads a legacy profile's start URL, and an older CLI's UTC suffix", async () => {
    const legacy = "[profile h4reet-bedrock]\nsso_start_url = https://example.awsapps.com/start\n";
    const dir = await home(legacy, {
      key: "https://example.awsapps.com/start",
      body: { accessToken: token, expiresAt: "2026-10-29T18:00:00UTC" },
    });
    expect(await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, dir)).toBe("2026-10-29T18:00:00.000Z");
  });

  it("is undefined when the cache holds a refresh token: its expiresAt is the access token's, not the session's", async () => {
    const dir = await home(config, {
      key: "h4reet",
      body: { accessToken: token, expiresAt: "2026-10-29T18:00:00Z", refreshToken: `refresh-${token}` },
    });
    expect(await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, dir)).toBeUndefined();
  });

  // Spec 001's group 4 (its tasks.md T036; docs/runbooks/laptop.md): the profile assumes h4-laptop-bedrock from an SSO
  // profile, so the session's end is its source profile's, one hop away and no further.
  const account = Array.from({ length: 12 }, (_, i) => String((i + 1) % 10)).join("");
  const chained = (source: string): string =>
    `[profile h4reet-bedrock]\nrole_arn = arn:aws:iam::${account}:role/h4-laptop-bedrock\nsource_profile = ${source}\n\n`;

  it("follows a role profile's source_profile to its SSO session, one hop", async () => {
    const dir = await home(`${chained("h4reet-bedrock-sso")}[profile h4reet-bedrock-sso]\nsso_session = h4reet\n`, {
      key: "h4reet",
      body: { accessToken: token, expiresAt: "2026-10-29T18:00:00Z" },
    });
    expect(await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, dir)).toBe("2026-10-29T18:00:00.000Z");
    const legacy = await home(
      `${chained("h4reet-bedrock-sso")}[profile h4reet-bedrock-sso]\nsso_start_url = https://example.awsapps.com/start\n`,
      { key: "https://example.awsapps.com/start", body: { accessToken: token, expiresAt: "2026-10-29T18:00:00Z" } },
    );
    expect(await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, legacy)).toBe("2026-10-29T18:00:00.000Z");
  });

  it("is undefined for a source that chains again, or isn't there", async () => {
    const again = chained("h4reet-bedrock-sso-2").replace("[profile h4reet-bedrock]", "[profile h4reet-bedrock-sso]");
    const twice = await home(
      `${chained("h4reet-bedrock-sso")}${again}[profile h4reet-bedrock-sso-2]\nsso_session = h4reet\n`,
      { key: "h4reet", body: { accessToken: token, expiresAt: "2026-10-29T18:00:00Z" } },
    );
    expect(await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, twice)).toBeUndefined();
    const missing = await home(chained("nowhere"), {
      key: "h4reet",
      body: { accessToken: token, expiresAt: "2026-10-29T18:00:00Z" },
    });
    expect(await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, missing)).toBeUndefined();
  });

  it("is undefined with no profile, no session, no cache file, or no expiry it can read", async () => {
    expect(await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, await home("[default]\n"))).toBeUndefined();
    expect(await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, await home(config))).toBeUndefined();
    const garbled = await home(config, { key: "h4reet", body: { accessToken: token, expiresAt: "soon" } });
    expect(await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, garbled)).toBeUndefined();
    expect(await readSsoSessionEnd({ AWS_PROFILE: "h4reet-bedrock" }, join(tmpdir(), "no-such-home"))).toBeUndefined();
  });
});
