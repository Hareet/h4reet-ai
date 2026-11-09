# feat/005-full-window-room

Spec: specs/005-full-window-room/ · Intent: specs/005-full-window-room/intent.md · Written by: implementer (an agent session) · Date: 2026-11-09
Session: /home/h4reet/h4reet-ai/h4reet-ai, working in the worktree /tmp/claude-1000/wt-feat005 · Repo hooks active: the session's hooks; the worktree's commits ran the repository's git hooks (gitleaks and the arrival check print on each commit)
Authorized by: the spec and the plan, approved by the Author in the session on 2026-11-09 (tasks.md T000, recorded in his words)

## What changed and why

The Author, after his first visit to the live room on 2026-11-09, in his words: "Let's organize the interface better, should we make the room responisive, as in the room takes up the whole browser window and the interface is laid over top of it with opaque and make it more game click-able buttons?" And later that day: "When we say the "room fills the whole window", i don't mean the little window inside the browser page, we were meaning the browser window. Is it possible that the assets and game are responsive, so if someone makes the browswer window larger, it fills out appropriately". His answers to the clarify questions: "Bottom bar, plus one column on the right"; "Use the dark glass recommendation and just go ahead with putting everything in instead of approval at lookdev first"; "Only when asked (Recommended)"; "Whole room, more around (Recommended)". He approved the spec and plan with "Approve and build (Recommended)" (tasks.md T000).

What this branch builds, by plan.md:
- **The canvas is the window.** The room block is the window's width and its dynamic height; the buffer follows the device's pixel ratio within each quality level's ratio and pixel cap; one `refit` follows every change of the window (`hud/viewport.ts`), the quality controller held until two frames after the last.
- **The HUD's places are one kernel table**, `compose/hud.ts`: the column layout (the AI disclosure as a strip at the top, the bar at the foot, one column on the right of two fifths of the safe width, 15rem to 28rem), the dock layout on a window held upright (the list's strip and the text box's row above the bar), and the stacked layout, spec 004's grid, where neither fits. `room.css` takes the table's numbers through CSS properties set with `style.setProperty`; a test pins its rules to them, and a model with real text widths holds the table's bands at every screen of the sweep.
- **The clear area is the stage.** The supported stages are the clear areas; every one of spec 004's 5,403 screens gets a stage at least its stage before, held by a frozen copy of the old formulas. The room is framed into the clear area by one camera whose projection is shifted (`setViewOffset`), so the scene continues behind the glass; the picker, the walking view's taps, and its follow camera take the same shift.
- **The look**: dark glass at 0.60, the lowest 5% step at which every text and mark passes WCAG over white and black beneath; tiles of an icon over their words; the highlight's yellow for focus; a blur only at quality levels 0 and 1; opaque under reduced transparency, more contrast, and no backdrop blur, and the system's colours in forced colours.
- **The HUD's parts**: the list's and the log's header buttons, which collapse them (the log stays a live region), the larger conversation view only when asked, the resume over the clear area, and nothing covering the walking control.
- **Full screen** of the page's root where the browser offers it (the bar's control after "Pause the room", and Alt+Enter), Escape left to the browser, and one `fullscreen_entered` event a visit, with row V4's trigger, the "Visits in full screen" panel, and §7.8's row.
- **Spec 004's checks** at the new stages (RG6 reserves `reservedBoxes`; RG5's aspects 0.288 to 11.444), the report's "Stages" and "Reserved boxes" lines, and the lookdev page's three window views with the buffer, the ratio, and the cap in its readouts and results.

## Acceptance criteria

