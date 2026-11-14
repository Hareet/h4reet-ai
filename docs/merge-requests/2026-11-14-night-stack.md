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

---

## Item 3: spec 020, the dog modeled and brought in (`night/impl-020/impl-020`)

Spec: specs/020-dog-modeled-and-brought-in/ · Written by: implementer (night shift); the review is for a worker who didn't write the code · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/impl-020 · Repo hooks active: the commit hooks ran (gitleaks, arrival check) on every commit
Authorized by: the Author's order of 2026-11-13 ("Approved provisionally", at the top of plan.md and tasks.md), the spec, and the plan. Base: `night/impl-019/impl-019`, with `night/spec-020/spec-020` merged.

### What changed and why

His item d): "dog modeled and brought in", and his consent: "it's okay that we use the likeness of my dog". The code path for the dog's model is built and gated. **The model itself isn't here.** The studio's round 1 stopped before step 3 with no candidate (`/srv/studio/handoff/dog/1/note.md`: "stopped before step 3. No candidate."), because his reviewed concept isn't in the inbox yet. So nothing was brought in. The stand-in is the flat cut-out every visitor who picks the dog sees today. Swapping in the model takes his intake of `assets/visitors/dog/**` and his approval entry (patch 020, items 1 and 2), and no code change.

- **RA9** (`build/room/avatars.ts`, `checks/family.ts`, T001 and T002): a visitor model recorded `likeness: true` or `source.type: "photo"` is bundled only where main's likeness approvals name its SHA-256 with a non-empty line. Its clips are bundled only with it. The rule is lenient, so a lenient build leaves the dog on the cut-out. The twin's stand-in stays RA3's. The rule table's pin moved with it, and so did avatars-compose's woman-as-likeness case.
- **The line** (T003, T006 to T008): the approval's `disclosure_line` goes into the bundle as `avatars.dog.line`. The 3D stage's picture signal carries it while the dog's model shows. The room shows it as a note of its own (`.room-visitor-line`) and in "Around the room" right after the twin's line (the copy's new `{visitor_line: true}` slot). Both appear only while there are words, so the cut-out's layout is unchanged, 320 × 568 included. Two copy pins moved with it, the pin only: `bundle.test.ts`'s order and `text-copy.test.ts`'s kinds.
- **The report** (T003): one `Likeness` line per likeness avatar. It says either that the approval holds, with its line, or that RA9 keeps the avatar on the cut-out. The avatars table already gave the files, bytes, and texture memory.
- **The scene** (T004 and T005): seven cases on a four-legged fixture with no hand bone: the height (0.62 m), the floor, facing +z, walk, idle with the slide, reduced motion, the paper at the anchor, and the cut-out on a failure. All seven already passed on spec 009's and 019's code, so they're pins, and `scene/avatars.ts` changed only for the line.
- **Docs**: `docs/studio/avatar-dog.md` (T011, the round's brief). One sentence in the disclosure's D1 (T012): the dog's likeness reaches Anthropic when a session reads it, as the Author's does.
- **Dropped: T009 and T010, lookdev's Avatars view** (plan R-05 and §11). The view can draw only a bundled model, and RA9 keeps the dog out of every bundle until his approval. So it would show the dog only after the approval it was meant to inform. He judges the model in a glTF viewer or Blender instead. The question is on the morning page.

### Acceptance criteria

FR-001 and FR-004 to FR-006 and FR-008: `dog-avatar.test.ts` (pins). FR-002, FR-003, and SC-001: `likeness-visitor.test.ts`. FR-007: `dog-line.test.ts`. SC-003: `dog-avatar.test.ts` and `avatar-loader.test.ts`. FR-009 is unchanged (no choice-screen change). FR-010 to FR-014 are the studio round's and his intake's (`docs/studio/avatar-dog.md`).

### Verification (small tests, the order's rule 4)

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

It expects `v.spies.network` to be `[]` and gets one request. This item doesn't touch the test or the talk path. The stack's full run should show whether it fails on the base too. `test/smoke.test.ts` passed alone (17 of 17).

`make lint`: exit 0 after the last code commit and after the docs (eslint with zero warnings, tsc for the three workspaces, prettier, ruff, shellcheck). No full suite here: the stack's last task runs it once (T013's `make check`).

### Cost and data-flow impact

$0, and no model call. No new byte leaves a visitor's device: the dog's files, once approved, are served from the site's origin as the other avatars' are. One sentence was added to D1 (above).

### For the Author

- Questions on the morning page, each with its recommended answer: the spec's Q1 to Q5 and D1 to D5, plus one from the build: should a drafts build make an exception to RA9 so lookdev can show the dog before you approve it? Recommended: no.
- Patch 020 (`docs/merge-requests/human-patches/020.md`): item 1, his intake of the studio's outputs; item 2, his approval entries with the model's `disclosure_line`; item 3, a new tool only if the round needs one. None of them is needed for this item's gate.
- The studio: round 1 waits on his step 1 (the concept from the photos, his command in the studio's outputs) and his review. It then reruns from step 3.
- Open for others: the review by a worker who didn't write this; T013, the stack's one `make check`.
