# Implementation Plan: The Anthropic API as a Second Paid Adapter, and the Live Runs on Either Paid Adapter

**Branch**: `feat/010-anthropic-provider`, cut from group B's top as it stands when [tasks.md](tasks.md) T001 runs (`feat/009-room-avatars` at 953ad7ea when this plan was written), or from `refs/heads/main` if group B has merged by then ([§14](#14-the-branch-and-the-order-of-work)) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Status**: Planned on 2026-11-08 while the Author was away, on the spec's provisional answers (its Clarifications). Choices this plan makes beyond the spec are marked "(plan choice)" and are the Author's to overturn like the answers. Code waits for his acceptance of the intent and his approval of the spec and this plan: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`" (tasks.md T000).

**Input**: [spec.md](spec.md) and [intent.md](intent.md), and the reads the spec's Input lists, at 953ad7ea. The SDK's surface (its client options, the variables it reads by default, its error classes, its `fetch` option, its model lookup) is named from the brief's reference and the SDK's documentation as this plan understands them; tasks.md T001 confirms each against the version T002 pins, before anything is built on it, and a difference becomes a departure recorded here.

**Conventions** (spec 007's plan's):
- **The Author's terminal**: commands only the Author runs, outside Claude Code.
- **Agent-editable** files are changed by agents and reviewed by the Author. **Human-only** files change only by the Author's hand; agents deliver their changes as patches in `docs/merge-requests/`, built from plain copies (`git show`, `git diff --no-index`), never by `git apply` or a write into any worktree.
- **Paths.** A file that exists only in a patch is named in a code span and never linked, since `evals/docs_links.py` fails a link to a missing file.

**Companions**: none. As spec 007's plan does, this plan keeps its design in its own sections, so the feature stays four documents (Complexity Tracking).

## Summary

- **The adapter** (§2): `anthropic-messages`, kind `paid`, provider `anthropic`, in `services/gateway/src/adapters/anthropic-messages.ts`, through the official `@anthropic-ai/sdk`, pinned and vetted, with a transport of its own (`_anthropic-transport.ts`) that resolves through c-ares, times the connect, tells an unreached call from a possibly billed one, connects to `api.anthropic.com` alone, and sends an allowlist of headers. The SDK never retries; the gateway's retry, circuit, deadline, meter, and kill switch govern it.
- **Routing** (§3): `adapters.anthropic` in `config/routing.yaml`, prod's fallback still `bedrock`; choosing the Anthropic API is one line, after the Author's patches. The key, `GATEWAY_ANTHROPIC_API_KEY`, reaches the gateway alone.
- **Cost** (§4): a new price version (P-B); the adapter's monthly cap in `config/budgets.yaml` (P-C); a meter of its own per capped adapter and month (migration `0005_adapter_month.sql`), the cause `adapter_month_spent`, and crossings that reuse the sub-budget's flag, alert kinds, and renewal.
- **The twin** (§5): a `content_filter` finish becomes the fixed line under the guard `refusal`; both paid adapters send their model's default temperature.
- **The live runs** (§6) take `ADAPTER=anthropic`; **readiness** (§7) asks for the paid adapter the route names, and counts only complete runs.
- **Secrets** (§8): the Author's enforcement patch, P-A, lands with the merge, on his branch cut from this branch's tip (B10); **telemetry, the dashboard, alerts, runbooks** (§9); **disclosure** (§10): row F3 in a section of its own, with a placeholder for the Author's words that `make test` won't let the route pass.

