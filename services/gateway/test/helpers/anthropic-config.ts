// Prod's route with the Anthropic API as its paid fallback (spec 010, FR-002's switch), in a directory of its own, with
// a test-only price for its model and a monthly cap for the adapter; and the adapter factories with anthropic-messages
// built against a stub's origin instead of api.anthropic.com, through the module's own deps seam (plan §2.1). The test
// removes the directory. Nothing here holds a key: the tests put a run-time value in the stack's environment.
import { copyFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AnthropicMessagesAdapter,
  anthropicDeps,
  factory as anthropicFactory,
  type AnthropicSettings,
} from "../../src/adapters/anthropic-messages.js";
import { loadFactories, type AdapterFactory } from "../../src/adapters/registry.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
export const ANTHROPIC_MODEL = "claude-haiku-5-5";

/** The routing file's adapters, with prod's fallback as given. */
export function anthropicRouting(fallback: "anthropic" | "bedrock" = "anthropic", requestMs = 2000): string {
  return `schema: 1
deadline_ms: 20000
adapters:
  local:
    type: openai-compatible
    kind: local
    provider: local
    base_url_env: LOCAL_MODEL_BASE_URL
    model_env: LOCAL_MODEL_NAME
    timeouts: { connect_ms: 1000, request_ms: 10000 }
    health: { path: /models, interval_ms: 1000, timeout_ms: 800, unhealthy_after: 1, healthy_after: 3 }
  bedrock:
    type: bedrock-converse
    kind: paid
    region: us-east-1
    model: us.anthropic.claude-test-v1:0
    additional_request_fields: {}
    temperature: model_default
    timeouts: { connect_ms: 1000, request_ms: 2000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 50 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 10000 }
    credentials_warn_before_s: 7200
  anthropic:
    type: anthropic-messages
    kind: paid
    model: ${ANTHROPIC_MODEL}
    api_key_env: GATEWAY_ANTHROPIC_API_KEY
    thinking: disabled
    temperature: model_default
    timeouts: { connect_ms: 1000, request_ms: ${requestMs} }
    retry: { on: [rate_limited], max: 1, backoff_ms: 50 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 60000 }
envs:
  prod: { primary: local, fallback: ${fallback} }
  dev: { primary: local }
`;
}

/** $1 in and $5 out per million tokens: a made-up price for both paid models, not either provider's. */
export const ANTHROPIC_PRICES = `schema: 1
currency: USD
unit: per_million_tokens
versions:
  - id: "2026-10-08.1"
    effective_from: "2026-10-08T00:00:00Z"
    source: "the anthropic tests: made-up prices"
    entries:
      - provider: local
        model: "*"
        input: 0
        output: 0
      - provider: aws.bedrock
        model: us.anthropic.claude-test-v1:0
        input: 1
        output: 5
      - provider: anthropic
        model: ${ANTHROPIC_MODEL}
        input: 1
        output: 5
`;

export function anthropicBudgets(cap = "10.00"): string {
  return `schema: 1
timing:
  timezone: UTC
  reservation_ttl_s: 120
envs:
  prod:
    daily_usd: 5.00
    monthly_usd: 20.00
    fallback_daily_usd: 2.00
    warn_ratio: 0.70
    adapter_monthly_usd: { anthropic: ${cap} }
  dev:
    daily_usd: 5.00
    monthly_usd: 20.00
    fallback_daily_usd: 2.00
    warn_ratio: 0.70
    adapter_monthly_usd: { anthropic: ${cap} }
limits:
  per_client: { requests_per_minute: 20, burst: 5, requests_per_day: 500, metered_in_flight: 1 }
  global: { metered_in_flight: 4, metered_per_minute: 60 }
  per_call: { max_input_chars: 2000, hello_max_output_tokens: 128, max_output_tokens: 512 }
  twin: { turn_max_chars: 600, history_max_turns: 8, history_max_chars: 4000, max_input_chars: 32000, max_output_tokens: 300 }
`;
}

/** prod's route naming the Anthropic API (or Bedrock), its price, and its cap, in a directory of its own. */
export async function anthropicConfigDir(
  o: { fallback?: "anthropic" | "bedrock"; cap?: string; requestMs?: number } = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "h4-config-anthropic-"));
  await copyFile(join(FIXTURES, "alerts.yaml"), join(dir, "alerts.yaml"));
  await writeFile(join(dir, "routing.yaml"), anthropicRouting(o.fallback, o.requestMs));
  await writeFile(join(dir, "prices.yaml"), ANTHROPIC_PRICES);
  await writeFile(join(dir, "budgets.yaml"), anthropicBudgets(o.cap));
  return dir;
}

/** Every factory this build has, with anthropic-messages built against `origin`, and the adapters it built. */
export async function anthropicFactories(
  origin: string,
): Promise<{ factories: Map<string, AdapterFactory>; built: AnthropicMessagesAdapter[] }> {
  const factories = await loadFactories();
  const built: AnthropicMessagesAdapter[] = [];
  const stubbed: AdapterFactory<AnthropicSettings> = {
    ...anthropicFactory,
    create: (id, settings, ctx) => {
      const adapter = new AnthropicMessagesAdapter(id, settings, ctx, anthropicDeps(settings, ctx, { origin }));
      built.push(adapter);
      return adapter;
    },
  };
  factories.set(stubbed.type, stubbed as AdapterFactory);
  return { factories, built };
}
