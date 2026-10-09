// The local adapter, type openai-compatible, against the contract suite (FR-024, SC-006; contracts/provider-adapter.md
// §5.3, mode 1): an in-process stub OpenAI server on the sandbox's own loopback stands in for llama.cpp, and the
// timeouts are scaled down through the settings, connect 100 ms and request 300 ms.
import { fileURLToPath } from "node:url";

import { afterAll } from "vitest";

import { factory, type LocalSettings } from "../../src/adapters/local-openai.js";
import { loadConfig } from "../../src/config/validate.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { CONTRACT_TIMEOUTS, describeAdapterContract } from "./adapter-contract.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const stubs: StubOpenAI[] = [];
afterAll(async () => {
  for (const stub of stubs.splice(0)) await stub.close();
});

describeAdapterContract(
  "openai-compatible",
  async ({ logger }) => {
    const stub = await stubOpenAI({ model: "stand-in" });
    stubs.push(stub);
    const config = await loadConfig(FIXTURES, { allowPlanned: false });
    const local = config.routing?.adapters.get("local");
    if (!local || !config.prices) throw new Error("the fixture configuration has no local adapter");
    // Below routing.yaml's own minimums on purpose, so create() takes them as given (§5.3).
    const settings: LocalSettings = {
      ...(local.settings as unknown as LocalSettings),
      timeouts: { connect_ms: CONTRACT_TIMEOUTS.connectMs, request_ms: CONTRACT_TIMEOUTS.requestMs },
    };
    const adapter = factory.create("local", settings, {
      env: { LOCAL_MODEL_BASE_URL: stub.baseUrl, LOCAL_MODEL_NAME: "stand-in" },
      logger,
      realNow: Date.now,
    });
    return { adapter, prices: config.prices, stub };
  },
  "stub",
);
