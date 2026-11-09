# feat/005-full-window-room

Spec: specs/005-full-window-room/ · Intent: specs/005-full-window-room/intent.md · Written by: implementer (an agent session) · Date: 2026-11-09
Session: /home/h4reet/h4reet-ai/h4reet-ai, working in the worktree /tmp/claude-1000/wt-feat005 · Repo hooks active: the session's hooks; the worktree's commits ran the repository's git hooks (gitleaks and the arrival check print on each commit)
Authorized by: the spec and the plan, approved by the Author in the session on 2026-11-09 (tasks.md T000, recorded in his words)

**Draft, a save point.** This note grows with the branch; its sections below fill in as the phases land.

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
