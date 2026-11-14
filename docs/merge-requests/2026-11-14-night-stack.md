# The night stack of 2026-11-13 to 2026-11-14

One line of branches, each from the previous item's tip, gated and merged once by the Author. The last task names the stack. Each item adds its section below.

---

## Item 1: spec 018, a better HUD and a load screen (`night/impl-018/impl-018`)

Spec: specs/018-better-hud-and-load-screen/ · Intent: intent/018-better-hud-and-load-screen.md · Written by: implementer (night shift); reviewed by a separate reviewer worker · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/impl-018 · Repo hooks active: not checked from this session
Authorized by: the Author's order of 2026-11-13 ("Approved provisionally", at the top of plan.md and tasks.md), the spec, and the plan.

Branch tip: `git rev-parse night/rework-018/rework-018` since rule 6's rework (below), from impl-018's tip b9378980 through `night/rework-spec-018/rework-spec-018`; impl-018's own tip was `night/impl-018/impl-018`. Base: `night/hud-spec/spec-018`, whose own base is main at 086fea12 or later. One commit per task, `feat(018): T0nn …`, with `wip(…)` save points before them.

### What changed and why

Spec 018's item a): the HUD's placement from the Author's two examples, and a load screen to match. The examples' images are not in the repository; the layout comes from the supervisor's description only (the spec says so), and the art, type, and colours are the room's own.

- **Split layout** (`compose/hud.ts` `splitBoxes`, `HUD_PLACEMENTS.split`): *as impl-018 built it; the rework replaced the 48rem bound with FR-001's rule and moved the resting bar into the bar's band, see "Rule 6's rework" below.* From a landscape window of 48rem, the conversation panel on the left (at most 40rem, within the left half, under the notes' reserve, clear of the walking control) and the list on the right (the column's right 24rem). It is a refinement of the column layout, not a fourth `HudLayout` (plan.md D-I1): the bands, the clear area, and the compositor's checks are unchanged, and the root carries `data-split="on"` beside `data-hud="column"`.
- **The panel** (`hud/split.ts`, `talk.ts`, `app.ts`, `layout.ts`): a bar at rest (title, text box row, Send, talk), the full panel when a conversation starts, a line lands, a piece is chosen, or the larger toggle is pressed: the hint (key cap and "Close"), the emblem, three stats (`hud/stats.ts`: Serving, This call, This visit, from the tier and cost signals), the frame, the log as the body, the text box row, and the portrait. Escape: a turn out stops first, walking stops first, else the panel closes and focus goes to the selected entry. *Reworked: FR-009's seven steps, and focus back to the opener.*
- **The list**: right-aligned; "Back" (while the panel is open) and the label "Select a piece"; the selected entry (focus or target, else hover, else the open piece) larger in the accent, with a stroke above and below and the confirm key cap; every row the same height.
- **Drawn in code**: `hud/frame.ts` (a seeded rough frame and brush stroke, path strings of `M L C Q Z` only), `hud/keycap.ts`. No image, no file, no dependency, no request.
- **Portrait**: spec 016's still through its existing verified fetch (`fetchStill`, now exported from `flat.ts`), once, at the first opening in 3D; the silhouette in 2D and on any failure (plan.md D-I4).
- **Look** (`hud/split.css`): Patrick Hand, IBM Plex Sans, IBM Plex Mono, the glass, `--hud-text`, the neon accent; opaque under reduced transparency or more contrast; forced colours; a fade or nothing under reduced motion.
- **Loader** (`loading/view.ts`, `loading.css`): the card takes the frame and the title's type; the bar, percentage, stage line, hints, ceiling, and tints are unchanged.
- **Words**: 15 new UI words (`hud.select`, `hud.back`, `hud.close`, `key.esc`, `key.enter`, `stat.*`), in `ui-words.yaml`, `ui-keys.ts`, and the compositor's good fixture.

Departures from plan.md, each recorded there (D-I1 to D-I5): the split layout as a refinement; the title being the log's own toggle and the panel opening from the bar by the larger toggle; one existing test amended (`test/ui/hud-look.test.ts`, which now skips the list's entries and the conversation's title in the split layout); the 2D portrait; the review's fixes.

### Acceptance criteria

