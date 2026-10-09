# feat/000-us2-kill-switch
Spec: specs/000-local-foundations/ (Phase 4, User Story 2: tasks T067–T086) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5) as the integrator, with two implementer agents (the gateway; the evals, stand-ins, dashboard, and docs) · Date: 2026-10-09
Authorized by: spec 000's plan.md and tasks.md; the Author's "Keep going until you hit the limit again. Try to continue as much as you can" (2026-10-09); and the standing rule to stack the next phase's branch while a finished one waits for its merge.

**Status: DRAFT SAVE POINT. Nothing is integrated on this branch yet.** I wrote it before a WSL restart, which wipes `/tmp`, so that Phase 4's state lives in git and not in the agents' scratch worktrees.

**Merge order:** this branch is stacked on `feat/000-us1-local-stack` (4d7f3a3). It merges after that branch, which itself waits for T063–T065 and T149.

## Where the work is

Two implementer agents started from 7dbe6a7 on `feat/000-us1-local-stack`, each on its own branch. The session's usage limit stopped both mid-task. Their finished commits are as they left them. I committed each one's unfinished work, unchanged, as a final `wip` commit, so it survives the restart. Neither `wip` commit has been linted or tested.

**`us2-gateway`** (the gateway half: T067–T070, T072–T078):

| Commit | What |
|---|---|
| 81f4bed | T072, from US1's review: init survives a lost COMMIT acknowledgement, and a refused statement isn't counted as an outage |
| 09f9084 | T069, part 1: every alert kind's text, and its dedupe key |
| 019c4a8 | T067, T068, T072: the meter. Metered admission, the commit, crossings, the sweep, and rollover |
| f1369e4 | **wip:** T073 and T074 in progress. The synthetic adapter and its contract test, dev's `fallback: synthetic`, the fallback branch in the gateway, and an end-to-end fallback test being written |

Still to do there: finish T073 and T074, which land together, then T070, T075, T076, T077, T078, and the rest of T069.

**`us2-evals`** (T071, T079–T083):

| Commit | What |
|---|---|
| 3f25a7c | T079: the Telegram stand-in and Mailpit, dev's alert receivers in stand-in mode |
| 86f6fe4 | T081: the dashboard's state, spend, and audit-and-alerts panels, with telemetry.md's exact queries |
| 2cfbf8d | T082: the nine US2 runbooks |
| b8a8010 | **wip:** T071's `evals/test_breach_helpers.py`, seen failing, and T080's `evals/breach_probe.py`, partial |

Still to do there: finish T071 and T080 (`breach.py`, the probe, `make breach-test`, the delivery overlay), then T083.

## Decisions made since the agents started

These come from US1's round-3 review on the base branch (7f49655, 110b42e), after the agents' starting point:
- Every probe hop passes `run --build`, breach-test's included.
- `make compose-images` builds only on the agents' engine.
- `scripts/operator.py`'s `hop()` and `check_url()` stay as they are on the base; T075 adds commands beside them.

## Next steps

1. **After the restart:** `git worktree prune`. Recreate each agent's worktree from its branch, and resume the two agents with their worktrees' new paths. Their transcripts are kept outside `/tmp`.
2. **The gateway agent** finishes T073 and T074 first, then folds its `wip` commit into real ones. The evals agent does the same with T071 and T080.
3. **Integration:** cherry-pick both branches onto this one, run `make check`, and record departures.
4. **Review:** the three reviewers who reviewed US1, each on its own slice.
5. **Then** the convergence pass, this note, and T084 (an agent session on the engine). T085 is the Author's recorded run.

## Appendix: the planning agent's split of Phase 4

A read-only planning agent wrote this from the contracts before the work started. It is model output, a reading of the contracts and not a contract; where they disagree, the contracts win. I split the work in two rather than four, to keep the gateway's files under one owner.

<details><summary>The planning agent's report, as written</summary>

## Phase 4 (US2, T067–T086): split across four implementer agents

`src/` and `test/` paths are under `/home/h4reet/h4reet-ai/h4reet-ai/services/gateway/`; every other path is under `/home/h4reet/h4reet-ai/h4reet-ai/`.

