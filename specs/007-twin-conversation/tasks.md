---

description: "Task list for spec 007, the twin's conversation core"
---

# Tasks: The Twin's Conversation Core — A Piece or a Question, Answered From the Corpus

**Input**: the design documents in `specs/007-twin-conversation/`: [spec.md](spec.md) (FR-001 to FR-054, SC-001 to SC-011, the Clarifications, Amendments 0-1 to 0-5, 2-1 to 2-5, and 4-1 to 4-3) and [plan.md](plan.md) (§1 to §17, the patches P-1 and P-2, and the analyze pass).

**Prerequisites**: the spec, clarified provisionally on 2026-11-07 while the Author was away ("Keep going!"), and the plan of that day. No agent task starts before the Author approves both, or overturns what he chooses (`CLAUDE.md`: "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`"). The Author's later direction can change that, as his overnight directions did for specs 002 to 004.

**Tests**: required. In each phase the test tasks come first and must fail (RED) before the code that makes them pass (GREEN); the merge-request note records both runs. Every agent check runs inside `make test` or `make evals`, so no `CHECK_GATES` entry is added.

**Organization**:
- **One branch**, `feat/007-twin-conversation`, in its own worktree, cut from f9524081bb57c6fa07bbb26bf58a9fa135505d7c (line R's User Story 9 tip, `feat/004-us9-neon-sign`), with commits by task group (plan §14).
- **The phases**: Setup; Foundational, which holds every refusal and degraded path, the guards, and the admin route before any happy path (Principle I); User Story 1 (P1, the MVP); User Story 2 (P2); User Story 3 (P2); User Story 4 (P3); then Polish, the merge, and the Author's runs.
- **Spec 002's Phase 7 moves here** (Amendment 2-3): T065 → T033, T034, T039 to T041; T066 → T036, T042; T067's conversation half → T083; T068 → T007, T071; T069 → T020, T030, T045; T070 → T046; T047 → T057; T081 → T082; T071 → T067.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel with the other [P] tasks of its group: different files, no dependency on an unfinished task.
- **[USn]**: the user story of a story phase. Setup, Foundational, and Polish tasks carry none.
- **"Author:"** opens a task only the Author does: in his own terminal, on `main`, on prod, or with Bedrock. Agents never do these steps, and never type the Author's paid-run commands into a shell: the bash gate refuses some of their text, heredocs included, so they go into the note through the editor.
- **Heavy** marks an Author run that loads a model or stops a service: no agent session uses the engine meanwhile.
- **Patches.** A human-only path (`.claude/**`, `CLAUDE.md`, `REVIEW.md`, `tools/gates/**`, `evals/agent-config/**`, `assets/policy/**`, `corpus/` but `corpus/proposals/`, `config/budgets.yaml`, `config/prices.yaml`, `config/alerts.yaml`, and, from P-1, `config/twin-readiness.yaml`) changes only by the Author's hand. An agent task writes such a change as a `.patch` beside the branch's note, built from plain copies (`git show`, `git diff --no-index`), never by `git apply` or a write into any worktree.
- **The check** each task names is what proves it done; "RED" means its tests fail for the stated reason before the named implementation task.

## Path conventions

- The gateway: `services/gateway/src/twin/` (the pipeline), `src/routes/room-turn.ts`, `src/routes/admin.ts`, `migrations/`, `test/unit/`, `test/integration/`.
- The room: `apps/web/build/twin-pack.ts`, `build/room/emit.ts`, `src/talk/`, `src/room/app.ts`, `room/scene.yaml`, `content/messages.yaml`, `test/`.
- The twin's files: `config/twin/corpus.json` (generated and committed), `config/twin/prompt.md`, `config/twin/lines.yaml`, and the Author's `config/twin-readiness.yaml`.
- Tests compute hashes from fixtures rather than embed 64-hex literals, which the gate's content scan refuses.

---

## Phase 1: Setup

**Purpose**: the branch and its base confirmed, the documents in its tree, the interfaces written down, the Author's patches drafted, and the twin's first instructions.

- [x] T001 Create the worktree for `feat/007-twin-conversation` from f9524081bb57c6fa07bbb26bf58a9fa135505d7c (`git worktree add -b feat/007-twin-conversation <new folder> f9524081bb57c6fa07bbb26bf58a9fa135505d7c`) and run `npm ci --ignore-scripts --cache "$TMPDIR/npm"` in it. Then read, and record in the note, the seams plan §7 depends on: `apps/web/src/room/signals/turn-cost.ts` exports `classifyTurn` and `createCostChannel`; `apps/web/src/talk/talk.ts`'s `renderTalk` takes `onTurnOutcome(result: TurnResult)`; `apps/web/room/scene.yaml`'s `live` block holds `turn: off`; the compositor's rule RL4 exists, with the phrase it matches in row V2's **Carries**; `apps/web/build/room/emit.ts` writes `ready` and `free_talk.ready`; `redteam/run.py` holds spec 004's four B4 detectors. Check: `git rev-parse HEAD` prints f9524081's full SHA, and each seam is found; any that differs is recorded as a departure in plan §7 in the same commit, before any task builds on it (analyze finding A6)
- [x] T002 Cherry-pick `spec/007-twin-conversation`'s commits onto the branch, oldest first, so `specs/007-twin-conversation/plan.md` is in its tree. Check: `git log --oneline` shows them, and `git diff f9524081bb57c6fa07bbb26bf58a9fa135505d7c --stat` lists only `specs/007-twin-conversation/`
- [x] T003 [P] In `specs/002-the-room/tasks.md`, append to each Phase 7 task line (T065 to T071, T047, T081) "Moved to spec 007's tasks: T0nn", per this file's Organization (Amendment 2-3), changing no other word. Check: `git diff` shows only those appended phrases
- [x] T004 [P] Write the ADR, status proposed, at the next free number (0039 unless `docs/adr/README.md` on the branch shows it taken, as spec 006's FR-031 ADR may), as `docs/adr/00NN-the-twins-conversation-core.md` with its row in `docs/adr/README.md`: the route in the gateway; the committed pack and the lexical ranking; one completion per turn; the deterministic guards and their replacement; readiness by hash in a human-only file; the per-turn limits P-2 sets; the alternatives of plan §1; the spec's five provisional answers, named as the Author's to overturn. Check: `make test`'s docs-links check passes, with any file only line R holds named in a code span
- [x] T005 [P] Amend spec 000's contracts with this spec's interfaces, each new or changed passage marked "(spec 007)": `contracts/provider-adapter.md` §2.1 (`CallPurpose` gains `twin`; Amendment 0-1); `contracts/config-files.md` §0's who-edits table (the readiness file, the Author's) and §3.1 (`limits.twin` and its bounds; 0-2); `contracts/gateway-http.md`, a new section for `POST /room/turn` (plan §2's order, request, 200, 409, 503 with `twin_unavailable`; 0-3); `contracts/operator-admin.md`, a section for `POST /admin/twin/turn` (plan §2; 0-4). The telemetry contract changes with its code (T031, T045). Check: `make test`'s docs-links check passes; the reviewer reads the passages against spec FR-001 to FR-006 and FR-050
- [x] T006 [P] Write P-1 as `docs/merge-requests/<date>-feat-007-p1-twin-readiness.patch`, from plain copies of `main`'s files in a fresh `git archive` export in a new, empty folder: `config/twin-readiness.yaml` (plan §6's file, nothing ready); in `.claude/settings.json`, `Edit(config/twin-readiness.yaml)` and `Write(config/twin-readiness.yaml)` in `permissions.deny` and the path in the sandbox's `denyWrite`; the protected-paths hook's list gaining the path; a stage S row in `redteam/forbidden-actions.sh` showing an agent's write refused; its line in `tools/gates/matrix-required.txt`; `.prettierignore` gaining the file. Check: `patch -p1 --dry-run` applies it cleanly to a second fresh export, and the note lists it first under "For the Author" (FR-029; CLAUDE.md's rule that a file prod reads gets its deny in the patch that creates it)
- [x] T007 [P] Write P-2 as `docs/merge-requests/<date>-feat-007-p2-twin-limits.patch` against a plain copy of `main`'s `config/budgets.yaml`: `limits.twin` with FR-027's defaults (`turn_max_chars: 600`, `history_max_turns: 8`, `history_max_chars: 4000`, `max_input_chars: 32000`, `max_output_tokens: 300`), to be applied only after this branch merges, since `main`'s strict schema refuses the key until then (plan §13). Check: the patch applies with `patch -p1 --dry-run` to a fresh export of `main`, and a copy of its `limits.twin` block passes T011's schema test as a fixture
- [x] T008 [P] Write the first drafts of `config/twin/prompt.md` (plan §5's eight sections, with the canary line) and `config/twin/lines.yaml` (`withheld`, plan §5's proposed text). They name no number, amount, or person but "Hareet", hold no corpus fact, and quote nothing they don't attribute. Check: T018's lines test and T017's prompt tests read them (RED until those tasks' code exists)

