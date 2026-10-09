# feat/000-us2-kill-switch
Spec: specs/000-local-foundations/ (Phase 4, User Story 2: tasks T067–T086) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5) as the integrator, with two implementer agents in worktrees (the gateway half; the evals, stand-ins, dashboard, and docs half); reviewed by read-only reviewer agents (the gateway; the stack; the breach test; a verifier of every fix), with the convergence pass after the reviews · Date: 2026-10-09
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes
Authorized by: spec 000's plan.md and tasks.md; the Author's "Keep going until you hit the limit again. Try to continue as much as you can" (2026-10-09); "Let's continue as much as possible until the restart is needed" (2026-10-09); and the standing rule to stack the next phase's branch while a finished one waits for its merge.

**Status: DRAFT. Not ready to merge.** Every task an agent session can do before the engine exists is done, reviewed, and passes `make check`. What's left needs the engine or your hands:
- **T084 (an agent session, on the engine):** `make breach-test ENV=dev-cpu` passes all 12 steps.
- **T085 (yours, Heavy):** `make breach-test ENV=dev DELIVERY=real`, recorded, with the phone on camera (SC-002).
- **This note:** both runs' output goes into it, and then this block goes.

**Merge order:** this branch is stacked on `feat/000-us1-local-stack` (786ebbe), which waits for T063–T065 and T149. Merge that branch first; then bring this one up to date with main, as T063 does for us1; then merge it once this block is gone.

## Runs in the Author's terminal

ADR 0017 puts this section first. Nothing here has run outside the sandbox: there is no Docker, GPU, or registry in it.

| What | How it runs | Check before you run it |
|---|---|---|
| **`scripts/operator.py`'s `reset`, `renew`, `audit`, and `incidents`**, and **`make operator-reset`, `operator-renew`, `operator-audit`, `operator-incidents`** (T075) | through `PY_HOST`, by path, with your real token | They reuse `AdminClient` unchanged: the same token readers, the port pin, no proxy, no redirects, the unredirected `Authorization`. `reset` and `renew` need a `REASON` of 10–500 characters, checked by the CLI and by `AdminClient` itself. `incidents --show` prints what the stack's gateway sends, with control characters shown as `?`. `LIMIT` and `ID` are in `LITERAL_VARS`, so make passes them as typed. |
| **`evals/breach.py`** and **`make breach-test ENV=dev [DELIVERY=real]`** (T080) | through `PY_HOST`, by path, in your terminal for dev | For dev it runs only from the export the running commit's run file names (`H4_TREE`). From any other tree it refuses before any docker command or token read, so it never builds the working tree on your engine. It builds the probe from that export, gives the probe dev's token on standard input, and passes only the two Langfuse keys. With `DELIVERY=real` it writes a one-line overlay, 0600 in a 0700 temporary directory, as the third env file. It removes it in a `finally`, and on Ctrl-C, SIGTERM, and SIGHUP. A SIGKILL leaves dev on real delivery until the next `make up ENV=dev`. |
| **The stand-ins** (T079): `evals/standins/telegram_standin.py` and Mailpit | containers on dev's `internal` network, `dev-receivers` profile | The stand-in takes only the token `standin` and chat 0, and never forwards anything. Mailpit is pinned in images.lock, with no relay, forward, or webhook configured. Neither publishes a port. |

## What changed and why

