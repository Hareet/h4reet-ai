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
    // The request timeout is below routing.yaml's minimum on purpose, so create() takes it as given (§5.3). The
    // connect timeout stays routing.yaml's 1 s: at 100 ms, a loaded host's stalled event loop fired the watchdog before
    // the stub's accept arrived and failed C3 (round 3's review). No case here makes a connect hang, and
    // local-openai.errors.test.ts tests the watchdog at its real 1 s.
    const fixture = local.settings as unknown as LocalSettings;
    const settings: LocalSettings = {
      ...fixture,
      timeouts: { connect_ms: fixture.timeouts.connect_ms, request_ms: CONTRACT_TIMEOUTS.requestMs },
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
