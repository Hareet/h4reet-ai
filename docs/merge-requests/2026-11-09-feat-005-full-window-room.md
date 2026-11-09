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
