# impl-029a: group A, the side panels see-through (T-A01 to T-A03)

Branch `night/impl-029a/impl-029a`, from spec-029's tip `c743e2da`. Plan §R-A1 to §R-A4; spec FR-001 to FR-008, SC-001, SC-002.

## Log

- Started: reading plan §5, spec group A, and the code (`layout.ts`, `compose/frame.ts`, `compose/hud.ts`, `room.css`, `hud/split.css`).
- Setup: the worktree had no `node_modules`. My first `npx vitest run …` from `apps/web/` found no local vitest, so npx **fetched `vitest@5.1.0` from the registry** and ran it. It stopped at the config ("Cannot find package 'vitest'"), and none of the repository's tests ran under it. I then ran `make setup` (`npm ci --ignore-scripts`; 431 packages; "git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks"). Every run below uses the lockfile's vitest. That fetch is on the page as a refusal-class note: worth a guard (npx `--no-install`), his call.

## T-A01 (RED)

Files: `apps/web/test/ui/hud-over-room.test.ts`, `apps/web/test/ui/hud-over-contrast.test.ts`.

```
$ npx vitest run --maxWorkers=2 test/ui/hud-over-room.test.ts test/ui/hud-over-contrast.test.ts   # from apps/web/
 FAIL  test/ui/hud-over-room.test.ts [ test/ui/hud-over-room.test.ts ]
Error: Cannot find module '../../src/room/compose/over' imported from …/apps/web/test/ui/hud-over-room.test.ts
 × reads its alphas from room.css's :root, the glass's below the plate's   (expected NaN to be greater than 0)
 × takes the lowest 5% step for the glass at which the tiles' faces hold (FR-006)
 × takes the lowest 5% step for the plate at which every pair holds over that glass (FR-003)
 × drops a marked part's glass to --over-glass-alpha, the split layout's too
 × puts every run of words on a plate of the glass at --over-plate-alpha   (.talk-entry: expected false to be true)
 × draws the focus ring inside its control over the room, never on the bare glass
 × makes both alphas 1 under prefers-reduced-transparency:\s*reduce
 × makes both alphas 1 under prefers-contrast:\s*more
 × makes both alphas 1 under forced-colors:\s*active
 Test Files  2 failed (2)
      Tests  9 failed | 2 passed (11)
```

The two passing cases are vacuous until the alphas exist: "every text and mark at the stylesheet's alphas" (a NaN ratio fails no floor, and the first case catches the NaN) and "no over-alpha outside a marked rule". `make lint` isn't run at RED: tsc can't resolve `compose/over` until T-A02.
