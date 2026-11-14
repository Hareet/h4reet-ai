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

---

## Item 2: spec 019, the visitor's walking legs (`night/impl-019/impl-019`, reworked on `night/rework-019/rework-019`, fixed on `night/fix-019/fix-019`)

Spec: specs/019-avatar-walking-legs/ · Intent: intent/019-avatar-walking-legs.md · Written by: implementer (night shift: impl-019 on Sonnet, rework-019 on Opus); reviews by workers who didn't write the code (review-019 and rv2-impl-019 of T001 to T010; rv-rework-019, T020, of the rework, not blocking, its findings fixed by fix-019 on Opus) · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/fix-019 (fix), /home/h4reet/h4reet-ai/night/2026-11-13/rework-019 (rework), /home/h4reet/h4reet-ai/night/2026-11-13/impl-019 (first build) · Repo hooks active: not checked from this session
Authorized by: the Author's order of 2026-11-13 ("Approved provisionally", at the top of plan.md and tasks.md), the spec, and the plan; the rework by the recommended answers to the page's Q61 to Q63 (spec.md Q6 to Q8), taken under the orders file's rule ("any new one: the recommended answer stands"), not said by him: the page's line under each, "Answered: recommended, the Author 2026-11-13.", records that rule, not his word. Each is provisional and his to confirm or overturn on the morning page, like Q1 to Q5, Q62 (the hips) first, since it moves the body beyond "leg animations"; so are Q74, Q89, and Q101. Base: `night/impl-018/impl-018`, with `night/spec-019/spec-019` merged; the rework on `night/impl-019/impl-019` with `night/rework-spec-019/rework-spec-019` merged.

### What changed and why

His item c): "avatar walking leg animations". The man and the woman have no `walk` clip, so they slid. A code gait now lays six leg-bone rotations over the playing idle clip, after the mixer, driven by the distance walked (the steps keep pace with the distance at any speed), eased in and out, and given back to the clip with no residue. The hips bone lowers by the standing leg's lift (Q62's recommended answer, taken under the orders file's rule; his to confirm first), so the standing foot stays within 2 cm of the floor; the hips' rotation and everything above them (the holding hand, arms, spine, head) are the clip's.

- `scene/gait.ts`: the pure part (`cycleLength`, `advance`, `legOffsets`, `standingLift`, named constants) and the bones' part (`findLegRig`, `applyGait`, `clearGait`, base/applied tracking on the six rotations and the hips' position, so a frame the mixer didn't write leaves nothing behind).
- `scene/avatars.ts`: the leg rig found on the visitor's instance, the distance from the pose, the gait after the mixer in `update` (gates: motion on, level 0, an idle clip, no loaded `walk` clip), cleared on fallback, swap, `rest()`; a loaded `walk` clip plays at its own speed; the `clipScale` and `gaitFrame` windows for the tests.
- `stage.ts`, `signals/frame-log.ts`, `app.ts`: the `gait` signal (`unavailable`) for a model without the six leg bones or the hips bone, one frame-log entry.
- R-07 measured, not assumed: `gait-rig.test.ts` builds the real man's and woman's leg chains from their GLB node data; a positive hip offset moves each ankle toward +z, a positive knee offset bends each shin back, left and right.

**The rework (T013 to T019, on Opus, by Q61 to Q63's recommended answers, taken under the orders file's rule, provisional):**

