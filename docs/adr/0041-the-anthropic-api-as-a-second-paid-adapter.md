# ADR 0041: The Anthropic API as a second paid adapter, prod's fallback one at a time (spec 010)

Status: proposed, 2026-11-08 · Spec: 010 (FR-001 to FR-041; its Clarifications Q1 to Q6, taken provisionally and approved by the Author as taken on 2026-11-08; plan §1, D1 to D9, departures B1 to B15) · Extends [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md), its Decision item 3 and its "Bedrock model" line; replaces nothing · Number: the next free one on `main` at a5eb05b8, when the branch's task T003 ran

## Context

The Author, on 2026-11-08, as the main session's brief relays it:

> "Then on the prod stack, i want to run everything pointing to aws bedrock as well as an option of using the anthropic api directly, since we get $200 of free credits per month there."

Prod's gateway had one paid adapter, Bedrock, as ADR 0001 decided: "Bedrock, if local is unhealthy, the stack has a paid route (prod only, `H4_ENV=prod`), no meter is at its ceiling, today's fallback is below its allowance, and no renewal is pending." The constitution's Model access standard names "direct vendor APIs" among the gateway's adapters, and keeps "Routing policy is configuration; the initial policy is local-first with Bedrock as fallback inside a capped sub-budget." Spec 000's FR-021 asked for direct vendor APIs and shipped none.

Spec 010 reads "run everything pointing to aws bedrock" as the live runs on Bedrock, which exist, and "an option of using the anthropic api directly" as a second paid adapter he can choose in Bedrock's place. Both readings were taken provisionally (its Q1 and Q2), and he approved them as taken; his credits stay his words, and the meter reads no balance (Q3).

## Decision