**Corrected by rule 6's re-review (rv2-impl-018).** impl-018's note said "FR-001 to FR-018 and FR-019 (no span, no event, no request) as built". That was not so:
- **FR-004**: at 1280 × 720, impl-018's split panel left 192 px of scene beside it, and at 48rem none (the walking control's corner alone); its resting bar sat inside the clear area, so the clear area at rest was not the column layout's, against D-I1's own reason.
- **FR-014**: the open panel's title row had no glass behind it, so the title and the hint had no tested contrast over a light scene.
- **FR-019's "no request"**: the panel fetched the twin's still in a 3D visit, a new moment for a disclosed flow that row V1 didn't name (FR-003).
- Also FR-005 (one fixed emblem, not the piece's icon) and FR-006 (the soft keyboard's inset ignored).

After the rework, FR-001 to FR-019 are as built, and SC-001 to SC-004 are met by the tests below, with three expectations of spec 014's tests waiting on the Author (R8). **SC-005, the Author's look approval, is his:** no screenshot was taken (no browser in this session), so the CSS in `hud/split.css` has been checked by tests that read it and by jsdom, never drawn. Expect to rework the spacing and sizes on first sight. A dev-cpu stack (`make up ENV=dev-cpu`) shows it.

### Constitution check

I, V: no new byte leaves the device, $0. II: tests per FR; no model-driven behaviour, so no eval; no telemetry (presentation only, named in the spec). III: provisional approval recorded. IV: no human-only path touched. VI: the examples stay out of the repository. VII: no word about the Author; the stats say nothing of him. VIII: the stand-in line and the AI disclosure are never covered (geometry test).

### Review

By the reviewer agent, which didn't write the code, against REVIEW.md, spec.md, plan.md. Findings and what was done:
1. Escape with the larger view on and focus outside the conversation did nothing: fixed (test added).
2. `build()` not atomic; a throw midway left stray parts: fixed, each part in its own try and recorded as added (test added).
3. `aria-current` stale after leaving the split layout: fixed (test added). Hover also writes it while split is active, as FR-008 and FR-016 say; noisy for a screen reader, left, and a question for the Author if it reads badly.
4. The note was missing: this.
5. A resize rebuilt the open panel and dropped focus: fixed, the frame is redrawn in place (test added).
6. A conversation in a narrow window opened the panel silently for a later wide one: fixed (test added).
7. The loader's frame scrolls with the card where the card scrolls (short windows), and the frame's viewBox is fixed and stretched: left, cosmetic.
Nits: `Split.dispose()` has no caller (the room has no teardown); on touch the hover ended with the press, fixed; the turn's Escape outside the form is swallowed as before.
The reviewer couldn't run the tests or judge the CSS by sight; neither could this session's review of it.

### Verification (small runs only, the order's rule 4)

```
cd apps/web && npx vitest run <the files below>
 Test Files  23 passed (23)
      Tests  380 passed (380)
```
Files: new `test/room/hud-frame`, `hud-stats`, `hud-split-geometry`; `test/ui/hud-split`, `hud-split-a11y`, `hud-split-contrast`, `hud-split-fallback`, `loading-style`; changed `test/room/vocabulary` (the closed key list, 62 → 77) and `test/ui/hud-look`; covering `words`, `hud`, `stages`, `twin-2d` (passed alone and in the run), `hud-notes`, `hud-model`, `hud-a11y`, `hud-faults`, `hud-pointer`, `pause`, `talk`, `talk-turns`; and, per task, the `loading-*` files, `highlight`, `pick`, `walking`, `talk-activity`, all passing when run.

`make lint`: passes (eslint, tsc per workspace, prettier, ruff, shellcheck); no warnings.

**T020: blocked: engine endpoint.** `make build`: the web build ends `✓ built in 30.13s`. The make target then fails at its gateway-image step: `ERROR: Error response from daemon: Client sent an HTTP request to an HTTPS server.` (`deploy/scripts/gateway_image.py`, `docker exited 1`). That is the agents' engine's Docker endpoint refusing the request; the stack changes nothing under `services/` or `deploy/`. **`BUILD OK` was not reached**: the closeout's full run, on the Author's side of the forwarder, should show it.

No full suite here: the stack's last task runs it once.

### Cost and data-flow impact

