---

description: "Task list for spec 010, the Anthropic API as a second paid adapter"
---

# Tasks: The Anthropic API as a Second Paid Adapter, and the Live Runs on Either Paid Adapter

**Input**: the documents in `specs/010-anthropic-provider/`: [spec.md](spec.md) (FR-001 to FR-041, SC-001 to SC-010, the Clarifications Q1 to Q6, Amendments 0-1 to 0-10, 2-1, and 7-1 to 7-5, and its Data-Flow Disclosure Entries) and [plan.md](plan.md) (decisions D1 to D13, §2 to §13, the patches P-A to P-C, the risks R-1 to R-15, and the analyze pass at its end).

**Prerequisites**: the Author accepts the intent and approves the spec and the plan (T000). Until then no task below starts: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`." The spec's answers Q1 to Q6 were taken provisionally at the main session's direction while he was away; a no to any of them changes the FRs it names, and the tasks that build them, before those tasks start.

**Tests**: required. In each phase the test tasks come first and must fail (RED) before the code that makes them pass (GREEN); the branch's note records both runs. Every agent check runs inside `make test` or `make evals`, so no `CHECK_GATES` entry is added.

**Organization**:
- **One branch**, `feat/010-anthropic-provider`, in its own worktree, cut from group B's top as it stands when T001 runs (`feat/009-room-avatars` at 953ad7ea when this list was written), or from `refs/heads/main` once group B has merged; it merges after group B (plan §14).
- **The phases**: Setup; Foundational, which holds every refusal, degraded path, and secret check before any happy path (Principle I); User Story 1 (P1, the MVP); User Story 2 (P1); User Story 3 (P2); User Story 4 (P3); then Polish, the merge, and the Author's runs.
- **Parallel lanes**: tasks marked [P] touch files no unfinished task of their phase touches, so agents can take them in worktrees of their own, one per agent that writes, the commits cherry-picked onto the branch in task order. Agents never merge.
- **The branch ends** with a review by an agent that wrote none of it, then a merge-request note, `docs/merge-requests/<date>-feat-010-anthropic-provider.md`, holding `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s.

## Format: `[ID] [P?] [Story?] Description (branch)`

- **[P]**: can run in parallel with the other [P] tasks of its group: different files, no dependency on an unfinished task.
- **[USn]**: the user story of a story phase. Setup, Foundational, and Polish tasks carry none.
- **"Author:"** opens a task only the Author does: in his own terminal, on `main`, on prod, or with a paid adapter. Agents never do these steps, never read or write his env file, and never type his paid-run commands into a shell: the bash gate refuses some of their text, heredocs included, so they go into the note through the editor.
- **Patches.** A human-only path (`.claude/**`, `CLAUDE.md`, `REVIEW.md`, `tools/gates/**`, `evals/agent-config/**`, `assets/policy/**`, `corpus/` but `corpus/proposals/`, `config/budgets.yaml`, `config/prices.yaml`, `config/alerts.yaml`, `config/twin-readiness.yaml`, `.gitleaks.toml`) changes only by the Author's hand. An agent task writes such a change as a `.patch` beside the branch's note, built from plain copies (`git show`, `git diff --no-index`), never by `git apply` or a write into any worktree.
- **Check** ends each task: what proves it done. **The branch** ends each task.

## Path conventions

- The gateway: `services/gateway/src/adapters/` (the adapter, its transport, the settings), `src/meter/`, `src/core/`, `src/config/`, `src/twin/guards.ts`, `src/telemetry/`, `src/alerts/`, `migrations/`, `test/unit/`, `test/contract/`, `test/integration/`, `test/helpers/`.
- "D-n", "§n", "P-A" to "P-C", and "R-n" are plan.md's; "Qn", "FR-nnn", "SC-nnn", and amendment IDs are the spec's.
- Tests build every key-shaped value at run time (`"sk-" + "ant-" + …`) and compute hashes from fixtures, never as literals, which gitleaks and the gate's content scan refuse.

---

## Before any phase

- [ ] T000 Author: accept or close the intent (`specs/010-anthropic-provider/intent.md`); answer Q1 to Q6, or let the provisional answers stand; approve spec.md and plan.md; gate and merge `spec/010-anthropic-provider` (documents only) with `tools/gates/gate spec/010-anthropic-provider` from main's checkout and the merge command it prints. Check: the intent's Status line reads accepted, and any answer of his is recorded in the spec's Clarifications in his words (main)

---

## Phase 1: Setup

**Purpose**: the base confirmed, the SDK's surface read and the dependency vetted, the interfaces and the ADR written down, and the Author's patches drafted.