1. **A second paid adapter type, `anthropic-messages`**, provider `anthropic`, in `services/gateway/src/adapters/anthropic-messages.ts`, with its transport beside it. It calls Claude Haiku 5.5 (`claude-haiku-5-5`, the model Bedrock's profile names) through Anthropic's official TypeScript SDK, `@anthropic-ai/sdk`, pinned exactly at 1.3.0 and vetted (spec 010's plan D1, D2; B1).
2. **ADR 0001's Decision item 3 reads "the paid fallback prod's route names"**: Bedrock, as today, or the Anthropic API. Prod's route names one paid fallback at a time, as `envs.prod.fallback` in `config/routing.yaml`; dev's stays synthetic. Choosing the Anthropic API is the one line `fallback: anthropic`, the Author's, and only after his price, his cap, his key, and his words in the disclosure's row F3 (spec 010, FR-002, FR-039). At this decision's merge the route still names Bedrock.
3. **ADR 0001's "Bedrock model" line gains a sibling**: the Anthropic model is Claude Haiku 5.5 through the Messages API at `https://api.anthropic.com`, an endpoint fixed in the adapter's code, never configuration or an environment variable (FR-005). Its price is a new version of `config/prices.yaml`, the Author's, marked "est." until he confirms it (FR-019).
4. **Every client option explicit, and a transport of the adapter's own** (D3, D4; B2, B3): the key from `GATEWAY_ANTHROPIC_API_KEY` alone, the fixed base URL, `maxRetries: 0`, the settings' timeout, the SDK's logging and OpenTelemetry off, and a `fetch` that resolves through c-ares, times the connect, locks the origin, tells an unreached call from a possibly billed one, and sets every header itself. The gateway's retry, circuit, deadline, meter, and kill switch govern the adapter as they govern Bedrock.
5. **The same ceilings, and a monthly cap of the adapter's own** (Q3, Q4; D7): every Anthropic call counts at its list-price estimate toward prod's $5 daily and $20 monthly ceilings, and a fallback call toward the $2-a-day sub-budget, whatever credits the account holds. `config/budgets.yaml`'s `adapter_monthly_usd`, the Author's, caps the adapter's month inside the monthly ceiling: $20, the whole ceiling, his answer ("$20 a month"). At the cap the adapter's calls are refused with the cause `adapter_month_spent`, the paid fallback awaits his renewal, as the sub-budget's exhaustion makes it do, and the adapter stays refused until the next UTC month or his patch raising the cap. Local answers go on. With the cap at the ceiling, the ceiling's own trip, which stops local answers too, comes first, and the cap stands as a backstop should the ceiling be raised (spec 010's plan §4.3).
6. **The temperature as a setting** (D9): a paid adapter's `temperature` is `as_requested` or `model_default`; both paid adapters set `model_default`, since Haiku 5.5 "takes no temperature but its default, 1". Bedrock's is on `main` already, from spec 007's plan, D22.
7. **The key's name** (Q5; D8): `GATEWAY_ANTHROPIC_API_KEY`, in prod's env file only, passed by compose to the gateway alone; no `ANTHROPIC_*` variable in any container.
8. **The live runs and readiness** (Q6): `make evals`, `make redteam-live`, and `make contract-live` take `ADAPTER=anthropic`; readiness asks for evidence on prod's local model and on the paid adapter prod's route names, and only complete runs count. A switch of the fallback closes no topic; the report names what the newly routed adapter lacks.

## Alternatives considered

The spec's six questions, each taken with its recommended option while the Author was away, and approved by him as taken:

| Question | Taken | The others |
|---|---|---|
| Q1: what "run everything pointing to aws bedrock" means | A: the live runs, on Bedrock, which exist; Bedrock stays prod's fallback | B: every prod call to Bedrock first, which ends local-first (a constitution amendment, and an ADR replacing 0001); C: every prod call to the Anthropic API first, likewise |
| Q2: how the Anthropic API joins | A: a second paid adapter, one paid fallback at a time | B: chained after Bedrock; C: both built on prod, one routed |
| Q3: whether its spend counts against the ceilings | A: yes, at list price, with a monthly cap inside the monthly ceiling | B: only against its own cap, outside the ceilings; C: not metered |
| Q4: what the cap stops, and who restores it | A: the adapter alone; the fallback awaits his renewal; the adapter waits for the month or a raised cap | B: a kill-switch trip; C: a rollover restore with no human step |
| Q5: the key's name | A: `GATEWAY_ANTHROPIC_API_KEY` | B: `ANTHROPIC_API_KEY`, which his shell's own key would shadow, and which preflight's P5 refuses when the shell sets it |
| Q6: whether a switch closes topics evaluated elsewhere | A: no; the report names the gap | B: each ready entry records its adapter, and the gateway closes it on a switch; C: no failover to an unevaluated adapter |

And the plan's own choices: hand-written HTTPS instead of the SDK (rejected: the API's shapes and errors kept by hand); the SDK's default fetch (rejected: `getaddrinfo` lookups and no connect timeout); a kill-switch trip for the cap (rejected: a provider's cap would stop local answers).

## Consequences

- Prod can serve its paid fallback from either provider, the Author's choice in one line, metered and capped the same way, and disclosed before any call (row F3 holds the Author's words about what Anthropic keeps, and `make test` holds the route back until they're in).
- The gateway's image carries a new dependency tree, about 27 MB on disk (B1), and its supply chain: pinned, vetted, installed without scripts.
- A second secret exists on prod. It is denied by name in the agents' sandbox before it can exist (the Author's patch P-A), passed to the gateway alone, and redacted wherever the gateway, the collector, the twin's guards, and the red-team suite look.
- A new degraded cause, `adapter_month_spent`, joins every list of causes, and the room reads it as its budget class.
- The same model through two providers can answer differently, so readiness counts evidence per adapter.

## Links

- Intent and spec: [specs/010-anthropic-provider/](../../specs/010-anthropic-provider/)
- Extended: [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md)
- The temperature's first half: spec 007's [plan.md](../../specs/007-twin-conversation/plan.md), departure D22
- Merge-request note: `docs/merge-requests/2026-11-08-feat-010-anthropic-provider.md`