$0; no storage. **Corrected**: impl-018 said "no request … no new disclosure entry". The panel fetches the twin's still in a 3D visit when it first opens in the split layout, a same-origin file spec 016 serves, now at a moment row V1 didn't name. The rework amends row V1's **Carries** in `docs/data-flow-disclosure.md` with the spec's words (FR-003, H-11; T029).

### For the Author

- Questions on the morning page, each with its recommended answer: Q1 to Q5 of the spec, and three about this build: the split as a refinement (D-I1), the larger toggle as the panel's opener (D-I2), and the one amended test (D-I3).
- Look approval of the HUD and the loader, by sight (SC-005).
- No human-only patch from this item (`docs/merge-requests/human-patches/018-better-hud-and-load-screen.md` says so).
- Left: the loader frame's scrolling (finding 7); no teardown for `Split.dispose()`.

### Rule 6's rework (`night/rework-018/rework-018`, 2026-11-14, Opus 5.5)

The Opus re-reviews of item 1 (rv-spec-018 and rv2-impl-018) blocked it. `night/rework-spec-018/rework-spec-018` reworked the spec, plan, and tasks (T021 to T030), and this branch merged it and did T021 to T029 test-first, with the brief's blocking findings B1 to B3 and its other items. T030, the review by a worker that wrote none of it, is the supervisor's rv-rework-018.

Commits, after the merge of the spec rework (240f4f7a), one per task, with `wip(…)` save points:

| Task | Commit | What |
|---|---|---|
| T021 RED | d139fbf8 | `test/room/hud-split-geometry.test.ts` rewritten to FR-001's rule (an oracle in the test from `hudBoxes`, `notesReserve`, `notesBox`, `unionArea`, and the table), plan §2's boxes at 1392 × 783, 1920 × 1080, 1920 × 1200, 2560 × 1440; new `test/ui/hud-split-model.test.ts` |
| T022 RED | b1095ef3 | spec 014's `test/room/frame.test.ts`: `UNDER` and the 0.5rem case from `compactBoxes(SCREEN).split.list` (R4) |
| T023 GREEN | 15f3c38d | `compose/hud.ts`: the table's `split` (`rest`, `walkGapRem`, `coverMax`; no `minWidthRem`, no `panel.gapRem`), `splitBoxes` by (a) to (e), `SplitBoxes` `{ panel, title, rest, frame, list, walk }`, `compactBoxes` split-aware; `layout.ts`'s `--split-rest-*`, `--split-frame-*`, `--split-title-h`; `test/ui/hud-model.ts`'s `splitModel` |
| T024 RED | fe1475da | `test/ui/hud-split.test.ts`, `hud-split-a11y.test.ts` per plan §13 |
| T025 GREEN | f0b7d5b0 | `hud/split.css` (the rest row in the bar's band; the frame's box; the list's entries scroll; `.split-confirm` takes no pointer), `hud/split.ts` (Escape's seven steps in one capture listener; the opener; the title row's height from the kernel), `app.ts` (the openers; `resumeOpen`) |
| T026 | 2a4ab6a1, f66d22ca | B3: the emblem from `hud/icons.ts` (four pieces and the speech glyph); the portrait's speaker (item d's seam) |
| T027 | d2e12b35, 25c8b3cd | B2: the open panel's title row on the panel's glass; opaque and Canvas forms |
| T028 | 6b8c3175, a1d03024 | B1: the rest row and the open panel's foot above the soft keyboard's inset |
| T029 | this commit | row V1, this section, the corrections above |

Departures from plan.md, recorded there with their commits: D-R1 (`rest.minRem` is 40, the model's finding, not the working 30; non-binding at every split window), D-R2 (`SplitBoxes.title`), D-R3 (`layout.ts`'s properties set in T023 for `tsc`), D-R4 (the three stop items below), D-R5 (how the opener is recorded), D-R6 (the emblem and the speaker).

#### Tests whose expectations changed (plan.md §13), and what each now holds

