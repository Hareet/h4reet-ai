// The Bedrock adapter's real client and chain (contracts/provider-adapter.md §3.2's client and name-lookup rows; tasks.md
// T189): one handler, whose agent keeps the SDK default's options and resolves through c-ares, serving both the
// Converse calls and the credential chain's SSO clients. The chain is replaced here, to see what it was given; nothing
// is resolved and nothing is sent.
import { Agent as HttpsAgent } from "node:https";

import { afterEach, describe, expect, it, vi } from "vitest";

import { bedrockDeps, type BedrockSettings } from "../../src/adapters/bedrock-converse.js";
import { aresLookup } from "../../src/core/resolve.js";

const chain = vi.hoisted(() => ({ inits: [] as unknown[] }));
vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: (init: unknown) => {
    chain.inits.push(init);
    return async () => ({ accessKeyId: "test", secretAccessKey: "test" });
  },
}));

const SETTINGS: BedrockSettings = {
  region: "us-east-1",
  model: "us.anthropic.claude-test-v1:0",
  additional_request_fields: {},
  timeouts: { connect_ms: 1_000, request_ms: 4_000 },
  retry: { on: ["rate_limited"], max: 1, backoff_ms: 250 },
  circuit: { failures: 3, open_s: 30 },
  health: { interval_ms: 10_000 },
  credentials_warn_before_s: 7_200,
};

const built: { release?(): void; client: { destroy(): void } }[] = [];
afterEach(() => {
  for (const deps of built.splice(0)) {
    deps.client.destroy();
    deps.release?.();
  }
  chain.inits.length = 0;
});

describe("the Bedrock adapter's client and chain (§3.2)", () => {
  it("send through one handler, whose agent keeps the SDK default's options and resolves through c-ares", async () => {
    const deps = bedrockDeps(SETTINGS);
    built.push(deps);
    const handler = deps.client.config.requestHandler as unknown as {
      configProvider: Promise<{
        httpsAgent: unknown;
        connectionTimeout: number;
        requestTimeout: number;
        throwOnRequestTimeout?: boolean;
      }>;
    };
    const config = await handler.configProvider;
    expect(config.httpsAgent).toBeInstanceOf(HttpsAgent);
    const agent = config.httpsAgent as HttpsAgent & { options: Record<string, unknown> };
    expect(agent.options).toMatchObject({ keepAlive: true, maxSockets: 50 });
    expect(agent.options.lookup).toBe(aresLookup);
    expect([config.connectionTimeout, config.requestTimeout]).toEqual([1_000, 4_000]);
    expect(config.throwOnRequestTimeout).toBe(true); // a request past its timeout ends, rather than logging a warning
    // The chain gets that same handler, which the SDK hands its SSO and SSO-OIDC clients (US2's round 9).
    expect(chain.inits).toHaveLength(1);
    const init = chain.inits[0] as { clientConfig?: { requestHandler?: unknown } };
    expect(Object.keys(init)).toEqual(["clientConfig"]);
    expect(init.clientConfig?.requestHandler).toBe(deps.client.config.requestHandler);
  });

  // Spec 007's plan, D43: a twin turn's request may run to twin_request_ms, so the handler's own timeout allows the
  // longer of the two; each call's abort signal still cuts hello at request_ms.
  it("let the handler wait for a twin turn's limit when the adapter has one", async () => {
    for (const [settings, expected] of [
      [SETTINGS, 4_000],
      [{ ...SETTINGS, twin_request_ms: 9_000 }, 9_000],
    ] as const) {
      const deps = bedrockDeps(settings);
      built.push(deps);
      const handler = deps.client.config.requestHandler as unknown as {
        configProvider: Promise<{ requestTimeout: number }>;
      };
      expect((await handler.configProvider).requestTimeout).toBe(expected);
    }
  });

  it("make one attempt, in us-east-1, with the chain as its credentials", async () => {
    const deps = bedrockDeps(SETTINGS);
    built.push(deps);
    expect(await deps.client.config.maxAttempts()).toBe(1);
    expect(await deps.client.config.region()).toBe("us-east-1");
    expect(await deps.credentials()).toMatchObject({ accessKeyId: "test" });
  });
});