| Commits | Change |
|---|---|
| a0d3701 | **T079:** the Telegram stand-in and Mailpit, with disclosure rows S12 and S13. |
| 4b5a92e | **T081:** the US2 dashboard panels, with telemetry.md §7.1, §7.2, and §7.5's exact queries. |
| 944cb47, e7d70c5 | **T082:** the nine US2 runbooks; two use `make hello`. |
| 1962034, 9f7d263 | **T071, T080:** the breach test. `evals/breach.py` runs the 12 steps; `evals/breach_probe.py` holds the probe and its assertion helpers; plus `make breach-test` and the delivery overlay. |
| ce1b89f | **T083:** the Telegram and SMTP rows (A1, A2), and row S11 widened to what the probe calls. |
| 4ff72c2 | **T072, from US1's review:** init survives a lost COMMIT acknowledgement, and a refused statement isn't counted as an outage. |
| 5b4c53c, e7dbed5 | **T069, T077:** every alert kind's text and dedupe key, and delivery: Telegram, SMTP, the retry schedule, `store_unreachable`, and the reminder. |
| 701c7de | **T067, T068, T072:** the meter. Metered admission, the commit, crossings, the sweep, and rollover. |
| 28c52a0 | **T073, T074:** dev's synthetic fallback and FR-022's metered fallback branch, together; `fallback_not_supported` removed. |
| b13ae90, 57d3710 | **T070, T075, T076:** reset, renew, the audit log, and incident reads, with their CLI and make targets; the dev-only clock and synthetic spend. |
| 824bcfa | **T078:** the incident drafts, from a deterministic template. |
| 1012e70, f3a614a | **The gateway review's five nits, and the wiped store:** the meter prices each call itself; one trip record per transaction; a store wiped under a running gateway reads as `store_uninitialized`. |
| 4e059ab … 120d9b2 | **The breach-test review's fixes** (round 1, below). |
| deece03, 43984a2, a481f47 | **The gateway review's last three nits** (round 1, below). |
| 490170e, 65af354 | **Integration:** operator-admin.md §6 names the probe's two Langfuse keys; T117's text names the breach test's dev route. |

### Departures from the plan

Each is recorded where the plan or contract says otherwise, in the commit that made it:
- **The meter and the store** (data-model.md):
  - §2.1: what counts as a store failure, the lost acknowledgement, and re-migrating a wiped store;
  - §6.1: the row for a lost volume;
  - §7.3: the meter prices calls itself, and a slot backstop;
  - §7.7, and §8 step 9.
- **Telemetry** (telemetry.md): per-call root traces with links (§3.2); `h4.meter.commit` (§3.3); and in §5.2, `killswitch.tripped` once per transaction that sets degraded, plus `meter.sweep_failed` and `incident.draft_failed`.
- **Alerts** (alerts.md):
  - §4.1: `X-H4-Alert-ID`, as nodemailer spells it; the Telegram error classes; the delivery lease; LISTEN reconnecting;
  - §7's readings of T078: the daily-totals heading only on monthly drafts, and a ceiling crossed on an already degraded stack.
- **The admin API** (operator-admin.md): the §2.3 409 row; §3.1–§3.2; §4.2–§4.3; and in §6, the new commands and the probe's two Langfuse keys.
- **The breach test** (plan §8):
  - each stack on its own engine, and dev only from its export;
  - the probe's call: `run --build --rm -T`, `python3 -I`, the token and operations on standard input;
  - checks timed from the action they measure, and restart rows counting only the new process;
  - step 10's pacing under the metered cap;
  - real mode telling the providers from the stand-ins.
- **The delivery overlay** (env-files.md §7.2): it is the third env file, and an interrupted run still restores dev.
- **The matrix** (plan §13 and §15): the breach test's dev route is nine planned rows for the closing patch, so the matrix gate reports PLANNED (T117).
- **Config** (plan §5.8, config-files.md §1.4): the temporary `fallback_not_supported` refusal is gone.

## Acceptance criteria

User Story 2's scenarios are proven by the breach test's 12 steps (plan §8). T084 runs them on dev-cpu, and T085 on dev with real delivery. Built here:
- **FR-022's fallback branch,** in its precedence order.
- **FR-030, FR-031:** the ceilings and the meter, in the store and checked at request start.
- **FR-032:** warnings, delivered over Telegram and SMTP within the retry schedule.
- **FR-033:** a trip to degraded, with no human action.
- **FR-034:** reset and renew, with the operator credential, a reason, and an audit row.
- **FR-035:** the incident drafts.
- **FR-036:** `make breach-test`, dev and dev-cpu only.
- **FR-040:** the alert rows (A1, A2).
- **SC-002:** 60 s to degraded and 5 minutes to the alert. The breach test asserts both, timed from the action; only T084 and T085 can prove them.

