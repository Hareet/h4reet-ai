---

description: "Task list for spec 002, The Room"
---

# Tasks: The Room — the Author's Work Area, Where the Twin Hands Visitors the Resume

**Input**: the design documents in `specs/002-the-room/`: plan.md, research.md, data-model.md, contracts/ (six), quickstart.md.

**Prerequisites**: the clarified spec (2026-10-18) and the plan, under the Author's direction of 2026-10-17 to create the tasks and implement them, revisiting any decision later.

**Tests**: required. The constitution's workflow writes tests with or before code. In each phase, the test tasks come first and must fail before the code that makes them pass; each note records that RED run.

**Organization**:
- One phase per task group of plan §13, each one feature branch stacked on the one before, merged by the Author in order.
- Phases 1–6 are implementable now. Phases 7–10 wait on named dependencies, and their tasks are written so they can start the day the dependency lands.
- Each phase's last task is its merge-request note, with `make check`'s whole output and a reviewer agent's REVIEW.md passes.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task).
- **[USn]**: the user story the task serves.
- **Author**: only the Author runs it, in their own terminal.
- **Patch**: a change to a human-only path, written into a patch file under `docs/merge-requests/`, verified in a scratch worktree, and applied by the Author.
- **Waits**: the task can't start until the named dependency exists.

## Path conventions

- The room: `apps/web/` (`src/`, `content/`, `build/`, `test/`, `fonts/`).
- The gateway: `services/gateway/`. Compose and edge: `deploy/`.
- "§" means plan.md unless another file is named.

---

## Phase 1: Serving the room — branch `feat/002-web`

**Purpose**: the workspace, the `web` image, and the stack's x005 listener, so every later phase has a place to run (FR-059).

**Independent test**: quickstart §1.

### Tests (first)

- [X] T001 [P] `deploy/scripts/test_web_image.py`: `web_image.py` tags prod's build `h4reet-web:<ref>` with no drafts and dev's and dev-cpu's `h4reet-web:<ref>-drafts` with `ROOM_DRAFTS=1`; refuses a prod build with drafts; rebuilds on every run and never reuses a tag, unlike `gateway_image.py`; reads `main`'s `assets/policy/content-approvals.json` and `resume-header.json` on the host with `git cat-file blob refs/heads/main:<path>` (never a bare `main`, which a tag could answer) and passes them as the named build context `policy` (a missing file passed as absent); and refuses another engine for dev-cpu, as `test_gateway_image.py` does, per contracts/web-serving.md §1
- [X] T002 [P] `deploy/scripts/test_edge_site.py`: the edge config has listener 8087 with `/` to `web:8080` (GET and HEAD only), `= /api/room/events` to the gateway (POST, `limit_req`, 512-byte cap), `/api/` 404, and the 503 page; compose publishes it at `127.0.0.1:${H4_SITE_PORT}` only, per contracts/web-serving.md §2
- [X] T003 [P] Preflight and template tests in `deploy/scripts/test_preflight.py`: `H4_SITE_PORT` is required, fixed per stack (18005, 18105, 18305), and checked free; `H4_WEB_SUFFIX` is empty on `H4_ENV=prod` and `-drafts` on `H4_ENV=dev`, and anything else is refused, per contracts/web-serving.md §4
- [X] T004 [P] `apps/web/test/smoke.test.ts`: the built `index.html` loads its scripts from relative paths only and contains the AI disclosure and the PDF link

### Implementation

