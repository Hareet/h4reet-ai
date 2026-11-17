# Notes: impl-030b (group B, the buttons; T-B01 to T-B04), night of 2026-11-17

Branch `night/impl-030b/impl-030b` from `7cdc31d2` (`spec-030`'s tip). Implementer: `impl-030b`. Plan: [plan.md](plan.md) §R-B1 to §R-B5, §9; tasks: [tasks.md](tasks.md) T-B01 to T-B04.

## Files confirmed before the change (at `7cdc31d2`)

- `apps/web/vite.config.ts`: the plugins list (`:47-75`); no skin plugin yet.
- `apps/web/src/main.ts`: `import "./style.css"` (`:5`), `import "./fonts.css"` (`:6`); `room.css` arrives later through `./room/app` (`:13`), so two imports placed after `fonts.css` come before it, as plan §R-B2 asks.
- The controls of Q5 and their classes: `.hud-tile` (`src/room/layout.ts:152`, the bar's six at `:191-228`), `.room-walk` (`:237`), `.room-eat` (`:252`), `.split-back` (`src/room/hud/split.ts:276`), `.talk-larger` and `.talk-log-toggle` (`src/talk/talk.ts:176-177`), "Send" (`src/talk/talk.ts:201`, a `button[type="submit"]` that turns `type="button"` while it reads "Stop", `:291`), `.choice-enter` (`src/choice/choice.ts:88`).
- The rules the component outranks: `room.css:53-76` (every room button), `:331-370` (the walking control and "Eat"), `:683-723` (the tiles, their `white-space: nowrap`, `:active`'s `transform`, the disabled tile's `opacity`), `:761-772`, `:787-848`, `:884-895`, `:1149-1157`, `:1178-1182`; `hud/split.css:216-223`, `:249-258`, `:304-306`, `:449-467`, and spec 029's block (`:542-583`); `choice.css:232-240`.

## What jsdom can't show (probes, scratch scripts outside the repository, not committed)

Run with the workspace's jsdom 30.1.1, each a small page with one stylesheet:

- `@media` blocks are never applied (`@media (min-width: 1px) { .a { opacity: 0.5 } }` leaves `opacity` at `1`), so reduced motion and forced colours can't be read through `getComputedStyle`.
- `el.matches(":focus-visible")` is false and no state can be entered for `:hover` or `:active`.
- `border-color: var(--c)` with `--c` defined reads `rgba(0, 0, 0, 0)`, and `border: 1px solid var(--_b)` reads `3px dashed rgba(0, 0, 0, 0)`; `color`, `background-color`, `clip-path`, `outline-offset`, and the custom properties keep their declared `var()` text.
- In the real room, `background-color: var(--_face)` from `button.css` read `rgba(0, 0, 0, 0)`: jsdom's `computed-style.js` compares specificity per declared name, so room.css's later `background: var(--tile-face)` (lower specificity, a shorthand kept whole because of its `var()`) resets the longhand. Browsers cascade the longhand.

So B's tests read winners with `test/helpers/button-cascade.ts` and cross-check jsdom on what it does compute (plan §R-B4, as built).

## T-B01 (RED)

Tests: `test/ui-skins.test.ts`, `test/ui/button-skin.test.ts`, `test/ui/button-states.test.ts`, and the helpers `test/helpers/button-cascade.ts`, `test/helpers/button-room.ts`. Plan §R-B4 and §R-B5 record what departs, in the same commit (`4f75061e`).

**Earlier tests rewritten: none.** Each earlier test builds its window from the source `index.html`, without `data-skin`, and every rule of `button.css` names `:root[data-skin]`, so their cascades don't change. A draft of the implementation was run against the earlier tests covering the files B changes, before the RED commit, to find any that break. From `apps/web/`: `npx --no-install vitest run test/smoke.test.ts test/site.test.ts test/room/chunk.test.ts test/room/dist.test.ts test/lookdev/builds.test.ts test/ui/hud-look.test.ts test/ui/a11y.test.ts test/ui/degraded.test.ts test/room/plugin.test.ts test/ui/credits.test.ts test/status.test.ts test/room/text.test.ts test/room/scan.test.ts test/ui/choice.test.ts test/ui/choice-cards.test.ts` gave:

```
 Test Files  15 passed (15)
      Tests  307 passed (307)
   Duration  204.63s (tests 88%, import 12%)
```

The draft was then set aside (the untracked files moved out of the worktree, the two tracked edits checked out). From `apps/web/` on the RED commit's tree, `npx --no-install vitest run test/ui-skins.test.ts test/ui/button-skin.test.ts test/ui/button-states.test.ts`, exit 1:

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/impl-030b/apps/web
 ❯ test/ui-skins.test.ts (0 test)
 ❯ test/ui/button-states.test.ts (0 test)
 ❯ test/ui/button-skin.test.ts (0 test)
⎯⎯⎯⎯⎯⎯ Failed Suites 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/ui-skins.test.ts [ test/ui-skins.test.ts ]
Error: Cannot find module '../build/ui-skins' imported from /home/h4reet/h4reet-ai/night/2026-11-17/impl-030b/apps/web/test/ui-skins.test.ts
 ❯ test/ui-skins.test.ts:24:1
 FAIL  test/ui/button-skin.test.ts [ test/ui/button-skin.test.ts ]
Error: Cannot find module '../../build/ui-skins' imported from /home/h4reet/h4reet-ai/night/2026-11-17/impl-030b/apps/web/test/ui/button-skin.test.ts
 ❯ test/ui/button-skin.test.ts:16:1
 FAIL  test/ui/button-states.test.ts [ test/ui/button-states.test.ts ]
Error: Cannot find module '../../build/ui-skins' imported from /home/h4reet/h4reet-ai/night/2026-11-17/impl-030b/apps/web/test/ui/button-states.test.ts
 ❯ test/ui/button-states.test.ts:18:1
 Test Files  3 failed (3)
      Tests  no tests
   Start at  04:09:20
   Duration  71.83s (worker 98%, environment 2%)
```

With the draft's build module and the estimate tokens of plan §R-B1 in place (no stepping yet), the same run failed the ratios, as T-B02 expects: `metal` 19 pairs (every primary border against its yellow face, 1.10 to 2.57; the primary edges against the 0.3 glass over white; the secondary edges against the 0.6 and 0.78 glass over white, 2.63 to 2.81) and `plain` 1 (the secondary disabled border against the 0.78 glass over white). T-B02 below steps them.

## T-B02 (GREEN, `5bcd0633`): the skin file and its build

`content/ui-skins.yaml` (`active: metal`; `metal`, `plain`), `build/ui-skins.ts`, `src/ui/skin.d.ts`, `vite.config.ts` (the plugin), `src/main.ts` (the skin's import; the component's lands in T-B03 with its file, so no commit imports a file it lacks). No test file in the commit. Plan §R-B1 and §R-B2 (as built) record the departures and every step.

On the estimates, from `apps/web/`, `npx --no-install vitest run test/ui-skins.test.ts`, exit 1:

```
     × metal: every pair at its floor 5ms
     × plain: every pair at its floor 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
+   "metal primary normal: the border against the face over white 1.31 under 3",
+   "metal primary normal: the border against the face over black 1.31 under 3",
+   "metal primary normal: the edge (border or face) against spec 029's over-room glass (0.3) over white 1.54 under 3",
+   "metal primary hover: the border against the face over white 1.10 under 3",
+   "metal primary hover: the border against the face over black 1.10 under 3",
+   "metal primary hover: the edge (border or face) against spec 029's over-room glass (0.3) over white 1.54 under 3",
+   "metal primary pressed: the border against the face over white 2.02 under 3",
+   "metal primary pressed: the border against the face over black 2.02 under 3",
+   "metal primary pressed: the edge (border or face) against spec 029's over-room glass (0.3) over white 1.54 under 3",
+   "metal primary disabled: the border against the face over white 2.57 under 3",
+   "metal primary disabled: the border against the face over black 2.57 under 3",
+   "metal primary disabled: the edge (border or face) against spec 029's over-room glass (0.3) over white 1.67 under 3",
+   "metal primary selected: the border against the face over white 1.31 under 3",
+   "metal primary selected: the border against the face over black 1.31 under 3",
+   "metal primary selected: the edge (border or face) against spec 029's over-room glass (0.3) over white 1.54 under 3",
+   "metal secondary normal: the edge (border or face) against spec 005's glass (0.6) over white 2.81 under 3",
+   "metal secondary hover: the edge (border or face) against spec 005's glass (0.6) over white 2.81 under 3",
+   "metal secondary disabled: the edge (border or face) against spec 018's split glass (0.78) over white 2.63 under 3",
+   "metal secondary selected: the edge (border or face) against spec 005's glass (0.6) over white 2.81 under 3",
+   "plain secondary disabled: the edge (border or face) against spec 018's split glass (0.78) over white 2.00 under 3",
      Tests  2 failed | 31 passed (33)
```

The steps (5% HSL lightness each, listed token by token in plan §R-B1, as built) were found with a scratch script outside the repository. The primary borders went lighter to `#ffffff` without holding, then 10 to 13 steps darker to `#7d5f00` and `#312500`. The primary disabled face moved 1 step lighter. The secondary borders moved 1 to 2 steps lighter, and `plain`'s disabled border 3. Then the same command, exit 0:

```
 Test Files  1 passed (1)
      Tests  33 passed (33)
```

## T-B03 (GREEN, `d145a484`): the component

`src/ui/button.css`, and `src/main.ts`'s second import. No test file in the commit. **The chamfer, per control (the plan's choice to record):** `clip-path` on every control, none by `::before`. The focus ring is drawn inside the face, past the chamfer's corners (`outline-offset: calc(-2px - var(--btn-chamfer) / 2)`), and the glow is an inset shadow, so nothing the chamfer clips is outside the box. Plan §R-B3 (as built) records this and the other departures: the `:is()` selectors, "Send" by its row (it turns `type="button"` as "Stop"), the ring's colour per variant, the diagonal edges by gradients, `opacity` and `transform` owned, and the walking control's selected state by its view's role.

From `apps/web/`, `npx --no-install vitest run test/ui/button-skin.test.ts test/ui/button-states.test.ts`, exit 0:

```
 Test Files  2 passed (2)
      Tests  16 passed (16)
```

## T-B04: the two builds

From the repository's root, `npm run build -w apps/web`, with `active: metal`, exit 0. The skin's line (line 459 of the build's output):

```
ui-skins: metal (css)
```

`dist/index.html`'s root, and the start of the generated stylesheet in the page's one stylesheet, `dist/assets/index-CZFH0WpD.css`: the skin's rule at character 1025, the component's at 2560, and room.css's first rule (`.hud-safe-probe`) at 14023, so the component comes before room.css, as plan §R-B2 asks:

```
<html lang="en" data-skin="metal">
:root[data-skin=metal]{--btn-font-family:"IBM Plex Sans", system-ui, sans-serif;--btn-font-weight:700;--btn-case:uppercase;--btn-tracking:.06em;--btn-chamfer:.5rem;--btn-radius:0rem;--btn-frame:#2a3038;--btn-bevel-light:#ffffff47;--btn-bevel-dark:#0000008c;--btn-highlight:#ffffff2e;--btn-glow-radius:.5rem;--btn-primary-ring:#14171c;--btn-primary-normal-face:#f2c230;--btn-primary-normal-label:#14171c;--btn-primary-normal
```

Then `active: plain`, a scratch edit of that one line by the Edit tool, never committed, the same command, exit 0:

```
ui-skins: plain (css)
<html lang="en" data-skin="plain">
:root[data-skin=plain]{--btn-font-family:"IBM Plex Sans", system-ui, sans-serif;--btn-font-weight:400;--btn-case:none;--btn-tracking:0em;--btn-chamfer:0rem;--btn-radius:0rem;--btn-frame:#10141a;--btn-bevel-light:#fff3;--btn-bevel-dark:#0006;--btn-highlight:#fff0;--btn-glow-radius:0rem;--btn-primary-ring:#10141a;--btn-primary-normal-face:#e8e4dc;--btn-primary-normal-label:#10141a;--btn-primary-normal-border:#10141a;--btn
```

`git diff --stat` during the scratch build showed `apps/web/content/ui-skins.yaml | 2 +-`, its one line, and nothing else. The edit was reverted by the Edit tool, `git status --short` then printing nothing, and the site rebuilt with `metal` (exit 0, `dist/index.html` `<html lang="en" data-skin="metal">`), so `dist/` doesn't hold the scratch build. Both builds also print Vite's notice that `configLoader: 'native'` wants file extensions on the config's imports. It lists every import of `vite.config.ts`, the new `./build/ui-skins` among them, written as the file's others are.

## Checks

From `apps/web/`, the tests B added and those covering the files B changed (`vite.config.ts` and `src/main.ts`: the builds' tests; the stylesheets' readers; the selection screen's): `npx --no-install vitest run test/ui-skins.test.ts test/ui/button-skin.test.ts test/ui/button-states.test.ts test/smoke.test.ts test/site.test.ts test/room/chunk.test.ts test/room/dist.test.ts test/lookdev/builds.test.ts test/ui/hud-look.test.ts test/ui/a11y.test.ts test/ui/degraded.test.ts test/room/plugin.test.ts test/ui/credits.test.ts test/status.test.ts test/room/text.test.ts test/room/scan.test.ts test/ui/choice.test.ts test/ui/choice-cards.test.ts`, its whole output, exit 0:

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/impl-030b/apps/web
 Test Files  18 passed (18)
      Tests  356 passed (356)
   Start at  04:18:37
   Duration  250.09s (tests 86%, import 13%, transform 1%)
```

From the repository's root, `make lint`, its whole output, exit 0:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
916 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
```

Not run, by the brief's rule 4 and the supervisor's step 4: the whole `apps/web` suite, `make test`, `make evals`, and `make check` (the integration's, T-INT04). `test/ui/twin-2d.test.ts` wasn't among the files run.

## Human-only paths

None written, and no patch for his hand: group B touches nothing under `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`, or `assets/**`.

## Interruptions and slips

- **Refused, the bash gate:** `rm -rf /tmp/impl-030b-red-qWOK` ("recursive delete outside workspace. Route: delete only inside the repo"). Not respelled or retried. The folder, a `git archive` export of the RED commit with a `node_modules` symlink, stays in `/tmp`; it holds no secret. (The command before it, deleting by `$(cat …)`, stopped at the permission layer's "Dangerous rm operation" check; I ran the substitution alone, then hit the gate with the literal path.)
- **Refused, git:** `git stash push -u -m impl-030b-green-draft-<time> -- <paths>` answered "Cannot save the current status" and stashed nothing (`git stash list` held no entry of mine). The draft was set aside by moving its untracked files out of the worktree and back (`mv`), with the two tracked edits checked out and later redone with the Edit tool.
- **Failed route:** the RED run on the `git archive` export failed in vitest's global build ("Named export 'gzip' not found" from `pako`, resolved through the symlinked `node_modules`), so RED ran in the worktree with the draft set aside.
- **Slip, Q40:** one tracked-file edit was made by `sed -i`, not the Edit tool: plan.md's citation `layout.ts:388-394` → `layout.ts:381-394`, before T-B03's commit (`d145a484`), which holds it. Every other tracked file was written with Edit or Write.
- `make setup` ran first (`node_modules` was missing), exit 0.

## Questions (in `/night/io/out/questions.md`, each with its recommended answer)

1. The buttons' boundary over the room, two-tone (border against face; border or face against what lies beside it): taken as recommended tonight (plan §R-B4, as built).
2. The focus ring and the selected glow drawn inside the chamfered face, the ring's colour per variant: built as recommended (plan §R-B3, as built).
3. For T-INT02: which earlier tests should pin the skinned look once room.css's dead tile declarations go.

## What's done, and what isn't

Done: T-B01 (RED, `4f75061e`, seen failing, `b8cbd686`), T-B02 (`5bcd0633`), T-B03 (`d145a484`), T-B04 (the two builds above, the scratch edit reverted, never committed). `impl-030ds` may start from this branch's tip.

Not done here, or not B's:

- The whole suite and `make check` are T-INT's.
- T-INT02 removes room.css's and split.css's declarations the component leaves dead; until then they stand beneath it, and the earlier tests that pin spec 014's tile colours keep testing the unskinned page (question 3).
- T-INT02a re-runs A's halves' contrast with the skin's faces in its cascade.
- The skin's values are estimates for his look (SC-008), as are the questions above.
- The screenshots in `resume/` weren't reachable from this worktree, so the `metal` skin is drawn from the orders' description of his reference alone.
- jsdom can't show the paint, so the chamfer's diagonal edges, the inner glow, and the ring inside the face are the cascade's reading; a browser look (DevTools, or his) is the check left.
- The "Back" control, "Eat", and the larger view's toggle were checked where the layouts hold them: "Back" in the split layout alone. The bar has five tiles in jsdom (no Fullscreen API), six in a browser that offers full screen.

# Rework: rework-030b (implementer, night of 2026-11-17)

Branch `night/rework-030b/rework-030b` from `impl-030b`'s tip `02a5c30a`. Built to `rework2-spec-030`'s documents at `8e83e7fc` (spec FR-008 to FR-014, plan §R-B1 to §R-B5 and §9's B row, tasks T-B01 to T-B04, notes "Rework 2"), for `rv-030b`'s findings as the decision page records them (its `review.md` is in its io folder, not mounted here): R-1 (the page's Q89, its recommended answer), R-2 (rework 2's T-B01 (c) and T-B03, and `rv-rework2-spec-030`'s R-2: the control's own `box-shadow` pinned to `none`), N-2; rework 2's other B rows. I wrote none of B or its review.

## RED

Changed: `test/ui-skins.test.ts`, `test/ui/button-skin.test.ts`, `test/ui/button-states.test.ts` and the helpers `test/helpers/button-cascade.ts` (a `::before`/`::after` read by the cascade, each pseudo-element inheriting from its element in its state; the element's own `style`, where `layout.ts` writes `--bar-w`, `--safe-*` and `--wall-scale-*`; `padding`, `gap`, `font` as shorthands of the longhands read) and `test/helpers/button-room.ts` (`resume/resume.css` in the bundle's order, as `main.ts` imports `./resume` before `./room/app`; `baseSheets()`, the page without B; the two "Close" buttons, each reached as the room makes it; `cssLength`, moved here from `button-states.test.ts`). All B's own files (plan §R-B5 and its "As built"); no earlier test file.

The cases, new or changed:

- **T-B01 (a)**, `ui-skins.test.ts`: the boundary also against the resume panel's `#ffffff` (`BESIDE`, 10 grounds; the panel's `background: #fff` read from `resume.css`); the cards' tokens per CSS skin (`--btn-secondary-selected-glow` 3:1 on `rgb(16 20 26)`, `--hud-text` 4.5:1 on `--btn-frame`, rework 2's R-5); the root's `data-skin` **and `data-skin-kind`**, the resolved skin's (plan §R-B2, rework N-3; an image skin falling back writes its fallback's ID and `css`), every attribute already there kept, C's `class="dark-page"` among them (the supervisor's item 5); the swap: every `--btn-*` of the swapped build is `plain`'s token, every one of the real build `metal`'s, and the two differ.
- **T-B01 (b)**, `button-skin.test.ts`: the control paints and clips nothing: `background-color: transparent`, `background-image: none`, a transparent border, `border-image-source: none`, `box-shadow: none`, `clip-path: none`, `filter: none`, `isolation: isolate`, each won by `ui/button.css`; `position: relative` by B only where the page without B leaves the control static, its own position kept otherwise; the `::before` (`content: ""`, `position: absolute`, `inset: 0`, `z-index: -1`, `pointer-events: none`) carries the face, the border's line, the frame, and the chamfer's `polygon(…)`; the bar's tiles in the column layout and the dock keep spec 014's metrics under every skin (the words' own case, 400, `letter-spacing: normal`, the page's family; Q89); the conversation's "Close, Escape" (split, the conversation open; its name and key cap kept) and the resume panel's "Close" (split and column, the panel open; `.resume-pdf` untouched by B); `plain` on both "Close" buttons too. **New, R-1's width test**: in the column layout and the dock, under each CSS skin, the six tiles' widths from `fonts/IBMPlexSans-{Regular,Bold}.woff`'s advance widths (fontkit's `glyphsForString`, no kerning, as rv-030b summed them), each tile's case, weight, size, tracking, padding, and border (the larger of normal's and selected's) read by the cascade, "Leave full screen" (the longer of `fullscreen.enter` and `.leave`, `room/ui-words.yaml`) as the sixth: one row ≤ `HUD_PLACEMENTS.bar.maxRem` in the column layout, and the dock's flex rows ≤ its band's (2 at 390 px).
- **T-B01 (c)**, `button-states.test.ts`: the faces, the bevel, the glow and the 2 px selected frame read from the `::before`; disabled's dashes from the `::after` (`content: ""`, dashed, the variant's disabled border colour, no pointer events, its own `polygon`), none at rest; the ring B's, 2 px solid in the variant's `ring`, its outer corners inside the `::before`'s octagon (`2 × (−offset − width) ≥ chamfer + 2 × (border + inset)`), in every state; hover only under `@media (hover: hover)` (N-2); **no clip, no filter, no shadow on any control**, both skins, every layout and view (split at rest and walking, column, dock, both "Close" buttons, "Enter" before and after the choices), every state (normal, hover, focus-visible, pressed, selected, disabled): every declaration of `clip-path`, `-webkit-clip-path`, and `filter` matching it is `none`, jsdom's computed `clip-path` is `none` or empty, and the control's `box-shadow` is `none`, won by `ui/button.css`; the chamfer's `clip-path` only on rules ending in `::before` or `::after`; reduced motion and the 120 ms fade on the control and its `::before`; forced colours with the `::before` and `::after` not displayed, `filter: none`, `background-color: ButtonFace`. The selected case now also asserts the control's border width doesn't change (no box moves). The wrap case reads a node with no `white-space` as `normal` (my first draft passed `null` to `toMatch`; corrected before the commit; this case passes on the old tip and the new).

From `apps/web/`, `npx --no-install vitest run test/ui-skins.test.ts test/ui/button-skin.test.ts test/ui/button-states.test.ts`, exit 1, on `impl-030b`'s code with these tests. Its output is 583 lines; below are its result lines and every failure's header and error line (the code frames and Expected/Received blocks, which repeat the error lines, left out):

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/rework-030b/apps/web
     × writes data-skin and data-skin-kind, the resolved skin's, on the page's root element, and only there 11ms
     × keeps every attribute the root already has: group C's class="dark-page" stays beside data-skin 2ms
     × writes the fallback's ID and kind for an image skin falling back (rework, N-3) 2ms
     × builds metal from the repository's file and plain from a copy whose one difference is `active: plain` 8ms
     × gives each control the component, its variant, 44 × 44, and wrapping, in the split layout (1366 × 768) 25367ms
     × gives each control the component, its variant, 44 × 44, and wrapping, in the split layout, walking 126ms
     × gives each control the component, its variant, 44 × 44, and wrapping, in the column layout (1280 × 720) 44ms
     × gives each control the component, its variant, 44 × 44, and wrapping, in the dock (390 × 844) 97ms
     × gives the conversation's "Close, Escape" the secondary button, its name and key cap kept (Q51) 41ms
     × gives the resume panel's "Close" the secondary button on the panel's white, in the split layout (1366 × 768) (Q51) 45ms
     × gives the resume panel's "Close" the secondary button on the panel's white, in the column layout (1280 × 720) (Q51) 67ms
     × gives the selection screen's "Enter" the primary button 58ms
     × draws plain's tokens on every control once `active: plain` (SC-004) 53ms
     × metal, the column layout (1280 × 720) 113ms
     × metal, the dock (390 × 844) 87ms
     × plain, the column layout (1280 × 720) 143ms
     × reaches hover, focus-visible, and pressed on every room control and both Close buttons, each beyond colour, the ring inside 25498ms
     × applies hover only where the window can hover (@media (hover: hover)) 171ms
     × reaches disabled on the room's buttons and links and both Close buttons, by :disabled and by aria-disabled, with the ::after's dashes 173ms
     × reaches selected on "Pause the room" pressed, with the glow and a 2 px frame on the ::before 72ms
     × reaches selected on the walking control while walking 39ms
     × gives "Enter" its disabled look before both choices and its primary look after, the ring inside 39ms
     × metal: every control, in every layout, view, and state 308ms
     × plain: every control, in every layout, view, and state 346ms
     × puts the chamfer's clip-path only on rules ending in ::before or ::after 38ms
     × wraps a label twice its length: no nowrap and no ellipsis on any control or inside it 99ms
     × otherwise fades colours and shadows for at most 120 ms, and never moves 42ms
     × draws every control in the system's colours, with no image, clip, filter, or shadow, the ::before and ::after hidden, the selected border thicker 41ms
 FAIL  test/ui-skins.test.ts > the generated stylesheet (FR-010) > writes data-skin and data-skin-kind, the resolved skin's, on the page's root element, and only there
AssertionError: expected '<!doctype html>\n<html lang="en" data…' to be '<!doctype html>\n<html lang="en" data…' // Object.is equality
 FAIL  test/ui-skins.test.ts > the generated stylesheet (FR-010) > keeps every attribute the root already has: group C's class="dark-page" stays beside data-skin
AssertionError: expected '<!doctype html>\n<html lang="en" clas…' to be '<!doctype html>\n<html lang="en" clas…' // Object.is equality
 FAIL  test/ui-skins.test.ts > the generated stylesheet (FR-010) > writes the fallback's ID and kind for an image skin falling back (rework, N-3)
AssertionError: expected '<html data-skin="one"><body></body></…' to be '<html data-skin="one" data-skin-kind=…' // Object.is equality
 FAIL  test/ui-skins.test.ts > swapping the skin is an edit of the data alone (SC-004) > builds metal from the repository's file and plain from a copy whose one difference is `active: plain`
AssertionError: expected '<html lang="en" data-skin="metal"><bo…' to be '<html lang="en" data-skin="metal" dat…' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > gives each control the component, its variant, 44 × 44, and wrapping, in the split layout (1366 × 768)
AssertionError: the split layout (1366 × 768): the bar's tiles (Resume): border-image-source won by nothing (): expected undefined to be 'ui/button.css' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > gives each control the component, its variant, 44 × 44, and wrapping, in the split layout, walking
AssertionError: the split layout, walking: the bar's tiles (Resume): border-image-source won by nothing (): expected undefined to be 'ui/button.css' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > gives each control the component, its variant, 44 × 44, and wrapping, in the column layout (1280 × 720)
AssertionError: the column layout (1280 × 720): the bar's tiles (Resume): border-image-source won by nothing (): expected undefined to be 'ui/button.css' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > gives each control the component, its variant, 44 × 44, and wrapping, in the dock (390 × 844)
AssertionError: the dock (390 × 844): the bar's tiles (Resume): border-image-source won by nothing (): expected undefined to be 'ui/button.css' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > gives the conversation's "Close, Escape" the secondary button, its name and key cap kept (Q51)
AssertionError: the split layout, the conversation open: "Close, Escape" (the conversation) (EscClose): color won by room/room.css (html[data-hud="column"] .hud-panels button): expected 'room/room.css' to be 'ui/button.css' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > gives the resume panel's "Close" the secondary button on the panel's white, in the split layout (1366 × 768) (Q51)
AssertionError: the split layout (1366 × 768), the resume panel open: "Close" (the resume panel) (Close): color won by room/room.css (.room button): expected 'room/room.css' to be 'ui/button.css' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > gives the resume panel's "Close" the secondary button on the panel's white, in the column layout (1280 × 720) (Q51)
AssertionError: the column layout (1280 × 720), the resume panel open: "Close" (the resume panel) (Close): color won by room/room.css (.room button): expected 'room/room.css' to be 'ui/button.css' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > gives the selection screen's "Enter" the primary button
AssertionError: the selection screen: "Enter" (Enter): border-image-source won by nothing (): expected undefined to be 'ui/button.css' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > draws plain's tokens on every control once `active: plain` (SC-004)
AssertionError: plain, split: the bar's tiles (Resume): border-image-source won by nothing (): expected undefined to be 'ui/button.css' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > the bar's six tiles fit its row in the column layout and its rows in the dock, under every skin (Q89) > metal, the column layout (1280 × 720)
AssertionError: Resume 4.81rem, 2D view 5.00rem, Pause the room 8.90rem, Leave full screen 10.02rem, How data flows 9.21rem, Credits 5.06rem; one row 44.76rem; the bar 35.00rem, 1 row(s): expected 716.1 to be less than or equal to 560
 FAIL  test/ui/button-skin.test.ts > the bar's six tiles fit its row in the column layout and its rows in the dock, under every skin (Q89) > metal, the dock (390 × 844)
AssertionError: Resume 4.81rem, 2D view 5.00rem, Pause the room 8.90rem, Leave full screen 10.02rem, How data flows 9.21rem, Credits 5.06rem; one row 44.76rem; the bar 24.38rem, 2 row(s): expected 3 to be less than or equal to 2
 FAIL  test/ui/button-skin.test.ts > the bar's six tiles fit its row in the column layout and its rows in the dock, under every skin (Q89) > plain, the column layout (1280 × 720)
AssertionError: Resume 4.23rem, 2D view 4.15rem, Pause the room 6.97rem, Leave full screen 7.39rem, How data flows 6.87rem, Credits 3.85rem; one row 35.21rem; the bar 35.00rem, 1 row(s): expected 563.402 to be less than or equal to 560
 FAIL  test/ui/button-states.test.ts > the component's states (FR-012) > reaches hover, focus-visible, and pressed on every room control and both Close buttons, each beyond colour, the ring inside
AssertionError: the bar's tiles (Resume), hover: changes {"bevel":"none","dashes":"none ","outline style":"none","outline width":"","decoration":"none"} from {"bevel":"none","dashes":"none ","outline style":"none","outline width":"","decoration":"none"}: expected 0 to be greater than 0
 FAIL  test/ui/button-states.test.ts > the component's states (FR-012) > applies hover only where the window can hover (@media (hover: hover))
AssertionError: hover's rule sits in @media (hover: hover): expected '' to match /@media\s*\(hover:\s*hover\)/
 FAIL  test/ui/button-states.test.ts > the component's states (FR-012) > reaches disabled on the room's buttons and links and both Close buttons, by :disabled and by aria-disabled, with the ::after's dashes
AssertionError: the bar's tiles aria-disabled: face: expected null to be '#1a2226' // Object.is equality
 FAIL  test/ui/button-states.test.ts > the component's states (FR-012) > reaches selected on "Pause the room" pressed, with the glow and a 2 px frame on the ::before
AssertionError: expected 'none' not to be 'none' // Object.is equality
 FAIL  test/ui/button-states.test.ts > the component's states (FR-012) > reaches selected on the walking control while walking
AssertionError: expected null to be '#16323c' // Object.is equality
 FAIL  test/ui/button-states.test.ts > the component's states (FR-012) > gives "Enter" its disabled look before both choices and its primary look after, the ring inside
AssertionError: expected null to be '#ac9863' // Object.is equality
 FAIL  test/ui/button-states.test.ts > nothing clips a control, nor shadows or filters it (FR-013; rework, S-4; rv-030b's R-2) > metal: every control, in every layout, view, and state
AssertionError: metal, the bar's tiles, normal: clip-path by ui/button.css (:root[data-skin][data-hud][data-split]
 FAIL  test/ui/button-states.test.ts > nothing clips a control, nor shadows or filters it (FR-013; rework, S-4; rv-030b's R-2) > plain: every control, in every layout, view, and state
AssertionError: plain, the bar's tiles, normal: clip-path by ui/button.css (:root[data-skin][data-hud][data-split]
 FAIL  test/ui/button-states.test.ts > nothing clips a control, nor shadows or filters it (FR-013; rework, S-4; rv-030b's R-2) > puts the chamfer's clip-path only on rules ending in ::before or ::after
AssertionError: :root[data-skin][data-hud][data-split]
 FAIL  test/ui/button-states.test.ts > labels that grow (FR-013) > wraps a label twice its length: no nowrap and no ellipsis on any control or inside it
TypeError: .toMatch() expects to receive a string, but got object
 FAIL  test/ui/button-states.test.ts > motion (FR-014) > otherwise fades colours and shadows for at most 120 ms, and never moves
AssertionError: the bar's tiles {"pseudo":"before"}: expected undefined to be 'ui/button.css' // Object.is equality
 FAIL  test/ui/button-states.test.ts > forced colours (FR-014) > draws every control in the system's colours, with no image, clip, filter, or shadow, the ::before and ::after hidden, the selected border thicker
AssertionError: the bar's tiles: expected null to be 'none' // Object.is equality
 Test Files  3 failed (3)
      Tests  28 failed | 36 passed (64)
   Duration  108.04s (tests 90%, transform 5%, import 4%)
```

The wrap case's `TypeError` was my test's (above), fixed before the commit; rerun alone, `npx --no-install vitest run test/ui/button-states.test.ts -t "wraps a label"`, exit 0: `Tests  1 passed | 12 skipped (13)`. Read against the review: the metal column row is 44.76rem here, not rv-030b's 44.01rem, because `impl-030b`'s selected state widens a tile's border to 2 px and the test counts the wider of normal and selected (0.75rem over the six); `plain` fails the column's row by the same 0.75rem (35.21rem). The cases passing on the old tip (36) are those whose assertions the old code already met: the schema's refusals, the stylesheet's rules, the ratios (now with the resume's white), the cards' tokens, reduced motion, and `plain`'s dock.

## GREEN

- **GREEN 1** (`94da04ca`, `build/ui-skins.ts`): `ResolvedSkin.kind`; `skinHtml(html, id, kind)` writes `data-skin` and `data-skin-kind` after the root's own attributes. From `apps/web/`, `npx --no-install vitest run test/ui-skins.test.ts`, exit 0: `Test Files  1 passed (1)`, `Tests  37 passed (37)`, `Duration  62.74s (transform 49%, import 45%, tests 5%)`.
- **GREEN 2** (`51cd3484`, `src/ui/button.css`, with plan §R-B2, §R-B3, §R-B4 "As built (rework-030b)" and spec.md's Amendments row for Q89): the component rewritten as plan §R-B3 (as built) says. From `apps/web/`, `npx --no-install vitest run test/ui-skins.test.ts test/ui/button-skin.test.ts test/ui/button-states.test.ts`, exit 0, its whole result:

```
 Test Files  3 passed (3)
      Tests  64 passed (64)
```

**`position: relative`, the controls static at the base** (T-B03's list, checked per control against `baseSheets()` in `button-skin.test.ts`): the bar's tiles (split, column, dock), "Back", "Close, Escape", the larger view's toggle, the log's toggle, "Send", the resume's "Close", "Enter". Kept: the walking control and "Eat", `position: absolute` (`room.css:331`, `:355`).

**The comment at `button.css:19`** ("The chamfer is a clip-path octagon cut from inside the box, whose 44 × 44 minimum stays the hit area") was wrong: a clipped-out corner takes no press. The header now says the control clips nothing and the `::before` carries the octagon.

## A second RED, after GREEN: `rework3-spec-030`'s R-2 cases

`rework3-spec-030` (its tip `75472b30`, read at this point) writes `rv-rework2-spec-030`'s R-2 into T-B01 (c): the control's `box-shadow` asserted with `.split-back` and `.split-hint` inside a panel marked `data-over="room"` (spec 029's plate rule, `split.css:548-556`, in the cascade), and every `box-shadow` B declares on a `::before` rule. Two cases added to `button-states.test.ts`: the panels (`.talk`, `.room-list`, `.hud-bar`) marked `data-over="room"`, the conversation and the resume panel open, every state, the winner `none` from `ui/button.css`, and the plate's declaration seen matching (so the case discriminates); and every `box-shadow` of `ui/button.css` other than `none` on a `::before` rule (B pins the control's own to `none`, so "every" reads as every shadow drawn). They pass on GREEN 2's code (it already pins the control's shadow), so they were run against `impl-030b`'s `button.css`, put in the worktree by `git checkout 02a5c30a -- apps/web/src/ui/button.css` and restored by `git checkout HEAD -- apps/web/src/ui/button.css` (`git status --short` then showed only the test file). From `apps/web/`, `npx --no-install vitest run test/ui/button-states.test.ts -t "rework 3"`:

On `impl-030b`'s `button.css`, exit 1:

```
     × keeps the control's box-shadow none with its panel over the room, where spec 029's plate would draw (rework 3, R-2) 22738ms
     × declares every shadow other than none on a ::before rule (rework 3, R-2) 94ms
 FAIL  test/ui/button-states.test.ts > nothing clips a control, nor shadows or filters it (FR-013; rework, S-4; rv-030b's R-2) > keeps the control's box-shadow none with its panel over the room, where spec 029's plate would draw (rework 3, R-2)
AssertionError: conversation, split-back, normal: expected 'inset 0 0 0 1px #2a3038,\n    inset 3…' to be 'none' // Object.is equality
 FAIL  test/ui/button-states.test.ts > nothing clips a control, nor shadows or filters it (FR-013; rework, S-4; rv-030b's R-2) > declares every shadow other than none on a ::before rule (rework 3, R-2)
AssertionError: expected false to be true // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 13 skipped (15)
```

On GREEN 2's `button.css`, exit 0:

```
 Test Files  1 passed (1)
      Tests  2 passed | 13 skipped (15)
```

## A third RED: the split tiles' two lines (T-B04's estimate, Q75)

T-B04's estimate (its table below) found two of the six labels over two lines under `metal` in the split layout, where rv-030b's R-3 had found none: "Leave full screen" (LEAVE / FULL / SCREEN; "LEAVE FULL" is 81.30px against the content box's 72.67px) and "How data flows" (HOW / DATA / FLOWS; "HOW DATA" is 75.11px by advance widths, 72.64px with the face's kerning, so it fits only if the browser kerns, by 0.03px). So Q75's recommended answer applies, and its rule needs a test first. New case in `button-skin.test.ts`, under each CSS skin: in the split layout, with the full-screen tile added to the bar as `layout.ts` makes it (jsdom has no Fullscreen API) and each of its two labels in turn, every tile's words, in the case, weight, size, and tracking the cascade gives, broken greedy by word at advance widths in the tile's content box (the bar's `--wall-bar-w` less its padding and two gaps, a third, less the tile's padding and border, all read by the cascade), take at most two lines. From `apps/web/`, `npx --no-install vitest run test/ui/button-skin.test.ts -t "two lines"`, exit 1:

```
     × metal, the split layout (1366 × 768) 22545ms
 FAIL  test/ui/button-skin.test.ts > the split layout's tiles hold their words in two lines under every skin (Q75) > metal, the split layout (1366 × 768)
AssertionError: Resume: RESUME (uppercase, 700, 72.67px); 2D view: 2D VIEW (uppercase, 700, 72.67px); Pause the room: PAUSE / THE ROOM (uppercase, 700, 72.67px); How data flows: HOW / DATA / FLOWS (uppercase, 700, 72.67px); Credits: CREDITS (uppercase, 700, 72.67px); Full screen: FULL / SCREEN (uppercase, 700, 72.67px); Leave full screen: LEAVE / FULL / SCREEN (uppercase, 700, 72.67px): expected [ 'How data flows', …(1) ] to deeply equal []
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 14 skipped (16)
```

(`plain`'s case passes: its words' own case and weight 400.)

The rule (GREEN 3, below) was then first drafted ahead of its test and broke my own RED-1 case, which expected the skin's case on every split tile: `npx --no-install vitest run test/ui-skins.test.ts test/ui/button-skin.test.ts test/ui/button-states.test.ts`, exit 1, `AssertionError: the split layout (1366 × 768): the bar's tiles (How data flows): case: expected 'none' to be 'uppercase'` (and the same walking), `Tests  2 failed | 66 passed (68)`. So the draft was taken out with the Edit tool (`git diff --stat` then named the test file alone), and `button-skin.test.ts`'s `checkControl` now expects the words' own case on those two tiles (`ownCase`). Run on the code without the rule, `npx --no-install vitest run test/ui/button-skin.test.ts`, exit 1:

```
     × gives each control the component, its variant, 44 × 44, and wrapping, in the split layout (1366 × 768) 26542ms
     × gives each control the component, its variant, 44 × 44, and wrapping, in the split layout, walking 351ms
     × metal, the split layout (1366 × 768) 129ms
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > gives each control the component, its variant, 44 × 44, and wrapping, in the split layout (1366 × 768)
AssertionError: the split layout (1366 × 768): the bar's tiles (How data flows): case: expected 'uppercase' to be 'none' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > one button component for every control of Q5 (FR-008, FR-013; SC-003) > gives each control the component, its variant, 44 × 44, and wrapping, in the split layout, walking
AssertionError: the split layout, walking: the bar's tiles (How data flows): case: expected 'uppercase' to be 'none' // Object.is equality
 FAIL  test/ui/button-skin.test.ts > the split layout's tiles hold their words in two lines under every skin (Q75) > metal, the split layout (1366 × 768)
AssertionError: Resume: RESUME (uppercase, 700, 72.67px); 2D view: 2D VIEW (uppercase, 700, 72.67px); Pause the room: PAUSE / THE ROOM (uppercase, 700, 72.67px); How data flows: HOW / DATA / FLOWS (uppercase, 700, 72.67px); Credits: CREDITS (uppercase, 700, 72.67px); Full screen: FULL / SCREEN (uppercase, 700, 72.67px); Leave full screen: LEAVE / FULL / SCREEN (uppercase, 700, 72.67px): expected [ 'How data flows', …(1) ] to deeply equal []
 Test Files  1 failed (1)
      Tests  3 failed | 13 passed (16)
```

**GREEN 3** (`6e8a9298`, `button.css`'s Q75 rule, with plan §R-B3 "As built"): from `apps/web/`, `npx --no-install vitest run test/ui-skins.test.ts test/ui/button-skin.test.ts test/ui/button-states.test.ts`, exit 0:

```
 Test Files  3 passed (3)
      Tests  68 passed (68)
   Duration  136.42s (tests 89%, transform 6%, import 5%)
```

## T-B04: the tiles' fit at the split windows (Q75)

**The geometry**, read from the real room with `metal` in place by a scratch vitest outside the tree (`/tmp/rework-030b/fit/fit.test.ts`, written with the Write tool; it imports `test/helpers/button-room.ts` and writes `/tmp/rework-030b/fit/fit.json`), run from `apps/web/` with `npx --no-install vitest run --root /tmp/rework-030b/fit --dir /tmp/rework-030b/fit --testTimeout 600000`, exit 0 (the first run, without `--testTimeout`, timed out at 5 s; the second printed nothing, the room's helper holding `console.log`, so the third wrote the file). Its result, the same at all three windows:

| Window | `data-split` | `--wall-scale-right` | `--wall-bar-w` | bar padding, gap | columns | tile font | tile padding, border | tracking, case, weight |
|---|---|---|---|---|---|---|---|---|
| 1366 × 768 | on | 1 | 288px | 0.25rem, 0.25rem | `repeat(3, minmax(0, 1fr))` | `calc(0.8125rem * 1)` = 13px | `0.125rem 0.5rem`, 1px | 0.06em, uppercase, 700 |
| 1440 × 900 | on | 1 | 288px | 0.25rem, 0.25rem | the same | 13px | the same | the same |
| 1920 × 1080 | on | 1 | 288px | 0.25rem, 0.25rem | the same | 13px | the same | the same |

So each tile's content box is (288 − 2 × 4 − 2 × 4) ÷ 3 − 2 × 8 − 2 × 1 = 72.67px, and the tracking 0.78px a character, at every split window on this tree (B's branch, before A; the column is at its 18rem least at all three).

**The lines**, from `apps/web/fonts/IBMPlexSans-Bold.woff`'s `cmap` (format 4) and `hmtx`, read by inline `python3 -I -B -c` with `zlib` and `struct` (nothing written), each run's width the sum of its glyphs' advances plus the tracking after each character, greedy by word. From the repository's root, exit 0, its whole output:

```
bar 288.00px, column 90.67px, content 72.67px, font 13.00px, tracking 0.78px
Resume             1 line(s): RESUME  [57.0 px]
2D view            1 line(s): 2D VIEW  [60.0 px]
Pause the room     2 line(s): PAUSE / THE ROOM  [46.4, 72.2 px]
Full screen        2 line(s): FULL / SCREEN  [33.5, 55.2 px]
Leave full screen  3 line(s): LEAVE / FULL / SCREEN  [43.9, 33.5, 55.2 px]
How data flows     3 line(s): HOW / DATA / FLOWS  [33.7, 37.6, 48.4 px]
Credits            1 line(s): CREDITS  [61.0 px]
```

Two labels over two lines: "Leave full screen" and "How data flows". "THE ROOM" fits by 0.5px. With the face's kerning (fontkit's `layout`, `node -e`, inline): "HOW DATA" 72.64px (75.11px without), "LEAVE FULL" 80.60px, "PAUSE THE" 76.18px, "THE ROOM" 72.05px, so "How data flows" fits two lines only if the browser kerns, by 0.03px; the estimate takes the advances alone, as R-1's test does. Both tiles take the words' own case (GREEN 3). The estimate again, the same `python3` reader, those three labels in their own case, exit 0:

```
How data flows     2 line(s): How data / flows  [64.7, 37.3 px]
Full screen        2 line(s): Full / screen  [26.4, 45.6 px]
Leave full screen  2 line(s): Leave full / screen  [67.1, 45.6 px]
```

`button-skin.test.ts`'s "two lines" case holds this at 1366 × 768 under both CSS skins. rv-030b's R-3 ("no label over two lines" at the real windows) didn't hold on this count: the review's own measure isn't on the page, so I can't say where they differ; a likely difference is "Leave full screen", which jsdom's bar doesn't hold (no Fullscreen API).