## Constitution check

| Principle | Touched? | How it complies, or the justified deviation |
|---|---|---|
| I. Data-local | Yes | The new flows that leave the local tier are the alerts: Telegram's Bot API and the alerts mailbox's SMTP (A1, A2), carrying no payloads, client labels, or secrets (alerts.md §5). The stand-ins sit on `internal` alone. |
| II. Production-grade | Yes | Tests for every module (the counts are under Verification), nine runbooks, the US2 dashboard panels, and the breach test itself. |
| III. Intent → spec → code | Yes | Built task by task, departures recorded with their commits, reviews and the convergence pass before merge. |
| IV. Least privilege | Yes | Reset and renew require the operator token and a reason; the test machinery is dev-only, by the env class and its switch, after authentication. **Deviation, tracked:** bash-gate doesn't yet refuse an agent's `make breach-test ENV=dev` (FR-008). Stage S keeps the sandbox off dev's ports and token. The closing patch (T117) adds the rule, and nine planned matrix rows hold it until then. |
| V. Cost | Yes | The meter is the enforcement point: ceilings, the fallback sub-budget and its renewal, and every metered call priced by the meter itself, at the reservation's price version. Synthetic spend is dev-only. |
| VI. Build in public | Yes | No secrets; gitleaks finds none. |
| VII. Own the whole product | No | No claims about the Author. |
| VIII. Honest AI | No | No twin yet. |

## Review

### Round 1

| Slice | Reviewer's verdict | Findings and fixes |
|---|---|---|
| The gateway's first three commits (T069 part 1, T072, the meter) | ready | Every focus point held under mutants: the locking order, crossings, precedence, the reserved-micro invariant, the sweep's rows, rounding, and rollover. Five nits, fixed in 1012e70: init's re-read when the store is still down; `settle()` trusting the caller's cost (it now prices the call itself, with a slot backstop); two untested guards; `killswitch.tripped` once per crossing; the sweep swallowing failures. |
| The stack's first three commits (T079, T081, T082) | sound | Two nits: row S11 disagreeing with S12 and S13 (fixed in ce1b89f), and two runbooks building hello by hand (e7d70c5). |
| The breach test (T071, T080, T083) | request changes | Four Important findings, all fixed: |
| | | 1. dev ran from breach.py's own tree, unchecked against the run file's `H4_TREE` (4e059ab). |
| | | 2. Windows were timed from the check, not the action, and the restart rows could pass on the old process (f19e088). |
| | | 3. Step 11c could never pass; the gateway now re-migrates (f3a614a, 021454f). |
| | | 4. FR-008 for the breach test's dev route: planned rows and T117's text (dcd8353, 65af354). |
| | | Five nits: db8649e, daea1d3, 561d2df, 120d9b2. Step 10's pace, raised by the gateway implementer, is fixed in db8649e. |
| The gateway's later commits (T070, T073–T078) | ready | It ran the new CLI end to end against the real admin app: `$`, quotes, and `$(shell …)` in a reason reached the audit row byte for byte. Three nits: two untested guards (deece03, 43984a2), and the dispatcher never listening again after a dropped connection (a481f47). |

### Round 2: every fix verified (at 65af354, matrix rerun at a4911df)

A fresh reviewer checked all eleven fix commits against their findings: each is fixed, and for each, a mutant that reverts it fails a test.
- **Gateway:** the terminal cleaning and `AdminClient`'s own reason check (deece03); the per-request dev check (43984a2); the dispatcher listening again (a481f47).
- **Breach test:** dev only from its export (4e059ab); step 11 as the contract has it (021454f); windows timed from the action, with 5a and 6f counting only the new process (f19e088); step 10's pace and every figure re-derived from plan §8 (db8649e); the stand-ins told apart in a real run (daea1d3); the surviving mutants (561d2df); and the interrupt handling (120d9b2).
- **The planned rows (dcd8353):** sound as a recorded deferral to T117. An allowed planned row reports PLANNED, a blocked one needs its audit record, and a hook crash is FAIL. A FAIL row anywhere still exits 1, and `run_checks` reads the exit code before any PLANNED line, so the gate fails.