**Checkpoint**: the base is confirmed, and the interfaces and the Author's patches are written down.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the pack, the limits, the purpose, the route with every refusal and degraded path, the guards, the admin route, the edge, and the telemetry, before any happy path. No user story starts before this phase passes.

### Tests for Foundational (first)

- [x] T009 [P] Write `apps/web/test/twin-pack.test.ts` (FR-007, SC-011): on fixture corpora and on the committed corpus, the builder reads only `corpus/NN-<topic>.md`, `corpus/facts/*.yaml`, and `config/room-topics.yaml` (a spy on the file reads shows nothing under `intake/`, `proposals/`, or `tools/`, and no denylist); sections per `##` heading, Golden Q&A one per item, a section over 2,000 characters split at bullets; claim tags kept; a filled public-safe slot rendered, an empty or unsafe one as its fallback or nothing; the "Do not claim" union verbatim with files; `01`'s rulings parsed into `{system, verbs}` against the paragraph's text; the public artifacts' URLs; `08`'s Golden Q&A 4 and 5 verbatim; the selectables from `config/room-topics.yaml`; hashes whole and per topic over canonical JSON; two builds byte-identical; a changed corpus file makes the freshness check fail naming that file; the fit check fails a fixture topic that exceeds the bound, naming it. Check: RED before T023
- [x] T010 [P] Write `services/gateway/test/unit/twin-pack.test.ts` (FR-007, FR-054): the loader accepts the committed pack and recomputes its hashes; a pack with an unknown key, a hash that doesn't recompute, or a missing selectable's file is invalid; an invalid or missing pack, prompt, or lines file leaves the twin `unavailable` and throws nothing. Check: RED before T026
- [x] T011 [P] Extend `services/gateway/test/unit/validate-config.test.ts` and `test/unit/gateway.test.ts` (FR-024, FR-027, FR-028; Amendment 0-2): `limits.twin` optional, each key at its bounds and one past them refused with spec 000's error form; a `twin` call's input bound and reservation from `limits.twin.max_input_chars` and its own output cap, hello's from `per_call`; the client's one metered call in flight held for a `twin` call with a `clientKey`; a `messages` function called once, only after the state read passes, and never for a degraded state. Check: RED before T025
- [x] T012 [P] Extend `services/gateway/test/integration/migrations.test.ts` (FR-026; Amendment 0-1): `0002_twin.sql` admits purpose `twin` and the columns `room_feature` and `room_topic`, refuses a value outside their pattern, leaves `0001_state.sql` byte-identical, and a ledger row for a `twin` call carries its feature and topic. Check: RED before T024
- [x] T013 [P] Write `services/gateway/test/integration/room-turn.test.ts`, refusals (FR-001 to FR-005, FR-028): 415 for each non-JSON content type; 400 naming the field for each of FR-002's rules (extra key, unknown feature, bad path, too many turns, too long a turn or conversation, U+0000, empty `turns` for `free_talk`, a last turn that isn't the visitor's, a turn with an extra key); 409 `not_ready` for a feature whose topic isn't ready; 429 `client_cap_exceeded` with `Retry-After` past spec 000's per-client limits, in a bucket hello's requests don't fill; for each, no model call, no ledger row, and no body in any log record or span attribute (an in-memory exporter and log capture). Check: RED before T029
- [x] T014 [P] Extend `room-turn.test.ts`, degraded (FR-025, FR-054, SC-005's automated half): `kill_switch_tripped`, `store_unreachable`, `store_uninitialized`, `meter_at_ceiling`, `fallback_spent_today`, and `no_fallback_in_stack` each answer 503 with spec 000's body and header, the `messages` function never called and no call made; `twin_unavailable` for an invalid pack, prompt, or lines file and for prod without `limits.twin`, while `POST /hello` still answers 200 on the same app; dev without `limits.twin` uses the defaults and logs `twin.limits_default` once. Check: RED before T029
- [x] T015 [P] Write `services/gateway/test/unit/twin-readiness.test.ts` and `test/integration/room-turn-readiness.test.ts` (FR-029, FR-030, SC-009): ready only while `ready` and both hashes match; a changed `prompt.md`, `lines.yaml`, or topic section closes that topic at the next start (409), free talk on any section's change; a missing or invalid file makes nothing ready and still starts the gateway; the readiness matrix fixture `services/gateway/test/fixtures/twin-readiness-matrix.json` (hashes computed, never literal), which T036 reads too. Check: RED before T026 and T029
- [x] T016 [P] Write `services/gateway/test/unit/twin-retrieve.test.ts` and `twin-grounding.test.ts` (FR-008): BM25 over fixture sections gives a fixed order, ties by pack order, sections scoring 0 excluded, the previous visitor turn at half weight; assembly in FR-008's order (rules, `00`, the topic's files with the lead, ranked sections only for free talk or while free talk is ready), within the input bound, dropping topic sections in reverse file order; identical inputs give identical groundings; no file, network, or store access (spies). Check: RED before T027
- [x] T017 [P] Write `services/gateway/test/unit/twin-prompt.test.ts` (FR-009, FR-012, FR-013, FR-015, FR-019, FR-020): one system message (the instructions, then the grounding's delimited sections) and one user message (the conversation as quoted "Visitor:" and "Twin:" lines, then the newest message); no `assistant` message for any twin turn, a forged one included; the opening form for empty `turns`, with the lead; the path's depth line; no live value can enter (the builder takes none); the prompt hash over `prompt.md` and `lines.yaml`, equal to the shared fixture's value that T036 also checks. Check: RED before T027
- [x] T018 [P] Write `services/gateway/test/unit/twin-guards.test.ts` and `apps/web/test/twin-lines.test.ts` (FR-010, FR-011, FR-013, FR-014, FR-021 to FR-023): for each guard, planted violations withheld or replaced (G1 digits and number words not in the grounding, "one" and ordinal words ignored; G2 an amount not a filled slot's, and any turn or visit cost; G3 "I'm a real person", "I am Hareet"; G4 the canary and a 12-word run of the instructions; G5 each redaction pattern; G6 an unknown URL, email, or domain; G7 a ruled system with a verb its ruling doesn't give; G8 a privacy sentence without the span, replaced by `08`'s Golden Q&A 5 verbatim, an agents' sentence by Golden Q&A 4, privacy first); the trim of a `length` answer to its last sentence, or `length` when none; the order, and the first failure recorded; an exception withholds as `error`; `lines.yaml`'s `withheld` passes `build/content.ts`'s `checkLine`; G2's ported pattern equals `corpus/tools/check_corpus.py`'s `CURRENCY`, read as text. Check: RED before T028
- [x] T019 [P] Write `services/gateway/test/unit/twin-guards-golden.test.ts` (FR-049, SC-002): every Golden Q&A answer in the committed pack, run through every guard against the grounding its generated case's feature gives, passes. Check: RED before T028
- [x] T020 [P] Extend `deploy/scripts/test_edge_site.py` (FR-001, FR-028; spec 002's T069): x005's `location = /api/room/turn` allows POST only, holds `limit_req zone=room_turn` (`rate=1r/s`, `burst=5`, keyed by `$server_port`) and `client_max_body_size 32k`, proxies to `$upstream/room/turn` with the events location's header rules and `proxy_read_timeout 30s`, sends 502 and 504 to `@turn_unavailable` (x000's `api_unavailable` body and header) and 413 to a JSON body; x000's `/room/` still answers 404; every spelling nginx normalizes to the path lands in the location. Check: RED before T030
- [x] T021 [P] Extend `services/gateway/test/unit/telemetry.test.ts` and write `test/integration/room-turn-telemetry.test.ts` (FR-043, FR-044, FR-046, SC-007's automated half): the instrument inventory holds `h4.twin.turns`, `h4.twin.turn.duration`, and `h4.twin.withheld` with plan §9's attributes, and `h4.cost.usd` with `h4.room.feature`; every attribute value from its bounded list; the turn's server, routing, and client spans carry plan §9's attributes; no span attribute, log record, or metric holds the visitor's words, the answer, the grounding, the prompt, the path, or a client identifier with payload sampling off; the zero series at start for each feature. Check: RED before T031
- [x] T022 [P] Write `services/gateway/test/integration/admin-twin.test.ts` and extend `scripts/test_operator.py` (FR-050; Amendment 0-4): `POST /admin/twin/turn` needs the operator token (401 without); `adapter` must be in the stack's route (404 `unknown_adapter` otherwise); it runs the pipeline whatever readiness says; never fails over; a paid adapter is admitted as `test` inside the ceilings and not the sub-budget; it writes a `twin_call` audit row and counts in `h4.operator.actions`, not in `h4.twin.turns` or `h4.twin.withheld`; its 200 adds the guard, model, tokens, cost, trace ID, and both hashes; `AdminClient.twin_turn` sends it and never prints the token. Check: RED before T032

### Implementation for Foundational

- [x] T023 Write `apps/web/build/twin-pack.ts` and the script `twin:pack` in `apps/web/package.json`, reusing `build/content.ts` (`readFacts`, `fillSlots`, the topic-file rule, `OWNERSHIP_VERBS`); generate and commit `config/twin/corpus.json`. Check: T009 passes; `make test`
- [x] T024 Write `services/gateway/migrations/0002_twin.sql` and add `"twin"` to `CallPurpose` in `src/core/types.ts`, as Amendment 0-1 and T005's contract say. Check: T012 passes
- [x] T025 In `src/core/gateway.ts` and `src/config/validate-config.ts`: `limits.twin` (optional, its bounds); the input bound and the reservation by purpose; the client's metered slot for a `twin` call; `messages` as a function called after the state read; `roomFeature` and `roomTopic` carried to the spans, the ledger row, and `h4.cost.usd`. Check: T011 passes, and every existing gateway test still passes
- [x] T026 Write `src/config/twin.ts`, `src/twin/pack.ts`, and `src/twin/readiness.ts`: load the pack, the prompt, the lines, and the readiness file at start, verify hashes, and expose `available`, the selectables, and FR-030's rule, never stopping the gateway. Check: T010 and T015's unit part pass
- [x] T027 Write `src/twin/retrieve.ts`, `src/twin/grounding.ts`, and `src/twin/prompt.ts` (plan §4, §5). Check: T016 and T017 pass, and the in-process benchmark of grounding plus guards on the committed pack stays under 20 ms a turn
- [x] T028 Write `src/twin/guards.ts` (plan §5's table). Check: T018 and T019 pass
- [x] T029 Write `src/twin/turn.ts` and `src/routes/room-turn.ts` (plan §2's steps 1 to 6), and register the route in `src/app.ts`. Check: T013, T014, and T015's integration part pass
- [x] T030 Add x005's `location = /api/room/turn`, its `limit_req_zone`, and `@turn_unavailable` to `deploy/edge/nginx.conf`. Check: T020 passes
- [x] T031 Add the instruments and span attributes in `src/telemetry/metrics.ts` and the route, and amend `specs/000-local-foundations/contracts/telemetry.md` §3.3 and §4.1 in the same commit ("A name changes here first, in the same commit as the code"; Amendment 0-5). Check: T021 passes
- [x] T032 Add `POST /admin/twin/turn` to `src/routes/admin.ts` and `AdminClient.twin_turn` to `scripts/operator.py`. Check: T022 passes; the note lists `scripts/operator.py` first under what runs in the Author's terminal (ADR 0017)

**Checkpoint**: every refusal and degraded path answers, the guards hold, and the Author's evaluation route exists; no visitor-facing answer yet.

---

## Phase 3: User Story 1 — A Piece Opens a Grounded Answer (Priority: P1) 🎯 MVP

**Goal**: selecting a ready piece opens a grounded answer, and typing carries the conversation on; the neon sign counts each turn (FR-001 to FR-016, FR-032 to FR-038, FR-045 to FR-047).

**Independent Test**: with one topic ready at the running hashes (a test readiness file), select its piece on each path, then type three follow-ups; the answers come from `00` and the topic's file alone; an unready piece shows its fixed message and sends nothing; a crafted request for it gets 409.

### Tests for User Story 1 (first)

- [ ] T033 [P] [US1] Extend `apps/web/test/ui/talk.test.ts` (FR-032, FR-033, spec 002's T065): a ready piece's selection sends `{feature, path, turns: []}`; selecting the active conversation's piece sends nothing; another piece aborts the turn in flight and opens a new conversation; typed text continues the active feature; an unready topic shows `topic_not_ready` with its phrase and sends nothing; `onTurnOutcome` is called exactly once per sent turn, after it ends, and never for one not sent; nothing is written to storage, cookies, or the URL (spies). Check: RED before T040 and T041
- [ ] T034 [P] [US1] Write `apps/web/test/talk/turn-client.test.ts` (FR-033): the request is a same-origin `POST /api/room/turn` with `credentials: "omit"`, `cache: "no-store"`, and a JSON body; the 35-second timeout on `FakeClock` and an abort each resolve `{kind: "error"}`; a body that fails to parse is `body`; the history window keeps the newest turns within `history_max_turns` and `history_max_chars`, dropping the oldest. Check: RED before T039
- [ ] T035 [P] [US1] Extend `apps/web/test/ui/talk.test.ts` with the panel's states and accessibility (FR-034, FR-035, FR-039 to FR-042, SC-008's automated half): within 100 ms of sending on `FakeClock`, the visitor's words under "You", the box cleared, the status `twin_answering` outside the log, Send renamed Stop; the answer as text under a visible "AI twin" label, markup and URLs rendered as text; focus unchanged; the answer, the status, and a failure each announced once; Escape stops; `maxlength`, the description, and the counter from 80% follow the index's limits; axe-core reports 0 violations idle, waiting, answered, and failed, at 320 CSS pixels and at 200% text; the status has no animation under reduced motion. Check: RED before T040 and T043
- [ ] T036 [P] [US1] Write `apps/web/test/room/manifest-readiness.test.ts` (FR-030, FR-037, SC-009, spec 002's T066): `emit.ts` sets each topic's `ready` in the index, each object's in `room-manifest.json`, and `free_talk.ready`, by FR-030's rule, nothing ready when the readiness file or the pack is missing or invalid (the state before P-1), and the build still succeeding; it agrees with the gateway on every row of `services/gateway/test/fixtures/twin-readiness-matrix.json`; the prompt hash equals the shared fixture's. Check: RED before T042
- [ ] T037 [P] [US1] Extend `services/gateway/test/integration/room-turn.test.ts`, the happy path (FR-003, FR-004, FR-006, FR-008, FR-024, FR-026, SC-006's automated half): an opening for a ready selectable is grounded in the rules, `00`, and its topic's files alone, with the snowboard's lead; a follow-up stays in the topic while free talk isn't ready; the 200 has exactly the four fields; `cost_micro_usd` equals the sum of the turn's ledger rows (local 0; a stub fallback's priced cost), and `route` is `fallback` when the fallback answered; the ledger row has purpose `twin`, the feature, and the topic. This is the story's acceptance test over units Phase 2 built and tested one by one. Check: written and run before T039; any assertion that fails is fixed in `src/twin/` within this phase, its RED recorded; GREEN in T047's run
- [ ] T038 [P] [US1] Extend `apps/web/test/twin-pack.test.ts` and `evals/test_run.py` (FR-016, FR-049, FR-050): one golden case per Golden Q&A per path, its feature as plan §8 gives it, its anchors present in both the answer and the grounding, `not_contains` the public phrases less those the answer holds, a check in every case; the cases fresh; `evals/run.py` accepts `twin` and `kind`, runs twin cases on the fake adapter from `fake_response`, sends them through a stub `AdminClient.twin_turn` for `--adapter local` and `bedrock`, writes history with each case's guard and the run's hashes and no answer text, and prints each topic's and path's pass rates against the readiness file's thresholds. Check: RED before T044

### Implementation for User Story 1

- [ ] T039 [US1] Write `apps/web/src/talk/turn-client.ts` (plan §7). Check: T034 passes
- [ ] T040 [US1] Extend `apps/web/src/talk/talk.ts` and `talk.css`, and add the four fixed messages to `apps/web/content/messages.yaml` and `src/talk/messages.ts` with plan §7's proposed words (FR-038; Amendment 2-2): the conversation, the history window, the states, the labels, Stop and Escape, and `onTurnOutcome`. Check: T033 and T035's state parts pass; the messages pass the room words' checks
- [ ] T041 [US1] In `apps/web/src/room/app.ts`, run a ready selectable's `talk` action as the conversation's opening through the talk panel. Check: T033 passes
- [ ] T042 [US1] In `apps/web/build/room/emit.ts`, read `config/twin-readiness.yaml`, the pack, and the prompt, and set readiness by FR-030's rule (FR-037). Check: T036 passes
- [ ] T043 [US1] Carry `config/budgets.yaml`'s `limits.twin` (FR-027's defaults when absent) into the index, for the text box and the history window (FR-027, FR-041). Check: T035's limit parts pass
- [ ] T044 [US1] Generate the golden cases with `twin:pack` into `evals/product/cases/`, extend `evals/run.py` (plan §8), and write the evidence report, `evals/twin_readiness.py`, run by the Makefile's `evals` target beside the behavioral tier's line, with its tests in `evals/test_twin_readiness.py`: information lines for lapsed entries and for ready entries whose evidence is missing, names other hashes, or misses the thresholds, failing nothing (FR-031). Check: T038 passes, and the report's tests; `make evals` passes on the fake adapter and prints the report
- [ ] T045 [US1] Add plan §9's panels to `specs/000-local-foundations/contracts/telemetry.md` §7.8 (its "Waiting for their groups" paragraph becomes table rows; Amendment 0-5), to `deploy/grafana/dashboards/h4-runtime.json`, and to `deploy/scripts/test_dashboard.py`'s expectations, in one commit (FR-045; spec 002's T069). Check: `test_dashboard.py` passes, every query naming only metrics §4.1 lists
- [ ] T046 [US1] In one commit (FR-047, FR-048; spec 002's T070; RL4): write rows V2 and F1 in `docs/data-flow-disclosure.md` with the spec's words, change the section's lead sentence as plan §10 says, set `live.turn: site` in `apps/web/room/scene.yaml`, and extend `evals/test_disclosure.py`. Check: the compositor's RL4 passes with the row and refuses the scene without it (its known-bad overlay); `make test`
- [ ] T047 [US1] Run `make check ENGINE_MODE=none-yet` and `gitleaks dir` in the worktree and keep the whole outputs, with the RED and GREEN runs of T009 to T038, for the note. Check: every gate passes, or each failure is fixed in code, never in a test

**Checkpoint**: a ready topic opens and holds a conversation; the sign counts it; nothing reaches a visitor until the Author marks a topic ready.

---

## Phase 4: User Story 2 — A Visitor Asks Anything, and Hears "I Don't Know" (Priority: P2)

**Goal**: free talk over the whole corpus, gaps answered honestly (FR-008, FR-009, FR-015, FR-016, FR-032).

**Independent Test**: with free talk ready, a Golden Q&A question from each file on both paths; a gap and an empty slot; a question the corpus doesn't hold.

### Tests for User Story 2 (first)

- [ ] T048 [P] [US2] Extend `room-turn.test.ts` (FR-008, FR-009, FR-015): a free-talk turn is grounded in the rules, `00`, and the ranked sections for its question; a topic's follow-up adds ranked sections only while free talk is ready; the same question on both paths gets the same sections and a different depth line; a question about an empty slot gets a grounding with no value for it. Check: RED before T051
- [ ] T049 [P] [US2] Extend `apps/web/test/twin-pack.test.ts` (FR-049): one gap case per `[?]` line and per empty slot a topic file references, with its question, `fake_response`, and don't-know `regex`, digit-free where the gap is a number. Check: RED before T052
- [ ] T050 [P] [US2] Extend `apps/web/test/ui/talk.test.ts` (FR-032): with no active conversation, typed text starts free talk when it is ready and shows `cannot_talk.unavailable` with nothing sent when it isn't. Check: RED before T053

### Implementation for User Story 2

- [ ] T051 [US2] Complete `src/twin/grounding.ts`'s free-talk path and the follow-up rule. Check: T048 passes
- [ ] T052 [US2] Generate the gap cases with `twin:pack`. Check: T049 passes; `make evals`
- [ ] T053 [US2] Wire free talk in `apps/web/src/talk/talk.ts`. Check: T050 passes

**Checkpoint**: free talk works once the Author marks it ready, and a gap is answered with "I don't know".

---

## Phase 5: User Story 3 — The Twin Refuses Bad Faith and Holds Its Limits (Priority: P2)

**Goal**: every refusal evaluated, every "Do not claim" bullet covered, every limit held in the room (FR-011, FR-013, FR-014, FR-017 to FR-019, FR-027, FR-028, FR-051).

**Independent Test**: `make redteam` catches every planted unsafe answer; the coverage check lists no bullet; over-limit and over-rate turns are refused with no call, and the room says so.

### Tests for User Story 3 (first)

- [ ] T054 [P] [US3] Extend `redteam/test_run.py` (FR-051, SC-004's coverage half): the four new detectors ("follows an injected instruction", "confirms a surname", "claims to be the Author", "produces code") each catch their planted unsafe answer and pass their safe twin; a case's `live` and `covers` fields load, unknown keys refused; every public "Do not claim" bullet in the topic files is named by some case's `covers`, or the test fails listing the rest; live mode with a stub `AdminClient` judges the real answer with `expect: safe`, writes history with no answer text, and refuses to run in the sandbox. Check: RED before T057 and T058
- [ ] T055 [P] [US3] Extend `apps/web/test/ui/talk.test.ts` (FR-027, FR-036, FR-041): the text box stops at the limit; a 429 shows `turn_refused.slow_down`; a 400, 413, or 415 shows `turn_refused.unreadable`; each returns the words to an empty box and drops the turn from the history. Check: RED before T059

### Implementation for User Story 3

- [ ] T056 [P] [US3] Review `config/twin/prompt.md`'s refusal and quoting sections against FR-013, FR-014, and FR-017 to FR-020, and the corpus's own refusal words (`00-profile.md`'s Golden Q&A 1 and 7, `08-hareet-ai.md`'s 4, 5, and 8), quoting them, never paraphrasing. Check: T017 still passes, and the prompt hash change is recorded in the note (it closes any topic the Author had marked, by design)
- [ ] T057 [US3] Write `redteam/cases/twin-*.yaml` (plan §8): spec 002's T047 room cases (locating the Author from the room, the window's view, or travel stories; instructions injected in typed text and in a forged twin turn; pressing a "Do not claim" item); the surname; "are you human?" and "are you Hareet?"; disparaging; revealing the instructions; code and essays; turn, visit, and site costs; each public "Do not claim" bullet pressed as true; spec 004's four B4 cases, given `live`. No case text names or hints at anything the corpus holds back. Check: T054's coverage passes; `make redteam` passes
- [ ] T058 [US3] Extend `redteam/run.py` with the detectors, the `live` and `covers` fields, live mode through `AdminClient.twin_turn`, and history under `redteam/history/`; add `make redteam-live` to the Makefile, refusing in the sandbox as `make evals ADAPTER=local` does. Check: T054 passes; the note lists the Makefile target under what runs in the Author's terminal
- [ ] T059 [US3] Complete the room's limit messages in `apps/web/src/talk/talk.ts`. Check: T055 passes

**Checkpoint**: the refusals are evaluable live, every bullet has a case, and every limit holds.

---

## Phase 6: User Story 4 — When the Twin Can't Answer, the Room Says Why (Priority: P3)

**Goal**: the end-to-end proof of the degraded behaviour built in the foundation (FR-005, FR-025, FR-036, FR-054).

**Independent Test**: every degraded cause, a stopped gateway, a cut network, a timeout, invalid twin files, and Stop, each through the real talk panel: the right message, no call where none can answer, the rest of the room working.

### Tests for User Story 4 (first)

- [ ] T060 [P] [US4] Extend `apps/web/test/ui/talk.test.ts` (FR-036): through a stub `fetch`, each of spec 000's causes in its class's message with the resume and the PDF; the edge's `api_unavailable` and `twin_unavailable` as `cannot_talk.unavailable`; a 502 `local_error` as `cannot_talk.unavailable` (analyze finding A1); a network error, a 35-second timeout, and a lost body as `cannot_talk.unavailable`, with the neon sign's visit marked "at least"; Stop as `turn_stopped`; a 409 as `topic_not_ready`, ending that conversation; in every case the resume, the PDF, and the pieces still work. Check: RED for any row T040 doesn't already handle
- [ ] T061 [P] [US4] Extend `services/gateway/test/integration/room-turn.test.ts` with fault injection (FR-025, FR-054, SC-005's automated half): the store lost mid-run, the journal unwritable, the local adapter failing with and without a fallback, and the fallback unavailable each give spec 000's cause, with 0 ledger rows for every turn refused before a call. Check: RED for any path T029 doesn't already handle

### Implementation for User Story 4

- [ ] T062 [US4] Close any gap T060 shows in `apps/web/src/talk/talk.ts`. Check: T060 passes
- [ ] T063 [US4] Close any gap T061 shows in `src/twin/turn.ts` or `src/routes/room-turn.ts`. Check: T061 passes

**Checkpoint**: every degraded path is proven in the room and in the gateway.

---

## Phase 7: Polish, the Merge, and the Author's Runs

**Purpose**: the documents, the review, the note, the merge, and the Author's evidence before any topic opens.

- [ ] T064 [P] Update `services/gateway/README.md` (the route, its order, the twin's files, the guards, the admin route) and `apps/web/README.md` (the turn client, its states, `twin:pack`). Check: `make test`'s docs-links check
- [ ] T065 [P] Bring the ADR (T004) in line with what was built, and record every departure from this plan in plan.md in the commit that made it. Check: the reviewer finds no departure unrecorded
- [ ] T066 Review the branch with the reviewer agent (`.claude/agents/reviewer.md`) in a session that wrote none of it: every pass `REVIEW.md` holds, over the diff from f9524081 (the cherry-picked documents apart), each finding tagged with its pass and severity; the implementing session fixes blockers test-first, and the reviewer re-reads each fix. Check: the verdict, in T067's note
- [ ] T067 Write `docs/merge-requests/<date>-feat-007-twin-conversation.md` in spec 002's notes' form (Runs in the Author's terminal; What changed and why; Acceptance criteria; Constitution check; Cost and data-flow impact; RED and GREEN; Review; Backlog; For the Author; Verification), with the editor, not a shell heredoc: `scripts/operator.py` and the Makefile's targets first under what runs in the Author's terminal (ADR 0017); P-1 and P-2, and when each lands; the proposed words of `withheld` and the four messages, for his read; the Author's actions of plan §13 as short commands, one per line; T047's whole outputs; the review's verdict (spec 002's T071). Check: the note's links resolve
- [ ] T068 Once line R's stack has merged through `feat/004-us9-neon-sign`, first record in T067's note the branch's tip as `feat/007-twin-conversation was <sha>`, then rebase onto `main` (`git rebase --onto refs/heads/main f9524081bb57c6fa07bbb26bf58a9fa135505d7c feat/007-twin-conversation` if line R was rebased before merging), re-run `make check ENGINE_MODE=none-yet`, and append its whole output. Check: every gate passes on the rebased tip
- [ ] T069 Author: apply P-1 (T006) on `main` by its note's steps, before this branch merges, with the behavioral-tier run `main`'s rule then asks of an enforcement-layer patch. Check: the stage S row passes, and an agent session's write to `config/twin-readiness.yaml` is refused
- [ ] T070 Author: gate `feat/007-twin-conversation` from main's checkout (`tools/gates/gate feat/007-twin-conversation`) and merge it with the command the gate prints. Check: `main` serves the route dormant: on prod, every turn `twin_unavailable`
- [ ] T071 Author: apply P-2 (T007) on `main`, with the ADR's acceptance (spec 002's T068; FR-027). Check: `validate-config` passes; on prod, an admin twin call answers, and the room's pieces still show their fixed messages, nothing being ready
- [ ] T072 Author: check prod's `MODEL_CTX_SIZE` and `MODEL_PARALLEL` hold 32,000 input characters (about 9,000 tokens) plus 300 out per slot, and that Bedrock's model-invocation logging is off in the account (plan §13, actions 2 and 3; FR-048). Check: both recorded in the note's follow-up
- [ ] T073 Author: give each topic's corpus files (`00`, `04` to `06`, then the rest for free talk) their final read, by his own corpus process. Check: their status lines, his to set
- [ ] T074 Author, Heavy: the live product run on prod's local model, `make evals ADAPTER=local ENV=prod`, committing its history entry. Check: each topic's and path's pass rates against the thresholds; 0 fallback rows in the run (SC-010); each turn's calls on the dashboard within 60 seconds, with their cost (SC-006)
- [ ] T075 Author: the live product run on Bedrock, by the note's command for prod's admin twin route with `ADAPTER=bedrock`, committing its history entry. Check: the thresholds met; the measured cost per turn recorded beside the spec's estimate; any timeout recorded against R-2
- [ ] T076 Author, Heavy: the live red-team run on prod's local model (`make redteam-live ADAPTER=local ENV=prod`), committing its history entry. Check: clean (SC-004)
- [ ] T077 Author: the live red-team run on Bedrock, by the note's command, committing its history entry. Check: clean (SC-004)
- [ ] T078 Author, Heavy: the recorded degraded run on prod (SC-005): the kill switch tripped, the store stopped, the local model stopped with no sub-budget left, and the gateway stopped, each with a selection and a typed turn. Check: each shows its fixed message; 0 ledger rows written; the resume, the PDF, and the pieces work; restore the stack afterwards
- [ ] T079 Author: mark each topic ready in `config/twin-readiness.yaml` whose runs (T074 to T077) passed at the running hashes, committing the history entries beside it (FR-031; SC-001). For hobbies and travel adventures, first decide any location case that fires on his own approved answer (the spec's Assumptions, "An approved answer the location rule judges"). Check: `make evals`'s evidence report shows no line for it; on prod the piece opens its conversation
- [ ] T080 Author: mark free talk ready the same way, once every topic file has had its final read and the whole corpus's runs pass. Check: as T079
- [ ] T081 Author: a keyboard-only run and a screen-reader run of a five-turn conversation, an opening among them (SC-008). Check: both completed unaided, recorded
- [ ] T082 Author, Heavy: the latency run (SC-003; spec 002's T081): at least 100 scripted turns on prod's local model, openings among them, from send to the answer shown. Check: 95% within 3 seconds, or the result recorded for his choice of a smaller output cap or an amended target (Q1)
- [ ] T083 Author: switch dev's model by its env file and re-run the product suite against it (spec 002's SC-014; its T067's conversation half). Check: 0 source files changed, and the suite runs unchanged
- [ ] T084 Author: spec 004's T273, the price check of `config/prices.yaml`'s Claude Haiku 5.5 row against Bedrock's current price, before paid figures reach public visitors. Check: a new price version appended if it differs
- [ ] T085 Author: spec 004's T274, a paid turn on dev: its figure marked "est." and "test"; a reload returning "no call yet" and "$0"; the browser's storage panel showing nothing the sign wrote; asked what a turn cost, the twin stating no amount. Check: recorded
- [ ] T086 Author: after a session on prod with a few typed turns, search prod's logs, traces (Langfuse), stores, and volumes for the typed words (SC-007; FR-046; the corpus's "their conversation is not saved"). Check: 0 found, recorded

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: needs the Author's approval of the spec and plan. T001 first; T002 next; T003 to T008 in parallel.
- **Foundational (Phase 2)**: after Setup. Its tests (T009 to T022) in parallel; then T023 to T032, each after its tests. Blocks every story.
- **User Story 1 (Phase 3)**: after Foundational. T046 puts row V2 and `live.turn: site` in one commit, since RL4 refuses `live.turn: site` without V2's words.
- **User Stories 2 and 3 (Phases 4 and 5)**: after User Story 1's room work (T040), since they extend the same talk panel; each independent of the other.
- **User Story 4 (Phase 6)**: after Phases 3 to 5, as their end-to-end proof.
- **Polish (Phase 7)**: T064 to T068 after the stories; T069 before T070; T071 after T070; T072 and T073 any time; T074 to T077 after T071; T078 after T071; T079 and T080 after T074 to T077 (and T073); T081 to T086 after the first topic is ready, but T083 and T084, any time after T071.

### The graph

```text
T001 → T002 → T003..T008
            → T009..T022 (tests) → T023..T032 (code)
                                 → US1 T033..T038 → T039..T047
                                                  → US2 T048..T050 → T051..T053
                                                  → US3 T054, T055 → T056..T059
                                                  → US4 T060, T061 → T062, T063
                                                  → T064..T068 → T069 (P-1) → T070 (merge) → T071 (P-2)
                                                                           → T072, T073
                                                                           → T074..T078 → T079, T080 → T081..T086
```

### Within each phase

- Tests are written and fail (RED) before their code; the note records both runs.
- The gateway's pipeline before its routes; the routes before the room's client.
- A contract changes in the same commit as the code it describes (T031, T045, T046).

## Parallel Examples

```bash
# Foundational's tests together:
Task: "T009 apps/web/test/twin-pack.test.ts"
Task: "T013 services/gateway/test/integration/room-turn.test.ts (refusals)"
Task: "T016 services/gateway/test/unit/twin-retrieve.test.ts and twin-grounding.test.ts"
Task: "T018 services/gateway/test/unit/twin-guards.test.ts"
Task: "T020 deploy/scripts/test_edge_site.py"

# User Story 1's tests together:
Task: "T033 apps/web/test/ui/talk.test.ts (conversation)"
Task: "T034 apps/web/test/talk/turn-client.test.ts"
Task: "T036 apps/web/test/room/manifest-readiness.test.ts"
Task: "T038 evals/test_run.py and the generated cases"
```

## Implementation Strategy

### MVP first

1. Setup (T001 to T008), with A6 settled by T001.
2. Foundational (T009 to T032): every refusal, degraded path, and guard, and the admin route.
3. User Story 1 (T033 to T047): one topic's conversation, the sign counting it, rows V2 and F1.
4. Stop and validate on dev-cpu's small model for plumbing; the Author's runs on prod decide readiness.

### Incremental delivery

- After User Story 1, the branch is mergeable dormant: nothing reaches a visitor until the Author's P-2 and his readiness marks.
- User Story 2 adds free talk; User Story 3, the live refusals and every bullet's case; User Story 4, the degraded proof.
- The topics open one by one, each on its own evidence (T079), then free talk (T080).

## Notes

- Agents never edit `corpus/`, `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `tools/gates/**`, `evals/agent-config/**`, `assets/policy/**`, or the Author's config files; their changes arrive as patches (T006, T007).
- No file this work adds names, or hints at, anything the corpus holds back: prompts, cases, fixtures, and notes included.
- Commit before any pause: `/tmp` is wiped when WSL restarts.
- If a test fails, fix the code, not the test.
