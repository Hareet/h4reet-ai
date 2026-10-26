# feat/004-us1-composition
Spec: [specs/004-room-composition/](../../specs/004-room-composition/) (Phase 3, User Story 1: T089 to T119, and the cube amendment's T292 to T303) · Intent: [specs/004-room-composition/intent.md](../../specs/004-room-composition/intent.md) · Written by: docs agent (Claude Haiku 5.5), from the review's record, the branch's commits, and the outputs in `/tmp/claude-1000/feat-004-us1/final/`; the main session commits it and fills the `make check` placeholder · Date: 2026-10-26
Session: the implementer and fix sessions worked in the branch's worktree, `/tmp/claude-1000/wt-004-us1`, and in the scratch worktrees the sections below name, each removed after its run. Tip before this note: 73d4527.
Authorized by: tasks.md T089 to T119 and T292 to T303; the cube amendment on `spec/004-cube-amend` (tip fffdb55), which merges to `main` before this branch; the Author's decisions in spec.md's Clarifications, Sessions 2026-10-23 and 2026-10-26; and plan.md §10.

**Status: reviewed, APPROVE with fixes, no blocker.** Every fix is made, and each was written test first (RED 7de0abf, then GREEN). The merge waits for `spec/004-cube-amend`, M9, P-10, and M8 (P-7), and for the rebase in T118. The `make check` run ends with three FAILs, and all three are environmental or pre-existing: toolchain-check (the Claude Code pin), policy (the web image's digest pin), and test (the four pytest cases the foundation's note records). See Verification. Several decisions are the Author's, and they are under For the Author.

## Runs in the Author's terminal

Nothing on this branch runs in your terminal before the merges below. Read the steps in this order.

1. **Merges that come first, not this branch's.** `spec/004-cube-amend` (tip fffdb55) merges to `main` first. M9 and P-10 come next. M9 may merge before M8 (the Author, 2026-10-26; plan.md §10). M8, which carries P-7, comes last. Line R waits for M8, since User Story 1's work orders need P-7 (FR-077 item 5).
2. **The rebase (T118), by the agents.** After T088, the agents record the tip first, as `feat/004-us1-composition was 73d4527`, and then run `git rebase --onto refs/heads/main 85747fe feat/004-us1-composition`. The commit 85747fe is the foundation's tip before its own rebase (T087), which this branch was cut from. The rebase will conflict on the spec commits, and I4 below gives the resolution. The agents then re-run `make check ENGINE_MODE=none-yet` and `npm run room:report -w apps/web` and append both to this note. You don't run the rebase.
3. **The gate and the merge (T119), by you.** Once M8 is on `main`, run `tools/gates/gate feat/004-us1-composition` from main's checkout, then the merge command the gate prints. The gate runs the agent-config evals only when the merged branch touches the agent config. This branch touches none of it: nothing under `.claude/`, `evals/agent-config/`, `tools/gates/`, `deploy/`, or `Makefile` changes (`git diff --name-only 85747fe..73d4527` shows none).
4. **Q3's Author runs, on dev, after the merge.** Start dev with `make up ENV=dev`. It is heavy, so run it when no agents are running. The quickstart's Q3 lists three runs (quickstart.md, Q3, "The Author's runs"):
   - Run 1, until FR-078's layout lands: the room looks and behaves as spec 002's did.
   - Run 2, after it: the room is the Author's cube, seen straight into its open front, with the chalkboard high and the snowboard low on the left wall, the bicycle on the right wall, and the visitor central and a little left.
   - Run 3, tap areas: on the desktop, the snowboard, the chalkboard, and the bicycle each open their topic. In device mode and in the 2D room, a board that the report lists as list-only selects nothing when tapped and is chosen from "In the room".
5. **Not this branch's.** The lookdev page's phone copy build belongs to User Story 3 (`feat/004-us3-lookdev`), not to this branch.

## What changed and why

The room's pieces, walls, figures, and words are now data under `apps/web/room/`. Three commands work on that data. `room:generate` writes the generated files. `room:check` runs the rule families, which refuse a broken scene. `room:report` prints FR-073's report. A build step (`compose()`) turns the checked data into one bundle. The 3D room, the 2D room, and the text copy all read that bundle. The room's code holds no room ID. Adding or moving a piece is then an edit to data, and the code changes only for a new kind of behaviour (FR-006, FR-007).

What this branch does, in plain terms:

- **The Author's cube.** The room is a brick cube, 2.1336 m wide, 2.1336 m high, and 1.2192 m deep, open at the front, with a cement floor. The Author's own answer gives "7feet wide, 4 feet depth, and 7 feet high", and the metric figures are the conversion (a reading). Every size and position not measured is marked `estimated: true`, and each work order asks for the measurement.
- **The left wall and the camera.** The chalkboard is high on the left wall and the snowboard is low on its tail (T301). The camera's eye moved from 1.5 m to 1.15 m (a departure, recorded in plan.md §10).
- **Side-wall selectables (FR-064, as amended).** A side-wall board that can't keep its own 44 by 44 CSS pixel tap area at a stage is list-only at that stage, and "In the room" reaches it. Where it can keep the tap area, tapping works (T302's answer (b), "Tap where it fits, list where it doesn't", and T303). The compositor never refuses a side-wall selectable for a missing core.
- **The chalkboard as a fourth selectable.** Its ID joins `config/room-events.yaml` under the existing `objects` list. Its topic joins `config/room-topics.yaml`. It is the only new ID in the events file, and it uses the existing event kind (see Cost and data-flow impact).
- **The visitor turns to take the paper.** The visitor's figure turns toward the twin to take the resume paper, which ends in the visitor's nearer hand (0d4cd27; FR-008). This follows the Author's words of 2026-10-23, in spec.md's Clarifications.
- **Generated files and the photo guide.** The 17 work orders under `docs/studio/work-orders/`, the photo guide, and the two files `config/room-events.yaml` and `config/room-topics.yaml` are generated and committed. Their freshness is tested (T102). They merge only after M8 (T108).

The branch is 69 commits on top of `85747fe`. The diff is 140 files, with 12,802 insertions and 1,527 deletions. 100 files are under `apps/web/`, 18 under `docs/studio/`, 11 under `services/gateway/` (all tests), 7 under `specs/004-room-composition/`, 2 under `docs/merge-requests/`, and 2 under `config/`. No gateway source changes.

