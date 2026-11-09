---

description: "Task list for spec 011, alerts designed to be read"
---

# Tasks: Alerts Designed to Be Read — An HTML Email, an Organized Telegram Message, and a Sample of Each

**Input**: the documents in `specs/011-alert-message-design/`: [spec.md](spec.md) (FR-001 to FR-053, SC-001 to SC-012, the Clarifications with the Author's seven answers, Amendments 0-1 to 0-10, and its Data-Flow Disclosure Entries) and [plan.md](plan.md) (decisions D1 to D16, §2 to §13, the optional patch P-A, the risks R-1 to R-13, and the analyze pass at its end).

**Prerequisites**: the Author approves the spec and the plan (T000). Until then no task below starts: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`." The intent was accepted, and Q1 to Q5 answered, by the Author on 2026-11-08.

**Tests**: required. In each phase the test tasks come first and must fail (RED) before the code that makes them pass (GREEN); the branch's note records both runs. A task that only proves an existing rule (T036) passes at once, and the note says so. Every agent check runs inside `make test`, `make evals`, the matrix, or the breach test, so no `CHECK_GATES` entry is added.

**Organization**:
- **One branch**, `feat/011-alert-message-design`, in its own worktree, stacked on `feat/010-anthropic-provider`'s tip as it stands when T001 runs, or cut from `refs/heads/main` once that branch has merged; it merges after it (plan §14).
- **The phases**: Setup; Foundational, which holds the degraded path (the facts, the forms' chooser, every fallback, the migration, the switch, the telemetry) before any design (Principle I); User Story 1 (Telegram, P1); User Story 2 (email, P1); User Story 3 (the fallbacks end to end, the panel, the runbook, P1); User Story 4 (samples, P2); User Story 5 (spec 010's alerts, P2); then Polish, the merge, and the Author's steps.
- **Parallel lanes**: tasks marked [P] touch files no unfinished task of their phase touches, so agents can take them in worktrees of their own, one per agent that writes, the commits cherry-picked onto the branch in task order. Agents never merge.
- **The branch ends** with a review by an agent that wrote none of it, then a merge-request note, `docs/merge-requests/<date>-feat-011-alert-message-design.md`, holding `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s.

## Format: `[ID] [P?] [Story?] Description (branch)`

- **[P]**: can run in parallel with the other [P] tasks of its group: different files, no dependency on an unfinished task.
- **[USn]**: the user story of a story phase. Setup, Foundational, and Polish tasks carry none.
- **"Author:"** opens a task only the Author does: in his own terminal, on `main`, or on prod. Agents never do these steps, never read or write his env file, and never run an operator target for any stack but dev-cpu.
- **Patches.** A human-only path (`.claude/**`, `CLAUDE.md`, `REVIEW.md`, `tools/gates/**`, `evals/agent-config/**`, `config/alerts.yaml`, and the rest `.claude/settings.json` denies) changes only by the Author's hand. An agent task writes such a change as a `.patch` beside the branch's note, built from plain copies (`git show`, `git diff --no-index`), never by `git apply` or a write into any worktree.
- **Check** ends each task: what proves it done. **The branch** ends each task.

## Path conventions

- The gateway: `services/gateway/src/alerts/` (the facts, the marks, the renderers, the chooser, the catalogue, the channels, the dispatcher, the outbox), `src/routes/admin.ts`, `src/config/validate.ts`, `src/telemetry/`, `src/app.ts`, `migrations/`, `test/unit/`, `test/integration/`, `test/fixtures/alerts/`.
- "D-n", "§n", "P-A", and "R-n" are plan.md's; "Qn", "FR-nnn", "SC-nnn", and amendment IDs are the spec's.
- The golden files under `test/fixtures/alerts/` are written only by `test/unit/alert-goldens.test.ts` run with vitest's `-u`, in the task that changes a design, and reviewed in the diff (plan §3.4); never by hand, and never in a fix task.
- Tests build any token-shaped value at run time and compute hashes from fixtures, never as literals, which gitleaks and the gate's content scan refuse.

---

## Before any phase

- [x] T000 Author: approve spec.md and plan.md. Approved in the session on 2026-11-08. He was asked: "Spec 011, the alert designs (HTML email with meter bars, Telegram with severity and kind emoji, plain-text fallback, samples to your real channels): do you approve its spec and plan (T000) so it can be built?" He answered "Approve (Recommended)". The option read: "The build starts on top of spec 010's branch once that's finished, with the spec inside it, so one gate at the end covers spec 010 and 011 together." So the documents get no gate of their own: this branch's commits travel at the base of `feat/011-alert-message-design`, and that branch's gate checks them with the code (T052). Check: the spec's Clarifications hold his seven answers in the session's words, and its Status reads clarified.

---

## Phase 1: Setup

**Purpose**: the base confirmed, the outside facts read, and the ADR and the contract passages written down.

- [x] T001 Create the worktree with `git worktree add -b feat/011-alert-message-design <new folder> feat/010-anthropic-provider` (or `refs/heads/main` if that branch has merged), run `npm ci --ignore-scripts --cache "$TMPDIR/npm"`, and cherry-pick `spec/011-alert-message-design`'s commits if the base lacks them. Then read and record in the note: the Bot API reference's `sendMessage` `entities` field, `MessageEntity`'s fields and its UTF-16 rule, the text's 4,096 limit, whether `disable_web_page_preview` stands or `link_preview_options` replaced it, the FAQ's advice for one chat, and whether Telegram makes links inside `code` entities; nodemailer 10.0.16's part order for `text` with `html`, and the `command` its errors carry for a refused `DATA` and a refused message end (from its source in `node_modules`); spec 010's alert variants as built at the base (`src/alerts/format.ts`); the newest migration's number and audit-action lists on the base; and the next free ADR number. Check: `git rev-parse HEAD` prints the base's full SHA; each item is recorded; any that differs from plan §4.4, §5.5, §2.3, or D14 is a departure recorded in plan.md in the same commit, before any task builds on it (analyze findings A5, A12, A15) (feat/011-alert-message-design)
- [x] T002 [P] Write the ADR, status proposed, at the next free number after spec 010's 0041 (0042 unless another branch has taken it; check `docs/adr/README.md` on the base), as `docs/adr/00NN-alerts-designed-to-be-read.md`, by plan §12.2, with its row in the index and ADR 0005's row gaining "(one Decision extended by 00NN)". Check: `make test`'s docs-links check passes (FR-050) (feat/011-alert-message-design)
- [x] T003 [P] Amend spec 000's living interfaces, each new or changed passage marked "(spec 011)", by plan §12.1: `contracts/alerts.md` §2, §3 (with one designed example beside the plain ones), §4.1, §4.2, §4.4, §5, and §6 (0-1 to 0-6); `data-model.md` §2.6 and §2.7 (0-7); `contracts/operator-admin.md` §1.3, a new §2.4 for `POST /admin/alert-samples`, §6, and §6.1 (0-8); `contracts/config-files.md` §4.1 and §4.3 (0-10). The telemetry contract changes with its code (T016, T031). Check: `make test`'s docs-links check passes; the reviewer (T048) reads each passage against the FRs it serves (FR-049) (feat/011-alert-message-design)
- [x] T004 [P] Add `services/gateway/test/fixtures/alerts/` to `.prettierignore`, with a comment: the renderer's exact bytes, written by vitest alone (plan §3.4, D13). Check: `make lint` passes with a test HTML file in that folder that Prettier would reformat, which is then removed (feat/011-alert-message-design)

**Checkpoint**: the base and the outside facts are confirmed, and the interfaces and the ADR are written down.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the degraded path before any design: the facts the forms render from, the chooser, every fallback and its record, the migration, the switch, and the telemetry, all proven with stub designed renderers. No user story starts before this phase passes.

### Tests for Foundational (first)

- [x] T005 [P] Write `test/unit/alert-facts.test.ts` (FR-001, FR-025, FR-030; plan §2.2): version 2's keys (`facts_version`, `prefix`, `env_class`, `runtime_since`, `fallback_since`, `label`, `confirm_zero`) for every kind and variant, spec 010's included; `decodeFacts(factsOf(ctx, spec))` deep-equals `(ctx, spec)` for every case of `test/unit/alerts.test.ts`'s `everyKind()` and spec 010's two variants; a version 1 row's facts, a missing key, an ill-typed key, an unknown kind, and a micro-USD value past a safe integer each decode to nothing, and the decoder never throws; the facts hold no canary. Check: RED before T013 (feat/011-alert-message-design)
- [x] T006 [P] Write `test/unit/alert-forms.test.ts` (FR-023, FR-025, FR-028, FR-030, FR-031; plan §6.1), with stub designed renderers: each row of the chooser's table in its order (the switch at `plain`; the row's form already `plain`, its reason kept; facts that don't decode, `not_rendered`; a renderer that throws, or output that fails its check, `render_failed`; output past its bound, `over_limit`, through a renderer seam that returns a long form; otherwise designed). Check: RED before T014 (feat/011-alert-message-design)
- [x] T007 [P] Write `test/integration/dispatcher-forms.test.ts`, on PGlite with the test clock and in-process stub Telegram and SMTP servers (FR-026 to FR-030, FR-044, FR-045; SC-004): a Telegram 400, as the HTTP status and as a 200 with `error_code` 400, after a designed send, is followed at once in the same attempt by the plain body, with no `entities` and no `parse_mode`, starting within 50 ms of the answer; the attempt counts once; the row records `telegram_form = 'plain'` and `entities_refused`; the next attempt sends plain; a 429 and a 503 keep the designed form on the schedule; an SMTP 554 to the message's data is followed at once by today's message, recorded `message_refused`; a 451 keeps the designed form on the schedule; a version 1 row goes plain as `not_rendered`; the claim's lease covers two sends, so a second dispatcher can't claim the row between them; each fallback logs `alert.fallback` and adds to `h4.alert.fallbacks`, and raises no alert row. Check: RED before T014 (feat/011-alert-message-design)
- [x] T008 [P] Write `test/integration/crossings-forms.test.ts` (FR-025; SC-005; plan §6.4): with the designed renderers replaced by throwing stubs and spies, a warning crossing, a trip, a reset, an init, the auth-failure alert, `credentials_expiring`, `fallback_unavailable`, and the reminder each commit with their plain outbox row and state change, and the spies count no call inside any transaction. Check: RED before T013 and T014 (feat/011-alert-message-design)
- [x] T009 [P] Extend `test/unit/validate-config.test.ts` and `test/integration/migrations.test.ts` (FR-028, FR-031; plan §2.3, §10): `formats` absent, `designed`, or `plain` on each channel accepted, any other value or key refused (rule A8); rule A2 refuses a file whose last attempt with two sends passes `give_up_after_s`, and passes the committed file (230 + 20 ≤ 300); `0006_alert_forms.sql` adds the four columns with their CHECKs and the two fallback-is-plain constraints, admits `alert_samples` with a reason and refuses it without one, and leaves 0001 to 0005 byte-identical. Check: RED before T012 and T015 (feat/011-alert-message-design)
- [x] T010 [P] Extend `test/unit/telegram.test.ts` and `test/integration/smtp-tls.test.ts` (or the SMTP stub's tests) (FR-008, FR-013, FR-015, FR-016, FR-027): `sendTelegram` with entities writes `{chat_id, text, entities, disable_web_page_preview: true}` and with none writes exactly today's body; `sendEmail`'s designed form is one `multipart/alternative` message, the text part first, with today's headers and no attachment; its plain form is today's message byte for byte; the refusal class reads a 5xx to the message's data as T001 recorded it, and keeps the class `smtp_<code>`. Check: RED before T014 (feat/011-alert-message-design)
- [x] T011 [P] Extend `test/unit/telemetry.test.ts` (FR-044, FR-045, FR-047; plan §9.1 to §9.3): the instrument inventory with `h4.alert.form` (`designed`, `plain`, `none`), the kind `sample`, `h4.alert.fallbacks` and its reasons, and the action `alert_samples`; the `alert.deliver` span's key set; with an in-memory exporter, no span attribute holds a canary, a URL, or a token. Check: RED before T016 (feat/011-alert-message-design)

### Implementation for Foundational

- [x] T012 Write `migrations/0006_alert_forms.sql` by plan §2.3, its action lists copied from the newest migration on the base. Check: T009's migration cases pass (feat/011-alert-message-design)
- [x] T013 Write `src/alerts/facts.ts` (`factsOf`, moved from `format.ts`, with version 2's keys; `decodeFacts`, strict and total) and point `renderAlert` at it; pass each call site's label and `confirm_zero` through the typed context and spec, so `meter/crossings.ts`, `meter/init.ts`, `routes/admin.ts`, and the dispatcher change only where a value was missing. Check: T005 passes; T008's commit cases pass; every existing gateway test still passes, `test/unit/alerts.test.ts`'s plain texts unchanged (feat/011-alert-message-design)
- [x] T014 Write `src/alerts/forms.ts` (plan §6.1), with the designed renderers behind an interface and none registered yet, which the chooser treats as the switch at `plain`; change `src/alerts/telegram.ts` (a message with or without entities), `src/alerts/smtp.ts` (the designed message or today's; the refusal class), and `src/alerts/dispatcher.ts` (the form per attempt from `formsFor`; the plain send at once after a refusal; the lease of two sends; the sticky form; the outcome's columns; the in-memory alert's form state). Check: T006, T007, and T010 pass (feat/011-alert-message-design)
- [x] T015 Add `formats` (rule A8) and rule A2's two sends to `src/config/validate.ts` and `AlertsConfig`, and write `test/fixtures/config/alerts-formats.yaml`. Check: T009's configuration cases pass; `validate-config` passes on the committed `config/alerts.yaml`, unchanged (feat/011-alert-message-design)
- [x] T016 Add `h4.alert.form`, the kind `sample`, `h4.alert.fallbacks`, and the action `alert_samples` to `src/telemetry/metrics.ts`, the `alert.deliver` span and the server span's `h4.action` helper to `src/telemetry/otel.ts`, and their use to the dispatcher; amend `specs/000-local-foundations/contracts/telemetry.md` §3.2, §4.1, and its records table in the same commit ("A name changes here first, in the same commit as the code"; Amendment 0-9). Check: T011 passes; T007's telemetry cases pass (feat/011-alert-message-design)

**Checkpoint**: every fallback answers and is recorded, a design can never touch a cause's transaction, and the switch works; nothing designed is sent yet.

---

## Phase 3: User Story 1 — The Author Reads a Telegram Alert at a Glance (Priority: P1)

**Goal**: every alert reaches Telegram as a designed message: severity, headline, next step, meters, states, time, ID, runbook, with entities that are valid in UTF-16, and the plain text when Telegram refuses them.

**Independent Test**: spec.md User Story 1's.

### Tests for User Story 1 (first)

- [x] T017 [P] [US1] Write `test/unit/alert-marks.test.ts` (FR-006, FR-007; plan §3.1): every catalogue kind and variant has its severity by Q2's answer (Critical: `trip`, both `fallback_exhausted` variants, `store_unreachable`; Warning: every `warn`, `credentials_expiring`, `fallback_unavailable`, `auth_failed`; Operator action: every `operator_action`; Information: `reminder`), its severity's emoji and name, and its kind's emoji; each emoji's UTF-16 length (one, two, or three) and its shape (one code point, or one and U+FE0F). Check: RED before T021 (feat/011-alert-message-design)
- [x] T018 [P] [US1] Write `test/unit/telegram-design.test.ts`, and the Telegram half of `test/unit/alert-goldens.test.ts` (each case's `plain.txt` and `telegram.txt`) (FR-002, FR-003, FR-008 to FR-012, FR-014, FR-023, FR-024; SC-002, SC-008): the lines in FR-003's order; `bold` on the headline, `code` on the key and the path, one `pre` on the meters, and nothing nested; every entity's offsets checked against the text's own UTF-16 code units, with emoji of one, two, and three units placed before entities and a prefix holding an emoji; the prefix's and a label's `*`, `_`, `<`, `&`, and backtick kept as themselves; the token `id <key>` found by `evals/breach_probe.py`'s regular expression; the check refusing crafted bad lists (out of range, a split pair, an overlap, zero length, a fifth type, a `language`); dev's marks and the test clock; `case-longest` within 2,000 units; the cross-form check of amounts, times, keys, and fingerprints (plan §3.2). Check: RED before T021 and T022 (feat/011-alert-message-design)
- [x] T019 [P] [US1] Extend `evals/standins/test_telegram_standin.py` (FR-041; plan §8.1): entities accepted and kept, and returned by `GET /messages`; each invalid list refused with the Bot API's 400 shape; a 4,096-unit text holding emoji kept, a 4,097-unit one refused, and a text under 4,096 code points but over 4,096 units refused; the preview flag kept; `parse_mode` still refused; its log holds no text or token. Check: RED before T023 (feat/011-alert-message-design)
- [x] T020 [P] [US1] Extend `evals/test_disclosure.py` (FR-051; plan §12.3): `spec_011_entry(row_id)`; `test_the_alert_rows_add_spec_011s_words`, finding each entry cell's addition, its prefix stripped, in rows A1, A2, S12, and S13; `spec 011 FR-051` in their FR cells; the existing tests on A1, the alert rows' FRs, and S12's and S13's pointers to S11 unchanged. Check: RED before T024 (feat/011-alert-message-design)

### Implementation for User Story 1

- [x] T021 [US1] Write `src/alerts/marks.ts` (plan §3.1), with the palette's values beside the marks. Check: T017 passes (feat/011-alert-message-design)
- [x] T022 [US1] Write `src/alerts/telegram-design.ts` (plan §4.1 to §4.3) and register it with the chooser; generate the golden files' `plain.txt` and `telegram.txt` for every case with `-u`, read each in the diff, and commit them. Check: T018 passes; T007's designed-send cases pass with the real renderer; the benchmark's Telegram half stays under its share of 5 ms (feat/011-alert-message-design)
- [x] T023 [US1] Change `evals/standins/telegram_standin.py` by plan §8.1, with its docstring. Check: T019 passes; `make up ENV=dev-cpu` builds and starts the stand-in (feat/011-alert-message-design)
- [x] T024 [US1] Change rows A1, A2, S12, and S13 in `docs/data-flow-disclosure.md`, each cell's addition in the spec's words after its own (plan §12.3). Check: T020 passes (feat/011-alert-message-design)

**Checkpoint**: Telegram receives designed messages, the stand-in checks them, and the disclosure says so.

---

## Phase 4: User Story 2 — The Author Opens an Alert Email That Details the Alert (Priority: P1)

**Goal**: every alert's email is a `multipart/alternative` message under the designed subject, with an HTML part that loads nothing, draws each meter as a bar, and reads in light and dark.

**Independent Test**: spec.md User Story 2's.

### Tests for User Story 2 (first)

- [x] T025 [P] [US2] Write `test/unit/email-design.test.ts` (FR-002, FR-003, FR-015 to FR-024; SC-008, SC-009; plan §5): the designed subject, the two emoji, a space each, and the first line, and a sample's with 🧪 first and `[SAMPLE] ` in its first line; every element and attribute of every case on the allowlist, by a tokenizer written in the test, and no `url(`, `@import`, `expression(`, `//`, `http:`, `https:`, `data:`, or `cid:`; every value escaped; the `color-scheme`, `supported-color-schemes`, viewport, `format-detection`, and `lang` declarations; the rows in FR-003's order; each bar's share from the facts, full at or past its ceiling, the tick at the warning, the numbers beside it; every text pair at 4.5:1 and every bar on its track at 3:1, in both palettes, computed from `marks.ts`'s values; `case-longest` within 32 KiB; the cross-form check. Check: RED before T028 (feat/011-alert-message-design)
- [x] T026 [P] [US2] Extend `test/unit/alert-goldens.test.ts` with each case's `subject.txt` and `email.html` (FR-004, FR-005; SC-001), so every case of plan §3.4 has its four files. Check: RED before T028 (feat/011-alert-message-design)
- [x] T027 [P] [US2] Extend `test/unit/alerts.test.ts`'s §5 tests (FR-042, FR-043; SC-003; plan §3.6): every entry, further case, and sample rendered in every form while the canaries sit in the client label, the hello message, the operator's reason, and a token; no canary and no run of nine or more hex digits in the plain text, the designed subject, the Telegram text or its serialized entities, the HTML, or the facts; the escaping case. Check: RED for the HTML and subject until T028 (feat/011-alert-message-design)

### Implementation for User Story 2

- [x] T028 [US2] Write `src/alerts/email-design.ts` (plan §5.1 to §5.4) and register it with the chooser; generate the golden files' `subject.txt` and `email.html` for every case with `-u`, open a few in a browser offline to see them load nothing, read each in the diff, and commit them. Check: T025, T026, and T027 pass; T010's designed message carries the real HTML; the benchmark stays under 5 ms an alert for both designs (feat/011-alert-message-design)

**Checkpoint**: both channels send designed forms; every case's four files are pinned.

---

## Phase 5: User Story 3 — An Alert Is Never Lost to Its Design (Priority: P1)

**Goal**: the end-to-end proof of the degraded path Phase 2 built, with the real renderers, and its panel and runbook.

**Independent Test**: spec.md User Story 3's.

### Tests for User Story 3 (first)

- [x] T029 [P] [US3] Extend `deploy/scripts/test_dashboard.py` (FR-046): its pinned "Alert log" query with `fallback`, and assertions for the new panel's query and the outcomes table's form column, by plan §9.4. Check: RED before T031 (feat/011-alert-message-design)
- [x] T030 [P] [US3] Write the real-renderer cases of `test/integration/dispatcher-forms.test.ts` (User Story 3's scenarios; SC-004): with `telegram-design.ts` and `email-design.ts` registered, the stub Telegram server refusing entities, the stub SMTP server refusing the message's data, a renderer seam forcing a throw and a form past its bound, a version 1 row, and the switch at `plain` on each channel, each alert arriving in its plain form in the same attempt, recorded with its reason. Check: passes, or RED naming what T031 or a fix in `forms.ts` closes (feat/011-alert-message-design)

### Implementation for User Story 3

- [x] T031 [US3] Amend `specs/000-local-foundations/contracts/telemetry.md` §7.5 by plan §9.4, and in the same commit add "Alerts sent as plain text by fallback" to `deploy/grafana/dashboards/h4-runtime.json`'s audit-and-alerts row, the form to "Alerts by channel and outcome", and `fallback` to "Alert log" (FR-046, FR-049). Check: T029 passes; T030 passes (feat/011-alert-message-design)
- [x] T032 [P] [US3] Add "Alerts arrive as plain text" to `docs/runbooks/alert-channel-down.md` by plan §9.5. Check: `make test`'s docs checks pass (feat/011-alert-message-design)

**Checkpoint**: every fallback is proven end to end, counted, shown, and explained.

---

## Phase 6: User Story 4 — The Author Sees Each Design Through a Marked Sample (Priority: P2)

**Goal**: `make operator-alert-samples` sends a marked sample of every catalogue entry wherever the stack's alerts go, outside the outbox and every count of real alerts.

**Independent Test**: spec.md User Story 4's.

### Tests for User Story 4 (first)

- [x] T033 [P] [US4] Write `test/unit/alert-catalogue.test.ts` (FR-004, FR-034 to FR-036; plan §7.3): 19 entries in FR-004's order, every kind covered; each sample's key `<stack>:sample:<entry>:<audit id>`; `sample` not in `REAL_KINDS`, and `REAL_KINDS` equal to the outbox's CHECK list with `store_unreachable`, to `h4.alert.kind`'s values but `sample`, and to contracts/alerts.md §2's kinds; a sample's marks in every form; its facts from the catalogue alone, with a store spy counting no read. Check: RED before T038 (feat/011-alert-message-design)
- [x] T034 [P] [US4] Write `test/integration/alert-samples.test.ts`, on PGlite with the test clock and the stub channels (FR-033, FR-037 to FR-040, FR-047; SC-006, SC-007): `POST /admin/alert-samples` answers 200 with 19 keys and `delivery`, and `KIND=trip` with the trip's; one audit row with the reason and the keys, and no journal record and no `operator_action` row; every sample delivered on both stubs in its designed form, marked; 0 outbox rows with a sample's key; the state, the meters, and the journal unchanged; 409 `samples_in_flight` while any is pending; 400 for a short reason, an unknown kind, or another key; 503 with the store down, nothing queued; a real alert falling due meanwhile attempted before the next sample; at most one sample a second on each channel; `h4.alerts` and `h4.alert.fallbacks` under the kind `sample`, and no `h4.alert.delivery_lag` from a sample; `h4.operator.actions` counting `alert_samples`; the server span's `h4.action`. Check: RED before T039 (feat/011-alert-message-design)
- [x] T035 [P] [US4] Extend `scripts/test_operator.py` and `scripts/test_makefile.py` (FR-032; plan §7.5): the `alert-samples` subcommand's arguments, and none beginning `--s`; the body it posts; its summary lines; the dev-cpu hop forwarding it; `AUDIT_ACTIONS` with `alert_samples`; the target's `OPERATOR_AGENTS` guard, `REASON` required from the command line, and `KIND` passed as `--kind`. Check: RED before T040 (feat/011-alert-message-design)
- [x] T036 [P] [US4] Add the target's and the subcommand's rows to `redteam/forbidden-actions.sh` by plan §11 (`block`, `allow`, and `gap`), beside the operator rows. Check: the matrix's run shows each `block` and `allow` row passing and each `gap` row as a known gap, at once, since the existing rules cover the name; the note records the run (FR-032) (feat/011-alert-message-design)
- [x] T037 [P] [US4] Extend `evals/test_breach.py` and `evals/test_breach_helpers.py` (FR-040, FR-041; SC-002, SC-006; plan §8.2): the probe's `telegram` and `mailpit` results carry `designed` (and `entities`), printing no payload; the existing alert checks expect `designed: true` in stand-in mode; step 12's operations (the status read, the admin request, a `telegram` and a `mailpit` check for each key within 120 s, the audit row, the metric, and the status read again, its state and meters unchanged), and its skip with `DELIVERY=real`. Check: RED before T041 (feat/011-alert-message-design)

### Implementation for User Story 4

- [x] T038 [US4] Write `src/alerts/catalogue.ts` and `REAL_KINDS` in `src/alerts/outbox.ts` (plan §7.3); generate `case-sample-trip`'s four golden files with `-u` and commit them. Check: T033 passes; T026 passes with the sample's case (feat/011-alert-message-design)
- [x] T039 [US4] Add `POST /admin/alert-samples` to `src/routes/admin.ts` (plan §7.2), the dispatcher's `queueSamples` and its paced delivery (plan §7.4), and the narrow interface handed to the admin routes in `src/app.ts`. Check: T034 passes (feat/011-alert-message-design)
- [x] T040 [US4] Add `alert-samples` to `scripts/operator.py` and `operator-alert-samples` to the `Makefile` (plan §7.5). Check: T035 passes; the live run on dev-cpu is T047's (feat/011-alert-message-design)
- [x] T041 [US4] Change `evals/breach_probe.py` and `evals/breach.py` by plan §8.2 (the form in the stand-in results; step 12). Check: T037 passes (feat/011-alert-message-design)

**Checkpoint**: the Author can send samples; dev-cpu proves them on both stand-ins.

---

## Phase 7: User Story 5 — Alerts Keep Working When Prod's Paid Fallback Is the Anthropic API (Priority: P2)

**Goal**: spec 010's alerts, in every form, with prod routing the Anthropic API, and Bedrock's as before.

**Independent Test**: spec.md User Story 5's.

- [x] T042 [P] [US5] Write `test/integration/alerts-anthropic.test.ts` (FR-048; SC-011; plan §12.4), with spec 010's test configuration (`test/helpers/anthropic-config.ts`), its stub paid adapter, and the test clock: the adapter month's warning under Warning and its exhaustion under Critical, each showing the month against its cap in every form, and `fallback_unavailable` naming "the Anthropic API" and `anthropic-unavailable.md`, each delivered designed to the stub channels; with Bedrock's configuration, `credentials_expiring` and `fallback_unavailable` likewise. Check: passes, or RED naming what T043 closes (feat/011-alert-message-design)
- [x] T043 [US5] Close what T042 shows. Check: T042 passes; any change is recorded in plan.md (feat/011-alert-message-design)

**Checkpoint**: every alert kind, spec 010's included, is designed and delivered on either paid adapter.

---

## Phase 8: Polish, the Merge, and the Author's Steps

- [x] T044 [P] Add an "Alerts" section to `services/gateway/README.md` by plan §13: the three forms and where each renders, the catalogue, the golden files and how to open them, the samples' command, the switch, the fallback panel, and that `alert.deliver` traces appear in Langfuse without generations. Check: `make test`'s docs checks pass (feat/011-alert-message-design)
- [x] T045 [P] Bring the ADR (T002) in line with what was built, and record every departure from plan.md in plan.md, in the commit that made it, under a "Departures while building" section, numbered B1 onward. Check: the reviewer finds no departure unrecorded (feat/011-alert-message-design)
- [x] T046 [P] Re-read spec 000's "(spec 011)" passages (T003, T016, T031) against the code as built, and fix any that drifted. Check: the reviewer's compliance pass finds none (FR-049) (feat/011-alert-message-design)
- [ ] T047 Run, on dev-cpu: `make up ENV=dev-cpu`; `make breach-test ENV=dev-cpu`, with step 12; and `make operator-alert-samples ENV=dev-cpu REASON="spec eleven sample check"`, each reason written without the word "ENV" or an option beginning `--s`, which the bash gate reads as a stack (plan §11, R-12). Check: every step passes, the existing stand-in assertions unchanged and the new form checks passing; the stand-in accepted every designed message; the note holds the runs (SC-002, SC-006, SC-012; FR-053) (feat/011-alert-message-design)
- [ ] T048 Review `feat/011-alert-message-design` with the reviewer agent (`.claude/agents/reviewer.md`) in a session that wrote none of it: every pass `REVIEW.md` holds, over the branch's diff from its base (the cherry-picked documents and spec 010's commits apart), each finding tagged with its pass and severity, the renderers' escaping, allowlist, and canary tests read with the security pass; the implementing session fixes blockers test-first, and the reviewer re-reads each fix. Check: the verdict, for T049's note (feat/011-alert-message-design)
- [ ] T049 Write `docs/merge-requests/<date>-feat-011-alert-message-design.md`: what changed and why; the acceptance criteria; the constitution check; the cost and the data-flow impact (A1, A2, S12, S13); the RED and GREEN runs of Phases 2 to 7; the golden HTML files' sizes beside 32 KiB, and the render benchmark beside 5 ms; the lockfile's diff, empty (FR-052); the review; the backlog (analyze finding A13); For the Author, in plan §13's order, each command a short line (at most 70 characters, variables and a separate guard); `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s from a fresh export of the tip; and a rehearsal of the merge into `main`'s current tip after `feat/010-anthropic-provider`. Check: the note is committed on the branch (feat/011-alert-message-design)
- [ ] T050 If `feat/010-anthropic-provider` gained commits, or merged, while this branch was built, first record in the note this branch's tip as `feat/011-alert-message-design was <sha>`, then rebase onto that branch's new tip or onto `refs/heads/main`; if spec 010's alert texts changed, regenerate the golden files with `-u` in a follow-up commit and name the cases in the note; re-run `make check ENGINE_MODE=none-yet` and append its whole output (plan §14, R-5). Check: every gate passes on the rebased tip (feat/011-alert-message-design)
- [ ] T051 Author, optional: apply P-A (plan §11, §13), the new rows' IDs in `tools/gates/matrix-required.txt`, written by the branch as `docs/merge-requests/<date>-feat-011-pa-matrix-rows.patch` from a plain copy of `main`'s file. Check: the matrix's required-row check lists them (main)
- [ ] T052 Author: after spec 010's own steps that come before its gate (its patches, by its tasks), gate `feat/011-alert-message-design` from main's checkout with `tools/gates/gate feat/011-alert-message-design`, and merge it with the guarded command its note gives. It stacks on `feat/010-anthropic-provider` with this spec's documents at its base, so one gate and one merge bring in spec 010 and spec 011 together: the group pattern, his answer at T000. If spec 010 must merge alone first, gate this branch after it. Check: `refs/heads/main` holds the branch's tip (main)
- [ ] T053 Author: `make up ENV=prod`, which applies migration 0006 and starts the gateway at the merge; then `make operator-alert-samples ENV=prod REASON="…"`; read every sample on his phone's Telegram and in his phone's and his desktop's mail clients, in light and dark themes; and record, for each entry, whether its severity, headline, and next step read within a second, naming those that don't. Check: SC-010's reading in a follow-up note; each "doesn't" becomes a change through an intent (the Author's terminal)
- [ ] T054 Author: accept the ADR or leave it proposed; add `formats` to `config/alerts.yaml` only if he wants a channel kept plain (FR-031). Check: `validate-config` passes; prod starts (main)

---

## Dependencies & Execution Order

### Phase dependencies

- **T000** gates everything.
- **Setup (Phase 1)**: T001 first; T002 to T004 in parallel after it.
- **Foundational (Phase 2)**: after Setup; its tests T005 to T011 in parallel, each RED before its implementation; T012 and T013 first, then T014 (it reads the facts and the columns), then T015 and T016.
- **User Story 1 (Phase 3)**: after Foundational; tests T017 to T020 in parallel; T021 before T022; T023 and T024 in parallel with them.
- **User Story 2 (Phase 4)**: after Foundational and T021 (the palette); its tests in parallel; T028 last.
- **User Story 3 (Phase 5)**: after Phases 3 and 4, since its end-to-end cases use the real renderers.
- **User Story 4 (Phase 6)**: after Phases 3 and 4 (a sample is rendered by both designs); its tests in parallel; T038 before T039; T040 and T041 after T039.
- **User Story 5 (Phase 7)**: after Phases 3 and 4.
- **Polish (Phase 8)**: T044 to T047 after every story; T048 after T047; T049 after T048; T050 whenever spec 010's branch moves; T051 any time after the merge; T052 after T049 and spec 010's steps before its gate; T053 after T052; T054 after T052.

### Within each phase

- Tests first, RED for the stated reason, then the implementation that turns them GREEN.
- A file two tasks of one phase touch belongs to the earlier task, and the later one waits for it.
- Commit after each task or logical group, before any pause.

## Parallel Examples

```text
Phase 1, after T001:   T002 (the ADR) | T003 (spec 000's contracts) | T004 (.prettierignore)
Phase 2, the tests:    T005 | T006 | T007 | T008 | T009 | T010 | T011
Phase 3, the tests:    T017 | T018 | T019 | T020
Phase 6, the tests:    T033 | T034 | T035 | T036 | T037
Phases 5 and 7:        T029 to T032 in one worktree | T042 and T043 in another, after Phases 3 and 4
```

## Implementation Strategy

### MVP first (Phases 1 to 3)

1. Setup, then the foundation: every fallback and record before any design (Principle I).
2. User Story 1: Telegram designed. **Stop and validate**: SC-002 and SC-004 on the test stack; email still plain.

### Incremental delivery

1. User Story 2, the email.
2. User Story 3's end-to-end proof, the panel, and the runbook.
3. User Story 4's samples, and User Story 5's coverage of spec 010.
4. Polish, the dev-cpu run, the review, the note, and the merge; then the Author's samples on prod.

### If a session ends early

Commit, and write the note for the phases done; the next phases continue on `feat/011-alert-message-design-2` from the tip, merging after it (the stacked-branch pattern of the earlier specs).

## Notes

- Nothing on this branch sends to the Author's real channels: every test runs against in-process stubs or dev-cpu's stand-ins; only the Author's T053 sends samples to his phone.
- The design goes live at the Author's first `make up ENV=prod` after the merge; rows queued before it go plain.
- Each departure from plan.md updates plan.md in the same commit.
- Agents never edit a test file, golden files included, during a fix task; they fix the code.
