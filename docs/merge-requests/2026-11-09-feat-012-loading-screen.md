# feat/012-loading-screen

Spec: specs/012-loading-screen/ · Intent: specs/012-loading-screen/intent.md · Written by: implementer (an agent session) · Date: 2026-11-09
Session: /home/h4reet/h4reet-ai/h4reet-ai, working in the worktree /tmp/claude-1000/wt-feat012 · Repo hooks active: the session's hooks; the worktree's commits ran the repository's git hooks (gitleaks and the arrival check print on each commit)
Authorized by: the spec and the plan, approved by the Author on 2026-11-09 as taken (tasks.md T000, recorded in his words)

## Status

**Draft, a save point.** The branch is stacked on `feat/005-full-window-room`: it was cut at `spec/012-loading-screen-r2`'s tip, b0bd247e, which sits on `feat/005-full-window-room` at af82c6c5, the reviewed full-window room. So `feat/005-full-window-room` merges first, and this branch after it. The Author's steps come at the end of the work.

## T001: the base, the outside facts, and the numbers

**The base.** `git rev-parse HEAD` at T001 read b906c5e70709e9e10e88e9109cf0afd945c80c7a, T000's commit on b0bd247e (the spec's two commits, 0e86a99b and b0bd247e) on `feat/005-full-window-room` at af82c6c5. `refs/heads/main` was f76ead549a76649e7c3c49eeb56a71c98f4e9a8e (`Merge fix/007-steady-clock-test (40624d2df922) by hand`). The main session cut the branch; it travels with the spec's documents at its base, so one gate covers both. `npm ci --cache "$TMPDIR/npm-cache-feat012"` ran under Node 24.21.0, the toolchain's pin (a first run under the shell's Node 22.18.0 was redone under the pin).

**Spec 005's rules that plan R-10 lists**, re-read at the base, which is af82c6c5 itself: nothing moved. `notesReserve` and `--notes-h` (`compose/hud.ts`, `layout.ts`'s `applyHud`, `room.css`'s sheets); the measured strip (`metrics.strip`; the strip's `min-height: var(--strip-h)`), which `--clear-y` follows; the HUD's yellow ring on `input` (`html[data-hud=…] .hud-glass input:focus-visible`); the `:root[data-blur]` and `:root[data-hud]` fallbacks; Tab not reaching undrawn controls; the stacked grid (`.room-block` and `.hud-panels` as `display: contents`; the portrait template `"toolbar" "stage" "list" "talk" "around" "resume"` and the landscape one under `(orientation: landscape) and (min-width: 32rem)`); and the refit log's buffer entry. No departure from PD-10.

**`fix/007-image-readiness`** (b0fa1d73 at T001): not in the base, and not in `refs/heads/main`. Its test is `apps/web/test/room/image-inputs.test.ts`; the list it holds the `Dockerfile` to is that file's own constant, `INPUTS`, built from `build/room/readiness.ts`'s exported names (`READINESS_PATH`, `PACK_FILE`, `PROMPT_FILE`, `LINES_FILE`, `BUDGETS_FILE`). `BUDGETS_FILE` is already among them, so T041 adds `ROUTING_FILE` and `PRICES_FILE`. T041 waits for that branch to reach `refs/heads/main` (plan PD-21, R-4).

**The next free ADR number**, read across every `refs/heads/*`: 0045. 0044 is `docs/001-ec2-default`'s (`docs/adr/0044-ec2-as-prods-default-host.md`); no branch holds 0045 or 0046. As D10 expects; no departure from PD-17.

**The numbers at the base** (b906c5e7's code, which is af82c6c5's):
- **The entry chunk**: the release build's entry, `assets/index-CZStXwyk.js`, 37,377 bytes gzipped, and its one stylesheet 4,346 bytes: 41,723 bytes of the 153,600-byte budget, measured as `test/room/chunk.test.ts` measures it (the entry's static graph and the page's stylesheets, gzipped), with a scratch script outside the repository over a release build under an empty policy directory.
- **The index**: 5,196 bytes, serialized and gzipped at level 9 as `test/room/chunk.test.ts` measures it, of its 16,384 (R-11).
- **`npm run room:check`**: "room: 0 findings in 0 files", 2.8 s wall.

The browsers' and the screen readers' facts (plan §6.1, PD-4) are the Author's, in T039's checklist.
