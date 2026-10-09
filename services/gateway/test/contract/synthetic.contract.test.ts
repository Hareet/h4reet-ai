// The synthetic adapter, type synthetic, against the contract suite (FR-024; contracts/provider-adapter.md §3.3,
// §5.3 mode 1): it has no API, so it runs directly, with C2's synthetic variant ("usage equals fixedUsage": its
// tokens are spend, not text) and the direct variants of the assertions that need a stubbed answer.
import { fileURLToPath } from "node:url";

import { factory, type SyntheticSettings } from "../../src/adapters/synthetic.js";
import { loadConfig } from "../../src/config/validate.js";
import type { ProviderAdapter } from "../../src/core/types.js";
import { describeAdapterContract } from "./adapter-contract.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));

describeAdapterContract(
  "synthetic",
  async ({ logger }) => {
    const config = await loadConfig(FIXTURES, { allowPlanned: false });
    if (!config.prices) throw new Error("the fixture configuration has no prices");
    const settings: SyntheticSettings = { model: "metered-test", output_tokens: 1_000 };
    const inner = factory.create("synthetic", settings, { env: {}, logger, realNow: Date.now });
    // Counting complete() calls is how the direct variants see that health() never spends (C3) and that a call is
    // exactly one attempt (C5). The adapter itself is the one production builds.
    let calls = 0;
    const adapter: ProviderAdapter = Object.assign(Object.create(inner) as ProviderAdapter, {
      complete: (req: Parameters<ProviderAdapter["complete"]>[0]) => {
        calls += 1;
        return inner.complete(req);
      },
    });
    return { adapter, prices: config.prices, calls: () => calls };
  },
  "stub",
);
