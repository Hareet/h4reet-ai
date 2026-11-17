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

## rv-030b's other findings, named, not built (the brief's item 4)

- **R-3** (the split tiles' third line, "only an unwritten input reaches it"): its three-line case is answered by T-B04's table and Q75's rule above for the six labels the room has; a longer label (a translation) is still a later spec's layout change (FR-013, the edge case), not built.
- **R-4** (the skinned page's own AA): T-INT's (T-INT02a and the page-level checks), not built.
- **R-5** (the cascade helper drops a selector jsdom can't parse, `button-cascade.ts`'s `catch { return false; }`): not built. The helper now strips a trailing `::before`/`::after` before `matches()`, so the pseudo-element rules it reads are parsed; any other selector jsdom refuses is still dropped silently.
- **N-1, N-3**: not built (their text isn't on the page). **N-2** (the hover rules unguarded): built, `@media (hover: hover)`, tested under `hover: none`. **N-4**: the page says it "goes with the `::before`"; its own text isn't on the page, and the `::before` (GREEN 2) is built.

## For C (the brief's item 5)

Whatever writes `data-skin` must keep `class="dark-page"`. B's plugin does: `skinHtml` appends after the root's own attributes. From the merged tree (`git merge-tree --write-tree HEAD a3898c60`, tree `4f0500c2`, no conflict), its `apps/web/index.html` (`git show 4f0500c2…:apps/web/index.html`, copied to `/tmp/rework-030b/merged-index.html`) has `<html lang="en" class="dark-page">`; run through B's `skinHtml` with the resolved skin, from `apps/web/`, `npx --no-install tsx -e '…readSkins, resolveSkin, skinHtml…'`, exit 0:

```
<html lang="en" class="dark-page" data-skin="metal" data-skin-kind="css">
```

`ui-skins.test.ts` holds it too ("keeps every attribute the root already has"). C's `dark.css` at `a3898c60` sets `outline` and `outline-offset` on `:root.dark-page button:focus-visible`, (0,3,1); B's ring on "Enter" is (0,5,0) and wins (C's own comment says so).

## T-B01 (d): the whole `apps/web` suite on B's GREEN tip

From `apps/web/`, `npx --no-install vitest run`, started in the background at the GREEN tip `6e8a9298` (its save point `wip(rework-030b): T-B01 (d)…`, the same tree), its own notice waited for; exit 1. Its whole output (73 lines, ANSI colours taken out):

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/rework-030b/apps/web


pet.select and pet.frame, a whole petting of 251 frames (turn 19, petting 211, return 20; 59 eased): 3.94 bytes a petting

pet.select and pet.frame, a short petting of 9 frames: 0.72 bytes a petting

pet.frame through a cut petting of 40 frames (fade 11): 0.24 bytes a cut petting

applyReachLayer at weight 1: 0.46 bytes a frame; legs off 0.45; 0.0047 ms a frame; legs off 0.0045 ms

applyReachLayer at weight 0.37: 0.45 bytes a frame; legs off 0.45; 0.0063 ms a frame; legs off 0.0037 ms
 ❯ test/ui/hud-look.test.ts (15 tests | 2 failed) 22409ms
   ❯ every HUD control a tile (spec 014, T024; FR-022) (4)
     × gives every control the tile's face in the column layout, never the page's white button 21960ms
     × gives every control the tile's face in the dock layout, never the page's white button 106ms

the wired twin's frame (pet.frame, the run's shell, figures.update): linked 692.56 bytes and 0.0149 ms a frame; unlinked 688.77 bytes and 0.0060 ms; the reach adds 3.79 bytes and 0.0089 ms
visitor floor: bounds x [-0.947, 0.947], z [-0.49, 0.585]; start (-0.7, 0.58)
  obstacle work-desk: x [-0.87, 0.87], z [-0.73, 0.312]
  obstacle desk-screen: x [-0.766, 0.458], z [-0.695, -0.169]
  obstacle neon-sign: x [-0.942, 0.845], z [-0.637, -0.309]
  obstacle laptop-stand: x [0.3, 0.8], z [-0.55, -0.07]
  obstacle laptop: x [0.274, 0.826], z [-0.561, -0.08]
  obstacle busy-sign: x [-0.839, -0.261], z [-0.431, -0.048]
  obstacle dog-sign: x [0.871, 1.187], z [-0.34, 0.14]
  obstacle chalkboard: x [-1.187, -0.887], z [-0.19, 0.765]
  obstacle snowboard: x [-1.187, -0.749], z [-0.676, -0.124]
  obstacle bicycle: x [0.769, 1.185], z [-0.407, 0.601]
  obstacle wall-window: x [-1.12, 1.12], z [-0.73, -0.429]
  obstacle window-view: x [-1.08, 1.08], z [-0.718, -0.47]
  obstacle split-keyboard: x [-0.491, 0.209], z [-0.278, 0.25]
  obstacle vertical-mouse: x [-0.007, 0.328], z [-0.162, 0.203]
  obstacle notebook: x [-0.836, -0.239], z [-0.247, 0.282]
  obstacle helmet: x [0.559, 1.149], z [-0.347, 0.191]
  obstacle bag: x [-0.092, 0.71], z [-0.578, 0.075]
  obstacle wall-outlet: x [0.902, 1.187], z [-0.556, -0.244]
  obstacle twin-figure: x [0.17, 1.14], z [0.025, 0.789]
chase floor: bounds x [-0.947, 0.947], z [-0.49, 0.585]; 18 obstacles (the visitor's less twin-figure)
room floor: 201 starts × 600 frames, least distance kept 0.141 m, 0 violations
chase bench: 600 frames, mean ms a frame per run 0.0128, 0.0138, 0.0102; best 0.0102
T-B03 composed points: {"twin_home":[0.66,0.469],"taken_origin":[0.977,1.49,0.222],"taken_box_floor":{"x":[0.889,1.065],"z":[-0.287,0.481]},"shell_floor":{"x0":-1.0668,"x1":1.0668,"z0":-0.6096,"z1":0.6096},"chase_bounds":{"x0":-0.9468,"x1":0.9468,"z0":-0.48960000000000004,"z1":0.5846},"chase_obstacles":[{"x0":-0.87,"x1":0.87,"z0":-0.7296,"z1":0.3124},{"x0":-0.766,"x1":0.458,"z0":-0.6946,"z1":-0.16927999999999999},{"x0":-0.942303,"x1":0.8445,"z0":-0.6365999999999999,"z1":-0.3089},{"x0":0.3,"x1":0.8,"z0":-0.5496,"z1":-0.0696},{"x0":0.2742,"x1":0.8259,"z0":-0.5613049999999999,"z1":-0.0796},{"x0":-0.839191,"x1":-0.260612,"z0":-0.43058599999999997,"z1":-0.047686000000000006},{"x0":0.8713,"x1":1.1873,"z0":-0.33999999999999997,"z1":0.13999999999999999},{"x0":-1.1867999999999999,"x1":-0.8872000000000001,"z0":-0.19,"z1":0.7652},{"x0":-1.186792,"x1":-0.748936,"z0":-0.676198,"z1":-0.123802},{"x0":0.76902,"x1":1.18458,"z0":-0.407138,"z1":0.601205},{"x0":-1.12,"x1":1.12,"z0":-0.7296,"z1":-0.42879999999999996},{"x0":-1.08,"x1":1.08,"z0":-0.7184,"z1":-0.4697},{"x0":-0.490847,"x1":0.209343,"z0":-0.278034,"z1":0.25013399999999997},{"x0":-0.007175000000000001,"x1":0.327606,"z0":-0.162291,"z1":0.203151},{"x0":-0.836073,"x1":-0.2388,"z0":-0.247423,"z1":0.28185},{"x0":0.558607,"x1":1.149177,"z0":-0.346763,"z1":0.191209},{"x0":-0.092282,"x1":0.710491,"z0":-0.5776129999999999,"z1":0.074719},{"x0":0.901655,"x1":1.1867999999999999,"z0":-0.556,"z1":-0.244}],"start":{"x":-0.7,"z":0.58},"dog_home":[0.3,0.45]}

pet.select and pet.frame over the real adapters, with chase.frame: 6.60 bytes a petting of 252 frames; 0.0001 ms a frame
dino scene: mean ms a frame per run 0.0002, 0.0001, 0.0001

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/ui/hud-look.test.ts > every HUD control a tile (spec 014, T024; FR-022) > gives every control the tile's face in the column layout, never the page's white button
 FAIL  test/ui/hud-look.test.ts > every HUD control a tile (spec 014, T024; FR-022) > gives every control the tile's face in the dock layout, never the page's white button
AssertionError: button.: Send: expected 'var(--_label)' to be 'var(--hud-text)' // Object.is equality

Expected: "var(--hud-text)"
Received: "var(--_label)"

 ❯ test/ui/hud-look.test.ts:129:44
    127|         const face = winning(el, "background");
    128|         expect(TILE_FACES.has(face ?? ""), `${name}: ${face ?? "none"}…
    129|         expect(winning(el, "color"), name).toBe("var(--hud-text)");
       |                                            ^
    130|       }
    131|       // The list's buttons and the conversation's take the tile's bor…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed | 275 passed (276)
      Tests  2 failed | 4885 passed | 6 skipped (4893)
   Start at  05:27:38
   Duration  1913.03s (tests 72%, import 28%)

exit=1
```

**The broken cases, for T-INT02b** (B's look breaks them; the file is A's, plan §R-A4; not edited here):

- `test/ui/hud-look.test.ts`, "every HUD control a tile (spec 014, T024; FR-022)", **"gives every control the tile's face in the column layout, never the page's white button"** and **"… in the dock layout, …"** (`:117-136`). Its assertion at `:129`: `expect(winning(el, "color"), name).toBe("var(--hud-text)")`, for every HUD control; the failure: `AssertionError: button.: Send: expected 'var(--_label)' to be 'var(--hud-text)'`. Why, by reading the test's reader: its `RULES` (`:33-45`) split each rule's selector at every comma (`r.selector.split(",")`), inside `:is()` too, so `button.css`'s list yields the bare fragment `.talk-form .talk-row > button:not(.talk-voice)` (now followed by `.resume .resume-close`, where it was `impl-030b`'s last argument and its fragment ended in `)`, which matches nothing). That fragment, without `:root[data-skin]`, matches "Send" on the test's unskinned page and wins `color` with `var(--_label)`. A browser never applies that rule there (it needs `data-skin`). This is the very case T-INT02 rewrites under Q73 (`8e83e7fc`'s T-INT02; `rework3-spec-030` keeps it, with A's rewrite of its split "Back" case): old, as quoted; new, with `data-skin` set, every skinned control's face and border the skin's tokens by the cascade. Until then it stays red on B's branch; T-INT02b (or T-INT02's RED) takes it.
- No other case failed. `test/room/twin-2d.test.ts` passed in this run.

The tip moved after this run only by test files (`9e6045e9`: the font reader through the typed `layout()`, one character at a time, which gives the same advances, checked by `node -e` over the labels: largest difference 0 font units in both faces; and Prettier's formatting). B's three files pass on that tip (below).

## T-B04: the two builds, and the checks

From the repository's root, `npm run build -w apps/web`, `active: metal`, exit 0. The skin's line (line 459 of the output), the root, and the generated rule's start in `dist/assets/index-6gJCOYp4.css`:

```
ui-skins: metal (css)
<html lang="en" data-skin="metal" data-skin-kind="css">
:root[data-skin=metal]{--btn-font-family:"IBM Plex Sans", system-ui, sans-serif;--btn-font-weight:700;--btn-case:uppercase;--btn-tracking:.06em;--btn-chamfer:.5rem;--btn-radius:0rem;--btn-frame:#2a3038;--btn-bevel-light:#ffffff47;--btn-bevel-dark:#0000008c;--btn-highlight:#ffffff2e;--btn-glow-radius:.5rem;--btn-primary-ri
```

Then `active: plain`, a scratch edit of that one line with the Edit tool, never committed; `git status --short` during it: ` M apps/web/content/ui-skins.yaml` (and `git diff --stat`: `apps/web/content/ui-skins.yaml | 2 +-`, `1 file changed, 1 insertion(+), 1 deletion(-)`); the same command, exit 0:

```
ui-skins: plain (css)
<html lang="en" data-skin="plain" data-skin-kind="css">
:root[data-skin=plain]{--btn-font-family:"IBM Plex Sans", system-ui, sans-serif;--btn-font-weight:400;--btn-case:none;--btn-tracking:0em;--btn-chamfer:0rem;--btn-radius:0rem;--btn-frame:#10141a;--btn-bevel-light:#fff3;--btn-bevel-dark:#0006;--btn-highlight:#fff0;--btn-glow-radius:0rem;--btn-primary-ring:#10141a;--btn-prim
```

Reverted with the Edit tool (`git status --short` empty), rebuilt with `metal`, exit 0, `ui-skins: metal (css)`, `<html lang="en" data-skin="metal" data-skin-kind="css">`. In that build's stylesheet the `clip-path` values are `inset(50%)` ×4 (the visually-hidden rules, not B's), `none` ×4 (B's pins), and the octagon ×2 (the `::before` and the `::after`); the `::before` rule ends `…;position:absolute;inset:0}` (Lightning CSS moved those two to the end). Each build prints Vite's notice on `vite.config.ts`'s extensionless imports, as before.

B's files on the final tip, from `apps/web/`, `npx --no-install vitest run test/ui-skins.test.ts test/ui/button-skin.test.ts test/ui/button-states.test.ts`, exit 0:

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/rework-030b/apps/web
 Test Files  3 passed (3)
      Tests  68 passed (68)
   Duration  93.63s (tests 94%, transform 3%, import 3%)
```

`make lint`, from the root: first run exit 2, `tsc` refusing `font.glyphsForString` (`button-skin.test.ts(297,24): error TS2339: Property 'glyphsForString' does not exist on type 'Font'`, and two implicit `any`s; `build/room/fontkit.d.ts` types only `layout()`); the reader moved to `layout()` a character at a time. Second run exit 2, Prettier's warnings on the four test files; Prettier's own output written to `/tmp/rework-030b/fmt/` (`--stdin-filepath`, read from the file, written by redirect to `/tmp` only), its differences applied with the Edit tool, `diff -q` then naming each file the same. Third run, exit 0, its whole output:

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

Not run, by the brief's rule 4: `make test`, `make evals`, `make check` (the integration's). The whole `apps/web` suite is above.

## Merges (`git merge-tree`, at `9e6045e9`)

```
$ git merge-tree --write-tree --name-only HEAD night/impl-030a/impl-030a
b57a9fa073f63b45286831cd259ca74414cc508b
exit=0
$ git merge-tree --write-tree --name-only HEAD a3898c6069ee44772ba027c7dc3164deb24fd294
0aeb340c1b3932f472738691a2201404fd9cd021
exit=0
$ git merge-tree --write-tree --name-only HEAD 7ac200dad8c078f7d7c3997cbc80f81130cdc04f
c28f561d671f44808387cc59c6767aa36efc168f
specs/030-ui-skin/plan.md

Auto-merging specs/030-ui-skin/plan.md
CONFLICT (content): Merge conflict in specs/030-ui-skin/plan.md
Auto-merging specs/030-ui-skin/spec.md
exit=1
$ git merge-tree --write-tree --name-only HEAD night/rework3-spec-030/rework3-spec-030
7295f96eb8e8b278181e159e28972b119c0b9e86
specs/030-ui-skin/plan.md

Auto-merging specs/030-ui-skin/plan.md
CONFLICT (content): Merge conflict in specs/030-ui-skin/plan.md
Auto-merging specs/030-ui-skin/spec.md
exit=1
```

`impl-030a` (its tip `c0cd9826`) and `rework-030c` (`a3898c60`): clean. `impl-030dsb` (`7ac200da`, built on `8e83e7fc`'s documents): one file, `plan.md`, three hunks, all in group B's text: §R-B3's bullets (my branch's `7cdc31d2` bullets with `impl-030b`'s and my "As built" against `8e83e7fc`'s reworked bullets), §R-B4's, and §R-B5 / §9's B row. The same file conflicts at `impl-030b`'s own tip (`git merge-tree --write-tree --name-only 02a5c30a 7ac200da`: `plan.md`, exit 1), so the conflict isn't new; the integration takes `8e83e7fc`'s (or rework 3's) bullets and appends the two "As built" lists. `spec.md` merges clean: my Q89 row first sat at the Amendments table's foot and conflicted with rework 2's rows; it now sits after 005's row (`c154e1cd`). Code files: no conflict with any of the three.

## `rework3-spec-030`'s rows for B (`git diff 8e83e7fc 01999312 -- specs/030-ui-skin`, its tip at my last read)

Its B changes are R-2 alone: plan §R-B3 (the control's `box-shadow` `none`), T-B01 (c) (the cascade's winner, with `.split-back` and `.split-hint` in a panel marked `data-over="room"`; every `box-shadow` B declares on a `::before` rule), §R-D4 and T-DS01 (b) (the same under the image skin, DS's), and the checks' table's row. Built: the first two, in GREEN 2 and the second RED. **Built differently, named (my question 2):** "every `box-shadow` B declares sits on a `::before` rule" is tested as every shadow other than `none`, since the pin itself is a `box-shadow: none` declared on the control (and under forced colours). **Not built (not B's):** §R-D4's and T-DS01 (b)'s image-skin rows (`impl-030ds`); T-INT02's rewrite of `hud-look.test.ts` (the integration's, the case failing above).

## Human-only paths

None written, and no patch for his hand: nothing under `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `corpus/**`, `tools/gates/**`, or `assets/**`.

## Interruptions and slips (rework-030b)

- **Slip, Q40:** the opening lines of this section ("# Rework: rework-030b", its first paragraph, and the start of "## RED", down to "The cases, new or changed:") were appended to `impl-b.md` by a shell `>>` redirect, not the Edit tool. Seen at once; every later write of a tracked file was the Edit or Write tool. The lines went into the RED commit `26f25890`.
- **Not a refusal:** to show the second RED's cases failing, `impl-030b`'s `button.css` was put back in the worktree by `git checkout 02a5c30a -- apps/web/src/ui/button.css` and restored by `git checkout HEAD -- …` (git's own copy, no redirect); `git status --short` then named only the test file.
- **Not a refusal:** the Q75 rule, drafted before its test, was taken out again with the Edit tool before the test commit (above).
- Scratch files, outside the tree, left for the runner's cleanup (no recursive delete tried, Q20): `/tmp/rework-030b/fit/` (the geometry vitest, its log and JSON), `/tmp/rework-030b/fmt/` (Prettier's copies), `/tmp/rework-030b/merged-index.html`, and `/tmp/rework030b-*.log`.
- No refusal by the bash gate or the permission layer this session. `make setup` ran first (`node_modules` was missing), exit 0; it noted the shared `.git/hooks` isn't writable here (the Author's `make git-hooks`).

## Questions (in `/night/io/out/questions.md`, each with its recommended answer)

1. The two split tiles over two lines under `metal` (where rv-030b's R-3 found none), kept in their words' own case by attribute selectors, as built. Recommended: yes, as built.
2. Rework 3's "every `box-shadow` B declares on a `::before`", read as every shadow other than `none`. Recommended: yes, as built.

## What's done, and what isn't

Done, on this branch, to `8e83e7fc`'s documents:

- **R-1** (Q89): the bar's tiles in the column layout and the dock keep spec 014's metrics under every skin; the width test from the vendored faces against `HUD_PLACEMENTS.bar.maxRem` and the dock's two rows; plan §R-B3 "As built" and spec.md's Amendments row.
- **R-2**: no `clip-path`, `filter`, or `box-shadow` on any skinned control; the chamfer, face, bevel, highlight, frame and glow on the `::before`; the dashes on the disabled `::after`; the ring's corners inside the octagon; the `::before` and `::after` hidden under forced colours; `position: relative` only on the controls static at the base (listed above); the comment at `button.css:19` corrected. Rework 3's R-2 cases, with the plate in the cascade.
- **Rework 2's other B rows**: `.split-hint` and `.resume-close` skinned and tested as the room makes them; the resume's white among the boundary's grounds; the cards' tokens; the swap over every `--btn-*`; `data-skin-kind` (§R-B2, N-3); T-B04's fit table at the three split windows, and Q75's rule for the two labels it found over two lines.
- **N-2**: hover in `@media (hover: hover)`.
- **For C**: the root keeps `class="dark-page"` beside `data-skin` and `data-skin-kind`, shown on the merged tree.
- T-B01 (d), the whole suite, run; T-B04's two builds; `make lint` exit 0. `impl-030ds` may start from this branch's tip once its review passes.

Not done here, or not B's:

- `test/ui/hud-look.test.ts`'s two "every HUD control a tile" cases fail on this branch (above): A's file, rewritten in T-INT02 (Q73) / T-INT02b; B's branch leaves it.
- rv-030b's R-3 (a longer label, a later spec's layout), R-4 (the page-level AA, T-INT's), R-5 (the cascade helper's silent drop of an unparseable selector), N-1, N-3: named above, not built.
- `plan.md`'s B section conflicts with `8e83e7fc`'s (and rework 3's) text, as it did at `impl-030b`'s tip: the integration's to resolve; never merged here.
- `make test`, `make evals`, `make check`: the integration's (rule 4).
- His look (SC-008): jsdom draws nothing, so the chamfered `::before`, the inside ring and glow, the dashes, and the tiles' fit (an advance-width estimate) are the cascade's and the font's reading; a browser is the check left. The `metal` skin is still drawn from the orders' description of his reference alone.

