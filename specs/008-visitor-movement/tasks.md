---

description: "Task list for spec 008, Visitor Movement and Target Highlighting"
---

# Tasks: Visitor Movement and Target Highlighting

**Input**: the documents in `specs/008-visitor-movement/`: spec.md (FR-001 to FR-059, SC-001 to SC-014, Amendments M1 to M14), plan.md (decisions R-01 to R-15, §3's data and interfaces, §4's branches and lanes, §5's tests and the Author's runs L1 to L3).

**Prerequisites**: the Author accepts the intent and approves the spec and the plan (T000). Until then no task below starts: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`." The spec's answers Q1 to Q5 and defaults D1 to D8 were taken provisionally under the Author's "Keep going!" (2026-11-07); a no to any of them changes the FRs it names, and the tasks that build them, before those tasks start.

**Tests**: required. The constitution's workflow writes tests with or before code. In each phase the test tasks come first and must fail (RED) before the code that makes them pass (GREEN); each branch's note records both runs. Every check runs inside `make test`.

**Organization**:
- **Two stacked branches** (plan §4.1). `feat/008-visitor-movement` holds Phase 1 and lands first; `feat/008-walking`, from its tip, holds Phases 2 to 8. Both stack on line R's User Story 9 tip, f9524081, and merge only after line R's stack has merged, in order.
- **The phases**: 1, the target and its highlight on today's camera (User Story 1, with User Story 6's checks for targeting; the MVP); 2, the walking foundation; 3, walking on the desktop (User Story 2); 4, by touch (User Story 3); 5, accessibility and reduced motion (User Story 4); 6, the 2D room (User Story 5); 7, the rest of the degraded mode (User Story 6); 8, polish.
- **Parallel lanes** (plan §4.2): tasks marked [P] touch files no unfinished task of their phase touches, so agents can take them in worktrees of their own, one per agent that writes, the commits cherry-picked onto the phase's branch in task order. Agents never merge.
- **Each branch ends** with a review by an agent that wrote none of it, then a merge-request note, `docs/merge-requests/<date>-<branch, slashes as dashes>.md`, in spec 002's notes' form, holding `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s.

## Format: `[ID] [P?] [Story?] Description (branch)`

- **[P]**: can run in parallel with the other [P] tasks of its group.
- **[USn]**: the user story of a story phase.
- **"Author:"** opens a task only the Author does, in his own terminal, on his devices, or on `main`. Agents never do these steps.
- **Check** ends each task: what proves it done.
- **The branch** ends each task.

## Path conventions

- The room's workspace is `apps/web/`: data in `room/`, the compositor in `build/room/`, the shared kernel in `src/room/compose/`, the walking runtime's pure modules in `src/room/walk/`, the 3D runtime in `src/room/scene/`, the lookdev page in `src/lookdev/`, and tests in `test/room/` (Node), `test/ui/` (jsdom), and `test/lookdev/`.
- "R-nn" is plan.md §1's decision; "§" is plan.md's section; "L1" to "L3" are plan.md §5.3's runs.

---

## Before any phase

- [ ] T000 Author: accept or close the intent (`specs/008-visitor-movement/intent.md`); answer Q1 to Q5 and D1 to D8, or let the provisional answers stand; approve spec.md and plan.md; gate and merge `spec/008-visitor-movement` (documents only) with `tools/gates/gate spec/008-visitor-movement` from main's checkout and the merge command it prints. Check: the intent's Status line reads accepted, and the Author's answers are recorded in the spec's Clarifications in his words (main)

---

## Phase 1: The Target and Its Highlight on Today's Camera (User Story 1, P1, with User Story 6's checks for targeting, and User Story 5's 2D highlight) 🎯 MVP