**Base first.** Branch `feat/000-us2-kill-switch` only after T144, T147, T148, T150 and T151 are cherry-picked onto US1. Their worktrees (`us1-probe-hello`, `us1-gateway-gaps`) edit `app.ts`, `app.test.ts`, `Makefile`, `compose.yaml`, `evals/Dockerfile.probe`, `scripts/operator.py` and the disclosure. Keep `tasks.md` ticks and the T086 note to yourself: the task lines sit next to each other, so two agents ticking them would conflict.

### 1. Workstreams

**A. The meter (the critical path): T067, T068, T072**
- **Owns:** `src/meter/{types,admission,commit,crossings,sweep,rollover,limits}.ts`, both `meter.test.ts` files, and `test/helpers/pglite.ts`.
- **Also edits:** `journal.ts`, to add `unwritableSince()`.

**B. Routing and the breach test: T073, T074, T071, T080**
- **Owns:**
  - `src/adapters/synthetic.ts`, plus `synthetic` added to `REGISTERED_ADAPTER_TYPES` in `_settings.ts`, and the switch skip in `registry.ts`;
  - `src/core/gateway.ts`, `src/core/router.ts` and `src/routes/hello.ts`;
  - `config/routing.yaml` and the synthetic contract test;
  - a fallback fixture directory and a `testStack` option for it;
  - `gateway.test.ts`, and `app.test.ts`, where it inverts T148's test;
  - `evals/breach.py`, `breach_probe.py` and `test_breach_helpers.py`.
- **Shared:**
  - in `app.ts`, the `createServices` hunk only;
  - one `COPY evals/breach_probe.py` line in the probe Dockerfile;
  - the Makefile's `breach-test` recipe.

**C. The operator surface: T070, T075, T076, T081, T082**
- **Owns:**
  - `src/routes/admin.ts`, and `src/routes/test.ts`, registered from `registerAdmin`;
  - `src/meter/operator.ts`: the reset, renew and clock transactions, on `init.ts`'s pattern;
  - `operator.test.ts`, `scripts/operator.py` and its tests;
  - the dashboard JSON with `test_dashboard.py`, and the runbooks.
- **Shared:**
  - in `app.ts`, only the `registerAdmin({...})` object in `buildApp`, which gains `stateDir` and `testMachinery`;
  - the Makefile's `operator-*` targets, inserted right after `operator-init`.

**D. Alerts and incidents: T069, T077, T078, T079, T083**
- **Owns:**
  - `src/alerts/*` and `src/incidents/draft.ts`;
  - `evals/standins/*`, the two new compose services and their compose tests;
  - `docs/data-flow-disclosure.md`, including row S11. S11 must be widened to the probe's new in-stack destinations: prometheus, loki, langfuse-web, telegram-standin and mailpit.
- **Shared:**
  - `store.ts`, to add a `listen()` passthrough only;
  - in `app.ts`, only `startGateway` step 3 and `close()`.

The three `app.ts` hunks don't overlap. In the Makefile, each workstream adds its own `.PHONY:` line next to its targets; nobody edits the shared list on line 386.

### 2. Interfaces

```ts
// A1 src/meter/types.ts (types only)
AdmitRequest { attribution:"fallback"|"metered"|"test"; adapter:{id,provider,model,fixedUsage?};
  adapterAvailable; adapterUnhealthySince?; maxOutputTokens; clientKey? /*hello only*/;
  requestId; traceId; purpose; routeReason:"local_unhealthy"|"local_failed"|null }
Admitted { reservationId; attribution; adapterId; provider; model; priceVersion; maxMicro:bigint; periodDay; periodMonth; expiresAt }
AdmitResult = {ok:true;admitted}
  | {ok:false;refusal:"limit";error:"client_cap_exceeded"|"metered_capacity_exceeded";limit:"metered_in_flight"|"global_in_flight"|"global_per_minute";retryAfterS}
  | {ok:false;refusal:"degraded";decision:Degraded}   // router.ts degraded(cause,{ceilings,since})
MeterPort { admit(r):Promise<AdmitResult>; settle(a:Admitted,o:AttemptOutcome,{clientLabel?}):Promise<{committed:boolean}>;
  counters(); start(); stop() }                      // settle owns slot release and the 2 s retries
// A2 src/meter/sweep.ts
lockState(q):Promise<LockedState|undefined>           // first statement of every state/meter transaction
upsertPeriodRows(q,day,month,grantMicro,nowIso)       // §7.2 step 4
sweepExpired(q,ctx,locked,nowMs):Promise<TxEffects>   // caller emits h4.cost.usd and logs after COMMIT
// B1 gateway.ts
GatewayCall += clientKey?; GatewayAnswer: answered.route += "fallback"|"metered"; += {kind:"refused",error,limit,retryAfterS,traceId}
Gateway.meteredCall(call,{attribution:"metered"|"test",adapterId}); refreshGauges() public; GatewayOptions.meter:MeterPort
// D1 format.ts / outbox.ts
AlertSpec += warn{meter,grantNo?} | trip{ceiling} | fallback_exhausted{grantNo}
  | operator_action{action:"reset",fingerprint,metersAtCeiling} | operator_action{action:"renew",fingerprint,grantNo}
  | reminder | store_unreachable{since}
dedupeKey.*()                                          // one per row of alerts.md §2
factsOf(locked,rows,thresholds,fallbackId) → {runtime,fallback,meters}
queueAlert(q,writer,ctx,spec):Promise<boolean>         // renderAlert + the existing enqueueAlert (ON CONFLICT + NOTIFY)
```