- `test/room/hud-split-geometry.test.ts` (018): over the sweep, the split layout exactly where FR-001's (a) to (e) hold, its boxes the oracle's, at the default root, a 20-pixel root, and with safe areas; null at 1280 × 720, 1366 × 768, 844 × 390, 768 × 432, 800 × 500, 1024 × 600, 700 × 400, 770 × 330; `compactBoxes` the column or dock layout's where it is null (1280 × 720 pinned to impl-018's probed values); plan §2's boxes and coverage at the four windows; the clear area the column layout's.
- `test/ui/hud-split-model.test.ts` (018, new): the rest row's least width rounds up to `split.rest.minRem`; the list's height with every entry is within `split.list.heightRem`.
- `test/room/frame.test.ts` (**spec 014**, R4): the same rules, measured from the list's box at 1920 × 1200 and at a 20-pixel root.
- `test/ui/hud-split.test.ts` (018): `WIDE` 1920 × 1080; the resize goes to 1280 × 720 and back; the rest row at `--split-rest-*`; the open panel round the frame's box; Escape's order, one case per step; focus back to the opener; a sent turn opens the panel; the emblem per piece; the portrait's speaker; the keyboard's inset at 1400 × 1000.
- `test/ui/hud-split-a11y.test.ts` (018): viewport 1920 × 1080; 200% zoom as 960 × 540 (null), no `minWidthRem`; the title row's glass; the keyboard's inset.
- `test/ui/hud-split-contrast.test.ts`, `hud-split-fallback.test.ts` (018): the title row's glass and every open-panel text rule on a glass; the emblem's fallback.

#### Stopped: three expectations of spec 014's tests that §13 missed (R8)

Run in T023: `test/room/hud.test.ts` "gives the strip, the bar, the column or the dock, and the walking control, each inside its band" counts four boxes at rest, and "puts it at the column's head … from 1280 × 720" pins W19's place and `all` at 1920 × 1080, 1920 × 1200, and 2560 × 1440; `test/room/protect.test.ts`'s "records the boxes at the reference desktop's window" snapshots `compactBoxes(1920 × 1200).all`. All three follow from FR-004 and Amendments H-6 and H-8 as written. tasks.md says to stop at such a change, so they are **not edited and fail on this branch**. The amendment is ready: `docs/merge-requests/proposed/018-spec-014-test-amendments.patch`. With it applied (checked, then reverted): `Test Files 2 passed (2) · Tests 27 passed (27)`. It is R8 on the page, with the recommended answer "apply it".

#### Test-first record (the brief's ask)

impl-018, read from its history (`git log night/hud-spec/spec-018..b9378980`):
- **Tests committed with their code, never seen failing**: `test/room/hud-stats.test.ts` and `hud-split.test.ts`'s key cap cases (T003, T004, in e74a17a2 with `keycap.ts` and `stats.ts`); `hud-split.test.ts`'s portrait cases (T010, 90d6582a); and the review's fixes' cases (T018, b9378980).
- **Tests written after their code**: `test/ui/hud-split-a11y.test.ts` and `hud-split-contrast.test.ts` (T013, 5e758428, after `split.css` in bbe6c98f, with no code change of their own, so T014 changed nothing); `test/ui/hud-split-fallback.test.ts` (T015, 1212247c, after the trys `split.ts` already had).
- **Test edits after RED**: `hud-split.test.ts` in T009's GREEN commit (d4e0b83d; the turn's stub now ends on abort, and "opens from the title" became "opens from the bar by the larger toggle", D-I2); `hud-split-a11y.test.ts` (c9103c06, the spacing case's rule narrowed to the open panel's log); `loading-style.test.ts` in T017's GREEN commit (647e63b7, `className` read as the attribute, for the SVG frame).

This rework: every RED commit above was run and seen to fail before its GREEN. Some T024 and T027 cases passed at RED because they pin behaviour impl-018 already had: Escape's steps 1 to 4, 6, and 7; focus back to the entry and to "Larger conversation"; a sent turn opening the panel; the title's colour at 4.5:1 over the glass's colour. They are named in the runs below. No test was edited after its RED commit.

#### Small runs (the order's rule 4)

Per task, `cd apps/web && npx vitest run <files>` and `make lint`:

