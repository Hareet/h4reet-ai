# The night stack of 2026-11-13 to 2026-11-14

One line of branches, each from the previous item's tip, gated and merged once by the Author. The last task names the stack. Each item adds its section below.

---

## Item 1: spec 018, a better HUD and a load screen (`night/impl-018/impl-018`)

Spec: specs/018-better-hud-and-load-screen/ · Intent: intent/018-better-hud-and-load-screen.md · Written by: implementer (night shift); reviewed by a separate reviewer worker · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/impl-018 · Repo hooks active: not checked from this session
Authorized by: the Author's order of 2026-11-13 ("Approved provisionally", at the top of plan.md and tasks.md), the spec, and the plan.

Branch tip: `git rev-parse night/impl-018/impl-018` (the note is the last commit). Base: `night/hud-spec/spec-018`, whose own base is main at 086fea12 or later. One commit per task, `feat(018): T0nn …`, with `wip(…)` save points before them.

### What changed and why

Spec 018's item a): the HUD's placement from the Author's two examples, and a load screen to match. The examples' images are not in the repository; the layout comes from the supervisor's description only (the spec says so), and the art, type, and colours are the room's own.

- **Split layout** (`compose/hud.ts` `splitBoxes`, `HUD_PLACEMENTS.split`): from a landscape window of 48rem, the conversation panel on the left (at most 40rem, within the left half, under the notes' reserve, clear of the walking control) and the list on the right (the column's right 24rem). It is a refinement of the column layout, not a fourth `HudLayout` (plan.md D-I1): the bands, the clear area, and the compositor's checks are unchanged, and the root carries `data-split="on"` beside `data-hud="column"`.
- **The panel** (`hud/split.ts`, `talk.ts`, `app.ts`, `layout.ts`): a bar at rest (title, text box row, Send, talk), the full panel when a conversation starts, a line lands, a piece is chosen, or the larger toggle is pressed: the hint (key cap and "Close"), the emblem, three stats (`hud/stats.ts`: Serving, This call, This visit, from the tier and cost signals), the frame, the log as the body, the text box row, and the portrait. Escape: a turn out stops first, walking stops first, else the panel closes and focus goes to the selected entry.
- **The list**: right-aligned; "Back" (while the panel is open) and the label "Select a piece"; the selected entry (focus or target, else hover, else the open piece) larger in the accent, with a stroke above and below and the confirm key cap; every row the same height.
- **Drawn in code**: `hud/frame.ts` (a seeded rough frame and brush stroke, path strings of `M L C Q Z` only), `hud/keycap.ts`. No image, no file, no dependency, no request.
- **Portrait**: spec 016's still through its existing verified fetch (`fetchStill`, now exported from `flat.ts`), once, at the first opening in 3D; the silhouette in 2D and on any failure (plan.md D-I4).
- **Look** (`hud/split.css`): Patrick Hand, IBM Plex Sans, IBM Plex Mono, the glass, `--hud-text`, the neon accent; opaque under reduced transparency or more contrast; forced colours; a fade or nothing under reduced motion.
- **Loader** (`loading/view.ts`, `loading.css`): the card takes the frame and the title's type; the bar, percentage, stage line, hints, ceiling, and tints are unchanged.
- **Words**: 15 new UI words (`hud.select`, `hud.back`, `hud.close`, `key.esc`, `key.enter`, `stat.*`), in `ui-words.yaml`, `ui-keys.ts`, and the compositor's good fixture.

Departures from plan.md, each recorded there (D-I1 to D-I5): the split layout as a refinement; the title being the log's own toggle and the panel opening from the bar by the larger toggle; one existing test amended (`test/ui/hud-look.test.ts`, which now skips the list's entries and the conversation's title in the split layout); the 2D portrait; the review's fixes.

### Acceptance criteria

FR-001 to FR-018 and FR-019 (no span, no event, no request) as built; SC-001 to SC-004 by the tests below. **SC-005, the Author's look approval, is his:** no screenshot was taken (no browser in this session), so the CSS in `hud/split.css` has been checked by tests that read it and by jsdom, never drawn. Expect to rework the spacing and sizes on first sight. A dev-cpu stack (`make up ENV=dev-cpu`) shows it.

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