**Outbox kinds (alerts.md §2)**
- A writes `warn`, `trip` and `fallback_exhausted`, from "the commit transaction" and from the sweep (§2.4).
- C writes `operator_action` for reset and renew.
- D writes `reminder`. `store_unreachable` is never stored.
- The dispatcher works from the columns of data-model §2.7, never from the kind.
- A trip also writes an `incidents` row with status `queued` (§2.8) and a `trip` audit row. That row's `detail` gains `spent_before_micro`, `spent_after_micro` and a `meters` snapshot (spent, reserved, allowance, grant). D's draft needs these for "Meters at the crossing".

**Admin routes calling the meter (reset, renew)**
- C writes `resetKillSwitch(deps, reason, op)` and `renewFallback(deps, reason, op)`. Each returns `{status, body}`, as `initializeStore` does.
- Renew runs `lockState`, then `sweepExpired`, then `upsertPeriodRows`, then "allowance_micro = spent_micro + reserved_micro + <fallback_daily>, grant_no = grant_no + 1" (data-model §7.5).
- The audit row and `queueAlert` go inside the transaction. The `operator` journal record and `gateway.refreshGauges()` come after COMMIT.

**Test endpoints driving the real pipeline (operator-admin §3.2)**
- `fallback` "runs exactly as a hello would": `gateway.complete(call)` with no `clientKey`, because "Per-client limits don't apply".
- `metered` "skips the local step": `gateway.meteredCall(call, {attribution: "metered", adapterId})`.
- Both use `purpose: "synthetic"` and the message `synthetic spend`, and stop at the first answer that isn't answered.
- The clock runs inside C's transaction: `lockState`, a forward-only check against the locked row's offset, the audit row, COMMIT, the `clock` record, then `clock.setOffsetMs`.
- B's probe calls everything through the existing `AdminClient.request(method, path, body)`, so it doesn't need C's new CLI methods.

**Stand-ins (D to B)**
- `sendMessage` answers `{"ok":true,"result":{"message_id":n}}`.
- `GET /messages` answers `{"messages":[{chat_id,text,received_at}]}`.
- Mailpit takes SMTP on 1025 and serves its API on 8025.

### 3. Ordering

1. **First hour:** A1, B1 and D1 land.
   - B1's `meteredCall` answers `no_fallback_in_stack` until T074, and B1 includes hello's handling of the new answer kinds.
   - D1 renders every kind, with T069's render tests.
   - Cherry-pick all three into one base, and have every worktree rebase onto it.
2. **Critical path:** A2 (sweep and crossings, then admission and commit), then B's combined T073 and T074 commit (the `createServices` wiring, `routing.yaml`, and removing the `fallback_not_supported` refusal), then the end-to-end tests.
3. **Fully parallel against stubs:**
   - B: `gateway.test.ts` with a fake `MeterPort`, and all the breach Python.
   - C: everything except renew, which waits for A2. Its synthetic route is tested against a fake gateway first.
   - D: all of it, with rows seeded through `enqueueAlert` and plain SQL.

### 4. Traps

