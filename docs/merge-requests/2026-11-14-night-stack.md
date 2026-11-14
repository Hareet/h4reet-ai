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

## Item 2: spec 019, the visitor's walking legs (`night/impl-019/impl-019`)

Spec: specs/019-avatar-walking-legs/ · Intent: intent/019-avatar-walking-legs.md · Written by: implementer (night shift); the review (T011) is for a worker who didn't write the code · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/impl-019 · Repo hooks active: not checked from this session
Authorized by: the Author's order of 2026-11-13 ("Approved provisionally", at the top of plan.md and tasks.md), the spec, and the plan. Base: `night/impl-018/impl-018`, with `night/spec-019/spec-019` merged.

### What changed and why

His item c): "avatar walking leg animations". The man and the woman have no `walk` clip, so they slid. A code gait now lays six leg-bone rotations over the playing idle clip, after the mixer, driven by the distance walked (feet don't skate), eased in and out, and given back to the clip with no residue. Legs only; the holding hand, arms, spine, and head are the clip's.

- `scene/gait.ts`: the pure part (`cycleLength`, `advance`, `legOffsets`, named constants) and the bones' part (`findLegRig`, `applyGait`, `clearGait`, base/applied tracking so a frame the mixer didn't write leaves nothing behind).
- `scene/avatars.ts`: the leg rig found on the visitor's instance, the distance from the pose, the gait after the mixer in `update` (gates: motion on, level 0, an idle clip, no loaded `walk` clip), cleared on fallback, swap, `rest()`; a loaded `walk` clip plays at `clamp(speed / speed_mps, 0.5, 1.5)`; `clipScale` accessor.
- `stage.ts`, `signals/frame-log.ts`, `app.ts`: the `gait` signal (`unavailable`) for a model without the six bones, one frame-log entry.
- R-07 measured, not assumed: `gait-rig.test.ts` builds the real man's and woman's leg chains from their GLB node data; a positive hip offset moves the ankle toward +z, a positive knee offset bends the shin back.
- Plan departures are listed in plan.md §2.5. T009 (lookdev) is dropped with a note there.

### Acceptance criteria

FR-001 to FR-010 by `gait.test.ts`, `gait-rig.test.ts`, `avatar-gait.test.ts`, and `avatar-driver.test.ts`. SC-001 (two identical seeded runs, finite) and SC-002 (no residue after stop, rest, fallback, to 1e-9) are tests; SC-003 (N cycles of distance, N turns of phase) is a test. SC-004 (chunk size) is read from the stack's `make build` at T012. SC-005 is his look approval, by sight.

### Verification (small tests, the order's rule 4)

```
vitest run test/room/gait.test.ts test/room/gait-rig.test.ts test/room/avatar-gait.test.ts test/room/avatar-driver.test.ts test/room/avatar-hands.test.ts test/room/avatar-loader.test.ts test/room/avatars.test.ts test/room/stage-walk.test.ts test/smoke.test.ts
 Test Files  9 passed (9)
      Tests  96 passed (96)
vitest run test/room/avatar-handoff.test.ts test/room/avatar-scene.test.ts test/room/twin-handoff.test.ts test/room/twin-reach.test.ts
 Test Files  4 passed (4)
      Tests  33 passed (33)
```

`make lint`: exit 0 (eslint with zero warnings, tsc for the three workspaces, prettier, ruff, shellcheck). `tsc --noEmit -p apps/web`: clean. No full suite here: the stack's last task runs it once.

### Cost and data-flow impact

None: $0; no request, no byte leaves the device, no disclosure entry; no model call.

### For the Author

- Questions: the spec's Q1 to Q5 on the morning page, each with its recommended answer; none new from the build.
- Look approval of the gait on the real models (SC-005); the amplitudes are one-line edits in `gait.ts` (README).
- No human-only patch (`docs/merge-requests/human-patches/019.md` says so).
- Open for others: T011 (a review by a worker who didn't write this), T012 (the stack's one `make check`).
