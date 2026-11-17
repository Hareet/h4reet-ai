# Notes: impl-030b (group B, the buttons; T-B01 to T-B04), night of 2026-11-17

Branch `night/impl-030b/impl-030b` from `7cdc31d2` (`spec-030`'s tip). Implementer: `impl-030b`. Plan: [plan.md](plan.md) §R-B1 to §R-B5, §9; tasks: [tasks.md](tasks.md) T-B01 to T-B04.

## Files confirmed before the change (at `7cdc31d2`)

- `apps/web/vite.config.ts`: the plugins list (`:47-75`); no skin plugin yet.
- `apps/web/src/main.ts`: `import "./style.css"` (`:5`), `import "./fonts.css"` (`:6`); `room.css` arrives later through `./room/app` (`:12`), so two imports placed after `fonts.css` come before it, as plan §R-B2 asks.
- The controls of Q5 and their classes: `.hud-tile` (`src/room/layout.ts:152`, the bar's six at `:191-228`), `.room-walk` (`:237`), `.room-eat` (`:252`), `.split-back` (`src/room/hud/split.ts:276`), `.talk-larger` and `.talk-log-toggle` (`src/talk/talk.ts:176-177`), "Send" (`src/talk/talk.ts:201`, a `button[type="submit"]` that turns `type="button"` while it reads "Stop", `:291`), `.choice-enter` (`src/choice/choice.ts:88`).
- The rules B's component outranks: `room.css:53-76` (every room button), `:331-370` (the walking control and "Eat"), `:683-723` (the tiles, their `white-space: nowrap`, `:active`'s `transform`, the disabled tile's `opacity`), `:761-772`, `:787-848`, `:884-895`, `:1149-1157`, `:1178-1182`; `hud/split.css:216-223`, `:249-258`, `:304-306`, `:449-467`, and spec 029's block (`:542-583`); `choice.css:232-240`.
