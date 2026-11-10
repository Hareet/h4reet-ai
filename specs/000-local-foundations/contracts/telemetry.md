# Contract: telemetry

Spec 000 (FR-023, FR-026, FR-027, FR-028, FR-029, FR-034, FR-037; SC-001, SC-002, SC-005; User Story 2 scenario 1; User Story 5 scenarios 1, 2, and 5) · Plan: [§5.7](../plan.md#57-telemetry), [§6](../plan.md#6-observability) · ADRs: [0004](../../../docs/adr/0004-langfuse-and-grafana-over-opentelemetry.md), [0021](../../../docs/adr/0021-internal-network-prometheus-loki-edge.md)

What the services emit, what the collector does to it, and what the dashboard queries. The gateway emits exactly the names below, the dashboard `h4-runtime` queries exactly these names, and the contract suite and the breach test assert against them. A name changes here first, in the same commit as the code, the collector configuration, and the dashboard.

Related contracts: [gateway-http.md](gateway-http.md) (status codes and degraded causes), [alerts.md](alerts.md) (alert kinds), [operator-admin.md](operator-admin.md) (admin actions), [env-files.md](env-files.md) (the variables named here), and [data-model.md](../data-model.md) (the audit table and the state view the dashboard reads).

## 1. Rules that apply to every signal

1. **No payloads.** Prompts, completions, the system prompt, and request or response bodies never appear in a metric, a log record, or a span event. The one exception is a span attribute under the payload rule in [§3.4](#34-the-payload-rule), and only in dev (FR-029, research.md R-30).
2. **No secrets.** No token, password, key, or credential value appears anywhere. The gateway never puts one there, and the collector masks the known shapes as a second layer ([§6.3](#63-processors)).
3. **No client identifiers.** The client's address and its `X-H4-Client` label never appear in a metric attribute, a span attribute, or a log record. The ledger in the store is the only place the label lives ([data-model.md](../data-model.md)). The collector deletes the HTTP semantic-convention attributes that would carry them (`client.address`, `network.peer.address`, and the rest in [§6.3](#63-processors)).
4. **Bounded attribute values.** Every metric attribute takes values from a list in this contract. Nothing request-specific (IDs, messages, paths with parameters) is a metric attribute.
5. **Prometheus names.** Prometheus 3's OTLP receiver translates names with the `UnderscoreEscapingWithSuffixes` strategy, pinned in `prometheus.yml`: dots become underscores, a unit suffix is appended unless it is already a token of the name, and counters gain `_total`. Histograms become `_bucket`, `_sum`, and `_count` series. Attribute keys become labels the same way (`h4.route.decision` becomes `h4_route_decision`).
6. **Units are chosen for that translation.**
   - Money uses the annotation unit `{USD}`. Annotations in braces are dropped, so `h4.cost.usd` becomes `h4_cost_usd_total` and not `h4_cost_usd_USD_total`. The name itself carries the currency.
   - Flags and one-hot states use annotation units (`{flag}`, `{state}`, `{cause}`). Never the unit `1`: the translator would append `_ratio`.
   - Durations use `s`, which becomes `_seconds`.

## 2. Resource attributes

Every resource the collector forwards carries these. The gateway's SDK sets them, and the collector's `resource` processor overwrites the two that identify the stack, so no client can claim another stack's name. The collector's own metrics don't pass through its pipelines: its `service.telemetry.resource` sets the same values ([§6.4](#64-exporters-and-extensions); tasks.md T185).

| Attribute | Value | Set by | Notes |
|---|---|---|---|
| `service.name` | `gateway` for the gateway; `otel-collector` for the collector's own metrics; `claude-code` for Claude Code's metrics; `h4-gate` for the eval-history metric | `OTEL_SERVICE_NAME` (the gateway); the collector's `service.telemetry.resource`; Claude Code itself; `tools/gates/gate` | Promoted to the Prometheus label `service_name` and the Loki label `service_name` |
| `service.namespace` | `h4reet` | the SDK, then upserted by the collector; for the collector's own metrics, its `service.telemetry.resource` | Promoted to `service_namespace` |
| `deployment.environment.name` | the stack: `prod`, `dev`, or `dev-cpu` (`H4_STACK`) | the SDK, then upserted by the collector from its own `H4_STACK`; for the collector's own metrics, its `service.telemetry.resource`, from the same variable | Promoted to `deployment_environment_name`. Claude Code's metrics arrive at prod's collector and so carry `prod`; the FR-037 panel selects them by `service_name`. |
| `service.version` | the gateway's `package.json` version; the collector's own build, `0.162.0` | the SDK; the collector | Goes to Prometheus's `target_info`, not a label |
| `service.instance.id` | `<H4_STACK>-gateway`; `<H4_STACK>-otel-collector` for the collector's own metrics | the SDK; the collector's `service.telemetry.resource` | Stable across restarts, so a restart shows as a counter reset in the same series. Prometheus derives `instance` from it and `job` from `service.namespace/service.name` (`h4reet/gateway`, `h4reet/otel-collector`). |

Not present on any resource: `host.*`, `process.*`, `os.*`, `container.*`, and `cloud.*`. The gateway runs with `OTEL_NODE_RESOURCE_DETECTORS=env`, so no detector runs. The cloud detectors would call instance-metadata endpoints, which would be an undisclosed data flow. The collector deletes `host.name` and every `process.*` attribute from any resource as a second layer.

## 3. Traces

### 3.1 SDK setup

The gateway configures `@opentelemetry/sdk-node` in `src/telemetry/otel.ts`. Compose sets these variables on the gateway container; none of them is an env-file key ([env-files.md](env-files.md)):

| Variable | Value |
|---|---|
| `OTEL_SERVICE_NAME` | `gateway` |
| `OTEL_RESOURCE_ATTRIBUTES` | `service.namespace=h4reet,deployment.environment.name=${H4_STACK},service.instance.id=${H4_STACK}-gateway` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4318` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` |
| `OTEL_EXPORTER_OTLP_TIMEOUT` | `5000` (ms) |
| `OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER`, `OTEL_LOGS_EXPORTER` | `otlp` |
| `OTEL_METRIC_EXPORT_INTERVAL` | `10000` (ms) |
| `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE` | `cumulative` |
| `OTEL_NODE_RESOURCE_DETECTORS` | `env` |
| `OTEL_TRACES_SAMPLER` | `parentbased_always_on` |

- Spans go through a batch span processor (queue 2,048, export every 1 s). A full queue drops spans; it never blocks a request.
- Telemetry failures never touch enforcement: the meter and the kill switch live in the store, and nothing in the request path waits on an export. The exporters resolve the collector through c-ares, keep-alive as before (`EXPORT_AGENT`, tasks.md T189), so exports to a stopped collector hold neither of the two threads libuv gives lookups. Unlike the default agent, it reads no `/etc/hosts`, a c-ares `ETIMEOUT` or `ESERVFAIL` isn't one of the exporter's retryable codes, and on https it would ignore the environment's `OTEL_EXPORTER_OTLP_*CERTIFICATE`; the collector is plain http inside the stack. The store's connections resolve through c-ares too ([data-model.md §2.1](../data-model.md#21-migrations-roles-and-connections)).
- Health probes produce no spans: the HTTP instrumentation ignores `/health/live` and `/health` (`ignoreIncomingRequestHook`), and the collector's filter drops any that get through ([§6.3](#63-processors)).
- The gateway removes `client.address`, `client.port`, `network.peer.address`, `network.peer.port`, `user_agent.original`, `url.query`, and `url.full` from its spans, and any query string from `url.path`, in a span processor before export. The collector deletes them again, and strips the query string from any `url.full` that reaches it ([§6.3](#63-processors)).
- **Outbound HTTP.** The Telegram channel sends over `node:http(s)` (alerts.md §4.1, tasks.md T188). `instrumentation-http`'s `ignoreOutgoingRequestHook` skips the Telegram API host and the stand-in, as `instrumentation-undici`'s `ignoreRequestHook` does for any `fetch` to them, because that URL's path carries the bot token ([alerts.md §4.1](alerts.md#41-the-dispatcher)), so no client span records it. The collector's redaction (§6.3) stays the second layer.
- **No trace context leaves the stack.** Both client instrumentations' ignore hooks (`ignoreOutgoingRequestHook` for `node:http` and `node:https`, `ignoreRequestHook` for `fetch`) instrument a request only when its host is an in-stack service (one letter-first DNS label, [provider-adapter.md §3.1](provider-adapter.md)) and not a Telegram host. An ignored request gets neither a client span nor a `traceparent` header, and both hooks return before the instrumentation injects any header. So the Bedrock adapter's calls through the AWS SDK, and its SSO credential refresh, carry no trace ID to AWS, and the gateway's own `chat {model}` span is their client span (§3.2). The SDK test checks the wire for `traceparent`, `tracestate`, and `baggage`.
- **Outgoing spans need a parent.** The HTTP, undici, and pg instrumentations make spans only inside a request's trace (`requireParentforOutgoingSpans`, `requireParentforSpans`, `requireParentSpan`), so the model server's 1 s health probe, the store's background queries, and startup make no traces of their own. pg spans carry statements with placeholders, never values, and the statement that sets `grafana_ro`'s password is scrubbed from its span, because the verifier is as sensitive as a password hash.

### 3.2 The spans of one request

```text
POST /hello                      SERVER    one per request (also POST /admin/test/synthetic and
│                                          POST /admin/adapters/bedrock/complete, by their own routes)
└── gateway.route                INTERNAL  one per routing decision
    ├── chat {gen_ai.request.model}  CLIENT  one per provider attempt (local, then the fallback if any)
    └── chat {gen_ai.request.model}  CLIENT  a second attempt: the fallback, or Bedrock's one throttling retry
```

A request refused before routing (the per-client cap, a validation error) has a server span and no `gateway.route` span. A degraded request decided from the state alone (`store_unreachable`, `store_uninitialized`, `kill_switch_tripped`) has a `gateway.route` span and no client span.

Spec 002's usage events, `POST /room/events` ([room-events.md §3](../../002-the-room/contracts/room-events.md#3-the-gateways-route)), have a server span with no `gateway.route` or client span under it, only `@fastify/otel`'s own hook spans, as every route has (below). They make no model call, and their server span carries only the attributes below, with `h4.outcome` `ok` for its 204 and `invalid` for its 400 and 415. The event's body is in no span and no log record.

(Departure, tasks.md T074.) `POST /admin/test/synthetic` makes its calls one after another in one request, and gives each its own trace, as operator-admin.md §3.2's answer shows a trace ID per call: each call's `gateway.route` span is a root span, linked to the request's server span. So the breach test's T assertions, and an incident draft's list of the last metered calls, can name each call by its trace.

**(spec 011, Amendment 0-9) `alert.deliver`.** Each delivery attempt of an alert, on one channel, is an INTERNAL span of its own, a root started from no context, since the attempt has no request to hang under: `h4.channel`, `h4.alert.kind` (a kind, or `sample`), `h4.alert.form` (`designed` or `plain`), `h4.alert.fallback_reason` (when the plain form went in the designed one's place), `h4.outcome` (`delivered`, `retry`, `failed`), `h4.alert.attempt`, and `h4.alert.sample`. Never a text, a URL, a token, a chat ID, an address, or a response body: the attributes are built from closed lists and numbers alone ([alerts.md §4.4](alerts.md#44-outcomes-and-when-something-is-down)). In Langfuse each shows as a trace with no generation. `POST /admin/alert-samples`' server span carries `h4.action: alert_samples` ([operator-admin.md §2.4](operator-admin.md#24-post-adminalert-samples-spec-011)).

Langfuse shows the tree as one trace: the server span is the trace's root, and the client spans are generations ([§3.5](#35-what-langfuse-reads)). The other `@fastify/otel` hook spans, if the instrumentation emits them, carry no attributes beyond Fastify's own and no payloads.

### 3.3 Span attributes

**Server span** (`POST /hello` and the admin routes; kind SERVER; from `@fastify/otel` with `@opentelemetry/instrumentation-http`):

| Attribute | Presence | Values |
|---|---|---|
| `http.request.method` | always | `POST`, `GET` |
| `http.route` | always | the route template: `/hello`, `/admin/reset`, … |
| `url.path`, `url.scheme` | always | the path (no query string) and `http` |
| `http.response.status_code` | always | 200, 400, 401, 403, 409, 415, 429, 502, 503, … ([gateway-http.md](gateway-http.md), [operator-admin.md](operator-admin.md)) |
| `h4.stack` | always | `prod`, `dev`, `dev-cpu` |
| `h4.outcome` | always | `ok` (200), `degraded` (503 with a degraded cause), `refused` (429: `client_cap_exceeded` or `metered_capacity_exceeded`; and an admin refusal, 403 or 409), `invalid` (400, 415, and another 4xx, such as 404 or 413), `error` (502 `local_error`, an admin 503 `store_unreachable`, or an unexpected 5xx), `unauthorized` (401 on the admin listener). The admin refusals and the other 4xx were added with tasks.md T055, so every admin answer has an outcome. |
| `h4.degraded.cause` | when the response is degraded | the causes in [§4.1](#41-the-gateways-instruments) |
| `error.type` | on an `error` outcome | `local_error`; `provider_error` for the live adapter endpoint's 502 ([operator-admin.md §5](operator-admin.md#5-live-adapter-calls-post-adminadaptersidcomplete)); `store_unreachable` for an admin 503; the class name of an unexpected error; or `http_<status>` for any other 5xx |

**Routing span** (`gateway.route`; kind INTERNAL):

| Attribute | Presence | Values |
|---|---|---|
| `h4.stack` | always | as above |
| `h4.routing.sha` | always | SHA-256 of `config/routing.yaml`, 64 hex |
| `h4.state` | always | the state read at request start: `normal`, `degraded`, or `unknown` (store unreachable or empty) |
| `h4.route.decision` | always | the decision's kind ([provider-adapter.md §2.3](provider-adapter.md#23-route-decisions-degraded-causes-and-attribution)): `local`, `fallback`, `metered`, `degraded`. A live call to the local adapter through `POST /admin/adapters/local/complete` is `local`. |
| `h4.route.reason` | always | `local_healthy` (local); `local_unhealthy` or `local_failed` (fallback); the attribution, `metered` or `test` (metered); the degraded cause (degraded). The ledger keeps only the fallback reasons ([data-model.md §2.5](../data-model.md#25-ledger-the-model-call-record-fr-023)). |
| `h4.degraded.cause` | when the decision is `degraded` | the causes in [§4.1](#41-the-gateways-instruments) |
| `h4.meter.attribution` | when a metered call is admitted | `fallback`, `metered`, `test` |
| `h4.meter.commit` | when a metered call's commit didn't land at once and is retried in the background ([data-model.md §7.3](../data-model.md#73-commit-of-a-metered-call): "the span and the log record the pending commit"; added by tasks.md T074) | `pending` |

**Client span** (`chat {gen_ai.request.model}`; kind CLIENT; one per provider attempt):

| Attribute | Presence | Values |
|---|---|---|
| `gen_ai.operation.name` | always | `chat` |
| `gen_ai.provider.name` | always | `local`, `aws.bedrock`, `synthetic` (the adapter's `provider`, which is also the `provider` key in `config/prices.yaml`) |
| `gen_ai.request.model` | always | the adapter's model: the llama.cpp alias, the Bedrock inference-profile ID, or `metered-test` |
| `gen_ai.request.max_tokens` | always | the output cap (128 for hello, at most 512) |
| `server.address` | always | the adapter's declared `server` ([provider-adapter.md §2.2](provider-adapter.md#22-the-adapter)): `model-server`, `bedrock-runtime.us-east-1.amazonaws.com`, or `synthetic` |
| `server.port` | when the adapter declares a port | 8080 (local), 443 (Bedrock); the synthetic adapter declares none |
| `h4.cost.usd` | always | the call's cost in USD from the price table, a double; `0` for local, so Langfuse never prices a call from its own table |
| `h4.cost.basis` | always | `usage` (priced from the reported tokens), `reservation` (a possibly billed failure charged at the reserved maximum), `none` (an unbilled failure, cost 0). The ledger's fourth value, `expired` (a reservation settled at its maximum by the sweep, [data-model.md](../data-model.md) §2.4), has no span: the call that made it never committed. |
| `h4.price.version` | always | the active price version's `id` |
| `h4.route.decision`, `h4.route.reason` | always | as on the routing span |
| `h4.meter.attribution` | always | `none` (local), `fallback`, `metered`, `test` |
| `h4.stack`, `h4.routing.sha` | always | as above |
| `h4.payload.sampled` | always | `false`, or `true` under [§3.4](#34-the-payload-rule) |
| `langfuse.observation.type` | always | `generation` |
| `gen_ai.response.model` | on success | the model the provider reports |
| `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` | on success | non-negative integers |
| `gen_ai.response.finish_reasons` | on success | a string array of the normalized reasons: `stop`, `length`, `content_filter`, `error`, `other` ([provider-adapter.md](provider-adapter.md)) |
| `gen_ai.response.id` | on success, when the provider returns one | the provider's response ID |
| `error.type` | on failure | the `ProviderError`'s `code` when it has one (an SDK exception name such as `ThrottlingException`, or a Node error code such as `ECONNREFUSED`), otherwise its kind: `unavailable`, `timeout`, `rate_limited`, `auth`, `bad_request`, `content_filtered`, `provider_error` ([provider-adapter.md §2.5](provider-adapter.md#25-provider-errors)). The span status is ERROR, and its description is the kind, never a provider message. |
| `gen_ai.input.messages`, `gen_ai.output.messages` | only under [§3.4](#34-the-payload-rule) | JSON, after secret redaction |

- **The twin's turn (spec 007, Amendment 0-5).** The server span of `POST /room/turn` carries `h4.room.feature` (a selectable's ID, `free_talk`, or `none` for a body that didn't validate), `h4.room.topic` (a topic's ID, `free_talk`, or `none`), `h4.outcome` (`ok`, `withheld`, `degraded`, `refused`, `not_ready`, `invalid`, `error`), `h4.degraded.cause` when degraded (spec 000's causes or `twin_unavailable`), `h4.twin.guard` when an answer is withheld (the guard's name), and `h4.twin.pack_sha` and `h4.twin.prompt_sha` once the twin's files have loaded. The `gateway.route` span and each `chat {model}` client span of a twin call carry `h4.room.feature` and `h4.room.topic` too. No span carries the visitor's words, the answer, the grounding, the prompt, the path, or a client identifier, but this section's payload attributes under [§3.4](#34-the-payload-rule).
- Plan §5.7 also lists `h4.degraded.cause` on the client span. A client span ends when its attempt ends, before the routing decision that makes a response degraded, so the cause is recorded on the routing and server spans instead. A failed attempt carries `error.type`.
- **The canonical success set** is every key above marked "always", plus the "on success" keys, plus `server.port` for an adapter that declares a port. `gen_ai.response.id` belongs to it when the provider returns an ID; both shipped providers do. A failed attempt has the "always" keys plus `error.type`.
- The contract suite's check C8 compares these key sets with an in-memory exporter: `local-openai` and `bedrock-converse` must have identical sets, and only the values of the provider, model, and server attributes may differ (SC-006, [provider-adapter.md §5.2](provider-adapter.md#52-assertions)). The synthetic adapter's set is the same without `server.port`.

**(spec 010, Amendment 0-7)** An `anthropic-messages` call's client span is `chat claude-haiku-5-5`, with `gen_ai.provider.name: anthropic`, `server.address: api.anthropic.com`, and `server.port: 443`, and the canonical key set above, which the contract suite's C8 holds equal to the local and Bedrock adapters'. The SDK's own spans and trace propagation are off, and its transport is ignored by the HTTP instrumentation like every host outside the stack (§3.1), so the call has no other span and sends no trace header.

### 3.4 The payload rule

- `TELEMETRY_PAYLOAD_SAMPLING` is `off` or `on`, and `on` is allowed only when `H4_ENV=dev`. Preflight and the gateway's startup both refuse it elsewhere ([env-files.md](env-files.md), plan [§5.8](../plan.md#58-startup-refusals)).
- With `off`, which is every template's value, no span carries a payload attribute, and `h4.payload.sampled` is `false`.
- With `on`, every client span is sampled in spec 000: the gateway sets `h4.payload.sampled=true` and adds `gen_ai.input.messages` and `gen_ai.output.messages` as JSON strings in the semantic conventions' message format, after running them through the same secret patterns as the collector ([§6.3](#63-processors)). A sampling ratio is a later change.
- The collector deletes every payload attribute from a span unless both hold: the span carries `h4.payload.sampled=true`, and the collector's own `TELEMETRY_PAYLOAD_SAMPLING` is `on`. An unset variable counts as `off`.
- Log records and metrics never carry payloads, whatever the setting.

### 3.5 What Langfuse reads

Traces go to Langfuse's OTLP endpoint ([§6.4](#64-exporters-and-extensions)). Langfuse maps:
- the trace to the root server span (`POST /hello`), and its environment to `deployment.environment.name`;
- each client span with `langfuse.observation.type=generation` to a generation, with its model from `gen_ai.request.model` and `gen_ai.response.model`, and its usage from `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens`;
- the cost from `gen_ai.usage.cost`, which the collector sets to `h4.cost.usd` ([§6.3](#63-processors)).

T149 checked, on dev-cpu, which of two cost attributes Langfuse 4.54.0 reads: it reads `gen_ai.usage.cost` and `langfuse.observation.cost_details` alike. Generations sent with only one of them recorded a `totalCost` of 0.0123 and 0.0456. The collector keeps the plain number and no longer sets the JSON one; research.md R-08 records the check.

## 4. Metrics

### 4.1 The gateway's instruments

The canonical list. The gateway emits these and nothing else under `h4.`; the dashboard and the breach test's M assertions query the Prometheus names.

| OTel name | Instrument, unit | Attributes and their values | Prometheus name | Recorded when |
|---|---|---|---|---|
| `h4.gateway.requests` | counter, `{request}` | `h4.route.decision`: `local`, `fallback`, `metered`, `degraded`, or `none` (answered before routing: 400, 415, the per-client cap); `h4.outcome`: `ok`, `degraded`, `refused`, `invalid`, `error` | `h4_gateway_requests_total` | once per `POST /hello`, `POST /admin/test/synthetic` call, and `POST /admin/adapters/{id}/complete` call, when its response is sent |
| `h4.gateway.request.duration` | histogram, `s` | `h4.route.decision` | `h4_gateway_request_duration_seconds` | with the counter, from arrival to response |
| `h4.cost.usd` | counter, `{USD}` | `gen_ai.provider.name`; `gen_ai.request.model`; `h4.meter.attribution`: `none`, `fallback`, `metered`, `test`; `h4.room.feature` (spec 007, Amendment 0-5): a twin call's selectable ID or `free_talk`, from its pack, and `none` for every other call | `h4_cost_usd_total` | when a ledger row commits, by its cost (micro-USD ÷ 10⁶), including 0 for local calls and the settlement of an expired reservation ([data-model.md §2.4](../data-model.md#24-reservations-metered-calls-in-flight)); and 0 at the gateway's start on each series a routed metered adapter can be charged under (`fallback` for the fallback, `test` for a paid adapter, `metered` for the synthetic one), since Prometheus ingests no zero at a series' start and `increase()` would miss the first call (tasks.md T191) |
| `h4.meter.spend_usd` | gauge, `{USD}` | `h4.meter`: `day`, `month`, `fallback_day` | `h4_meter_spend_usd` | the current period's committed spend (`spent_micro`) |
| `h4.meter.ceiling_usd` | gauge, `{USD}` | `h4.meter` | `h4_meter_ceiling_usd` | 5.00 (`day`), 20.00 (`month`), and today's allowance (`fallback_day`) |
| `h4.meter.warn_usd` | gauge, `{USD}` | `h4.meter` | `h4_meter_warn_usd` | 3.50 (`day`), 14.00 (`month`), and the allowance minus 0.60 (`fallback_day`) |
| `h4.fallback.allowance_usd` | gauge, `{USD}` | none | `h4_fallback_allowance_usd` | today's `allowance_micro`: 2.00, then spend plus reservations plus 2.00 after a renewal (ADR 0001) |
| `h4.fallback.awaiting_renewal` | gauge, `{flag}` | none | `h4_fallback_awaiting_renewal` | 1 while `fallback_awaiting_renewal` is set, else 0 |
| `h4.kill_switch.state` | gauge, `{state}` | `h4.state`: `normal`, `degraded` | `h4_kill_switch_state` | one-hot: both series every time, exactly one at 1. An unreachable or empty store reports `degraded`, because unknown counts as degraded (FR-022, FR-031). |
| `h4.degraded.cause` | gauge, `{cause}` | `h4.cause`: `none`, `store_unreachable`, `store_uninitialized`, `kill_switch_tripped`, `no_fallback_in_stack`, `meter_at_ceiling`, `fallback_awaiting_renewal`, `fallback_spent_today`, `fallback_unavailable`, `journal_unwritable` | `h4_degraded_cause` | one-hot over all ten values: the cause a hello arriving now would get, evaluated read-only in FR-022's order from the snapshot; `none` when it would be answered ([gateway-http.md §3](gateway-http.md#3-degraded-causes)) |
| `h4.degraded.responses` | counter, `{response}` | `h4.cause`: the nine causes (not `none`) | `h4_degraded_responses_total` | once per degraded response |
| `h4.adapter.healthy` | gauge, `{flag}` | `h4.adapter`: the adapter IDs in `config/routing.yaml`: `local`, `bedrock`, `synthetic` | `h4_adapter_healthy` | 1 or 0 per configured adapter, from its effective health (the probe combined with the circuit, [provider-adapter.md §6](provider-adapter.md#6-around-an-adapter-call-what-the-gateway-does)) |
| `h4.alerts` | counter, `{attempt}` | `h4.channel`: `telegram`, `email`; `h4.alert.kind`: `warn`, `trip`, `fallback_exhausted`, `operator_action`, `credentials_expiring`, `fallback_unavailable`, `auth_failed`, `store_unreachable`, `reminder`; `h4.outcome`: `delivered`, `retry` (an attempt failed and another is due), `failed` (the channel gave up at 300 s) | `h4_alerts_total` | once per delivery attempt's outcome ([alerts.md §4](alerts.md#4-channels-delivery-and-retries)). **(spec 011, Amendment 0-9)** `h4.alert.kind` gains `sample`, a sample's attempts, counted apart from every real kind; and `h4.alert.form`: `designed`, `plain`, or `none` (a channel marked failed at its window's end with no attempt) |
| `h4.alert.delivery_lag` | histogram, `s` | none | `h4_alert_delivery_lag_seconds` | on each delivery, from the outbox row's `enqueued_at`; for the in-memory `store_unreachable` alert, which has no row, from the moment it was queued in memory. **(spec 011)** A sample records none: the histogram has no kind to keep it apart |
| `h4.alert.fallbacks` **(spec 011, Amendment 0-9)** | counter, `{fallback}` | `h4.channel`; `h4.alert.kind` (a kind, or `sample`); `h4.alert.fallback_reason`: `entities_refused`, `message_refused`, `render_failed`, `over_limit`, `not_rendered` | `h4_alert_fallbacks_total` | once per attempt that sent the plain form in the designed one's place, in the attempt that fell back ([alerts.md §4.1](alerts.md#41-the-dispatcher)) |
| `h4.operator.actions` | counter, `{action}` | `h4.action`: the audit action of an accepted write: `init`, `reset`, `renew`, `test_clock`, `test_synthetic`, `adapter_call`; and `twin_call` (spec 007, Amendment 0-4); and `alert_samples` (spec 011, Amendment 0-9) | `h4_operator_actions_total` | once per accepted admin write ([operator-admin.md §1.3](operator-admin.md#13-what-each-write-produces)) |
| `h4.operator.auth_failures` | counter, `{failure}` | `h4.auth.class`: `missing`, `malformed`, `wrong_prefix`, `mismatch` | `h4_operator_auth_failures_total` | once per failed admin authentication, counted in memory ([operator-admin.md §1.1](operator-admin.md#11-authentication)) |
| `h4.test_machinery.refused` | counter, `{request}` | none | `h4_test_machinery_refused_total` | each 403 from `POST /admin/test/*` outside dev |
| `h4.room.events` | counter, `{event}` | `kind`: the kinds in `config/room-events.yaml`; `id`: an object's or item's ID from the same file for `object_selected` and `item_selected`, `-` for the others (spec 002, [room-events.md §4](../../002-the-room/contracts/room-events.md#4-telemetry-and-the-dashboard)) | `h4_room_events_total` | each usage event the gateway accepts, with its 204 |
| `h4.room.events.refused` | counter, `{event}` | `reason`: `content_type`, `shape`, `kind`, `id` | `h4_room_events_refused_total` | each usage event refused with 415 or 400 |
| `h4.twin.turns` (spec 007) | counter, `{turn}` | `h4.room.feature`; `h4.outcome`: `ok`, `withheld`, `degraded`, `refused`, `not_ready`, `invalid`, `error`; `h4.cause`: spec 000's nine causes, `twin_unavailable`, or `none` | `h4_twin_turns_total` | once per `POST /room/turn`, when its response is sent |
| `h4.twin.turn.duration` (spec 007) | histogram, `s` | `h4.room.feature`; `h4.route.decision`: `local`, `fallback`, `metered`, `degraded`, `none` | `h4_twin_turn_duration_seconds` | with the counter, from arrival to response |
| `h4.twin.withheld` (spec 007) | counter, `{answer}` | `h4.twin.guard`: `length`, `numbers`, `amounts`, `disclosure`, `prompt`, `secrets`, `links`, `ownership`, `seva` (spec 007's plan, D28), `location`, `surname` (D29), `address` (D39), `privacy`, `agents_share`, `restated_claim` (D38), `repair_opener` (D34), `error` | `h4_twin_withheld_total` | each answer the turn route withholds, replaces, or repairs; `disclosure` counts an answer replaced by the profile's disclosure line in a turn that asks who or what the twin is (D37), and `address` and `restated_claim` an answer withheld because too little was left once their sentences came off (D38, D39); `repair_opener` counts an answer delivered without its opening agreement, with the outcome ok, and one withheld because agreement was all it said, with the outcome withheld; the admin route's go into the live runs' history instead |
| `h4.twin.redacted` (spec 007's plan, D40, D41) | counter, `{answer}` | `h4.twin.guard`: `numbers`, `amounts`, `seva`, `address`, `address_repair`, `restated_claim`, `claim_tags` | `h4_twin_redacted_total` | once per answer the turn route delivers with a sentence removed, for each guard that removed one, with `address_repair` when "email address" lost its "address" (D39), and with `claim_tags` when the corpus's claim tags came off it; an answer withheld or replaced whole counts in `h4.twin.withheld` alone; the admin route's go into the live runs' history instead |

**The gauges.**
- They are observable gauges. Their callback reads an in-process snapshot and never touches the store.
- The 10 s background task refreshes the snapshot from the store ([data-model.md §7.7](../data-model.md#77-background-work-in-the-gateway-process)). A commit, an operator write, or a sweep also replaces the snapshot's affected values as soon as its transaction commits, so a spend change doesn't wait for the next refresh.
- When the store can't be read, the meter and fallback gauges are not observed at all, so their series go stale and the freshness panel shows the gap. The state and cause gauges keep reporting (`degraded`, `store_unreachable`), since they don't need the store.
- A period with no meter row yet reports 0 spend and the configured allowance.

**Histogram buckets** (explicit, the same for every `s` histogram the gateway records, up to 120 s): 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120. `h4.alert.delivery_lag` uses 1, 5, 10, 20, 30, 60, 120, 180, 240, 300, 600.

**What is never a metric attribute:** a client address or label, a request or trace ID, a message, a reason text, a dedupe key, or an operator's fingerprint.

**(spec 010, Amendment 0-7)**

| OTel name | Instrument, unit | Attributes | Prometheus name | Recorded when |
|---|---|---|---|---|
| `h4.adapter.month_spend_usd` | gauge, `{USD}` | `h4.adapter` | `h4_adapter_month_spend_usd` | the current UTC month's committed spend of each capped paid adapter the route names, from the snapshot |
| `h4.adapter.month_cap_usd` | gauge, `{USD}` | `h4.adapter` | `h4_adapter_month_cap_usd` | its cap, from `config/budgets.yaml`'s `adapter_monthly_usd` |
| `h4.adapter.month_warn_usd` | gauge, `{USD}` | `h4.adapter` | `h4_adapter_month_warn_usd` | its warning, the cap × `warn_ratio` |

`h4.degraded.cause`, `h4.degraded.responses`, and `h4.twin.turns` gain the cause `adapter_month_spent`, after `meter_at_ceiling`; `h4.twin.withheld`'s `h4.twin.guard` gains `refusal`; and `h4.adapter.healthy` and `h4.cost.usd` carry the Anthropic adapter as they carry Bedrock, with `h4.cost.usd`'s zero series written at start under `fallback` and `test` for the routed paid adapter (spec 000's T191).

### 4.2 Semantic-convention metrics

| OTel name | Instrument, unit | Attributes | Prometheus name | Source |
|---|---|---|---|---|
| `gen_ai.client.token.usage` | histogram, `{token}` | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.token.type` (`input`, `output`) | `gen_ai_client_token_usage` (`_bucket`, `_sum`, `_count`) | the gateway, once per token type per successful attempt. Buckets: 1, 4, 16, 64, 256, 1,024, 4,096, 16,384, 65,536 (the conventions' advice, cut at the stack's context size). |
| `gen_ai.client.operation.duration` | histogram, `s` | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model` (on success), `server.address`, `error.type` (on failure) | `gen_ai_client_operation_duration_seconds` | the gateway, once per attempt |
| `http.server.request.duration` | histogram, `s` | `http.request.method`, `http.route`, `http.response.status_code`, `url.scheme`, `network.protocol.version`, `error.type` | `http_server_request_duration_seconds` | `@opentelemetry/instrumentation-http`, for every route on both listeners except the health checks: the ignore hook that keeps them out of traces (§3.1) skips their measurement too |

### 4.3 Metrics scraped by Prometheus

These don't pass through the collector's pipelines. Prometheus scrapes the targets ([§6.6](#66-prometheus-loki-and-grafana)), and their names are as the targets expose them. The exception is the collector's own telemetry: it pushes that to Prometheus's OTLP receiver ([§6.4](#64-exporters-and-extensions)), and its scrape keeps only `up` and the `scrape_*` series Prometheus writes for every scrape (tasks.md T185).

| Job (target) | Metrics the dashboard uses | Meaning |
|---|---|---|
| `model-server` (`model-server:8080/metrics`, every 5 s) | `up`; `llamacpp:prompt_tokens_total`; `llamacpp:tokens_predicted_total`; `llamacpp:predicted_tokens_seconds`; `llamacpp:requests_processing`; `llamacpp:requests_deferred` | `up` is 1 only when the server answers its metrics endpoint, which it does once the model is loaded. The `llamacpp:` names are build b11459's (`--metrics`); the first stack task checks them against the running server's `/metrics` and fixes this table if a name differs. Checked in T065 (2026-10-09): prod's Prometheus listed all five among its metric names. |
| `otel-collector`: `up` from the scrape of `otel-collector:8888/metrics`; the rest pushed over OTLP every 10 s | `up`; `otelcol_receiver_accepted_spans_total`, `otelcol_receiver_refused_spans_total`; `otelcol_exporter_sent_spans_total`, `otelcol_exporter_send_failed_spans_total`, `otelcol_exporter_enqueue_failed_spans_total`; the same three for `_metric_points_total` and `_log_records_total`; `otelcol_exporter_queue_size`, `otelcol_exporter_queue_capacity` | the collector's own telemetry at level `normal`, labelled by `exporter` (`otlphttp/langfuse`, `otlphttp/prometheus`, `otlphttp/loki`) and `receiver`, with job `h4reet/otel-collector` and instance `<stack>-otel-collector` ([§2](#2-resource-attributes)). **Pushed since T185.** Prometheus's OTLP translation appends `_total` to the counters, as to the gateway's ([§1](#1-rules-that-apply-to-every-signal) rule 5), and the two gauges keep their names. Each point carries its start time, so created-timestamp-zero-ingestion writes a 0 there ([§6.6](#66-prometheus-loki-and-grafana)) and a fresh collector's first batch counts. Scraped, the counters had no `_total` (T065, 2026-10-09) and no start time: on dev-cpu, `otelcol_exporter_sent_spans` went straight to 13, so the first batch read 0 (T149). On dev-cpu with the push, after a fresh collector and one hello, `otelcol_exporter_sent_spans_total{exporter="otlphttp/langfuse"}` read 0 at the collector's start, then 12, and `increase()` 12.2 (T185, 2026-10-18). The scrape drops every sample it takes, so it stores only `up` and Prometheus's own `scrape_*` series, and no `otelcol_` series is stored twice. The receivers' counters, the refusals among them, exist from the first request, at 0; an exporter's failure and drop counters appear only with their first count, so those series exist only after something has failed. |
| `loki` (`loki:3100/metrics`), `grafana` (`grafana:3000/metrics`), `clickhouse` (`clickhouse:9363/metrics`), `prometheus` (`localhost:9090/metrics`) | `up` | the telemetry-health panel's backend row |

### 4.4 Development-time metrics (FR-037)

These reach prod's collector through edge's x004 port, `127.0.0.1:18004` ([§6.1](#61-receivers)). They are dev-time usage on the Team plan: notional cost, kept apart from the production meter, and never added to `h4.cost.usd` (FR-037; research.md R-28).

| Source | OTel name | Prometheus name | Attributes kept |
|---|---|---|---|
| Claude Code's own exporter (`service.name=claude-code`; the closing patch's four settings variables, [plan.md §6](../plan.md#6-observability)) | `claude_code.cost.usage` (counter, `USD`) | `claude_code_cost_usage_USD_total` | `model`, `session.id` |
| the same | `claude_code.token.usage` (counter, `tokens`) | `claude_code_token_usage_tokens_total` | `model`, `type` (`input`, `output`, `cacheRead`, `cacheCreation`), `session.id` |
| `tools/gates/gate` (`service.name=h4-gate`), one export per agent-config eval run it records | `h4.devtime.eval.cost_usd` (gauge, `{USD}`) | `h4_devtime_eval_cost_usd` | `h4.eval.run`: the history file's name (`<UTC>-<branch>-<sha>`); `h4.eval.verdict`: `pass`, `fail` |
| the same | `h4.devtime.eval.tokens` (gauge, `{token}`) | `h4_devtime_eval_tokens` | `h4.eval.run`; `gen_ai.token.type`: `input`, `output`, `cache_read`, `cache_creation` |

- **Claude Code's units aren't annotations,** so the translator appends them (`_USD`, `_tokens`). The names above are what Prometheus stores; the first run of the panel confirms them.
- **The collector drops Claude Code's identity attributes** before anything is stored: `user.*` (account, email, ID) and `organization.id` ([§6.3](#63-processors)). `session.id` stays; its cardinality is one series per session.
- **Temporality.** Claude Code may export delta sums. Prometheus accepts only cumulative, so the collector's `deltatocumulative` processor converts them ([§6.3](#63-processors)).
- **The eval history.** `make evals-agent-config` writes the history entry ([plan.md §14](../plan.md#14-evals-and-red-team-scaffolds-agent-configuration-evals)). When the Author's gate records a run, it posts the entry's notional cost and tokens once, as OTLP/JSON to `http://127.0.0.1:18004/v1/metrics` (stdlib, no SDK), timestamped at the post. One series per run, so a run posted twice counts once in `max_over_time`. Older entries are not back-filled: Prometheus refuses samples older than its 30-minute out-of-order window.

## 5. Logs

### 5.1 The record

- **Where they go.** pino 10.4.0 writes JSON to stdout, which Docker's `local` driver keeps (`make logs` shows it through `deploy/scripts/redact.sh`). `@opentelemetry/instrumentation-pino` also sends each record over OTLP, through the collector to Loki.
- **Fields on every record:** `time`; `level`; `msg`, a fixed sentence per event that never interpolates request content; `event`; `h4.stack`; and `trace_id`, `span_id`, and `trace_flags` when a span is active (the instrumentation injects them). The OTel severity follows pino's level: info 9, warn 13, error 17, fatal 21.
- **Audit records** also carry `event.name=h4.audit` ([data-model.md §2.6](../data-model.md#26-audit_log-who-when-why-fr-034)).
- **In Loki,** the resource's `service.name`, `service.namespace`, and `deployment.environment.name` are index labels (`service_name`, …). Everything else is structured metadata with dots turned into underscores (`event`, `event_name`, `trace_id`, the fields), so a query reads `{service_name="gateway"} | event="alert.delivered"`.
- **The level** is `info`, fixed in compose. Fastify's own logger is off (`logger: false`, so it writes no request lines; Fastify 5.12 deprecates `disableRequestLogging`), so no URL, header, or body reaches a log; the gateway logs only the events below.

### 5.2 Events

| `event` | Level | When | Fields besides the common ones |
|---|---|---|---|
| `gateway.started` | info | startup finished | `routing_sha`, `price_version`, `adapters` (IDs), `h4_env` |
| `gateway.config_refused` | fatal | a startup refusal, just before exit 78 | `reason` (the code in [config-files.md](config-files.md) or plan §5.8), `key` or `path` (never a value) |
| `gateway.fatal` | fatal | a store problem retrying can't fix, just before exit 1: a migration whose file changed, or one older than the store's latest | `reason` (`migration_changed`, `migration_gap`) |
| `gateway.stopping` | info | SIGTERM or SIGINT: the listeners stop accepting, and requests in flight finish | `signal` |
| `request.failed` | error | an unexpected error answered with 500 `internal_error` | `error_class` (the error's code or class name, never its message), `route` (the route template, or `other`) |
| `migrations.applied` | info | after migrations | `versions` (the ones applied now), `grafana_ro_login` (`enabled` once the gateway has set its password, else `disabled`) |
| `call.completed` | info | each provider attempt, as its ledger row commits. A local call's row is written outside any lock and may fail; the record is written then too, so the call's FR-023 fields still have a record, and `state.unknown` records the failure (data-model.md §7.4; tasks.md T052) | `route_decision`, `route_reason`, `attribution`, `adapter`, `provider`, `request_model`, `response_model`, `input_tokens`, `output_tokens` (both left out when the attempt returned no usage), `latency_ms`, `cost_micro`, `cost_basis`, `price_version`, `outcome`, `error_kind` |
| `call.degraded` | warn | each degraded response | `cause`, `route_decision` |
| `call.refused` | info | each 429 | `error` (`client_cap_exceeded`, `metered_capacity_exceeded`), `limit` |
| `meter.threshold_crossed` | warn | a commit crosses a warning, a ceiling, or a fallback allowance | `meter`, `period`, `threshold` (`warn`, `ceiling`, `allowance`), `spent_micro`, `threshold_micro`, `grant_no` (fallback only) |
| `killswitch.tripped` | error | the commit that sets `degraded`: one record per transaction that moves the state from `normal` to `degraded`, naming every ceiling crossed in it, with the day's and the month's spend as it leaves them. A ceiling crossed on a stack that is degraded already sets nothing and has no record of its own; its trip alert, incident, and audit row still follow (tasks.md T068) | `ceilings`, `day_micro`, `month_micro` |
| `fallback.exhausted` | warn | committed fallback spend reaches the allowance | `grant_no`, `allowance_micro`, `spent_micro` |
| `reservation.expired` | warn | the sweep settles a reservation ([data-model.md §2.4](../data-model.md#24-reservations-metered-calls-in-flight)) | `reservation_id`, `attribution`, `max_micro` |
| `meter.commit_pending` | warn | a metered call's commit failed on the store, and is kept for retries every 2 s until its reservation expires ([data-model.md §7.3](../data-model.md#73-commit-of-a-metered-call): "the log records the pending commit"; added by tasks.md T072) | `reservation_id`, `attribution`, `error_class` |
| `meter.commit_gave_up` | error | a metered call's commit won't land, and the sweep settles its reservation at its maximum: the retries of a pending commit reached the reservation's expires_at; the store refused the commit's statement (a bug, 500-class, never retried); the gateway is stopping; or the call never settled at all and its reservation has expired, so the 10 s upkeep gives its slots back (added by tasks.md T072) | `reservation_id`, `attribution` |
| `meter.sweep_failed` | error | the 10 s reservation sweep failed; it runs again at the next tick (tasks.md T068) | `error_class` (a SQLSTATE or Node error code, never a message) |
| `operator.init`, `operator.reset`, `operator.renew`, `operator.test_clock`, `operator.test_synthetic`, `operator.adapter_call`; **(spec 011)** `operator.alert_samples` | info, with `event.name=h4.audit` | an accepted admin write | `audit_id`, `actor` (`operator:<stack>#<8 hex>`), `action`, `reason`, and `before` and `after` summaries in micro-USD as the audit row has them; **(spec 011)** `operator.alert_samples` has no `before`, and its `after` holds the kind asked for, the number of samples queued, and the delivery mode, where its audit row's `before` and `after` are NULL and its `detail` names the entries and their keys |
| `operator.auth_failed` | warn, with `event.name=h4.audit` | a failed authentication | `class` (`missing`, `malformed`, `wrong_prefix`, `mismatch`), `route` (the route template, or `other`) |
| `alert.queued` | info | an outbox row commits | `dedupe_key`, `kind` |
| `alert.delivered` | info | a channel delivers | `dedupe_key`, `kind`, `channel`, `attempt`, `lag_s`, `provider_ref` (Telegram's `message_id`; the SMTP reply code and queue ID); **(spec 011)** `form`, and `fallback_reason` when the plain form went in the designed one's place |
| `alert.retry` | warn | an attempt fails and another is due | `dedupe_key`, `channel`, `attempt`, `error_class`, `next_in_s`; **(spec 011)** `form`, and `fallback_reason` when the plain form went in the designed one's place |
| `alert.failed` | error | a channel gives up at 300 s | `dedupe_key`, `channel`, `attempts`, `error_class`; **(spec 011)** `form` (`none` when no attempt was made), and `fallback_reason` when the last attempt sent the plain form in the designed one's place |
| `alert.fallback` **(spec 011, Amendment 0-9)** | warn | an attempt sends the plain form in the designed one's place | `dedupe_key`, `kind`, `channel`, `attempt`, `reason`, and the refused designed send's `error_class` (`http_400`, `telegram_400`, `smtp_554`), none for a render's reason. No text, URL, or response body |
| `incident.drafted` | info | a draft is written | `incident_id`, `path` (relative to the state directory), `sha256` |
| `incident.draft_failed` | warn | a draft's write fails, when the failure starts or its class changes; it is retried every 10 s. At error, a draft that can never be written: its trip's audit row or ledger row is missing (tasks.md T078) | `incident_id`, `error_class` |
| `state.unknown` | error | the store is unreachable or empty: once when it starts, then once a minute | `condition` (`store_unreachable`, `store_uninitialized`), `since`, `error_class` (a SQLSTATE or Node error code, never a message) |
| `state.recovered` | info | the store answers again | `outage_s` |
| `journal.unwritable` | error | a `reserve` append fails | `error_class` |
| `adapter.health_changed` | info | an adapter's effective health flips | `adapter`, `healthy`, `reason` |
| `credentials.expiring` | warn | 2 h before the SSO session ends | `adapter`, `expires_at` |
| `test.machinery_refused` | warn | a `POST /admin/test/*` outside dev | `path` |
| `room_events.unavailable` | warn | at startup, when `config/room-events.yaml` is missing or invalid, so every usage event will be refused (spec 002, [room-events.md §3](../../002-the-room/contracts/room-events.md#3-the-gateways-route)) | `reason` (`missing`, `invalid`), `path` (where the file is invalid, as `objects[0]`, or empty; never a value) |

The breach test's L assertions read `alert.delivered`, `fallback.exhausted`, `killswitch.tripped`, and the `operator.*` audit records ([plan.md §8](../plan.md#8-the-breach-test)).

### 5.3 Redaction in the gateway

- **pino's `redact`** censors the fixed paths `req.headers.authorization`, `req.headers.cookie`, `*.authorization`, `*.password`, `*.token`, `messages`, and `*.messages`, with `[redacted]`.
- **A `formatters.log` hook** censors any key, at any depth, whose name contains `token`, `password`, `secret`, `authorization`, `cookie`, or `api_key` (any case), unless its value is a number or a boolean, as `call.completed`'s `input_tokens` and `output_tokens` are; or that equals `messages`, `prompt`, `completion`, `answer`, `system`, or `body`, whatever its value. The hook exists because `redact` matches whole path segments, not parts of a key, so it can't express plan §5.7's `*token*` and `*password*` on its own.
- **Never in a record:** a payload; a client address or label; a token, password, or key; a request URL (Telegram's carries the bot token, [alerts.md §4.1](alerts.md#41-the-dispatcher)); a provider's error body.

## 6. The collector

`deploy/otel/collector.yaml`, mounted read-only (compose never interpolates it). The collector-contrib 0.162.0 image expands `${env:…}` itself. Compose gives the container four variables and nothing else: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `TELEMETRY_PAYLOAD_SAMPLING`, and `H4_STACK`.

### 6.1 Receivers

| Receiver | Endpoint | Who sends | Feeds |
|---|---|---|---|
| `otlp` | gRPC `0.0.0.0:4317`, HTTP `0.0.0.0:4318`, bodies up to 4 MiB | the gateway, on `internal` (the collector joins no other network) | `traces`, `metrics`, `logs` |
| `otlp/devtime` | HTTP `0.0.0.0:4319` only | edge's x004 (`127.0.0.1:18004` on prod): Claude Code and `tools/gates/gate` | `metrics/devtime` only |

- **Edge's x004 block** forwards only `POST /v1/metrics`, with bodies up to 1 MiB, to `otel-collector:4319`. Every other path gets 404. So a process on the host's loopback can add dev-time metrics, but it can't inject traces or logs, or write `h4_*` series that look like the gateway's.
- x004 goes to its own receiver on 4319, for the reason above; plan §1 and §2 say the same.
- The one compose file publishes x004 on every stack (18104 on dev, and 18304 for dev-cpu, which the agents' engine publishes on the host's `127.0.0.1`), but only prod's is configured as Claude Code's endpoint.

### 6.2 Pipelines

```text
traces           otlp         → memory_limiter → filter/probes → transform/payloads → redaction → transform/redact-text → resource → batch → otlphttp/langfuse
metrics          otlp         → memory_limiter → redaction → resource → batch → otlphttp/prometheus
metrics/devtime  otlp/devtime → memory_limiter → filter/devtime → transform/devtime → deltatocumulative → resource → batch → otlphttp/prometheus
logs             otlp         → memory_limiter → transform/payloads → redaction → transform/redact-text → resource → batch → otlphttp/loki
```

`metrics/devtime` is this contract's addition to plan §6's three pipelines.

### 6.3 Processors

| Processor | Configuration | What it guarantees |
|---|---|---|
| `memory_limiter` | `check_interval: 1s`, `limit_mib: 200`, `spike_limit_mib: 50` (the container's cap is 256 MiB) | Over the limit, receivers refuse data, and the senders drop it rather than block. |
| `filter/probes` (traces) | Drops spans where `attributes["h4.probe"] == true`, or `url.path` or `http.route` matches `^/(health(/live)?\|metrics\|ping)$`. Drops span events whose name starts with `gen_ai.`. | Health and metrics probes never reach Langfuse. `h4.probe` is reserved for synthetic monitoring (spec 001's uptime checks); nothing in spec 000 sets it. |
| `transform/payloads` (traces and logs) | **Traces:** deletes every key matching `^(gen_ai\.(input\|output)\.messages\|gen_ai\.system_instructions\|gen_ai\.(prompt\|completion)(\..*)?\|langfuse\.observation\.(input\|output)\|input\.value\|output\.value\|http\.(request\|response)\.body(\..*)?)$` from span and span-event attributes, `where not (span.attributes["h4.payload.sampled"] == true and "${env:TELEMETRY_PAYLOAD_SAMPLING}" == "on")`. Always deletes `client.address`, `client.port`, `network.peer.address`, `network.peer.port`, `user_agent.original`, `url.query`, `http.request.header.*`, `http.response.header.*`, `authorization`, and `cookie`. Then sets `gen_ai.usage.cost` to `h4.cost.usd`, where `h4.cost.usd` is present ([§3.5](#35-what-langfuse-reads)). **Logs:** always deletes the same payload keys plus `messages`, `prompt`, and `completion`, and the same client keys. | FR-029's "no payloads unless sampling is explicitly on", enforced a second time outside the gateway; no client identifier in Langfuse or Loki |
| `redaction` | `allow_all_keys: true`, `summary: info`, and `blocked_values` set to the patterns below. A match is replaced by `****`. | Secret shapes are masked in every attribute value of every signal (FR-029). |
| `transform/redact-text` (traces and logs) | Applies the same patterns with `replace_pattern` to `span.name`, `span.status.message`, span-event names, and string log bodies. Strips the query string from `url.full` (`replace_pattern(span.attributes["url.full"], "\\?.*$", "")`). | The `redaction` processor covers attributes only; this covers the text fields. |
| `resource` | Upserts `service.namespace=h4reet` and `deployment.environment.name=${env:H4_STACK}`. Deletes `host.name` and every key matching `^process\.`. | The stack label is the collector's, not the sender's. |
| `batch` | `timeout: 2s`, `send_batch_size: 512`, `send_batch_max_size: 1024` | The 2 s step of the freshness budget ([§6.5](#65-the-freshness-budget)) |
| `filter/devtime` | Keeps only metrics whose name matches `^(claude_code\|h4\.devtime)\.` from a resource whose `service.name` is `claude-code` or `h4-gate`; drops the rest | x004 can't write anything but dev-time metrics. |
| `transform/devtime` | Deletes resource and data-point attributes matching `^(user\..*\|organization\.id\|terminal\.type\|app\.version\|host\..*\|os\..*)$` | No account, email, or organization identifier is stored |
| `deltatocumulative` | `max_stale: 10m`, `max_streams: 1000` | Delta sums from Claude Code become the cumulative series Prometheus accepts |

**The secret patterns** (RE2), shared by `redaction`, `transform/redact-text`, the gateway's own payload redaction ([§3.4](#34-the-payload-rule)), and the unit tests that pin them:

| Shape | Pattern |
|---|---|
| Langfuse keys | `(?:sk\|pk)-lf-[0-9A-Za-z-]{8,}` |
| AWS access key IDs | `\b(?:AKIA\|ASIA)[0-9A-Z]{16}\b` |
| Anthropic API keys (spec 010, FR-031) | `sk-ant-[A-Za-z0-9_-]{20,}` |
| Telegram bot tokens, alone or in a URL | `(?:bot)?[0-9]{6,12}:[A-Za-z0-9_-]{30,}` |
| Operator tokens | `h4op_(?:prod\|dev\|devcpu)_[A-Za-z0-9_-]{43}` |
| JWTs | `eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}` |
| `Bearer` and `Basic` credentials | `(?i)\b(?:bearer\|basic)\s+[A-Za-z0-9._~+/=-]{8,}` |
| Credentials in a URL | `[A-Za-z][A-Za-z0-9+.-]*://[^\s/:@]+:[^\s/@]+@` |
| PEM blocks | `-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----` |
| `key=value` secrets in text | `(?i)\b(?:password\|passwd\|secret\|token\|api[_-]?key)\s*[=:]\s*[^\s,;]+` |

A unit test (`services/gateway/test/unit/redact.test.ts`) feeds each shape, built at run time so the test file holds no secret, through the gateway's redactor. The collector's copy of the list is checked against the same fixtures by a pytest test that parses `collector.yaml`.

### 6.4 Exporters and extensions

| Name | Endpoint | Settings |
|---|---|---|
| `otlphttp/langfuse` | `traces_endpoint: http://langfuse-web:3000/api/public/otel/v1/traces` (Langfuse takes OTLP over HTTP only) | `auth: {authenticator: basicauth/langfuse}`; `compression: gzip`, which Langfuse 4.54.0 takes (T149); `timeout: 10s`; `retry_on_failure: {initial_interval: 5s, max_interval: 30s, max_elapsed_time: 600s}`; `sending_queue: {num_consumers: 2, queue_size: 600}`, in memory, which holds about 10 minutes of test traffic |
| `otlphttp/prometheus` | `metrics_endpoint: http://prometheus:9090/api/v1/otlp/v1/metrics` | `compression: gzip`; `retry_on_failure: {max_elapsed_time: 120s}`; `sending_queue: {queue_size: 120}` |
| `otlphttp/loki` | `logs_endpoint: http://loki:3100/otlp/v1/logs` | `compression: gzip`; `retry_on_failure: {max_elapsed_time: 300s}`; `sending_queue: {queue_size: 300}` |
| extension `basicauth/langfuse` | – | `client_auth: {username: ${env:LANGFUSE_PUBLIC_KEY}, password: ${env:LANGFUSE_SECRET_KEY}}` |
| extension `health_check` | `0.0.0.0:13133` | for the breach probe and `make status`; the image has no shell, so compose has no health check for it |
| `service.telemetry` | `metrics: {level: normal, readers: [{pull: {exporter: {prometheus: {host: 0.0.0.0, port: 8888}}}}, {periodic: {interval: 10000, exporter: {otlp: {protocol: http/protobuf, endpoint: http://prometheus:9090/api/v1/otlp/v1/metrics, compression: gzip, temporality_preference: cumulative}}}}]}`; `resource: {attributes: [service.name otel-collector, service.namespace h4reet, deployment.environment.name ${env:H4_STACK}, service.instance.id ${env:H4_STACK}-otel-collector]}`, each a `{name, value}` pair; `logs: {level: info}` | The collector pushes its own metrics every 10 s, the gateway's interval, to the endpoint `otlphttp/prometheus` uses, so they carry a start time ([§4.3](#43-metrics-scraped-by-prometheus), T185). They go straight there, not through the collector's own receiver, so the counters of a refusing receiver or a full queue never wait behind what they count. They skip the `resource` processor, so the resource sets its values; 0.162 warns that the inline map form is legacy and takes the `attributes` list. The reader's exporter is `otlp` with a `protocol`; `otlp_http` panics in 0.162's `validate`. Prometheus still scrapes 8888 (job `otel-collector`) and keeps only `up` ([§6.6](#66-prometheus-loki-and-grafana)) |

- **The keys exist before the first trace.** Langfuse's headless initialization creates the project `h4reet-<stack>` with exactly `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` as its API keys ([env-files.md](env-files.md)), so no UI step stands between `make up` and the first trace (SC-001).
- **Before Langfuse is ready,** its endpoint refuses, and the queue holds the traces. After 10 minutes of refusals, the collector drops them, and the telemetry-health panel shows the drops.

### 6.5 The freshness budget

How long a committed spend change takes to show on the dashboard (US2-1, SC-005, FR-028):

| Step | At most |
|---|---|
| The commit replaces the gauge snapshot ([§4.1](#41-the-gateways-instruments)) | immediate |
| The next metric export (`OTEL_METRIC_EXPORT_INTERVAL`) | 10 s |
| The collector's `batch` | 2 s |
| Prometheus's OTLP ingestion; the sample is queryable on arrival | under 1 s |
| Grafana's refresh | 10 s |
| The query and the render | about 2 s |
| **Total** | **about 25 s, against the 60 s required** |

- If a change had to wait for the 10 s gauge refresh instead, the worst case would be about 35 s, still inside 60 s.
- The breach test's M assertions poll Prometheus for up to 60 s ([plan.md §8](../plan.md#8-the-breach-test)).
- Traces reach Langfuse after the 2 s batch plus Langfuse's own ingestion (an S3 event, the worker, ClickHouse): seconds, normally. The quickstart allows 60 s.

### 6.6 Prometheus, Loki, and Grafana

- **Prometheus** (`deploy/prometheus/prometheus.yml`; flags `--web.enable-otlp-receiver --storage.tsdb.retention.time=30d --storage.tsdb.retention.size=2GB --enable-feature=created-timestamp-zero-ingestion`, and neither the admin nor the lifecycle API). The feature, experimental in 3.15, writes a 0 at each series' start time, so `rate()` and `increase()` count a new counter's first increment and a histogram's first observation. Without it, one hello after a start never showed on the request and latency panels (T065, 2026-10-09). It reaches what is pushed over OTLP: on dev-cpu, one hello after a gateway restart gave its counter a 0 and then a 1, an `increase()` of 1.09, and a p50 of 0.375 s. A scraped counter carries no start time, so it gets no 0: the collector's own counters went straight to their first value, and a fresh collector's first batch counted only from its second sample (T149). So the collector pushes its own metrics over OTLP too ([§6.4](#64-exporters-and-extensions)), and the `otel-collector` job drops every sample it scrapes, keeping `up` for the backends panel: Prometheus writes `up` for each scrape, and metric relabelling never touches it. On dev-cpu, a fresh collector's first batch to Langfuse read 0 and then 12 (tasks.md T185). The feature also makes Prometheus prefer protobuf scrapes; on dev-cpu's targets that renamed none of §4.3's metrics, and dropped only some of Grafana's own histograms, which no panel uses (T149):

  ```yaml
  otlp:
    promote_resource_attributes: [service.name, service.namespace, deployment.environment.name]
    translation_strategy: UnderscoreEscapingWithSuffixes
  storage:
    tsdb:
      out_of_order_time_window: 30m
  scrape_configs:   # every 15 s, the model server every 5 s
    - {job_name: model-server,   scrape_interval: 5s, static_configs: [{targets: ["model-server:8080"]}]}
    - {job_name: otel-collector, static_configs: [{targets: ["otel-collector:8888"]}],
       metric_relabel_configs: [{source_labels: [__name__], regex: ".+", action: drop}]}   # up only (T185)
    - {job_name: loki,           static_configs: [{targets: ["loki:3100"]}]}
    - {job_name: grafana,        static_configs: [{targets: ["grafana:3000"]}]}
    - {job_name: clickhouse,     static_configs: [{targets: ["clickhouse:9363"]}]}
    - {job_name: prometheus,     static_configs: [{targets: ["localhost:9090"]}]}
  ```

- **Loki** (`deploy/loki/loki.yaml`): `limits_config.allow_structured_metadata: true`, and `limits_config.otlp_config.resource_attributes.attributes_config: [{action: index_label, attributes: [service.name, service.namespace, deployment.environment.name]}]`, beside plan §6's settings.
- **Grafana datasources** (`deploy/grafana/provisioning/datasources/*.yaml`). Grafana expands `${…}` in provisioning files from its own environment, and compose gives it `H4_STACK`, `H4_LANGFUSE_PORT`, and `GATEWAY_GRAFANA_RO_PASSWORD`:

  | uid | Type | Settings |
  |---|---|---|
  | `prom` | Prometheus, the default | `url: http://prometheus:9090` |
  | `loki` | Loki | `url: http://loki:3100`; a derived field `{name: Langfuse trace, matcherType: label, matcherRegex: trace_id, url: "http://localhost:${H4_LANGFUSE_PORT}/project/h4reet-${H4_STACK}/traces/$${__value.raw}", urlDisplayLabel: Open in Langfuse}` (`$$` keeps Grafana's own variable literal) |
  | `gateway` | PostgreSQL | `url: gateway-state:5432`, `user: grafana_ro`, `jsonData: {database: gateway, sslmode: disable, postgresVersion: 1700}`, `secureJsonData: {password: ${GATEWAY_GRAFANA_RO_PASSWORD}}` |

- **The dashboard provider:** one file provider at `/etc/grafana/dashboards` with `allowUiUpdates: false`, `disableDeletion: true`, and `updateIntervalSeconds: 30`.

## 7. The dashboard `h4-runtime`

`deploy/grafana/dashboards/h4-runtime.json`: uid `h4-runtime`, title "h4reet.ai runtime", `timezone: utc` (the meter's days and months, FR-031), `refresh: 10s`, default range `now-6h`, and no template variables, because each stack has its own Grafana. Open it at `http://localhost:<x002>/d/h4-runtime`. PromQL panels use datasource `prom`, log panels `loki`, and SQL panels `gateway`.

### 7.1 State

| Panel | Type | Query | Shows |
|---|---|---|---|
| Kill switch (FR-028) | stat, and a state timeline | `max by (deployment_environment_name, h4_state) (h4_kill_switch_state) == 1` | the stack and its state; `normal` green, `degraded` red |
| Why responses are degraded (FR-022, FR-028) | stat | `max by (h4_cause) (h4_degraded_cause) == 1` | the cause a hello would get now; `none` green |
| Degraded responses by cause | bar chart | `sum by (h4_cause) (increase(h4_degraded_responses_total[$__rate_interval]))` | which causes answered, and when |
| Store state (authoritative) | table (SQL) | `SELECT stack, env, state, since, crossed, fallback_awaiting_renewal, fallback_awaiting_since, day_key, month_key, day_spent_micro / 1e6 AS day_usd, month_spent_micro / 1e6 AS month_usd, fallback_spent_micro / 1e6 AS fallback_usd, fallback_allowance_micro / 1e6 AS fallback_allowance_usd, fallback_grant_no FROM gateway.v_state` | the state straight from the store, which still works when telemetry is down ([data-model.md §2.9](../data-model.md#29-the-view-v_state-and-the-role-grafana_ro)) |
| Paid adapters' months (authoritative) | table (SQL) | `SELECT adapter, month, spent_micro / 1e6 AS spent_usd, reserved_micro / 1e6 AS reserved_usd, warned_at, reached_at FROM gateway.v_adapter_months ORDER BY month DESC, adapter` | each paid adapter's month as the store holds it, its spend, reservations, and when its warning and cap were reached (spec 010, FR-036) |

### 7.2 Spend

| Panel | Type | Query | Shows |
|---|---|---|---|
| Spend today (FR-028) | time series and stat | A: `max(h4_meter_spend_usd{h4_meter="day"})`; B: `max(h4_meter_warn_usd{h4_meter="day"})`; C: `max(h4_meter_ceiling_usd{h4_meter="day"})` | today's spend against $3.50 and $5.00 |
| Spend month-to-date (FR-028) | time series and stat | the same three with `h4_meter="month"` | against $14.00 and $20.00 |
| Fallback sub-budget remaining (FR-028, FR-030) | stat and time series | A: `h4_fallback_allowance_usd - ignoring (h4_meter) h4_meter_spend_usd{h4_meter="fallback_day"}`; B: `max(h4_fallback_awaiting_renewal)`; C: `max(h4_meter_warn_usd{h4_meter="fallback_day"})` | what fallback can still spend today; B maps 1 to "awaiting renewal" in red |
| Cost by provider and attribution (FR-023, SC-005) | table | `sum by (gen_ai_provider_name, gen_ai_request_model, h4_meter_attribution) (increase(h4_cost_usd_total[$__range]))` | Bedrock's fallback and test cost beside local's zero |
| Paid adapter's month against its cap | time series and stat | A: `max by (h4_adapter) (h4_adapter_month_spend_usd)`; B: `max by (h4_adapter) (h4_adapter_month_warn_usd)`; C: `max by (h4_adapter) (h4_adapter_month_cap_usd)` | each capped paid adapter's month against its warning and its cap (spec 010, FR-036) |

- Fallback remaining is the allowance minus committed fallback spend. `ignoring (h4_meter)` is needed because the spend series carries the `h4_meter` label and the allowance series doesn't. Without it the subtraction matches nothing and the panel shows no data.
- Each panel reads the meter's own values and never re-sums the cost counter, so it agrees with the store (ADR 0004).

### 7.3 Requests

| Panel | Type | Query |
|---|---|---|
| Request count (FR-028) | time series, and a stat over the range | `sum by (h4_route_decision) (rate(h4_gateway_requests_total[$__rate_interval]))`; stat: `sum(increase(h4_gateway_requests_total[$__range]))` |
| Latency p50 and p95 (FR-028) | time series | `histogram_quantile(0.50, sum by (le) (rate(h4_gateway_request_duration_seconds_bucket[$__rate_interval])))` and the same with `0.95` |
| Provider latency p95 | time series | `histogram_quantile(0.95, sum by (le, gen_ai_provider_name) (rate(gen_ai_client_operation_duration_seconds_bucket[$__rate_interval])))` |
| Error rate (FR-028) | time series | `sum(rate(h4_gateway_requests_total{h4_outcome="error"}[$__rate_interval])) / sum(rate(h4_gateway_requests_total[$__rate_interval]))` |
| Outcomes | bar chart | `sum by (h4_outcome) (increase(h4_gateway_requests_total[$__rate_interval]))` |

The error rate counts 5xx answers that aren't degraded: the 502 `local_error` and unexpected failures ([gateway-http.md §2.5.5](gateway-http.md#255-502-the-local-model-returned-an-error)). Degraded answers are by design and have their own panel. With no traffic the ratio has no value. Edge's `api_unavailable` isn't counted, because the gateway is down when it happens; the telemetry-health panel shows that instead.

### 7.4 Model server

| Panel | Type | Query |
|---|---|---|
| Model-server health (FR-028) | stat | A: `max(up{job="model-server"})`; B: `max by (h4_adapter) (h4_adapter_healthy)` |
| Generation | time series | `rate(llamacpp:tokens_predicted_total[$__rate_interval])`, `rate(llamacpp:prompt_tokens_total[$__rate_interval])` |
| Queue | time series | `max(llamacpp:requests_processing)`, `max(llamacpp:requests_deferred)` |
| Tokens by provider | table | `sum by (gen_ai_provider_name, gen_ai_token_type) (increase(gen_ai_client_token_usage_sum[$__range]))` |

### 7.5 Audit and alerts

| Panel | Type | Query |
|---|---|---|
| Audit log (FR-034) | table (SQL) | `SELECT recorded_at AS "time", ts AS gateway_time, actor, action, reason, before::text AS before, after::text AS after FROM gateway.audit_log WHERE $__timeFilter(recorded_at) ORDER BY recorded_at DESC LIMIT 200` |
| Alerts by channel and outcome (FR-032) | table | `sum by (h4_channel, h4_alert_kind, h4_outcome, h4_alert_form) (increase(h4_alerts_total[$__range]))` |
| Alerts sent as plain text by fallback | table | `sum by (h4_channel, h4_alert_kind, h4_alert_fallback_reason) (increase(h4_alert_fallbacks_total[$__range]))` |
| Alert delivery lag p95 | time series | `histogram_quantile(0.95, sum by (le) (rate(h4_alert_delivery_lag_seconds_bucket[$__rate_interval])))` |
| Alert log | logs | `{service_name="gateway"} \| event=~"alert\\.(queued\|delivered\|retry\|failed\|fallback)"` |
| Operator actions | bar chart | `sum by (h4_action) (increase(h4_operator_actions_total[$__range]))`, and `sum(increase(h4_test_machinery_refused_total[$__range]))` |
| Audit events, from the logs | logs | `{service_name="gateway"} \| event_name="h4.audit"` |

- The audit panel filters on `recorded_at`, the real time, so dev's test-clock jumps don't push rows outside the dashboard's range. It shows the gateway's own time beside it.
- **(spec 011, Amendment 0-9)** The outcomes table shows each attempt's form, `designed`, `plain`, or `none`; "Alerts sent as plain text by fallback" sits beside it, by channel, kind, and reason, where a fallback shows though its alert arrived (FR-046); and the alert log reads `alert.fallback` too. Its runbook is `alert-channel-down.md`'s "Alerts arrive as plain text" ([alerts.md §6](alerts.md#6-runbooks)). A sample request is a rare operator write, as a reset is, so it has no panel of its own: its request is a row of the audit log (`alert_samples`), and its samples' deliveries rows of the two alert tables under the kind `sample`.
- The table is `grafana_ro`'s: SELECT on `gateway.audit_log` and `gateway.v_state` only ([research.md R-10](../research.md#r-10-grafanas-audit-panel-reads-the-store-not-telemetry)). The two log panels are secondary; they go empty during a telemetry outage, and the table doesn't.

### 7.6 Telemetry health

| Panel | Type | Query |
|---|---|---|
| Backends up | stat, one per job | `max by (job) (up{job=~"model-server\|otel-collector\|loki\|grafana\|clickhouse\|prometheus"})` |
| Spend freshness | stat, in seconds | `time() - max(timestamp(h4_meter_spend_usd{h4_meter="day"}))`. Green under 30, amber under 60, red at 60 or more, and red on no data. |
| Export failures | time series | `sum by (exporter) (rate(otelcol_exporter_send_failed_spans_total[5m]))`, and the same for `_metric_points_total` and `_log_records_total` |
| Dropped at the queue | time series | `sum by (exporter) (rate(otelcol_exporter_enqueue_failed_spans_total[5m]))`, and the same for metric points and log records |
| Queue fill | time series | `max by (exporter) (otelcol_exporter_queue_size / otelcol_exporter_queue_capacity)` |
| Spans to Langfuse | time series | `sum(rate(otelcol_exporter_sent_spans_total{exporter="otlphttp/langfuse"}[5m]))` |
| Refused at the receiver | time series | `sum by (receiver) (rate(otelcol_receiver_refused_spans_total[5m]))`, and the same for metric points and log records |

The collector pushes its own metrics, so its counters carry `_total` and a fresh collector's first batch counts ([§4.3](#43-metrics-scraped-by-prometheus), tasks.md T185). Its exporters' failure and drop series appear only with their first count, so "No data" in those two panels means nothing has failed yet; the receivers' refusals read 0 from the first request. This row is how a degraded telemetry pipeline shows itself ([plan.md §19](../plan.md#19-degraded-modes)): a stale freshness value, failures and drops per exporter, and backends down.

### 7.7 Development time (FR-037)

The row's title says what it is: "Development time on the Team plan: notional cost, outside the production meter". Its data arrives only on prod ([§4.4](#44-development-time-metrics-fr-037)), so on dev and dev-cpu these panels are empty.

| Panel | Type | Query |
|---|---|---|
| Claude Code notional cost by model | table and stat | `sum by (model) (increase(claude_code_cost_usage_USD_total[$__range]))` |
| Claude Code tokens by type | bar chart | `sum by (type) (increase(claude_code_token_usage_tokens_total[$__range]))` |
| Agent-config eval runs: notional cost | stat | `sum(max_over_time(h4_devtime_eval_cost_usd[$__range]))` |
| Agent-config eval runs: tokens | bar chart | `sum by (gen_ai_token_type) (max_over_time(h4_devtime_eval_tokens[$__range]))` |
| Agent-config eval runs | table | `max by (h4_eval_run, h4_eval_verdict) (max_over_time(h4_devtime_eval_cost_usd[$__range]))` |

For a month's figure, set the range to the month. Prometheus keeps 30 days; the committed history in `evals/agent-config/history/` is the long-term record (SC-008).

### 7.8 The room (spec 002)

The row's title is "Room": what the room's visitors use, counted with no visitor data (spec 002, FR-054 and FR-056; [room-events.md §4](../../002-the-room/contracts/room-events.md#4-telemetry-and-the-dashboard)). Each usage event the gateway accepts is one increment of `h4_room_events_total`, labelled with its `kind` and `id` alone; each one it refuses, of `h4_room_events_refused_total` by `reason`. The row sits above the development-time row.

| Panel | Type | Query |
|---|---|---|
| Use per object per day (FR-056) | bar chart | `sum by (id) (increase(h4_room_events_total{kind="object_selected"}[1d]))` |
| Use per item per day (FR-056) | bar chart | `sum by (id) (increase(h4_room_events_total{kind="item_selected"}[1d]))` |
| PDF downloads per day (FR-056) | stat | `sum(increase(h4_room_events_total{kind="pdf_downloaded"}[1d]))` |
| Visits shown the 2D mode (FR-056) | stat, as a share | `sum(increase(h4_room_events_total{kind="mode_2d"}[$__range])) / sum(increase(h4_room_events_total{kind=~"resume_opened\|resume_kept"}[$__range]))` |
| Visits whose avatar failed | stat, as a share | `sum(increase(h4_room_events_total{kind="avatar_failed"}[$__range])) / sum(increase(h4_room_events_total{kind=~"resume_opened\|resume_kept"}[$__range]))` |
| Turns sent and talk presses | bar chart | `sum by (kind) (increase(h4_room_events_total{kind=~"turn_sent\|voice_pressed"}[$__rate_interval]))` |
| Events refused | bar chart | `sum by (reason) (increase(h4_room_events_refused_total[$__rate_interval]))` |
| Visits that walked (FR-053) | stat, as a share | `sum(increase(h4_room_events_total{kind="walk_started"}[$__range])) / sum(increase(h4_room_events_total{kind=~"resume_opened\|resume_kept"}[$__range]))` |
| Visits in full screen (FR-062) | stat, as a share | `sum(increase(h4_room_events_total{kind="fullscreen_entered"}[$__range])) / sum(increase(h4_room_events_total{kind=~"resume_opened\|resume_kept"}[$__range]))` |
| Visits whose loading was cut short (FR-048) | stat, as a share | `sum(increase(h4_room_events_total{kind="loading_cut_short"}[$__range])) / sum(increase(h4_room_events_total{kind=~"resume_opened\|resume_kept"}[$__range]))` |

- **(spec 005)** "Visits in full screen" (its FR-062; Amendment H8): `fullscreen_entered`, sent once a visit at the first entry into full screen, over the same stand-in for visits, read as "Visits that walked" is read, its panel beside that one.
- **(spec 012)** "Visits whose loading was cut short" (its FR-048; Amendment L4): `loading_cut_short`, sent once a visit when the loader gives way at its ceiling with the room's files still loading, over the same stand-in for visits, read as "Visits that walked" is read, its panel beside "Visits in full screen". It says how often the ceiling binds, which is whether the first visit is too heavy for visitors' connections, and it is a rough share in both directions: 2D visits count in its denominator and never show the loader, which pulls it low; and the event is sent before the hand-off, so a visit cut short that leaves before the hand-off's offer counts in its numerator alone, which pulls it high (the review's N3).
- **Per day** is the 24 hours before the range's end. The two use panels read one instant there, and the PDF stat shows its last value, so the default range shows the last 24 hours, and a range that ends at a past midnight shows that day (the dashboard is in UTC). The gateway's clock gives each event its time; the browser sends none.
- **The 2D share** is `mode_2d` over `resume_opened` plus `resume_kept`, a stand-in for visits, since no visit is counted (FR-054). Every visit that reaches the room ends its hand-off with one of the two; one that keeps the resume and opens it later counts twice, so the share reads low rather than high. With no visit in the range it has no value.
- **The walked share** is `walk_started`, sent once a visit at the first entry into the walking view, over the same stand-in for visits as the 2D share, `resume_opened` plus `resume_kept`, read the same way: low rather than high, and no value with no visit in the range (spec 008, Amendment M1).
- **Visits whose avatar failed** (spec 009, FR-034; its Amendment M1) is `avatar_failed` over `resume_opened` plus `resume_kept`, read as the 2D share is read: a visit sends `avatar_failed` at most once, with no identifier, when a figure's avatar file failed to load after its retry and the figure kept its fallback; a skip, a missing file, a device below the floor, or a room in 2D sends none.
- **Turns sent** count the text box's sends; **talk presses**, the talk button's. Both answer with a fixed message until the twin's conversation exists.
- **Waiting for their groups** (FR-056's other panels, which have no data until their calls exist): the conversation's panels, each room feature's cost beside its latency and errors, turns per room feature, degraded turns by cause, withheld answers, and the model each turn used, are §7.10's, which spec 007 adds (its Amendment 0-5). Recognition's latency and failures come with push-to-talk (group 8), and the voice's failures with the voice (group 9).

### 7.9 Room live state (spec 004)

The row's title is "Room live state": the status requests behind the room's laptop, and the class of the tier the relay's status would show now (spec 004, FR-072 and SC-014; its contracts/room-live-state-telemetry.md). The series are spec 001's relay's, as spec 004's Amendment A2 amends its contracts/relay-http.md §10: `h4_relay_requests_total` and `h4_relay_cap_refusals_total` gain the label `h4_relay_route` (`hello`, `status`, or `other`), the status bucket's refusals carry `h4_cap_limit="status_per_minute"`, and the one-hot gauge `h4_relay_status_class` reports, by `h4_class`, the class FR-041's table gives the status the relay would answer now: `local`, `cloud`, `resting`, `budget`, `unavailable`, or `unknown`. Until spec 001's relay emits them, this section is in `deploy/scripts/test_dashboard.py`'s `SECTIONS` but not in its `REQUIRED`, and the dashboard has none of its panels. The change that switches the room's live source on adds the panels and makes the section required. The row sits right below "Room".

| Panel | Type | Query |
|---|---|---|
| Status requests a minute (FR-072) | time series | `sum(rate(h4_relay_requests_total{h4_relay_route="status"}[$__rate_interval])) * 60` |
| Status 429s a minute (FR-072) | time series | `sum(rate(h4_relay_cap_refusals_total{h4_relay_route="status"}[$__rate_interval])) * 60` |
| Time in each class (FR-072, SC-014) | bar chart | `avg by (h4_class) (avg_over_time(h4_relay_status_class[$__range]))` |

- **Status requests** are every `GET /api/status` the relay answers, on both listeners: the room's polls, at most 2 a minute per visible, unpaused room; the `/status/` page's, every 60 s while it's visible; the snapshot sink's reads; and probes. The room's polls and the `/status/` page's can't be told apart, and both panels' descriptions say so.
- **The 429s** are the status bucket's, `status_per_minute`: 30 a minute with a burst of 10, per address, shared by every visitor behind one address. A refused poll leaves that room's laptop at unknown until its next answer.
- **Time in each class** is the share of the range the gauge spent at 1 in each class, read once at the range's end. It's the relay's view: a room's own rows (the live source, pause, a failed or stale request, a fallback reply) aren't in it.

### 7.10 Room conversation (spec 007)

The row's title is "Room conversation": the twin's turns, from `h4_twin_turns_total`, `h4_twin_turn_duration_seconds`, `h4_twin_withheld_total`, `h4_twin_redacted_total` (spec 007's plan, D41), and `h4_cost_usd_total`'s `h4_room_feature`, and the model each turn used, from the store's `gateway.v_twin_models` through `grafana_ro` (spec 007, FR-045; its Amendment 0-5; its plan §9, departures D7 and D12). It sits below "Room", and below "Room live state" once that row exists. Each feature's cost sits beside its latency and its errors (Principle V). No panel reads a visitor's words, an answer, or a path: no series holds them.

| Panel | Type | Query |
|---|---|---|
| Turns per feature, by outcome (FR-045) | bar chart | `sum by (h4_room_feature, h4_outcome) (increase(h4_twin_turns_total[$__rate_interval]))` |
| Cost per feature, today (FR-045) | bar chart | `sum by (h4_room_feature) (increase(h4_cost_usd_total{h4_room_feature!="none", h4_meter_attribution!="test"}[1d]))` |
| Turn latency, p95 by feature (FR-045) | time series | `histogram_quantile(0.95, sum by (le, h4_room_feature) (rate(h4_twin_turn_duration_seconds_bucket[$__rate_interval])))` |
| Cost per feature, 30 days (FR-045) | bar chart | `sum by (h4_room_feature) (increase(h4_cost_usd_total{h4_room_feature!="none", h4_meter_attribution!="test"}[30d]))` |
| Turn errors by feature (FR-045) | time series | `sum by (h4_room_feature) (increase(h4_twin_turns_total{h4_outcome=~"error\|degraded"}[$__rate_interval]))` |
| Degraded turns by cause (FR-045) | bar chart | `sum by (h4_cause) (increase(h4_twin_turns_total{h4_outcome="degraded"}[$__rate_interval]))` |
| Answers withheld, by guard (FR-045) | bar chart | `sum by (h4_twin_guard) (increase(h4_twin_withheld_total[$__rate_interval]))`, and the answers delivered with a sentence removed, by the guard that removed it (spec 007's plan, D41): `sum by (h4_twin_guard) (increase(h4_twin_redacted_total[$__rate_interval]))` |
| Answered locally (FR-045) | stat, as a share | `sum(increase(h4_twin_turn_duration_seconds_count{h4_route_decision="local"}[$__range])) / sum(increase(h4_twin_turn_duration_seconds_count{h4_route_decision=~"local\|fallback"}[$__range]))` |
| The model each turn used (FR-045) | table (SQL) | `SELECT request_model, room_feature, count(*) AS turns FROM gateway.v_twin_models WHERE ts > now() - interval '1 day' GROUP BY request_model, room_feature ORDER BY turns DESC` |

- **Today** is the 24 hours before the range's end, and **30 days** the 30 before it: rolling windows, while the meter's own day and month stay the calendar's in UTC. The Author's evaluation calls, attributed `test`, are left out of the cost.
- **Answered locally** is the share of answered turns the local model answered over the range; a turn that degraded or was refused counts in neither part.

## 8. What holds this contract

| Check | Where | What it proves |
|---|---|---|
| Instrument inventory | `services/gateway/test/unit/telemetry-names.test.ts` | After a scripted run with an in-memory metric reader, the set of `h4.*` instruments, their units, and their attribute keys equal [§4.1](#41-the-gateways-instruments). A new name fails the test until this file has it. |
| Span keys | the contract suite's C8 ([provider-adapter.md §5.2](provider-adapter.md#52-assertions)) | [§3.3](#33-span-attributes)'s canonical success set, identical across `local-openai` and `bedrock-converse` |
| Redaction | `services/gateway/test/unit/redact.test.ts`, and a pytest test that parses `deploy/otel/collector.yaml` | every pattern in [§6.3](#63-processors) masks its fixture, in both copies; payload keys are deleted unless sampled |
| The collector's own metrics | `deploy/scripts/test_observability.py`, and `test_dashboard.py` | the collector pushes them to `otlphttp/prometheus`'s endpoint every 10 s, with the stack's labels; the `otel-collector` job keeps only `up`; the panels read the pushed `_total` names (T185) |
| Dashboard queries | a pytest test, `deploy/scripts/test_dashboard.py` | every metric name in `h4-runtime.json` appears in this file; every FR-028, FR-034, and FR-037 panel exists, and spec 002's FR-056 panels in §7.8; the datasource uids are `prom`, `loki`, and `gateway` |
| End to end | the breach test's T, M, and L assertions ([plan.md §8](../plan.md#8-the-breach-test)), and [quickstart.md](../quickstart.md) | the names, the 60 s freshness, and the Langfuse trace, on a running stack |

Checked once, in the first stack task, and recorded in research.md: the `llamacpp:` names of build b11459; which cost attribute Langfuse 4.54.0 reads; whether Langfuse accepts gzip; and the Prometheus names of Claude Code's two metrics.
