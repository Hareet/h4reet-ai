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

Every resource the collector forwards carries these. The gateway's SDK sets them, and the collector's `resource` processor overwrites the two that identify the stack, so no client can claim another stack's name.

| Attribute | Value | Set by | Notes |
|---|---|---|---|
| `service.name` | `gateway` for the gateway; `claude-code` for Claude Code's metrics; `h4-gate` for the eval-history metric | `OTEL_SERVICE_NAME` (the gateway); Claude Code itself; `tools/gates/gate` | Promoted to the Prometheus label `service_name` and the Loki label `service_name` |
| `service.namespace` | `h4reet` | the SDK, then upserted by the collector | Promoted to `service_namespace` |
| `deployment.environment.name` | the stack: `prod`, `dev`, or `dev-cpu` (`H4_STACK`) | the SDK, then upserted by the collector from its own `H4_STACK` | Promoted to `deployment_environment_name`. Claude Code's metrics arrive at prod's collector and so carry `prod`; the FR-037 panel selects them by `service_name`. |
| `service.version` | the gateway's `package.json` version | the SDK | Goes to Prometheus's `target_info`, not a label |
| `service.instance.id` | `<H4_STACK>-gateway` | the SDK | Stable across restarts, so a restart shows as a counter reset in the same series. Prometheus derives `instance` from it and `job` from `service.namespace/service.name` (`h4reet/gateway`). |

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
- Telemetry failures never touch enforcement: the meter and the kill switch live in the store, and nothing in the request path waits on an export.
- Health probes produce no spans: the HTTP instrumentation ignores `/health/live` and `/health` (`ignoreIncomingRequestHook`), and the collector's filter drops any that get through ([§6.3](#63-processors)).
- The gateway removes `client.address`, `client.port`, `network.peer.address`, `network.peer.port`, `user_agent.original`, `url.query`, and `url.full` from its spans, and any query string from `url.path`, in a span processor before export. The collector deletes them again, and strips the query string from any `url.full` that reaches it ([§6.3](#63-processors)).
- **Outbound HTTP.** `instrumentation-undici` is configured with an `ignoreRequestHook` that skips the Telegram API host, because that URL's path carries the bot token ([alerts.md §4.1](alerts.md#41-the-dispatcher)), so no client span records it. The collector's redaction (§6.3) stays the second layer.
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
| `h4.outcome` | always | `ok` (200), `degraded` (503 with a degraded cause), `refused` (429: `client_cap_exceeded` or `metered_capacity_exceeded`), `invalid` (400, 415), `error` (502 `local_error`, or an unexpected 5xx), `unauthorized` (401 on the admin listener) |
| `h4.degraded.cause` | when the response is degraded | the causes in [§4.1](#41-the-gateways-instruments) |
| `error.type` | on an `error` outcome | `local_error`, or the class name of an unexpected error |

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

- Plan §5.7 also lists `h4.degraded.cause` on the client span. A client span ends when its attempt ends, before the routing decision that makes a response degraded, so the cause is recorded on the routing and server spans instead. A failed attempt carries `error.type`.
- **The canonical success set** is every key above marked "always", plus the "on success" keys, plus `server.port` for an adapter that declares a port. `gen_ai.response.id` belongs to it when the provider returns an ID; both shipped providers do. A failed attempt has the "always" keys plus `error.type`.
- The contract suite's check C8 compares these key sets with an in-memory exporter: `local-openai` and `bedrock-converse` must have identical sets, and only the values of the provider, model, and server attributes may differ (SC-006, [provider-adapter.md §5.2](provider-adapter.md#52-assertions)). The synthetic adapter's set is the same without `server.port`.

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
- the cost from the attributes the collector derives from `h4.cost.usd`: `gen_ai.usage.cost`, and `langfuse.observation.cost_details` as the JSON object `{"total": <h4.cost.usd>}` ([§6.3](#63-processors)).

The first stack task checks which of the two cost attributes Langfuse 4.54.0 reads, keeps that one in the collector's transform, and records the answer in research.md (plan §6). Until then both are set.

## 4. Metrics

### 4.1 The gateway's instruments

The canonical list. The gateway emits these and nothing else under `h4.`; the dashboard and the breach test's M assertions query the Prometheus names.

| OTel name | Instrument, unit | Attributes and their values | Prometheus name | Recorded when |
|---|---|---|---|---|
| `h4.gateway.requests` | counter, `{request}` | `h4.route.decision`: `local`, `fallback`, `metered`, `degraded`, or `none` (answered before routing: 400, 415, the per-client cap); `h4.outcome`: `ok`, `degraded`, `refused`, `invalid`, `error` | `h4_gateway_requests_total` | once per `POST /hello`, `POST /admin/test/synthetic` call, and `POST /admin/adapters/{id}/complete` call, when its response is sent |
| `h4.gateway.request.duration` | histogram, `s` | `h4.route.decision` | `h4_gateway_request_duration_seconds` | with the counter, from arrival to response |
| `h4.cost.usd` | counter, `{USD}` | `gen_ai.provider.name`; `gen_ai.request.model`; `h4.meter.attribution`: `none`, `fallback`, `metered`, `test` | `h4_cost_usd_total` | when a ledger row commits, by its cost (micro-USD ÷ 10⁶), including 0 for local calls and the settlement of an expired reservation ([data-model.md §2.4](../data-model.md#24-reservations-metered-calls-in-flight)) |
| `h4.meter.spend_usd` | gauge, `{USD}` | `h4.meter`: `day`, `month`, `fallback_day` | `h4_meter_spend_usd` | the current period's committed spend (`spent_micro`) |
| `h4.meter.ceiling_usd` | gauge, `{USD}` | `h4.meter` | `h4_meter_ceiling_usd` | 5.00 (`day`), 20.00 (`month`), and today's allowance (`fallback_day`) |
| `h4.meter.warn_usd` | gauge, `{USD}` | `h4.meter` | `h4_meter_warn_usd` | 3.50 (`day`), 14.00 (`month`), and the allowance minus 0.60 (`fallback_day`) |
| `h4.fallback.allowance_usd` | gauge, `{USD}` | none | `h4_fallback_allowance_usd` | today's `allowance_micro`: 2.00, then spend plus reservations plus 2.00 after a renewal (ADR 0001) |
| `h4.fallback.awaiting_renewal` | gauge, `{flag}` | none | `h4_fallback_awaiting_renewal` | 1 while `fallback_awaiting_renewal` is set, else 0 |
| `h4.kill_switch.state` | gauge, `{state}` | `h4.state`: `normal`, `degraded` | `h4_kill_switch_state` | one-hot: both series every time, exactly one at 1. An unreachable or empty store reports `degraded`, because unknown counts as degraded (FR-022, FR-031). |
| `h4.degraded.cause` | gauge, `{cause}` | `h4.cause`: `none`, `store_unreachable`, `store_uninitialized`, `kill_switch_tripped`, `no_fallback_in_stack`, `meter_at_ceiling`, `fallback_awaiting_renewal`, `fallback_spent_today`, `fallback_unavailable`, `journal_unwritable` | `h4_degraded_cause` | one-hot over all ten values: the cause a hello arriving now would get, evaluated read-only in FR-022's order from the snapshot; `none` when it would be answered ([gateway-http.md §3](gateway-http.md#3-degraded-causes)) |
| `h4.degraded.responses` | counter, `{response}` | `h4.cause`: the nine causes (not `none`) | `h4_degraded_responses_total` | once per degraded response |
| `h4.adapter.healthy` | gauge, `{flag}` | `h4.adapter`: the adapter IDs in `config/routing.yaml`: `local`, `bedrock`, `synthetic` | `h4_adapter_healthy` | 1 or 0 per configured adapter, from its effective health (the probe combined with the circuit, [provider-adapter.md §6](provider-adapter.md#6-around-an-adapter-call-what-the-gateway-does)) |
| `h4.alerts` | counter, `{attempt}` | `h4.channel`: `telegram`, `email`; `h4.alert.kind`: `warn`, `trip`, `fallback_exhausted`, `operator_action`, `credentials_expiring`, `fallback_unavailable`, `auth_failed`, `store_unreachable`, `reminder`; `h4.outcome`: `delivered`, `retry` (an attempt failed and another is due), `failed` (the channel gave up at 300 s) | `h4_alerts_total` | once per delivery attempt's outcome ([alerts.md §4](alerts.md#4-channels-delivery-and-retries)) |
| `h4.alert.delivery_lag` | histogram, `s` | none | `h4_alert_delivery_lag_seconds` | on each delivery, from the outbox row's `enqueued_at`; for the in-memory `store_unreachable` alert, which has no row, from the moment it was queued in memory |
| `h4.operator.actions` | counter, `{action}` | `h4.action`: the audit action of an accepted write: `init`, `reset`, `renew`, `test_clock`, `test_synthetic`, `adapter_call` | `h4_operator_actions_total` | once per accepted admin write ([operator-admin.md §1.3](operator-admin.md#13-what-each-write-produces)) |
| `h4.operator.auth_failures` | counter, `{failure}` | `h4.auth.class`: `missing`, `malformed`, `wrong_prefix`, `mismatch` | `h4_operator_auth_failures_total` | once per failed admin authentication, counted in memory ([operator-admin.md §1.1](operator-admin.md#11-authentication)) |
| `h4.test_machinery.refused` | counter, `{request}` | none | `h4_test_machinery_refused_total` | each 403 from `POST /admin/test/*` outside dev |

**The gauges.**
- They are observable gauges. Their callback reads an in-process snapshot and never touches the store.
- The 10 s background task refreshes the snapshot from the store ([data-model.md §7.7](../data-model.md#77-background-work-in-the-gateway-process)). A commit, an operator write, or a sweep also replaces the snapshot's affected values as soon as its transaction commits, so a spend change doesn't wait for the next refresh.
- When the store can't be read, the meter and fallback gauges are not observed at all, so their series go stale and the freshness panel shows the gap. The state and cause gauges keep reporting (`degraded`, `store_unreachable`), since they don't need the store.
- A period with no meter row yet reports 0 spend and the configured allowance.

**Histogram buckets** (explicit, the same for every `s` histogram the gateway records, up to 120 s): 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120. `h4.alert.delivery_lag` uses 1, 5, 10, 20, 30, 60, 120, 180, 240, 300, 600.

**What is never a metric attribute:** a client address or label, a request or trace ID, a message, a reason text, a dedupe key, or an operator's fingerprint.

### 4.2 Semantic-convention metrics

| OTel name | Instrument, unit | Attributes | Prometheus name | Source |
|---|---|---|---|---|
| `gen_ai.client.token.usage` | histogram, `{token}` | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.token.type` (`input`, `output`) | `gen_ai_client_token_usage` (`_bucket`, `_sum`, `_count`) | the gateway, once per token type per successful attempt. Buckets: 1, 4, 16, 64, 256, 1,024, 4,096, 16,384, 65,536 (the conventions' advice, cut at the stack's context size). |
| `gen_ai.client.operation.duration` | histogram, `s` | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model` (on success), `server.address`, `error.type` (on failure) | `gen_ai_client_operation_duration_seconds` | the gateway, once per attempt |
| `http.server.request.duration` | histogram, `s` | `http.request.method`, `http.route`, `http.response.status_code`, `url.scheme`, `network.protocol.version`, `error.type` | `http_server_request_duration_seconds` | `@opentelemetry/instrumentation-http`, for every route on both listeners except the health checks: the ignore hook that keeps them out of traces (§3.1) skips their measurement too |

### 4.3 Metrics scraped by Prometheus

These don't pass through the collector; Prometheus scrapes them ([§6.6](#66-prometheus-loki-and-grafana)). Names are as the targets expose them.

| Job (target) | Metrics the dashboard uses | Meaning |
|---|---|---|
| `model-server` (`model-server:8080/metrics`, every 5 s) | `up`; `llamacpp:prompt_tokens_total`; `llamacpp:tokens_predicted_total`; `llamacpp:predicted_tokens_seconds`; `llamacpp:requests_processing`; `llamacpp:requests_deferred` | `up` is 1 only when the server answers its metrics endpoint, which it does once the model is loaded. The `llamacpp:` names are build b11459's (`--metrics`); the first stack task checks them against the running server's `/metrics` and fixes this table if a name differs. |
| `otel-collector` (`otel-collector:8888/metrics`) | `up`; `otelcol_receiver_accepted_spans_total`, `otelcol_receiver_refused_spans_total`; `otelcol_exporter_sent_spans_total`, `otelcol_exporter_send_failed_spans_total`, `otelcol_exporter_enqueue_failed_spans_total`; the same three for `_metric_points` and `_log_records`; `otelcol_exporter_queue_size`, `otelcol_exporter_queue_capacity` | the collector's own telemetry at level `normal`, labelled by `exporter` (`otlphttp/langfuse`, `otlphttp/prometheus`, `otlphttp/loki`) and `receiver` |
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
| `call.completed` | info | each provider attempt, as its ledger row commits | `route_decision`, `route_reason`, `attribution`, `adapter`, `provider`, `request_model`, `response_model`, `input_tokens`, `output_tokens`, `latency_ms`, `cost_micro`, `cost_basis`, `price_version`, `outcome`, `error_kind` |
| `call.degraded` | warn | each degraded response | `cause`, `route_decision` |
| `call.refused` | info | each 429 | `error` (`client_cap_exceeded`, `metered_capacity_exceeded`), `limit` |
| `meter.threshold_crossed` | warn | a commit crosses a warning, a ceiling, or a fallback allowance | `meter`, `period`, `threshold` (`warn`, `ceiling`, `allowance`), `spent_micro`, `threshold_micro`, `grant_no` (fallback only) |
| `killswitch.tripped` | error | the commit that sets `degraded` | `ceilings`, `day_micro`, `month_micro` |
| `fallback.exhausted` | warn | committed fallback spend reaches the allowance | `grant_no`, `allowance_micro`, `spent_micro` |
| `reservation.expired` | warn | the sweep settles a reservation ([data-model.md §2.4](../data-model.md#24-reservations-metered-calls-in-flight)) | `reservation_id`, `attribution`, `max_micro` |
| `operator.init`, `operator.reset`, `operator.renew`, `operator.test_clock`, `operator.test_synthetic`, `operator.adapter_call` | info, with `event.name=h4.audit` | an accepted admin write | `audit_id`, `actor` (`operator:<stack>#<8 hex>`), `action`, `reason`, and `before` and `after` summaries in micro-USD as the audit row has them |
| `operator.auth_failed` | warn, with `event.name=h4.audit` | a failed authentication | `class` (`missing`, `malformed`, `wrong_prefix`, `mismatch`), `route` (the route template, or `other`) |
| `alert.queued` | info | an outbox row commits | `dedupe_key`, `kind` |
| `alert.delivered` | info | a channel delivers | `dedupe_key`, `kind`, `channel`, `attempt`, `lag_s`, `provider_ref` (Telegram's `message_id`; the SMTP reply code and queue ID) |
| `alert.retry` | warn | an attempt fails and another is due | `dedupe_key`, `channel`, `attempt`, `error_class`, `next_in_s` |
| `alert.failed` | error | a channel gives up at 300 s | `dedupe_key`, `channel`, `attempts`, `error_class` |
| `incident.drafted` | info | a draft is written | `incident_id`, `path` (relative to the state directory), `sha256` |
| `state.unknown` | error | the store is unreachable or empty: once when it starts, then once a minute | `condition` (`store_unreachable`, `store_uninitialized`), `since`, `error_class` (a SQLSTATE or Node error code, never a message) |
| `state.recovered` | info | the store answers again | `outage_s` |
| `journal.unwritable` | error | a `reserve` append fails | `error_class` |
| `adapter.health_changed` | info | an adapter's effective health flips | `adapter`, `healthy`, `reason` |
| `credentials.expiring` | warn | 2 h before the SSO session ends | `adapter`, `expires_at` |
| `test.machinery_refused` | warn | a `POST /admin/test/*` outside dev | `path` |

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
| `transform/payloads` (traces and logs) | **Traces:** deletes every key matching `^(gen_ai\.(input\|output)\.messages\|gen_ai\.system_instructions\|gen_ai\.(prompt\|completion)(\..*)?\|langfuse\.observation\.(input\|output)\|input\.value\|output\.value\|http\.(request\|response)\.body(\..*)?)$` from span and span-event attributes, `where not (span.attributes["h4.payload.sampled"] == true and "${env:TELEMETRY_PAYLOAD_SAMPLING}" == "on")`. Always deletes `client.address`, `client.port`, `network.peer.address`, `network.peer.port`, `user_agent.original`, `url.query`, `http.request.header.*`, `http.response.header.*`, `authorization`, and `cookie`. Then sets `gen_ai.usage.cost` to `h4.cost.usd`, and `langfuse.observation.cost_details` to `Format("{\"total\":%v}", [span.attributes["h4.cost.usd"]])`, where `h4.cost.usd` is present ([§3.5](#35-what-langfuse-reads)). **Logs:** always deletes the same payload keys plus `messages`, `prompt`, and `completion`, and the same client keys. | FR-029's "no payloads unless sampling is explicitly on", enforced a second time outside the gateway; no client identifier in Langfuse or Loki |
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
| `otlphttp/langfuse` | `traces_endpoint: http://langfuse-web:3000/api/public/otel/v1/traces` (Langfuse takes OTLP over HTTP only) | `auth: {authenticator: basicauth/langfuse}`; `compression: none` until the first stack task confirms gzip; `timeout: 10s`; `retry_on_failure: {initial_interval: 5s, max_interval: 30s, max_elapsed_time: 600s}`; `sending_queue: {num_consumers: 2, queue_size: 600}`, in memory, which holds about 10 minutes of test traffic |
| `otlphttp/prometheus` | `metrics_endpoint: http://prometheus:9090/api/v1/otlp/v1/metrics` | `compression: gzip`; `retry_on_failure: {max_elapsed_time: 120s}`; `sending_queue: {queue_size: 120}` |
| `otlphttp/loki` | `logs_endpoint: http://loki:3100/otlp/v1/logs` | `compression: gzip`; `retry_on_failure: {max_elapsed_time: 300s}`; `sending_queue: {queue_size: 300}` |
| extension `basicauth/langfuse` | – | `client_auth: {username: ${env:LANGFUSE_PUBLIC_KEY}, password: ${env:LANGFUSE_SECRET_KEY}}` |
| extension `health_check` | `0.0.0.0:13133` | for the breach probe and `make status`; the image has no shell, so compose has no health check for it |
| `service.telemetry` | `metrics: {level: normal, readers: [{pull: {exporter: {prometheus: {host: 0.0.0.0, port: 8888}}}}]}`, `logs: {level: info}` | Prometheus scrapes 8888 (job `otel-collector`) |

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

- **Prometheus** (`deploy/prometheus/prometheus.yml`; flags `--web.enable-otlp-receiver --storage.tsdb.retention.time=30d --storage.tsdb.retention.size=2GB`, and neither the admin nor the lifecycle API):

  ```yaml
  otlp:
    promote_resource_attributes: [service.name, service.namespace, deployment.environment.name]
    translation_strategy: UnderscoreEscapingWithSuffixes
  storage:
    tsdb:
      out_of_order_time_window: 30m
  scrape_configs:   # every 15 s, the model server every 5 s
    - {job_name: model-server,   scrape_interval: 5s, static_configs: [{targets: ["model-server:8080"]}]}
    - {job_name: otel-collector, static_configs: [{targets: ["otel-collector:8888"]}]}
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

### 7.2 Spend

| Panel | Type | Query | Shows |
|---|---|---|---|
| Spend today (FR-028) | time series and stat | A: `max(h4_meter_spend_usd{h4_meter="day"})`; B: `max(h4_meter_warn_usd{h4_meter="day"})`; C: `max(h4_meter_ceiling_usd{h4_meter="day"})` | today's spend against $3.50 and $5.00 |
| Spend month-to-date (FR-028) | time series and stat | the same three with `h4_meter="month"` | against $14.00 and $20.00 |
| Fallback sub-budget remaining (FR-028, FR-030) | stat and time series | A: `h4_fallback_allowance_usd - ignoring (h4_meter) h4_meter_spend_usd{h4_meter="fallback_day"}`; B: `max(h4_fallback_awaiting_renewal)`; C: `max(h4_meter_warn_usd{h4_meter="fallback_day"})` | what fallback can still spend today; B maps 1 to "awaiting renewal" in red |
| Cost by provider and attribution (FR-023, SC-005) | table | `sum by (gen_ai_provider_name, gen_ai_request_model, h4_meter_attribution) (increase(h4_cost_usd_total[$__range]))` | Bedrock's fallback and test cost beside local's zero |

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
| Alerts by channel and outcome (FR-032) | table | `sum by (h4_channel, h4_alert_kind, h4_outcome) (increase(h4_alerts_total[$__range]))` |
| Alert delivery lag p95 | time series | `histogram_quantile(0.95, sum by (le) (rate(h4_alert_delivery_lag_seconds_bucket[$__rate_interval])))` |
| Alert log | logs | `{service_name="gateway"} \| event=~"alert\\.(queued\|delivered\|retry\|failed)"` |
| Operator actions | bar chart | `sum by (h4_action) (increase(h4_operator_actions_total[$__range]))`, and `sum(increase(h4_test_machinery_refused_total[$__range]))` |
| Audit events, from the logs | logs | `{service_name="gateway"} \| event_name="h4.audit"` |

- The audit panel filters on `recorded_at`, the real time, so dev's test-clock jumps don't push rows outside the dashboard's range. It shows the gateway's own time beside it.
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

This row is how a degraded telemetry pipeline shows itself ([plan.md §19](../plan.md#19-degraded-modes)): a stale freshness value, failures and drops per exporter, and backends down.

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

## 8. What holds this contract

| Check | Where | What it proves |
|---|---|---|
| Instrument inventory | `services/gateway/test/unit/telemetry-names.test.ts` | After a scripted run with an in-memory metric reader, the set of `h4.*` instruments, their units, and their attribute keys equal [§4.1](#41-the-gateways-instruments). A new name fails the test until this file has it. |
| Span keys | the contract suite's C8 ([provider-adapter.md §5.2](provider-adapter.md#52-assertions)) | [§3.3](#33-span-attributes)'s canonical success set, identical across `local-openai` and `bedrock-converse` |
| Redaction | `services/gateway/test/unit/redact.test.ts`, and a pytest test that parses `deploy/otel/collector.yaml` | every pattern in [§6.3](#63-processors) masks its fixture, in both copies; payload keys are deleted unless sampled |
| Dashboard queries | a pytest test, `deploy/scripts/test_dashboard.py` | every metric name in `h4-runtime.json` appears in this file; every FR-028, FR-034, and FR-037 panel exists; the datasource uids are `prom`, `loki`, and `gateway` |
| End to end | the breach test's T, M, and L assertions ([plan.md §8](../plan.md#8-the-breach-test)), and [quickstart.md](../quickstart.md) | the names, the 60 s freshness, and the Langfuse trace, on a running stack |

Checked once, in the first stack task, and recorded in research.md: the `llamacpp:` names of build b11459; which cost attribute Langfuse 4.54.0 reads; whether Langfuse accepts gzip; and the Prometheus names of Claude Code's two metrics.