```
T021 RED   hud-split-geometry (9 failed), hud-split-model (3 failed); lint: tsc fails on the missing kernel fields
T022 RED   frame: FAIL at load (compactBoxes(SCREEN).split undefined)
T023 GREEN hud-split-geometry, hud-split-model, frame, stages, hud, hud-model, hud-notes, legacy-stages, protect,
           resize, flat-frame: Test Files 2 failed | 9 passed (11) · Tests 3 failed | 93 passed | 1 skipped (97)
           (the three stop items); lint: tsc fails only at hud-split-a11y.test.ts:104, the line T024 rewrites
T024 RED   hud-split, hud-split-a11y: Tests 7 failed | 36 passed (43)
T025 GREEN hud-split, hud-split-a11y, hud-split-fallback, hud, hud-a11y, hud-pointer, hud-look, pause:
           Test Files 8 passed (8) · Tests 106 passed (106); pick, highlight, walking, resume-room, talk-turns,
           resize: Test Files 6 passed (6) · Tests 104 passed (104); lint: exit 0
T026 RED   hud-split, hud-split-fallback: Tests 9 failed | 42 passed (51)
T026 GREEN hud-split, hud-split-fallback, hud, hud-split-a11y: Test Files 4 passed (4) · Tests 68 passed (68); lint: exit 0
T027 RED   hud-split-contrast, hud-split-a11y: Tests 3 failed | 14 passed (17)
T027 GREEN hud-split-contrast, hud-split-a11y, test/room/hud-contrast: Test Files 3 passed (3) · Tests 29 passed (29); lint: exit 0
T028 RED   hud-split, hud-split-a11y: Tests 2 failed | 52 passed (54)
T028 GREEN hud-split, hud-split-a11y, hud-a11y, hud-notes, resize, highlight, a11y: Test Files 7 passed (7) ·
           Tests 145 passed (145); credits, loading, loading-a11y: Test Files 3 passed (3) · Tests 46 passed (46); lint: exit 0
```

Once more at the branch's tip, every file above together:

```
cd apps/web && npx vitest run test/room/hud-split-geometry.test.ts test/ui/hud-split-model.test.ts test/room/frame.test.ts
  test/room/stages.test.ts test/room/hud.test.ts test/ui/hud-model.test.ts test/ui/hud-notes.test.ts
  test/room/legacy-stages.test.ts test/room/protect.test.ts test/ui/resize.test.ts test/ui/flat-frame.test.ts
  test/ui/hud-split.test.ts test/ui/hud-split-a11y.test.ts test/ui/hud-split-contrast.test.ts
  test/ui/hud-split-fallback.test.ts test/ui/hud.test.ts test/ui/hud-a11y.test.ts test/ui/hud-pointer.test.ts
  test/ui/hud-look.test.ts test/ui/pause.test.ts test/room/hud-contrast.test.ts test/ui/pick.test.ts
  test/ui/highlight.test.ts test/ui/walking.test.ts test/ui/resume-room.test.ts test/ui/talk-turns.test.ts test/ui/a11y.test.ts
 ❯ test/room/protect.test.ts (4 tests | 1 failed)
     × records the boxes at the reference desktop's window and clear area
 ❯ test/room/hud.test.ts (23 tests | 2 failed)
     × gives the strip, the bar, the column or the dock, and the walking control, each inside its band
     × puts it at the column's head, in the column's band, on landscape windows from 1280 × 720
  Snapshots  1 failed
 Test Files  2 failed | 25 passed (27)
      Tests  3 failed | 361 passed | 1 skipped (365)
```

The three failures are R8's, and nothing else fails.

`make lint` at the tip (T029): exit 0. eslint `--max-warnings 0`, `tsc --noEmit` per workspace, `prettier --check .` ("All matched files use Prettier code style!"), `ruff check`, `ruff format --check` ("757 files already formatted"), and shellcheck all ran clean. No full suite here: the stack's last task runs it once.

#### Deviations named

Principle II (no telemetry and no cost measurement for the split layout) and Development Workflow step 7 (no dashboard panel), as the spec's Assumptions name them: R7 on the page.

#### Questions on the morning page

Q53 to Q60 ("Answered: recommended, the Author 2026-11-13"), and R1 to R7, the spec rework's own, each taken at its recommended answer. New from this branch: **R8**, the three expectations of spec 014's tests (above), recommended "apply the patch".

#### Left, not blocking

