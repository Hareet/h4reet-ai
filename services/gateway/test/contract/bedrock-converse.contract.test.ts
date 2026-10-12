// The Bedrock adapter, type bedrock-converse, against the contract suite (FR-024, SC-006; contracts/provider-adapter.md
// §5.3, mode 1). aws-sdk-client-mock 4.1.0 stands in for Bedrock and a fake chain for AWS's credentials, so nothing
// leaves the process. The timeouts are the suite's (connect 100 ms, request 3 s, T157). The model and its price are
// made up for the test: the real profile ID and price are the Author's to enter (tasks.md T105).
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { afterAll } from "vitest";

import { BedrockConverseAdapter, type BedrockSettings } from "../../src/adapters/bedrock-converse.js";
import { PriceTable } from "../../src/config/validate.js";
import { stubBedrock } from "../helpers/stub-bedrock.js";
import { CONTRACT_TIMEOUTS, describeAdapterContract } from "./adapter-contract.js";

const MODEL = "us.anthropic.claude-test-v1:0";
const SETTINGS: BedrockSettings = {
  region: "us-east-1",
  model: MODEL,
  additional_request_fields: {},
  timeouts: { connect_ms: CONTRACT_TIMEOUTS.connectMs, request_ms: CONTRACT_TIMEOUTS.requestMs },
  retry: { on: ["rate_limited"], max: 1, backoff_ms: 250 },
  circuit: { failures: 3, open_s: 30 },
  health: { interval_ms: 10_000 },
  credentials_warn_before_s: 7_200,
};
/** A test-only price, $1 in and $5 out per million tokens; not Bedrock's. */
const PRICES = new PriceTable([
  {
    id: "test.1",
    effectiveFrom: 0,
    source: "the Bedrock contract test",
    entries: [
      {
        provider: "aws.bedrock",
        model: MODEL,
        input: 1_000_000n,
        output: 5_000_000n,
        cacheReadInput: 1_000_000n,
        placeholders: [],
      },
    ],
  },
]);

const stub = stubBedrock();
afterAll(() => stub.restore());

describeAdapterContract(
  "bedrock-converse",
  async ({ logger }) => {
    const adapter = new BedrockConverseAdapter(
      "bedrock",
      SETTINGS,
      { env: {}, logger, realNow: Date.now },
      {
        client: new BedrockRuntimeClient({ region: SETTINGS.region, maxAttempts: 1 }),
        credentials: async () => ({ expiration: new Date(Date.now() + 3_600_000) }),
        ssoSessionEnd: async () => new Date(Date.now() + 8 * 3_600_000).toISOString(),
      },
    );
    return { adapter, prices: PRICES, stub };
  },
  "stub",
);