- [X] T005 Add `"apps/*"` to the root `package.json`'s `workspaces`; create `apps/web/` (`package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.ts`) on the repository's TypeScript, ESLint, and Prettier setup; pin `three`, `jsdom`, and `axe-core` from the npm registry in the lockfile, per research.md R-01–R-03
- [X] T006 `apps/web/Dockerfile` (a build stage on spec 000's pinned Node base that reads the policy only from the named context `policy` and runs no git; a runtime stage on its pinned `nginx-unprivileged`, the §3 headers in the image's nginx config with `microphone=()`, a `/healthz` file) and `deploy/scripts/web_image.py` (the variant tag, the host-side policy read, the rebuild on every run), per contracts/web-serving.md §1 and §3
- [X] T007 `deploy/compose.yaml`: the `web` service (`image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}`, `pull_policy: never`, internal only, read-only, the limits) and `edge`'s sixth publication (x005); `deploy/edge/nginx.conf`'s listener 8087, per contracts/web-serving.md §2
- [X] T008 `H4_SITE_PORT` and `H4_WEB_SUFFIX` in `deploy/env.example/{prod,dev}.env.example` and `deploy/env.agents/dev-cpu.vars`; `deploy/scripts/preflight.py`'s checks of both; `make up` calls `web_image.py` after `gateway_image.py`; `make build` builds the web image on the agents' engine; **Patch** for `tools/gates/compose_policy.py`: `SHARED_IMAGES` gains `"web": "h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}"` (its port rule already allows a 127.0.0.1 publication on `edge`, so x005 needs nothing there), per contracts/web-serving.md §4
- [X] T009 Disclosure row V1, for the room's static files, local only until spec 001, in a new "Spec 002" section of `docs/data-flow-disclosure.md`, per plan §8 and FR-058
- [X] T010 `apps/web/build/disclosure.ts`: render `docs/data-flow-disclosure.md` into `dist/disclosure/index.html` at build, linked from the choice screen and the room's toolbar, with a test that the page's rows equal the Markdown's (this is spec 001's planned disclosure page, built here first), per FR-004 and FR-058
- [X] T011 [P] ADR 0033, "The room's stack: `apps/web`, Vite, Three.js, no framework", with its index line in `docs/adr/README.md`, per research.md R-15
- [X] T012 [P] `apps/web/README.md`: the workspace, the build, the content files, drafts and approvals, the local URL per stack
- [X] T013 Merge-request note `docs/merge-requests/<date>-feat-002-web.md`, with the compose policy patch's verification, `make check`, and the reviewer's passes

---

## Phase 2: Approvals — branch `feat/002-approvals`

**Purpose**: human-only files of approved hashes and of the PDF's header, protected before the first draft they govern, and the gate's own check of what a build publishes (plan §3; research.md R-08, R-16).