1. **Crossings are edge-triggered on committed spend.** They fire "only when the old value is below the threshold and the new one is at or above it" on `spent_micro` (data-model §7.3). Refusals count spent plus reserved (§7.2 step 5). Exhaustion fires only "while the flag is false". A trip sets `since` only when the state was `normal`. Rollover never touches `state`, `crossed` or the renewal flag (§6.1, §7.6).
2. **Rounding.** `costMicro` in `validate.ts` already rounds up once, on the sum. `max_micro` is the larger of the caps' cost and `fixedUsage`'s cost, so a synthetic call reserves exactly 100,000 (§7.2). `usd()` truncates; incident drafts use six decimals (alerts §3, §7).
3. **Locking order (§2.1).** The journal-failure compensation, the 10 s sweep, reset, renew and the clock all take the `stack_state FOR UPDATE` lock first. PGlite is a single connection and `withSession` doesn't isolate sessions. So serialize `withSession` in the test helper, and prove the order from `db.statements`.
4. **The reserved-micro invariant (§2.3).**
   - The commit subtracts only when its DELETE returned a row.
   - Every path subtracts from the reservation's own period rows, and from `fallback_day` only for `fallback` calls.
   - The commit uses the reservation's price version.
   - The sweep's ledger row must pass `ledger_expired_never_settled`. Reservations don't store `route_decision`, so derive it from the attribution; `client_label` is NULL.
5. **Refusal precedence.**
   - The in-memory 429s run before the transaction, so full slots beat `fallback_unavailable` (gateway-http §2.4).
   - Inside the transaction: tripped, then ceiling, then awaiting renewal, then spent today, then unavailable. `metered` calls check "the ceilings only".
   - Refusals use `throw new Rollback(...)`, so they aren't counted as store outages (`store.ts`).
   - `journal_unwritable` comes after COMMIT.
   - Slots are freed "in a finally on every way out" (§7.3).
6. **T073 and T074 must land together,** or every dev gateway exits 78 (T148).
   - Factories see only `*_env` keys, so the `GATEWAY_TEST_SYNTHETIC_SPEND` skip belongs in `buildRoute`. With the switch off, the answer is `no_fallback_in_stack`.
   - Rule R6 needs `synthetic` registered.
   - Adapter health starts at `not_ready`, so tests must probe once or they get `fallback_unavailable`.
7. **US1's `init.ts` reads renew's records.**
   - The journal record needs `allowance_micro` and `grant_no` as numbers.
   - The audit row needs `after.fallback_day.{allowance_micro, grant_no}` (`auditRenewal`).
   - On the dev-only routes, authentication comes first (operator-admin §1.1). Then they refuse with 403 unless `H4_ENV=dev` and the route's own switch are both set, and count `h4.test_machinery.refused`.
8. **Delivery details.**
   - Attempts run at 0, 5, 20, 50, 110 and 230 s after `enqueued_at`, on the real clock. Compare against a time parameter, not the database's `now()`, or tests with an injected clock never come due.
   - Store only error classes: the Telegram URL holds the bot token.
   - In stand-in mode the token is `standin` and the chat `0`. The contract doesn't specify stand-in From/To addresses, so choose them and record it.
   - pino's log hook censors any key named `body`.
   - The fallback warning's meters line adds `, warning 1.40`.
   - The alerts.md example shows no reminder on the day of the trip itself.

### 5. Can't be built or proven here (besides T084 and T085)

- **Images and compose runs:** building the stand-in and the probe image (with `breach_probe.py`), running mailpit, and `make breach-test` itself.
- **The breach test's T, M and L assertions:** they need Langfuse, Prometheus and Loki. Only T071's helpers can be tested.
- **Real delivery:** the real Telegram API, and SMTP over TLS on 465 or 587 with certificate checks.
  - Node can't mint a certificate, and committing a key would trip gitleaks.
  - Use plain stubs on loopback, and assert the transport options.
- **Real Postgres behaviour:** `pg` LISTEN across connections, `SKIP LOCKED` contention, and lock and statement timeouts.
- **Grafana:** rendering the new SQL panels through `grafana_ro`.
- **Any real dev stack:** blocked until the Author's config patch adds `budgets.yaml` and `alerts.yaml`.

### Critical Files for Implementation
- /home/h4reet/h4reet-ai/h4reet-ai/services/gateway/src/core/gateway.ts
- /home/h4reet/h4reet-ai/h4reet-ai/services/gateway/src/meter/init.ts
- /home/h4reet/h4reet-ai/h4reet-ai/services/gateway/src/routes/admin.ts
- /home/h4reet/h4reet-ai/h4reet-ai/services/gateway/src/alerts/format.ts
- /home/h4reet/h4reet-ai/h4reet-ai/services/gateway/src/app.ts

</details>