- [ ] T001 Create the worktree for `feat/010-anthropic-provider` from group B's top (or `refs/heads/main` if group B has merged) with `git worktree add -b feat/010-anthropic-provider <new folder> <base>`, run `npm ci --ignore-scripts --cache "$TMPDIR/npm"`, and bring this folder into its tree (cherry-pick `spec/010-anthropic-provider`'s commit if the base lacks it). Then read and record in the note, for the SDK's latest version on the day: its client options (`apiKey`, `authToken`, `baseURL`, `maxRetries`, `timeout`, `fetch`, its logging option, `defaultHeaders`); the environment variables it reads by default; its error classes, and whether a rejected `fetch`'s error survives as the connection error's `cause`; `messages.create`'s typed `thinking` and `stop_reason` values; `models.retrieve`'s answer for `claude-haiku-5-5` (the ID it returns, and whether the lookup is free by the API's reference); and whether gitleaks's default rules flag an Anthropic key's shape. Check: `git rev-parse HEAD` prints the base's full SHA; each item is recorded; any that differs from plan §2 is a departure recorded in plan.md in the same commit, before any task builds on it (analyze finding A8) (feat/010-anthropic-provider)
- [ ] T002 [P] Vet and pin the SDK by plan D2's eight steps, recording each in the note before the install, then `npm install --save-exact @anthropic-ai/sdk@<version> -w services/gateway --ignore-scripts --cache "$TMPDIR/npm"`. Check: `services/gateway/package.json` holds the exact version with no range; the lockfile holds its integrity and its dependencies'; `npm ls --all @anthropic-ai/sdk -w services/gateway` and `npm audit --omit=dev -w services/gateway` are in the note; `make test` still passes, nothing importing it yet (FR-004) (feat/010-anthropic-provider)
- [ ] T003 [P] Write the ADR, status proposed, at the next free number when this task runs (0041 unless spec 009's T040 has taken it; check `docs/adr/README.md` on the base), as `docs/adr/00NN-the-anthropic-api-as-a-second-paid-adapter.md`, with its row in the index and ADR 0001's row gaining "(one Decision extended by 00NN)": it extends ADR 0001's Decision, item 3, and its "Bedrock model" line; it records D1 to D9, and the spec's Q1 to Q6 with their options, named as the Author's to overturn. Check: `make test`'s docs-links check passes (FR-041) (feat/010-anthropic-provider)
- [ ] T004 [P] Amend spec 000's living interfaces, each new or changed passage marked "(spec 010)": `contracts/provider-adapter.md` §2.5's Anthropic column, a §3.4 for `anthropic-messages`, §4's registered types and its rule's wording (Amendment 0-10), and §5.3's "Live, Anthropic" (0-2); `contracts/config-files.md` §1.1, §1.3 (R12), §1.4, §3.1, and §3.3 (B9) (0-3, 0-4); `data-model.md` §2.3, §2.4, §3, §6.2, §7.2, and §7.3 (0-5); `contracts/gateway-http.md` §3 (0-6); `contracts/alerts.md` §2, §3, and §6 (0-8); `contracts/env-files.md` §4, §8, and §10 (0-9); and spec 002's `contracts/room-conversation.md` §3 (2-1). The telemetry contract changes with its code (T031, T045). Check: `make test`'s docs-links check passes; the reviewer (T051) reads each passage against the FRs it serves (FR-041) (feat/010-anthropic-provider)
- [ ] T005 [P] Write P-A as `docs/merge-requests/<date>-feat-010-pa-anthropic-denies.patch`, from plain copies of `main`'s files in a fresh `git archive` export in a new, empty folder, by plan §8's eight items: the two variables denied in `.claude/settings.json`'s `credentials.envVars` and in `evals/agent-config/static.py`'s FR-007 list; the bash gate's `anthropic` rules beside Bedrock's; the stage H and gap rows in `redteam/forbidden-actions.sh` with their lines in `tools/gates/matrix-required.txt`; the compose policy's rule and its test; `CLAUDE.md`'s routing sentence; and a `.gitleaks.toml` rule only if T001 found the default rules lacking. Check: `patch -p1 --dry-run` applies it cleanly to a second fresh export of `main`; on a patched export, the matrix's new rows pass and the compose policy's test passes; the note lists it first under "For the Author" (FR-024, FR-032, FR-041) (feat/010-anthropic-provider)
- [ ] T006 [P] Write P-B and P-C as `docs/merge-requests/<date>-feat-010-pb-anthropic-price.patch` and `…-pc-anthropic-cap.patch`, against plain copies of `main`'s `config/prices.yaml` and `config/budgets.yaml`: plan §4.1's version, its figures and source line marked "est.", and §4.2's `adapter_monthly_usd: { anthropic: 10.00 }` in both envs, to apply after this branch merges. Check: each applies with `patch -p1 --dry-run` to a fresh export of `main`; copies of the patched files pass `validate-config` on this branch as fixtures (T007, T009) (FR-019, FR-021) (feat/010-anthropic-provider)

**Checkpoint**: the base and the SDK's surface are confirmed, the dependency is pinned, and the interfaces, the ADR, and the Author's patches are written down.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: every refusal and degraded path the Anthropic adapter can meet, the cap's meter, the refusal guard, the temperature setting, and every secret check, before any happy path. No user story starts before this phase passes.

### Tests for Foundational (first)

- [ ] T007 [P] Write `services/gateway/test/unit/anthropic-settings.test.ts` and extend `test/unit/validate-config.test.ts` (FR-005, FR-014, FR-017, FR-019, FR-021): `anthropic-messages` registered and `paid` only (R5); an unknown key, a `base_url`, a `region`, or a second `*_env` refused (R11); `thinking` only `disabled`; `temperature` absent, `as_requested`, or `model_default` on both paid types, anything else refused; R8's sum; an `api_key_env` beginning `ANTHROPIC_` refused (R12); a route naming it outside prod stops the start (`paid_route_outside_prod`); routed with its key unset or empty, `missing_env` naming the key and never the value; routed without a price entry, `price_missing`; routed without a cap, `adapter_cap_missing`; unrouted, none of these. Check: RED before T016 and T017 (feat/010-anthropic-provider)
- [ ] T008 [P] Write `test/contract/anthropic-messages.errors.test.ts`, `test/unit/anthropic-transport.test.ts`, and `test/helpers/stub-anthropic.ts` (plan §2.9's stub) (FR-009, FR-010, FR-031): each status of plan §2.5 maps to its kind, `retryable`, and `possiblyBilled`; a refused connection, each c-ares lookup code, and the connect watchdog are `unavailable` and not billed; a reset after the body was written, the request timeout, and the deadline are `timeout` and possibly billed; a malformed 200, one without content, and one without usage are `provider_error`; each error's message is its kind and its `code` one of §2.5's shapes; no key, prompt, system prompt, or canary appears in the error, `String(err)`, `JSON.stringify(err)`, or any captured log record (check C6); the transport refuses an origin other than its own before opening a socket; lookups go through `aresLookup` (a spy). Check: RED before T017 (feat/010-anthropic-provider)
- [ ] T009 [P] Extend `test/unit/validate-config.test.ts` and `test/integration/migrations.test.ts`, and write `test/integration/adapter-month.test.ts`, on PGlite with the test clock and a stub paid adapter (FR-020 to FR-023, SC-004): `adapter_monthly_usd` at its bounds and one past them (B9), a key naming no paid adapter refused, `envs.dev` still equal to `envs.prod` (B8); `0005_adapter_month.sql` admits `adapter_month` with its key pattern, adds `v_adapter_months` for `grafana_ro`, and leaves earlier migrations byte-identical; a `fallback` and a `test` call each reserve against and commit to the adapter's month as well as the day and month (and the fallback's day for `fallback`); admission refuses at the cap counting reservations with `adapter_month_spent`, after `meter_at_ceiling` and before the sub-budget's causes; the warning crossing queues its keyed alert once; the cap crossing sets the flag (when the adapter is the route's fallback), queues `fallback_exhausted` with its key, and writes the audit row, in the commit's transaction; a renewal clears the flag while the level still refuses; a rollover and a restart keep the flag; initialization rebuilds the month from the journal; the sweep settles an expired reservation on it; local answers go on throughout. Check: RED before T016 (feat/010-anthropic-provider)
- [ ] T010 [P] Write `test/integration/hello-anthropic.test.ts`, its degraded half (FR-011, FR-013, SC-006's automated half): with prod's configuration naming `anthropic` and the local model down, each of `store_unreachable`, `store_uninitialized`, `kill_switch_tripped`, `meter_at_ceiling`, `adapter_month_spent`, `fallback_awaiting_renewal`, `fallback_spent_today`, and `fallback_unavailable` (the check's `credentials`; the circuit open) answers 503 with spec 000's body and header, and the stub counts 0 Messages requests. Check: RED before T016 and T017 (feat/010-anthropic-provider)
- [ ] T011 [P] Extend `test/unit/twin-guards.test.ts`, `test/integration/room-turn.test.ts`, and `test/integration/admin-twin.test.ts` (FR-018, SC-007): a `content_filter` finish, with text or without, is withheld whole as `withheld` under the guard `refusal`, before the trim and the other guards; the call's cost stays counted; `h4.twin.withheld` counts `refusal`; no retry; the admin twin route answers `guard: "refusal"`. Check: RED before T018 (feat/010-anthropic-provider)
- [ ] T012 [P] Write `test/unit/paid-temperature.test.ts` (FR-017): for each paid adapter, `model_default` sends no temperature whatever the request carries, and `as_requested` (or the key absent) sends it as given; the committed `config/routing.yaml` sets `model_default` on `bedrock` and `anthropic`. Check: RED before T019 and T030 (feat/010-anthropic-provider)
- [ ] T013 [P] Extend `test/unit/telemetry.test.ts` (the redaction), `redteam/test_run.py`, and the collector's configuration test, and add the transport's wire case to `test/unit/anthropic-transport.test.ts` (FR-016, FR-031, SC-003): an Anthropic key's shape, built at run time, is masked by `src/telemetry/redact.ts`, by `deploy/otel/collector.yaml`'s §6.3 transform, by guard G5, and by the red-team suite's secret pattern; the stub's recorded requests hold only the transport's allowed headers, the key only in `x-api-key`, and no `traceparent`, `tracestate`, or `baggage`. Check: RED before T017 and T020 (feat/010-anthropic-provider)
- [ ] T014 [P] Extend `deploy/scripts/test_preflight.py` and `test_env_files.py`, and add a compose check (FR-030, FR-040, SC-008): P3 allows `GATEWAY_ANTHROPIC_API_KEY` empty while prod's route names Bedrock, and refuses it empty while it names `anthropic`; P7's shape check of the key; P19's AWS checks only when prod's route names a `bedrock-converse` adapter; `deploy/compose.yaml` names the key on the gateway alone, as `${GATEWAY_ANTHROPIC_API_KEY:-}`; prod's template holds it empty; dev's template and `dev-cpu.vars` don't. Check: RED before T021 (feat/010-anthropic-provider)
- [ ] T015 [P] Extend `apps/web/test/room/tier.test.ts` (or the file `src/room/signals/tier.ts`'s tests live in) and write `services/gateway/test/unit/cause-lists.test.ts` (FR-022, FR-035; Amendment 2-1): `adapter_month_spent` is of the budget class, and a 503 with it shows `cannot_talk.budget`; `DegradedCause`, `h4.degraded.cause`'s one-hot values, `h4.degraded.responses`, and `h4.twin.turns`' causes hold one set, with `adapter_month_spent` in it. Check: RED before T016 and T022 (feat/010-anthropic-provider)

### Implementation for Foundational

- [ ] T016 Write `migrations/0005_adapter_month.sql`; add `adapter_month_spent` to `DegradedCause` (`src/core/types.ts`) and to the router's order and `GET /health`'s dry run (`src/core/router.ts`); add `adapter_monthly_usd`, rule B9, and `adapter_cap_missing` to `src/config/validate.ts`; and the adapter month to `src/meter/admission.ts`, `commit.ts`, `crossings.ts`, `sweep.ts`, `init.ts`, `rollover.ts`, and `store.ts`, with the gauges' snapshot (plan §4.4, §4.5). Check: T009 passes; T007's cap cases and T010's meter cases pass; every existing gateway test still passes (feat/010-anthropic-provider)
- [ ] T017 Write `src/adapters/_anthropic-transport.ts` (plan §2.6) and the adapter's frame in `src/adapters/anthropic-messages.ts`: the type's spec in `_settings.ts`, registered; the factory with the fixed origin and its deps seam; `checkEnv`; the error mapping (plan §2.5); `close`. Check: T008 passes; T007's settings and startup cases pass; T013's wire case passes (feat/010-anthropic-provider)
- [ ] T018 Add the guard `refusal` to `src/twin/guards.ts` (plan §5.1). Check: T011 passes (feat/010-anthropic-provider)
- [ ] T019 Add the `temperature` setting to both paid types in `_settings.ts`, and its use to `bedrock-converse.ts` and the anthropic adapter (plan §5.2). Check: T012's adapter cases pass (feat/010-anthropic-provider)
- [ ] T020 Add the key's shape to `src/telemetry/redact.ts`, `deploy/otel/collector.yaml`, and the red-team suite's secret pattern (guard G5 imports the gateway's patterns). Check: T013 passes (feat/010-anthropic-provider)
- [ ] T021 Change `deploy/scripts/preflight.py`, `deploy/compose.yaml`, and `deploy/env.example/prod.env.example` (plan §3). Check: T014 passes; `make up ENV=dev-cpu` through the relay still starts and hello answers (feat/010-anthropic-provider)
- [ ] T022 Add `adapter_month_spent` to the room's `BUDGET_CAUSES` (`apps/web/src/room/signals/tier.ts`) and to the gateway's metric lists in `src/telemetry/metrics.ts`. Check: T015 passes (feat/010-anthropic-provider)

**Checkpoint**: every refusal and degraded path answers, the cap meters and stops, a refusal is withheld, both paid adapters drop the temperature, and the key can't leak; nothing reaches Anthropic yet.

---

## Phase 3: User Story 1 — The Author Chooses the Anthropic API as Prod's Paid Fallback (Priority: P1) (MVP)

**Goal**: with prod's route naming `anthropic`, a turn the local model can't answer is answered by the Anthropic API, metered, capped, and disclosed; with the route on Bedrock, nothing changes.

**Independent Test**: spec.md User Story 1's.

### Tests for User Story 1 (first)

- [ ] T023 [P] [US1] Write `test/unit/anthropic-request.test.ts` (FR-006, FR-007): the request carries the system message as `system`, the other messages in order, `max_tokens` from the request, and `thinking: {type: "disabled"}`, and no effort, `metadata`, `tools`, `stream`, `stop_sequences`, `service_tier`, `cache_control`, beta header, or (under `model_default`) temperature; `factory.create` builds the client with `https://api.anthropic.com`, `maxRetries: 0`, the settings' timeout, the SDK's logging off, and the key from the adapter's context alone; with `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and the SDK's logging variable set in the test process, the request, its destination, its key, and the captured logs are unchanged. Check: RED before T029 (feat/010-anthropic-provider)
- [ ] T024 [P] [US1] Write `test/contract/anthropic-messages.contract.test.ts`, `describeAdapterContract("anthropic-messages", makeStubbedSubject, "stub")` (FR-008, FR-011, FR-015, SC-002): checks C1 to C12 against the stub; only text blocks become the answer, a thinking block ignored; the usage and its cache counts (plan §2.4); each stop reason's finish reason; the response's model and ID under the printable rule; the retry policy (C5) from the settings; the span key set equal to the local and Bedrock adapters' (C8). Check: RED before T029 (feat/010-anthropic-provider)
- [ ] T025 [P] [US1] Write `test/unit/anthropic-health.test.ts` (FR-012): the check calls the model lookup and never Messages; a 200 for the model, or a dated snapshot of it, is healthy; 401 and 403 are `credentials`; a hung lookup is `timeout` within the shorter of 5 seconds and the interval; any other answer is `unreachable`; it never rejects; the gateway combines it with the circuit. Check: RED before T029 (feat/010-anthropic-provider)
- [ ] T026 [P] [US1] Extend `test/integration/hello-anthropic.test.ts` and write `test/integration/room-turn-anthropic.test.ts` (FR-001 to FR-003, FR-019, FR-020, FR-033, SC-001): on prod's configuration naming `anthropic`, with the local model stopped, hello and a twin turn are answered by the stub with `route: "fallback"`; each ledger row names provider `anthropic`, the model, the tokens, and the cost at a fixture price, and the reply's `cost_micro_usd` equals the rows' sum; the cost counts toward the day, the month, the fallback's day, and the adapter's month; with the local model healthy, 0 stub requests over 100 turns; with the route naming `bedrock`, the adapter isn't built and the stub counts nothing; the admin routes answer 404 `unknown_adapter` for `anthropic` while Bedrock is routed; the adapter connects to the stub's origin alone. Check: RED before T029 and T030 (feat/010-anthropic-provider)
- [ ] T027 [P] [US1] Extend `test/unit/telemetry.test.ts` and write `test/integration/anthropic-telemetry.test.ts` (FR-034, FR-035): the client span's provider, model, server address, and port, and its key set; `h4.adapter.healthy` for `anthropic`; `h4.cost.usd`'s zero series at start for the routed paid adapter; the instrument inventory with plan §9's gauges, cause, and guard; no payload attribute with payload sampling off. Check: RED before T031 (feat/010-anthropic-provider)
- [ ] T028 [P] [US1] Extend `evals/test_disclosure.py` (FR-038, FR-039, SC-010; plan §10): the sections' list gains "Spec 010: the Anthropic API"; a `spec_010_entry` reads this spec's entries, and F3's cells equal the entry's; S2 names F3; D1 keeps "never" and names F3, its test comment changed with it; V2's **Why** holds the entry's added sentence, and `test_the_twins_turn_has_row_v2_in_spec_007s_words`, which holds V2's cells to spec 007's entry, reads its **Why** as spec 007's words followed by this spec's sentence, the other cells unchanged; F3's host is the adapter's constant, read from its module; the placeholder gate fails a fixture `routing.yaml` naming `anthropic` as prod's fallback while F3 holds `<the Author's words`, and passes the same fixture once words replace it. Check: RED before T032 (feat/010-anthropic-provider)

### Implementation for User Story 1

- [ ] T029 [US1] Complete `src/adapters/anthropic-messages.ts`: the request, the response and usage, the options, and the health check (plan §2.3, §2.4, §2.7). Check: T023, T024, and T025 pass; the adapter's own overhead stays under 5 ms a call in the unit benchmark (feat/010-anthropic-provider)
- [ ] T030 [US1] Add `adapters.anthropic` to `config/routing.yaml` and `temperature: model_default` to `bedrock`, keeping `envs.prod.fallback: bedrock` (plan §3), with the header comment's new step. Check: T026 and T012 pass; `validate-config` passes on the committed files (feat/010-anthropic-provider)
- [ ] T031 [US1] Add the span values and the instruments in `src/telemetry/metrics.ts`, and amend `specs/000-local-foundations/contracts/telemetry.md` §3.3 and §4.1 in the same commit ("A name changes here first, in the same commit as the code"; Amendment 0-7). Check: T027 passes (feat/010-anthropic-provider)
- [ ] T032 [US1] Add "## Spec 010: the Anthropic API" with its lead and row F3, and change S2, D1, and V2, in `docs/data-flow-disclosure.md`, in the spec's words (plan §10). Check: T028 passes; the room's disclosure page builds with the new table (feat/010-anthropic-provider)
- [ ] T033 [US1] Document the adapter in `services/gateway/README.md`: its settings, the key's name and place, the cap, how the Author chooses the fallback, and the order of his patches. Check: `make test`'s docs checks pass (feat/010-anthropic-provider)

**Checkpoint**: the Anthropic API serves prod's fallback when the route names it, metered and disclosed; with the route on Bedrock, the adapter isn't built.

---

## Phase 4: User Story 2 — The Live Runs on the Paid Adapter Prod's Route Names, and Readiness That Counts Only Complete Runs (Priority: P1)

**Goal**: the Author's live runs take `ADAPTER=anthropic`, and readiness asks for complete evidence on the adapters the route would use.

**Independent Test**: spec.md User Story 2's.

### Tests for User Story 2 (first)

- [ ] T034 [P] [US2] Extend `scripts/test_makefile.py` and `scripts/test_contract_live.py` (FR-024): `make evals ADAPTER=anthropic` and `make redteam-live ADAPTER=anthropic ENV=prod` reach their runners as typed outside the sandbox and are refused inside it; `make redteam-live` and `make contract-live` refuse a paid adapter with any `ENV` but prod; `make evals ADAPTER=anthropic` sends its cases to prod whatever `ENV` says; any other `ADAPTER` is refused with a message naming the adapters the target takes. Check: RED before T037 (feat/010-anthropic-provider)
- [ ] T035 [P] [US2] Extend `evals/test_run.py`, `redteam/test_run.py`, `scripts/test_operator.py`, and `scripts/test_operator_record.py` (FR-025): `--adapter anthropic` sends each twin case through prod's admin twin route and each hello case through the admin adapter route, by the ID; the history file is `<UTC>-anthropic.json`, its record's `adapter` the ID and each result's `provider` `anthropic`; a paid adapter on any stack but prod is refused by `contract-record`. Check: RED before T038 (feat/010-anthropic-provider)
- [ ] T036 [P] [US2] Extend `evals/test_twin_readiness.py` with SC-005's matrix, built in a temporary tree (a small pack, its committed cases, histories, and a `routing.yaml`; hashes computed) (FR-026 to FR-028, SC-005): the route naming `bedrock` needs Bedrock runs, naming `anthropic` needs Anthropic runs, naming no fallback needs local runs only; a product run holding none of the topic's cases, only one path's, or missing a gap case reads "evidence missing" with the topic, the path, and the counts; a red-team run missing a live case reads "evidence missing"; a run whose record's `adapter` isn't the needed one doesn't count; a complete, passing set reads ready; the script exits 0 in every row. Check: RED before T039 (feat/010-anthropic-provider)

### Implementation for User Story 2

- [ ] T037 [US2] Change the `Makefile`'s `evals`, `redteam-live`, and `contract-live` targets and their help lines (plan §6). Check: T034 passes (feat/010-anthropic-provider)
- [ ] T038 [US2] Change `evals/run.py`, `redteam/run.py`, and `scripts/operator.py` (plan §6). Check: T035 passes; `make evals` on the fake adapter passes unchanged; the note lists `scripts/operator.py` and `evals/run.py` first under what runs in the Author's terminal (ADR 0017) (feat/010-anthropic-provider)
- [ ] T039 [US2] Change `evals/twin_readiness.py` by plan §7's six rules, its docstring naming the amended rule. Check: T036 passes; `make evals` prints the report's lines and its exit status is unchanged by them (feat/010-anthropic-provider)
- [ ] T040 [US2] Document the live runs on either paid adapter and the evidence rule where the live runs are documented (spec 007's places: the gateway's README and the evals' documentation). Check: `make test`'s docs checks pass (feat/010-anthropic-provider)

**Checkpoint**: the Author can run every live run on the Anthropic API once his route names it, and readiness counts only complete runs on the adapters the route would use.

---

## Phase 5: User Story 3 — The Anthropic Adapter's Month Stays Inside Its Cap and the Ceilings (Priority: P2)

**Goal**: the cap's state is visible on the dashboard, its alerts say what happened, and the runbooks say what to do.

**Independent Test**: spec.md User Story 3's; the meter's behaviour itself is Phase 2's (T009, T016).

### Tests for User Story 3 (first)

- [ ] T041 [P] [US3] Extend `test/unit/alerts-format.test.ts` (or the formatter's existing test file) (FR-037): the adapter month's warning and exhaustion render with plan §4.4's keys and texts naming "the Anthropic API's month", its spend, and its cap; `fallback_unavailable` for the adapter names "the Anthropic API"; the canary test still finds no payload, client label, reason text, or key in any rendering. Check: RED before T044 (feat/010-anthropic-provider)
- [ ] T042 [P] [US3] Extend `test/unit/telemetry.test.ts` and `deploy/scripts/test_dashboard.py` (FR-035, FR-036): the three adapter-month gauges report each capped, routed adapter's spend, cap, and warning from the snapshot; the dashboard holds plan §9's two panels with their queries, the cap's beside "Spend month-to-date" and the table beside "Store state", the table's SQL on `gateway.v_adapter_months` as `grafana_ro`. Check: RED before T045 (feat/010-anthropic-provider)
- [ ] T043 [P] [US3] Extend the runbooks' check (`evals/test_repository_docs.py`, or wherever contracts/alerts.md §6's map is held to the files) (FR-037): every alert key form, the adapter month's two among them, maps to a runbook that exists. Check: RED before T044 (feat/010-anthropic-provider)

### Implementation for User Story 3

- [ ] T044 [US3] Add the texts to `src/alerts/format.ts`; write `docs/runbooks/anthropic-unavailable.md`; add the adapter month to `docs/runbooks/fallback-renewal.md`; add both to `docs/runbooks/README.md` and contracts/alerts.md §6 (plan §9). Check: T041 and T043 pass (feat/010-anthropic-provider)
- [ ] T045 [US3] Add the gauges to `src/telemetry/metrics.ts`, the panels to `deploy/grafana/dashboards/h4-runtime.json`, and amend contracts/telemetry.md §4.1, §7.1, and §7.2 in the same commit. Check: T042 passes (feat/010-anthropic-provider)

**Checkpoint**: the cap is on the dashboard beside the month's spend, and its alerts lead to their runbooks.

---

## Phase 6: User Story 4 — When the Paid Fallback Can't Answer, the Room Says Why and Keeps Working (Priority: P3)

**Goal**: the end-to-end proof of the degraded mode Phase 2 built.

**Independent Test**: spec.md User Story 4's.

- [ ] T046 [P] [US4] Write `test/integration/anthropic-degraded.test.ts` (FR-011, SC-006): on prod's configuration naming `anthropic`, with the local model down, each row of the spec's Degraded-Mode Behavior table: 529, 502, and 503 `unavailable`; an unreachable host; 429 retried once when the deadline allows, then degraded; the request timeout charged its reserved maximum; `refusal` withheld; `max_tokens` trimmed or withheld; each with its cause or line, and the stub's request count as the row says. Check: passes, or RED naming the row T048 fixes (feat/010-anthropic-provider)
- [ ] T047 [P] [US4] Extend `apps/web/test/ui/talk-turns.test.ts` (User Story 4): a 503 with `adapter_month_spent` shows `cannot_talk.budget` with the resume and the PDF, the words back in an empty box; a fallback answer still shows the sign's "est." and the laptop's cloud pose. Check: passes, or RED naming what T048 fixes (feat/010-anthropic-provider)
- [ ] T048 [US4] Close what T046 and T047 show. Check: both pass; any change is recorded in plan.md (feat/010-anthropic-provider)

**Checkpoint**: every degraded condition is proven end to end.

---

## Phase 7: Polish, the Merge, and the Author's Runs

- [ ] T049 [P] Bring the ADR (T003) in line with what was built, and record every departure from plan.md in plan.md, in the commit that made it, under a "Departures while building" section. Check: the reviewer finds no departure unrecorded (feat/010-anthropic-provider)
- [ ] T050 [P] Re-read spec 000's "(spec 010)" passages (T004) against the code as built, and fix any that drifted. Check: the reviewer's compliance pass finds none (feat/010-anthropic-provider)
- [ ] T051 Review `feat/010-anthropic-provider` with the reviewer agent (`.claude/agents/reviewer.md`) in a session that wrote none of it: every pass `REVIEW.md` holds, over the branch's diff from its base (the cherry-picked documents apart), each finding tagged with its pass and severity, the dependency's vetting record and the adapter's wire tests read with the security pass; the implementing session fixes blockers test-first, and the reviewer re-reads each fix. Check: the verdict, for T052's note (feat/010-anthropic-provider)
- [ ] T052 Write `docs/merge-requests/<date>-feat-010-anthropic-provider.md`: what changed and why; the acceptance criteria; the constitution check; the cost and data-flow impact (F3, S2, D1, V2); the RED and GREEN runs of Phases 2 to 6; the dependency's vetting (D2) and the image's size before and after; the review; the backlog; For the Author, in plan §13's order, P-A first, each command a short line (at most 70 characters, variables and a separate guard), with the runs a switch of the fallback needs (FR-029); `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s from a fresh export of the tip; and a rehearsal of the merge into `main`'s current tip. Check: the note is committed on the branch (feat/010-anthropic-provider)
- [ ] T053 If group B merged while the branch was built, first record in the note the branch's tip as `feat/010-anthropic-provider was <sha>`, then rebase onto `main` (`git rebase --onto refs/heads/main <base> feat/010-anthropic-provider`), re-run `make check ENGINE_MODE=none-yet`, and append its whole output. Check: every gate passes on the rebased tip (feat/010-anthropic-provider)
- [ ] T054 Author: apply P-A (T005) on `main` by its note's steps, before this branch merges, with the behavioral-tier run `main`'s rule then asks of a change to `.claude/` and `CLAUDE.md`. Check: the matrix's new rows pass; an agent session's `make evals ADAPTER=anthropic` is refused by the bash gate; `make matrix-canary` passes with both variables in its list (main)
- [ ] T055 Author: gate `feat/010-anthropic-provider` from main's checkout (`tools/gates/gate feat/010-anthropic-provider`) and merge it with the command the gate prints, after group B. Check: `refs/heads/main` holds the branch's tip; after T056, prod starts with its route on Bedrock and the anthropic adapter unbuilt (main)
- [ ] T056 Author: `make init-env ENV=prod SYNC=1`, before his next `make up ENV=prod`, which appends `GATEWAY_ANTHROPIC_API_KEY` empty to prod's env file. Check: `make up ENV=prod` passes preflight with the route on Bedrock (the Author's terminal)
- [ ] T057 Author: apply P-C (T006) with his cap, and P-B with the figures he confirms on Anthropic's pricing page and the day he read them in its source line, as his commits on `main`; accept the ADR or leave it proposed. Check: `validate-config` passes; prod starts (main)
- [ ] T058 Author: spec 007's T075 and T077, the live runs on Bedrock, whenever he chooses: the temperature setting they rely on is on `main` since `fix/007-paid-temperature` (plan §5.2, R-1), so they don't wait for this merge. Check: no twin call refused for its temperature; their histories committed, by spec 007's tasks (main)
- [ ] T059 Author, if he chooses the Anthropic API: read Anthropic's published commercial terms and write his words in F3 in place of the placeholder, weighing them against intent 000's "Nothing is retained beyond the session without explicit consent" and the corpus's "their conversation is not saved" (analyze finding A3); put the key in prod's env file, in an editor; commit `fallback: anthropic` in `envs.prod`; `make up ENV=prod`. Check: `make test` passes on that commit, F3 holding his words; preflight passes; `/health` shows `anthropic` healthy (main)
- [ ] T060 Author: `make contract-live ENV=prod ADAPTER=anthropic REASON="…"`. Check: the replay passes in the gate's container phase; the run's cost recorded in a follow-up note (the Author's terminal)
- [ ] T061 Author: once spec 007's P-2 is on `main`, `make evals ADAPTER=anthropic` and `make redteam-live ADAPTER=anthropic ENV=prod`, committing their histories. Check: SC-009: the thresholds met at the running hashes, the red-team run clean, the measured cost per turn recorded beside the spec's estimate, any timeout recorded against R-2 (main)
- [ ] T062 Author: re-mark readiness in `config/twin-readiness.yaml` with the Anthropic runs as each topic's paid evidence, committing the histories beside it (spec 007's FR-031, as Amendment 7-2 amends it). Check: `make evals`'s report shows no line for a topic he marked (main)
- [ ] T063 Author: a wrong key on prod for one check (a copy of the key with one character changed): `/health` shows `anthropic` with `credentials`; a turn with the local model stopped shows `cannot_talk.resting`; the `fallback_unavailable` alert arrives naming the Anthropic API; then the real key back and `make up ENV=prod`. And his read of the Anthropic console's usage for his runs beside the meter's figures. Check: both recorded in a follow-up note (the Author's terminal)

---

## Dependencies & Execution Order

### Phase dependencies

- **T000** gates everything.
- **Setup (Phase 1)**: T001 first; T002 to T006 in parallel after it.
- **Foundational (Phase 2)**: after Setup; its tests T007 to T015 in parallel, each RED before its implementation; T016 and T017 before T018 to T022 where those touch the same modules (T019 after T017; T022 after T016).
- **User Story 1 (Phase 3)**: after Foundational; tests T023 to T028 in parallel; T029 before T030 (the routing entry needs the complete adapter); T031 and T032 in parallel with T029.
- **User Story 2 (Phase 4)**: after Foundational; independent of User Story 1's code, since the runners' tests use a fake admin client and the readiness tests a temporary tree.
- **User Story 3 (Phase 5)**: after Foundational (its meter is T016); independent of Phases 3 and 4.
- **User Story 4 (Phase 6)**: after Phases 2 and 3.
- **Polish (Phase 7)**: T049 to T053 after every story; T054 before T055; T056 after T055 and before the Author's next prod start; T057 after T055; T058 any time (the setting it relies on is on `main`); T059 after T056 and T057; T060 and T061 after T059; T062 after T061; T063 after T059.

### Within each phase

- Tests first, RED for the stated reason, then the implementation that turns them GREEN.
- A file two tasks of one phase touch belongs to the earlier task, and the later one waits for it.
- Commit after each task or logical group, before any pause.

## Parallel Examples

```text
Phase 1, after T001:   T002 (the SDK) | T003 (the ADR) | T004 (spec 000's contracts) | T005 (P-A) | T006 (P-B, P-C)
Phase 2, the tests:    T007 | T008 | T009 | T010 | T011 | T012 | T013 | T014 | T015
Phase 3, the tests:    T023 | T024 | T025 | T026 | T027 | T028
Phases 4 and 5:        T034 to T040 in one worktree | T041 to T045 in another, after Phase 2
```

## Implementation Strategy

### MVP first (Phases 1 to 3)

1. Setup, then the foundation: every degraded path and secret check before the happy path (Principle I).
2. User Story 1: the adapter answers when routed. **Stop and validate**: SC-001, SC-002, SC-003 on the test stack; the route still names Bedrock.

### Incremental delivery

1. User Story 2, which the Author's live runs and readiness marks need.
2. User Story 3's dashboard and runbooks.
3. User Story 4's end-to-end proof.
4. Polish, the review, the note, and the merge; then the Author's patches and, if he chooses, the switch and his runs.

### If the night ends early

Commit, and write the note for the phases done; the next phases continue on `feat/010-anthropic-provider-2` from the tip, merging after it (the stacked-branch pattern of the earlier specs).

## Notes

- Nothing on this branch makes a call to Anthropic: every test runs against the in-process stub, in the sandbox, with no key; only the Author's T059 to T063 reach the API.
- The adapter is dormant on merge: prod's route names Bedrock, so it isn't built.
- Each departure from plan.md updates plan.md in the same commit.
- Agents never edit a test file during a fix task; they fix the code.
