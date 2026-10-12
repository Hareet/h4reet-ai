// The synthetic adapter, type synthetic (contracts/provider-adapter.md §3.3): dev's metered test spend, and nothing
// else. It never touches the network. Every call answers the same text with the same usage, 1,000 output tokens,
// which dev's price entry ($100 per million output tokens) makes exactly $0.10. It declares that usage as fixedUsage,
// so its reservation is exactly its cost too (data-model.md §7.2).
//
// - Where it runs: only with H4_ENV=dev. A route that names it elsewhere stops startup (synthetic_in_prod), and the
//   registry builds it only when GATEWAY_TEST_SYNTHETIC_SPEND=1 (registry.ts); otherwise dev's route has no fallback,
//   and hello with local down answers no_fallback_in_stack.
// - complete() ignores maxOutputTokens: its tokens are a unit of spend, not text. A request whose signal has aborted
//   or whose deadline has passed is a timeout, which bills nothing (§2.5), as any adapter's would be.
// - health() is always healthy, from one probe that reads nothing; an aborted probe is a failed one.
import { randomUUID } from "node:crypto";

import { ADAPTER_TYPE_SPECS, type AdapterTypeSpec } from "./_settings.js";
import type { AdapterContext, AdapterFactory } from "./registry.js";
import {
  ProviderError,
  type AdapterKind,
  type AdapterResult,
  type CompletionRequest,
  type HealthStatus,
  type ProviderAdapter,
  type RetryPolicy,
  type Usage,
} from "../core/types.js";

export interface SyntheticSettings {
  model: string;
  output_tokens: number;
}

const SPEC = ADAPTER_TYPE_SPECS.get("synthetic") as AdapterTypeSpec;

/** The answer every call gets (gateway-http.md §2.5.1). */
export const SYNTHETIC_TEXT = "synthetic response";

export class SyntheticAdapter implements ProviderAdapter {
  readonly type = "synthetic";
  readonly kind: AdapterKind = "synthetic";
  readonly provider = "synthetic";
  readonly model: string;
  readonly server = { address: "synthetic" };
  readonly retry: RetryPolicy = { on: [], max: 0, backoffMs: 0 };
  readonly fixedUsage: Usage;

  constructor(
    readonly id: string,
    settings: SyntheticSettings,
    private readonly ctx: AdapterContext,
  ) {
    this.model = settings.model;
    this.fixedUsage = { inputTokens: 0, outputTokens: settings.output_tokens };
  }

  complete(req: CompletionRequest): Promise<AdapterResult> {
    const started = this.ctx.realNow();
    if (req.signal.aborted || started >= req.deadline) {
      return Promise.reject(new ProviderError("timeout", true, false));
    }
    return Promise.resolve({
      text: SYNTHETIC_TEXT,
      usage: { ...this.fixedUsage },
      finishReason: "stop",
      responseModel: this.model,
      responseId: `synthetic-${randomUUID()}`,
      latencyMs: Math.max(0, Math.round(this.ctx.realNow() - started)),
    });
  }

  health(signal: AbortSignal): Promise<HealthStatus> {
    const checkedAt = new Date(this.ctx.realNow()).toISOString();
    if (signal.aborted) return Promise.resolve({ healthy: false, checkedAt, reason: "timeout" });
    return Promise.resolve({ healthy: true, checkedAt, latencyMs: 0 });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

export const factory: AdapterFactory<SyntheticSettings> = {
  type: SPEC.type,
  kinds: SPEC.kinds,
  settings: SPEC.settings as AdapterFactory<SyntheticSettings>["settings"],
  provider: "synthetic",
  create: (id, settings, ctx) => new SyntheticAdapter(id, settings, ctx),
};