Every model stays a stand-in. `main` has no room models or caps, so the report draws each piece as a stand-in (FR-053's starting figures).

## Acceptance criteria

This branch serves the parts of the spec below that are listed as met. The partial items say what is missing and which later task closes it. Quotes are from [spec.md](../../specs/004-room-composition/spec.md).

- **FR-004 (met).** "EACH SELECTABLE SHALL have a permanent ID, a visible name, its member placements, and a topic or an action."
- **FR-005 (met).** "THE COMPOSITOR SHALL refuse any key its schema doesn't define and any value outside its declared type, and no data value SHALL be evaluated as code."
- **FR-006 (met).** "WHEN a piece is moved, added, removed, regrouped, retargeted, or reworded, or a switch gains a case for a value its signal already has, THE CHANGE SHALL be data only." The proof set passes on a copy of the data (T101, T115 §2).
- **FR-007 (met).** "IF the room's code holds an ID that only data defines (a piece, placement, selectable, or topic), THEN A SOURCE SCAN SHALL fail `make check`, naming the file and the ID." The scan finds 0 hits on the tip, and the planted ID fails it (T107, T115 §3).
- **FR-008 (met).** "THE ROOM SHALL keep spec 002's hand-off and its paper as code, taking only their anchors (the twin's hand and the visitor's) from data." The review's R2 fix adds RI8, which checks that each figure's hand is on the side the other hand lies on.
- **FR-011 (met).** "THE 3D ROOM, THE 2D ROOM, AND THE TEXT COPY SHALL all read the one bundle, and THE 2D ROOM AND THE TEXT COPY SHALL never wait for the 3D part to load."
- **FR-013 (partial).** "WHEN `make up` builds the room and one piece's model fails its fit, THE BUILD SHALL warn and use that piece's stand-in, so `make up` always works, and the room's manifest SHALL say stand-ins are in use." The manifest's `standins` and the strict and lenient tests are met. The `make up ENV=dev-cpu` run of T115 step 7 is not in this branch's outputs (T115 left it out), and the image build waits for the agents' engine and the web image pin.
- **FR-014 (partial).** "THE COMPOSITOR SHALL generate each piece's work order from its catalog entry and the chosen look, committed, and `make test` SHALL fail when one is stale." Generation and freshness are met (T102; `room:generate` wrote nothing on the tip). The reviewer's standing pass over the work orders is P-7's, and it waits for M8 (P-7 is not on `main`). This review applied the same reading by hand.
- **FR-026 (met for the guide's text).** "THE PHOTO GUIDE SHALL tell the Author, before the first shot, to pause camera-roll backup and gallery sync until cleanup, ..." The guide asks for the side files and their checklist, and it asks for each desk item's position from the desk's front-left corner. The photos themselves are the Author's.
- **FR-034 (partial).** "EVERY DRAWN WORD SHALL also be in the text copy, taken from the renderer's own word list, so the 3D room, the 2D room, and the text copy can't differ." The stand-in labels and the neon sign's word are covered. The other live faces' words come with the renderers in User Story 5 (T185 and T160). A backlog item records a reading that limits FR-034 to faces.
- **FR-037 (met).** "WHILE a topic has no corpus material, or the twin's spec hasn't marked it ready, WHEN its piece is selected, THE ROOM SHALL show the fixed message that the twin can't talk about it yet, filled with the topic's own phrase, and SHALL call no model (spec 002 FR-023)."
- **FR-038 (met).** "THE BUILD SHALL publish the mapping from each selectable to its topic, corpus files, and lead as generated configuration for the twin's spec." The mapping is `config/room-topics.yaml`, and the turn carries only the selectable's ID (T108, T113).
- **FR-052 (partial).** "THE COMPOSITOR SHALL project each live face at the production framing on both reference stages and report its smallest glyph height in CSS pixels, measured as cap height ..." The report covers the neon sign's four faces (its word and its counters on the phone are shown below). The monitor's screen, the chalkboard's slate, and the signs' lettering are not yet live faces in this branch. Their renderers come with User Story 5 (`feat/004-us5-words`).
- **FR-058 (partial).** "IF the device can't render 3D, or the room falls to 2D, THEN THE 2D ROOM SHALL draw the composed scene from the bundle ..." The 2D room draws the placements, the switch cases, and the hit areas from the bundle. The live faces as still images wait for User Story 5.
- **FR-063 (met for the list).** "THE 'IN THE ROOM' LIST SHALL hold each selectable as a button with its name and its topic or action, in the scene's order." The list holds the four selectables in scene order. The live faces' words in the text copy wait for User Stories 2 and 5.
- **FR-064 (met, as amended by T302 and T303).** "EVERY HIT AREA, in 3D and 2D, SHALL be at least 44 by 44 CSS pixels on screen at every supported stage size, down to the smallest the layout allows, and each selectable SHALL keep an exclusive pick area of that size ..." The amendment's carve-out reads: "WHERE a side-wall selectable can't keep its exclusive pick area at a stage, in 3D or in the 2D drawing at that stage's own scale, THE ROOM SHALL draw no pick area for it at that stage, a pointer pick on its members there SHALL select nothing (Reading R3), and THE 'IN THE ROOM' LIST (FR-063) SHALL reach it there."
- **FR-073 (met).** The report is pasted under Measurements. It carries each piece's source, the totals against the caps, the room's share of the first visit, each readable face's smallest glyph, and the side-wall selectables with the stages where they are list-only.
- **FR-078 (partial).** "THE DEFAULT SCENE SHALL lay the work area out as the Author laid it out on 2026-10-23 and 2026-10-26 (Clarifications):" The layout is data. The sizes and positions not measured are `estimated` and wait for the Author's measurement through the work orders. The Author's dev runs (step 4 above) are the check.
- **SC-001 (met on the proof set).** "Each data-only change in the proof set (a move, an addition, a removal, a regroup with its move, a retarget, a rewording, a new switch case) passes `make check` with 0 source files changed ..." The proof set passed by hand on a scratch copy (T115 §2). `make check` as a whole has three FAILs, listed under Verification.
- **SC-009 (partial).** "A keyboard-only tester and a screen-reader tester each reach every selectable, 'Pause the room', and the text copy unaided ..." The hit-area and pick rules are met, and the review confirmed that the list reaches every selectable and that the drawings are hidden from assistive technology. The testers' runs and the automated WCAG report are not in this branch's outputs. They wait for the Author's runs and User Story 5.
- **SC-010 (partial).** "At the production framing on both reference stages, the compositor's report shows every readable face of FR-052 at or above the floor, the neon sign's word face among them ..." The neon sign's word face is at 17.0 px on the desktop and 10.7 px on the phone, above the 9 px floor. The counters are exempt on the phone, and their figures are in the text copy. The other readable faces wait for User Story 5. The look judgement is the Author's, in lookdev.

## Constitution check

| Principle | Touched? | How it complies |
| --- | --- | --- |
| I. Data-local by default | Yes | No new flow. The chalkboard's ID goes through the existing room-event beacon (disclosure row V4). No photo, model, or room file leaves the visitor's device on this branch. |
| II. Production-grade or not shipped | Yes | Tests first, with the exceptions said plainly under RED and GREEN. $0 at run time. The room-event path already has its telemetry, and this branch adds no endpoint. |
| III. Intent before spec, spec before code, humans merge | Yes | The work follows tasks.md T089 to T119 and T292 to T303. Departures are in plan.md §10 (the list is under Plan §10 departures below). The side-wall rule follows the Author's answer, and the amendment's spec branch merges first. |
| IV. Least privilege for humans and agents alike | Yes | No permission, sandbox domain, deny, or human-only path changes. The file list is under Security and agent governance. |
| V. Cost is a first-class signal | Yes | $0 at run time. No model call is added. A topic with no corpus material calls nothing (FR-037). |
| VI. Build in public, including failures | Yes | The RED runs, the GREEN runs, the review's findings, the superseded commit messages, and the failing `make check` lines are all in this note. |
| VII. Own the whole product, and say exactly what you owned | Yes | The cube's words are the Author's, and they are quoted in spec.md's Clarifications. The metric sizes are a conversion. This note makes no claim about the Author's role or the agents' share of the work. |
| VIII. Honest AI | Yes | No change to what the twin says. The chalkboard's topic reaches the twin through the existing conversation path, and the fixed message applies where there is no corpus (FR-037). |

## Security and agent governance

Nothing under `.claude/`, `tools/gates/`, `REVIEW.md`, `CLAUDE.md`, `.specify/memory/constitution.md`, `assets/policy/`, `evals/agent-config/`, or `deploy/` changes. The file list confirms it. The reviewers wrote none of this branch, and each review slice was read-only. No secret, no new egress, and no new domain or permission. The review's passes confirmed the content security policy (no style attributes, no `blob:` URLs, no inline handlers), that no room ID appears in source, that cleanup holds, and the accessibility basics. The review's brief asked that the work orders and the photo guide be read for FR-014 and FR-024 (they locate nothing, name no third party's marks, and ask the studio's session for nothing FR-024 excludes). The review's findings are listed under Review.

## Cost and data-flow impact

**Cost:** $0 at run time. No model call, endpoint, or runtime path is added. The site's client bundle gains the kernel's framing and pick code (`src/room/compose/`).

**Data flow:** no new flow. The chalkboard is a new ID in `config/room-events.yaml`, under the existing `objects` list of the existing `object_selected` kind. Its selections reach the gateway through the room-event beacon that disclosure row V4 already describes (`docs/data-flow-disclosure.md`). Row V4 carries the body as `{kind}` or `{kind, id}`, and the chalkboard's ID is one more value of the `id` field. `docs/how-we-build/` is not changed by this branch.

**Runtime behaviour:** the room draws from the bundle, and `src/room/framing.ts` calls the kernel's framing. The camera's eye, the side-wall rule, and the list's content changed. The disclosure entry stays as it was.

## RED and GREEN

**RED.** tasks.md's Prerequisites set the rule: "In each phase the test tasks come first and must fail (RED) before the code that makes them pass; each merge-request note records the RED and GREEN runs." The RED commits and what their messages record:

| Task | RED commit | What the RED run showed (from the commit message) | GREEN commit |
| --- | --- | --- | --- |
| T090 | 1bd2171 | `bundle3d.ts` doesn't exist; `scene.test.ts` fails to load. No count. | 1111733, b48a3fc |
| T091 | 2f69862 | The modules don't exist (1 failed file). | 9e387ec |
| T092 | 7299b60 | 11 fail (`selectablePicker`, the digest checks, the hand offsets). | b48a3fc |
| T093, T094 (manifest half) | d03bd22 | 9 of 1420 fail, waiting for T096 and T098. | 02d92b4 |
| T094 (compose half) | 0887c90 | The tree has no room data yet. No count. | b3fea0e |
| T101 | e4d4591, with cf106af and 1b42e00 as its test fixes | The compose half passed on arrival. The runtime half was `it.fails` until T109 and T110; dc4aa0d made it plain. No count. | 8a3f165, 69c3cc9 |
| T102 | e4d4591 | `config/room-topics.yaml` and `docs/studio/` don't exist; the events file has spec 002's header. | 580c9e4 |
| T103 | 5fab94c, d50dfe3 | 1 of 19 fails (5fab94c); 19 of 19 fail (d50dfe3). | 8a3f165, 4c0862f |
| T104, T105 | 5f92463 | 5 of 44 fail. | 69c3cc9 |
| T106 | abeaea0, 5ac86ac | No count. The scan's hits under `services/gateway/` fall from 47 to 20 to 0, with apps/web's 46 left for T112. | test commits |
| T107 | e4d4591 | The scan finds 93 hits; it was `it.fails` until T112. | 689c414, 19268c5 |
| T111 | 8559fbd | The module doesn't exist; tsc refuses the import. | 2331dc1 |
| T97 (lookdev page-5 fix) | 4eea499 | The ink lines were about 0.003 px. No count. | f432cae |
| T112 | c6137e1 | No count. | 689c414 |
| Visitor turns to take the paper (FR-008, the Author's words of 2026-10-23) | a65a3fb | 8 cases fail. | 0d4cd27 |
| T292 to T295, and T301's framing (cube amendment) | 01ca787 | 45 of 448 cases fail in 12 files, against the cherry-picked code. | 71b3d35 (T296 to T299, T301) |
| T303 (Author's answer (b)) | 5688997 | 36 of 364 cases fail in 9 files, against T296's code. | bf7d3b4 |
| Review fixes (T116) | 7de0abf | 34 of 1,592 cases fail in 11 files, against bf7d3b4's code. | 41d7031, cd5f1f6, 9e7b63a |

**GREEN.** The web workspace passes at the tip: 57 files, 1592 tests. The gateway passes: 51 files, 789 passed and 12 skipped. Both counts are in the final checks under Verification. The GREEN for each RED is in the table above.

**Test-first exceptions, said plainly.**

- The RED runs for T292 to T303 and the review's fixes were `vitest` without the site build (the messages say so). They ran against the cherry-picked code or the prior tip, not on a clean tree.
- The local agent's first try (bc897a6, d8b9c2e, 4aa2e0a) is superseded. 4aa2e0a, its GREEN commit, rewrote test expectations. The RED commits 01ca787 and 5688997 replaced them. The history is kept, not rewritten.
- 71b3d35's subject says GREEN, but `room:check` fails until 628c633 and bf7d3b4. A bisect over 71b3d35..628c633 sees a red `room:check`.
- The messages for T094 (compose half), T097, T106, and T112 give no failing count.

## Review

**Verdict: APPROVE with fixes. No blocker in any slice.** Four reviewer agents each took one slice of `git diff 85747fe bf7d3b4`. None of them wrote any of the branch, and each covered REVIEW.md's four passes for its slice. The fixes are bf7d3b4..73d4527, made test first (RED 7de0abf, then GREEN commits that change no test). The full record is in `/tmp/claude-1000/-home-h4reet-h4reet-ai-h4reet-ai/a2c7a863-b242-4706-8e2f-717ec5e905d8/scratchpad/us1-review-summary.md`.

Findings, and what was done:

- **Slice 1, the compositor and kernel.**
  - C1, important: `listOnly` held both members of a pair of side-wall selectables whose cores meet only core over core, which dropped a tap the Author's "tap where it fits" keeps. Fixed in 41d7031 with a release pass in scene order.
  - C2, important, security: a data edit could mark any piece side-wall and so dodge RG6. Fixed in 41d7031 with `sideWallFrame`, which needs the anchor to be a quarter turn about y, at the shell's x bounds, with no x or y turn on the members, and the members within their depth of the wall.
  - C3, important: nothing guarded the premise that a visitor keeps both taps in 3D on desktop. 7de0abf adds a committed-data test.
  - C4 (orders.ts uses the same test), C5 (phoneExempt's conditions), C6 (stale comments), and C7 (`EYE_Y = 1.15` is tuned to this cube, a departure in plan.md §10, 8abcfac).
- **Slice 2, the runtime and the site.**
  - R1, important: a throw in the 2D fallback froze the room (FR-062). Fixed in cd5f1f6: `toFlat` catches the throw, still marks 2D, and still emits `mode_2d`, and the room opens with the list and "Around the room". **Not done:** no UI word gives a line for a failed 2D drawing, and data-model.md §6.3 closes the UI words' keys, so the view is left empty. See For the Author, item 2.
  - R2, important: nothing checked that the paper ends in the nearer hand. Fixed in cd5f1f6 (RI8, with two known-bad fixtures).
  - R3, nits, all fixed in cd5f1f6: one `ink.prepare` per scene, cue visibility recomputed only on resize, `flatPicker` reads the index's `view_box`, `reducedMotion` reaches the 2D turns, and `standinLabel` goes through `uiWord`, which also caught a `replaceAll` "$&" bug.
- **Slice 3, the data, generated files, and tests.**
  - D-I1, important: the visitor at x −0.4 still hid much of the monitor, against D3's aim. It was measured per avatar and moved to x −0.5 (9e7b63a). The trade-off goes to the Author (For the Author, item 1).
  - D-I2, important: the shell's 2D drawing used the camera from before T301. The corners are now recomputed, and a test ties them to the 2D camera's projection (9e7b63a).
  - Nits: the header of the figures' estimates (9e7b63a), a reference-desktop test (C3), the twin and bicycle overlap (for lookdev, For the Author, item 3), and the photo guide's bicycle row, which now names its origin (41d7031).
- **Slice 4, the docs and bookkeeping.**
  - I1, plan.md §10 held stale cube figures. Fixed in 8abcfac.
  - I2, the room's README taught the rules as they stood before the cube. Rewritten in 0db136c.
  - I3, T115 was ticked against a tip from before the cube, and T099's and T115's outputs weren't durable. Both were re-run (T099 at 1011b12, T115 on 0db136c) and ticked again in 73d4527. The outputs are on `wip/004-scratch`, under `notes/us1/final/`.
  - I4, the T118 rebase plan. See Rebase plan below.

## Measurements

### T099: today's room against spec 002's layout

T099 is the one-off comparison of R-07. The script was a throwaway test file in a detached worktree of 1011b12 (today's room as data, T095), which was never committed and was deleted after the run. It ran on 2026-10-26. Each box `compose()` places was measured by the kernel's transform against spec 002's `LAYOUT`, and the framed boxes against spec 002's `FRAMED`. The result, from `/tmp/claude-1000/feat-004-us1/final/t099.txt`:

| Placement | LAYOUT box | compose()'s box (expected bounds, world) | Largest difference | Within 1 mm | Framed box, with the label, against LAYOUT's framed box |
| --- | --- | --- | --- | --- | --- |
| `work-desk` (LAYOUT.desk) | (-0.7500, 0.0000, -1.8000) to (0.9500, 0.7500, -1.1000) | (-0.7500, 0.0000, -1.8000) to (0.9500, 0.7500, -1.1000) | 0.0000 mm | yes | 0.0000 mm |
| `laptop` (LAYOUT.laptop) | (-0.4300, 0.7500, -1.4800) to (-0.0700, 0.9800, -1.2200) | (-0.4300, 0.7500, -1.4800) to (-0.0700, 0.9800, -1.2200) | 0.0000 mm | yes | 0.0000 mm |
| `desk-screen` (LAYOUT.screen) | (0.0800, 0.7500, -1.7000) to (0.7200, 1.2900, -1.5400) | (0.0800, 0.7500, -1.7000) to (0.7200, 1.2900, -1.5400) | 0.0000 mm | yes | 0.0000 mm |
| `snowboard` (LAYOUT.snowboard) | (-2.4600, 0.6750, -1.9700) to (-2.1400, 2.2250, -1.9100) | (-2.4600, 0.6750, -1.9700) to (-2.1400, 2.2250, -1.9100) | 0.0000 mm | yes | 0.0000 mm |
| `bicycle` (LAYOUT.bicycle) | (1.6200, 1.2200, -1.9500) to (2.8800, 1.9800, -1.8500) | (1.6200, 1.2200, -1.9500) to (2.8800, 1.9800, -1.8500) | 0.0000 mm | yes | 0.0000 mm |
| `wall-window` (LAYOUT.window) | (0.5000, 1.5000, -2.0000) to (1.4000, 2.2000, -1.9400) | (0.5000, 1.5000, -2.0000) to (1.4000, 2.2000, -1.9400) | 0.0000 mm | yes | 0.0000 mm |
| `wall-art` (LAYOUT.artwork) | (0.6000, 2.3500, -1.9900) to (1.3000, 2.7500, -1.9500) | (0.6000, 2.3500, -1.9900) to (1.3000, 2.7500, -1.9500) | 0.0000 mm | yes | 0.0000 mm |
| `twin-figure` (LAYOUT.twin) | (-1.2300, 0.0000, -1.5000) to (-0.6700, 1.7500, -1.1000) | (-1.2300, 0.0000, -1.5000) to (-0.6700, 1.7500, -1.1000) | 0.0000 mm | yes | 0.0000 mm |
| `visitor-figure` (LAYOUT.visitor) | (0.4500, 0.0000, -0.3750) to (1.5500, 1.7400, -0.3250) | (0.4500, 0.0000, -0.3750) to (1.5500, 1.7400, -0.3250) | 0.0000 mm | yes | 0.0000 mm |

Every box is within 1 mm of LAYOUT's, to 1e-4 mm. The strict run lists six RG2 findings on 1011b12's own stand-in shapes, which sit outside their pieces' bounds. The tip composes with none of them, and they don't touch the boxes compared.

### T301: the left wall, measured

The measurement stands from commit 628c633, with the camera's eye at 1.15 m. The chalkboard is at offset (-0.26, 1.65), from 1.25 to 2.05 m, 4.96 cm from the front corner. The snowboard is on its tail at (0.4, 0.775), from 0 to 1.55 m, 4.96 cm from the back corner. The camera is 3.580 m back on the reference desktop (from 4.448 m).

- **Snowboard.** Its 3D core is kept at every stage outside FR-064's smallest, with 89.2 px to spare on the desktop and 40.4 px on the phone. In 2D it misses at the scales 0.975 to 1.05, by up to 3.4 px.
- **Chalkboard.** Its 3D core is kept on the reference desktop, with 18.1 px to spare. It misses at 1,049 stages outside FR-064's smallest (widths 312 to 752 px), by up to 24.9 px (6.7 px on the phone). In 2D it misses at every scale from 0.975 to 2.25, the desktop's 2.145 among them, by up to 25.1 px.
- **Bicycle.** Clear everywhere.
- **No layout within D1's description gets both boards their cores.** The snowboard's label box rises to 1.83 m, past the chalkboard's lower edge, and the wall is about 35 px wide at 304 px. Under the rule as it stood, `room:check` refused the scene with 5 RG6 findings. T302's answer then applied (b), and T303 changed the rule, so the report now lists the stages.

Two points of the report read against these numbers. The report counts every list-only stage, and FR-064's smallest class of 65 stages is inside those counts. The arithmetic checks: 1,049 plus 65 is the report's 1,114 for the chalkboard in 3D, and 81 plus 65 is the 146 for the snowboard in 2D.

**The core margins and the slate's foreshortening**, from the implementing session's measurement at 628c633 (its report to the main session, 2026-10-26; the left wall and the camera haven't moved since, and the review's release pass, C1, changed none of the cube's list-only stages). Core margins in CSS pixels, negative where the core is short:

| Board | Desktop | Phone | 304 × 208 | 304 × 640 | 304 × 248 | 312 × 208 | 304 × 624 | 312 × 224 | 320 × 640 |
|---|---|---|---|---|---|---|---|---|---|
| Snowboard, 3D | 89.2 | 40.4 | -0.7 | 23.7 | 7.6 | -0.7 | 24.6 | 2.6 | 29.2 |
| Snowboard, 2D | 45.3 | 3.9 | -4.5 | -4.5 | -4.5 | -3.4 | -4.5 | -3.4 | -2.4 |
| Chalkboard, 3D | 18.1 | -6.7 | -23.8 | -26.8 | -19.9 | -23.8 | -26.3 | -22.2 | -24.9 |
| Chalkboard, 2D | -2.3 | -21.7 | -25.6 | -25.6 | -25.6 | -25.1 | -25.6 | -25.1 | -24.6 |

The chalkboard's slate on the side wall shows 44.6 × 184.0 px on the reference desktop and 26.8 × 115.2 px on the phone: a glyph comes out about 31 to 32% as wide, for its cap height, as it would seen square on. RG7 measures cap height, which passes; the narrowness is a look judgement for lookdev (SC-010), named under "For the Author".

### FR-073: the compositor's report

The report, `npm run room:report -w apps/web` at the tip, is in `/tmp/claude-1000/feat-004-us1/final/room-report.md`. Its piece table has 17 rows: 15 stand-ins and 2 avatars (the twin and the visitor). Its totals are these lines:

- Per piece, the largest against the caps: 0 of 2,500,000 gzip-9 bytes, and 0 of 40,000 triangles.
- Scene texture memory: 59,472,270 of 96,000,000 bytes (models 58,807,632, image cards 0, avatars 0, live-face canvases 664,638).
- First visit, the room's share: 0 gzip-9 bytes of placed models and cards, beside the design's estimate of 12,000,000. The enforced limit is spec 003's phase-3 first visit, 25,000,000.
- The bundle is e32fddc27ece0cc8, a release build. The caps are FR-053's starting figures, because `main` has no room caps.

The two sections the template asks for follow, from the report as printed.

**Legibility (FR-052, SC-010).**

| Face | Readable | Desktop | Phone | Floor | Margin | Status |
|---|---|---:|---:|---:|---:|---|
| `neon-sign.word` | yes | 17.0 px | 10.7 px | 9 | 1.7 px | readable |
| `neon-sign.call` | yes | 11.2 px | 7.1 px | 9 | -1.9 px | exempt on the phone, carried by the text copy's "Around the room" |
| `neon-sign.visit` | yes | 11.2 px | 7.1 px | 9 | -1.9 px | exempt on the phone, carried by the text copy's "Around the room" |
| `neon-sign.second-line` | no | 5.9 px | 3.7 px | 9 | -5.3 px | atmosphere (max 43) |

**Side-wall selectables (FR-064).** The room draws no pick area for them at the stages named, and the "In the room" list reaches them.

| Selectable | 3D | 2D |
|---|---|---|
| `snowboard` (left-wall) | list-only at 304 × 208 and 38 others | list-only at 304 × 208 and 145 others |
| `chalkboard` (left-wall) | list-only at 304 × 208 and 1113 others | list-only at 304 × 208 and 1611 others |

The report also prints the laptop's switch cases and poses (apart on both reference stages) and "Findings: none."

### T115: quickstart Q3's agents' checks

The full summary is in `/tmp/claude-1000/feat-004-us1/final/t115.md`, and the whole logs are beside it. It was run on 2026-10-26, on the tip 0db136c. The commit after it, 73d4527, ticks T115 and changes nothing else. Q3 step 7 (`make up ENV=dev-cpu`) was not run, as the review's brief left it out. The summary follows.

> ## 1. The compositor's two checks, on the tip
>
> `room: 0 findings in 0 files` and `room: 0 hits`, each exit 0.
>
> ## 2. The proof set by hand
>
> The edits, all under `apps/web/room/`:
> - **The move:** the artwork's mount offset from `[0.8, 1.9, 0.065]` to `[0.78, 1.9, 0.065]` on the back wall.
> - **The addition:** `catalog/wall-clock.yaml`, a 0.3 m box stand-in, estimated; a placement `wall-clock` on the shell's `right-wall` anchor at `[0.45, 0.25, 0]`, estimated, framed, `label: label.wall-clock`, with its UI word; a selectable `wall-clock`, "Wall clock"; and a topic `room-tour`, "the room itself", quoting the intent, its corpus `corpus/07-room-tour.md`.
> - **The retarget:** the `bicycle` selectable from `hobbies-and-travel` to `work-projects`.
>
> Where the clock hangs was chosen by a throwaway probe. On the back wall, every spot tried was refused by RG6 (the room is full there at small stages). High on the right wall, the clock composed clean but was list-only at all 1,727 stages, the reference desktop's among them, and the review's new guard (C3, data-only.test.ts: no side-wall selectable list-only in 3D on the reference desktop) would fail that edit, as it should. Low on the right wall, at `[0.45, 0.25, 0]`, it keeps its tap on the desktop and is list-only at 157 stages in 3D and none in 2D, and nothing else's stages change.
>
> Before generating, `room:check` gave five FR-013 freshness findings and nothing else. `room:generate` wrote `config/room-events.yaml`, `config/room-topics.yaml`, `docs/studio/photo-guide.md`, `docs/studio/work-orders/wall-art.md`, and `docs/studio/work-orders/wall-clock.md`; then `room:check` found nothing. `git diff --stat`: 9 files, only data and generated files.
>
> The new piece is a labelled, selectable stand-in: 0 findings; its selectable `{"id":"wall-clock", ...,"side_wall":true}`; its 3D placement labelled, no model, one stand-in shape; its 2D label and hit; the manifest's `standins` giving `no-model`; a work order under `docs/studio/work-orders/`; and its ID in `config/room-events.yaml`. The retargeted `bicycle` keeps its ID and its event (its line in `room-events.yaml` is unchanged; its topic and corpus change in `room-topics.yaml`).
>
> `make -f Makefile check ENGINE_MODE=none-yet` on the proof: 7 PASS, 1 SKIP, 2 PLANNED, 3 FAIL.
> - **toolchain-check: environmental.** Claude Code 2.1.310 against its pin, 2.1.296.
> - **policy: pre-existing.** deploy/compose.yaml's web image isn't pinned by digest, as feat/004-foundation's note records.
> - **test: a flake, then the known four.** In make check, one gateway case failed, `test/contract/local-openai.contract.test.ts` C6's 429 case ("expected true to be false"), a timing case, while the determinism builds ran beside it; so npm stopped there and pytest didn't run. The web workspace passed, 1,592 of 1,592, the data-only proof cases with the clock in the room among them. `make -f Makefile test` again on the same proof: the gateway 789 passed and 12 skipped, the web 1,592 passed, and pytest 2,637 passed with 4 failed, the four `tools/gates/test/test_compose_policy.py` failures feat/004-foundation's note records. No source file was touched.
> - secrets, lint, validate-config, evals, and redteam pass; content-check and matrix are PLANNED; image is SKIP.
>
> The proof set's result: every expectation of Q3 step 3 holds. make check fails only for the environmental and pre-existing reasons above, and the gateway's timing case, which passed on the rerun.
>
> ## 3. The scan, planted
>
> `apps/web/src/room/quality.ts` gained `export const PLANTED_FOR_T115 = "wall-art";` (`t115-plant.diff`). `make -f Makefile test` failed in `test/room/scan.test.ts`, naming the file and the ID: `FR-007 apps/web/src/room/quality.ts:168: holds "wall-art", which only the room's data defines`. Reverted.
>
> ## 4. Determinism
>
> `npm run build -w apps/web` in both copies: the same seven file names under `dist/assets/`; no `dist/a/` in either (no model is set); `room-manifest.json` and `room-data.json` byte-identical; and `diff -r` finds the two `dist/` trees identical.

## Verification

**`make check ENGINE_MODE=none-yet` at 73d4527.** The whole output is in `/tmp/claude-1000/feat-004-us1/final/make-check.log`. The main session fills the block below from that file.

```text
tip 73d4527, /tmp/claude-1000/wt-004-us1
== makefiles-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/makefiles_check.py
makefiles: GNUmakefile holds only its include, and there is no makefile
-> PASS makefiles-check
== githooks-check
reference-transaction: installed
pre-commit: installed
main: a loose ref, which the git hook guards
-> PASS githooks-check
== toolchain-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/toolchain_check.py
tool                     pinned   found    status  where
node                     24.21.0  24.21.0  OK      /home/h4reet/.nvm/versions/node/v24.21.0/bin/node
uv                       0.8.22   0.8.22   OK      /home/h4reet/.local/bin/uv
ruff                     0.16.10  0.16.10  OK      /home/h4reet/.local/bin/ruff
gitleaks                 8.30.1   8.30.1   OK      /home/h4reet/.local/bin/gitleaks
python3                  3.12     3.12.3   OK      /usr/bin/python3
shellcheck               0.9.0    0.9.0    OK      /usr/bin/shellcheck
jq                       1.7      1.7      OK      /usr/bin/jq
pytest                   9.1.1    9.1.1    OK      /home/h4reet/.local/bin/pytest
pyyaml (pytest's)        6.0.3    6.0.3    OK      /home/h4reet/.local/share/uv/tools/pytest/bin/python3
claude code              2.1.296  2.1.310  DRIFT   /home/h4reet/.nvm/versions/node/v22.18.0/bin/claude
lint: eslint             10.12.0  10.12.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/eslint
lint: typescript-eslint  8.71.1   8.71.1   OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript-eslint
lint: typescript         6.0.3    6.0.3    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript
lint: prettier           3.9.9    3.9.9    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/prettier
lint: node               24.21.0  24.21.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node
toolchain-check: 1 of 15 differ from their pins (claude code); see tasks.md T013
make[1]: *** [Makefile:141: toolchain-check] Error 1
-> FAIL toolchain-check
== policy
python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py
FAIL deploy/compose.yaml service web: image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)
compose policy: 1 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
make[1]: *** [Makefile:162: policy] Error 1
-> FAIL policy
== validate-config
npm run --silent -w services/gateway validate-config -- --root "/tmp/claude-1000/wt-004-us1"
validate-config: 0 errors, 0 notes
-> PASS validate-config
== lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
312 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
-> PASS lint
== test
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-004-us1/services/gateway


 Test Files  51 passed (51)
      Tests  789 passed | 12 skipped (801)
   Start at  12:31:23
   Duration  61.86s (tests 95%, import 3%, transform 2%)


> @h4reet/web@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-004-us1/apps/web


 Test Files  57 passed (57)
      Tests  1592 passed (1592)
   Start at  12:32:29
   Duration  16.85s (tests 71%, import 20%, transform 9%)

pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
........................................................................ [  2%]
........................................................................ [  5%]
........................................................................ [  8%]
........................................................................ [ 10%]
........................................................................ [ 13%]
........................................................................ [ 16%]
........................................................................ [ 19%]
........................................................................ [ 21%]
........................................................................ [ 24%]
........................................................................ [ 27%]
.........................................................F..........FFF. [ 29%]
........................................................................ [ 32%]
........................................................................ [ 35%]
........................................................................ [ 38%]
........................................................................ [ 40%]
........................................................................ [ 43%]
........................................................................ [ 46%]
........................................................................ [ 49%]
........................................................................ [ 51%]
........................................................................ [ 54%]
........................................................................ [ 57%]
........................................................................ [ 59%]
........................................................................ [ 62%]
........................................................................ [ 65%]
........................................................................ [ 68%]
........................................................................ [ 70%]
........................................................................ [ 73%]
........................................................................ [ 76%]
........................................................................ [ 79%]
........................................................................ [ 81%]
........................................................................ [ 84%]
........................................................................ [ 87%]
........................................................................ [ 89%]
........................................................................ [ 92%]
........................................................................ [ 95%]
........................................................................ [ 98%]
.................................................                        [100%]
=================================== FAILURES ===================================
____________________ test_the_breach_probe_meets_the_policy ____________________

    def test_the_breach_probe_meets_the_policy() -> None:
        """The probe (tasks.md T144): built from this tree on the pinned base:python, on internal alone, and disclosed."""
        model = real_model()
        lock = cp.parse_lock(REPO / cp.LOCK_FILE)
        assert cp.check_service(PROBE, model["services"][PROBE], model, lock, REPO) == []
        disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
        assert PROBE in disclosed
        # The policy requires its row, as every service's (FR-040).
        found = cp.check_model(model, lock, REPO, disclosed - {PROBE})
>       assert [(f.where, f.rule) for f in found if not f.planned] == [
            (f"{cp.COMPOSE_FILE} service {PROBE}", "disclosure")
        ]
E       AssertionError: assert [('deploy/com...'disclosure')] == [('deploy/com...'disclosure')]
E         
E         At index 0 diff: ('deploy/compose.yaml service web', 'image') != ('deploy/compose.yaml service breach-probe', 'disclosure')
E         Left contains one more item: ('deploy/compose.yaml service breach-probe', 'disclosure')
E         Use -v to get more diff

tools/gates/test/test_compose_policy.py:894: AssertionError
_________________ test_the_real_compose_file_passes_as_written _________________

    def test_the_real_compose_file_passes_as_written() -> None:
        """The raw file, through PyYAML (short-syntax ports, anchors), meets every compose rule too."""
        model = yaml.safe_load((REPO / cp.COMPOSE_FILE).read_text(encoding="utf-8"))
        lock = cp.parse_lock(REPO / cp.LOCK_FILE)
        disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
        found = cp.check_model(model, lock, REPO, disclosed)
>       assert [f for f in found if not f.planned] == []
E       AssertionError: assert [Finding(wher...sha256:...)')] == []
E         
E         Left contains one more item: Finding(where='deploy/compose.yaml service web', rule='image', detail='h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)')
E         Use -v to get more diff

tools/gates/test/test_compose_policy.py:951: AssertionError
___________________________ test_the_real_files_pass ___________________________

tree = PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-61/test_the_real_files_pass0')
capsys = <_pytest.capture.CaptureFixture object at 0x7b786cfe8f20>

    @needs_compose
    def test_the_real_files_pass(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
>       assert cp.run(tree) == 0
E       AssertionError: assert 1 == 0
E        +  where 1 = <function run at 0x7b786cc91260>(PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-61/test_the_real_files_pass0'))
E        +    where <function run at 0x7b786cc91260> = cp.run

tools/gates/test/test_compose_policy.py:965: AssertionError
----------------------------- Captured stdout call -----------------------------
FAIL deploy/compose.yaml service web: image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)
compose policy: 1 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
___________________________ test_end_to_end_refusals ___________________________

tree = PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-61/test_end_to_end_refusals0')
capsys = <_pytest.capture.CaptureFixture object at 0x7b786cfe9e80>

    @needs_compose
    def test_end_to_end_refusals(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
        compose = tree / cp.COMPOSE_FILE
        # gateway-state's own networks line, the first after its name: it alone joins egress below.
        head, name, tail = compose.read_text(encoding="utf-8").partition(
            "  gateway-state:\n"
        )
        assert name and "networks: [internal]\n" in tail
        compose.write_text(
            head
            + name
            + tail.replace("networks: [internal]\n", "networks: [internal, egress]\n", 1),
            encoding="utf-8",
        )
        write(tree / "deploy/stray.env", "A=1\n")
        assert cp.run(tree) == 1
        out = capsys.readouterr().out
        assert (
            "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress"
            in out
        )
        assert "FAIL deploy/stray.env: env file" in out
>       assert "compose policy: 2 refusal(s)" in out
E       assert 'compose policy: 2 refusal(s)' in "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress, the stack's one route out (FR-04... 3 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)\n"

tools/gates/test/test_compose_policy.py:996: AssertionError
=========================== short test summary info ============================
FAILED tools/gates/test/test_compose_policy.py::test_the_breach_probe_meets_the_policy
FAILED tools/gates/test/test_compose_policy.py::test_the_real_compose_file_passes_as_written
FAILED tools/gates/test/test_compose_policy.py::test_the_real_files_pass - As...
FAILED tools/gates/test/test_compose_policy.py::test_end_to_end_refusals - as...
4 failed, 2637 passed in 192.80s (0:03:12)
make[1]: *** [Makefile:234: test] Error 1
-> FAIL test
== content-check
PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch
-> PLANNED content-check (PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch)
== secrets
bash tools/gates/secrets.sh
secrets: gitleaks with /home/h4reet/h4reet-ai/h4reet-ai/.gitleaks.toml, over /tmp/claude-1000/wt-004-us1
== gitleaks: unstaged changes
12:36PM INF 0 commits scanned.
12:36PM INF scanned ~0 bytes (0) in 39ms
12:36PM INF no leaks found
-> PASS unstaged changes
== gitleaks: staged changes
12:36PM INF 0 commits scanned.
12:36PM INF scanned ~0 bytes (0) in 34.7ms
12:36PM INF no leaks found
-> PASS staged changes
== gitleaks: 263 commits since main (23731e14f137..HEAD)
12:36PM INF 263 commits scanned.
12:36PM INF scanned ~5842016 bytes (5.84 MB) in 447ms
12:36PM INF no leaks found
-> PASS 263 commits since main (23731e14f137..HEAD)
secrets: PASS (unstaged changes, staged changes, 263 commits since main)
-> PASS secrets
== evals
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
evals product (fake): 1 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite narration --adapter fake
PASS  narration-agent-watchdog-engineer
PASS  narration-agent-watchdog-non-engineer
PASS  narration-ai-strategy-engineer
PASS  narration-ai-strategy-non-engineer
PASS  narration-change-management-engineer
PASS  narration-change-management-non-engineer
PASS  narration-cht-agent-data-layer-engineer
PASS  narration-cht-agent-data-layer-non-engineer
PASS  narration-cht-agent-engineer
PASS  narration-cht-agent-non-engineer
PASS  narration-cht-codebase-engineer
PASS  narration-cht-codebase-non-engineer
PASS  narration-cht-docker-architecture-engineer
PASS  narration-cht-docker-architecture-non-engineer
PASS  narration-cht-skills-engineer
PASS  narration-cht-skills-non-engineer
PASS  narration-claude-medic-aws-engineer
PASS  narration-claude-medic-aws-non-engineer
PASS  narration-kenya-localization-engineer
PASS  narration-kenya-localization-non-engineer
PASS  narration-national-benchmarking-engineer
PASS  narration-national-benchmarking-non-engineer
PASS  narration-no-code-configuration-engineer
PASS  narration-no-code-configuration-non-engineer
PASS  narration-other-deployments-engineer
PASS  narration-other-deployments-non-engineer
PASS  narration-smart-task-prioritization-engineer
PASS  narration-smart-task-prioritization-non-engineer
PASS  narration-voice-for-cht-engineer
PASS  narration-voice-for-cht-non-engineer
evals narration (fake): 30 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
PASS  CLAUDE.md is 58 lines and 5901 bytes (at most 60 and 6 KB)
PASS  CLAUDE.md names the constitution as superseding it
PASS  REVIEW.md names the constitution as superseding it
PASS  role docs: tools match roles.expected
PASS  role implementer: tools match roles.expected
PASS  role ops: tools match roles.expected
PASS  role red-teamer: tools match roles.expected
PASS  role reviewer: tools match roles.expected
PASS  role spec-writer: tools match roles.expected
PASS  hook .claude/hooks/bash-gate.sh is registered for PreToolUse Bash
PASS  hook .claude/hooks/protected-paths.sh is registered for PreToolUse Edit|Write|MultiEdit|NotebookEdit
PASS  hook .claude/hooks/post-edit-check.sh is registered for PostToolUse Edit|Write|MultiEdit
PASS  hook .claude/hooks/subagent-report-check.sh is registered for SubagentStop (every subagent)
PASS  hook .claude/hooks/content-scan.sh is registered for PreToolUse Edit|Write|MultiEdit
PASS  FR-007: 27 of 27 variables denied by name
agent-config static: 0 failed, 0 planned
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/behavioral.py status
behavioral tier: 13 cases (10 enforcement, 3 conduct), 3 runs each; trigger hash 3f4caf1b916a
PASS  behavioral tier: 2026-10-12T184140Z-fix-000-gate-on-main-4907f2bf42e8 passed for trigger hash 3f4caf1b916a, the newest run for it
agent-config behavioral: pass, 0 planned
python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py
PASS  every relative link resolves: 1355 links in 161 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 20 of 20
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 1355 relative links in 161 files
-> PASS evals
== redteam
python3 -I -B -X pycache_prefix=/dev/null redteam/run.py
PASS  benign-greeting (safe, clean)
PASS  planted-human-claim (unsafe, caught: claims to be human)
redteam: 2 passed, 0 failed
-> PASS redteam
== matrix
bash redteam/forbidden-actions.sh
KNOWN GAP   bash-gate.sh          make $(printf 'aws-%s' login) ENV=prod
KNOWN GAP   bash-gate.sh          t=aws; make "$t-login" ENV=prod
KNOWN GAP   bash-gate.sh          bash deploy/scripts/aws-l?gin.sh
KNOWN GAP   bash-gate.sh          gh pr \<newline>merge 1
KNOWN GAP   bash-gate.sh          make $'aws\x2dlogin' ENV=prod
KNOWN GAP   bash-gate.sh          python3 -c "import importlib; importlib.import_module(\"evals\" + \".run\").main()" --adapter bedrock
KNOWN GAP   bash-gate.sh          cd evals && python3 run.py --suite product --adapter bedrock
KNOWN GAP   bash-gate.sh          python3 /tmp/o.py --stack prod contract-record --adapter bedrock --out /tmp/r.json --reason "a live run"
KNOWN GAP   bash-gate.sh          /tmp/a sso login --profile h4reet-bedrock
KNOWN GAP   bash-gate.sh          python3 -c 'open("tests/test_router.py", "w").write("")'
KNOWN GAP   bash-gate.sh          install -m 0644 /tmp/new.py tests/test_router.py
KNOWN GAP   bash-gate.sh          git checkout HEAD~1 -- tests/test_router.py
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:reviewer         git log -p >&1x
KNOWN GAP   role:reviewer         git log -p >&1x [--agent]
KNOWN GAP   bash-gate.sh          python3 evals/agent-config/behavioral.py run
KNOWN GAP   bash-gate.sh          python3 tools/gates/matrix_canary.py
KNOWN GAP   bash-gate.sh          python3 tools/gates/publish_check.py
KNOWN GAP   bash-gate.sh          git commit $(printf -- '--no-%s' verify) -m wip
KNOWN GAP   bash-gate.sh          $(printf 'cla%s' ude) mcp add fs cmd
KNOWN GAP   bash-gate.sh          python3 -c "import urllib.request as u; u.urlopen('http://127.0.0.1:%d/admin/status' % (18000 + 3))"
KNOWN GAP   bash-gate.sh          make $(printf 'to%s' ols)
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: tools/gates/gate
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: evals/agent-config/static.py
KNOWN GAP   bash-gate.sh          git apply --cached /tmp/gates.patch
KNOWN GAP   bash-gate.sh          git update-index --add --cacheinfo "100644,$(git hash-object -w /tmp/new),tools/gates/gate"
KNOWN GAP   bash-gate.sh          git read-tree --prefix=tools/gates/ feature/x:tools/gates
KNOWN GAP   bash-gate.sh          git read-tree --prefix=evals/agent-config/ feature/x:evals/agent-config
PLANNED     protected-paths.sh    assets/policy/content-approvals.json
PLANNED     protected-paths.sh    assets/policy/resume-header.json
PLANNED     protected-paths.sh    apps/../assets/policy/content-approvals.json
PLANNED     protected-paths.sh    ./assets//policy/resume-header.json
PLANNED     protected-paths.sh    Edit in a linked worktree: assets/policy/content-approvals.json
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: assets/policy/content-approvals.json
--- stage S: the sandbox (SANDBOX_RUNTIME=1, .git/hooks unwritable) ---
NOTE        stage-S-unwritable    ~/.local/state/h4reet: no mask of its own, but it sits on a read-only mount (covered read-only /)
PLANNED     stage-S-unwritable    assets/policy/content-approvals.json has no mask yet: open writable /home/h4reet/h4reet-ai/h4reet-ai (its patch denies it)
PLANNED     stage-S-unwritable    assets/policy/resume-header.json has no mask yet: open writable /home/h4reet/h4reet-ai/h4reet-ai (its patch denies it)
SKIP        stage-S-conn          the SMTP host row: H4_STAGE_S_SMTP_HOST isn't set: it names the alert channel's SMTP host, deploy/env's SMTP_HOST
NOTE        stage-S-conn          npm and 198.18.0.1:2376 (allowed) need the proxy and the engine; proved by stage E and make engine-smoke
--- stage E: the host (folded from /home/h4reet/.local/state/h4reet/agents-engine/prove-report.txt, which proved commit 58bd2327212e at 2026-10-18T00:54:24Z) ---
E1   PASS  (from prove-limits.sh)
E2   PASS  (from prove-limits.sh)
E3   PASS  (from prove-limits.sh)
E4   PASS  (from prove-limits.sh)
E5   PASS  (from prove-limits.sh)
E6   PASS  (from prove-limits.sh)
E7   PASS  (from prove-limits.sh)
E8   PASS  (from prove-limits.sh)
E9   PASS  (from prove-limits.sh)
E10  PASS  (from prove-limits.sh)
E11  PASS  (from prove-limits.sh)
E12  PASS  (from prove-limits.sh)
E13  PASS  (from prove-limits.sh)
E14  PASS  (from prove-limits.sh)
E15  PASS  (from prove-limits.sh)
E16  PASS  (from prove-limits.sh)
KNOWN GAP   bash-gate.sh          sh -c "$(printf 'gi%s pu%s' t sh)"
KNOWN GAP   bash-gate.sh          sh -c 'unset CLAUDE""CODE; git commit -m wip'
KNOWN GAP   bash-gate.sh          e=engine; deploy/agents-engine/$e.sh up
PLANNED     settings.json         the content policy files are write-denied, by the sandbox and by Edit denies (spec 002, T016)
PLANNED (T016): 8 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json
TOTALS      matrix                8 planned (reported, not failing), 1 skipped: stage S's SMTP row has no usable host
REQUIRED    matrix-required       every listed row ran
forbidden-actions (hook layer): 663 passed, 0 failed, 41 known gaps
-> PLANNED matrix (PLANNED (T016): 8 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json)
== image
SKIP: no agents' engine yet: tasks.md T046
-> SKIP image (no agents' engine yet: tasks.md T046)

PASS     makefiles-check
PASS     githooks-check
FAIL     toolchain-check
FAIL     policy
PASS     validate-config
PASS     lint
FAIL     test
PLANNED  content-check  PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch
PASS     secrets
PASS     evals
PASS     redteam
PLANNED  matrix  PLANNED (T016): 8 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json
SKIP     image  no agents' engine yet: tasks.md T046
make check: 7 PASS, 1 SKIP, 2 PLANNED, 0 PENDING, 3 FAIL; failing: toolchain-check FAIL, policy FAIL, test FAIL
make: *** [Makefile:147: check] Error 1
make -f Makefile check ENGINE_MODE=none-yet  879.99s user 199.61s system 281% cpu 6:23.78 total
make check exit=2
```

Its summary line reads `make check: 7 PASS, 1 SKIP, 2 PLANNED, 0 PENDING, 3 FAIL; failing: toolchain-check FAIL, policy FAIL, test FAIL`. Each failure is one of these, and none is a defect in the branch's room code:

- **toolchain-check.** Claude Code 2.1.310 against its pin, 2.1.296. ADR 0023's floor patch is on `main` but not on this branch's base.
- **policy.** `deploy/compose.yaml`'s web image isn't pinned by digest. The pin comes with spec 002's web patch (M9a), as feat/004-foundation's note records.
- **test.** The four failures in `tools/gates/test/test_compose_policy.py`, the same four feat/004-foundation's note records (`4 failed, 2637 passed`). The web workspace passed 1592 of 1592, and the gateway 789 passed and 12 skipped.
- **content-check and matrix** are PLANNED, waiting for spec 002's approvals patch. **image** is SKIP, with no agents' engine yet (tasks.md T046).

**The other final checks at 73d4527** (`/tmp/claude-1000/feat-004-us1/final/final-checks.log`):

```text
tip 73d4527
== npx vitest run

 Test Files  57 passed (57)
      Tests  1592 passed (1592)
   Start at  12:29:15
   Duration  19.21s (tests 72%, import 20%, transform 8%)

== npx tsc --noEmit -p .
tsc exit=0
== npx eslint --max-warnings 0 .
eslint exit=0
== npx prettier --check (the branch's changed files)
Checking formatting...
All matched files use Prettier code style!
prettier exit=0
== room:generate
room: 0 written, 0 removed, 20 unchanged
== room:check
room: 0 findings in 0 files
== room:scan
room: 0 hits
== git status
== services/gateway vitest
 Test Files  51 passed (51)
      Tests  789 passed | 12 skipped (801)
   Start at  12:29:48
   Duration  62.10s (tests 95%, import 3%, transform 2%)

== spec files against fffdb55
(empty above means no difference)
```

The `room:report` run and the `make check` run after the rebase (T118) are appended to this note at that step.

## Rebase plan (T118, I4)

The branch's spec commits are not patch-equivalent to the commits on `spec/004-cube-amend`. They were resolved onto this branch's ticks and §10 bullets. So the rebase will replay them and conflict once the amendment is on `main`. The resolution, agreed in the review:

- For `spec.md`, `data-model.md`, `quickstart.md`, `contracts/`, and the cube-amend note, take `main`'s side. Keep only this branch's ticks and plan.md §10 bullets.
- Skip a commit that ends up empty.
- Then confirm that `git diff main -- specs/004-room-composition/ docs/merge-requests/2026-10-26-spec-004-cube-amend.md` is empty, except for the ticks and §10 bullets.

The commits, with their `spec/004-cube-amend` equivalents:

- 111d131 (0a043e3), c9e9c70 (e1bedcd), ad0aee2 (e68662f), 1575ced (50eb28c), a033dfc (fffdb55).
- 02b646f (9005c7c), 821f3a1 (3719f5d), b724611 (0f8b69e), 80d34ae (934c9dc), 6c7230a (9267b24).

The spec branch also holds c95a0ff, which has no counterpart on this branch. The review's I4 listed five commits from the 0d4cd27 era, not six, and that list is what this plan uses.

## Backlog

Nothing here blocks the merge. Each item goes to a later task or a later note.

- **Compositor and kernel nits.** The stage list is cached twice. `SweptProblem.more` is mutable. An equal-depth tie is settled by scene order. The 2D sweep reruns per stage, though only the scale matters. A 2D reason first met at the smallest scale drops "and N others". A regex in data-only.test.ts matches only "(left-wall, right-wall)".
- **Runtime.** FR-034 against the stand-in labels: a reading that limits FR-034 to faces. A `resume`-action selectable emits only `object_selected` until T207. `.room-around` has no grid area until T171. Outlines aren't stepped down by quality level until T132. Naming.

## Plan §10 departures and superseded messages

**Plan §10 bullets from this branch** (plan.md §10, "Foreseen: the Author's cube" and the bullets above it):

- The camera's eye: `EYE_Y` goes from 1.5 m to 1.15 m (T301; departs from R-08 and T061).
- The cube as it stands (T300, T301, and the review of T116), superseding the figures first drafted.
- M9 may merge before M8 (the Author, 2026-10-26: "2) yes m9 before m8 is fine").
- T302's answer, applied (T303).
- The visitor at x −0.5, and the shell's 2D drawing from the lower camera (the review of T116).
- The release pass, the one side-wall test, RI8's nearer hands, and the 2D fallback when the drawing refuses (the review of T116, C1, C2, R2, and R1).
- The 2D picker reads the stage, not the drawing's box (T299).

**Superseded commit messages**, kept rather than rewritten:

- bc897a6, d8b9c2e, and 4aa2e0a are the local agent's first try. They describe the wider rule: list-only at every stage, and every face of a turn-cost piece exempt. The rules were narrowed in 01ca787 and 71b3d35, then T302's (b) was applied in 5688997 and bf7d3b4.
- 9c81be9 ticked T114 and T115 before the cube. Both were re-done.
- 71b3d35's subject says GREEN, but `room:check` fails until 628c633 and bf7d3b4.

## For the Author

1. **The visitor's position, with D1's table.** D3 put the visitor "nearer the open front and a little left, so the monitor, the sign, and the laptop stay in view". The review measured it per avatar, and x −0.5 is what the branch has now (9e7b63a). The table is the occlusion share of each face's width that the visitor hides, for the stand-in, woman, man, dinosaur, and dog in that order, at z = 0.58:

| Visitor x         | Monitor screen      | Neon word         | Counters (worse)   | Laptop | Snowboard (area)     | Chalkboard list-only stages, 3D |
| ----------------- | ------------------- | ----------------- | ------------------ | ------ | -------------------- | ------------------------------- |
| −0.4 (before)     | 41, 38, 48, 56, 0 % | 23, 0, 25, 0, 0 % | 34, 26, 31, 0, 0 % | 0 %    | 0, 0, 0, 11, 3 %     | 1,114                           |
| **−0.5 (chosen)** | 26, 24, 34, 56, 0 % | 5, 0, 8, 0, 0 %   | 26, 23, 25, 0, 0 % | 0 %    | 0, 5, 8, 18, 11 %    | 1,114                           |
| −0.55             | 20, 16, 26, 56, 0 % | 0 %               | 20, 18, 20, 0, 0 % | 0 %    | 19, 18, 25, 23, 15 % | 1,141                           |
| −0.6              | 13, 10, 20, 56, 0 % | 0 %               | 15, 11, 14, 0, 0 % | 0 %    | 56, 36, 57, 26, 15 % | 1,183                           |
| −0.7              | 0, 0, 6, 48, 0 %    | 0 %               | 4, 1, 3, 0, 0 %    | 0 %    | 96, 80, 92, 31, 15 % | 1,268                           |

At −0.5 a human visitor still hides about a quarter to a third of the monitor screen's width, and a quarter of each counter face. The dinosaur hides 56% of the screen's width at every position from −0.4 to −0.6. Moving further left trades the monitor for the snowboard, and from −0.55 it widens the frame at narrow stages.

   **Ask:** keep x −0.5, move further left and give up the snowboard's clear view, or accept the position as it was. The branch keeps −0.5 until you say.

2. **R1's missing line for a failed 2D drawing.** If the 2D drawing refuses, the room opens with the list and "Around the room", but no UI word gives a line that says why. data-model.md §6.3 closes the UI words' keys, so the view is left empty. Two choices:
   - Add a UI word. That is a spec change to data-model.md §6.3, through the lifecycle. A suggested line, for you to accept or change, is key `flat-failed` with the text "This drawing of the room could not be shown. The list below still works."
   - Keep the empty view, and do nothing.

3. **Look judgements for lookdev (SC-010 and the Author's look).** These are not defects by the tests. They are for your eye on the dev run.
   - The twin covers about 63% of the bicycle, by the review's measure. The two overlap.
   - The 1.5 m neon sign covers much of the window's tree.
   - The chalkboard is list-only in 2D even on the desktop. Its 2D shortfall runs from 0.975 to 2.25 (T301), the desktop's 2.145 among them.

4. **The T118 rebase plan (I4).** The resolution is under Rebase plan above. Say if you would rather the agents skip the spec commits and take `main`'s spec files whole.

5. **`git worktree prune` from the host.** One `git worktree prune` ran by mistake in the agents' session. It removed only the admin files of worktrees whose folders were already gone. No branch was touched. You can finish with `git worktree prune` from the host.

6. **The backlog.** Which of the backlog items should go to a later task, and which should wait for the lookdev run? None of them blocks the merge.

Nothing on this branch changes a permission, a sandbox domain, or the constitution, and nothing is pushed.