| FRs | Status | Proven by |
|---|---|---|
| FR-001, FR-002 | met | `test/ui/degraded.test.ts` (T010), `test/ui/hud-faults.test.ts` (T040) |
| FR-003, FR-004 | met | T010, T040 (`data-stage="2d"` at the clear area; flat-failed's new words, D9) |
| FR-005 | met | `test/ui/fullscreen.test.ts` (T034) |
| FR-006 | met | T010, `test/room/hud-contrast.test.ts` (T019) |
| FR-007 | met | `test/room/hud.test.ts` (T005), `test/ui/hud-model.test.ts` (T008), T010's stacked grid |
| FR-008, FR-009 | met; the safe areas on a real notch at the Author's look | `test/ui/resize.test.ts` (T016), `test/ui/hud-a11y.test.ts` (T031) |
| FR-010, FR-011 | met; the caps' tuning is the Author's lookdev runs (T049, SC-008) | `test/room/fit.test.ts` (T009), `test/room/scene-fit.test.ts` (T015) |
| FR-012, FR-013 | met | T015, T016 |
| FR-014 | met: no file under `apps/web/room/catalog/`, `apps/web/room/scene.yaml`, or `assets/` changed | the branch's paths, below |
| FR-015 to FR-018 | met | T009, T015 |
| FR-019 to FR-023 | met | T005, T008, `test/ui/hud.test.ts` (T020) |
| FR-024, FR-025 | met | T019 |
| FR-026 | met in code and CSS; the look itself is the Author's (T048) | T020 |
| FR-027, FR-028 | met | T020 |
| FR-029 | met: `package-lock.json` and every `package.json` unchanged | the branch's paths |
| FR-030 to FR-035 | met | `test/ui/hud-pointer.test.ts` (T029), T015 |
| FR-036 to FR-042 | met, Q4 provisional | `test/room/fullscreen.test.ts` (T033), T034 |
| FR-043 to FR-051 | met in jsdom; the keyboard-only and screen-reader runs are the Author's (SC-005) | T021, T031 |
| FR-052 to FR-057 | met | `test/room/stages.test.ts` (T006), `stages-floor.test.ts` (T007), `stages-checks.test.ts` (T025) |
| FR-058, FR-059 | the lookdev views built (T028); the frame rates are the Author's runs (T049) | `test/lookdev/page.test.ts` (T026) |
| FR-060 to FR-064 | met, D1 provisional | T035; row V4 in the commit that adds the kind (4a862dee) |
| FR-065 | met | `test/room/vocabulary.test.ts` (T022, T036) |
| FR-066 | met: `apps/web/nginx.conf` and its tests unchanged; sizes only through `style.setProperty` | T020's spy |
| FR-067 | met: no compose file, service, port, env key, or secret changed | the branch's paths |
| FR-068 | ADR 0043, proposed | `make evals`' docs links |

SC-005, SC-008, and SC-013 are the Author's runs after the merge (T048, T049).

## Constitution check

| Principle | How this branch complies |
|---|---|
| I. Data-local by default | One event kind with no identifier, row V4's trigger in the same commit; nothing about the window, the panels, or the display leaves the device; the degraded paths were built first (Phase 2) and the faults run end to end (T040) |
| II. Production-grade | Tests first in every phase, RED and GREEN below; the event, the panel, and the frame log's `refit`, `panel`, and `fullscreen` entries; the cost below; ADR 0043 and the room's README |
| III. Intent before spec, spec before code | From the approved spec and plan; each departure recorded in plan.md (B1 to B11) in its commit; the living contracts marked "(spec 005)"; no agent merges |
| IV. Least privilege | No header, permission, sandbox domain, human-only file, or protected path changed (none of `.claude/`, `CLAUDE.md`, `REVIEW.md`, `tools/gates/`, `evals/agent-config/`, `assets/`, `corpus/`, `infra/`) |
| V. Cost | $0 in the cloud; one beacon per visit that enters full screen; the device's pixels bounded by the caps |
| VI. Build in public | The table, the floor, the palette, and this record committed |
| VII. Own the whole product | The reasoning in plan.md's departures and ADR 0043 |
| VIII. Honest AI | The AI disclosure is the fixed strip, in view in every layout, panel state, scroll position, and full screen; the stand-in line stays in the clear area's top left (T020, T040) |

## Review

T045's review by an agent that wrote none of this work is **pending**: this session can't start one, so the main session runs it, and T046 fixes what it finds, each in its own commit, with this note's outputs run again.

## Cost and data-flow impact

$0 in the cloud. One `fullscreen_entered` beacon at most per visit that enters full screen, on spec 002's existing flow, disclosed in row V4's trigger. The entry chunk and the compositor's time are in the numbers below. On the visitor's device the buffer grows with the window, bounded by each level's pixel cap and the controller's steps; the Author's lookdev runs measure it (T049).

## For the Author

**Decisions, each provisional and yours** (T050): ADR 0043, proposed; Q4 (no control where the browser offers no full screen); D1 (the event, its panel, and V4's words); D2 (Alt+Enter); D3 to D11. Two findings beyond the plan: spec 008's FR-043 words `walk.left` and `walk.target` were never said by the room on `main`, and still aren't (this branch wires `walk.entered`, which FR-039 replaces in full screen; departure B11); and FR-056's "96 MB" reads here as RK3's cap in force, your 200,000,000, which the room's models already exceeded at 96 MB before this change.

**The gate.** This branch touches neither `deploy/agents-engine/` nor `.claude/settings.json`, so the gate's matrix-e step is SKIP and needs no `--prove`. It touches none of `CLAUDE.md`, `REVIEW.md`, `.claude/`, or the Claude Code pin, so its agent-config-evals step, the behavioral tier, is SKIP and needs no run of yours (both read from `tools/gates/gate`'s own rules).

**Your steps**, each pasted line 45 characters or fewer. From main's checkout:

```bash
cd ~/h4reet-ai/h4reet-ai
B=feat/005-full-window-room
T=<the tip, from the report>
tools/gates/gate "$B"
```

Once nothing fails or waits, set the gate's summary line, then guard and merge (or paste the merge command the gate prints):

```bash
G='<the gate summary line>'
S=$(git rev-parse --short=12 "$T")
[ "$(git rev-parse "$B")" = "$T" ] && echo ok
git --no-replace-objects merge --no-ff \
  -m "Merge $B ($S)" -m "$G" "$T"
```

Then bring the room up as you do:

```bash
make up ENV=prod
```

**Your look** (T048; SC-013): resize the window from small to large; look at the glass over the scene's light and dark parts; use the bar and the column, and collapse and open the list and the conversation; try a phone held upright and sideways, and full screen where the browser offers it, Alt+Enter too; then a keyboard-only run and a screen-reader run (SC-005): every selectable from the list, every control, each panel collapsed and opened, full screen entered and left, the walking view entered and left in and out of full screen, the resume opened and closed. Record a yes or a no in a follow-up note, naming anything that doesn't read or doesn't fill; a change to the look is a new intent. Then the lookdev page's 2-minute window runs on the reference phone, the reference desktop, and a large monitor (T049; SC-008), from a drafts build.

**A refusal this session met.** The bash gate refused one shell command that wrote this note through a heredoc, since its text named an Author-only make target in a sentence saying no run of it is needed; the gate matches text. The note was written with the editor instead, and nothing was respelled to pass the gate.

## T001: the base, the outside facts, and the numbers

**The base.** The branch was cut, as the main session directed, from `refs/heads/spec/005-full-window-room` (fbabacd4: the spec's three commits, 6ae548a9, d3663a58, and fbabacd4) on `main` at e324771ef59f1d715501ee0d3c8485eac0c8f64a. `refs/heads/main` was 8adb4abb when the branch was cut, one commit ahead (`policy: mit, dinov3, bsd-3-clause`, `assets/policy/licenses.json` alone), which this branch doesn't touch; the rebase onto main comes when the main session says main has moved. The tasks' `npm ci --ignore-scripts --cache "$TMPDIR/npm"` ran as the main session gave it: `npm ci --cache "$TMPDIR/npm-cache-feat005"`, once.

**The browsers' facts.** This session couldn't open the browsers' references: the sandbox's network allows neither a browser nor `curl` (the bash gate refuses it), so each fact below is the implementing agent's own knowledge of those references, as of its training, recorded as plan.md recorded its understanding. The Author's look (T048) on his own browsers is where they meet the real ones.

| Item | The fact as known | Against the plan |
|---|---|---|
| Fullscreen API, desktop | Unprefixed `requestFullscreen`, `exitFullscreen`, `fullscreenElement`, `fullscreenEnabled`, `fullscreenchange`, and `fullscreenerror` in Chrome 71+, Edge 79+, Firefox 64+, and Safari 16.4+; Safari before 16.4 has only the `webkit` names (`webkitRequestFullscreen`, `webkitExitFullscreen`, `webkitFullscreenElement`, `webkitFullscreenEnabled`, `webkitfullscreenchange`). `navigationUI` is honoured by Chrome and ignored elsewhere | as PD-19 |
| Fullscreen API, Android | Chrome and Firefox for Android: the unprefixed API, for any element | as PD-19 |
| Fullscreen API, iPadOS | Safari 12 to 16.3: the `webkit` names on elements; 16.4+: unprefixed | as PD-19, R-3 |
| Fullscreen API, iOS (iPhone) | No element full screen for a page: `fullscreenEnabled` is false or absent, and only `<video>` can go full screen (`webkitEnterFullscreen`). Every iPhone browser uses WebKit | as Q4's reading |
| The Escape that leaves full screen | Chrome, Edge, and Firefox consume it: the page receives no `keydown` for it. Safari is believed to consume it too, but builds have differed, so the guard stays as PD-21 has it, harmless where the page never sees that Escape | as PD-21, R-2 |
| `prefers-reduced-transparency` | Chrome and Edge 118+; Firefox behind a preference only; Safari none | as R-12 |
| `backdrop-filter` | Unprefixed in Chrome 76+, Edge 79+, Firefox 103+, Safari 18+; Safari 9+ reads `-webkit-backdrop-filter` | as PD-17 |
| `dvh` | Chrome 108+, Firefox 101+, Safari 15.4+ | as §4.1 (`100vh` first, as a fallback) |
| `env(safe-area-inset-*)` with `viewport-fit=cover` | Safari 11.1+, Chrome 69+, Firefox for Android 65+ | as §6.8 |
| The on-screen keyboard | iOS Safari shrinks the visual viewport alone. Chrome for Android, since 108, resizes the visual viewport alone by default (`interactive-widget=resizes-visual`). Firefox for Android is believed to resize the layout viewport | **a recorded clarification** of §6.8 and PD-14 (plan.md's departures, B1): where a browser resizes the layout viewport for the keyboard, the window got shorter, so the room re-fits as for any resize, and the dock, at the window's foot, stays above the keyboard; the keyboard's inset then reads 0 |
| Alt+Enter and Option+Return | No supported browser takes Alt+Enter or Option+Return from a page's content (the address bar's Alt+Enter acts only in the address bar). NVDA's and JAWS's commands use their own modifier (Insert or Caps Lock) and leave Alt+Enter to the page; VoiceOver's use Control+Option. Inside a form, Enter's implicit submission can still fire with Alt held, which PD-20's capture-phase `preventDefault` stops | as PD-20, D2, R-9 |

**three 0.186.1** (read from `node_modules/three/src/cameras/PerspectiveCamera.js`, `updateProjectionMatrix`): with `view` set by `setViewOffset(fullWidth, fullHeight, offsetX, offsetY, width, height)`, `left += offsetX * width / fullWidth`, `top -= offsetY * height / fullHeight`, `width *= view.width / fullWidth`, and `height *= view.height / fullHeight`, from the frustum of the camera's own `aspect`. With `fullWidth = clear.w`, `fullHeight = clear.h`, `offsetX = −clear.x`, `offsetY = −clear.y`, and the view `W × H`, the frustum's left edge moves `clear.x` pixels' worth outward at the clear area's scale, its top `clear.y` pixels' worth upward, and it spans `W` and `H` pixels at that scale: so a negative offset widens as PD-12 states, the canvas's pixels inside the clear area see exactly the clear area's frustum, and the projection's aspect is `W ÷ H`, nothing stretched. No departure (A9 closed; R-5's hand-built projection isn't needed).

**The numbers at the base** (e324771e's code):
- **The next free ADR**: 0043 (0042 the newest; 0037 reserved for spec 004's look). ADR 0043 is this branch's (T002).
- **`npm run room:check`**: 2.73 s wall, "room: 0 findings in 0 files", with 1,787 supported stages from 5,403 sweep screens.
- **The entry chunk**: the release build's entry, `assets/index-CAIVYGH1.js`, 32,396 bytes gzipped, and its one stylesheet 2,561 bytes: 34,957 bytes of the 153,600-byte budget (measured as `test/room/chunk.test.ts` measures it, with a scratch script outside the repository).
- **The web tests at the base**: 2,685 passed and 8 failed, the 8 being `main`'s known readiness failures in `test/room/chunk.test.ts` and `test/room/dist.test.ts`, which this branch doesn't fix.

## The RED and GREEN runs

Each phase's tests were committed failing before the code that makes them pass. The runs are `npx vitest run <files>` in `apps/web`, under Node 24.21.0.

**Phase 2 (Foundational), RED** (T005 to T010, before T011 to T014): 5 of 7 files failed, 6 of 66 tests. `test/room/hud.test.ts`, `stages.test.ts`, `fit.test.ts`, and `test/ui/hud-model.test.ts` failed to load ("Cannot find module '../../src/room/compose/hud'"); `test/ui/degraded.test.ts`'s six new cases failed (no `data-hud`, no `data-stage`, flat-failed's old words, no fallback rules, no stacked rules). `test/room/stages-floor.test.ts` (T007) passed at once: at the base the shipped stages are the floor itself, so it holds T011 to the floor rather than failing first; `test/room/legacy-stages.test.ts` (T004) passed, as T004 requires.

**Phase 2 (Foundational), GREEN** (after T011 to T014): the whole web suite, 2,736 passed, 1 skipped, and 8 failed, the 8 being `main`'s known readiness failures in `test/room/chunk.test.ts` (6) and `test/room/dist.test.ts` (2). The skipped case is T004's comparison with the shipped module, which runs only while `stages.ts` still holds the base's formulas (its `ROOM_CSS`), as designed. `make`'s linters on `apps/web`: ESLint, `tsc`, and Prettier clean.

Two of T005's own expectations were wrong and corrected in the GREEN commit, not the code: a one-row list strip frees nothing collapsed (1024 × 1366), and the minimum carries its 20rem window bound beside 304 × 196. T006's two room.css cases passed at T013, which writes the CSS.

### The stages and the floor (T011, T014)

| | At the base (e324771e) | After |
|---|---|---|
| Sweep screens | 5,403 | 7,241 (spec 004's 16-pixel grid whole, a 64-pixel grid to 5120 × 2160 and to 2160 × 3840 upright, and 7 named screens) |
| Supported stages | 1,787 | 7,291 (each screen's open stage, and each dock screen's collapsed one) |
| `npm run room:check` | 2.73 s | 4.22 s (1.55×, within the plan's 2×; §3.6's smallest-stage-per-aspect rule not needed) |
| Reference desktop's stage | ≈ 686.4 × 640 | 1472 × 1120.5 |
| Reference phone's stage | 368 × 368 | 384 × 422 |
| Smallest stages | 304 × 196, 304 × 208 | 320 × 250, 328 × 240.5 |
| The 2D drawing's smallest scale | 0.95 | 1 |
| Framing aspects (RG5) | spec 002's six | 0.288 to 11.444, spec 002's six among them; the supported stages run from 0.299 to 9.410 |

The floor (`test/room/stages-floor.test.ts`): every one of the 5,403 screens of spec 004's sweep gets a stage at least its frozen stage, in width and in height; none fails.

### Test expectations that changed with the layout (each a stage or a place that moved; no check weakened)

- `test/room/stages.test.ts`: rewritten (T006) around the clear areas; the old `ROOM_CSS` pins moved to the stacked layout's check in `test/ui/degraded.test.ts`.
- `test/ui/a11y.test.ts`: the AI disclosure is fixed glass in the HUD (sticky and white on the choice screen and in the stacked layout); the scroll padding is `calc(var(--strip-h, 4rem) + 1rem)`; "Around the room" follows the room block; the grid's areas are the stacked layout's; the 320 × 568 and portrait-to-35rem cases read the HUD model (`test/ui/hud-model.ts`), and its measuring helpers moved there.
- `test/ui/narration-room.test.ts`: the strip fixed in the HUD with the glass's background; the resume may be absolutely placed over the clear area; the media model turns the preference queries off, as it did reduced motion.
- `test/ui/text-copy.test.ts`: "Around the room" follows the room block, whose panels end with the conversation.
- `test/ui/pick.test.ts`, `test/room/pick.test.ts`: the smallest stages and the smallest 2D scale (1, not 0.95).
- `test/room/quality.test.ts`: the levels' table gains `pixelCap`.
- `test/room/framing.test.ts`: spec 002's six aspects, among the series.
- `test/room/faces.test.ts`: a face that meets its `px` cap at both levels keeps its texture; at least one face still resizes.
- `test/room/flat.test.ts`: flat-failed's words (D9); the side-wall overlay's 2D carve-out at scales 1 and 1.025 (0.95 and 0.975 before).
- `test/room/objects.test.ts`: the 3D carve-out's next stage is 328 × 240.5 (312 × 224 before).
- `test/lookdev/phone.test.ts`: the phone's stage, 384 × 422.
- `test/room/legibility.test.ts`, `test/room/geometry.test.ts`, `test/room/report.test.ts`: the cap heights at the new reference stages (the counters 21.9 / 7.5 px, the neon panel 49.2 / 16.9 px over the counters overlay; the known-good panel 11.2 px on the phone); the floors that catch them (12 for the panel, 22 for the counters on the desktop); the RG5 reason's aspects; RG6's first stage, 320 × 250, and counts; the regroup case's selectable is the fixture's sign, since the twin's core no longer meets the workstation in 3D at any of the larger stages (it still does in 2D); the outline case's cap height, 10 of 72 units, under the floor on both stages.
- `test/fixtures/room/bad/RG7-floor/expect.yaml`: the floor 12 px, over the panel's 11.2 px on the phone (11 over 10.7 before).
- `test/fixtures/room/side-wall/` and `bad/RG6-side-wall/`, and the tests that name the lower sign's height: the lower sign at 1.074 m (1.0515 before), its gap scaled by 304 ÷ 320, so the cores still meet at exactly the narrowest stages, now the 45 stages 320 px wide, in 3D and 2D, and nowhere else; the carve-out's two variants re-tuned the same way (1.1 m and 1.065 m). Without it the overlay's cores met at no stage, and the carve-out's cases would have tested nothing. `test/room/orders.test.ts`'s photo guide follows the height (1.124 above the floor).
- `test/room/data-only.test.ts`: the free-spot finder clears `reservedBoxes`.

**Phase 3 (User Story 1), RED** (T015, T016, before T017 and T018): 8 of 13 failed. `test/room/scene-fit.test.ts` (T015's 3D stage cases, in a file of their own beside `scene.test.ts`, since they wrap the ink's and the highlight's factories to see their stage calls): the camera's aspect was the canvas's (1.78 at 1280 × 720, not the clear area's 1.30), a press at a core selected nothing, and the walking view's camera wasn't shifted. `test/ui/resize.test.ts` (T016): the layout didn't follow the window, the controller stepped down once during a 10 s drag in 3D, and the keyboard's inset wasn't set. Passing at once: the first frame's overwrite of the initial REFERENCE_DESKTOP stage (spec 004's behaviour, pinned), and the visit's state kept at each step (nothing re-fitted yet, so nothing could move it; it holds after T018 too). `test/ui/pick.test.ts` and `test/ui/highlight.test.ts` are unchanged: spec 008's targeting and selection pass as they are (SC-014), and `resize.test.ts` checks the target at every step.

**Phase 3 (User Story 1), GREEN** (after T017 and T018): the whole web suite, 2,749 passed, 1 skipped, 8 failed (`main`'s known chunk and dist failures). Spec 008's `test/ui/pick.test.ts` and `test/ui/highlight.test.ts` pass unchanged (SC-014): they size the real 3D stage's canvas apart from the (jsdom) window, so the stage frames into its whole canvas there, as it does whenever its canvas isn't the window the room's clear area was computed for (`SceneOptions.clear()` gives the window beside the area; plan.md's departure B6). One case of T015 was re-aimed before GREEN: the walk-to case first pressed fixed screen points that landed off the walkable floor; it now projects a floor point 0.4 m beside the figure through the shifted camera, checks that three's own ray through that pixel meets it, presses there, and requires the figure within 5 cm of it.

**Phase 4 (User Story 2), RED** (T019 to T022, before T023 and T024): 18 of 61 failed. `test/room/hud-contrast.test.ts`: the HUD's rules didn't draw from the palette, and no blur rule existed (its three palette cases passed at once: T013 had put the palette and its fallbacks in place for the degraded paths, at the plan's 0.60, which the test confirms is the floor, 0.55 failing white text on the glass over white at 4.2:1). `test/ui/hud.test.ts`: no header buttons, no larger view, no tiles or icons, no blur levels. `test/ui/a11y.test.ts`: the six new axe cases failed at the first toggle, which didn't exist. `test/room/vocabulary.test.ts`: the closed list lacked the three words. Passing at once: the places of the bar, the column, and the dock (T013's), the resume's focus, and every older case of the four files.

**Phase 4 (User Story 2), GREEN** (after T023 and T024): the whole web suite, 2,772 passed, 1 skipped, 8 failed (`main`'s known chunk and dist failures); ESLint, `tsc`, and Prettier clean. The palette's starting values are the final ones (plan.md §6.7 unchanged): the glass `rgb(16 20 26)` at 0.60, text `#ffffff`, tile faces `rgb(6 8 11 / 0.4)`, borders `rgb(255 255 255 / 0.72)`, focus `#ffd23f`; at 0.55 white text on the glass over white falls to 4.2:1. T019's selectors gained the HUD layouts' scope before GREEN (`html[data-hud="column"] .hud-tile` and the dock's, not a bare `.hud-tile`), since the stacked layout keeps spec 004's page buttons (plan.md's departure B8). Expectations changed: `test/ui/a11y.test.ts`'s Tab order gains the list's header button before the list, and the log's and the larger view's before the conversation's text box (FR-043); it and `test/room/events.test.ts` count the list's item buttons, `li button`, apart from its header button.

**Phase 5 (User Story 3), RED** (T025, T026, before T027 and T028): 7 failed. T025's cases sit in one new file, `test/room/stages-checks.test.ts`, rather than across four (plan.md's departure B9). Only its report case failed (no "Stages" or "Reserved boxes" line); the rest passed at once, proving T011 and T014: every face's cap height at the new reference stages is at least its height at spec 004's and the floor where RG7 holds one; the index's `screen_css` is the new stages'; the side-wall selectables are list-only at a screen's new stage only where they were at its old one, in the repository's room and the side-wall overlay; and the texture totals hold. `test/lookdev/page.test.ts`: the three window views didn't exist, and the results lacked `window_css`, `buffer_px`, and `pixel_cap` (the existing run case's key list gains them). The phone copy's own view was already its device's clear area, since `stageFor` is.

**The texture total (T025; FR-056, R-6).** RK3's cap in force is `main`'s `scene_texture_bytes`, 200,000,000, which the Author raised from FR-053's starting 96,000,000. The repository's room totals 161,778,559 bytes on the reference phone: models 157,985,452 and the live faces' canvases 3,793,107. It was over 96 MB through its models before this change; the canvases, sized at the new reference stages, are the only part this change moves, and the test holds them at least their size at spec 004's stages and everything else unchanged. The fixture set and the counters overlay stay within 96 MB. So R-6's departure isn't needed; the Author may want to know that FR-056's "96 MB" reads as the cap in force.

**Phase 5 (User Story 3), GREEN** (after T027 and T028): the whole web suite, 2,788 passed, 1 skipped, 8 failed (`main`'s known chunk and dist failures); linters clean; `npm run room:check` "room: 0 findings in 0 files" in 2.86 s on this run. Expectations changed: `test/room/report.test.ts`'s walking case reads the "Reserved boxes" line in place of "The walking control's box"; `test/lookdev/page.test.ts`'s pinned-level and run cases take the room's buffer ratio, since the desktop's stage, now 1472 × 1120.5, meets level 2's pixel cap below a ratio of 1 (0.934), and the run's key list gains the three fields; `test/lookdev/results.test.ts`'s setup and key list the same fields.

The report's new lines on the repository's room (`npm run room:report`):

```text
Stages (spec 005, FR-052 to FR-054): the clear areas of the HUD's column and dock layouts, a dock screen's with its list open and collapsed, over 7,241 screens from 320 × 320 to 5120 × 3840, 7,291 stages; the reference desktop's 1472 × 1120.5 (1920 × 1200 at a pixel ratio of 1) and the reference phone's 384 × 422 (384 × 740 at 2.8125).
Reserved boxes (spec 005, FR-055): the walking control's (spec 008, FR-021), 8rem × 2.75rem, 0.5rem in from the clear area's bottom-right corner, holds no side-wall selectable at any supported stage.
```

Its side-wall table at the new stages: `snowboard` (left-wall) list-only in 2D at 320 × 250 and 225 others; `chalkboard` (left-wall) list-only in 3D at 320 × 250 and 410 others and in 2D at 320 × 250 and 801 others. `test/room/stages-checks.test.ts` holds every one of those to a screen whose old stage listed it too (FR-057).

**Phase 6 (User Story 4), RED and GREEN** (T029, then T030): 2 of 5 failed first. Passing at once, as plan.md §7 expected: no press, drag, wheel, or hover on a panel reaches the scene (the panels are siblings over the canvas), a hover leaving the canvas clears its target (`objects.ts`'s `pointerleave`), and a drag that starts on the scene selects nothing and presses no panel's button (the captured press stays the canvas's). Failing first: the panels' explicit `pointer-events: auto` and `overscroll-behavior: contain`, and the walking view's focus on a press on the scene. After T030, the UI suite and the HUD's CSS tests: all pass (`npx vitest run test/ui test/room/stages.test.ts test/room/hud-contrast.test.ts`, 21 files).

**Phase 7 (User Story 5), RED and GREEN** (T031, then T032): 2 of 11 failed first (after one fix to my own CSS helper, which had read a property from the wrong rule, committed with the RED and fixed before GREEN): the panels' `scroll-margin`, and a notched phone held sideways, 844 × 390 with 47 px each side, whose clear area was 412.4 px wide against 435.6, its stage before spec 005 on its 750 px safe viewport. Passing at once: the Tab order in both layouts, collapsed and open, 3D and 2D, and in full screen; no trap; focus returns; one fixed part, the strip; reduced motion; zoom; the keyboard's inset; axe in full screen. T032: the panels' scroll margin, and the column's two fifths taken of the safe width, the right inset padded inside it (450 px clear, at least 435.6), with T005's own safe-area expectation following (plan.md's departure B10). After T032, the UI suite and the kernel's tests pass.

**Phase 8 (User Story 6), RED** (T033 to T035, before T036 to T039): `apps/web`: 5 files failed, 11 of 39 tests (`test/room/fullscreen.test.ts` couldn't load `src/room/fullscreen`; `test/ui/fullscreen.test.ts`'s eight cases found no control, no shortcut, and a walking input that took Escape in full screen; the kinds' lists in `test/events.test.ts` and `test/manifest.test.ts`; row V4's trigger in `test/disclosure.test.ts`). `services/gateway`: 3 of 45 failed (the pinned kinds, and the route refusing `fullscreen_entered` with 400). `deploy/scripts/test_dashboard.py`: 2 of 84 failed (no "Visits in full screen" in §7.8 or the dashboard).

**Phase 8 (User Story 6), GREEN** (after T036 to T039): the whole web suite, 2,820 passed, 1 skipped, 8 failed (`main`'s known chunk and dist failures); the gateway's `test/unit/room-events-config.test.ts` and `test/integration/room-events.test.ts`, 45 passed; `deploy/scripts/test_dashboard.py`, 84 passed. T036, T037, and T038 landed in one commit (4a862dee), so the room never sends `fullscreen_entered` without row V4 naming it (FR-064); T039, §7.8's row and the panel, in the next. One case of T034 was corrected before GREEN: it asserted focus on the control without putting it there first, as a real press does. Full screen's support is read as the room is built (departure B11), and the entry into the walking view is now announced, spec 008's `walk.entered` wired and `walk.entered_fullscreen` in its place while in full screen; spec 008's `walk.left` and `walk.target` stay unwired, as on `main`.

**Phase 9 (User Story 7)** (T040, T041): `test/ui/hud-faults.test.ts`'s 11 fault runs passed at once, so T041 found nothing to fix and changed no code. The runs: the local tier off, the budget spent, the kill switch tripped, its state unknown, the live source off, and the tier unknown after a failure; no WebGL 2, on a wide window and a phone held upright; the drawing failing; full screen refused; no backdrop blur; a fall to 2D at the frame floor while in full screen; and a lost context while in full screen. Each ends with the layout on the page's root, the AI disclosure and the stand-in line in view, the HUD not inert, a picture or flat-failed's line in the clear area, frames still drawn in 3D, the conversation answering, no request but the room's own status, no beacon, and at most one `fullscreen_entered`. The fall to 2D and the lost context leave full screen as it was, never asking to exit. The full-screen stand-in moved into the test helper (`stubFullscreen`).