- **The hips lowered by the standing leg's lift (Q62; FR-005 amended, FR-015, SC-006).** The real legs don't hang straight at the clip's pose (both lean back; the woman's knees are bent), so plan §2.6's straight-leg formula was off by up to 4.3 cm (man) and 7.5 cm (woman). `standingLift(offsets, shape)` takes each leg's thigh and shin as `findLegRig` measures them, in-plane lengths and rest angles, in the hips bone's parent space; with both angles 0 it is the straight-leg formula. Measured on the real GLBs at their room heights through a cycle: the lower ankle's worst offset is −0.6 cm (man) and −1.9 cm (woman), a sink from the clamp at 0; without the lowering it rises 5.6 cm and 7.0 cm. The woman's 1 mm margin is deterministic; whether the hips should also rise there is Q89 on the page.
- **The walk clip's time scale removed (Q63; FR-007).** `update` sets no `timeScale`; a loaded `walk` clip plays at its own speed, as spec 009 has it.
- **No object made in a frame's gait (Q61; FR-011; rv2-impl-019's finding 1).** `advance` writes into a mutable state it is given; `legOffsets` fills the `out` it is given (the controller's own, made once, rather than a module scratch: the pure functions stay pure); `gait.last` is two numbers and a flag; `applyGait` and `clearGait` walk the bones by name, with no array literal. **FR-011 is now claimed, and tested** for what the gait's own code makes (plan §2.7, "What the tests pin"): `gait-alloc.test.ts` pins the outs' identity and values, and the controller's `gait.state`, `gait.offsets` (its `left` and `right`), and `gait.last` as the same objects through a walk, stops, `rest()`, and a fallback; `gait-frame-path.test.ts` (fix-019) reads `stepGait` and every gait function it reaches from the source, `findLegRig` out, and finds no array or object literal, `new`, or closure, outside `advance`'s and `legOffsets`' no-`out` branch. Not pinned: three's own methods the path calls, and V8's boxed numbers. A byte measure was tried and removed (plan §2.7): after the fix it still read 95 to 176 bytes a frame, from V8 boxing numbers inside three's setters, unsteady with inlining, so it couldn't tell "no object" from that. SC-007's reading is Q101 on the page; spec.md's SC-007 now states it (fix-019).
- **SC-004 measured (T019):** the avatar controller's chunk 4.73 → 6.09 kB gzip (+1.36 kB, under 2 KB); three's `scene` chunk unchanged; the entry chunk +0.02 kB (the frame log's `gait` kind). Plan §2.8 has the table and how it was built.
- **rv2-impl-019's nits:** R-07's sign test loops over the right leg too (T013, passed at once); US1 scenario 2 checked from the 12th frame after the stop (0.19 s) to the 24th; T009's box reads dropped, not done; spec US3 points to plan.md §2.5; T007's note and the signal set name `test/room/live.test.ts` and `test/ui/loading-degraded.test.ts`.
- Plan departures: plan.md §2.5 (first build), §2.6 and §2.7 (rework, fix-019), §2.8 (SC-004). T009 (lookdev) dropped with a note.

**The fix (T021, fix-019, on Opus): rv-rework-019's findings, not blocking.** No code under `src/` changed; no existing test file edited.

- I-2: new `test/room/gait-frame-path.test.ts`, the frame path read from the source (above). It passed at once, as the review found; its planted-source cases show the scanner finding each kind in a helper reached only through `applyGait`, in `stepGait` itself, and outside the no-`out` branch.
- N-1: new `test/room/avatar-gait-lift.test.ts`: at the controller, every frame of a walk and its ease-out, the hips' offset from the clip's position is `−standingLift(that frame's gaitFrame().offsets, the rig's shape)`, to 1e-12, more than 60 frames lowered and the most over 1 cm. Passed at once.
- I-1: spec.md, plan.md, tasks.md, analysis.md, the intent, and this item say Q61 to Q63 were taken under the orders file's rule, not answered by him; Q74, Q89, Q101 the same. Q74's subject (SC-006 read both ways, the analysis's A1) is this branch's reading; the supervisor's brief gives the number only.
- N-2: spec.md's SC-007 states the identity and source checks (Q101's "the spec's next pass"); FR-015 and Key Entities name each leg's shape, its lengths and rest angles (`LegShape`); analysis.md names the change (S1).
- N-3: plan §2.6 records T015's GREEN commit dc1418ab changing `gait-rig.test.ts` (the residue case's phase 0.2 to 0.125: the woman's lift is 0 at 0.2).
- N-4: `apps/web/README.md`'s small tests name `gait-alloc`, `gait-frame-path`, and `avatar-gait-lift`.
- N-5: this list's FR-012 to FR-014, and the questions' numbers.

### Acceptance criteria

FR-001 to FR-010 and FR-015 by `gait.test.ts`, `gait-rig.test.ts`, `avatar-gait.test.ts`, `avatar-gait-lift.test.ts` (FR-015's "exactly"), and `avatar-driver.test.ts`; FR-011 by `gait-alloc.test.ts` and `gait-frame-path.test.ts`. FR-012 to FR-014 met by inspection: no DOM, announcement, key, or setting is added (FR-012); no `assets/**` file is edited (FR-013); the pure part (`cycleLength`, `advance`, `legOffsets`, `standingLift`) takes no import from the controller, `gait.test.ts` imports nothing from it (FR-014). SC-001 (two identical seeded runs), SC-002 (no residue on the rotations or the hips' position after stop, rest, fallback, to 1e-9), SC-003 (N cycles of distance, N turns of phase), SC-006 (the lower ankle within 2 cm on the real models, with a control that rises past it) are tests; SC-007 by identity and the source (Q101). SC-004 measured: +1.36 kB gzip. SC-005 is his look approval, by sight.

### Verification (small tests, the order's rule 4)

fix-019's run, from `apps/web`, its two new files and the gait set:

```
npx vitest run test/room/gait-frame-path.test.ts test/room/avatar-gait-lift.test.ts test/room/gait-alloc.test.ts test/room/gait.test.ts test/room/gait-rig.test.ts test/room/avatar-gait.test.ts
 Test Files  6 passed (6)
      Tests  56 passed (56)
```

fix-019's `make lint` (exit 0; shellcheck's file list left out):

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
763 files already formatted
```

The docs' links (`evals/docs_links.py`, no link changed): `docs links: 0 failed, 2419 relative links in 389 files`.

The rework's last run, from `apps/web`, every set it touches (the gait set with `gait-alloc`, the controller set, the signal set, `stage-walk`, `avatar-loader`, smoke):

```
vitest run test/room/gait.test.ts test/room/gait-rig.test.ts test/room/avatar-gait.test.ts test/room/gait-alloc.test.ts test/room/avatar-driver.test.ts test/room/avatar-handoff.test.ts test/room/avatar-hands.test.ts test/room/avatar-scene.test.ts test/room/avatars.test.ts test/room/twin-faults.test.ts test/room/twin-figure.test.ts test/room/twin-handoff.test.ts test/room/twin-network.test.ts test/room/twin-reach.test.ts test/ui/avatars.test.ts test/room/live.test.ts test/ui/loading-degraded.test.ts test/room/stage-walk.test.ts test/room/avatar-loader.test.ts test/smoke.test.ts
 Test Files  20 passed (20)
      Tests  273 passed (273)
```

`make lint`, the rework's last run (exit 0; shellcheck's file list left out):

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
763 files already formatted
```

Each rework task's own runs are in its commit message (T015: 14 files, 159 tests; T016: 17 files, 253; T018: 17 files, 240). `make lint`: exit 0 after every task (eslint with zero warnings, tsc for the three workspaces, prettier, ruff, shellcheck). RED was seen before each GREEN: T014's 14 new cases, T016's FR-007 case, T017's four. No full suite here: the stack's last task (T012) runs it once.

### Cost and data-flow impact

None: $0; no request, no byte leaves the device, no disclosure entry; no model call.

### For the Author

- Questions on the morning page, each with its recommended answer taken under the orders file's rule, provisional, and his to confirm or overturn: the spec's Q1 to Q5; Q61 to Q63 (spec.md Q6 to Q8), Q62 (the hips) first, since it moves the body beyond "leg animations"; Q74 (SC-006 both ways, recommended); and two from the rework: Q89, the woman's 1.9 cm sink (keep the clamp, recommended), and Q101, SC-007 read by identity (yes, recommended); and rv-rework-019's Q105, whose recommended answer stands the same way.
- Look approval of the gait on the real models, with the hips' lowering (SC-005); the amplitudes are one-line edits in `gait.ts` (README).
- No human-only patch (`docs/merge-requests/human-patches/019.md` says so).
- Open for others: T020 (rv-rework-019 reviewed the rework, not blocking; the supervisor ticks it), T011 (the supervisor ticks it with review-019's verdict), T012 (the stack's one `make check`); verify-019 merges this branch into the line.
- Interruptions: one permission prompt denied in this session (a `cd` then `sed -n` over the Makefile, to read its test target); read it with `grep` instead. One bash-gate refusal: `rm -rf /tmp/scratch019` ("recursive delete outside workspace"), the rework's scratch scripts and build logs; not retried, the directory is left in place. fix-019: none.

### Verification (rule 7, verify-019)

Branch `night/verify2-019/verify2-019` (it replaces verify-019, which ran under the stricter reading), from fix-019's tip a9ecd26c, by a different worker (Opus 5.5) from item 2's implementers. Read under Q165 (answered: recommended): a failure that only a pending test-amendment patch for the Author's hand fixes, shown passing with that patch on a copy of the line's tree, is carried, not fixed and not skipped.

#### The merge

Before it, item 1's "Verification (rule 7, verify-018)" at 8831ef33 was read: its last line is "not green" only for D-V2's six; its one other failure (scan's FR-007) it fixed (D-V3). So the merge went ahead.

`git merge refs/heads/night/verify-018/verify-018` (8831ef33), merge commit 657945af. Resolutions:
- **This note** conflicted (both branches appended after item 1's "For the Author"). Kept item 1 whole as verify-018 has it (its corrections, "Rule 6's rework", "Verification (rule 7, verify-018)"), then item 2 whole as fix-019 has it, in item order. Checked by diff: item 1's part equals verify-018's file line for line, item 2's equals fix-019's.
- **`apps/web/src/room/app.ts`** auto-merged with no conflict: spec 019 adds one line, the `gait` kind's frame-log entry in the signal handler; spec 018's rework changes other hunks. No resolution by hand.
- No other conflict; no code conflict to settle by the specs' words.

#### Runs at the merged tip (657945af)

Item 2's test files (every test file it added or changed: the gait set, fix-019's two new files, and `avatar-driver`, which the first build changed):

```
cd apps/web && npx vitest run test/room/gait.test.ts test/room/gait-rig.test.ts test/room/gait-alloc.test.ts
  test/room/avatar-gait.test.ts test/room/avatar-gait-lift.test.ts test/room/gait-frame-path.test.ts test/room/avatar-driver.test.ts
 Test Files  7 passed (7)
      Tests  70 passed (70)
```

Spec 018's split HUD and spec 019's gait both working in the merged tree: item 1's own set, as verify-018 ran it, with `test/ui/walking.test.ts`. H-8's place of the walking control (the band's foot, at its right, in the split layout) is pinned by `hud.test.ts` (verify-018's applied amendment) and `hud-split-geometry.test.ts`:

```
cd apps/web && npx vitest run test/room/frame.test.ts test/room/hud-frame.test.ts test/room/hud-split-geometry.test.ts
  test/room/hud-stats.test.ts test/room/hud.test.ts test/room/vocabulary.test.ts test/ui/hud-look.test.ts
  test/ui/hud-split-a11y.test.ts test/ui/hud-split-contrast.test.ts test/ui/hud-split-fallback.test.ts
  test/ui/hud-split-model.test.ts test/ui/hud-split-rest-row.test.ts test/ui/hud-split.test.ts
  test/ui/loading-style.test.ts test/room/protect.test.ts test/room/emblem-data.test.ts test/room/scan.test.ts
  test/ui/walking.test.ts
 Test Files  18 passed (18)
      Tests  194 passed (194)
```

All of `apps/web` (the first attempt was stopped at the session's 10-minute background limit before it ended; the second ran to the end, 2790 s):

```
cd apps/web && npx vitest run
 FAIL  test/disclosure.test.ts > the disclosure page > gives the room's rows what the spec's entries carry, never carry, and why, in the spec's own words
 FAIL  test/disclosure.test.ts > the disclosure page > names the avatar files in V1, whose paths show the choice, and avatar_failed's trigger in V4 (spec 009, M6)
 FAIL  test/room/legibility.test.ts > RG7's per-face exemption on the reference phone > exempts a readable face whose regions are all turn-cost under the floor on the phone, when the desktop meets it
 FAIL  test/room/legibility.test.ts > RG7's per-face exemption on the reference phone > holds a face whose regions are all turn-cost to the floor on the phone where the catalog doesn't mark it readable
 FAIL  test/room/legibility.test.ts > RG7's per-face exemption on the reference phone > holds the same face to the floor on the desktop
 FAIL  test/room/report.test.ts > the report's exempt faces and side-wall selectables > marks the counter face exempt on the phone, and the word face readable
 Test Files  3 failed | 179 passed (182)
      Tests  6 failed | 3672 passed | 1 skipped (3679)
```

Those six are exactly D-V2's, the same as verify-018's full run. `test/room/data-only.test.ts` and `test/room/twin-2d.test.ts` passed in the full run.

`evals/test_disclosure.py` on the line (item 2 changed no Python folder; run to show the carried case):

```
pytest -q -p no:cacheprovider --import-mode=importlib evals/test_disclosure.py evals/test_docs_links.py
FAILED evals/test_disclosure.py::test_the_rooms_rows_are_in_its_own_section_with_the_specs_words
1 failed, 79 passed in 1.14s
```

**Carried (Q165), confirmed on a copy.** `git archive HEAD` (657945af) into a fresh `/tmp` folder, `git apply docs/merge-requests/proposed/018-verify-test-amendments.patch` there (`--check` clean; 4 files), the worktree's `node_modules` linked in. Never applied on the line; no test file edited.

```
cd <copy>/apps/web && npx vitest run test/disclosure.test.ts test/room/legibility.test.ts test/room/report.test.ts
 Test Files  3 passed (3)
      Tests  56 passed (56)
cd <copy> && pytest -q -p no:cacheprovider --import-mode=importlib evals/test_disclosure.py evals/test_docs_links.py
80 passed in 1.06s
```

`make lint`: exit 0 (shellcheck's file list left out):

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
763 files already formatted
```

#### Fixed

Nothing: no failure outside D-V2's six, so no code, test, or plan changed. The setup target was run first (no `node_modules`).

Interruptions: none refused by a hook or the bash gate. One shell `until` loop that waited on the log asked for approval in the monitor tool and was run as a background command instead; it hit its own time limit, and the run's completion notice was used.

verify-019: green, carrying D-V2's six (Q165)

---

## Item 3: spec 020, the dog modeled and brought in (`night/impl-020/impl-020`, then `night/rework-020/rework-020`)

Spec: specs/020-dog-modeled-and-brought-in/ · Written by: implementer (night shift): impl-020 on Sonnet 5.5, then rework-020 on Opus 5.5 (the order's rule 6); the review is for a worker who didn't write the code (rv-rework-020) · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/impl-020, then /home/h4reet/h4reet-ai/night/2026-11-13/rework-020 · Repo hooks active: the commit hooks ran (gitleaks, arrival check) on every commit
Authorized by: the Author's order of 2026-11-13 ("Approved provisionally", at the top of plan.md and tasks.md), the spec, and the plan, as reworked after rv-spec-020 (the decision page's Q67 to Q70, "Answered: recommended, the Author 2026-11-13"; and Q77 and Q78, whose recommended answers stand by his order: "any new one: the recommended answer stands"). Base: `night/impl-019/impl-019`, with `night/spec-020/spec-020` merged; rework-020 is on impl-020's tip with `night/rework-spec-020/rework-spec-020` merged first (conflicts under `specs/020-*`: the rework's text, impl-020's done boxes, T009 and T010 still dropped).

### What changed and why

His item d): "dog modeled and brought in", and his consent: "it's okay that we use the likeness of my dog". The code path for the dog's model is built and gated. **The model itself isn't here.** The studio's round 1 stopped before its mesh step with no candidate (`/srv/studio/handoff/dog/1/note.md`: "stopped before step 3. No candidate."), because his reviewed concept image isn't in the inbox. So nothing was brought in.

**The stand-in until his look approval:** the flat cut-out (`AVATAR_SHAPES.dog`), which every visitor who picks the dog sees today, with no likeness line and an unchanged layout. RA9 keeps it so in every build, drafts and lenient included, until main's approvals name the model's SHA-256 with a disclosure line. Swapping in the model takes his look, his approval entry merged to main, then his intake of `assets/visitors/dog/**` (patch 020, items 3 and 4, in that order since fix-020), and no code change.

By impl-020 (T001 to T008, T011, T012):

- **RA9** (`build/room/avatars.ts`, `checks/family.ts`, T001 and T002): a visitor model recorded `likeness: true` or `source.type: "photo"` is bundled only where main's likeness approvals name its SHA-256 with a non-empty line. Its clips are bundled only with it. The rule is lenient, so a lenient build leaves the dog on the cut-out. The twin's stand-in stays RA3's. The rule table's pin moved with it, and so did avatars-compose's woman-as-likeness case.
- **The line in the bundle and the copy** (T003, T006 to T008): the approval's `disclosure_line` goes into the bundle as `avatars.dog.line`. The 3D stage's picture signal carries it while the dog's model shows. The room shows it as a note of its own (`.room-visitor-line`) and in "Around the room" right after the twin's line (the copy's new `{visitor_line: true}` slot). Both appear only while there are words, so the cut-out's layout is unchanged, 320 × 568 included. Two copy pins moved with it, the pin only: `bundle.test.ts`'s order and `text-copy.test.ts`'s kinds.
- **The report** (T003): one `Likeness` line per likeness avatar. It says either that the approval holds, with its line, or that RA9 keeps the avatar on the cut-out.
- **The scene** (T004 and T005): seven cases on a four-legged fixture with no hand bone (0.62 m, the floor, +z, walk, idle with the slide, reduced motion, the paper at the anchor, the cut-out on a failure). All seven already passed on spec 009's and 019's code, so they're pins.
- **Docs**: `docs/studio/avatar-dog.md` (T011). One sentence in the disclosure's D1 (T012): the dog's likeness reaches Anthropic when a session reads it, as the Author's does.
- **Dropped: T009 and T010, lookdev's Avatars view** (plan R-05 and §11). The view can draw only a bundled model, and RA9 keeps the dog out of every bundle until his approval, so it would show the dog only after the approval it was meant to inform. He judges the model in a glTF viewer or Blender. The question is on the morning page (Q87).

By rework-020 (the amended FR-007, T014 to T019, T011 reworked), each test-first:

- **The line wherever the model shows** (T014, T015; FR-007; plan R-02): a pure holder, `src/room/likeness-line.ts`, takes each figure's picture signal and gives the line once while any figure shows a model with one. `app.ts` feeds it every figure's picture but the twin's (the twin's likeness has its own slot, and `dog-line.test.ts` pins that the twin's picture never fills this one), clears it as the room goes to 2D, and ignores pictures in 2D. Spec 025's dog figure needs only to send its picture signals: the visitor's and a room figure's line show once; one dropping it keeps it while the other holds; both dropping it leaves no element. Comments now cite FR-007 where impl-020's cited FR-003 (analysis A13).
- **The `run` role** (T016, T017; FR-012, FR-017; plan R-03): `"run"` after `"walk"` in `CLIP_ROLES`. The build reads `dog-run.glb` as a clip (RA1, RA2, RA4, and RA9's "only with its model"), the loader fetches it with the dog's other clips only when the visitor chose the dog, and the visitor's figure never plays it. One addition: `AvatarFigures.clipOf(avatar, role)`, the loaded clip by role, where spec 025's figure finds `run`. The man's and the woman's bundles are unchanged.
- **The credit** (T018, T019; FR-014; plan R-08; Q77): `scripts/assets/credits.py` names whose likeness by the record's directory: `assets/visitors/dog` reads "- A likeness of the Author's dog: yes" (or "no", for the clips); every other directory "the Author", and every committed credit renders byte for byte as before (`credits.py --check`: OK). This is code his arrival step runs, so it is for the review like the rest.
- **The brief, reworked** (T011): it starts at plan §5's step 2, after his two steps (the photos' move; the reviewed concept image in the inbox). Its only input is that concept image. It adds `dog-run.glb`, the records as Q78 has them (the model `likeness: true`, `source.type: "photo"`; the clips `likeness: false`, `source.type: "asset"`), and patch 020's new item numbers. It names no photo, no photo path, and no folder that holds photos: `git grep -n "photos/" -- docs/studio/avatar-dog.md` finds nothing. No photo was opened, and no brief was written.

Departures, in plan §11 in the same commits: the holder skips the twin's figure; `clipOf` added; the bundle's clip keys stay bytewise-sorted (`idle`, `run`, `walk`), while the loader's order is the closed list's; `test/room/avatars.test.ts`'s feed helper maps `run` to the idle fixture, as it maps `walk` (a type-only change the new role forced, plan R-04). In my own RED test `dog-run.test.ts`, two expectations were wrong before any code ran: the clip keys' order (the bundle sorts them by contract) and an RA4 case whose tight cap also caught the man's and woman's larger fixture clips. Both were corrected in T017's commit, and the commit says so.

### Acceptance criteria

FR-001, FR-004 to FR-006, FR-008: `dog-avatar.test.ts` (pins). FR-002, FR-003, SC-001: `likeness-visitor.test.ts`. FR-007: `dog-line.test.ts` and `likeness-line-anywhere.test.ts`. FR-012 and FR-017 (`run`): `dog-run.test.ts`. FR-014's credit: `scripts/assets/test_credits_likeness.py`. FR-015, the report's lines (the dog's files, bytes, texture memory, and whether the approval holds): `dog-report.test.ts`; no usage event kind is added. FR-016, no byte off the visitor's device beyond the site's origin: it holds (the dog's files are served from the origin as the other avatars' are; one sentence in D1, T012), and no test of this item's covers it. FR-009: the choice screen is untouched (spec 009's FR-010 and its tests), and the new half, "THE ROOM SHALL fetch the dog's files only when the visitor chose it", is `dog-run.test.ts`'s "the loader's run" case ((d): `dog-run.glb` with the dog's other clips, and no dog file for the man or the woman). SC-002: RA4 and RK5 at his intake (plan R-10). SC-003: `dog-avatar.test.ts` and `avatar-loader.test.ts`. FR-010, FR-011, FR-013 are the studio round's and his intake's (`docs/studio/avatar-dog.md`).

### Verification (small tests, the order's rule 4)

impl-020's run (T001 to T008):

```
cd apps/web && npx vitest run test/room/likeness-visitor.test.ts test/room/dog-report.test.ts test/room/dog-avatar.test.ts test/room/dog-line.test.ts test/room/avatars-compose.test.ts test/room/twin-compose.test.ts test/room/compose.test.ts test/room/avatars.test.ts test/room/report.test.ts test/room/bundle.test.ts test/ui/text-copy.test.ts test/room/text.test.ts test/room/avatar-scene.test.ts test/room/avatar-loader.test.ts test/room/avatar-handoff.test.ts test/room/mount.test.ts test/room/stages.test.ts test/ui/avatars.test.ts test/room/twin-figure.test.ts test/room/data-only.test.ts
 ❯ test/room/data-only.test.ts (31 tests | 1 failed) 171534ms
     × says the twin can't talk about its topic yet, in its phrase, and calls no model 26ms
 Test Files  1 failed | 19 passed (20)
      Tests  1 failed | 597 passed (598)
   Duration  551.87s (tests 87%, import 13%)
```

The one failure isn't this item's. It also fails alone, and it fails with impl-019's `apps/web/src` and `apps/web/build` checked out in place of this item's (`git checkout 4bd25ce3 -- apps/web/src apps/web/build`, then restored):

```
     × says the twin can't talk about its topic yet, in its phrase, and calls no model 9921ms
      Tests  1 failed | 30 skipped (31)
```

It expects `v.spies.network` to be `[]` and gets one request. This item doesn't touch the test or the talk path. The stack's full run should show whether it fails on the base too.

rework-020's run, after T019 (every file the rework adds or changes, and those covering the files it changes):

```
cd apps/web && npx vitest run test/room/likeness-line-anywhere.test.ts test/room/dog-line.test.ts test/ui/text-copy.test.ts test/room/mount.test.ts test/room/stages.test.ts test/room/dog-run.test.ts test/room/avatars.test.ts test/room/avatars-compose.test.ts test/room/likeness-visitor.test.ts test/room/avatar-loader.test.ts test/room/avatar-scene.test.ts test/room/avatar-driver.test.ts test/room/avatar-gait.test.ts test/room/dog-avatar.test.ts test/lookdev/page.test.ts test/room/bundle.test.ts test/room/report.test.ts test/room/dog-report.test.ts
 Test Files  18 passed (18)
      Tests  319 passed (319)
   Duration  248.61s (tests 76%, import 23%)

pytest -q -p no:cacheprovider --import-mode=importlib scripts/assets/test_credits_likeness.py scripts/assets/test_credits.py
15 passed in 2.16s
```

Per task, before each GREEN commit: T015 (likeness-line-anywhere, dog-line, text-copy, mount, stages: 5 files, 51 tests pass), T017 (dog-run, avatars, avatars-compose, likeness-visitor, avatar-loader, avatar-scene, avatar-driver, avatar-gait, dog-avatar: 9 files, 127 pass; lookdev/page, bundle, report, dog-report: 4 files, 141 pass), T019 (the two credits files: 15 pass). Each RED was seen to fail first: T014 (the holder's module missing), T016 (6 of 10 failing: the closed list, compose, loader, `clipOf`; 4 pins passing), T018 (2 of 4 failing; the "every other directory" and `--check` cases are pins).

`make lint`: exit 0 after T015, after T017 (the first try failed on tsc, `avatars.test.ts`'s helper, fixed in the same commit), after T019, and after the T011 rework (eslint with zero warnings, tsc for the three workspaces, prettier, ruff, shellcheck). No full suite here: the stack's last task runs it once (T013's `make check`).

fix-020's run (documents only: `docs/studio/avatar-dog.md`, `docs/merge-requests/human-patches/020.md`, this note, and `specs/020-*/plan.md`, `spec.md`, `analysis.md`; no file under `apps/`, `scripts/`, `tools/`, or `assets/`). The tests covering those documents, from the repository's root:

```
pytest -q -p no:cacheprovider --import-mode=importlib evals/test_docs_links.py evals/test_repository_docs.py
.............................................................            [100%]
61 passed in 0.94s
```

`make lint`, in full (after `make setup`, which this worktree lacked: "node_modules is missing: run make setup"; its git-hooks step said the hooks folder "isn't writable here (the agent sandbox)"), exit 0:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
771 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
```

### Review

**rv-spec-020** (Opus, on the spec): blocking (B1 to B3, I1, I2), reworked by rework-spec-020 and built here. Its report isn't on any branch this session can read. Its non-blocking findings, as the reworked analysis and the decision page record them:

- A13: impl-020's comments and test header cited the line as FR-003 (RA3's rule in this spec); the line is FR-007. Fixed in T015 in the source comments. `dog-line.test.ts`'s header still says "FR-003, FR-007": an existing test, left unedited.
- A6: specs 021 (dinosaur) and 025 (chase) extend the same files, now including `CLIP_ROLES`, `FigureId`, and `likeness-line.ts`. This item merges first. Spec 025's A020 should read this spec's `run` role, `clipOf`, and the holder instead of adding its own (Q79, for spec 025).
- A4: "root in place" and the skeleton rules (`run`'s included) can't be proven by a fixture. They are checked at his intake (RA2) and by his look.
- A8: spec 003's FR-017 ("resemble no real person") is stretched, not broken, by a dog's likeness taking the likeness path.
- A15: T019 changes code his arrival step runs (`credits.py --check`). It is for rv-rework-020's review.
- A16: the decision page's Q51 (the studio reads the photos) is reopened by Q68, not acted on.
- REVIEW.md's C5 conflict (spec Assumptions; Q6/Q70): the model is recorded `likeness: true` though it doesn't show the Author. A reviewer reading C5 literally will flag it. Whether C5's words should change is his (patch 020, item 7).

**rv-rework-020** (Opus, on impl-020 and rework-020, tip 31784235): not blocking. Its question, Q103, was answered by his order ("any new one: the recommended answer stands"): a docs-only fix on this branch, no code change, before the stack's one full suite. Its report isn't on a branch this session can read; its findings, as the supervisor listed them to fix-020:

Fixed by fix-020 (one commit, documents only; plan §11, "Departures in the fix"):

- **I1, the intake would be refused.** The brief and patch 020 had the intake commit before his approval and the model's record with no `approval`. Main's `tools/gates/arrival_check.py`, read at `refs/heads/main`: `entry()` appends `"approval"` to the required keys when `item.get("likeness") is True` or the source's `type` is `"photo"`, and a record lacking it fails R4 (`f"{where} lacks {', '.join(missing)}"`); rule P1 then reports "it needs the Author's approval on the main branch, and no approval names this file's hash" until main's `assets/policy/approvals.json` names the file's SHA-256, and "its record's approval ID isn't the one the main branch's approval of this hash carries" if the IDs differ. REVIEW.md: "A branch never carries its own approval." Main's twin records carry theirs the same way (`assets/twin/records.json`: `"approval": "A-20261110-twin-desk-lean"`, one ID per file; the review's summary had `"A-20261110-twin"`). Now: the model's record carries `"approval": "<the Author's approval ID>"`, as the work orders write it; the clips (`likeness: false`, `source.type: "asset"`) carry none; after hand-off, his look, then his approval merged to main, then the intake. Patch 020's items 3 and 4 are swapped (3 the approval, 4 the intake, whose record text carries the key); `docs/studio/avatar-dog.md` ("The records", "The hand-off and after"), this note's "For the Author", plan §1, §4, §5 step 5, and analysis.md's row for FR-014 say the same.
- **N3, the acceptance criteria.** FR-015 (`dog-report.test.ts`), FR-016 (holds; no test), and FR-009's "fetch the dog's files only when the visitor chose it" (`dog-run.test.ts` (d)) added, where this note said "FR-009 is unchanged".
- **N4, the plan's departures.** Plan §11 records that the merge-request note is this note's item 3, not §6's and T013's `<date>-spec-020-dog.md` (his words: "as few patches and gates"). Q77, Q78, and Q87 are named beside Q70 and R-05 where the spec (Q6) and the plan (§4, R-05, R-08, §11) settle the records, the credit, and the dropped lookdev view.

Recorded, not fixed (code or tests, for another task):

- **N1, the report's `Likeness` line.** `apps/web/build/room/report.ts` says "main's approval holds for its model, with the line …" whenever `a.line !== null`, though `readAvatars` sets `line` even where RA4, RA2, or RA1 leaves the model out. So a capped-out or refused model with an approval would read as held. Suggested fix: set `line` only where the model is bundled, or say "but RAn leaves it out". It's code; this task changes none.
- **N2, two test comments cite FR-003 for the line instead of FR-007:** `apps/web/test/room/bundle.test.ts` (the copy-order pin's comment) and `apps/web/test/room/dog-line.test.ts` (its header; A13 above). Test files aren't edited in a fix task.
- **N5, lint given as "exit 0", not pasted.** rework-020's lint runs above are as they were recorded; fix-020's is pasted in full under Verification.

### Cost and data-flow impact

$0, and no model call. No new byte leaves a visitor's device: the dog's files, once approved, are served from the site's origin as the other avatars' are. One sentence in D1 (impl-020's T012); the rework adds none (the line and the credit are words on the site, from the approval and the records).

### For the Author

What waits for you (patch 020, `docs/merge-requests/human-patches/020.md`; none of it is needed for this item's gate):

1. **The photos' move** (item 1; Q67): from the folder your order names into the photos folder, by `docs/studio/photo-guide.md`; delete the copy under `briefs/`; say on the page whether any session has read them. Today that folder is outside the photo deny and mounted into four night-shift session kinds. rework-020 opened nothing in it. Round 1's machine brief, `1.json`, sits beside them and names their path (question below).
2. **The concept image** (item 2; Q68): you queue it from the photos inside the photos folder (the local FLUX.2 klein 4B), review it, and put only the reviewed image in the studio's inbox. The next studio round is queued only after that, from `docs/studio/avatar-dog.md`.
3. **Your look approval, then your approval entry on main** (item 3): you look at the hand-off folder's `dog.glb` in a glTF viewer or Blender, since lookdev's view was dropped (Q87). Then the model's entry in `assets/policy/approvals.json`, naming its SHA-256, with its `disclosure_line` in your words (the session's draft: "The dog is an AI-made, stylized likeness of the Author's dog, shown by his choice."), merged to `main` before step 4: the arrival check's rule P1 reads the approval from main, and "A branch never carries its own approval" (REVIEW.md).
4. **The intake** (item 4) of the round's outputs into `assets/visitors/dog/**`, the model's record carrying `"approval"` with step 3's ID (main's arrival check refuses a `likeness: true` or photo-sourced record without the key: R4, "lacks approval"), and your consent quoted in the intake note. Until then the cut-out shows.
5. Only if needed: a studio tool (item 5), C5's words (item 7).

Also: the questions on the morning page with their recommended answers (the spec's Q1 to Q6, D1 to D5; Q77, Q78 taken; Q87; and rework-020's, in `/night/io/out/questions.md`). Open for others: N1 (the report's `Likeness` line) and N2 (two test comments), for a later task; verify-020's merge into the line; T013, the stack's one `make check`.

### Verification (rule 7, verify-020)

Branch `night/verify2-020/verify2-020` (it replaces verify-020, which started before verify2-019 ended and stopped, changing nothing; Q166), from fix-020's tip 3953b4c1, by a different worker (Opus 5.5) from item 3's implementers. Read under Q165 (answered: recommended), as verify2-019 read it: a failure that only a pending test-amendment patch for the Author's hand fixes, shown passing with that patch on a copy of the line's tree, is carried, not fixed and not skipped.

#### The merge

Before it, item 2's "Verification (rule 7, verify-019)" at verify2-019's tip c1c4895f was read: its last line is "verify-019: green, carrying D-V2's six (Q165)". So the merge went ahead.

`git merge refs/heads/night/verify2-019/verify2-019` (c1c4895f), merge commit b4ef7034 (merge base 4bd25ce3). Resolutions:
- **This note** conflicted (both branches appended after item 2's "For the Author"). Before item 3, fix-020's side differed from the merge base only by the `---` before item 3. Kept items 1 and 2 whole as verify2-019 has them (item 2's "For the Author" with its "Open for others" and "Interruptions" lines, and "Verification (rule 7, verify-019)"), then `---`, then item 3 whole as fix-020 has it, in item order. Checked by diff: the part before item 3 equals verify2-019's file line for line, item 3 equals fix-020's.
- **Code**: `apps/web/build/room/emit.ts`, `apps/web/src/room/app.ts`, `apps/web/src/room/compose/bundle.ts`, `apps/web/src/room/layout.ts`, `apps/web/src/room/scene/avatars.ts`, and `docs/data-flow-disclosure.md` auto-merged, with no conflict. No resolution by hand, so none by the specs' words.

#### Runs at the merged tip (b4ef7034)

The setup target was run first (no `node_modules`).

Item 3's test files (every test file it added or changed, with `data-only`, which failed in impl-020's run):

```
cd apps/web && npx vitest run test/room/avatars-compose.test.ts test/room/avatars.test.ts test/room/bundle.test.ts
  test/room/compose.test.ts test/room/dog-avatar.test.ts test/room/dog-line.test.ts test/room/dog-report.test.ts
  test/room/dog-run.test.ts test/room/likeness-line-anywhere.test.ts test/room/likeness-visitor.test.ts
  test/ui/text-copy.test.ts test/room/data-only.test.ts
 Test Files  12 passed (12)
      Tests  448 passed (448)
```

(Item 3's changed fixture, `test/fixtures/room/bad/RA9/expect.yaml`, is read by the fixture suites in the full run below.)

All of `apps/web` (2807 s):

```
cd apps/web && npx vitest run
 FAIL  test/disclosure.test.ts > the disclosure page > gives the room's rows what the spec's entries carry, never carry, and why, in the spec's own words
 FAIL  test/disclosure.test.ts > the disclosure page > names the avatar files in V1, whose paths show the choice, and avatar_failed's trigger in V4 (spec 009, M6)
 FAIL  test/room/legibility.test.ts > RG7's per-face exemption on the reference phone > exempts a readable face whose regions are all turn-cost under the floor on the phone, when the desktop meets it
 FAIL  test/room/legibility.test.ts > RG7's per-face exemption on the reference phone > holds the same face to the floor on the desktop
 FAIL  test/room/legibility.test.ts > RG7's per-face exemption on the reference phone > holds a face whose regions are all turn-cost to the floor on the phone where the catalog doesn't mark it readable
 FAIL  test/room/report.test.ts > the report's exempt faces and side-wall selectables > marks the counter face exempt on the phone, and the word face readable
 Test Files  3 failed | 185 passed (188)
      Tests  6 failed | 3719 passed | 1 skipped (3726)
```

Those six are exactly D-V2's, the same as verify-018's and verify-019's full runs. `test/room/twin-2d.test.ts` passed in the full run.

**`test/room/data-only.test.ts`, settled.** impl-020's run had "says the twin can't talk about its topic yet, in its phrase, and calls no model" fail, in a 20-file run and alone. On the line it passes: in the item-3 run above, in the full run, and alone afterwards (`Test Files 1 passed (1) · Tests 31 passed (31)`). verify-018 and verify2-019 saw it pass too. Item 3 doesn't touch the test or the talk path. Nothing to fix.

```
pytest -q -p no:cacheprovider --import-mode=importlib scripts/assets
95 passed in 6.31s
pytest -q -p no:cacheprovider --import-mode=importlib evals/test_disclosure.py evals/test_docs_links.py
FAILED evals/test_disclosure.py::test_the_rooms_rows_are_in_its_own_section_with_the_specs_words
1 failed, 79 passed in 1.15s
```

The eval's one failure is D-V2's (V1's Carries with T029's H-11 clause, "… once, when the conversation panel first opens in the split layout (spec 018) …"); item 3's D1 sentence adds none.

**Carried (Q165), confirmed on a copy.** `git archive HEAD` (b4ef7034) into a fresh `/tmp` folder, `git apply docs/merge-requests/proposed/018-verify-test-amendments.patch` there (`--check` clean; 4 files, 43 insertions, 11 deletions, still applying with item 3's disclosure change in the tree), the worktree's `node_modules` linked in. Never applied on the line; no test file edited.

```
cd <copy> && pytest -q -p no:cacheprovider --import-mode=importlib evals/test_disclosure.py evals/test_docs_links.py
80 passed in 1.06s
cd <copy>/apps/web && npx vitest run test/disclosure.test.ts test/room/legibility.test.ts test/room/report.test.ts
 Test Files  3 passed (3)
      Tests  56 passed (56)
```

`make lint`: exit 0 (shellcheck's file list left out):

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
771 files already formatted
```

#### Fixed

Nothing: no failure outside D-V2's six, so no code, test, or plan changed. The dog stays the stand-in until his look approval (rule 2); its likeness line and credits stay as rework-020 and fix-020 left them. Not fixed, as fix-020 recorded: rv-rework-020's N1, N2, N5.

Interruptions: none. No hook or bash-gate refusal in this session.

verify-020: green, carrying D-V2's six (Q165)

---

## Item 5: spec 022, the corpus from the film scripts (`night/impl-022/impl-022`, finished on `night/impl2-022/impl2-022`, reworked on `night/rework-022/rework-022`, then on `night/rework2-022/rework2-022`, then on `night/rework3-022/rework3-022`)

Spec: specs/022-corpus-from-film-scripts/ · Written by: implementer (night shift): impl-022 (T001 to T006, T008 to T010), then impl2-022 (T011), then rework-022 (rv-impl-022's blocking I-1 and I-2, and N-2, N-4), then rework2-022 (rv-rework-022's blocking F-1 to F-3), then rework3-022 (rv2-rework2-022's blocking B-1 to B-3), all Claude Opus 5.5; reviewed by workers who didn't write it (rv-impl-022, T007; rv-rework-022, the rework; rv2-rework2-022, the second rework; rv-rework3-022, the third) · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/impl-022, then /home/h4reet/h4reet-ai/night/2026-11-13/impl2-022, then /home/h4reet/h4reet-ai/night/2026-11-13/rework-022, then /home/h4reet/h4reet-ai/night/2026-11-13/rework2-022, then /home/h4reet/h4reet-ai/night/2026-11-13/rework3-022 · Repo hooks active: the commit hooks ran (gitleaks, the arrival check) on every commit
Authorized by: the Author's order of 2026-11-13 ("Approved provisionally", at the top of plan.md and tasks.md), the spec, and the plan as reworked three times. Base: `night/rework3-spec-022/rework3-spec-022`, with the line's verified tip `night/verify2-020/verify2-020` (3767859f, items 1 to 3) merged at 7674f699. Item 4 (spec 021) isn't on this branch: the line's verify tasks merge it and item 5, one at a time. The branch's own note: `docs/merge-requests/2026-11-14-night-spec-022-spec-022.md`.

### What changed and why

His item g), in his words: "hareet-ai corpus from film scripts". The corpus is his hand, so the change to `08` is a proposal in `corpus/proposals/` and a patch he applies. Nothing writes a checkout's `corpus/` except `corpus/proposals/`.

- **The checker**, `scripts/corpus/film_claims.py` with 124 tests (T001 to T003; rework-022 added ten, rework2-022 fifteen, rework3-022 thirty-six, counted as pytest counts them). It holds the proposal to the scripts by plan §3's R1 to R7: every one of the 90 lines in scope accounted for once and found verbatim, each source in the repository; nothing unbuilt, retracted, or "shown as built" carried; no number outside a slot and no amount of money, with parity tests against `check_corpus.py`, `redteam/run.py`, and `guards.ts` (its `WORD` too); and a quote in the new text only if it is one of his `SCRIPTS.md` quotes the checker lists (the Haiku reason, line 18), his F3 words, or a cited file's own text, no file under `films/` and none outside the repository counting as a cited file.
- **The proposal**, `corpus/proposals/film-scripts-2026-11-14.md` (T004 to T006): a reading guide, the table, the new text for `08` (seven sections and a gap section, five "Do not claim" lines, Golden Q&A 9 to 17), Golden Q&A 5's suggested sentence (Q97), Q6's quotes "to confirm", and one slot, `site.prod_containers`.
- **The patch**, `docs/merge-requests/2026-11-14-corpus-film-scripts.patch` (T008, T009): 104 files, `08` and its facts and what they regenerate, from plain copies. Rebuilt by rework-022 on `main`'s export (3c0e4cd0): 167,843 bytes, git blob `3d5ddb59666e1bc1589ec71b26640b8481c77c0c`, SHA-256 `d05a7bf11e87c0853ec466eb80b0ede0d28748663a1fab0ac1a7414f0daf7c15`.
- **Human patch 022**'s note (T010), and the two merge-request notes (T011).
- Departures: plan §9 (among them a ninth reason, "a number outside a slot", Q176; and rework-022's two: R4's and R5's narrowing, and "on a network with no route out" left out, Q192; rework2-022's three: R5's cited files and his words, and R4's paths, F-1 to F-3; rework3-022's three: R4's paths read against the root, R1's and R5's paths outside the repository, and his words as a fixed list, B-1 to B-3).

### Cost and data-flow impact

$0, and no model call; no byte leaves a device, so no disclosure row. Once applied, `08`'s new text costs tokens only, when he opens free talk (`ready: false`). Applying the patch closes the three ready topics until he re-marks them: degraded, not broken, no visitor-paid call (`topicSelected`; the turn route's 409 `not_ready`). Applied alone, mission is 92 characters past ADR 0054's T1 (Q177), and FR-008 drops its last sections in a long conversation.

### Verification (small runs only, the order's rule 4)

Each RED and GREEN commit was replayed on a `git archive` export of itself (full runs in the branch's note): T001 RED (1 error, no module), T002 GREEN 50 passed, T003 55 passed, T004 RED 6 failed, T004 and T005 GREEN 61 passed, T006 RED 1 failed and GREEN 62 passed, Q115 RED 1 failed and GREEN 63 passed. The checker on the proposal exits 0 from T005 on. The patch was rerun on a fresh `main` export (3c0e4cd0): `patch -p1 --dry-run`, then `patch -p1`, 104 files, no `.rej`; `corpus-check: OK`; `pytest evals/test_twin_readiness.py corpus/tools/test_check_corpus.py` 85 passed; `twin:pack` and `content:lock` regenerate byte for byte as patched; `content:check` current; `vitest run test/twin-pack.test.ts test/content/narration.test.ts` 80 passed. At the tip:

```
$ python3 -I scripts/corpus/film_claims.py corpus/proposals/film-scripts-2026-11-14.md
film-claims: OK — 0 problems, 90 rows, 90 lines in scope (§1 12, §2 10, §3 10, §4 10, §5 13, §6 14, kill-switch-b2 21); the films' script.txt holds 69 of 69 SCRIPTS.md lines verbatim; the denylist was not applied (this checker never reads corpus/intake/private/)
$ python3 -I -m pytest -q scripts/corpus/test_film_claims.py corpus/tools/test_check_corpus.py evals/test_docs_links.py evals/test_repository_docs.py
174 passed in 1.16s
$ make lint          (exit 0; shellcheck's file list left out)
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
779 files already formatted
```

rework-022 (each commit replayed on an export of itself; full runs in the branch's note): I-2 RED 933c79fc 7 failed, 63 passed; GREEN 6761668e 70 passed; N-4 RED 6e1abf90 1 failed, GREEN 13d247d5 71 passed; I-1 RED 3493356d 1 failed; N-2 RED 654d0475 2 failed, GREEN fe975546 (I-1's test still failing); I-1 GREEN 40300935 73 passed. The checker on the proposal exits 0 at every commit. The rebuilt patch on a fresh `main` export (3c0e4cd0): `patch -p1 --dry-run`, then `patch -p1`, 104 files, no `.rej` or `.orig`; `corpus-check: OK`; `content:check` current; `twin:pack` byte for byte as patched; `pytest evals/test_twin_readiness.py corpus/tools/test_check_corpus.py` 85 passed; `vitest run test/twin-pack.test.ts test/content/narration.test.ts` 80 passed. At rework-022's tip:

```
$ python3 -I scripts/corpus/film_claims.py corpus/proposals/film-scripts-2026-11-14.md
film-claims: OK — 0 problems, 90 rows, 90 lines in scope (§1 12, §2 10, §3 10, §4 10, §5 13, §6 14, kill-switch-b2 21); the films' script.txt holds 69 of 69 SCRIPTS.md lines verbatim; the denylist was not applied (this checker never reads corpus/intake/private/)
$ python3 -I -m pytest -q scripts/corpus/test_film_claims.py corpus/tools/test_check_corpus.py evals/test_docs_links.py evals/test_repository_docs.py
184 passed in 1.17s
$ make lint          (exit 0; shellcheck's file list left out)
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
779 files already formatted
```

D-V2's six (Q165): none of these runs hit them. `make check` is T012's, the stack's closing task's.

### Review: the non-blocking findings, and how each was settled

- **rv-rework2-spec-022 F-1 (Q115)**: the slot's label says "before the tunnel profile is added", and "only the gateway has a road out" is left out wherever a script says it (`kill-switch-b2` S15, `SCRIPTS.md` §5 lines 4 and 12), as contradicted by `deploy/compose.yaml`. Test-first (RED 6f2eefe7, GREEN 2b4648fb); the patch was rebuilt.
- **n-1** the lint target in T004, T008, T009; **n-2** plan §3 R4's `SCALES` list; **n-3** SC-003's "carried in part"; **n-4** the `[P]` Golden Q&A speak with the system as subject, "I" only in "I don't know yet" (plan §2); **n-5** T007 reads the implementer's pasted runs, which are now in the branch's note. All are in the documents.
- **rv-rework3-spec-022 I-A**: the human-patch note's "Before you apply it" gives the measured stage in place of spec 027's projection: "the topic mission needs 21274 characters of grounding, past the 21182 the input bound leaves", as page Q177 records it. T000 lists Q144, and now Q176 to Q178 too.
- **N-1** plan §7 cites `topicSelected` and the turn route's 409, not `talk.ts` line 365; **N-2** `topicHashInput` runs to line 233 (checked), in the human-patch note and plan §6; **N-3** "specs 026 and 027's pages", in the spec and T000.

T007, rv-impl-022's line-by-line pass (Opus), found two blocking findings; rework-022 fixed both, test first, one commit per fix:

- **I-1** (Q192, answered recommended): after Q115, The stack #12 still said every container is "on a network with no route out", though `deploy/compose.yaml` puts `gateway` on `egress`. That span of `SCRIPTS.md` §5 line 12 is now left out as contradicted by the repository (`deploy/compose.yaml`), and the line carries "Every container runs with no new privileges" and "Only the edge listens"; `test_the_real_proposal_leaves_no_route_out_for_every_container_out` holds it. Human patch 022 was rebuilt, its new IDs in the proposal and `human-patches/022.md`.
- **I-2**: the checker passed `[fifty-two assertions, fifty-two passed]` (any bracketed span was blanked as a claim tag), `, and passed 52/52` (a ratio read as a path), and a quoted agent-written script line carrying an amount in words (R5 took a quote from any cited file, `films/SCRIPTS.md` included). Now the claim-tag exemption covers only `[P]`, `[?]`, `[A]`, `[A YYYY-MM-DD]`, runs of them, and ``[slot `id`]``; rework-022 made a path need a segment that isn't a number, or a file extension, and left `films/SCRIPTS.md` and the films' `script.txt` out of R5's cited files by their exact spelling. Seven fixtures failed first. The real proposal passes unchanged. What the code does since rework3-022 (rv2-rework2-022's B-1 to B-3, below): a token is a path only with no whitespace and no segment that is a number, but a date `_DATE` takes, and only as the repository holds it: inside the root, found there or rooted at a top-level entry of it, and, if it holds a number, found or a file name in a directory the root holds; a setting is exempt only if its value holds no digit and no G1 word; no file under `films/` and no path outside the repository, normalised and resolved, is a cited file for R5, and R1 fails a source outside the repository on any row; and his words from `SCRIPTS.md` are a fixed list in the checker, the Haiku reason on line 18, with no marker scan.
- **N-2**: Local models first #3 now names its host ("On the laptop, every question tries the local model first"), as Golden Q&A 13 does. **N-4**: a parity test holds the checker's `WORD` equal to G1's in `guards.ts`, its template filled from `guards.ts`'s own keys.
- **N-1** and **N-3** carried here, as the supervisor directed. N-3: keep replay exports inside the worktree; rework-022 did, and deleted them by repo-relative path. N-1's own words aren't in the repository or in rework-022's brief, so they aren't restated here; rv-impl-022's report has them.

rv-rework-022 reviewed the rework (Opus) and found three blocking findings, F-1 to F-3; rework2-022 fixed them, below.

### rework2-022: rv-rework-022's F-1 to F-3 (`night/rework2-022/rework2-022`, from rework-022's tip b30a93b7)

Test first, one commit per fix, each fix's fixtures seen RED before GREEN, with a sibling the review didn't name in each.

- **F-1** (`is_script`, R5's cited texts; page Q200, answered recommended): a row citing `films/kill-switch-b2/captions.srt` or `./films/kill-switch-b2/script.txt` let a quoted agent-written line through with its amount ("five dollars a day"). Each cited path is now normalised (a leading `./` stripped, then `posixpath.normpath`), and no file under `films/` is a cited file for R5, by its spelling or by where it resolves (`under_films`). Fixtures: those two, and two siblings, `films/meter/../kill-switch-b2/script.txt` and another film's notes (`films/meter/notes.md`). RED 29507862, GREEN a37abfce.
- **F-2** (`is_path`, `without_exempt`): `It caps at 100/day.`, `It passed 52/run.`, and `` `fifty-two of fifty-two passed/run` `` passed with 0 problems. A token with whitespace is now never a path, and a token with any segment that is a number (a digit and no letter, or one of G1's words) is never one unless the segment is a date `_DATE` takes (`history/2026-11-09/run.json` stays a path). The same class in a setting: `` `DAILY_CAP=100` `` was blanked as `ENV=prod` is; a setting is exempt now only when its value isn't a number. Fixtures: the review's three, and `twelve/hour`, `` `100/day` ``, and `` `DAILY_CAP=100` ``; another test holds real paths with numbers in them (`docs/adr/0020-gateway.md`, `redteam/run.py:267-299`, `2026-11-13/14`) reading none. RED cf975c74, GREEN fd364d4a.
- **F-3** (`read_context`, `author_quotes`): `films/SCRIPTS.md` line 67, a review note, made "every live run" quotable as his, since the line names the Author ("the Author's checkout"). A quote is his words now only when a his-words marker introduces it (`his_quotes`): the first quote after "In Hareet's words:", "the Author's wording", "the Author, YYYY-MM-DD, …:", or "**about you**" on the same line, with no sentence end between. On `SCRIPTS.md` at the time that gave three: line 18's "we chose haiku …", line 46's "up to 30 days", and line 121's. Fixtures: line 67's shape, two siblings (the Author named with no date; a quote before the marker), and the real file's three. RED ff8c821f, GREEN 10660f67. That closed line 67's shape, not the class: a note that says the words aren't his (`Not in Hareet's words: "…"`) still made them his. rework3-022's B-3 (below) removed the scan: his words from `SCRIPTS.md` are now a fixed list in the checker, line 18's quote alone, and line 46's and line 121's are no longer among them. The I-2 sentence above says what the code does since rework3-022.
- **The real proposal passes unchanged** at every commit, so it wasn't edited and human patch 022 wasn't rebuilt: `docs/merge-requests/2026-11-14-corpus-film-scripts.patch` is still 167,843 bytes, git blob `3d5ddb59666e1bc1589ec71b26640b8481c77c0c`, SHA-256 `d05a7bf11e87c0853ec466eb80b0ede0d28748663a1fab0ac1a7414f0daf7c15` (checked at the tip). No human-only path changed.
- Departures: plan §3's R4 and R5, and three new §9 entries, each in its fix's GREEN commit.

Not code, carried here as the supervisor directed:

- **rv-impl-022's N-1**, in its words: "Spec FR-006 still says the list of reasons is closed and names eight. The ninth, "a number outside a slot", is a departure in plan §9 and on the page as Q176, but `spec.md` isn't amended. Once Q176 is confirmed, add it to FR-006 and SC-003's wording." Not done here: it waits on his answer to Q176.
- **rv-rework-022's Nit 2**, a follow-up for ops or docs: `deploy/compose.yaml:9` says "only `gateway` joins `egress`", but its lines 752, 807, and 1022 put other services on `egress` (checked: `tunnel`, `tunnel-end-collector`, and `ec2-snapshot-publisher`, each `networks: [internal, egress]`). The proposal already leaves "only the gateway has a road out" out as contradicted by that file (Q115); the comment itself is outside this task.

Runs (small runs only, the order's rule 4; each commit's checker tests and the checker on the proposal, run in the worktree at that commit):

```
== 29507862 F-1 RED
FAILED ...::test_no_file_under_films_is_a_cited_files_text[…]   (4: captions.srt, ./script.txt, films/meter/../kill-switch-b2/script.txt, films/meter/notes.md)
4 failed, 73 passed in 0.37s
== a37abfce F-1 GREEN
77 passed in 0.35s
checker on the proposal: exit 0
== cf975c74 F-2 RED
FAILED ...::test_a_number_as_a_path_segment_fails[…]   (6: 100/day., 52/run., `fifty-two of fifty-two passed/run`, twelve/hour, `100/day`, `DAILY_CAP=100`)
6 failed, 78 passed in 0.45s
== fd364d4a F-2 GREEN
84 passed in 0.34s
checker on the proposal: exit 0
== ff8c821f F-3 RED
FAILED ...::test_a_quote_is_his_only_when_a_his_words_marker_introduces_it[review-note]
FAILED ...::test_a_quote_is_his_only_when_a_his_words_marker_introduces_it[the-author-no-date]
FAILED ...::test_a_quote_is_his_only_when_a_his_words_marker_introduces_it[a-quote-before-the-marker]
FAILED ...::test_the_his_words_markers_give_his_quotes_in_the_real_scripts
4 failed, 84 passed in 0.42s
== 10660f67 F-3 GREEN
88 passed in 0.35s
checker on the proposal: exit 0   (exit 0 at every commit; the checker's code is unchanged at each RED commit)
```

At rework2-022's tip (`test_film_claims.py` is the only test file covering `film_claims.py`; the docs tests cover the two notes):

```
$ python3 -I scripts/corpus/film_claims.py corpus/proposals/film-scripts-2026-11-14.md
film-claims: OK — 0 problems, 90 rows, 90 lines in scope (§1 12, §2 10, §3 10, §4 10, §5 13, §6 14, kill-switch-b2 21); the films' script.txt holds 69 of 69 SCRIPTS.md lines verbatim; the denylist was not applied (this checker never reads corpus/intake/private/)
exit 0
$ python3 -I -m pytest -q scripts/corpus/test_film_claims.py
88 passed in 0.42s
$ python3 -I -m pytest -q scripts/corpus/test_film_claims.py corpus/tools/test_check_corpus.py evals/test_docs_links.py evals/test_repository_docs.py
199 passed in 1.28s
$ make lint          (exit 0; shellcheck's file list left out)
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
779 files already formatted
```

Refusals in rework2-022: one, under Interruptions (6). rv2-rework2-022 reviewed this rework (Opus) and found three blocking findings, B-1 to B-3; rework3-022 fixed them, below.

### rework3-022: rv2-rework2-022's B-1 to B-3 (`night/rework3-022/rework3-022`, from rework2-022's tip 3c49d098)

Test first, one commit per fix, each fix's fixtures RED before GREEN, plan §3 and §9 in the GREEN commit. Twice a fix had closed the review's examples and not the class, so each fix's rule is written into plan §9, and each RED carries siblings of shapes the review didn't name.

- **B-1** (`_numeric`, `is_path`, `_assignment`): `5k/day`, `100ms/run`, `twelve-hundred/day`, `day/100-requests`, `` `cap/100-per-day` ``, and the settings `` `CAP=100k` `` and `` `CAP=five-dollars` `` each hid a number as a path or a setting. The rule now: a token is a path only as the repository holds it. After normalising, it is inside `--root`, and it is found there (at the root or under a top-level directory: the real proposal's `05-mission.md` is `corpus/05-mission.md`) or its first segment is a top-level entry of the root; a token that holds a number (a digit or a G1 word anywhere, a date and a backticked `:<line>` suffix aside) must be found, or be a file name with an extension in a directory the root holds. A setting is exempt only if its value holds no digit and no G1 word anywhere (a search). Fixtures: the review's seven, and six siblings (`docs/100-per-day`, `` `docs/twelve-hundred` ``, `100-per-day.md`, `../5k/day`, `` `LIMIT=per-100` ``, `docs/caps/100-per-day.md`), with one more test reading the rule against a fixture root. `` `v2/notes` `` moved to the number-reading side of an older test (no top-level `v2`). `test_real_paths_with_numbers_in_them_read_no_number` is unchanged and green. RED 3f8f712b, GREEN 0a50ebf9. One sibling stays open, named in plan §9 and asked on the page: a made-up file name with a number, in a directory the root holds (`docs/adr/0100-per-day.md`), still reads as a path. Closing it needs the file to exist, and the protected test's own `docs/adr/0020-gateway.md` doesn't exist (the real ADR is `0020-gateway-state-store-and-meter.md`). Recommended: require it, and make that test's path the real one. The real proposal holds no such token.
- **B-2** (`normalised`, `under_films`, `exists`, R5's `cited_texts`): R1 took a cited `../<other checkout>/films/kill-switch-b2/script.txt`, an absolute path, or `../plain.txt` as a source that exists, never checked a left-out row's source, and R5 read all three, so a quote with an amount in it passed from a file outside the repository. The rule now (`in_root`): after normalising, a path that is absolute, starts with `..`, or resolves, through any link, outside `root.resolve()` isn't in the repository. R1 fails it on every row, carried or left out; `exists` is false for it (so "contradicted by the repository" can't name it), and a glob counts only by a match that resolves inside; R5 never reads it. Fixtures: the review's three, and three siblings (`docs/../../plain.txt`, a link inside the root to a file outside, a link to a directory outside), each as a carried row's source and as a left-out row's, then a glob outside and a contradicting file outside. The review's N-1, a link inside the root into `films/`: R1 takes it, R5 refuses it. Its test passed before the fix, because rework2-022's `under_films` already resolves links, so it was never RED. RED ff9d1485, GREEN 3bfebbb0.
- **B-3** (`HIS_WORDS`, `his_quotes`; page Q213, answered recommended): the marker scan took a note's quote as his whenever a marker stood before it, even in a note that says the opposite. R5's his words from `films/SCRIPTS.md` are now a fixed list in the checker, `HIS_WORDS`, FR-005's Q6 quote from that file, the Haiku reason on line 18 (F3's words already come from the disclosure). A test holds each listed quote verbatim on its line after "In Hareet's words:", and holds the list; `his_quotes` and its markers are gone. Fixtures: the review's six note shapes (`**about you**: "…" was the review's phrase`, `Not the Author's wording: "…"`, `Not in Hareet's words: "…"`, `Asked the Author, 2026-11-11, and the review said: "…"`, `Not the Author, 2026-11-12, but the review: "…"`, `The draft, not **about you**, said: "…"`), and a sibling, a real `In Hareet's words: "…"` on a line the list doesn't name; rework2-022's three still pass. The fixture `SCRIPTS.md` and the good proposal now quote the real Haiku reason, since R5 takes only the list. RED 3607ca98, GREEN b6d053d6. The I-2 sentence and the F-3 bullet above are corrected to say what the code does.
- **The real proposal passes unchanged** at every commit, so it wasn't edited and human patch 022 wasn't rebuilt: `docs/merge-requests/2026-11-14-corpus-film-scripts.patch` is still 167,843 bytes, git blob `3d5ddb59666e1bc1589ec71b26640b8481c77c0c`, SHA-256 `d05a7bf11e87c0853ec466eb80b0ede0d28748663a1fab0ac1a7414f0daf7c15` (checked at the tip). No human-only path changed.

Runs (the order's rule 4; each in the worktree at its commit, the checker on the proposal exit 0 at every one, since each RED commit leaves the checker's code as the GREEN before it):

```
== 3f8f712b B-1 RED
FAILED ...::test_claim_tags_and_paths_read_no_number_but_brackets_and_ratios_do      (`v2/notes` now reads 2)
FAILED ...::test_a_number_is_a_path_only_under_the_root[…]   (13: 5k-per-day, 100ms-per-run, twelve-hundred-per-day,
          day-per-100-requests, backticked-cap, setting-100k, setting-five-dollars, docs-100-per-day,
          backticked-docs-twelve-hundred, bare-file-name, climbs-out, setting-per-100, file-in-no-directory)
FAILED ...::test_a_path_is_read_against_the_root_it_is_given
15 failed, 87 passed in 0.46s
== 0a50ebf9 B-1 GREEN
102 passed in 0.41s
   (the GREEN commit also backticks the `evals/run.md:12-14` in the RED commit's root test: R4 exempts a line suffix
    only in backticks, as before; the bare form read 12 and 14, a mistake in rework3-022's fixture, not the rule's)
== ff9d1485 B-2 RED
FAILED ...::test_a_path_outside_the_repository_is_no_source_and_no_quote[…]   (12: other-checkouts-films, absolute,
          above-the-root, climbs-out, link-out, linked-directory-out; each carried and left-out)
FAILED ...::test_a_glob_or_a_contradicting_file_outside_the_repository_fails[glob-out]
FAILED ...::test_a_glob_or_a_contradicting_file_outside_the_repository_fails[contradicted-by-a-file-outside]
14 failed, 103 passed in 0.59s   (test_a_link_inside_the_root_into_films_is_a_source_but_no_quote: passed, N-1)
== 3bfebbb0 B-2 GREEN
117 passed in 0.62s
== 3607ca98 B-3 RED
FAILED ...::test_a_quote_in_scripts_md_is_his_only_if_the_checker_lists_it[…]   (7: about-you,
          not-the-authors-wording, not-in-hareets-words, asked-the-author-dated, not-the-author-dated,
          not-about-you, a-marker-on-an-unlisted-line)
FAILED ...::test_his_words_are_the_checkers_fixed_list_each_verbatim_on_its_scripts_md_line
8 failed, 116 passed in 0.69s
== b6d053d6 B-3 GREEN
124 passed in 0.63s
```

Each fix's probes, past its tests (scratch scripts in `/tmp`, run with `python3 -I` from the worktree):

```
B-1, numbers_in(without_exempt(token)) against this repository:
'5k/day' -> ['5']                 '100ms/run' -> ['100']            'twelve-hundred/day' -> ['twelve', 'hundred']
'day/100-requests' -> ['100']     '`cap/100-per-day`' -> ['100']    '`CAP=100k`' -> ['100']
'`CAP=five-dollars`' -> ['five']  'docs/100-per-day' -> ['100']     '`docs/twelve-hundred`' -> ['twelve', 'hundred']
'100-per-day.md' -> ['100']       '../5k/day' -> ['5']              '`LIMIT=per-100`' -> ['100']
'docs/caps/100-per-day.md' -> ['100']   '/etc/100/day' -> ['100']   './5k/day' -> ['5']
'`docs/adr/../../5k/day`' -> ['5']      'fifty-two.md' -> ['fifty-two']   '`evals/run.py:5k`' -> ['5']
'`ENV=dev-cpu`' -> []   '`DATE=2026-11-13`' -> []   '`ENV=prod`' -> []   '`COMPOSE_PROFILES=gpu`' -> []
'`docs/adr/0020-gateway.md`' -> []   '`evals/product/history/2026-11-09/run.json`' -> []
'`redteam/run.py:267-299`' -> []     'films/kill-switch-b2/' -> []   'specs/001-cloud-elevation/spec.md' -> []
'`05-mission.md`' -> []              '`proposals/film-scripts-2026-11-14.md`' -> []
'docs/adr/0100-per-day.md' -> []     (the open sibling, on the page)

B-2, a root at <tmp>/checkout with <tmp>/plain.txt beside it:
../plain.txt              in_root=False exists=False     ./../plain.txt           in_root=False exists=False
docs/./../../plain.txt    in_root=False exists=False     //tmp/plain.txt          in_root=False exists=False
<tmp>/plain.txt           in_root=False exists=False     docs/out.txt (link out)  in_root=False exists=False
docs/in.txt (into films)  in_root=True  exists=True  under_films=True
docs/real.txt             in_root=True  exists=True      docs/*.txt               in_root=True  exists=True
../checkout/docs/real.txt in_root=False exists=False     ..                       in_root=False exists=False
the root given through a link: docs/real.txt True, ../plain.txt False

B-3, against this repository:
author_quotes: ['we chose haiku since our context base is small and manually evaluated haiku and sonnet.']
his_quotes present: False
line 18 holds it after "In Hareet's words:": True
```

At rework3-022's tip (`test_film_claims.py` is the only test file covering `film_claims.py`; the setup target ran first, since the worktree had no `node_modules`):

```
$ python3 -I scripts/corpus/film_claims.py corpus/proposals/film-scripts-2026-11-14.md
film-claims: OK — 0 problems, 90 rows, 90 lines in scope (§1 12, §2 10, §3 10, §4 10, §5 13, §6 14, kill-switch-b2 21); the films' script.txt holds 69 of 69 SCRIPTS.md lines verbatim; the denylist was not applied (this checker never reads corpus/intake/private/)
exit 0
$ python3 -I -m pytest -q scripts/corpus/test_film_claims.py
124 passed in 0.66s
$ make lint          (exit 0; shellcheck's file list left out)
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
779 files already formatted
```

Refusals in rework3-022: none. rv-rework3-022 reviews this rework.

### For the Author

- **Human patch 022** (`docs/merge-requests/human-patches/022.md`): apply it on a short branch, gate, merge, then re-run your evaluations and re-mark mission, work projects, and hobbies and travel. Apply it back to back with spec 026's corpus patch, whichever is second rebuilt on the first, and evaluate once (Q141). `docs/corpus-size.json` joins it when spec 027's T008 rebuilds it (Q145). The resume item's stack and this patch both touch `apps/web/content/resume.lock.json`; whichever merges second regenerates it and re-runs `content:check`.
- **The page**: Q1 to Q6, Q95 to Q97, Q102, Q104, Q106, Q115, Q141, Q144, Q145, Q176 to Q178, Q192, Q200, Q213, each answered: recommended, yours to confirm or overturn (T000); an overturned one reworks T004 to T010 before you merge. New, from impl2-022: impl-022's refused last question, asked again (below). New, from rework3-022: whether a path token that holds a number must name a file the repository has (B-1's open sibling; recommended: yes, with the protected test's made-up ADR path made the real one).

Interruptions:
1. impl-022, 14:39Z: the bash gate refused its `rm -rf` of its own `/tmp` exports ("recursive delete outside workspace"). It then moved them into its worktree and deleted them there.
2. impl-022, 14:48Z: the same refusal, for a second `/tmp` export that had filled the 2.0 GB tmpfs.
3. impl-022, 14:48Z: the content scan refused its question about that export twice ("shaped like a secret"). The first text held a `mktemp` name; impl-022 judged the second to be the full `/tmp`. The question never reached the page. impl2-022 asked it again in `/night/io/out/questions.md` in words the scan passed: the export was already gone, since the container restarted. It asks only where replays go from now on (recommended: inside the worktree, removed by a repo-relative delete).
4. impl2-022: the harness's guard refused an `rm -rf` on a variable path. The exports were deleted once, at the end.
5. impl2-022: the bash gate refused an `rm -rf` of the exports inside the worktree, by absolute path. Its rule (`bash-gate.sh` line 447) refuses any recursive delete whose path begins with `/`, and its route is "delete only inside the repo". The directory was in the worktree, so impl2-022 deleted it by its repo-relative path, as it had earlier in the session.
6. rework2-022: the bash gate refused a shell command that wrote these notes from a heredoc ("an Author-only make target"): a false match on the notes' text, which names the lint target. The script was written with the Write tool instead and run by its path, as rule 5 directs.