**What the Author does** (§13): approves; commits P-A on a branch cut from this branch's tip; gates and merges the two as one (B10); syncs prod's env file; applies P-C and P-B; runs spec 007's Bedrock runs; and, if he chooses the Anthropic API, writes F3's words, puts the key in, switches the route, and runs the live runs on it before re-marking readiness.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node 24 (spec 000's pins) for `services/gateway` and `apps/web`; Python 3.12, standard library plus PyYAML, for the runners, the readiness report, preflight, and the pytest checks; YAML and Markdown.

**Primary Dependencies**: one new: `@anthropic-ai/sdk`, the official SDK, at the version T002 vets and pins exactly (no range) in `services/gateway/package.json` and the lockfile (D2). Everything else as spec 007's plan has it.

**Storage**: one migration, `services/gateway/migrations/0005_adapter_month.sql` (a meter kind, a view); nothing else.

**Testing**: vitest in `services/gateway`: unit; the contract suite in stub mode against an in-process stub of the Messages and model-lookup endpoints on `127.0.0.1`; integration on PGlite with the test clock and the stub adapters. vitest in `apps/web` for the room's cause class. pytest for preflight, the env files, the dashboard, the runners, the readiness report, the disclosure, and the Makefile's targets. `make evals` on the fake adapter; `make redteam` on planted responses. Every check runs inside `make test` or `make evals`, so no `CHECK_GATES` entry is added.

**Target Platform**: the gateway container on every stack; the adapter is built on prod alone, and only while prod's route names it.

**Project Type**: an adapter module and a meter kind in the existing gateway, with configuration, runner, report, and document changes. No new service, port, network, or store.

**Performance Goals**: the adapter's own mapping and transport add under 5 ms a call (plan choice, a unit benchmark against the stub); the health check settles within the shorter of 5 seconds and its interval; SC-005 of spec 000 (failover within 5 seconds) holds, since the request timeout stays at most 4,000 ms (rule R8).

**Constraints**: rule R8 (connect plus request at most 5,000 ms for a paid adapter); rule R9 (`deadline_ms` 20,000 ≥ local 10,000 + 4,000 × 2 + 250 + 500 = 18,750, unchanged with either paid adapter); no payload in telemetry on prod; strict schemas, an unknown key an error; `make up` always works.

**Scale/Scope**: 41 FRs and 10 success criteria; one adapter type; one migration; one degraded cause; one guard; four disclosure rows; three Author patches.

## Constitution Check

*GATE: passed before design and re-checked after it ([below](#constitution-check-post-design)).* Applied with the `constitution-check` skill's eight questions against the [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle or standard | What this plan does | Verdict |
|---|---|---|
| I. Data-local by default | One flow off the stack, F3, written in the change that adds the adapter, before a call is possible; the route can't name the adapter while F3 holds its placeholder (§10). Local first (§3). Degraded mode built first, in the foundation (§11; tasks.md Phase 2) | PASS |
| II. Production-grade or not shipped | Tests first for every FR (tasks.md); the contract suite and the Author's live run (§2.9); the readiness evidence made complete (§7); spans, instruments, a panel, alerts, and runbooks in the same change (§9); the cost estimate and its measurement (§15); an ADR and the README | PASS |
| III. Intent before spec, spec before code, humans merge | From the intent; this plan precedes code; specs 000, 002, and 007 amended by name; ADR 0001 extended by a new ADR; departures update this plan in the same commit; no agent merges | PASS, with the spec's named deviation (a draft intent) and the inherited one (ADR 0013) |
| IV. Least privilege | The key denied by name before it exists (P-A, §8); the paid route's live runs refused to agents by target and by the bash gate; the prices and the cap the Author's files; nothing widened, since `registry.npmjs.org` is already allowed | PASS |
| V. Cost is a first-class signal | Every call through the gateway with provider, model, tokens, and cost; list price whatever the credits; the cap stops the adapter on its own and the Author restores it (§4); the kill switch read first; spend beside latency and errors (§9) | PASS |
| VI. Build in public, including failures | The adapter, its tests, the live runs' history, and the readiness fix committed; refusals counted on a panel | PASS |
| VII. Own the whole product, and say exactly what you owned | The product reasoning is in the spec, this plan's decisions, and the ADR | PASS |
| VIII. Honest AI | The guards run on both providers' answers; a refusal shows the fixed line; readiness on complete evidence from the adapters that would answer | PASS |
| Security and agent governance | The deny before the risk (§8); visitor input still adversarial; the implementer never reviews; the dependency pinned and vetted, installed without scripts (D2) | PASS |
| Technology standards | Gateway-only model access; routing as configuration; a direct vendor API through the one gateway; one compose topology, one key added to the gateway's environment | PASS |

Gate result: **PASS**, with the deviations the spec names only.

## Project Structure

### Documentation (this feature)

```text
specs/010-anthropic-provider/
├── intent.md     # the Author's words, verbatim, with intent 000's; problem and outcome
├── spec.md       # FR-001 to FR-041, SC-001 to SC-010, the provisional Clarifications, the amendments, the entries
├── plan.md       # this file: the design (§1 to §13), the order (§14), and the analyze pass (end)
└── tasks.md      # test-first tasks by phase, the Author's marked
```

### Source Code (repository root)

`[new]` a file this work creates; `[chg]` a file it changes; `[P-A]`, `[P-B]`, `[P-C]` the Author's patches; `[A]` the Author's own runs or files.

```text
services/gateway/
├── package.json, ../package-lock.json                       [chg] @anthropic-ai/sdk, pinned exactly (D2)
├── migrations/0005_adapter_month.sql                        [new] the meter kind adapter_month; v_adapter_months (§4.4)
├── src/adapters/anthropic-messages.ts                       [new] the adapter: request, response, errors, health (§2)
├── src/adapters/_anthropic-transport.ts                     [new] fetch over node:https: c-ares, connect watchdog, origin, header allowlist (§2.6)
├── src/adapters/_settings.ts                                [chg] the type's settings and rules; `temperature` on both paid types; registered
├── src/adapters/bedrock-converse.ts                         [chg] the temperature setting (§5.2)
├── src/core/types.ts, src/core/router.ts                    [chg] the cause adapter_month_spent, in FR-022's order and the dry run (§4.5)
├── src/config/validate.ts                                   [chg] adapter_monthly_usd and rule B9; adapter_cap_missing (§4.2)
├── src/meter/admission.ts, commit.ts, crossings.ts, sweep.ts, init.ts, rollover.ts, store.ts   [chg] the adapter month (§4.4)
├── src/twin/guards.ts                                       [chg] the guard `refusal` (§5.1)
├── src/telemetry/metrics.ts, redact.ts                      [chg] gauges, cause, guard; the key's shape (§9, §8)
├── src/alerts/format.ts                                     [chg] the adapter month's warning and exhaustion; the label (§9)
├── README.md                                                [chg]
└── test/contract/anthropic-messages.{contract,errors}.test.ts, test/helpers/stub-anthropic.ts,
    test/unit/anthropic-*.test.ts, test/integration/{adapter-month,hello-anthropic,room-turn-anthropic,anthropic-degraded,anthropic-telemetry}.test.ts   [new]
    test/unit/{validate-config,telemetry,twin-guards,alerts-format}.test.ts, test/integration/{migrations,room-turn,admin-twin}.test.ts   [chg]

config/routing.yaml                                           [chg] adapters.anthropic; bedrock's `temperature: model_default`; prod's fallback stays bedrock
config/prices.yaml                                            [P-B] a new version with anthropic/claude-haiku-5-5
config/budgets.yaml                                           [P-C] envs.<env>.adapter_monthly_usd
config/twin-readiness.yaml                                    [A] his marks, with anthropic evidence if he switches

deploy/compose.yaml                                           [chg] GATEWAY_ANTHROPIC_API_KEY on the gateway, as ${GATEWAY_ANTHROPIC_API_KEY:-}
deploy/env.example/prod.env.example                           [chg] the key, empty, with its comment
deploy/scripts/preflight.py, test_preflight.py, test_env_files.py   [chg] P3's allowed-empty key, P7's shape, P19 scoped to bedrock-converse
deploy/otel/collector.yaml                                    [chg] the key's shape in §6.3's redaction
deploy/grafana/dashboards/h4-runtime.json, deploy/scripts/test_dashboard.py   [chg] the cap's panel and the adapter months' table

apps/web/src/room/signals/tier.ts and its test                [chg] BUDGET_CAUSES gains adapter_month_spent (Amendment 2-1)
evals/run.py, evals/test_run.py                               [chg] --adapter anthropic (§6)
evals/twin_readiness.py, evals/test_twin_readiness.py         [chg] NEEDED from routing.yaml; complete runs (§7)
evals/test_disclosure.py                                      [chg] F3's section and words; S2, D1, V2; the placeholder gate (§10)
redteam/run.py, redteam/test_run.py                           [chg] LIVE_ADAPTERS; the key's shape in the secret pattern
scripts/operator.py, test_operator.py, test_operator_record.py   [chg] a paid adapter needs prod (§6)
Makefile, scripts/test_makefile.py, scripts/test_contract_live.py   [chg] ADAPTER=anthropic (§6)
evals/product/history/*-anthropic.json, redteam/history/*-anthropic.json   [A]

docs/data-flow-disclosure.md                                  [chg] "Spec 010: the Anthropic API" with F3; S2, D1, V2 (§10)
docs/runbooks/anthropic-unavailable.md                        [new]; docs/runbooks/fallback-renewal.md, README.md   [chg]
docs/adr/00NN-the-anthropic-api-as-a-second-paid-adapter.md, docs/adr/README.md   [new], [chg]
specs/000-local-foundations/contracts/{provider-adapter,config-files,gateway-http,telemetry,alerts,env-files}.md, data-model.md   [chg] (spec 010)
specs/002-the-room/contracts/room-conversation.md             [chg] §3 (Amendment 2-1)

.claude/settings.json, .claude/hooks/bash-gate.sh, evals/agent-config/static.py, redteam/forbidden-actions.sh,
tools/gates/matrix-required.txt, tools/gates/compose_policy.py and its test, CLAUDE.md   [P-A]
```

**Structure decision**: the adapter is a module of the gateway, with its transport in a helper module whose name starts with `_`, so the registry never loads it as an adapter (contracts/provider-adapter.md §4); the meter's month is a kind of the existing `meters` table; nothing outside `src/adapters/` names the provider.

## 1. Decisions (research)

| ID | Decision | Why | Rejected |
|---|---|---|---|
| D1 | The official SDK, `@anthropic-ai/sdk`, for the Messages call and the model lookup | The brief's rule, "in a TypeScript project, call Claude through the official SDK, not raw fetch"; typed errors by status; the API's shapes maintained by Anthropic | `node:http(s)` as the local adapter does (no dependency, but the API's shapes and errors kept by hand, against the rule) |
| D2 | The dependency vetted before it enters the lockfile, then pinned exactly | The constitution's "lockfile-pinned dependencies"; a new package in the gateway's image is supply chain | A caret range; installing before vetting |
| D3 | A transport of the adapter's own, given to the SDK as its `fetch` (§2.6) | One place for the c-ares lookup (spec 000's T188 and T189), the connect watchdog that tells an unreached call from a possibly billed one, the origin lock, and the header allowlist (FR-010, FR-016) | The SDK's default fetch (Node's built-in, whose lookups use `getaddrinfo` and whose timeouts can't tell a connect from a request); an undici `Agent` as a dispatcher (the `undici` package, which spec 000 kept out of the lockfile, contracts/provider-adapter.md §3.1's departure for T051) |
| D4 | Every client option explicit, and no `ANTHROPIC_*` variable in the container | The SDK reads some options from the environment by default; an ambient base URL, token, or log level could redirect a call, authenticate it otherwise, or log its payload (FR-007) | Trusting the container's environment to stay clean |
| D5 | One paid fallback at a time; the registry and the admin routes unchanged (Q2) | `envs.prod.fallback` is one string already; the live runs need the route to name the adapter, which keeps evaluation and serving on the same adapter | A chain (Q2's B); building every defined paid adapter (Q2's C) |
| D6 | The health check is the model lookup, `GET /v1/models/{model}`, every 60 seconds (plan choice) | It proves the key and the model without spending tokens; 60 seconds, not Bedrock's 10, since each check is a request to Anthropic, not a local credential read; a failed call still marks the adapter unhealthy at once | A Messages call (spends); a local-only check (a revoked key stays "healthy" until calls fail), kept as FR-012's fallback if the lookup isn't available or isn't free |
| D7 | The cap as a meter kind with a cause of its own, reusing the sub-budget's flag, alert kinds, and renewal (Q4) | Principle V's human restore, with local answers untouched; the least new machinery that stays precise on the dashboard | A kill-switch trip (Q4's B); a rollover restore (Q4's C); reusing `meter_at_ceiling` for the level check, whose fixed detail and gauge would then mislead |
| D8 | The key's env-file name, `GATEWAY_ANTHROPIC_API_KEY` (Q5) | contracts/env-files.md §4's precedent: preflight's P5, and compose's shell-wins interpolation | `ANTHROPIC_API_KEY` (Q5's B) |
| D9 | `temperature: as_requested` or `model_default` on both paid types (FR-017) | The live-case note's "it takes no temperature but its default, 1"; a setting, so a later model that takes one is configuration | Dropping the twin's temperature in code (the local model loses it too); per-purpose temperatures |
| D10 | The refusal guard runs first, before the trim | A refused answer is withheld whatever its text; the trim and the guards never see it | Letting the guards judge a refusal's partial text (spec 007 as built) |
| D11 | Readiness counts a run only when it is complete against the committed cases (§7) | FR-031's "per topic, per path, per adapter" can't be met by a run that holds none of a topic's cases or one path's | At least one case per path (a run filtered to one passing case per path would pass) |
| D12 | F3 in a section of its own, with its placeholder held by a test against the route (§10) | `evals/test_disclosure.py` keeps a later spec's flows in their own section; a test is an enforcement point, a reminder isn't | Writing F3 into spec 000's table; leaving the order of the Author's steps to the note alone |
| D13 | The ADR at the next free number when T003 runs | Spec 009's T040 takes "the next free number" too; 0041 may be its | A number fixed now |

**D2, the vetting** (T002, recorded in the branch's note before the install):
1. **Who publishes it**: `npm view @anthropic-ai/sdk` shows the version, the repository (Anthropic's `anthropic-sdk-typescript`), the maintainers, and the publish time; the version chosen is the latest at T002, not one published in the last 7 days (plan choice), unless the Author asks for it.
2. **Its licence**: recorded (MIT expected; Apache-2.0 found, departure B1).
3. **Its install scripts**: none expected; the image build and every agent install run `npm ci --ignore-scripts`, so none would run anyway.
4. **Its dependency tree**: `npm ls --all @anthropic-ai/sdk -w services/gateway` after the install, every package with its version in the note, every one pinned by the lockfile's integrity hash.
5. **Known advisories**: `npm audit --omit=dev -w services/gateway`, its result in the note.
6. **The pin**: `npm install --save-exact @anthropic-ai/sdk@<version> -w services/gateway --ignore-scripts --cache "$TMPDIR/npm"`, so `package.json` holds the exact version and `package-lock.json` its integrity; the gateway's image size before and after, in the note.
7. **Its reach**: imported by `src/adapters/anthropic-messages.ts` and `_anthropic-transport.ts` alone, which `test/unit/provider-names.test.ts` holds, since it reads every module specifier.
8. **The Author's read**: the note lists the diff of `package.json` and the lockfile's new packages, for his review before the merge.

## 2. The adapter

### 2.1 The module and its registration

- `services/gateway/src/adapters/anthropic-messages.ts` exports `factory: AdapterFactory<AnthropicSettings>` with `type: "anthropic-messages"`, `kinds: ["paid"]`, `provider: "anthropic"`, and `create(id, settings, ctx)`, which builds the adapter with `anthropicDeps(settings, ctx, {origin: "https://api.anthropic.com"})`: the SDK client, given the transport as its `fetch`.
- `AnthropicMessagesAdapter implements ProviderAdapter`: `type`, `kind: "paid"`, `provider: "anthropic"`, `model` (the setting), `server: {address: "api.anthropic.com", port: 443}`, `retry` from the settings, `complete`, `health`, `close` (aborts calls in flight and destroys the transport's agent).
- `_settings.ts` gains the type's `AdapterTypeSpec` (§2.2), `label: "the Anthropic API"`, `circuit` from its settings, no `credentialsWarnMs` (a key has no known end), and `"anthropic-messages"` in `REGISTERED_ADAPTER_TYPES`.
- **A test seam, as Bedrock's `BedrockDeps`**: the adapter's constructor takes its deps, so tests build it against the stub's origin; `factory.create` always passes the fixed origin, which a unit test pins.

### 2.2 Its settings, and their rules

| Field | Type | Rule |
|---|---|---|
| `model` | string | `^[a-z0-9][a-z0-9.:-]{2,127}$`, or a placeholder (config-files.md §0): `claude-haiku-5-5` |
| `api_key_env` | string | an env key's name, `^[A-Z][A-Z0-9_]*$`, never one beginning `ANTHROPIC_` (rule R12, plan choice: the SDK reads those on its own): `GATEWAY_ANTHROPIC_API_KEY` |
| `thinking` | string | `disabled`, its only value |
| `temperature` | string, optional | `as_requested` (the default when absent) or `model_default` (§5.2) |
| `timeouts.connect_ms` | integer | 100 to 2,000 |
| `timeouts.request_ms` | integer | 1,000 to 4,000; connect plus request at most 5,000 (rule R8) |
| `retry.on`, `retry.max`, `retry.backoff_ms` | list, integer, integer | ProviderError kinds; 0 or 1; 0 to 2,000 |
| `circuit.failures`, `circuit.open_s` | integer, integer | 1 to 10; 5 to 600 |
| `health.interval_ms` | integer | 10,000 to 600,000 |

- Strict: any other key, a `base_url`, a `region`, or a `*_env` but `api_key_env`, is an error (rule R11). The endpoint is the module's constant.
- `checkEnv` (startup, a routed adapter only): the key `api_key_env` names unset or empty → `missing_env`, naming the key, never the value.
- `timing`: `{requestMs: request_ms, retryMax: retry.max, backoffMs: retry.backoff_ms}`, so rule R9 counts it as it counts Bedrock.
- `healthCadence`: every `interval_ms`, each within the shorter of 5,000 ms and `interval_ms − 1`; one failure unhealthy, one pass healthy.

### 2.3 The request

```ts
client.messages.create(
  {
    model: settings.model,
    max_tokens: req.maxOutputTokens,
    ...(system === undefined ? {} : { system }),          // the one system message, if any (§2.1 of the contract)
    messages,                                               // user and assistant turns, in order (C9)
    thinking: { type: "disabled" },                         // the API's default effort, medium, accepts it
    ...(sendTemperature ? { temperature: req.temperature } : {}),   // §5.2
  },
  { signal, maxRetries: 0, timeout: settings.timeouts.request_ms },
);
```

- `signal` is `AbortSignal.any([req.signal, own.signal, AbortSignal.timeout(min(request_ms, deadline − now))])`, as Bedrock's; `complete()` settles when it aborts, whatever the SDK is still doing (C10, C11).
- Never sent: `stream`, `tools`, `tool_choice`, `stop_sequences`, `metadata`, `service_tier`, `top_k`, `top_p`, a `cache_control` on any block, an effort, or an `anthropic-beta` header (FR-006).

### 2.4 The response, the usage, and the cost

- `text`: the content blocks of type `text`, their `text` joined; any other block type (a thinking block among them) contributes nothing.
- `usage`: `inputTokens` = `input_tokens` plus any `cache_creation_input_tokens` (the request asks for no cache, so this is 0; if not, the meter prices those tokens at least at the input price, and the adapter logs `adapter.cache_write_reported` with the count, at most once an hour); `outputTokens` = `output_tokens`; `cacheReadInputTokens` = `cache_read_input_tokens` when it is a count, which the meter prices at the entry's `cache_read_input`, or its `input` when absent (config-files.md §2.1, "never undercounts").
- `finishReason`: `end_turn` and `stop_sequence` → `stop`; `max_tokens` → `length`; `refusal` → `content_filter`; any other → `other`.
- `responseModel`: the response's `model`, when short and printable; else the configured model. `responseId`: the message's `id`, under the same rule.
- A 200 without a content list, or without both token counts as non-negative integers: `provider_error` (status 200).
- **The 100,000-token tier** (FR-019): the price entry is the lower tier's. The largest input any call can carry is the twin's, `limits.twin.max_input_chars`, at most 64,000 characters by its schema, of which at most `history_max_chars` (16,000 at its schema's most) is the visitor's; the corpus's English runs well under a token a character, so even a visitor's text at several tokens a character keeps a call far below the tier's edge. A response whose input tokens (with cache tokens) pass 100,000 is logged `cost.tier_edge` with the count, and counted at the entry's prices (R-10).

### 2.5 Errors (the Anthropic column of contracts/provider-adapter.md §2.5)

| Kind | `retryable` | `possiblyBilled` | Anthropic (`anthropic-messages`) |
|---|---|---|---|
| `unavailable` | yes | no | 529 (overloaded), 502, 503; a connection refused, unreachable, or reset before the request's body was written; a failed lookup (c-ares's codes); the connect watchdog (`ETIMEDOUT`) |
| `timeout` | yes | yes | the request timeout or the deadline (the adapter's own signal, or the SDK's timeout error); 504; a connection lost after the body was written (`ECONNRESET`, `EPIPE`) |
| `rate_limited` | yes | no | 429 |
| `auth` | no | no | 401, 403 |
| `bad_request` | no | no | 400, 404, 413, 422 |
| `content_filtered` | no | no | none: a refusal is a stop reason, so a result (§2.4) |
| `provider_error` | yes | no | 500 and any other 5xx not above; any other 4xx (409 among them); a 200 that doesn't parse, or lacks its content or usage |

- `code`: the SDK error's class name (`RateLimitError`, `AuthenticationError`, `InternalServerError`, …) when the error has one and it is a plain identifier; else `http_<status>`; else the Node or c-ares code the transport attached; else nothing. Never the provider's message, the request, the key, a URL, or the original error (`cause` is never attached, contracts/provider-adapter.md §2.5).
- The transport marks each failure `reached: true` once the request's body has been written, so a lost connection or an abort after it is `timeout` and possibly billed, and before it `unavailable` and not billed; the adapter reads the mark from the SDK's connection error's `cause` (T001 confirms the SDK keeps it).

### 2.6 The transport (`_anthropic-transport.ts`)

`createAnthropicFetch({origin, connectMs, lookup, logger})` returns a `fetch`-shaped function the SDK calls:
- **The origin lock**: any URL whose origin isn't the one it was built with is refused before a socket opens (`code: "ORIGIN_REFUSED"`, `unavailable`). Production's origin is `https://api.anthropic.com`; tests build it with the stub's.
- **The lookup**: an `https.Agent({keepAlive: true, maxSockets: 8, lookup: aresLookup})` (an `http.Agent` for a test's `http:` origin), so no lookup holds a libuv thread (spec 000's T188, T189).
- **The connect watchdog**: a socket that hasn't connected, the TLS handshake included, within `connectMs` is destroyed with `ETIMEDOUT` and `reached: false`, as the local adapter's watchdog does.
- **The headers it sets** (FR-016; departures B2 and B3): only `authorization` (the key, as `Bearer <key>`, the pinned SDK's form), `anthropic-version` (the pinned SDK's, `2026-10-21`), `content-type` and `content-length` (with a body), `accept`, and `user-agent` (the SDK's, `Anthropic/JS <version>`) leave, each set by the transport from fixed values; every header the SDK passes in, its platform and retry headers and anything `ANTHROPIC_CUSTOM_HEADERS` adds among them, is dropped, and a test lists what the stub received.
- **The body**: written whole; `reached` is set once it has been; the response becomes a standard `Response` with its status, headers, and body stream.
- **No telemetry of its own**: the HTTP instrumentation's ignore hook skips every host that isn't a single in-stack label (contracts/telemetry.md §3.1), so the request gets no client span and no `traceparent`; the gateway's `chat {model}` span is the call's span.

If T001 finds that the pinned SDK takes no `fetch` it will use, or that it drops a rejection's `cause`, the departure goes here, and the Author chooses between another SDK version and the transport without the SDK (D1's rejected option).

### 2.7 Health (FR-012)

- `health(signal)`: `client.models.retrieve(model, {signal, maxRetries: 0})` through the same transport. Healthy on a 200 whose `id` is the configured model or a dated snapshot of it (T001 records which the API returns for `claude-haiku-5-5`); `credentials` on 401 or 403; `timeout` when the signal ends it; `unreachable` otherwise. It never rejects, and never calls Messages (check C3).
- The gateway combines it with the circuit, as for Bedrock (contracts/provider-adapter.md §6, items 4 to 6): a call that fails `unavailable` or `timeout` marks the adapter unhealthy at once; `auth` marks it `credentials` until a check passes.
- **The fallback** (FR-012's IF): if the model lookup isn't in the pinned SDK, or the Author finds it billed, `health` checks only that the key is present and well formed, and calls refused with `auth` keep the adapter unhealthy until the next check after `circuit.open_s` (a departure, recorded).

### 2.8 Retry, circuit, deadline, and the kill switch

- `retry: {on: [rate_limited], max: 1, backoff_ms: 250}` and `circuit: {failures: 3, open_s: 30}` in `config/routing.yaml`, applied by the gateway's attempt wrapper (contracts/provider-adapter.md §6, items 3 and 5); `maxRetries: 0` on every SDK call.
- The adapter is reached only through `Gateway.complete`'s fallback attempt and `Gateway.adapterCall`'s admin call, both after the request-start state read and, for a paid call, admission (spec 000's data model §7.1, §7.2): nothing new in the adapter reads the store or decides a route (contracts/provider-adapter.md §1).

### 2.9 The contract tests

- `test/contract/anthropic-messages.contract.test.ts`: `describeAdapterContract("anthropic-messages", makeStubbedSubject, "stub")`, with `test/helpers/stub-anthropic.ts`, an in-process `node:http` stub of `POST /v1/messages` and `GET /v1/models/{id}` on `127.0.0.1` that maps spec 000's `StubBehavior` to Anthropic-shaped answers (`{type: "error", error: {type: "rate_limit_error", …}}` with its status, a `stop_reason`, a `usage`), records each request's method, path, headers, and body, and plants the suite's canary in every echo and error body.
- `test/contract/anthropic-messages.errors.test.ts`: what §2.5's column lists beyond C4's shared cases: 404, 413, 422, 502, 504, 529, 409, the lookup's codes, the watchdog, a reset before and after the body.
- The live mode: `make contract-live ENV=prod ADAPTER=anthropic REASON="…"`, recorded by `scripts/operator.py contract-record` and replayed by the gate's `--contract-replay`, which reads the recording's adapter name whatever it is; `test/contract/replay.test.ts` needs no change, and `live-cases.json` keeps its eight cases (`temperature-one` sends 1, which `model_default` drops and the model applies anyway).

### 2.10 What the base already holds

- `test/unit/provider-names.test.ts` already lists `anthropic` in its pattern, and reads every module specifier, so `@anthropic-ai/sdk` imported outside `src/adapters/` fails `make test`. Spec 000's contract names an ESLint `no-restricted-imports` rule for this; `eslint.config.js` at 953ad7ea holds none, and the test is the rule (Amendment 0-10).
- The HTTP instrumentations' ignore hooks keep trace context and client spans off every request to a host outside the stack (contracts/telemetry.md §3.1).
- The registry builds only the adapters a route names; the admin routes accept only the route's primary or fallback (contracts/operator-admin.md §5, §8).

## 3. Routing, configuration, and the key

**`config/routing.yaml`** gains, after `bedrock` (and `bedrock` gains `temperature: model_default`):

```yaml
  anthropic:
    type: anthropic-messages
    kind: paid
    # Claude Haiku 5.5 through Anthropic's own API (spec 010), the model Bedrock's profile names. The endpoint is the
    # adapter's constant, https://api.anthropic.com; prod's env file holds the key, which compose passes to the gateway.
    model: claude-haiku-5-5
    api_key_env: GATEWAY_ANTHROPIC_API_KEY
    thinking: disabled # as Bedrock's: hello's 128 tokens could end in thinking with no text
    temperature: model_default # "it takes no temperature but its default, 1" (provider-adapter.md §5.4)
    timeouts: { connect_ms: 1000, request_ms: 4000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 250 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 60000 }
```

`envs` stays `prod: { primary: local, fallback: bedrock }` and `dev: { primary: local, fallback: synthetic }`. The header's history comment gains the step. The Author's switch, when he makes it, is `prod: { primary: local, fallback: anthropic }`.

**Validation and refusals** (Amendment 0-3): rule R5 allows `anthropic-messages` only as `paid`; R2 and `paid_route_outside_prod` keep it out of dev's route; R8 and R9 count its timeouts; R12 refuses an `api_key_env` beginning `ANTHROPIC_`. At start, for a routed `anthropic-messages` adapter: `missing_env` (the key), `price_missing` (no entry), `placeholder_value` (a placeholder model or price), and `adapter_cap_missing` (no cap in `config/budgets.yaml`, §4.2), each exit 78 with the reason named.

**Compose** (`deploy/compose.yaml`, agent-editable): the gateway's `environment` gains `GATEWAY_ANTHROPIC_API_KEY: "${GATEWAY_ANTHROPIC_API_KEY:-}"`, beside the AWS profile, with a comment; no other service names it, and the compose policy holds that from P-A (§8). The `egress` network, the ports, and the binds don't change (FR-033).

**Prod's template** (`deploy/env.example/prod.env.example`): `GATEWAY_ANTHROPIC_API_KEY=` (empty), under a comment saying it holds the Anthropic API key once the Author chooses the Anthropic API, that compose passes it to the gateway alone, and that the shell's own `ANTHROPIC_API_KEY` can never stand in for it. Dev's template and `deploy/env.agents/dev-cpu.vars` don't change.

**Preflight** (`deploy/scripts/preflight.py`, Amendment 0-9):
- P3: `GATEWAY_ANTHROPIC_API_KEY` joins the keys allowed empty while prod's route names no `anthropic-messages` adapter.
- P7: while it does, the key is non-empty, printable ASCII without spaces, 20 to 256 characters (plan choice; no prefix is assumed).
- P19: the AWS profile's checks apply when prod's route names a `bedrock-converse` adapter, rather than any paid adapter.
- P4 compares prod's file with its template, so the Author runs `make init-env ENV=prod SYNC=1` once after the merge (§13): it appends the key, empty.

## 4. Cost: the price, the cap, and the meter

### 4.1 The price version (P-B)

A new, complete version appended to `config/prices.yaml` (append-only, rule P5), built against `main`'s copy:

```yaml
  - id: "<the day he applies it>.1"
    effective_from: "<that day>T00:00:00Z"
    source: "est.: the claude-api skill's reference, cached 2026-10-06 (Claude Haiku 5.5, prompts up to 100K tokens); the Author confirms on Anthropic's pricing page and writes the day he read it here"
    entries:
      - provider: anthropic
        model: claude-haiku-5-5
        input: 0.1
        output: 0.5
      - provider: aws.bedrock
        model: us.anthropic.claude-haiku-5-5
        input: 0.1
        output: 0.5
        cache_read_input: 0.01
      - provider: local
        model: "*"
        input: 0
        output: 0
      - provider: synthetic
        model: metered-test
        input: 0
        output: 100
```

No `cache_read_input` for `anthropic` until the Author reads one: cache reads, which the request never asks for, are then priced at the input price, which never undercounts. P-B may land before or after the merge; this plan puts it after, with P-C, so the Author confirms both on one day.

### 4.2 The cap in `config/budgets.yaml` (P-C)

```yaml
envs:
  prod:
    # … as before …
    adapter_monthly_usd: { anthropic: 20.00 } # the Anthropic API's month: the whole $20 ceiling, the Author's answer (spec 010, FR-021)
  dev:
    # … as before …
    adapter_monthly_usd: { anthropic: 20.00 } # rule B8: dev equals prod; inert, since dev builds no paid adapter
```

**Rule B9** (Amendment 0-4): each key names a `paid` adapter in `config/routing.yaml` (checked across files), and each value is more than 0 and at most `monthly_usd`, with at most 6 decimal places. Derived: the warning is the cap times `warn_ratio`, rounded down. The schema accepts the key only once this branch has merged, so P-C lands after it, and before the Author's switch, which `adapter_cap_missing` would otherwise refuse.

### 4.3 The cap's value

$20.00 a month, the whole monthly ceiling: the Author's answer of 2026-11-08, "$20 a month", to "The Anthropic API adapter's monthly cap (your patch P-C), which sits inside the $20 monthly ceiling: what figure?", the option that read "The whole monthly ceiling: the stack's own $20 ceiling then trips first." This plan had proposed $10.00, half the ceiling (B12).

What a cap at the ceiling means:
- **The month ceiling stops paid calls first.** The month meter counts every metered call, the adapter's month only that adapter's, so the month meter reaches $20 first, or with it. Admission checks `meter_at_ceiling` before `adapter_month_spent` (data-model.md §7.2, step 5), and the ceiling's crossing trips the kill switch, which refuses local answers too until his reset (gateway-http.md, `kill_switch_tripped`). The cap's own stop, which refuses the adapter alone while local answers go on, can't come first; it stands as a backstop, which acts only if the month ceiling is raised above it.
- **Two warnings at $14.** The month's warning fires at $20 times `warn_ratio` 0.70, and the adapter month's at the cap times the same ratio, so both can fire at $14: on one commit when every metered call of the month went to the Anthropic API.
- At the brief's price, $20 is about 20,000 typical fallback turns, which the $2-a-day sub-budget spreads over at least ten days.

### 4.4 The meter's adapter month (Amendment 0-5)

- **Migration `0005_adapter_month.sql`**: `meters.meter`'s check gains `'adapter_month'`; its `period_key` is `<adapter id>:<YYYY-MM>` (`^[a-z][a-z0-9-]{0,31}:[0-9]{4}-(0[1-9]|1[0-2])$`); `allowance_micro` and `grant_no` stay `fallback_day`'s alone. A view, `gateway.v_adapter_months` (adapter, month, spent, reserved, `warned_at`, `reached_at`), readable by `grafana_ro`. Earlier migrations stay byte-identical.
- **The rows a call touches**: a metered call to an adapter with a cap also touches its `adapter_month` row for the call's month; the reservation already holds `adapter_id` and `period_month`, which name the row.
- **Admission** (data-model.md §7.2): step 4 upserts the adapter's month row when it has a cap; step 5's order becomes `kill_switch_tripped`, `meter_at_ceiling`, then **`adapter_month_spent`** (the adapter's month spend plus reservations at or above its cap, for `fallback` and `test` alike), then the sub-budget's two checks (`fallback` only), then `fallback_unavailable`; step 7 adds the reservation to the month row.
- **Commit** (§7.3): step 5 adds the cost to the month row; step 6's crossings gain two: the warning (old below the cap times `warn_ratio`, new at or above it) queues a `warn` alert keyed `<stack>:warn:adapter_month:<adapter>:<YYYY-MM>` and sets `warned_at`; the cap (old below, new at or above) sets `reached_at`, sets `fallback_awaiting_renewal` and `fallback_awaiting_since` WHERE the adapter is the route's fallback and the flag is false, queues a `fallback_exhausted` alert keyed `<stack>:fallback_exhausted:adapter_month:<adapter>:<YYYY-MM>`, and writes a `fallback_exhausted` audit row whose detail names the adapter and the month. All in the commit's transaction, as every crossing is.
- **The sweep** settles an expired reservation on the month row too.
- **Rollover** is lazy: a new month's row starts at zero; nothing touches the flag.
- **Renewal** (§7.5) is unchanged: it clears the flag, and admission keeps refusing the adapter by its month's level until the month rolls over or P-C's successor raises the cap.
- **Initialization's rebuild** (§3, "What a rebuild reads", step 3): a `reserve` record whose `adapter` has a cap counts toward that adapter's month when its `period_month` is the current month, paired with its `commit` as every record is.
- **Gauges** (from the snapshot, every 10 seconds and after each commit): `h4.adapter.month_spend_usd`, `h4.adapter.month_cap_usd`, and `h4.adapter.month_warn_usd`, each by `h4.adapter`, for each capped adapter the route names (plan choice: their own names, so `h4.meter.*` keeps its one label).

### 4.5 The cause `adapter_month_spent` (Amendment 0-6)

| Cause | Meaning | Condition | `since` | `detail` (fixed text) |
|---|---|---|---|---|
| `adapter_month_spent` | local is unhealthy, and the paid fallback's month is at or above its cap, counting reservations | the adapter's monthly cap (spec 010, FR-022) | the month row's `reached_at` | The local model is unavailable, and the paid fallback has reached its monthly cap. |

It joins every closed list of causes: `DegradedCause` (`src/core/types.ts`); the router's order and `GET /health`'s dry run (`src/core/router.ts`); `h4.degraded.cause`'s one-hot values, `h4.degraded.responses`, and `h4.twin.turns`' causes (`src/telemetry/metrics.ts`); contracts/gateway-http.md §3, telemetry.md §4.1, alerts.md §6; and the room's `BUDGET_CAUSES` (`apps/web/src/room/signals/tier.ts`, Amendment 2-1). An inventory test holds the gateway's lists to one set, and a room test holds the class.

## 5. The twin

### 5.1 The refusal guard (FR-018; Amendment 7-3)

`guardAnswer` in `src/twin/guards.ts` begins: a `content_filter` finish returns `withheld("refusal")` before the trim and the guards. `GuardName` and `GUARD_NAMES` gain `"refusal"`; `h4.twin.withheld`'s values gain it; the dashboard's "Answers withheld, by guard" panel shows it by its label. The admin twin route already returns the guard it gets, so the runners record `refusal` in their history.

### 5.2 The temperature (FR-017; Amendment 7-4)

**FR-017 exists on `main`** for Bedrock, built early by `fix/007-paid-temperature` (spec 007's plan, D22; merged at a5eb05b8). Its note's paragraph for this section, `docs/merge-requests/2026-11-08-fix-007-paid-temperature.md`, in its words:

> Built early on `fix/007-paid-temperature` (spec 007's plan, D22):
> `PAID_TEMPERATURE`, the optional `temperature` key on
> `bedrock-converse`, and `sentTemperature()` in
> `src/adapters/_settings.ts`; `temperature: model_default` on
> `bedrock` in `config/routing.yaml`; and config-files.md §1.1's
> row. This spec adds the key to `anthropic-messages`' schema,
> calls `sentTemperature()` in its request, and sets
> `model_default` on `anthropic`. Spec 007's Bedrock runs (T075,
> T077) no longer wait for this spec's merge (§13 action 7, R-1,
> T058): they wait for `fix/007-paid-temperature`'s.

So this branch reuses `PAID_TEMPERATURE` and `sentTemperature()`, and builds nothing new for Bedrock: `anthropic-messages`' spec gains the same optional `temperature` key, its request sends `req.temperature` only when `sentTemperature()` returns one, and `config/routing.yaml` sets `model_default` on `anthropic`, so the twin's `temperature: 0.3` (`src/twin/turn.ts`) reaches the local model alone. The contract suite's subjects keep `as_requested`. T012's Bedrock half, and T019's, are already on `main`: their tests there (`config.test.ts`, `bedrock-converse.errors.test.ts`, `twin-paid-temperature.test.ts`) stand, and this branch's tests cover `anthropic`.

## 6. The live runs (FR-024, FR-025)

- **`Makefile`**: `evals` accepts `fake`, `local`, `bedrock`, and `anthropic` ("ADAPTER must be fake, local, bedrock, or anthropic"), refusing the last three in the sandbox; `redteam-live` accepts `local`, `bedrock`, and `anthropic`, the paid two with `ENV=prod` only; `contract-live`'s case gains `anthropic) [ "$(ENV)" = prod ] || { echo "…anthropic is prod's adapter, so ENV=prod" >&2; exit 2; }`. The help lines name the three.
- **`evals/run.py`**: `--adapter` choices gain `anthropic`; a map `PAID = {"bedrock": "aws.bedrock", "anthropic": "anthropic"}` gives each paid adapter's provider; `stack` is `prod` for any paid adapter; twin cases go through `twin_adapter(suite, "prod", <the adapter's ID>)`, and hello's through `paid_adapter(suite, <ID>)`, which is today's `bedrock_adapter` with the ID as a parameter; the history file is `<UTC>-<ID>.json`, its record's `adapter` the ID, and each result's `provider` from the map.
- **`redteam/run.py`**: `LIVE_ADAPTERS = ("local", "bedrock", "anthropic")`; the history's name and record as before, with the ID.
- **`scripts/operator.py`**: `contract-record` refuses a paid adapter (`bedrock`, `anthropic`) without `--stack prod`; its help names both.
- **The bash gate** (P-A, §8) refuses an agent's text naming `make evals` or `make check` with `anthropic`, and `evals/run.py` with `anthropic`; `make contract-live` is already refused by name, and `make redteam-live` by its target's sandbox check and the operator token no agent can read.

## 7. Readiness evidence (FR-026 to FR-029; Amendment 7-2)

`evals/twin_readiness.py` keeps its form (standard library and PyYAML, files read as data, always exit 0) and changes its rule:

1. **The adapters needed**: `local`, and `paid` = `config/routing.yaml`'s `envs.prod.fallback` when the file reads and names one, else none. When the file doesn't read, every ready entry's line says the paid evidence can't be named.
2. **The evidence present**: for each needed adapter, a product run (`evals/product/history/`) and a red-team run (`redteam/history/`) among the entry's evidence, whose file exists, whose name ends `-<adapter>.json`, and whose record's `adapter` is that adapter. Missing: "evidence missing: a product run on anthropic, the paid adapter prod's route names".
3. **Complete product runs**: the expected cases are the committed twin cases (`evals/product/cases/twin-*.yaml`, read as data: `id`, `kind`, `twin.feature`, `twin.path`) whose feature's topic is the entry's (every twin case for free talk). A run lacking any: "evidence missing: <file> lacks <n> of <topic>'s cases: <a> engineer golden, <b> non-engineer golden, <c> gap".
4. **The thresholds over the complete set**: each result's pack hash as today; the golden bar per path over the expected golden cases of that path (`golden_bar`, spec 007's FR-031 as the Author amended it on 2026-11-08, which `fix/007-live-runs` built; B15); every expected gap case passing.
5. **Complete red-team runs**: the expected cases are the committed live cases (`redteam/cases/twin-*.yaml` with `live`); a run lacking any is missing evidence; clean as today (`failed` 0, every verdict `pass`).
6. **Information only**: lines under `INFO (twin readiness):`, as now; `make evals`'s exit status never changes because of them.

No mirror exists to fix: `services/gateway/src/twin/readiness.ts` and `apps/web/build/room/readiness.ts` hold FR-030's hash rule and parse `evidence` only as strings (FR-028). `evals/test_twin_readiness.py` builds each matrix row of SC-005 in a temporary tree (a small pack, its cases, histories, and a `routing.yaml`), with hashes computed, never literal.

## 8. Secrets, and the Author's enforcement patch (P-A)

**In the branch** (agent-editable): the key's redaction (`src/telemetry/redact.ts`, a pattern for an Anthropic key's shape, `sk-ant-` followed by 20 or more key characters, plan choice, which T001 checks against the shape gitleaks's default rule uses); the same in `deploy/otel/collector.yaml`'s §6.3 transform, in guard G5's source (it imports `SECRET_PATTERNS`), and in the red-team suite's secret pattern; tests build every key-shaped value at run time (`"sk-" + "ant-" + …`), never as a literal, so neither gitleaks nor the content scan sees one; contracts/env-files.md §4 and §8's rows (Amendment 0-9).

**P-A**, the Author's, built from plain copies of `main`'s files as `docs/merge-requests/<date>-feat-010-pa-anthropic-denies.patch`, committed by the Author on a branch cut from this branch's tip and merged with it, as one (B10) (CLAUDE.md: "a secret, a paid route, or a file prod reads gets its deny in the same patch that creates it, or an earlier one"):
1. `.claude/settings.json`: `GATEWAY_ANTHROPIC_API_KEY` and `ANTHROPIC_API_KEY` in the sandbox's `credentials.envVars`, mode deny.
2. `evals/agent-config/static.py`: `GATEWAY_ANTHROPIC_API_KEY` in FR-007's variable list, which the static tier checks and the canary (`make matrix-canary`) and the behavioral tier read; `ANTHROPIC_API_KEY` stays off it, with its own matrix row instead (B9).
3. `.claude/hooks/bash-gate.sh`: an `anthropic_word` beside `bedrock_word`, refusing `make evals` or `make check` with it ("the Anthropic evals") and `evals/run.py`, its module, or an import of it with it, through every spelling the Bedrock rules catch.
4. `redteam/forbidden-actions.sh`: stage H rows for the two denied variables (`GATEWAY_ANTHROPIC_API_KEY` through env-files.md §8's FR-007 table, `ANTHROPIC_API_KEY` on a `set_has` row of its own: B9) and for the bash gate's spellings (quotes, backslashes, `${v:-anthropic}`, a backslash-newline, `bash -c`, a subshell, `make -C`, `--eval=`, a heredoc), and gap rows for what text matching can't catch (a name built at run time), as `CLAUDE.md` asks of every bash-gate rule.
5. `tools/gates/matrix-required.txt`: their lines.
6. `tools/gates/compose_policy.py` and its test: refuse any `ANTHROPIC_*` key on any service; refuse `GATEWAY_ANTHROPIC_API_KEY` on any service but the gateway, and on the gateway in any form but `${GATEWAY_ANTHROPIC_API_KEY:-}`; and refuse any other mention of the key's name, or reference to an `ANTHROPIC_*` variable, anywhere in what compose renders: another variable's value, a build argument, a label, a command, an extension field (B13).
7. `CLAUDE.md`: "Routing is configuration (`config/routing.yaml`): local-first, Bedrock fallback within sub-budget, then degraded." becomes "Routing is configuration (`config/routing.yaml`): local-first, then the one paid fallback prod's route names (Bedrock or the Anthropic API) within its sub-budget and caps, then degraded." (FR-041).
8. `.gitleaks.toml`, only if T001 finds gitleaks's default rules don't flag an Anthropic key's shape: a rule of his.

P-A changes `.claude/` and `CLAUDE.md`, so its behavioral-tier run follows `main`'s rule then (spec 006's interim, ADR 0038). Gated together, this branch and P-A see the new rows pass; neither passes alone (B10).

## 9. Telemetry, the dashboard, alerts, and runbooks

**Spans** (FR-034): the gateway's `chat claude-haiku-5-5` client span per attempt carries `gen_ai.provider.name: anthropic`, `gen_ai.request.model`, `server.address: api.anthropic.com`, `server.port: 443`, and the rest of contracts/telemetry.md §3.3's canonical set; C8 compares its key set with the local and Bedrock adapters'. Payload attributes only under §3.4's rule, which prod refuses.

**Instruments** (FR-035; telemetry.md §4.1, amended in the same commit as the code; the inventory test follows):

| OTel name | Instrument, unit | Attributes | Prometheus name | Recorded when |
|---|---|---|---|---|
| `h4.adapter.month_spend_usd` (new) | gauge, `{USD}` | `h4.adapter` | `h4_adapter_month_spend_usd` | the current month's committed spend of each capped adapter the route names |
| `h4.adapter.month_cap_usd` (new) | gauge, `{USD}` | `h4.adapter` | `h4_adapter_month_cap_usd` | its cap |
| `h4.adapter.month_warn_usd` (new) | gauge, `{USD}` | `h4.adapter` | `h4_adapter_month_warn_usd` | its warning |
| `h4.degraded.cause`, `h4.degraded.responses`, `h4.twin.turns` (amended) | as before | `h4.cause` gains `adapter_month_spent` | as before | as before |
| `h4.twin.withheld` (amended) | as before | `h4.twin.guard` gains `refusal` | as before | as before |
| `h4.adapter.healthy`, `h4.cost.usd` | as before | the adapter's ID and provider among their values | as before | as before, with `h4.cost.usd`'s zero series at start for the routed paid adapter (spec 000's T191) |

**Panels** (FR-036; telemetry.md §7.1 and §7.2; `deploy/scripts/test_dashboard.py` and `h4-runtime.json` follow):

| Panel | Row | Type | Query |
|---|---|---|---|
| Paid adapter's month against its cap | Spend, beside "Spend month-to-date" | time series and stat | A: `max by (h4_adapter) (h4_adapter_month_spend_usd)`; B: `max by (h4_adapter) (h4_adapter_month_warn_usd)`; C: `max by (h4_adapter) (h4_adapter_month_cap_usd)` |
| Paid adapters' months (authoritative) | State, beside "Store state" | table (SQL, as `grafana_ro`) | `SELECT adapter, month, spent_micro / 1e6 AS spent_usd, reserved_micro / 1e6 AS reserved_usd, warned_at, reached_at FROM gateway.v_adapter_months ORDER BY month DESC, adapter` |

The existing "Cost by provider and attribution", "Provider latency p95", "Tokens by provider", "Model-server health" (by adapter), "Why responses are degraded", and "Answers withheld, by guard" panels show the adapter, the cause, and the guard with no change to their queries.

**Alerts** (FR-037; alerts.md §2, §3, §6): the adapter month's warning (kind `warn`) and exhaustion (kind `fallback_exhausted`) with §4.4's keys, and texts that name "the Anthropic API's month", its spend, and its cap, and say the paid fallback stays refused until a renewal; `fallback_unavailable` for the adapter names "the Anthropic API" through the type's `label`. The formatter's canary test covers both forms.

**Runbooks**: `docs/runbooks/anthropic-unavailable.md` (new): what `fallback_unavailable` means for the Anthropic API; what to check (the key in prod's env file, the account's state in Anthropic's console, the API's status page, the circuit on `/health`); how to replace the key (an editor, then `make up ENV=prod`); how to go back to Bedrock (the one line, commit, `make up ENV=prod`). `docs/runbooks/fallback-renewal.md` gains the adapter month: why the fallback awaits renewal after the cap, that a renewal restores the fallback but not the capped adapter before the month rolls over, and how to raise the cap (his patch). `docs/runbooks/README.md` and alerts.md §6's map gain both.

## 10. The disclosure (FR-038, FR-039)

- `docs/data-flow-disclosure.md` gains, after the room's section, "## Spec 010: the Anthropic API", with the spec's lead sentence and row F3 in the spec's words, the `FR` cell "spec 010 FR-038, FR-039; spec 000 FR-021, FR-022, FR-023, FR-030, FR-031, FR-040"; S2's **Trigger** and **Carries**, D1's **Default** sentence, and V2's **Why** change as the spec's entries give them. The room's disclosure page (`apps/web/build/disclosure.ts`) renders the new section's table as it renders every table.
- `evals/test_disclosure.py`: the sections' list becomes `["Spec 002: the room", "Spec 010: the Anthropic API"]`; a `spec_010_entry` reads this spec's entries, as `spec_007_entry` reads spec 007's, and F3's cells equal the entry's, the From → To's placeholder aside, where F3 holds the placeholder or, once T059 writes them, the Author's words (B11); S2 names F3; D1 keeps "never" and names F3 (the test's comment, "that the stack itself never calls Anthropic", changes with the row); V2's **Why** holds the entry's added sentence, and `test_the_twins_turn_has_row_v2_in_spec_007s_words`, which holds V2's first seven cells equal to spec 007's entry, reads the **Why** as spec 007's words followed by this spec's sentence; F3's host is the adapter's constant, read from the module's source; and **the placeholder gate**: WHEN `config/routing.yaml`'s `envs.prod.fallback` names an adapter of type `anthropic-messages`, F3's **From → To** must not hold `<the Author's words`. A fixture copy of `routing.yaml` with the switch proves the gate fails with the placeholder and passes with words in its place.

## 11. Degraded mode, as built

| Condition | Where it's decided | Answer | The room shows |
|---|---|---|---|
| The kill switch tripped, or a ceiling reached | the request-start read and admission (data-model §7.1, §7.2) | 503 `kill_switch_tripped` or `meter_at_ceiling` | `cannot_talk.budget` |
| The state unknown, or the journal unwritable | the same | 503 `store_unreachable`, `store_uninitialized`, or `journal_unwritable` | `cannot_talk.unavailable` |
| The adapter's month at its cap | admission, step 5 (§4.4) | 503 `adapter_month_spent` | `cannot_talk.budget` |
| The sub-budget spent, or awaiting renewal | admission | 503 `fallback_spent_today` or `fallback_awaiting_renewal` | `cannot_talk.budget` |
| The key refused at the check, or the circuit open | the adapter's effective health (§2.7) | 503 `fallback_unavailable` | `cannot_talk.resting` |
| Overloaded, unavailable, unreachable, rate-limited past its retry, or timed out | the attempt wrapper and the meter's commit | 503 `fallback_unavailable`; a timeout charged its reserved maximum | `cannot_talk.resting` |
| The model refuses | the twin's guards (§5.1) | 200 with `withheld`, guard `refusal` | the fixed line |
| The route names the adapter without its key, price, or cap | preflight, then the gateway's start | `make up` stops with the reason; exit 78 | the stack isn't started |
| The route names the adapter while F3 holds the placeholder | `make test` (§10) | the gate fails | — |

Every row is a test: the gateway's integration tests drive the first seven on the stub adapter and the store; the room's tests drive the classes; the Author's wrong-key check on prod covers the fifth live (tasks.md T063).

## 12. The local stack first

`make up` on every stack keeps working: dev and dev-cpu never build the adapter, and their env files gain nothing; compose's `${GATEWAY_ANTHROPIC_API_KEY:-}` interpolates to empty there. Prod builds the adapter only while its route names it; with the route on Bedrock, an empty key passes preflight. The one step the merge asks of the Author before his next `make up ENV=prod` is `make init-env ENV=prod SYNC=1`, since P4 compares his file with the template, which gains the key.

## 13. The Author's patches and actions

**The patches** (human-only paths; agents write each as a `.patch` beside the branch's note, from plain copies, never applied by an agent):
- **P-A**, the enforcement layer and `CLAUDE.md`'s sentence (§8), with this branch: on a branch cut from its tip, gated and merged as one (B10).
- **P-B**, the price version (§4.1), after the merge, with the figures and the source line he confirms.
- **P-C**, the cap (§4.2), after the merge, with his value: $20.00, his "$20 a month" (§4.3; B12).

**The ADR** (agent-written, proposed, in this branch): `docs/adr/00NN-the-anthropic-api-as-a-second-paid-adapter.md` at the next free number (D13), extending ADR 0001's Decision, item 3, and its "Bedrock model" line; the decisions D1 to D9; the spec's Q1 to Q6 with their options.

**The Author's actions, in order** (the note gives each as a short, wrap-proof line):
1. Accept the intent; answer Q1 to Q6, or let the provisional answers stand; approve the spec and this plan.
2. Commit P-A on a branch cut from this branch's tip, with its behavioral-tier run.
3. Gate that branch, with `--prove`, and merge it, after group B: one merge brings this branch and P-A.
4. `make init-env ENV=prod SYNC=1`, before his next `make up ENV=prod`.
5. Spec 007's P-2, if it hasn't landed: without `limits.twin` no twin call answers on prod.
6. Apply P-C and P-B on `main`; accept the ADR, or leave it proposed.
7. Spec 007's Bedrock runs, its T075 and T077, whenever he chooses: the temperature setting they rely on is on `main` since `fix/007-paid-temperature` (§5.2; R-1), so they don't wait for this branch.
8. If he chooses the Anthropic API: read Anthropic's published commercial terms and write his words in F3 in place of the placeholder, weighing them against intent 000's "Nothing is retained beyond the session without explicit consent" and the corpus's "their conversation is not saved"; put the key in prod's env file, in an editor; commit `fallback: anthropic`; `make up ENV=prod`; check `/health`.
9. `make contract-live ENV=prod ADAPTER=anthropic REASON="…"`.
10. `make evals ADAPTER=anthropic` and `make redteam-live ADAPTER=anthropic ENV=prod`, committing their histories.
11. Re-mark readiness with the Anthropic evidence.
12. The wrong-key check, and his read of the console's usage beside the meter's figures.

## 14. The branch, and the order of work

- **The branch**: `feat/010-anthropic-provider`, in its own worktree, from group B's top when T001 runs, with `npm ci --ignore-scripts --cache "$TMPDIR/npm"`; this folder enters its tree from `spec/010-anthropic-provider`'s commit, cherry-picked first if the base lacks it. Agents rebase and cherry-pick, never merge; work is committed before any pause, since `/tmp` is wiped when WSL restarts.
- **The phases** (tasks.md): Setup; Foundational, which holds every refusal, degraded path, and secret check before any happy path (Principle I); User Story 1 (P1, the MVP); User Story 2 (P1); User Story 3 (P2); User Story 4 (P3); Polish, the merge, and the Author's runs.
- **The merge order**: group B (with spec 007's P-1, as its note has it), then this branch with P-A on top, as one merge (B10); P-B and P-C after it; the switch only after them, the key, and F3's words.
- **Dormant on merge**: prod's route names Bedrock, so the adapter isn't built and nothing reaches Anthropic; the only changes a visitor could see are the refusal's fixed line and Bedrock's default temperature.

## 15. Expected cost, and how it's measured

As the spec's [Expected Cost Impact](spec.md#expected-cost-impact): about $0.0007 to $0.00095 a twin turn on the Anthropic API, a reservation of at most $0.00335; about $0.20 a product run and under $0.05 each for the red-team and contract runs; no ceiling or sub-budget change; the cap at the Author's value. Measured by the ledger's rows with provider `anthropic`, `h4_cost_usd_total` by provider and attribution, the adapter month's gauges, and the live runs' history totals; the note of the Author's first Anthropic run records the measured cost per turn beside the estimate.

## 16. Risks and mitigations

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | Haiku 5.5 refuses the twin's temperature 0.3, on Bedrock and on the Anthropic API alike | `model_default` on both paid adapters (§5.2): Bedrock's on `main` since `fix/007-paid-temperature`, so spec 007's Bedrock runs needn't wait for this branch (§13, action 7); `anthropic`'s in this branch |
| R-2 | The 4,000 ms request timeout cuts a 300-token answer, as spec 007's R-2 has it for Bedrock | Measured in the Author's runs on each adapter; the remedy is a smaller output cap or a per-purpose timeout, a spec 000 schema change with the Author |
| R-3 | The SDK reads an ambient variable, retries, or logs a payload | Every option explicit, `maxRetries: 0`, logging off, no `ANTHROPIC_*` variable in the container, R12, and a test that sets them all (D4) |
| R-4 | The pinned SDK takes no custom `fetch`, or drops a rejection's `cause` | T001 confirms before any code; a departure here, and the Author's choice (§2.6) |
| R-5 | The model lookup isn't available or isn't free | FR-012's local fallback; the Author's check of his console |
| R-6 | Anthropic's terms keep what the corpus says isn't saved | F3 holds his words, and `make test` holds the route back until they're in (§10); the decision is his (§13, action 8) |
| R-7 | The prices drift from the brief's reference | P-B's figures marked "est." until he confirms them on the day he applies it |
| R-8 | An account that can't pay answers with a status that isn't a circuit failure, so each fallback turn tries and fails | The cap stops spend first; the runbook; the failures counted under `fallback_unavailable` on the dashboard |
| R-9 | The new dependency's supply chain | D2's vetting, the exact pin, `--ignore-scripts`, the lockfile's integrity, the audit, the Author's read |
| R-10 | A call past 100,000 input tokens would be priced at the lower tier | The input bounds keep it out of reach (§2.4); `cost.tier_edge` logs it if it ever happens |
| R-11 | The bash gate's `anthropic` rule refuses an innocent command that runs `make check` and names the word | The Bedrock rule's accepted trade (spec 000's plan §13): read with the Read and Grep tools, commit with a message file |
| R-12 | The route is switched before the Author's patches | `missing_env`, `price_missing`, `adapter_cap_missing`, preflight, and the disclosure gate, each naming what's missing |
| R-13 | The same model answers differently through the two providers | Readiness evidence per adapter (§7) |
| R-14 | A switch of the fallback leaves topics marked ready on the other adapter's evidence | Q6's answer: the report names the gap, the switch's note lists the runs; before publication only the Author visits |
| R-15 | Group B moves before T001 | T001 cuts from its tip as it stands, or from `main` once it merged |

## 17. Requirement coverage

| FRs | Plan | Tasks (tests, then code, then the Author's) |
|---|---|---|
| FR-001 to FR-003 | §3, §2.10 | T026; T030 |
| FR-004 | §2.1, §2.10, D2 | T002; T017 |
| FR-005, FR-014 | §2.2, §3 | T007; T017, T030 |
| FR-006, FR-007 | §2.3, §2.6, D4 | T023; T029 |
| FR-008 | §2.4 | T024; T029 |
| FR-009, FR-010 | §2.5, §2.6 | T008; T017 |
| FR-011, FR-013 | §2.8 | T010, T024, T046; T016, T029 |
| FR-012 | §2.7 | T025; T029 |
| FR-015 | §2.9 | T024; T029; T060 |
| FR-016 | §2.6 | T013; T017 |
| FR-017 | §5.2 | T012; T019, T030; T058 |
| FR-018 | §5.1 | T011; T018 |
| FR-019, FR-020 | §4.1, §4.4 | T007, T009, T026; T016; T006, T057 |
| FR-021 | §4.2, §4.3 | T007, T009; T016; T006, T057 |
| FR-022, FR-023 | §4.4, §4.5 | T009, T010, T015; T016, T022 |
| FR-024, FR-025 | §6 | T034, T035; T037, T038; T005, T054 |
| FR-026 to FR-029 | §7 | T036; T039; T052, T062 |
| FR-030 | §3, §8 | T014; T021; T056, T059 |
| FR-031 | §8 | T008, T013; T020 |
| FR-032 | §8 | T005; T054 |
| FR-033 | §3 | T026, T028 |
| FR-034 to FR-036 | §9 | T027, T042; T031, T045 |
| FR-037 | §9 | T041, T043; T044; T063 |
| FR-038, FR-039 | §10 | T028; T032; T059 |
| FR-040 | §3, §12 | T014; T021; T055, T056 |
| FR-041 | §8, §13 | T003, T004, T005; T054 |

## Complexity Tracking

No constitution violation needs justifying. Three choices add weight on purpose:

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| A new runtime dependency, the official SDK (D1, D2) | The brief's rule for TypeScript projects; typed errors; the API's shapes kept by their maker | Hand-written HTTPS keeps no dependency but keeps the API's shapes and errors by hand, against the rule |
| A transport of the adapter's own (D3) | c-ares, the billing classification, the origin lock, and the header allowlist, in one tested place | The SDK's default fetch brings back the lookup stall spec 000's T188 fixed, and can't tell an unreached call from a billed one |
| A meter kind and a cause for the cap (D7) | Principle V's self-degrade and human restore for one provider, without stopping local answers | A kill-switch trip stops local answers for a provider's cap; a rollover restore skips the human |
| The design in this plan's sections, not in companion files | Four documents for an adapter and its controls | Spec 004's split serves a nine-contract feature; spec 000's contracts, amended in place, are the companions |

## Constitution Check (post-design)

Re-checked after §1 to §13. Nothing in the design changes a verdict above. The places nearest a line:
- **Principle I**: a visitor's turn can reach a second third party; F3 says so in the change, the Author's words about what that party keeps are required before the route can name it, and he can go back to Bedrock in one line.
- **Principle IV**: the key is a new secret on prod; it is denied by name before it exists, reaches the gateway alone, and appears in no record.
- **Principle V**: the cap reuses the sub-budget's flag and renewal, so restoring the paid fallback after the cap is the same human act the Author already knows.

Gate result: **PASS**.

## Analyze pass (spec × plan × tasks × constitution)

A read-only consistency pass in the form of `/speckit-analyze`, made after tasks.md was written, on 2026-11-08. Findings fixed in the documents before they were handed over are marked "resolved"; the rest are open, for the Author.

| ID | Category | Severity | Location | Summary | Resolution |
|---|---|---|---|---|---|
| A1 | Inconsistency | HIGH | spec FR-017; spec 007's plan §2 step 4; `src/twin/turn.ts` | The twin sends `temperature: 0.3`, while spec 000's live case records that Haiku 5.5 "takes no temperature but its default, 1"; spec 007's Bedrock runs (its T075, T077) would meet it first | Resolved: FR-017 and §5.2 set `model_default` on both paid adapters; Bedrock's is on `main` since `fix/007-paid-temperature` (spec 007's plan, D22), so T058 no longer waits for this merge. Open until the Author's runs show it live |
| A2 | Dependency | HIGH | spec FR-002, FR-039; plan §13 | Choosing the Anthropic API needs, in order, P-A, the merge, P-B, P-C, the key, and F3's words | Resolved by enforcement: `missing_env`, `price_missing`, `adapter_cap_missing`, preflight, and the disclosure gate each refuse a switch made early (R-12); the order is T054 to T059 |
| A3 | Constitution | MEDIUM | spec FR-039; intent 000; `corpus/08-hareet-ai.md` | What Anthropic keeps of a request may not square with "Nothing is retained beyond the session without explicit consent" and "their conversation is not saved"; no agent can decide it | Open, the Author's: T059 asks it before the switch, and `make test` holds the switch until F3 holds his words |
| A4 | Inconsistency | MEDIUM | `docs/data-flow-disclosure.md` D1; `evals/test_disclosure.py` | D1 says the stack "calls no Anthropic endpoint", and a test's comment reads it so; both become false once the adapter exists | Resolved: FR-038 changes D1's sentence in the same change, and T028 changes the test with it |
| A5 | Inconsistency | MEDIUM | `evals/test_disclosure.py`, `test_spec_000s_part_closes_with_fr_040s_sentence` | The test pins the disclosure's sections to spec 000's part and the room's | Resolved: F3 gets "Spec 010: the Anthropic API", and T028 adds it to the test's list (D12) |
| A16 | Inconsistency | MEDIUM | spec Amendment 7-5; `evals/test_disclosure.py`, `test_the_twins_turn_has_row_v2_in_spec_007s_words` | The test holds row V2's cells equal to spec 007's entry, so the sentence V2's **Why** gains would fail it | Resolved: T028 changes the test to read V2's **Why** as spec 007's words followed by this spec's sentence, in the change that adds it |
| A6 | Coverage | MEDIUM | spec FR-027; `evals/twin_readiness.py` | The gap found tonight is in the product runs; the red-team branch of `_check` has the same vacuity (a run holding one clean case is "clean") | Resolved: FR-027 extends completeness to red-team runs, provisionally, as part of the same fix |
| A7 | Ambiguity | MEDIUM | spec Q5; the brief | The brief named the credential `ANTHROPIC_API_KEY`; the spec names the env-file key `GATEWAY_ANTHROPIC_API_KEY` | Resolved by Q5's provisional answer and its reason; open for the Author to overturn |
| A8 | Underspecification | MEDIUM | spec FR-007, FR-012; plan §2.6, §2.7 | The SDK's option names, the variables it reads, its `fetch` option, its error `cause`, and its model lookup are named from documentation, not from a pinned version | Open until T001, which records each and turns any difference into a departure here before code (R-4, R-5) |
| A9 | Terminology | LOW | spec 000's provider-adapter.md §4; `eslint.config.js` | The contract names an ESLint `no-restricted-imports` rule for provider SDKs; the base holds none, and `test/unit/provider-names.test.ts` is the rule | Resolved: Amendment 0-10 reads the contract as the test; FR-004 cites the test |
| A10 | Ambiguity | LOW | the brief, "a run filtered with ONLY or LIMIT" | `evals/run.py` and `redteam/run.py` offer no case filter at 953ad7ea | Resolved by reading (spec Assumptions): the fix holds whatever filter or truncation produced a run |
| A11 | Ambiguity | LOW | the Author's words; `corpus/03-grants-and-credits.md` | "$200 of free credits per month" could be confused with the corpus's Anthropic credits, which Medic received | Resolved: the spec and the intent keep them apart and state neither as the other; nothing touches the corpus |
| A12 | Inconsistency | LOW | spec 000's FR-022 and FR-030 | Both name Bedrock as the fallback | Resolved: Amendment 0-1 reads them as the paid fallback the route names |
| A13 | Coverage | LOW | spec Q2; FR-003 | A live run on the Anthropic API needs the route switched first, so its evidence follows the switch | Accepted: before spec 001 the only visitor is the Author; Q2's option C is his to ask for |
| A14 | Dependency | LOW | plan D13 | Spec 009's T040 takes "the next free number" for its ADR, perhaps 0041 | Resolved: T003 takes the next free number when it runs |
| A15 | Constitution | LOW | spec Assumptions, "Readings" | The Model access standard's "initial policy is local-first with Bedrock as fallback" against a Bedrock-less fallback | Resolved by reading: routing is configuration, and a direct vendor API is one of the standard's adapters; a paid primary would be a deviation, not taken |
| C1 | Constitution | none | Principle III | The intent is a draft, and the spec was written at the main session's direction while the Author was away | Named as a deviation in the spec; T000 holds all code behind his acceptance and approval |

**Coverage summary**: every FR from FR-001 to FR-041 has at least one task, by number or inside a named range (§17's table), and every success criterion has a test task or an Author's run: SC-001 (T026), SC-002 (T024, T060), SC-003 (T008, T013), SC-004 (T009), SC-005 (T036), SC-006 (T010, T046), SC-007 (T011), SC-008 (T014), SC-009 (T061), SC-010 (T028). No task lacks a requirement or a story.

**Metrics**: 41 FRs, 10 SCs, 64 tasks (T000 to T063), 11 of them the Author's, and one review by an agent that wrote none of the work (T051); FR coverage 100%; 0 critical; 2 high (A1 resolved in the documents and open until his runs, A2 resolved by enforcement); 7 medium (A4 to A7 and A16 resolved; A3 and A8 open, his decision and T001); 7 low, resolved or accepted.

**Next actions**: the Author's acceptance of the intent and approval of the spec and this plan, or his overturning of any provisional answer; then T001, which settles A8.

## Departures while building (`feat/010-anthropic-provider`)

Each departure from the sections above, recorded in the commit that made it, as `CLAUDE.md` asks ("If implementation departs from the plan, update `plan.md` in the same commit"). The sections above are corrected in place where a departure changes what they say. Numbered B1 onward, so they don't meet the decisions D1 to D13. The branch was cut from `refs/heads/main` at a5eb05b8 (group A, group B, P-1, P-2, and `fix/007-paid-temperature` merged), not from group B's top, so §14's first choice became its second (R-15).

| ID | Where | The plan said | What was built, and why |
|---|---|---|---|
| B1 | §1 D2 step 1, step 2; tasks.md T002 | The latest version at T002, not one published in the last 7 days; MIT expected | `@anthropic-ai/sdk` **1.3.0**, published 2026-10-23 by GitHub Actions through npm's OIDC publishing. The latest, 1.6.0 (2026-11-05), and 1.4.0 (2026-11-02) and 1.5.0 (2026-11-04) are under 7 days old on 2026-11-08, so 1.3.0 is the newest the rule allows. Its licence is Apache-2.0, not MIT. It has no install script (its `scripts` are the maintainers' `build`, `test`, `lint`, `format`, and `fix`), and a `bin`, `anthropic-ai-sdk`, which nothing here calls. Its dependencies: `@opentelemetry/api` (the gateway's 1.9.1, deduped), `json-schema-to-ts` 3.1.1 (with `@babel/runtime` 7.29.13 and `ts-algebra` 2.0.0), and `standardwebhooks` 1.1.1 (with `@stablelib/base64` 1.0.1 and `fast-sha256` 1.3.0), each pinned by the lockfile's integrity; `zod` is an optional peer, the gateway's 4.6.5. `npm audit --omit=dev` lists no new advisory: the SDK appears once, through the gateway's existing `zod` advisory |
| B2 | §2.6, FR-016, SC-003, F3 | The key leaves in the `x-api-key` header | The pinned SDK sends an API key as `Authorization: Bearer <key>`, so the transport's headers name `authorization`, and SC-003 and F3's **Carries** say so (the spec's text changed in this commit; SC-003 names this ID, and F3's cell, which the disclosure copies word for word, carries none). FR-016's list, "the key", stands. **The evidence** (rechecked at the coordinator's question, 2026-11-08, since older SDKs sent `apiKey` as `X-Api-Key` and only `authToken` as a bearer token): in 1.3.0, `apiKeyAuth` returns `buildHeaders([{ Authorization: `Bearer ${this.apiKey}` }])`, at `node_modules/@anthropic-ai/sdk/src/client.ts` lines 1307 to 1312, the same at `client.mjs` lines 448 to 453 (the ESM build the gateway imports) and `client.js` lines 448 to 453; `authHeaders` (src/client.ts 1272 to 1305) joins `bearerAuth` and `apiKeyAuth`, and neither `prepareRequest` (client.mjs 513, token auth alone) nor the base client's `backendMiddleware` (client.mjs 555, empty) rewrites it. No `x-api-key` header is set anywhere in the package but a log redactor and a helper for third-party clients. And on the wire: the SDK with its own default fetch, a run-time key, and `apiKey` against a local server sent `authorization: Bearer <key>` and no `x-api-key`, exactly as with `authToken`. The Author's live contract run (T060) and the health check prove the form against the API itself; a 401 there would be `auth`, unbilled, and `credentials` on `/health`, so a wrong form fails closed |
| B3 | §2.6, D4, FR-007, R-3 | The SDK reads `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and its logging switch | 1.3.0 also reads `ANTHROPIC_CUSTOM_HEADERS` on every construction, merged into its default headers after the key, so a value there could replace the key or the API version; `ANTHROPIC_OPEN_TELEMETRY`, `ANTHROPIC_OPEN_TELEMETRY_PROPAGATION`, and the traces' content mode and size, with spans and trace propagation on by default through the global tracer provider, which the gateway registers; `ANTHROPIC_WEBHOOK_SIGNING_KEY`; and, only when no credential is passed, a profile chain (`ANTHROPIC_PROFILE`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_IDENTITY_TOKEN`, `ANTHROPIC_IDENTITY_TOKEN_FILE`, `ANTHROPIC_FEDERATION_RULE_ID`). So the client gets every option explicitly: `apiKey`, `authToken: null`, `webhookKey: null`, the fixed `baseURL`, `maxRetries: 0`, the settings' `timeout`, `logLevel: "off"` and a silent `logger`, `openTelemetry: {propagation: false, traces: {enabled: false}}`, and the transport as `fetch`; and the transport sets every header itself (B2), so nothing a variable adds reaches the wire. The unit test sets each of these variables and finds the request, its destination, its headers, and the logs unchanged |
| B4 | §2.5, §2.6 | The adapter reads the transport's `reached` mark from the SDK's connection error's `cause` | Confirmed, with a condition: the SDK turns any fetch failure whose text, or its cause's, mentions a timeout ("timed out", "timeout") into `APIConnectionTimeoutError`, dropping the cause. The transport's errors are named `AnthropicTransportError`, with messages that never say so, and set no `cause`, so their `reached` and `code` survive as `APIConnectionError.cause`. An `APIConnectionTimeoutError`, or an abort, is the request timeout or the deadline: `timeout`, possibly billed. A connection error without the transport's mark is also `timeout`, possibly billed, the side that never undercounts |
| B5 | §2.7, D6, FR-012 | T001 records the ID `models.retrieve` returns for `claude-haiku-5-5`, and whether the lookup is free | `client.models.retrieve(modelID, params, options)` exists in 1.3.0 (`GET /v1/models/{model_id}`, answering `ModelInfo` with `id`). What it returns for `claude-haiku-5-5`, and whether it is free, needs a live call, which no agent makes: the Author's first `/health` after his switch (T059) and his wrong-key check (T063) show both. The check passes on the configured ID or a dated snapshot of it (`claude-haiku-5-5-` and eight digits), as §2.7 allows |
| B6 | §8 item 8 | A `.gitleaks.toml` rule only if gitleaks's defaults don't flag an Anthropic key's shape | gitleaks 8.30.1's default rule `anthropic-api-key` flags the API key's shape (`sk-ant-api03-`, 93 key characters, `AA`), tried on a value built at run time in a scratch folder, and `.gitleaks.toml` extends the defaults (`useDefault = true`), so P-A has no gitleaks item. A bare `sk-ant-` value of another shape isn't flagged, which is why the gateway's own redaction (§8) matches `sk-ant-` followed by 20 or more key characters |
| B7 | §4.4 ("The rows a call touches"); data-model.md §2.4 | "the reservation already holds `adapter_id` and `period_month`, which name the row", so whether a call counts toward its adapter's month follows the configuration | A column, `reservations.adapter_month boolean NOT NULL DEFAULT false`, in `0005_adapter_month.sql`, set at admission when the call reserved against its adapter's month; the commit, the sweep, and a compensation release and charge that row only when it is true. The configuration is read at start, so a cap added or removed across a restart would otherwise have a sweep subtract what no reservation holds, a CHECK violation that fails its transaction and with it admission, or leave a reservation on the row forever |
| B8 | §7 steps 3 and 5 | A complete red-team run holds every committed live case of `redteam/cases/twin-*.yaml`; a complete product run holds every committed case of the topic | Two choices, each stricter: a red-team run holds every committed case with `live` in `redteam/cases/`, twin-named or not (45 at this branch, 41 of them `twin-*`), since `redteam/run.py`'s live mode sends every case with `live`; and a product run must also find at least one committed golden case of the topic on each path, or it reads "evidence missing", so a topic the suite can't ask about on a path can't be marked ready on a run that never asked (the coordinator's brief: "a product run holding no case of the entry's topic, on either path, is 'evidence missing'"). The lines say how many cases a run lacks, by path and kind |
| B9 | §8 items 2, 4, 5; spec FR-032; contracts/env-files.md §8; tasks.md T005, T054 | Both names in `evals/agent-config/static.py`'s FR-007 list, "which the canary reads", and in env-files.md §8's FR-007 table | `GATEWAY_ANTHROPIC_API_KEY` alone is an FR-007 variable. `ANTHROPIC_API_KEY` is still denied by name in `credentials.envVars` (P-A item 1), as `GITHUB_TOKEN` is, with its own matrix row, `H/settings/spec 010: ANTHROPIC_API_KEY is denied by name`, and a paragraph below §8's table. Found on a patched export before the note: `tools/gates/matrix_canary.py` and `evals/agent-config/behavioral.py` put a fake value for every FR-007 variable into a Claude Code session after stripping their `STRIPPED` names, `ANTHROPIC_API_KEY` first among them, so a fake under that name would sign the session in with it. The canary's own test refused it (`test_nothing_that_could_sign_the_session_in_elsewhere_reaches_it`: `assert ['ANTHROPIC_API_KEY'] == []`, and the passing case's API-key check), and every behavioral session would have stopped at its init event on API-key auth |
| B10 | §8 (where P-A lands), §13 (the patches; actions 2 and 3), §14 (the merge order); spec FR-032 and "The Author's patches"; tasks.md T054, T055 | P-A applied on `main` before this branch merges, then this branch gated and merged | P-A is committed on the Author's branch cut from this branch's tip, gated with it (with `--prove`, since `.claude/settings.json` changes, and with the behavioral tier), and merged as one (the coordinator's brief: "P-A on his branch cut from this tip, gated with it"). Neither half passes alone. On this tip, env-files.md §8 names `GATEWAY_ANTHROPIC_API_KEY` while `main`'s settings and FR-007 list don't, so the matrix's FR-007 row for it and the canary's `test_the_fr007_list_is_the_contracts` fail. On `main` with P-A alone, `static.py` would name it and §8 wouldn't, so that test would fail there. One merge gives `main` the code that reads the key and the deny that guards it together: `CLAUDE.md`'s "in the same patch that creates it". After the review: `feat/011-alert-message-design` stacks on this branch, and the Author's answer at its T000 was "one gate covers both", so his P-A branch is cut from that branch's tip, which holds this one, and this branch isn't gated alone; feat/011's note gives the combined steps |
| B11 | §10 (`evals/test_disclosure.py`); tasks.md T028; spec SC-010 | F3's cells equal the entry's, and the gate's own test held the committed F3 to the placeholder | Found by the review, as Important: SC-010's second half was unmet. The entry keeps the placeholder, so once T059 put the Author's words in F3, `make test` would fail twice (`row[:7] == entry[1:8]`, and `PLACEHOLDER in rows()["F3"][0]`), and his switch couldn't pass a gate. F3 is now compared with the entry around the placeholder, which F3 holds or his words replace, and the gate's test builds the before-words F3 from the entry, so it holds whatever the committed row says. A new test runs every F3 check on his words with prod's route on `anthropic`, and on `bedrock`, so a switch back keeps passing. The review suggested keeping the placeholder check while the route names no `anthropic`; that would fail a switch back to Bedrock that keeps his words, so the check goes, and the simulation replaces it |
| B12 | §4.2, §4.3; spec "Against the caps"; config-files.md §2 (`adapter_monthly_usd`); tasks.md T006, T057; ADR 0041 | A cap of $10.00, half the monthly ceiling, plan choice, the Author's to change | $20.00, the whole monthly ceiling: the Author's answer, "$20 a month" (spec Clarifications). §4.3 says what it means: the month ceiling stops paid calls first, with its kill switch, and both warnings can fire at $14. P-C rebuilt from plain copies |
| B13 | §8 item 6 (P-A's compose policy) | Refuse any `ANTHROPIC_*` key on any service, and `GATEWAY_ANTHROPIC_API_KEY` on any service but the gateway or in any form but `${GATEWAY_ANTHROPIC_API_KEY:-}` | Found by the review, as a nit: by key name alone, a reference such as `X: "${GATEWAY_ANTHROPIC_API_KEY}"` on another service passed. P-A now also refuses any other mention of the key's name, and any reference to an `ANTHROPIC_*` variable, anywhere in rendered compose (keys and strings, at any depth, in services and outside them), with seven test cases; rebuilt from plain copies and run on a patched export. The rebuild also puts P-A's test file in ruff's format: as first built, two of its lines ran past 88 columns, which `make lint` would have refused on his branch |
| B14 | §3 (the key, read through `api_key_env`); config-files.md §5 item 2; `src/config/validate-config.ts` | Prod's template holds the key empty, and `validate-config` checks each template against the startup checks | Found in this round, on a patched export in T059's state (P-A, P-C, and P-B applied, his words in F3, prod's route on `anthropic`): `validate-config` refused prod's template, `GATEWAY_ANTHROPIC_API_KEY is unset; routing.yaml's api_key_env names it (missing_env)`, so his switch commit could never have passed the gate's `validate-config`. A type's `secretEnv` (`api_key_env` for `anthropic-messages`) now names the settings whose key no committed file holds; a template that holds such a key empty counts it as present, as `__ASK__` counts, and a template without it still fails. The gateway's own startup check is unchanged: an empty key there is `missing_env`. RED: 1 failed, 11 passed; GREEN: 12 of 12 |
| B15 | §7 item 4; spec FR-027; `evals/twin_readiness.py` | The golden share per path, over the complete set | The move onto `fix/007-live-runs`' round 3 (c52655f7, 2026-11-09), at the main session's request. Round 3 built FR-031's golden bar as the Author amended it (`golden_bar`: all but one of a path's golden cases from two to nine, its one when it has one, the file's share from ten) and matched a path's results by ID (its plan's D30). The merged rule applies the bar to each path over the complete set of committed cases this spec requires, with round 3's message; a case's path is read from its file, so a `-non-engineer` ID is never an engineer's. Under the complete-run rule, round 3's new readiness tests commit the cases their runs hold, its fake-only runner test also patches `paid_adapter`, and this branch's threshold test fails none of two, which the bar refuses; every assertion stands as its branch wrote it |