- `src/lookdev/stage.ts` draws the column's compact box as the HUD's third box (`c.column ?? c.dock`) and doesn't know the split layout's rest row and list, so the look-development page shows the column layout's HUD at split windows. That is not in plan.md's file map, and lookdev's tests pass.
- `rest.minRem` equals the panel's 40rem cap (D-R1): longer words for the rest row's controls would take the split layout away from every window, and `hud-split-model.test.ts` would say so first.
- Still from impl-018: the loader frame's scrolling (finding 7), and no teardown for `Split.dispose()`.
- The look, by the Author's eye (SC-005), now at 1920 × 1080 (split) and 1280 × 720 (column). No screenshot was possible from this session.

### Verification (rule 7, verify-018)

Branch `night/verify-018/verify-018`, from rework-018's tip 0be0cc91, by a different worker (Opus 5.5) from the item's implementers. Main's tip for the comparisons: 3c0e4cd0, read with `git archive main` into a fresh `/tmp` folder (the bash gate refuses a worktree of main; on the page under Interruptions).

#### The fixes

- **I-1 (Q94, taken as recommended; the Author's to confirm)**: `git apply docs/merge-requests/proposed/018-spec-014-test-amendments.patch` (no hook refused it), with plan.md §13's rows for spec 014's `test/room/hud.test.ts` and `protect.test.ts`'s snapshot, §13's "only `frame.test.ts`" dropped, the file map, SC-002's list, and H-8's "By" (19d06aff).
- **I-2, test-first**: the rest row's text box (`#talk-text`, talk.css's `flex: 1 1 6rem`, no `min-width`) couldn't shrink below the input's own width, so the one-line rest row could overflow its 640 px glass. RED `test/ui/hud-split-rest-row.test.ts` (6bd1e1e9; `Tests 1 failed | 2 passed (3)`: "expected undefined to be '0'"), GREEN `min-width: 0` on the rest row's input in `hud/split.css` (73a08975; `Tests 3 passed (3)`). plan.md D-V1.
- **FR-007 (spec 002), found by the full run, test-first**: `test/room/scan.test.ts`'s "finds 0 IDs only the room's data defines in the room's code" failed with 16 hits: T026's `PIECE_ICONS` in `hud/icons.ts` and item 1's tests keyed the emblem by the selectables' IDs (snowboard, bicycle, laptop, chalkboard), as FR-005 and R-7 said. It passes on main's tip. The emblem is now named by the room's data: a selectable's optional `emblem` (`board`, `wheels`, `screen`, `slate` in `room/scene.yaml`), through the schema, the index, and `createSplit`'s `emblem` option, and `icons.ts`'s `EMBLEM_ICONS` keyed by those names; the speech glyph for none. RED 5013686a (`hud-split` failed at load, `emblem-data` 2 failed, `scan` 4 hits: `Test Files 3 failed | 1 passed (4)`), GREEN 73e065ff (`hud-split`, `hud-split-fallback`, `emblem-data`, `scan`, `schema`, `data-only`, `bundle`: `Test Files 7 passed (7) · Tests 411 passed (411)`). plan.md D-V3, FR-005's parenthetical, R-7, `room/README.md`. **A scene edit**: the Author gives the selectables, so the four emblem names are his to rename.

#### Stopped: six expectations of other specs' tests (D-V2; tasks.md's stop rule)

Each passes on main's tip (`Test Files 5 passed (5) · Tests 104 passed (104)` for report, legibility, scan, disclosure, data-only; `80 passed` for the two eval files) and fails on the line. Each follows from spec 018 as written, so they are **not edited**:
- Row V1's **Carries** with T029's H-11 clause (FR-003): `evals/test_disclosure.py`'s `test_the_rooms_rows_are_in_its_own_section_with_the_specs_words`, and `apps/web/test/disclosure.test.ts`'s "gives the room's rows what the spec's entries carry …" and "names the avatar files in V1 …", pin V1 to spec 002's words and spec 016's M17 exactly.
- The reference desktop's frame area, which eases against the split layout's boxes at rest (H-6, the reason T022 amended `frame.test.ts`): `test/room/legibility.test.ts`'s three RG7 per-face cases (desktop caps 52 → 52.7 and 23.1 → 23.4 px) and `test/room/report.test.ts`'s "marks the counter face exempt on the phone …" (52.1 → 52.7, 23.1 → 23.4 px). The phone's caps are unchanged.