- [X] T014 [P] `apps/web/test/approvals.test.ts`: a content file is approved only when the policy directory's copy of `assets/policy/content-approvals.json` (filled from `main`, never the branch) lists its current SHA-256; an edit makes it a draft; an empty policy directory makes every file a draft and gives the PDF the room's header; drafts are left out without `ROOM_DRAFTS=1`, and bannered with it; `build/policy.ts` fills the directory with `git cat-file blob refs/heads/main:<path>` in a checkout, and a tag named `main` changes nothing, per contracts/resume-source.md §5
- [X] T015 [P] Matrix rows in `redteam/forbidden-actions.sh`: Edit and Write of `assets/policy/content-approvals.json` and `assets/policy/resume-header.json` refused; a bash write of either refused, per spec 000's FR-008 pattern
- [X] T016 **Patch** `docs/merge-requests/<date>-feat-002-approvals.patch`: create `assets/policy/content-approvals.json` (`schema: 1`, empty `approvals`) and `assets/policy/resume-header.json` (`schema: 1`, `full_name` and `contact` null); add both to `.claude/hooks/protected-paths.sh` and `.claude/settings.json`'s `denyWrite` and `Edit(...)` denies; the row IDs in `tools/gates/matrix-required.txt`, per contracts/resume-source.md §5
- [X] T017 `apps/web/build/approvals.ts` and `build/policy.ts`: read the approvals and the PDF header from the policy directory (the named context `policy` in the image, `build/policy.ts`'s `git cat-file blob refs/heads/main:` in a checkout), mark each content file approved or draft; the build itself never runs git inside the image, per data-model.md §4 and contracts/resume-source.md §5
- [X] T080 **Patch**, in the same patch file: `tools/gates/content_check.py` and `tools/gates/test/test_content_check.py`, and its step in `tools/gates/gate` and `make check`'s runner list: after a build without drafts, read `main`'s approvals file itself by `refs/heads/main`, recompute each content file's SHA-256 from the tree, and fail when `room-data.json`'s `published` claims a file `main` doesn't approve, or when an unapproved file's text appears in `dist/` whatever `room-data.json` says; tests first, against fixture builds whose agent-editable code marks a draft approved, or lists a draft and renders it anyway, per contracts/resume-source.md §5 and research.md R-08
- [X] T018 [P] ADR 0034, "Content approvals by hash, in a human-only file read from `main`", beside spec 003's likeness approvals, per research.md R-08
- [ ] T019 **Author**: apply the patch; `claude doctor`; `make git-hooks`, per quickstart §2
- [X] T020 Merge-request note `docs/merge-requests/<date>-feat-002-approvals.md`

---

## Phase 3: The resume (User Story 1, Priority P1) — branch `feat/002-us1-resume`

**Goal**: the resume source, its citation check, its lock, the interactive resume, and the PDF.

**Independent test**: quickstart §3; SC-002.

### Tests for User Story 1 (first)

- [X] T021 [P] [US1] `apps/web/test/content/citations.test.ts` with fixture corpora under `apps/web/test/fixtures/corpus/`: one failing case per rule C1–C9, including a quote in a span whose own tag is insufficient on a line where another sentence's tag is sufficient (C3, C4), and display text holding a "Do not claim" phrase, the surname, and a fixture private-denylist phrase, the last reported by source line without the phrase (C9); a clean source passing, per contracts/resume-source.md §2
- [X] T022 [P] [US1] `apps/web/test/content/slots.test.ts`: a filled, public-safe slot renders its phrasing; an empty one renders its fallback or nothing; no estimate, per contracts/resume-source.md §2
- [X] T023 [P] [US1] `apps/web/test/lock.test.ts`: a changed cited file fails with its path; an uncited change doesn't, per contracts/resume-source.md §3 and FR-016
- [X] T024 [P] [US1] `apps/web/test/pdf.test.ts`: the extracted text (pdf.js, pinned) holds each item's filled text once, in order; the catalog has `MarkInfo/Marked`, a `StructTreeRoot`, `Lang en-US`, and `DisplayDocTitle`; `Info` holds only `Title` and `Author`, with no `CreationDate`, `ModDate`, `Producer`, or `Creator`, and the file has no XMP metadata stream (no `xmp:CreatorTool`, no `pdf:Producer`); the same source and policy build the same bytes; the header follows FR-017's rule from the policy directory's `resume-header.json`, per contracts/resume-source.md §4
- [X] T025 [P] [US1] `apps/web/test/ui/resume.test.ts` (jsdom, axe-core): the interactive resume's items are buttons in a list; "Download (PDF)" links the built file; the choice screen's PDF link works without entering the room; 0 axe violations, per FR-010 and FR-018

### Implementation for User Story 1

- [X] T026 [US1] `apps/web/build/content.ts`: parse `resume.yaml` with the `yaml` package, run C1–C9 (the forbidden list shared with narration's N3), fill slots, write `room-data.json`'s resume part and the lock, per contracts/resume-source.md §1–§4
- [X] T027 [US1] `apps/web/build/pdf.ts` with PDFKit (pinned from the npm registry): the tagged structure, the vendored font, `Title` and `Author` only, with PDFKit's default producer, creator, and creation date overridden and no XMP stream, per contracts/resume-source.md §4 and research.md R-06
- [X] T028 [P] [US1] `apps/web/fonts/`: one open-licensed font (its license file beside it), pinned by SHA-256 in a `fonts.lock`, used by both the site's CSS and the PDF
- [X] T029 [US1] `apps/web/src/resume/`: the interactive resume view, opened from the room's "Resume" and closed with Escape, focus returning to the button, per contracts/room-scene.md §1
- [X] T030 [US1] The first draft of `apps/web/content/resume.yaml`, from the corpus's "Role at a glance" and topic sections, every item cited, no number outside a slot, no forbidden phrase; filed with any facts slots its items need, unfilled, in `corpus/proposals/resume-<date>.md`, per contracts/resume-source.md §6 (agents never edit `corpus/` outside `proposals/`; the PDF's header isn't proposed there: it's `assets/policy/resume-header.json`, the Author's)
- [X] T031 [US1] `make test` runs the content check and the lock; `npm run content:lock -w apps/web` rewrites the lock, per FR-016
- [ ] T032 [US1] **Author**: read the proposal and the draft; approve by hash when satisfied; optionally fill `full_name` and `contact` in `assets/policy/resume-header.json` on `main`, per quickstart §3
- [X] T033 [US1] Merge-request note `docs/merge-requests/<date>-feat-002-us1-resume.md`

**Checkpoint**: the PDF exists, cited and checked, whatever the state of the local tier.

---

## Phase 4: The room (User Stories 2 and 5, Priority P1 and P2) — branch `feat/002-us2-room`

**Goal**: the choice, the scene with placeholders, the hand-off, the 2D mode, the quality controller, the accessible layer, and the fixed messages for every conversation surface.

**Independent test**: quickstart §4; SC-001, SC-003, SC-004, SC-005, SC-012.

### Tests for User Stories 2 and 5 (first)

- [X] T034 [P] [US2] `apps/web/test/ui/choice.test.ts`: nothing plays until both path and avatar are chosen; "Enter" is disabled until then; the four placeholder avatars; the disclosures and links present; no storage API is called (spies on `document.cookie`, `localStorage`, `sessionStorage`, `indexedDB`, `history`), per FR-001–FR-004
- [X] T035 [P] [US2] `apps/web/test/ui/handoff.test.ts` with a fake clock: at most 4.5 s (1 s under reduced motion; three 1.5 s frames in 2D); no control skips it; the live-region line; focus on "Read the resume now" at its end; "later" keeps the "Resume" button, per contracts/room-scene.md §3
- [X] T036 [P] [US5] `apps/web/test/room/quality.test.ts` with a simulated frame clock: steps 0 → 3 below the target, 2D below 24 frames a second at 3, never back up, one `mode_2d` event, per contracts/room-scene.md §4
- [X] T037 [P] [US5] `apps/web/test/ui/a11y.test.ts` (jsdom, axe-core): the tab order, visible focus, the canvas `aria-hidden`, the "In the room" list as the objects' equivalent, 44-pixel targets in the CSS, 0 axe violations on every screen, per contracts/room-scene.md §5
- [X] T038 [P] [US2] `apps/web/test/ui/talk.test.ts`: each object answers `topic_not_ready`; the text box answers `cannot_talk.unavailable`; the talk button announces `voice_unavailable` and moves focus without asking for the microphone; no request leaves but the events beacon, per contracts/room-conversation.md §3 and research.md R-14
- [X] T039 [P] [US2] `apps/web/test/room/objects.test.ts`: a raycast hit, a touch, and a list button each call `selectObject` with the same ID, per contracts/room-scene.md §2

### Implementation for User Stories 2 and 5

- [X] T040 [US2] `apps/web/src/choice/`: the choice screen and the visit object, per data-model.md §9
- [X] T041 [US2] `apps/web/src/room/scene.ts` and `objects.ts`: the Three.js scene with labeled placeholder geometry (the desk, laptop and screen, snowboard left, bicycle right, the window with artwork and its fence-and-tree view), the twin's figure, the visitor's placeholder avatar, raycasting; the 3D code in its own chunk loaded after the choice, per contracts/room-scene.md §2 and research.md R-11
- [X] T042 [US2] `apps/web/src/room/handoff.ts`, per contracts/room-scene.md §3
- [X] T043 [US5] `apps/web/src/room/quality.ts` and `flat.ts`: the controller, the WebGL 2 check before the 3D chunk, the 2D drawing with its buttons, the "2D view" control, context-loss handling, per contracts/room-scene.md §4
- [X] T044 [US5] `apps/web/src/room/a11y.ts` and the layout's CSS: the list, the live regions, focus, portrait framing from 320 pixels, per contracts/room-scene.md §5–§6
- [X] T045 [US2] `apps/web/src/talk/` and `apps/web/content/messages.yaml`: the text box, "Send", the talk button, and the fixed messages, per data-model.md §7 and contracts/room-conversation.md §3
- [X] T046 [US2] `room-manifest.json` from `apps/web/build/manifest.ts`: objects with `ready: false`, items, avatars, `placeholders: true`, event kinds; and `config/room-events.yaml` from the same source (kinds, object IDs, item IDs), committed, with `make test` failing when it's stale, per data-model.md §5 and contracts/room-events.md §3
- [ ] T048 [US2] **Author**: quickstart §4: the visit, reload, the floor with the model server stopped (SC-001), the keyboard and screen-reader visits (SC-003), the phone and laptop frame rates (SC-004), 4G emulation (SC-005), the network log (SC-012)
- [X] T049 [US2] Merge-request note `docs/merge-requests/<date>-feat-002-us2-room.md`

**Checkpoint**: the room works end to end on its floor, with no model.

---

## Phase 5: Narration (User Story 3, Priority P2) — branch `feat/002-us3-narration`

**Goal**: one prepared, cited, checked script per item and path, shown at a speaking rate.

**Independent test**: quickstart §5; SC-006.

- [X] T050 [P] [US3] `apps/web/test/content/narration.test.ts`: N1–N4 on fixtures; one script per item and path required; the forbidden list assembled from fixture "Do not claim" sections; the surname rule, per contracts/narration.md §2
- [X] T051 [P] [US3] `apps/web/test/ui/narration.test.ts` with a fake clock: the first word within 1 s, 160 words a minute, the whole text in the live region, a new selection stopping the old, drafts hidden without `ROOM_DRAFTS=1`, per contracts/narration.md §4
- [X] T052 [US3] Extend `apps/web/build/content.ts` with the scripts' checks, their place in `room-data.json`, and the eval cases written to `evals/narration/cases/narration-<item>-<path>.yaml` (N5) with only public "Do not claim" phrases in `expect.not_contains`; `make evals` runs `--suite narration --adapter fake`, and `evals/run.py` refuses `--suite narration` with any other adapter, per contracts/narration.md §2
- [X] T053 [US3] `apps/web/src/narration/`: the display, per contracts/narration.md §4
- [X] T054 [US3] Draft one script per item and path, cited, from the corpus, filed in `corpus/proposals/narration-<date>.md` for the Author, per contracts/narration.md §1
- [ ] T055 [US3] **Author**: read and approve the scripts by hash, per quickstart §5
- [X] T056 [US3] Merge-request note `docs/merge-requests/<date>-feat-002-us3-narration.md`

---

## Phase 6: Usage events and the dashboard (User Story 6, Priority P2) — branch `feat/002-us6-events`

**Goal**: counted use with no visitor data, and the "Room" row.

**Independent test**: quickstart §6.

- [ ] T057 [P] [US6] `apps/web/test/events.test.ts`: each kind's body is `{kind}` or `{kind, id}` alone; a refused beacon isn't retried or stored, per contracts/room-events.md §1
- [ ] T058 [P] [US6] `services/gateway/test/integration/room-events.test.ts`: the content types, shape, kind, and ID checks, with each refusal counted; the counter's labels; no body in any log or span; no admission or meter row; a missing manifest leaves the gateway starting and every event 400, per contracts/room-events.md §3
- [ ] T059 [US6] `services/gateway/src/routes/room-events.ts` and its registration, reading `config/room-events.yaml` from its mounted `config/` at start (a missing or invalid file: every event 400, the gateway still starting); `h4.room.events` and `h4.room.events.refused` in `src/telemetry/metrics.ts`; the names added to spec 000's contracts/telemetry.md, per contracts/room-events.md §3–§4
- [ ] T060 [US6] `apps/web/src/events.ts`: the beacon for each kind, per contracts/room-events.md §1
- [ ] T061 [US6] The "Room" row in `deploy/grafana/dashboards/h4-runtime.json` (the panels built now), with `deploy/scripts/test_dashboard.py` cases, per contracts/room-events.md §4
- [ ] T062 [US6] Disclosure row V4, per plan §8
- [ ] T063 [US6] **Author**: quickstart §6
- [ ] T064 [US6] Merge-request note `docs/merge-requests/<date>-feat-002-us6-events.md`

---

## Phase 7: Conversations (User Story 4, Priority P2) — branch `feat/002-us4-conversations` — **Waits** for a spec of the twin's conversation core

- [ ] T065 [US4] **Waits** The room's turn client: `POST /api/room/turn` per contracts/room-conversation.md §2, the conversation panel's history, the stop on selection (FR-024), the text-and-mute display (FR-025)
- [ ] T066 [US4] **Waits** Readiness from the twin's spec into `room-manifest.json`; the fixed messages by cause class, per contracts/room-conversation.md §1 and §3
- [ ] T067 [US4] **Waits** The step configuration: each step's model and fallback (the twin's conversation, speech recognition, the twin's voice) named in configuration per environment by an environment variable, used from the next start with no source change, and the stack refusing a non-local adapter for recognition or voice; with SC-014's proof (switch the conversation's model in dev, 0 source files changed, the evals unchanged), per FR-033, FR-034
- [ ] T068 [US4] **Waits** **Patch** `config/budgets.yaml`: the room's per-turn input limits and the schema's raised input cap, by the Author's hand with an ADR, the paid calls counted on prod's existing ceilings and sub-budget with no budget of their own, per FR-036, FR-037 and data-model.md §6
- [ ] T069 [US4] **Waits** The edge's `/api/room/turn` location, and the "Room" row's cost, latency, and degraded panels, per contracts/room-events.md §4
- [ ] T070 [US4] **Waits** Disclosure row V2 and the change to F1, per the spec's Data-Flow Disclosure Entries
- [ ] T047 [P] [US4] **Waits** `redteam/cases/room-*.yaml`: locating the Author from the room, the window's view, or travel stories; instructions injected through typed text and transcripts; pressing for a "Do not claim" item, per FR-050. Moved here from Phase 4: `redteam/run.py` needs a `response` and an existing detector for each case, so cases filed before the turn endpoint exists would make `make redteam-suite` exit 2
- [ ] T081 [US4] **Waits** SC-007's first half: with the local tier up, the twin's answer begins to appear within 3 s of the visitor's turn for 95% of turns, measured over a scripted run of at least 100 turns from send to the first painted word, recorded in quickstart's runs
- [ ] T071 [US4] **Waits** Merge-request note

## Phase 8: Push-to-talk (User Story 7, Priority P3) — branch `feat/002-us7-push-to-talk` — **Waits** for the twin's spec and a local recognizer

- [ ] T072 [US7] **Waits** ADR 0035 on recognition's location: the reading of intent 000's sentence (Q2's answer), per research.md R-15
- [ ] T073 [US7] **Waits** Capture (held button or key, 30 s, stop on hidden), the recognition call, the transcript, the empty-transcript message, per contracts/room-conversation.md §4 and FR-026–FR-029
- [ ] T074 [US7] **Waits** The local recognition route, through the gateway: the kill switch read first (FR-035), a local adapter only, each call recording its provider, model, audio seconds, latency, routing decision, estimated cost, and room feature (FR-032); no audio stored, logged, traced, or forwarded, and its proof (SC-011), per FR-030, FR-031 and contracts/room-conversation.md §4
- [ ] T082 [US7] **Waits** SC-007's second half: the transcript of an utterance of up to 15 s appears within 2 s of release for 95% of utterances, measured over at least 100 recorded utterances, recorded in quickstart's runs
- [ ] T075 [US7] **Waits** Disclosure row V3; merge-request note

## Phase 9: The voice — branch `feat/002-voice` — **Waits** for ADR 0011 and the cloned voice

- [ ] T076 [US3] **Waits** Voiced narration files and their word timings, the "Voice" toggle, per contracts/narration.md §4
- [ ] T077 [US4] **Waits** The twin's voice in conversations, through the gateway: the kill switch read first (FR-035), a local adapter only, each call recording its provider, model, characters and audio seconds, latency, routing decision, estimated cost, and room feature (FR-032); its degraded text; disclosure row V5; merge-request note, per contracts/room-conversation.md §5

## Phase 10: Real assets and the public — branch `feat/002-public` — **Waits** for spec 003's intake and spec 001's edge

- [ ] T078 [US2] **Waits** Replace the placeholders with spec 003's arrived assets through its loader; `placeholders: false`, per FR-005, FR-006, FR-051–FR-053
- [ ] T079 [US2] **Waits** Public serving through spec 001's edge and relay; spec 001's `make release` refusing drafts and placeholders; SC-008's moderated test; merge-request note

---

## Dependencies & Execution Order

- **Phases 1 → 6 in order.** Phase 2's patch lands before Phase 3 commits the first draft. Phase 3 before Phase 5, which narrates its items. Phase 4 can follow Phase 3 or run beside it; it reads `room-data.json`'s shape, not its content.
- **Phases 7–10** start when their dependency exists, in any order among themselves.
- **Within a phase:** tests first, then code, then the Author's task, then the note.

## Parallel opportunities

- **Phase 1:** T001–T004 together; T011 and T012 beside the code.
- **Phase 3:** T021–T025 together; T028 beside T026 and T027.
- **Phase 4:** T034–T039 together; then T041–T044 in sequence (one scene), with T045 beside them.

## Implementation strategy

- **MVP:** Phases 1–3, the PDF first, as the intent's answer 7 asks. Validate with quickstart §3.
- **Then** the room's floor (Phase 4), the guided resume (Phase 5), and the counts (Phase 6). Each is a complete, reviewable increment, and none needs a model.
