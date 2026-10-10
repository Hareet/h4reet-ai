# Contract: the provider adapter interface and the contract suite

This contract defines:
- the one interface every model provider sits behind (FR-021);
- the three adapters spec 000 ships: local, Bedrock, and the dev-only synthetic adapter;
- how a future adapter plugs in;
- the contract suite that every adapter must pass (FR-024, SC-006).

[plan.md §5.2](../plan.md#52-adapters) and [§7](../plan.md#7-tests-unit-contract-integration-live) summarize it. The configuration that builds adapters is in [config-files.md §1](config-files.md#1-configroutingyaml), the routing decision in [gateway-http.md §2.4](gateway-http.md#24-processing-order), and the span and metric names in [telemetry.md](telemetry.md).

## 1. Division of labor

An adapter translates. The gateway decides.

| An adapter does | An adapter never does |
|---|---|
| maps a `CompletionRequest` to one provider request, and the answer back to an `AdapterResult` | read the store, the meter, or prices |
| maps every failure to one `ProviderError` kind | create spans, or log a payload |
| enforces its own connect and request timeouts, and the request's deadline | retry, or fail over to another provider |
| answers `health()` with one probe that never spends | send a client identifier, a request ID, or a `user` field to a provider |

The gateway's attempt wrapper, in `src/core/gateway.ts`, does the rest, the same way for every adapter (§6):
- one client span per attempt;
- the retry policy;
- health tracking and the circuit breaker;
- cost, metering, and the ledger.

That is why a span's shape can't differ between adapters (US5-4). It is also why nothing outside `src/adapters/` names a provider (SC-006), which a lint rule enforces (§4).

## 2. The TypeScript interface

All of these types live in `services/gateway/src/core/types.ts`.

### 2.1 Requests and results

```ts
export type AdapterKind = 'local' | 'paid' | 'synthetic';
// local: free, in-stack. paid: real money, prod only. synthetic: metered test spend, dev only.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type CallPurpose = 'hello' | 'contract' | 'eval' | 'synthetic';

export interface CompletionRequest {
  requestId: string;          // the HTTP request's ID, for logs only; never sent to a provider
  purpose: CallPurpose;
  messages: ChatMessage[];    // at most one system message, and it comes first;
                              // contents together at most limits.per_call.max_input_chars (2,000)
  maxOutputTokens: number;    // 1 to limits.per_call.max_output_tokens (512); hello sends 128
  temperature?: number;       // 0 to 1; absent means the provider's default
  deadline: number;           // epoch milliseconds, real clock: complete() settles by then
  signal: AbortSignal;        // aborts at the deadline, or when the caller goes away
}

export interface Usage {      // non-negative integers
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

export type FinishReason = 'stop' | 'length' | 'content_filter' | 'error' | 'other';

export interface AdapterResult {
  text: string;               // '' when the provider returned no text
  usage: Usage;
  finishReason: FinishReason;
  responseModel: string;      // what the provider says answered; the configured model if it says nothing
  responseId?: string;        // the provider's response or request ID
  latencyMs: number;          // this attempt's wall time
}
```

### 2.2 The adapter

```ts
export interface RetryPolicy {
  on: readonly ProviderErrorKind[];   // Bedrock: ['rate_limited']; local and synthetic: []
  max: number;                        // extra attempts; 0 means none
  backoffMs: number;
}

export interface ProviderAdapter {
  readonly id: string;                // its key in config/routing.yaml: 'local', 'bedrock', 'synthetic'
  readonly type: string;              // its factory's type: 'openai-compatible', 'bedrock-converse', 'synthetic'
  readonly provider: string;          // gen_ai.provider.name: 'local', 'aws.bedrock', 'synthetic'
  readonly kind: AdapterKind;
  readonly model: string;             // gen_ai.request.model
  readonly server: { address: string; port?: number };  // server.address and server.port on its spans
  readonly retry: RetryPolicy;        // applied by the gateway, one span per attempt (§6)
  readonly fixedUsage?: Usage;        // the synthetic adapter only: the usage every call reports
  complete(req: CompletionRequest): Promise<AdapterResult>;  // one attempt; rejects only with ProviderError
  health(signal: AbortSignal): Promise<HealthStatus>;        // one probe; never rejects; never spends
  close?(): Promise<void>;            // releases sockets and timers at shutdown
}
```

Plan.md's sketch, `ProviderAdapter { id, provider, kind, model, complete(req), health(signal) }`, is this interface without four fields. This contract adds them:
- `type`, so the registry and the logs can name the factory;
- `server`, so the gateway can set `server.address` without knowing providers;
- `retry`, so retries happen in the wrapper, one span per attempt;
- `fixedUsage`, so the synthetic adapter's $0.10 call reserves $0.10 ([data-model.md §7.2](../data-model.md#72-admission-for-a-metered-call)).

### 2.3 Route decisions, degraded causes, and attribution

```ts
export type DegradedCause =
  | 'store_unreachable' | 'store_uninitialized' | 'kill_switch_tripped'
  | 'no_fallback_in_stack' | 'meter_at_ceiling' | 'fallback_awaiting_renewal'
  | 'fallback_spent_today' | 'fallback_unavailable' | 'journal_unwritable';
// 'api_unavailable' is edge's, never the gateway's (gateway-http.md §6).

export type Attribution = 'none' | 'fallback' | 'metered' | 'test';

export type RouteDecision =
  | { kind: 'local' }
  | { kind: 'fallback'; reason: 'local_unhealthy' | 'local_failed' }
  | { kind: 'metered'; attribution: 'metered' | 'test' }     // dev synthetic metered calls; prod's live contract test
  | { kind: 'degraded'; cause: DegradedCause; detail: string;
      ceilings?: ('day' | 'month')[]; since?: string };
```

- **On the spans,** `h4.route.decision` is the decision's `kind`. `h4.route.reason` is the fallback's `reason`, or the degraded `cause`.
- **The meanings** of the causes are in [gateway-http.md §3](gateway-http.md#3-degraded-causes), and those of the attributions in [data-model.md](../data-model.md).

### 2.4 Health

```ts
export type HealthReason =
  | 'not_ready'      // not yet proven healthy (startup), or the server answers 503 while it loads
  | 'unreachable'    // the connection was refused, DNS failed, or the probe got a 5xx
  | 'timeout'        // the probe didn't answer within its timeout
  | 'credentials'    // credentials are missing, can't be resolved, or have expired
  | 'circuit_open'   // set by the gateway, not the adapter (§6)
  | 'disabled';      // configured but switched off, such as synthetic without its switch

export interface HealthStatus {
  healthy: boolean;
  checkedAt: string;              // RFC 3339, real clock
  reason?: HealthReason;          // present when healthy is false
  latencyMs?: number;
  credentialsExpireAt?: string;   // a paid adapter with expiring credentials: when the session ends
}
```

### 2.5 Provider errors

```ts
export type ProviderErrorKind =
  | 'unavailable' | 'timeout' | 'rate_limited' | 'auth'
  | 'bad_request' | 'content_filtered' | 'provider_error';

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly retryable: boolean,
    readonly possiblyBilled: boolean,
    readonly status?: number,     // the provider's HTTP status, when there was one
    readonly code?: string,       // the SDK exception name or Node error code, such as ThrottlingException or ECONNREFUSED
  ) {
    super(kind);                  // the message is the kind: never a payload, a URL, or the provider's text
    this.name = 'ProviderError';
  }
}
```

**No original error.** An adapter never attaches the original error as `cause`, because SDK and HTTP errors can carry request bodies and URLs. `code` is the only detail kept. It becomes `error.type` on the span.

| Kind | `retryable` | `possiblyBilled` | Local (`openai-compatible`) | Bedrock (`bedrock-converse`) | What the gateway does |
|---|---|---|---|---|---|
| `unavailable` | yes | no | connection refused or reset before a response; DNS failure (`ENOTFOUND`, `ETIMEOUT`, c-ares's codes since T188); connect timeout; HTTP 502, 503, 504 | `ServiceUnavailableException`, `ModelNotReadyException`; connection refused; DNS failure | local: marks it unhealthy at once and fails over. Fallback: 503 `fallback_unavailable`, a circuit failure. |
| `timeout` | yes | yes for Bedrock, no for local | no answer within 10 s, or the deadline aborted the call | the request timeout (4 s) or the deadline aborted the call; `ModelTimeoutException` | local: marks it unhealthy and fails over. Fallback: charges the reserved maximum, then 503 `fallback_unavailable`, a circuit failure. |
| `rate_limited` | yes | no | HTTP 429 | `ThrottlingException`, `ServiceQuotaExceededException` | Bedrock: one retry if the deadline allows (§3.2), then 503 `fallback_unavailable`, a circuit failure. Local: 502 `local_error`. |
| `auth` | no | no | HTTP 401, 403 | `AccessDeniedException`, `UnrecognizedClientException`, `ExpiredTokenException`; credential-provider errors | local: 502 `local_error`. Fallback: 503 `fallback_unavailable`, a circuit failure; health reports `credentials`. |
| `bad_request` | no | no | HTTP 400, 404, 413, 422 | `ValidationException`, `ResourceNotFoundException` | local: 502 `local_error`. Fallback: 503 `fallback_unavailable`; not a circuit failure. |
| `content_filtered` | no | no | – (a future provider that rejects content with an error) | – (Bedrock filters with a stop reason; see below) | the same as `bad_request` |
| `provider_error` | yes | no | HTTP 500 or any other 5xx; a 200 whose body doesn't parse or has no usage | `InternalServerException`, `ModelErrorException`; any other exception | local: 502 `local_error`. Fallback: 503 `fallback_unavailable`, a circuit failure. |

**A filtered answer is not an error.** An OpenAI-compatible `finish_reason: "content_filter"` and a Converse `stopReason` of `content_filtered` or `guardrail_intervened` both return a result with `finishReason: 'content_filter'`.

## 3. The shipped adapters

### 3.1 `local-openai` (`type: openai-compatible`)

| Aspect | Contract |
|---|---|
| Module | `src/adapters/local-openai.ts` |
| Kind and provider | `kind: local`, `provider: local`. In spec 000 this type accepts only `kind: local`. The base URL must use `http` and a single-label host (an in-stack service such as `model-server`), so no paid service can be declared local and escape the meter. The label starts with a letter, so no IPv4 address in decimal, hex, or octal passes as one ([config-files.md §1.4](config-files.md#14-startup-refusals-exit-78)). |
| Settings | `base_url_env` (the env key holding the base URL: `LOCAL_MODEL_BASE_URL` = `http://model-server:8080/v1`), `model_env` (`LOCAL_MODEL_NAME`, the stack's `MODEL_ALIAS`), `timeouts`, `health` ([config-files.md §1](config-files.md#1-configroutingyaml)) |
| Request | `POST {base}/chat/completions` over `node:http` (a departure, below), with `Content-Type: application/json` and the body `{model, messages, max_tokens: maxOutputTokens, temperature?, stream: false}`. No `Authorization` header and no `user` field. Each call opens its own connection (no keep-alive), so a socket the model server closed between calls can't fail a call as `unavailable` and fail it over. |
| Response | `choices[0].message.content` becomes `text`. `usage.prompt_tokens`, `usage.completion_tokens`, and `usage.prompt_tokens_details.cached_tokens` become the usage. `choices[0].finish_reason`: `stop` → `stop`, `length` → `length`, `content_filter` → `content_filter`, anything else → `other`. `model` → `responseModel`, `id` → `responseId`. Missing `usage` is a `provider_error`. |
| Name lookup | Through c-ares (`core/resolve.ts`), not `getaddrinfo`: a lookup the watchdog below abandons holds no libuv thread (a departure, below). |
| Timeouts | Connect 1 s, through a watchdog on the socket's connect: a socket that hasn't connected in time, DNS lookup included, is destroyed, and the call fails as `unavailable` (code `ETIMEDOUT`). Request 10 s: `AbortSignal.any([req.signal, AbortSignal.timeout(min(request_ms, deadline − now))])`. No retries: `retry = {on: [], max: 0}`, because failing over is the retry. |
| Health probe | `GET {base}/models` with an 800 ms timeout. It passes on a 200 whose list includes the configured model; a 503 is `not_ready`. |
| Health cadence (the gateway, §6) | every 1 s. It starts unhealthy (`not_ready`). Three passes in a row mark it healthy. One failed probe, or a call that fails as `unavailable` or `timeout`, marks it unhealthy at once and resets the count. |
| SC-005 | A stopped model server fails on the call itself, so hello fails over at once: its name no longer resolves, or, where the resolver doesn't answer for it (the agents' engine, T084's pre-run), the 1 s watchdog ends the call. The probe notices within 1.8 s at worst. Bedrock typically answers in 1–2 s, inside the 5 s. |

**Departure (tasks.md T188, 2026-10-10): the name lookup is c-ares's, not `getaddrinfo`.** Node's default lookup runs `getaddrinfo` on libuv's threadpool, which treats it as slow I/O and gives lookups at most half its threads, two of the default four; a lookup can't be cancelled. On the agents' engine, a stopped model server's name took 8 s to fail with `EAI_AGAIN`, and the probe, once a second, kept both lookup slots full and the queue behind them growing. Every other lookup in the gateway waited behind them: at T084's pre-run every Telegram send timed out, and the store's connections failed, so the kill switch failed closed again and again. `core/resolve.ts` asks the resolvers in `/etc/resolv.conf` through c-ares (1 s a try, two tries), which holds no thread. It answers IP literals and `localhost` itself, since c-ares doesn't read `/etc/hosts`. Like `getaddrinfo`, it honors `ADDRCONFIG`, which net passes for a connect that names no family: a family no non-loopback interface has an address in isn't asked for, so a container without IPv6 is never handed an AAAA address, which net's happy eyeballs would try after 250 ms of IPv4 (the T188 review's S1). After a failed A query it asks for AAAA only when the name has no A record (`ENODATA`), and the error that says more than `ENODATA` is the one reported. A lookup's error keeps c-ares's code (`ENOTFOUND`, `ETIMEOUT`), so §2.5's `unavailable` carries that code.

**Departure (tasks.md T051, 2026-10-08): `node:http`, not `fetch` with an undici `Agent`.** This table first named `fetch`, with the connect timeout through an undici `Agent`'s `connect.timeout`. Node's built-in `fetch` exposes no connect timeout, and the `undici` package, whose `Agent` has one, isn't among the gateway's dependencies in plan.md's Technical Context; adding it would change the pinned set and the lockfile for one timeout. The adapter uses `node:http` instead, with the watchdog above for the connect timeout and the same request timeout and signals. Nothing else changes: instrumentation-http's ignore hook treats `node:http` requests as instrumentation-undici's treats `fetch` (telemetry.md §3.1), so a call to `model-server` still gets an HTTP client span under its `chat {model}` span, and no trace context leaves the stack.

### 3.2 `bedrock-converse` (`type: bedrock-converse`)

| Aspect | Contract |
|---|---|
| Module | `src/adapters/bedrock-converse.ts`. It is the only module that imports `@aws-sdk/*`. |
| Kind and provider | `kind: paid`, `provider: aws.bedrock` (fixed by the type) |
| Settings | `region` (`us-east-1`), `model` (the inference-profile ID the Author confirms), `additional_request_fields`, `timeouts`, `retry`, `circuit`, `credentials_warn_before_s` ([config-files.md §1](config-files.md#1-configroutingyaml)) |
| Client | `new BedrockRuntimeClient({ region, maxAttempts: 1, requestHandler: new NodeHttpHandler({ connectionTimeout: 1000, requestTimeout: 4000 }) })`. Credentials come from the default chain, with `AWS_PROFILE=h4reet-bedrock` and `HOME=/home/node`, and `~/.aws` mounted read-only from `~/.config/h4reet-ai/aws-home/.aws` ([research.md R-17](../research.md#r-17-the-runtime-aws-identity-the-author-narrowed-by-the-plan)). |
| Request | `ConverseCommand`: system messages become `system: [{text}]`; the others become `messages: [{role, content: [{text}]}]`, in order; `inferenceConfig: {maxTokens: maxOutputTokens, temperature?}`; and `additionalModelRequestFields` from the settings, whatever keeps extended thinking off for the confirmed model. The `abortSignal` combines the request's signal with a 4 s timeout. No streaming, tools, cache points, or guardrail configuration. |
| Response | `output.message.content[*].text`, joined, becomes `text`. `usage.inputTokens`, `outputTokens`, `cacheReadInputTokens`, and `cacheWriteInputTokens` become the usage. `stopReason`: `end_turn` and `stop_sequence` → `stop`; `max_tokens` → `length`; `content_filtered` and `guardrail_intervened` → `content_filter`; anything else → `other`. `$metadata.requestId` becomes `responseId`, and the configured model is the `responseModel`. |
| Retries | The gateway retries once, only on `rate_limited`, after 250 ms, and only if 250 ms plus the 4 s request timeout still fits before the deadline: `retry = {on: ['rate_limited'], max: 1, backoffMs: 250}`. Throttled calls aren't billed. |
| Billing on failure | A timeout is `possiblyBilled`: the request may have reached the model, so the meter charges the reserved maximum ([data-model.md §7.3](../data-model.md#73-commit-of-a-metered-call)). |
| Health probe (never spends) | Two checks, neither of which calls Bedrock. (1) It resolves credentials through the chain, which the SDK caches; a refresh exchanges the SSO token with the SSO portal (a disclosed flow, [plan.md §17](../plan.md#17-data-flows-that-leave-the-local-tier-fr-040)). It passes when the credentials resolve and expire more than 0 s from now, and fails as `credentials` otherwise. (2) It reads the SSO session's end, `expiresAt` in the profile's SSO token cache, without logging the token, into `credentialsExpireAt`. |
| Health cadence (the gateway, §6) | every 10 s; one failure makes it unhealthy and one pass healthy; the circuit breaker (3 failures, 30 s open) is combined in. At 2 h before `credentialsExpireAt`, the gateway queues `credentials_expiring` ([alerts.md §2](alerts.md#2-kinds-triggers-and-dedupe-keys)). The SDK can't refresh the SSO token through the read-only mount, so the Author runs `make aws-login`. |
| Where it can run | prod only. A route that names it outside `H4_ENV=prod` stops startup (exit 78). Non-prod stacks mount `deploy/aws-none`, which is empty, so no call is possible there even by mistake. |

### 3.3 `synthetic` (`type: synthetic`, dev only)

| Aspect | Contract |
|---|---|
| Module | `src/adapters/synthetic.ts` |
| Kind and provider | `kind: synthetic`, `provider: synthetic`, `server: {address: 'synthetic'}`. It never touches the network. |
| Where it can run | Only with `H4_ENV=dev`: a route that names it elsewhere stops startup (exit 78). It is built only when `GATEWAY_TEST_SYNTHETIC_SPEND=1`. Otherwise dev's route has no fallback, and hello with local down answers `no_fallback_in_stack`. |
| Settings | `model` (`metered-test`), `output_tokens` (1000) |
| `complete` | It returns `{text: 'synthetic response', usage: {inputTokens: 0, outputTokens: 1000}, finishReason: 'stop', responseModel: 'metered-test', responseId: 'synthetic-<uuid>', latencyMs}`. It ignores `maxOutputTokens`: its tokens are a unit of spend, not text. |
| `fixedUsage` | `{inputTokens: 0, outputTokens: 1000}`. At dev's price entry (output $100 per million tokens), every call costs and reserves exactly 100,000 micro-USD ($0.10). |
| `health` | always healthy; `disabled` if it was configured but not built |
| Used by | dev's FR-022 fallback, and `POST /admin/test/synthetic` ([operator-admin.md §3.2](operator-admin.md#32-post-admintestsynthetic)) |

## 4. The registry, and adding an adapter

**The registry** is `src/adapters/registry.ts`. At startup it imports every module in `dist/adapters/` except itself and helper modules whose names start with `_`. Each module exports one factory:

```ts
export interface AdapterFactory<S = unknown> {
  readonly type: string;                      // the routing.yaml `type` it serves
  readonly kinds: readonly AdapterKind[];     // the kinds this type may be declared as
  readonly settings: z.ZodType<S>;            // its routing.yaml settings; strict, no unknown keys
  readonly provider?: string;                 // a fixed gen_ai.provider.name, when the type has one
  create(id: string, settings: S, ctx: AdapterContext): ProviderAdapter;
}

export interface AdapterContext {
  env: Readonly<Record<string, string | undefined>>;  // only the keys its settings name
  logger: AdapterLogger;                              // the gateway's pino logger (info, warn, error), with the redaction rules
  realNow(): number;
}
```

- **Keys.** The registry keys factories by `type`. Two modules with the same type, or a module without `factory`, stop startup (exit 1).
- **Building.** `config/routing.yaml` names adapters by `type`. The registry validates each adapter's settings against its factory's schema and builds only the adapters this `H4_ENV`'s route names. An unknown type, or a kind the type doesn't allow, stops startup (exit 78). So does a factory's own refusal, an `AdapterConfigError` naming the env key and never its value (the local adapter's `local_url_not_in_stack` and `missing_env`, checked again where the URL is used).
- **The environment.** An adapter's `env` holds only the keys its own `*_env` settings name, so no store password, operator hash, or alert credential reaches an adapter.
- **No other file names a provider.** An ESLint `no-restricted-imports` rule refuses `@aws-sdk/*` outside `src/adapters/`. A unit test asserts that no file outside `src/adapters/` contains a provider name: the routes, the router, admission, the meter, telemetry, and alerts stay provider-agnostic (SC-006).

**Switching between existing adapters is configuration only (SC-006):**
- a different Bedrock model is `adapters.bedrock.model` in `config/routing.yaml`, plus its price entry in `config/prices.yaml`;
- a different local model is the stack's env file (`MODEL_FILE`, `MODEL_ALIAS`);
- a different fallback is `envs.prod.fallback`.

**Adding an adapter type,** such as a direct vendor API or OpenRouter (FR-021), changes no gateway source outside its own module:

1. **The module:** `services/gateway/src/adapters/<type>.ts`, exporting `factory`. It maps the API to `CompletionRequest`, `AdapterResult`, and `ProviderError` per §2, declares its `server` and `retry`, and implements a `health()` that never spends. The registry finds it at the next start. For an OpenAI-compatible vendor API or OpenRouter, the shorter path may be to let `openai-compatible` accept `kind: paid`, with `https` and an `api_key_env` setting. That is a change inside that one module.
2. **Its contract test:** `services/gateway/test/contract/<type>.contract.test.ts`, calling `describeAdapterContract('<type>', makeStubbedSubject, 'stub')` with a stub of its API (§5).
3. **Configuration** (agents, reviewed): an adapter entry in `config/routing.yaml`, routed as `envs.prod.fallback`. The schema keeps a `paid` adapter out of every route but prod's.
4. **What only the Author does** (human-only, or outside the gateway):
   - a new `config/prices.yaml` version with its price, without which prod won't start;
   - its credential in the prod env file and template ([env-files.md](env-files.md)), passed to the gateway by `deploy/compose.yaml`;
   - the credential's FR-007 deny-by-name and its matrix row, in an enforcement patch;
   - its endpoint as a row in `docs/data-flow-disclosure.md` (FR-040).
5. **The live run:** `make contract-live ENV=prod ADAPTER=<id> REASON="…"` (§5.3).

## 5. The contract suite

### 5.1 Signature

```ts
// services/gateway/test/contract/adapter-contract.ts
export type ContractMode = 'stub' | 'live';

export interface ContractSubject {
  adapter: ProviderAdapter;
  prices: PriceTable;          // the price version the cost assertions use
  stub?: StubControl;          // stub mode only
  recording?: LiveRecording;   // live mode only: what operator.py contract-record captured
}

export interface ContractHarness {
  logger: Logger;              // the suite's captured logger: the subject gives it to its adapter (C6)
}

export function describeAdapterContract(
  name: string,
  makeAdapter: (harness: ContractHarness) => Promise<ContractSubject>,
  mode: ContractMode,
): void;

export const CONTRACT_TIMEOUTS = { connectMs: 100, requestMs: 3_000 };   // §5.3's timeouts (T157)

export type StubBehavior =
  | { ok: { text: string; inputTokens: number; outputTokens: number; finish: 'stop' | 'length' | 'content_filter' } }
  | { delayMs: number }                 // longer than the request timeout
  | { refuse: true }                    // the connection is refused
  | { status: number; body?: string }   // an HTTP status, or the SDK exception mapped from it
  | { throttleOnce: true }              // throttled once, then ok
  | { malformed: true };                // a 200 whose body the adapter can't use

export interface StubControl {
  next(behavior: StubBehavior): void;   // the answer to the next completion request
  nextHealth?(behavior: StubBehavior): void;   // the next health probe's, where the probe reaches the stub (local's GET /models)
  requests(): ReadonlyArray<{ method: string; path: string; headers: Record<string, string>; body: unknown }>;
  canary: string;                       // a marker the stub plants in every request echo and error body
  reset(): void;
}

export interface LiveRecording {        // what operator.py contract-record writes (§5.3, §5.4)
  adapter: string;
  statusBefore: unknown;                // GET /admin/status
  statusAfter: unknown;
  cases: ReadonlyArray<{ name: string;
    request: { messages: ChatMessage[]; max_output_tokens: number; temperature?: number };
    status: number; body: unknown }>;   // each case's 200 or 502 body (operator-admin.md §5)
}
```

Every case runs through the gateway's real attempt wrapper (§6), with an in-memory span exporter and a captured logger. The assertions therefore see exactly what production emits.

Three additions to the first sketch of this signature (tasks.md T048, 2026-10-08), each needed to run an assertion as written: `makeAdapter` receives the harness, so the logger C6 reads is the one the adapter writes to; `nextHealth`, so C3 can make the local adapter's probe meet a 503, a refusal, and a timeout without a completion queued for the call taking the probe's answer; and `method` on a recorded request, so C3 and C9 can tell the probe from the call. `LiveRecording` is what the recorder (tasks.md T103) writes; the suite reads it in live mode.

### 5.2 Assertions

| # | Assertion | Stub | Live |
|---|---|---|---|
| C1 | **Normalized result.** `text` is a string. Every usage field is a non-negative integer. `finishReason` is one of the five values. `responseModel` isn't empty. `latencyMs` is a non-negative integer. | yes | yes |
| C2 | **`maxOutputTokens` respected.** `outputTokens ≤ maxOutputTokens`, and a long prompt with a cap of 8 ends with `length`. For an adapter with `fixedUsage`, this becomes "usage equals `fixedUsage`": the synthetic adapter's tokens are spend, not text. | yes | yes |
| C3 | **`health()` shape.** It resolves, never rejects, within its signal. It matches `HealthStatus`, and an unhealthy status carries a `reason`. It never spends: the stub records no completion request and no `ConverseCommand` while it runs. | yes | yes, from the recorded `/admin/status` entries |
| C4 | **Error mapping.** A timeout maps to `timeout` (`possiblyBilled` for a paid adapter); a refused connection to `unavailable` (not billed); 401, 403, or `AccessDeniedException` to `auth`; 429 or `ThrottlingException` to `rate_limited`; 400 or `ValidationException` to `bad_request`; 503 to `unavailable`; 500 to `provider_error`; a malformed 200 to `provider_error`. The `retryable` and `possiblyBilled` flags follow §2.5. | yes | no: not provokable on a real provider |
| C5 | **Retry policy.** With `{on: ['rate_limited'], max: 1}`, a throttle-once stub succeeds on the second attempt and leaves two client spans. With a deadline too short for a second attempt, there is one attempt and `rate_limited`. An adapter with `max: 0` makes exactly one request. | yes | no |
| C6 | **No payloads in errors.** For every error case, the message equals the kind. `String(err)`, `JSON.stringify(err)`, `err.code`, and every log record captured during the case contain neither the prompt, nor the system prompt, nor the stub's canary. | yes | yes, over recorded error bodies |
| C7 | **Deterministic cost.** For fixed usages, the price table's `cost` equals the expected integer micro-USD, rounded up once on the sum. Repeated calls give the same result, and the result doesn't depend on wall time once the version is fixed. Live: the recorded `cost_micro_usd` equals the cost recomputed from the recorded usage at the recorded price version. | yes | yes |
| C8 | **Span shape.** Exactly one CLIENT span per attempt, named `chat {gen_ai.request.model}`. Its attribute key set equals the canonical success set in [telemetry.md](telemetry.md); a failed attempt adds `error.type`. The key sets are identical across adapters; only the provider, model, and server values differ. | yes | yes, from the recorded `span.attribute_keys` |
| C9 | **Request mapping.** The system message reaches the provider as its system field (the OpenAI `system` role, the Converse `system` block). Messages keep their order. The output cap is sent as given. No client identifier, request ID, or `user` field leaves. The local adapter sends no `Authorization` header. | yes | no |
| C10 | **Deadline.** When `req.signal` aborts or the deadline passes, `complete()` rejects with `timeout` within 100 ms. | yes | no |
| C11 | **Settles once.** `complete()` resolves or rejects exactly once. There is no unhandled rejection, and no timer keeps the process alive after `close()`. | yes | no |
| C12 | **A filtered answer is a result.** OpenAI's `content_filter`, and Converse's `content_filtered` and `guardrail_intervened`, return `finishReason: 'content_filter'`, not an error. | yes | no |

**Past C4.** What an adapter's own column of §2.5 lists beyond C4's shared cases is tested beside the suite, in stub mode. For the local adapter, that is 404, 413, 422, 502, and 504, a DNS failure (`ENOTFOUND`, `ETIMEOUT`, as c-ares reports them since T188), and §3.1's connect watchdog, in `test/contract/local-openai.errors.test.ts` (tasks.md T151).

### 5.3 Three run modes

1. **In the sandbox** (`make test`, `vitest run`): no network beyond the sandbox's own loopback, and no credentials.
   - The local adapter runs against an in-process stub OpenAI server (`node:http` on `127.0.0.1`, a random port).
   - The Bedrock adapter runs against `aws-sdk-client-mock` 4.1.0 with `aws-sdk-client-mock-vitest` 8.0.0, which raises SDK exceptions by `name`.
   - The synthetic adapter runs directly.
   - Timeouts are set through the settings: request 3 s (T157, below), and connect 100 ms, except that the local adapter's subject keeps routing.yaml's 1 s connect. (Departure, round 3's review of tasks.md T151: at 100 ms a loaded host's stalled event loop fired the connect watchdog before the stub's accept arrived, and C3 failed about once in 17 runs. No case makes a connect hang, and `local-openai.errors.test.ts` tests the watchdog at its real 1 s.)
   - Every assertion runs, with C2's synthetic variant.
   - (Departure, tasks.md T073.) The synthetic adapter has no API, so nothing can be stubbed to fail: its subject has no `stub`, and counts its `complete()` calls instead (`ContractSubject.calls`). The assertions that need a stubbed answer run their direct variants, on the one failure it has, a request whose signal has aborted or whose deadline has passed: C4 maps both to `timeout`, retryable and not billed; C5 makes exactly one attempt and one span (`max: 0`); C6 checks those two errors; C8's failed attempt is that `timeout`; C9 shows that one call is made and its answer echoes no part of the request, since nothing is sent anywhere; C10 rejects both within 100 ms. C4's stubbed failures and C12 (a filtered answer) are skipped for it: it has no failure but the deadline, and nothing to filter. The suite's signature is unchanged.
   - (Departure, tasks.md T157.) C10's stub case allows 2,100 ms past the abort or the deadline, not 100 ms: the contract's 100 ms plus 2 s for a loaded host. One run's stalled event loop ended a call 1,093 ms past its deadline, though the deadline was what ended it. To keep what C10 proves, that the abort or the deadline ends the call and nothing later does, the suite's request timeout is 3 s, not 300 ms, and the stub's slow answer is 5 s, not 3 s: an adapter that ignored the deadline would end at the request timeout, 2,880 ms past it, and still fail. The direct variant keeps 100 ms. The cases that time out on purpose (C4's and C6's timeout, C11's slow answer) take 3 s each.
2. **Live, local** (`make contract-live ENV=<stack> ADAPTER=local REASON="…"`): against the stack's real model server, through `POST /admin/adapters/local/complete`. These calls are free and attributed `none`.
3. **Live, Bedrock** (`make contract-live ENV=prod ADAPTER=bedrock REASON="…"`, the Author's terminal): through prod's `POST /admin/adapters/bedrock/complete` ([operator-admin.md §5](operator-admin.md#5-live-adapter-calls-post-adminadaptersidcomplete)). Every call passes prod's admission and is charged to prod's day and month meters as `test`, not to the sub-budget (FR-031, FR-037). About 10 calls, under $0.05.

**Both live modes record, then replay:**
1. **Record.** `python3 -I -B -X pycache_prefix=/dev/null scripts/operator.py contract-record --stack $(ENV) --adapter $(ADAPTER) --cases services/gateway/test/contract/live-cases.json --out <tmp>/recording.json --reason "$$REASON"` reads `/admin/status`, sends each case, and reads `/admin/status` again. It writes requests, statuses, and response bodies into a 0700 temporary directory.
2. **Replay.** `vitest run test/contract` with `H4_CONTRACT_RECORDING` pointing at the recording, mounted read-only. It runs in the devcontainer image with `--network none`, on an exported tree, as the container phase of `tools/gates/gate` does ([plan.md §11](../plan.md#11-local-gates-fr-041)). It calls `describeAdapterContract(name, () => replaySubject(recording), 'live')`.
3. **Clean up.** The temporary directory is deleted. The recording holds only the test prompts and their completions, never a secret.

This keeps the operator token inside the stdlib CLI, out of `node_modules` and `dist/` ([research.md R-16](../research.md#r-16-the-operator-credential-a-bearer-token-per-stack-the-author)). It also keeps project code out of the Author's terminal except inside a container. `make contract-live` requires `REASON`, and refuses `ADAPTER=bedrock` unless `ENV=prod`. bash-gate blocks it for agents ([plan.md §13](../plan.md#13-the-forbidden-action-matrix)).

### 5.4 The live cases

`services/gateway/test/contract/live-cases.json` is committed. The recorder reads it, and the suite imports it, so the two can't drift.

| Case | Messages | `max_output_tokens` | Asserts |
|---|---|---|---|
| `hello-shape` | the hello system prompt ([gateway-http.md §2.2](gateway-http.md#22-the-fixed-system-prompt)), then "Say hello." | 128 | C1, C3, C7, C8 |
| `cap-length` | "Count from one to one hundred in words." | 8 | C2 (`length`) |
| `short-stop` | system "Answer in one word.", then "Name a colour." | 16 | C1, C2 |
| `multi-turn` | user, assistant, user | 32 | C1 |
| `non-ascii` | a short message in Hindi and Japanese | 32 | C1, C7 |
| `temperature-zero` | "Say hello." at temperature 0 | 16 | C1 |
| `system-only-once` | a system message plus a long user message near the 2,000-character cap | 16 | C1, C7 (input tokens priced) |
| `repeat-cost` | `hello-shape`, sent again | 128 | C7 |
| `health-before`, `health-after` | the recorded `/admin/status` adapter entries | – | C3 |

With the confirmed Haiku's price, the run is about 10 calls of under 1,000 input tokens and at most 128 output tokens each.

## 6. Around an adapter call: what the gateway does

The attempt wrapper in `src/core/gateway.ts`, the same for every adapter:

1. **One CLIENT span per attempt**, named `chat {gen_ai.request.model}`. It carries the `gen_ai.*` attributes from the result, `server.address` and `server.port` from `adapter.server`, and `error.type` from `ProviderError.code` or `kind`. It also carries `h4.cost.usd` (always set, 0 for local), `h4.cost.basis`, `h4.price.version`, `h4.route.decision`, `h4.route.reason`, `h4.meter.attribution`, `h4.stack`, `h4.routing.sha`, `h4.payload.sampled`, and Langfuse's generation-type attribute ([plan.md §5.7](../plan.md#57-telemetry), [telemetry.md](telemetry.md)).
2. **Payloads** (`gen_ai.input.messages`, `gen_ai.output.messages`) are added only when `TELEMETRY_PAYLOAD_SAMPLING=on` (dev only) and the span opts in, after secret redaction (FR-029).
3. **The retry policy:** another attempt, with its own span, only for a kind in `retry.on`, at most `retry.max` times, and only if the backoff plus the adapter's request timeout fits before the deadline.
4. **Health tracking:** the probe interval and timeout, and the unhealthy-after and healthy-after counts from `config/routing.yaml`, applied with the real clock. A call that fails as `unavailable` or `timeout` counts as a failed probe, except when the caller went away first: that ends the call with `timeout` too, and says nothing about the adapter (tasks.md T052).
5. **The circuit breaker,** for adapters with `circuit` settings (Bedrock): 3 consecutive failures of kind `unavailable`, `timeout`, `rate_limited`, `auth`, or `provider_error` open it for 30 s. Then one trial call is allowed: a success closes it, and a failure opens it for another 30 s. While open, the adapter's effective health is unhealthy, with `circuit_open`.
6. **Effective health** (the adapter's probe, combined with the circuit) feeds routing, `GET /health`, and the gauge `h4.adapter.healthy` (`h4.adapter`).
7. **Cost, metering, and the ledger:** [data-model.md §7](../data-model.md#7-transactions-and-background-work).