The amendment, all four files: `docs/merge-requests/proposed/018-verify-test-amendments.patch` (`git apply --check` clean at the tip). With it applied to a copy of the line's tree: `test/disclosure.test.ts`, `legibility`, `report`: `Test Files 3 passed (3) · Tests 56 passed (56)`; `evals/test_disclosure.py evals/test_docs_links.py`: `80 passed`. On the page, recommended "apply it".

#### Runs at the tip (cccf5708)

Item 1's test files (every test file the line changed from main, with `protect.test.ts`, the new `emblem-data.test.ts`, and `scan.test.ts`):

```
cd apps/web && npx vitest run test/room/frame.test.ts test/room/hud-frame.test.ts test/room/hud-split-geometry.test.ts
  test/room/hud-stats.test.ts test/room/hud.test.ts test/room/vocabulary.test.ts test/ui/hud-look.test.ts
  test/ui/hud-split-a11y.test.ts test/ui/hud-split-contrast.test.ts test/ui/hud-split-fallback.test.ts
  test/ui/hud-split-model.test.ts test/ui/hud-split-rest-row.test.ts test/ui/hud-split.test.ts
  test/ui/loading-style.test.ts test/room/protect.test.ts test/room/emblem-data.test.ts test/room/scan.test.ts
 Test Files  17 passed (17)
      Tests  189 passed (189)
```

All of `apps/web` (before the FR-007 fix it was `Test Files 4 failed | 171 passed (175) · Tests 7 failed | 3611 passed | 1 skipped (3619)`, the six below and scan's):

```
cd apps/web && npx vitest run
 FAIL  test/disclosure.test.ts > the disclosure page > gives the room's rows what the spec's entries carry, never carry, and why, in the spec's own words
 FAIL  test/disclosure.test.ts > the disclosure page > names the avatar files in V1, whose paths show the choice, and avatar_failed's trigger in V4 (spec 009, M6)
 FAIL  test/room/legibility.test.ts > RG7's per-face exemption on the reference phone > exempts a readable face whose regions are all turn-cost under the floor on the phone, when the desktop meets it
 FAIL  test/room/legibility.test.ts > RG7's per-face exemption on the reference phone > holds the same face to the floor on the desktop
 FAIL  test/room/legibility.test.ts > RG7's per-face exemption on the reference phone > holds a face whose regions are all turn-cost to the floor on the phone where the catalog doesn't mark it readable
 FAIL  test/room/report.test.ts > the report's exempt faces and side-wall selectables > marks the counter face exempt on the phone, and the word face readable
 Test Files  3 failed | 173 passed (176)
      Tests  6 failed | 3615 passed | 1 skipped (3622)
```

`test/room/data-only.test.ts` passed, in the full run and alone; `twin-2d.test.ts` passed in the full run.

```
pytest -q -p no:cacheprovider --import-mode=importlib evals/test_disclosure.py evals/test_docs_links.py
FAILED evals/test_disclosure.py::test_the_rooms_rows_are_in_its_own_section_with_the_specs_words
1 failed, 79 passed in 1.10s
```

`make lint`: exit 0. eslint `--max-warnings 0`, `tsc --noEmit` per workspace, `prettier --check .` ("All matched files use Prettier code style!"), `ruff check` ("All checks passed!"), `ruff format --check` ("757 files already formatted"), shellcheck.

#### Recorded, not fixed (rv-rework-018)

- **I-3**: lookdev's `src/lookdev/stage.ts:446` draws the column's compact box as the HUD's third box (`c.column ?? c.dock`), so at split windows the look-development page shows the hidden column, not the rest row and the list. Judge the look in the dev-cpu stack (`make up ENV=dev-cpu`), not on the lookdev page.
- **N-1**: Escape with a turn out and focus off the form stops nothing.
- **N-2**: the panel opens before `topicSelected`, so a topic that isn't ready shows the previous emblem.
- **N-4**: `splitModel` (`test/ui/hud-model.ts`) was written in T023's GREEN, not with T021's RED.
- **N-5**: `frame.test.ts`'s title, R5 and R6's order, and T020's tick.

verify-018: not green: six expectations of other specs' tests wait on the Author's patch (D-V2, `docs/merge-requests/proposed/018-verify-test-amendments.patch`, on the page); with it applied to a copy of the tree, those six pass, and they are the only failures in the runs above.