It found three new nits, all with the implementer:
- an interrupt that arrives during cleanup stops the cleanup;
- two surviving mutants;
- the probe's `shorten()` lets DEL and C1 control characters through.

### `/speckit-converge` (after round 1)

Run over Phase 4's scope at 65af354: 24 requirements and criteria (FR-008, FR-022, FR-030 to FR-037, FR-040, SC-002, US2-1 to US2-8 and the independent test, and three edge cases), the 20 tasks, 16 plan sections, 59 contract sections, and principles I–VI. No MUST is violated. A read-only agent did the assessment. It found 5 gaps, 0 critical, 0 high, 2 medium, and 3 low, and one flaky check. I appended them as T152–T157 (cb36083):
- **Medium:** nothing queued the `fallback_unavailable` alert when a paid fallback turns unhealthy (T152); the planned matrix rows missed four spellings of the breach test's dev route, including the module form `python3 -m evals.breach` (T153).
- **Low:** the `disabled` health reason was never produced (T154); a synthetic run stopped by a limit was counted as `fallback` even when metered (T155); SMTP recorded an assumed `250` (T156).
- **Flaky:** C10's stub-case timing check failed once under load (T157), the same kind of race round 3 found in US1's C3.

It also checked T084's and T085's paths on paper. T022's config patch applies cleanly here, and with it `validate-config` reports 0 errors, so neither run is blocked by configuration.

Pending: T152–T157, with the implementers.

## Verification

Pending: the final `make check` and gitleaks at the tip.

## Cost and data-flow impact

**Cost:** the breach test's synthetic spend is dev-only and never reaches a provider. In production, the fallback runs inside its sub-budget, and the meter refuses a call once a ceiling is reached (FR-030, FR-031).

**Data flows:** Telegram's Bot API and the alerts mailbox's SMTP (rows A1, A2), carrying only alert text: no payloads, no client labels, no secrets. The stand-ins replace both on dev unless `DELIVERY=real`.

## For the Author

1. **After us1 merges:** bring this branch up to date with main, as T063 does for us1.
2. **T084:** ask me for an agent session on the engine: `make breach-test ENV=dev-cpu`, all 12 steps.
3. **T085 (Heavy):** `make breach-test ENV=dev DELIVERY=real`, recorded with asciinema into `docs/recordings/` (scanned with gitleaks before you commit it), with the phone on camera (quickstart.md §2.2). Fill dev's channel keys first.

### For later tasks

- **T117:** the breach test's dev route in bash-gate, which turns the nine planned rows to block.
- **The gateway implementer's notes:** a lost init record is repaired only when the operator's retry gets the 409. A call with several attempts is charged their sum, which can't exceed `max_micro` with today's retry policies.
- **Only real runs prove:** Prometheus's and Loki's answers about a past moment, and whether the 5 s grace is enough; Mailpit's time format; signal handling in your terminal; step 10's waits against the real limiter; real TLS, SMTP AUTH, and Telegram delivery; re-migration against a recreated Postgres container.

### CLAUDE.md, by your hand

The breach-test reviewer suggested a line for "Things Claude gets wrong", from its Important 1, which repeats US1 round 3's working-tree images on your engine:

> - A script that builds or runs a host stack's containers checks that its own tree is the run file's `H4_TREE`; make's path isn't enough.

### Observations

- **The usage limits stopped both implementers twice.** Before your WSL restart, I committed their unfinished work as `wip` commits on their branches. Both agents later folded those into finished commits, and the integration squashed the evals half's `wip` into T071's commit (1962034).
- **The matrix gate now reports PLANNED (T117)** for the thirteen breach-test rows (nine, plus T153's four). A FAIL elsewhere in the matrix still fails the gate: the verifier checked it with a mutant.

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