**Goal**: the target, from hover, press, and list focus, shows its two-tone border at the production framing, and in the 2D room in place of its dashed cue; a selection clears it; nothing new is sent. (Phase 1's review moved the 2D highlight, T064 to T066, in from Phase 6: FR-003 asks the 2D room to highlight targets from the first target on.)

**Independent Test**: spec.md User Story 1's.

### Setup

- [X] T001 Make the worktree: `git worktree add -b feat/008-visitor-movement <new folder> f9524081`; then `npm ci --ignore-scripts --cache "$TMPDIR/npm"` in it. Commit before any pause, since `/tmp` is wiped when WSL restarts. Check: `git -C <folder> rev-parse HEAD` prints f9524081bb57c6fa07bbb26bf58a9fa135505d7c and `git -C <folder> status --short` prints nothing (feat/008-visitor-movement) **Done:** the worktree `/tmp/claude-1000/wt-feat008`, cut from `spec/008-visitor-movement`'s tip, b95fd761, not f9524081, which line R's restack replaced (plan.md §10, "The base"); then `npm ci --ignore-scripts --cache "$TMPDIR/npm-cache-feat008"`.
- [X] T002 Cherry-pick `spec/008-visitor-movement`'s commits, oldest first, so `specs/008-visitor-movement/plan.md` is in the branch's tree and a departure updates it in the same commit; resolve a conflict in an index file by keeping both sides' lines, never by changing a document's words. Check: the four documents are in the tree, byte-identical to the spec branch's (feat/008-visitor-movement) **Done:** nothing to pick: cut from the spec branch's tip, the branch holds the four documents, byte-identical to the spec branch's (plan.md §10, "The base").

### Tests for User Story 1 (first, RED)

- [X] T003 [P] [US1] Write `apps/web/test/room/target.test.ts` (FR-007, FR-012, FR-013; R-06; SC-001): a table of event sequences over the reducer, each row its expected target after every step: a name from each input sets the target; the latest input wins; a null clears only its own input's target (a pointer leaving the stage leaves a focus target); `select` clears the target and consumes its ID; a name of the consumed ID is ignored until a name of another ID or of null; `reset` clears all. Check: RED, the module missing (feat/008-visitor-movement) **Done:** 88504be.
- [X] T004 [P] [US1] Write `apps/web/test/room/highlight.test.ts`, Node, three's objects and no renderer, the room built with `buildRoom` from the repository's bundle (FR-014, FR-015, FR-017 to FR-019, FR-049; R-07; SC-002): the laptop's target draws its three members' meshes and not the neon sign's or the charger's plug's; no target draws nothing; a member's model swapped in, and back to its stand-in, is followed; with a spy renderer, two passes in order, edge then band, their thicknesses from the look's highlight in CSS pixels at the stage's height (`outlineThickness`), at quality levels 0 to 3 and in the inked-cel, painted, and flat looks; the passes appear on the first frame after the target is set. Check: RED (feat/008-visitor-movement) **Done:** 88504be, its tolerance corrected in 07671b6.
- [X] T005 [P] [US1] Extend `apps/web/test/room/schema.test.ts`, `compose.test.ts`, `report.test.ts`, and `data-only.test.ts` (FR-015, FR-016, FR-057, FR-058; plan §3.2, §3.5; SC-002, SC-006): a look's optional `highlight` with Q5's defaults, its ranges (RD3), and its colours by palette name or `#rrggbb` (RI4); RW2 refuses a fixture look whose band and edge both fall under 3:1 against one palette colour, naming rule, file, and path; the three repository looks pass RW2; the 3D part's `look.highlight` and the index's `flat.highlight` are written resolved; two builds stay byte-identical; changing the band's colour in a data copy passes with no source file changed; the report gives each look's lowest contrast. Check: RED (feat/008-visitor-movement) **Done:** 88504be, its RW2 example corrected in 07671b6, and `bundle.test.ts`'s shapes extended in 96094b8.
- [X] T006 [P] [US1] Extend `apps/web/test/room/objects.test.ts` (FR-008 (a), (b); R-10): a mouse or a hovering pen reports its pick on each move and null on leaving the surface; a touch reports nothing until it presses; a press reports its pick from its start until it ends, is cancelled, or moves beyond `TAP_SLOP_PX`, then null; a tap still selects once. Check: RED (feat/008-visitor-movement) **Done:** 88504be.
- [X] T007 [P] [US1] Write `apps/web/test/ui/highlight.test.ts`, jsdom with `test/helpers/room.ts`'s stand-in scene (FR-007 to FR-013, FR-040; SC-001): after the offer, a hover sets the stage's target and a move onto nothing clears it; a click sends one `object_selected` and clears the target in the same call, and the piece isn't targeted again until the pointer leaves and returns; a touch press targets until the lift selects, and a slide beyond the slop clears with nothing selected; keyboard focus on a list button targets its piece and focus moving on targets the next; a side-wall selectable held at the stage isn't targeted by a hover there but is by focus; during the hand-off and its offer nothing is targeted; the network and storage spies record nothing but `object_selected`. Check: RED (feat/008-visitor-movement) **Done:** 88504be, with the guard's case in 2c9e28f.
- [X] T008 [P] [US6] Extend `apps/web/test/ui/degraded.test.ts` (FR-001, FR-002, FR-004; SC-012): with the live source off, the tier unknown, and the stubbed kill switch `degraded`, targeting and the highlight behave as in T007; with the 2D drawing refused (`flat-failed`), no highlight is drawn and the list still selects every piece; the spies record no request for targeting. Check: RED where it depends on Phase 1's code (feat/008-visitor-movement) **Done:** 88504be.
- [X] T009 [P] [US1] Extend `apps/web/test/room/live.test.ts`, where the frame log is tested (FR-054): a drafts build's log records `target` entries with the ID and the input; a release build has no log. Check: RED (feat/008-visitor-movement) **Done:** 88504be.
- [X] T010 [P] [US1] Extend `apps/web/test/lookdev/page.test.ts` (FR-050's highlight sample): the lookdev page's control names a selectable and its stage draws the highlight on it; drafts builds only. Check: RED (feat/008-visitor-movement) **Done:** 88504be.
- [ ] T064 [P] [US5] Extend `apps/web/test/room/flat.test.ts` (FR-046; R-08; SC-011): each selectable's highlight group, two rectangles with `stroke` and `stroke-width` from the index and classes from code's constants, hidden until targeted; the target's group shows and its dashed cue hides; a held side-wall selectable's group shows on focus; the allowlist gains only the two classes; nothing focusable is added. Moved here from Phase 6 by Phase 1's review (finding 4). Check: RED (feat/008-visitor-movement)
- [ ] T065 [P] [US5] Extend `apps/web/test/ui/highlight.test.ts` (FR-040, FR-046, FR-047): in 2D, hover, press, and list focus highlight, and a selection clears; that no walking control shows in 2D is T045's, with the control. Moved here from Phase 6 by Phase 1's review (finding 4). Check: RED (feat/008-visitor-movement)

### Implementation for User Story 1

- [X] T011 [US1] After T012, since the compositor refuses a key its schema doesn't define (RD2) until T012's lands: write each look's `highlight` with Q5's defaults (band `#ffd23f`, 3 px; edge `ink`, 1.5 px) in `apps/web/room/looks/inked-cel.yaml`, `painted.yaml`, and `flat.yaml`, and the field in `apps/web/room/README.md`'s looks section. Check: `make test`'s compositor run accepts them, and T005's repository-looks case passes (feat/008-visitor-movement) **Done:** 235a4f6.
- [X] T012 [US1] Add the highlight to the compositor (R-07, plan §3.2, §3.5): `apps/web/build/room/schema.ts` (the optional `highlight`, defaults and ranges), `build/room/emit.ts` (resolved into the 3D part's `look` and the index's `flat.highlight`), `build/room/checks/rw.ts` (new: RW2), the family `RW` and its rule in `build/room/checks/family.ts`'s `FAMILIES` and `RULES`, `rw` last in `build/room/compose.ts`'s `FAMILY_ORDER`, `build/room/report.ts` (each look's lowest contrast), and `src/room/compose/bundle.ts`'s types. Check: T005 passes; the index stays under spec 004's 16 KB (feat/008-visitor-movement) **Done:** 35838c7.
- [X] T013 [P] [US1] Write `apps/web/src/room/walk/target.ts`, the reducer of R-06, with no DOM and no three. Check: T003 passes (feat/008-visitor-movement) **Done:** 7651ddc.
- [X] T014 [US1] Write `apps/web/src/room/scene/highlight.ts` (R-07): proxies over the target's members' draws, a hull material of its own following `OutlineEffect`'s screen-space extrusion, depth-tested and not depth-written, edge then band after the look's frame; and, in `src/room/scene/bundle3d.ts`, the function that gives a selectable's members' draws without the placements mounted on them that aren't members or the switch cases' groups. Check: T004 passes (feat/008-visitor-movement) **Done:** ebe3367.
- [X] T015 [US1] Wire the stages (plan §2): `apps/web/src/room/stage.ts` (`Stage.setTarget`, `SceneOptions.target`), `src/room/scene.ts` (the highlight after `ink.render`, its thickness on resize, independent of `setQuality`), and `src/room/flat.ts` (`setTarget` accepted and drawing nothing until Phase 6), and the stand-in scene in `apps/web/test/helpers/room.ts`. Check: T004 and the existing scene and flat tests pass (feat/008-visitor-movement) **Done:** 260bca8.
- [X] T016 [P] [US1] In `apps/web/src/room/objects.ts`, report hover and press as targeting inputs (R-10), keeping the tap's selection. Check: T006 passes (feat/008-visitor-movement) **Done:** 998637a.
- [X] T017 [P] [US1] In `apps/web/src/room/a11y.ts`, report the list buttons' focus and blur, by `data-object-id`, as a targeting input. Check: the list's existing tests pass (feat/008-visitor-movement) **Done:** 692a226.
- [X] T018 [US1] In `apps/web/src/room/app.ts`, own the target store: route the stages' and the list's inputs to it, hand each change to `stage.setTarget`, call `select` from `selectObject` in the same call, reset on the hand-off and the fall to 2D; and in `src/room/signals/frame-log.ts`, add the `target` event. Check: T007, T008, and T009 pass (feat/008-visitor-movement) **Done:** 8208fdc, its guard of the stage's `setTarget` in ed1f55c.
- [X] T019 [US1] Add the highlight sample to the lookdev page (`apps/web/src/lookdev/controls.ts`, `src/lookdev/stage.ts`): a control naming any selectable, drawn with the room's own `scene/highlight.ts`. Check: T010 passes (feat/008-visitor-movement) **Done:** d0144a1.
- [X] T020 [US1] Record the entry and lazy chunks' gzipped sizes before and after, and any departure in `specs/008-visitor-movement/plan.md` §10, in the commit that makes it. Check: the entry chunk is within spec 002's 150 KB; `make lint` reports zero warnings (feat/008-visitor-movement) **Done:** 1bc56b6: the entry's JavaScript and CSS 31,079 to 31,556 bytes at gzip 9 (+477) of 153,600, and the index 4,771 to 4,811 of 16,384 (plan.md §10); `make lint` passes.
- [ ] T066 [US5] Draw the 2D highlight in `apps/web/src/room/flat.ts` (R-08; `setTarget`; the two classes in `CLASSES`) and its classes in `src/room/room.css`, and pass the room's targeting input to the 2D stage in `src/room/app.ts`. Moved here from Phase 6 by Phase 1's review (finding 4). Check: T064 and T065 pass (feat/008-visitor-movement)
- [ ] T021 [US1] Review `feat/008-visitor-movement` with the reviewer agent (`.claude/agents/reviewer.md`) in a session that wrote none of it: every pass `REVIEW.md` holds, over the branch's diff from f9524081 (the cherry-picked documents apart); the implementing session fixes blockers test-first, and the reviewer re-reads the fix. Check: the verdict, for T022's note (feat/008-visitor-movement)
- [X] T022 [US1] Write `docs/merge-requests/<date>-feat-008-visitor-movement.md`: what changed and why; the acceptance criteria; the constitution check; the cost and data-flow impact (none sent beyond today's); the RED and GREEN runs of T003 to T010; T020's chunk sizes; the review; the backlog; For the Author (L1; the merge after line R's stack); `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s from this worktree. Check: the note is committed on the branch (feat/008-visitor-movement) **Done:** `docs/merge-requests/2026-11-07-feat-008-visitor-movement.md`, with T021's review still to come.
- [ ] T023 Author: L1, the highlight at lookdev (SC-002), on both reference stages, in each of the three looks, against light and dark neighbours, with the studio's pieces in place; keep Q5's colours or change them in the looks, a data edit. Check: his verdict in the note's For the Author, or in the next branch's (the Author's devices)
- [ ] T024 Author: once line R's stack has merged, gate `feat/008-visitor-movement` from main's checkout and merge it with the command the gate prints. Check: `refs/heads/main` holds the branch's tip (main)

**Checkpoint**: the highlight is live on the production framing, in 3D, and in the 2D room.

---

## Phase 2: The Walking Foundation (blocks Phases 3 to 7)

**Purpose**: the walking data and the compositor's rules, the pure kernel, and the 3D stage's walking interface.

- [ ] T025 Make `feat/008-walking` from Phase 1's tip: `git switch -c feat/008-walking` in Phase 1's worktree, or `git worktree add -b feat/008-walking <new folder> feat/008-visitor-movement` per lane. Check: its parent is Phase 1's tip (feat/008-walking)
- [ ] T026 [P] Write ADR 0039, "The walking view", status proposed, as `docs/adr/0039-the-walking-view.md`, with its row in `docs/adr/README.md`: the decision (a third-person follow camera entered by a control beside the production framing, which stays the judged view; reach targeting; the highlight drawn at run time in two tones as look data; the figure driver a rigged avatar takes over, needing a walk clip ADR 0010's first set lacks) and its alternatives (the spec's Q1, Q2, Q4, and Q5 options). Check: `evals/docs_links.py`'s checks pass in `make test` (feat/008-walking)

### Tests for the foundation (first, RED)

- [ ] T027 [P] Write `apps/web/test/room/floor.test.ts` (FR-026, FR-027; R-04; SC-003, SC-006): obstacles by rule, never by ID (the shell and the visitor's figure out; the desk, the twin, the floor pieces, and the side-wall pieces within the figure's height in); the default scene's walkable strip; data copies with the desk, the twin, and the snowboard moved, whose floors follow; the figure's start walkable. Check: RED (feat/008-walking)
- [ ] T028 [P] Write `apps/web/test/room/movement.test.ts` (FR-025, FR-026, FR-028, FR-032; R-03; SC-003): seeded walks of 10,000 steps on the default scene and the three moved copies, never off the floor or in an obstacle; a blocked diagonal slides; a slow frame cut into 50 ms steps doesn't tunnel; movement relative to the camera's yaw; the start on the first frame after input and the stop on the first frame after it ends; walk-to stops on arrival, after 0.5 s without progress, and at another input. Check: RED (feat/008-walking)
- [ ] T029 [P] Write `apps/web/test/room/camera.test.ts` (FR-022 to FR-024, FR-037, FR-044; R-01, R-02; SC-004, SC-005): 10,000 seeded requests at random figure places and aspects, every position in the region and the limits and no farther than the production framing's distance from the figure; a narrowing aspect pulls the camera in; the return lands on `framing(aspect, boxes)` within 1e-9; transitions at most 500 ms while animating and cuts while not. Check: RED (feat/008-walking)
- [ ] T030 [P] Write `apps/web/test/room/reach.test.ts` (FR-033; R-05): distance from the footprint's edge, the cone measured to the nearest point, the nearest selectable, ties to scene order, nothing out of reach, and a side-wall board reached. Check: RED (feat/008-walking)
- [ ] T031 [P] Write `apps/web/test/room/ray.test.ts` (FR-032; R-11): `ray` inverts `project` for the production framing and for follow cameras within 1e-9; the floor hit inside the floor's rectangle, and none off it. Check: RED (feat/008-walking)
- [ ] T032 [P] Extend `apps/web/test/room/pick.test.ts` and `geometry.test.ts` (FR-021, FR-036, FR-058; plan §3.5; SC-007): reserved rectangles in `pickProblems` and `listOnly` (the problem `reserved`); RG6 refuses a fixture scene with a core under the walking control's box at a supported stage, and holds and reports a side-wall core under it; the default scene's RG6 and RG7 results equal those without the box. Check: RED (feat/008-walking)
- [ ] T033 [P] Extend `apps/web/test/room/stages.test.ts` (FR-021; R-09): the walking control's box (9rem × 2.75rem, inset 0.5rem) pinned to `room.css`'s rule, as the stage's rules are; at least 44 × 44 CSS pixels. Check: RED (feat/008-walking)
- [ ] T034 [P] Extend `apps/web/test/room/schema.test.ts`, `compose.test.ts`, `report.test.ts`, and `data-only.test.ts` (FR-056, FR-058; plan §3.1, §3.5; SC-006): the optional `walking` block, its defaults and ranges (RD2, RD3); RW1 refuses a fixture scene whose visitor stands in the desk; the 3D part carries the block resolved and the index none of it; the walking speed, a camera limit, and the reach changed in data copies pass with no source file changed; the report's start line. Check: RED (feat/008-walking)

### Implementation for the foundation

- [ ] T035 Add the `walking` block (plan §3.1): `apps/web/build/room/schema.ts`, `build/room/emit.ts` (the 3D part), `src/room/compose/bundle.ts`'s types, and `apps/web/room/scene.yaml` writing it out with the defaults. Lanes A and C start from these types. Check: T034's schema cases pass (feat/008-walking)
- [ ] T036 [P] Write `apps/web/src/room/compose/floor.ts` (R-04). Check: T027 passes (feat/008-walking)
- [ ] T037 [P] Write `apps/web/src/room/walk/movement.ts` (R-03), on T036's floor. Check: T028 passes (feat/008-walking)
- [ ] T038 [P] Write `apps/web/src/room/walk/camera.ts` (R-01, R-02). Check: T029 passes (feat/008-walking)
- [ ] T039 [P] Write `apps/web/src/room/walk/reach.ts` (R-05). Check: T030 passes (feat/008-walking)
- [ ] T040 [P] Add `ray` to `apps/web/src/room/compose/project.ts` (R-11). Check: T031 passes (feat/008-walking)
- [ ] T041 Add the reserved box (R-09; plan §3.5): `apps/web/src/room/compose/pick.ts` (reserved rectangles), `src/room/compose/stages.ts` (the control's box) with its rule in `src/room/room.css`, `build/room/checks/rg.ts` (RG6 in 3D), `build/room/checks/rw.ts` (RW1, through T036's floor, with its entry in `build/room/checks/family.ts`'s `RULES`), and `build/room/report.ts`. Check: T032, T033, and T034 pass (feat/008-walking)
- [ ] T042 State the 3D stage's walking interface in `apps/web/src/room/stage.ts` (`Stage3D.walk`: whether walking, `enter`, `leave`, and the callbacks for Escape and a failed step; plan §2), with no behaviour yet, and give `test/helpers/room.ts`'s stand-in scene a recording implementation. Lane D starts from it. Check: `make lint`'s type check passes (feat/008-walking)

**Checkpoint**: the kernel walks, collides, follows, reaches, and refuses a bad scene, in Node.

---

## Phase 3: Walking on the Desktop (User Story 2, P2)

**Goal**: "Walk around" on the desktop: keys, drag, wheel, and floor clicks; reach and Enter; "Stop walking" and Escape; `walk_started`, row V4, and the panel.

**Independent Test**: spec.md User Story 2's.

### Tests for User Story 2 (first, RED)

- [ ] T043 [P] [US2] Write `apps/web/test/room/walking.test.ts`, Node, three's objects (FR-022, FR-030, FR-032 to FR-035, FR-049; SC-005): the orchestrator over a fake input steps the figure, follows it, gives reach to the target callback, moves the picker's camera at most once a frame and only after a move, resolves a click by the pick first and the floor ray second, and leaves to the production framing with the figure at its place. Check: RED (feat/008-walking)
- [ ] T044 [P] [US2] Write `apps/web/test/room/figure.test.ts` (FR-034; R-12): the cut-out at the pose's place, turned to face the camera, mirrored toward its heading with ±0.2 of hysteresis, bobbing at most 0.015 m while walking and animating and not otherwise; the kept paper moves and mirrors with it. Check: RED (feat/008-walking)
- [ ] T045 [P] [US2] Write `apps/web/test/ui/walking.test.ts`, jsdom (FR-003, FR-010, FR-020 to FR-022, FR-029, FR-047, FR-051, FR-052, FR-054, FR-059; SC-005, SC-009, SC-011, SC-014): the control offered in 3D only after the offer, inert during the hand-off, absent in 2D, its words `walk.enter` and `walk.leave`; entering gives the walking view focus; W, A, S, D, the arrows, Q, E, R, F, +, =, and − reach the stage's walk as intents only while it has focus, the arrows' default prevented, and every held key is dropped when the walking view or the window loses focus or the page hides; Enter selects the target as a click does; Escape leaves and focus returns to the control; Tab moves on; "2D view" ends the walk and keeps the conversation and the resume; `walk_started` once a visit and never again in it, nothing else sent; the frame log's `walk` entries in a drafts build. Check: RED (feat/008-walking)
- [ ] T046 [P] [US2] Extend `apps/web/test/manifest.test.ts`, `apps/web/test/room/generated.test.ts`, `apps/web/test/disclosure.test.ts`, `services/gateway/test/integration/room-events.test.ts`, and `services/gateway/test/unit/room-events-config.test.ts` (FR-051, FR-055; SC-014): `walk_started` in the manifest's `event_kinds` and the committed `config/room-events.yaml`; row V4's Trigger names "the visitor first entering the walking view in a visit"; the gateway answers 204 to `{"kind": "walk_started"}` and counts it with `id="-"`, and 400 (`shape`) to it with an `id`. Check: RED (feat/008-walking)
- [ ] T047 [P] [US2] Extend `apps/web/test/ui/a11y.test.ts`'s 320 × 568 model (FR-021; spec 004's FR-065): the walking control sits in the stage, adds no toolbar row, is at least 44 × 44, and the text box and the talk button stay on screen. Check: RED, then GREEN with T053 (feat/008-walking)

### Implementation for User Story 2

- [ ] T048 [P] [US2] Write `apps/web/src/room/walk/input.ts` for keys, mouse drags, the wheel (with a trackpad's `ctrlKey` pinch), and clicks (R-10), bound only while walking, dropping what's held on blur, on a hidden page, and on leaving. Check: T045's input cases pass with T056 (feat/008-walking)
- [ ] T049 [P] [US2] Write `apps/web/src/room/scene/figure.ts`, the driver interface and the flat cut-out's driver (R-12). Check: T044 passes (feat/008-walking)
- [ ] T050 [US2] Write `apps/web/src/room/scene/walking.ts`, the orchestrator (plan §3.6), on T036 to T040, T048, and T049. Check: T043 passes (feat/008-walking)
- [ ] T051 [US2] Wire it into the 3D stage: `apps/web/src/room/scene.ts` (`walk`, the frame's walking step before drawing) and `src/room/scene/bundle3d.ts` (the picker's `setCamera`, the paper's parent at the hand-off's end). Check: T043 and T044 pass; the existing scene tests pass (feat/008-walking)
- [ ] T052 [P] [US2] In `apps/web/src/room/objects.ts`, give the tap to a callback the 3D stage turns into a walk when nothing is picked. Check: T006's and T043's tap cases pass (feat/008-walking)
- [ ] T053 [P] [US2] Add the seven UI words to `apps/web/src/room/ui-keys.ts` and `apps/web/room/ui-words.yaml` (plan §3.3), and the walking control to `src/room/layout.ts` and `src/room/room.css` (its box, focus ring, cursor, inertness with the other controls). Check: the compositor's UI-word checks, T045's control cases, and T047 pass (feat/008-walking)
- [ ] T054 [P] [US2] In one commit: `walk_started` in `apps/web/src/room/events.ts`'s `EVENT_KINDS` after `mode_2d`; `config/room-events.yaml` regenerated by the build; row V4's Trigger in `docs/data-flow-disclosure.md` (Amendment M4); spec 002's contracts/room-events.md §1 left as it is, the amendment being spec 008's M3. Check: T046 passes (feat/008-walking)
- [ ] T055 [P] [US2] In one commit (FR-053): §7.8's panel "Visits that walked" and its bullet in `specs/000-local-foundations/contracts/telemetry.md` (Amendment M1), and the panel in `deploy/grafana/dashboards/h4-runtime.json`. Check: `deploy/scripts/test_dashboard.py` passes in `make test` (feat/008-walking)
- [ ] T056 [US2] In `apps/web/src/room/app.ts`: the control's wiring, the focus moves of FR-022, Escape's leave, the walk's end on `toFlat`, `walk_started` once a visit through the `EventSink`, the `walk` frame-log event, and reach's inputs to the store. Check: T045 passes (feat/008-walking)

**Checkpoint**: a desktop visitor walks, targets by reach, opens with Enter, and stops; the panel counts it.

---

## Phase 4: Walking by Touch (User Story 3, P3)

**Goal**: tap the floor, drag, pinch, and tap a piece while walking; the page scrolls from the stage as today while not.

**Independent Test**: spec.md User Story 3's.

- [ ] T057 [P] [US3] Write `apps/web/test/ui/touch.test.ts`, jsdom with synthetic Pointer Events (FR-031, FR-032; SC-009): while walking, a one-finger drag beyond the slop turns and tilts, two pointers pinch to zoom, a tap on the floor walks and on a piece selects, highlighted while down; the canvas carries `touch-action: none` and the wheel listener is not passive only while walking; while not walking, a tap selects and the canvas keeps `touch-action: manipulation`. Check: RED (feat/008-walking)
- [ ] T058 [US3] Add touch to `apps/web/src/room/walk/input.ts` (the one-finger drag, the two-pointer pinch, taps) and the walking class's `touch-action` to `apps/web/src/room/room.css`. Check: T057 passes (feat/008-walking)

**Checkpoint**: the phone walks by touch; nothing changes for a visitor who doesn't.

---

## Phase 5: Accessibility and Reduced Motion (User Story 4, P2)

**Goal**: the walking view's name, instructions, announcements, and no trap; reduced motion and pause honoured; 0 axe violations.

**Independent Test**: spec.md User Story 4's.

- [ ] T059 [P] [US4] Extend `apps/web/test/ui/a11y.test.ts` (FR-038, FR-039, FR-041, FR-042, FR-045; R-13; SC-008): the control's name, its place in the Tab order (the toolbar, the control, the list), and the focus ring; the walking view's element focusable, with `role`, name, and instructions, only while walking; the canvas still hidden; every selectable reachable from the list while walking; 0 axe violations with walking on and off; the highlight's border not a colour alone. Check: RED (feat/008-walking)
- [ ] T060 [P] [US4] Extend `apps/web/test/ui/pause.test.ts` (FR-018, FR-044; SC-010): with reduced motion, with the room paused, and with the page hidden, the walking view shows no easing, inertia, glide, or bob, the return is a cut, the visitor's input still moves the figure, and the highlight never animates. Check: RED (feat/008-walking)
- [ ] T061 [P] [US4] Extend `apps/web/test/ui/walking.test.ts` (FR-043): `walk.entered` and `walk.left` once each; `walk.target` with the name once per change of reach while the walking view has focus; nothing announced for a hover or a press. Check: RED (feat/008-walking)
- [ ] T062 [US4] In `apps/web/src/room/layout.ts` and `src/room/app.ts`, R-13's attributes on the view container only while walking, the visually hidden `walk.help`, and the announcements through the room's announcer. Check: T059 and T061 pass (feat/008-walking)
- [ ] T063 [US4] In `apps/web/src/room/walk/camera.ts`, `src/room/scene/walking.ts`, and `src/room/scene/figure.ts`, read the motion store's `animate` each frame: cuts, no inertia, no bob while it doesn't. Check: T060 passes (feat/008-walking)

**Checkpoint**: keyboard, screen reader, and reduced motion are whole.

---

## Phase 6: The 2D Room (User Story 5, P3; can start right after Phase 1, beside Phase 2)

**Goal**: the highlight on the 2D drawing (built in Phase 1); no walking there (T045).

**Independent Test**: spec.md User Story 5's.

Its tasks, T064 to T066, moved into Phase 1 at Phase 1's review (finding 4), since FR-003 asks the 2D room to highlight targets from the first target on; that no walking control shows in 2D is T045's, with the control.

**Checkpoint**: the 2D room highlights as the 3D room does.

---

## Phase 7: The Rest of the Degraded Mode (User Story 6, P1)

**Goal**: walking under every degraded state; a failing step and a lost context handled.

**Independent Test**: spec.md User Story 6's.

- [ ] T067 [P] [US6] Extend `apps/web/test/ui/degraded.test.ts` (FR-001, FR-002; SC-012): walking under the live source off, the tier unknown, and the stubbed kill switch `degraded`, as in the happy path; the spies record no request but `walk_started`'s beacon. Check: RED where it depends on new code (feat/008-walking)
- [ ] T068 [P] [US6] Extend `apps/web/test/room/walking.test.ts` (FR-005, FR-006; SC-012): a movement step that throws ends the walk, the camera at the production framing and the figure at its place, and the stage reports the failure; while the context is lost nothing moves and no highlight is drawn; after a restore the walk goes on. Check: RED (feat/008-walking)
- [ ] T069 [US6] Guard the walking step in `apps/web/src/room/scene.ts`, hold still across a lost context in `src/room/scene/walking.ts`, and end the walk on the stage's failure callback in `src/room/app.ts`. Check: T067 and T068 pass (feat/008-walking)

**Checkpoint**: nothing about moving or targeting ever degrades, and nothing leaves a blank scene.

---

## Phase 8: Polish

- [ ] T070 [P] Add the scripted walk to the lookdev page (`apps/web/src/lookdev/stage.ts`, `controls.ts`; FR-048, FR-050; R-14), with `apps/web/test/lookdev/page.test.ts` and `builds.test.ts` extended first (the waypoints, two runs identical, drafts builds only). Check: the tests, RED then GREEN (feat/008-walking)
- [ ] T071 [P] Document the walking block in `apps/web/room/README.md` beside T011's highlight. Check: `make test`'s docs checks pass (feat/008-walking)
- [ ] T072 Record the chunks' gzipped sizes against Phase 1's (T020) and the index's size, and any departure in `specs/008-visitor-movement/plan.md` §10. Check: the entry chunk within 150 KB and the index within 16 KB; `make lint` reports zero warnings (feat/008-walking)
- [ ] T073 Review `feat/008-walking` with the reviewer agent, in a session that wrote none of it, as T021 did, over the diff from Phase 1's tip. Check: the verdict, for T074's note (feat/008-walking)
- [ ] T074 Write `docs/merge-requests/<date>-feat-008-walking.md` as T022's, with the RED and GREEN runs of T027 to T034, T043 to T047, T057, T059 to T061, T067, T068, and T070, the chunk sizes, and For the Author (L2, L3, the merge after `feat/008-visitor-movement`, ADR 0039). Check: committed on the branch (feat/008-walking)
- [ ] T075 Author: L2, the phone (FR-048): the lookdev phone copy's 2-minute scripted walk on the reference phone (median, share of frames over 33 ms, the settled quality beside the static view's), then the walking view by touch, and the page's scroll from the stage with walking off. Check: SC-013's figures in the note (the Author's devices)
- [ ] T076 Author: L3, spec 004's Q9 runs with the walking view: a keyboard-only visit that walks and opens a piece with Enter, and a screen-reader visit that chooses every piece from the list without walking. Check: SC-008's verdicts in the note (the Author's devices)
- [ ] T077 Author: gate `feat/008-walking` from main's checkout and merge it with the command the gate prints, after `feat/008-visitor-movement`; accept ADR 0039 or leave it proposed. Check: `refs/heads/main` holds the branch's tip (main)

---

## Dependencies & Execution Order

### Phase dependencies

- **T000** blocks everything.
- **Phase 1** (T001 to T024, with T064 to T066 since its review) needs only T000 and line R's tip; it lands first.
- **Phase 2** (T025 to T042) starts from Phase 1's tip once T021's review has no blocker left, and blocks Phases 3 to 5 and 7.
- **Phases 3, 4, 5, 7** run in that order on `feat/008-walking`.
- **Phase 6**'s tasks, T064 to T066, moved into Phase 1 at its review.
- **Phase 8** needs every story's phase.

### Within each phase

- Tests first, RED; then the code; a test task's check names the code task that turns it GREEN.
- Schemas before data, and types before modules: T012 before T011 and T014; T035 before T036 to T039; T042 before T048 and T056.
- T054's disclosure row lands in the same commit as the event kind, never after it.

### Parallel opportunities

- Phase 1: T003 to T010 together; then T012, T013, T016, T017 together; T011 after T012; T012 → T014 → T015 → T018; T019 after T014.
- Phase 2: T026 to T034 together; after T035, T036 to T040 together; then T041 and T042.
- Phase 3: T043 to T047 together; T048, T049, T052, T053, T054, T055 together; then T050 → T051 → T056.
- Across phases: lookdev's T070 once T051 is in.

## Parallel Example: Phase 2

```text
Agent A, worktree wt-008-floor:  T027, then T036
Agent B, worktree wt-008-move:   T028, then T037 (after T036)
Agent C, worktree wt-008-camera: T029, then T038
Agent D, worktree wt-008-reach:  T030, then T039
Agent E, worktree wt-008-ray:    T031, then T040
Agent F, worktree wt-008-data:   T032 to T035, then T041
The phase's session cherry-picks A to F in task order, then T042.
```

## Implementation Strategy

- **MVP first**: Phase 1 alone is the Author's "the object gains a highlight border until the user clicks on it", on the view every visitor has; stop and validate it with L1 before walking.
- **Then walking**, desktop before touch, with accessibility and the degraded mode proved before the branch's review.
- **The answer to "when will that be there in the demo?"**, in order of work: the highlight at Phase 1's merge, walking at `feat/008-walking`'s; each merge after line R's stack. The rigged avatars come with ADR 0010 and spec 003's loader, outside this spec.

## Consistency Check (the `/speckit-analyze` pass, 2026-11-07)

A read of spec.md, plan.md, and this file against each other and the constitution, made before any code. What it found, and what was done in these documents:

| ID | Severity | Where | Finding | Resolution |
|---|---|---|---|---|
| A1 | MEDIUM | plan.md, Constitution Check and §4.2 | The plan named task IDs from a draft of this file (T007, T020, T024, T046, T053, T081, T082, T090), and said the panel lands in the event's commit, where the event and the panel are two commits | The plan now names this file's IDs (T008, T035, T042, T021, T054 with T055, T026 with T011 and T071, T073) and says the panel lands in the event's phase |
| A2 | MEDIUM | tasks, Phases 1 and 4 | The looks' data (T011) was marked parallel with the schema that admits it (T012), and the 320 × 568 test sat in Phase 4 after the control it tests (Phase 3), so neither could fail first as written | T011 now follows T012, and the 320 × 568 test is T047, in Phase 3's tests before the control (T053) |
| A3 | LOW | spec.md FR-050; tasks | FR-050's highlight sample and scripted walk are in one requirement, built in two phases | Kept as one FR; T010 and T019 build the sample in Phase 1, T070 the scripted walk in Phase 8 |
| A4 | LOW | spec.md FR-003, User Story 5 scenario 4 | The fall to 2D ending a walk is tested in Phase 3 (T045), though User Story 5 is Phase 6 | The behaviour is built where the walk is (T056), so its test is there; User Story 5 adds the 2D highlight only |
| A5 | LOW | spec.md FR-059 | The UI words' closed-list check comes from spec 004's compositor tests (RT12), not a new test | T053's check names those tests; T045 checks the words shown |
| A6 | LOW | spec.md, the brief's "centre reticle" | The brief listed a centre reticle among the targeting inputs; the spec took reach instead (Q4) | Recorded as Q4's option B, with what a no changes |
| C1 | none | Constitution | No MUST is violated. Principle III's accepted-intent rule is a named deviation in the spec's Assumptions, with T000 holding all code behind the Author's acceptance and approval | – |

**Coverage**: every FR from FR-001 to FR-059 has at least one task, by its number or inside a named range (FR-037's words staying in "Around the room" is today's behaviour, held by spec 004's tests, and its distance bound is T029's; FR-048 is the Author's T075 on T070's walk); every SC from SC-001 to SC-014 has a test task or an Author's run (SC-002's judgement T023, SC-008's T076, SC-013's T075). No task lacks a requirement or story. **Metrics**: 59 FRs, 14 SCs, 78 tasks (T000 to T077), 6 of them the Author's; coverage 100%; 0 critical, 0 high, 2 medium (resolved), 4 low (resolved or recorded).