`make build`: the web build ends `✓ built in 30.13s`. The make target then fails at its gateway-image step: `ERROR: Error response from daemon: Client sent an HTTP request to an HTTPS server.` (`deploy/scripts/gateway_image.py`, `docker exited 1`). That is the agents' engine's Docker endpoint refusing the request; the stack changes nothing under `services/` or `deploy/`. **`BUILD OK` was not reached**: the closeout's full run, on the Author's side of the forwarder, should show it.

No full suite here: the stack's last task runs it once.

### Cost and data-flow impact

None: $0; no request, no storage, no new disclosure entry (the still is a same-origin file spec 016 already serves and discloses).

### For the Author

- Questions on the morning page, each with its recommended answer: Q1 to Q5 of the spec, and three about this build: the split as a refinement (D-I1), the larger toggle as the panel's opener (D-I2), and the one amended test (D-I3).
- Look approval of the HUD and the loader, by sight (SC-005).
- No human-only patch from this item (`docs/merge-requests/human-patches/018-better-hud-and-load-screen.md` says so).
- Left: the loader frame's scrolling (finding 7); no teardown for `Split.dispose()`.

---

## Item 2: spec 019, the visitor's walking legs (`night/impl-019/impl-019`, reworked on `night/rework-019/rework-019`)

Spec: specs/019-avatar-walking-legs/ · Intent: intent/019-avatar-walking-legs.md · Written by: implementer (night shift: impl-019 on Sonnet, rework-019 on Opus); reviews by workers who didn't write the code (review-019 and rv2-impl-019 of T001 to T010; T020 for the rework) · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/rework-019 (rework), /home/h4reet/h4reet-ai/night/2026-11-13/impl-019 (first build) · Repo hooks active: not checked from this session
Authorized by: the Author's order of 2026-11-13 ("Approved provisionally", at the top of plan.md and tasks.md), the spec, and the plan; the rework by his answers to Q61 to Q63 on the morning page (spec.md Q6 to Q8). Base: `night/impl-018/impl-018`, with `night/spec-019/spec-019` merged; the rework on `night/impl-019/impl-019` with `night/rework-spec-019/rework-spec-019` merged.

### What changed and why

His item c): "avatar walking leg animations". The man and the woman have no `walk` clip, so they slid. A code gait now lays six leg-bone rotations over the playing idle clip, after the mixer, driven by the distance walked (the steps keep pace with the distance at any speed), eased in and out, and given back to the clip with no residue. The hips bone lowers by the standing leg's lift, so the standing foot stays within 2 cm of the floor; the hips' rotation and everything above them (the holding hand, arms, spine, head) are the clip's.

- `scene/gait.ts`: the pure part (`cycleLength`, `advance`, `legOffsets`, `standingLift`, named constants) and the bones' part (`findLegRig`, `applyGait`, `clearGait`, base/applied tracking on the six rotations and the hips' position, so a frame the mixer didn't write leaves nothing behind).
- `scene/avatars.ts`: the leg rig found on the visitor's instance, the distance from the pose, the gait after the mixer in `update` (gates: motion on, level 0, an idle clip, no loaded `walk` clip), cleared on fallback, swap, `rest()`; a loaded `walk` clip plays at its own speed; the `clipScale` and `gaitFrame` windows for the tests.
- `stage.ts`, `signals/frame-log.ts`, `app.ts`: the `gait` signal (`unavailable`) for a model without the six leg bones or the hips bone, one frame-log entry.
- R-07 measured, not assumed: `gait-rig.test.ts` builds the real man's and woman's leg chains from their GLB node data; a positive hip offset moves each ankle toward +z, a positive knee offset bends each shin back, left and right.

**The rework (T013 to T019, on Opus, by his answers to Q61 to Q63):**

