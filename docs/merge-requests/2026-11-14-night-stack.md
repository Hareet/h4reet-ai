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
