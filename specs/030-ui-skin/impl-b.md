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