- **The hips lowered by the standing leg's lift (Q62; FR-005 amended, FR-015, SC-006).** The real legs don't hang straight at the clip's pose (both lean back; the woman's knees are bent), so plan §2.6's straight-leg formula was off by up to 4.3 cm (man) and 7.5 cm (woman). `standingLift(offsets, shape)` takes each leg's thigh and shin as `findLegRig` measures them, in-plane lengths and rest angles, in the hips bone's parent space; with both angles 0 it is the straight-leg formula. Measured on the real GLBs at their room heights through a cycle: the lower ankle's worst offset is −0.6 cm (man) and −1.9 cm (woman), a sink from the clamp at 0; without the lowering it rises 5.6 cm and 7.0 cm. The woman's 1 mm margin is deterministic; whether the hips should also rise there is a new question on the page.
- **The walk clip's time scale removed (Q63; FR-007).** `update` sets no `timeScale`; a loaded `walk` clip plays at its own speed, as spec 009 has it.
- **No object made in a frame's gait (Q61; FR-011; rv2-impl-019's finding 1).** `advance` writes into a mutable state it is given; `legOffsets` fills the `out` it is given (the controller's own, made once, rather than a module scratch: the pure functions stay pure); `gait.last` is two numbers and a flag; `applyGait` and `clearGait` walk the bones by name, with no array literal. **FR-011 is now claimed, and tested** by `gait-alloc.test.ts`: the outs' identity, the controller's `gait.state`, `gait.offsets`, `gait.last` the same objects through a walk, stops, `rest()`, and a fallback, and no `[` in `applyGait`'s or `clearGait`'s source. A byte measure was tried and removed (plan §2.7): after the fix it still read 95 to 176 bytes a frame, from V8 boxing numbers inside three's setters, unsteady with inlining, so it couldn't tell "no object" from that. SC-007's reading is a new question on the page.
- **SC-004 measured (T019):** the avatar controller's chunk 4.73 → 6.09 kB gzip (+1.36 kB, under 2 KB); three's `scene` chunk unchanged; the entry chunk +0.02 kB (the frame log's `gait` kind). Plan §2.8 has the table and how it was built.
- **rv2-impl-019's nits:** R-07's sign test loops over the right leg too (T013, passed at once); US1 scenario 2 checked from the 12th frame after the stop (0.19 s) to the 24th; T009's box reads dropped, not done; spec US3 points to plan.md §2.5; T007's note and the signal set name `test/room/live.test.ts` and `test/ui/loading-degraded.test.ts`.
- Plan departures: plan.md §2.5 (first build), §2.6 and §2.7 (rework), §2.8 (SC-004). T009 (lookdev) dropped with a note.

### Acceptance criteria

FR-001 to FR-010 and FR-015 by `gait.test.ts`, `gait-rig.test.ts`, `avatar-gait.test.ts`, and `avatar-driver.test.ts`; FR-011 by `gait-alloc.test.ts`. SC-001 (two identical seeded runs), SC-002 (no residue on the rotations or the hips' position after stop, rest, fallback, to 1e-9), SC-003 (N cycles of distance, N turns of phase), SC-006 (the lower ankle within 2 cm on the real models, with a control that rises past it) are tests; SC-007 by identity (the page's question). SC-004 measured: +1.36 kB gzip. SC-005 is his look approval, by sight.

### Verification (small tests, the order's rule 4)

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

- Questions: the spec's Q1 to Q5 on the morning page, each with its recommended answer; two new from the rework: the woman's 1.9 cm sink (keep the clamp, recommended) and SC-007 read by identity (yes, recommended).
- Look approval of the gait on the real models, with the hips' lowering (SC-005); the amplitudes are one-line edits in `gait.ts` (README).
- No human-only patch (`docs/merge-requests/human-patches/019.md` says so).
- Open for others: T020 (a review of the rework by a worker who didn't write it), T011 (the supervisor ticks it with review-019's verdict), T012 (the stack's one `make check`).
- Interruptions: one permission prompt denied in this session (a `cd` then `sed -n` over the Makefile, to read its test target); read it with `grep` instead. One bash-gate refusal: `rm -rf /tmp/scratch019` ("recursive delete outside workspace"), the rework's scratch scripts and build logs; not retried, the directory is left in place.
