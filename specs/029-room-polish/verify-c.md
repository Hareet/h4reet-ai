# verify-029c — group C's verify (spec 029)

- Night: 2026-11-16 (run 15:48–16:20 UTC)
- Task: `verify-029c` (implementer; wrote none of group C)
- Branch: `night/verify-029c/verify-029c`
- Item's first tip (base): `refs/heads/night/bind-029c/bind-029c` = `5cf85bdb5aee295a84df970f13d5c20b13fe2a91`
- Item's second tip: `refs/heads/night/back-029c/back-029c` = `27151091bf78f4758ce18772ff4758b40cbb9073`
- Their merge base: `f2686864724930e454652405f1679aff77c39d79` (impl-029c's tip)
- The line's tip (the stack's base, no merge task yet): `f411d8e1b3427f1b78f4bae55343a75922dbb027`
- The merge: `640b803cba352df10020e6285660f58e0c5e95e7` (parents `e62bdcae`, an empty save point on `5cf85bdb`, and `27151091`)

**Result: green.** On the merge, the whole `apps/web` suite passed: 266 files, 4662 tests passed, 6 skipped, 0 failed, exit 0. `make lint` exited 0. `test/room/twin-2d.test.ts` passed in the full run, so it had no rerun. Nothing was fixed, and no source, test, spec, or tasks file was edited. `plan.md` changed only by the merge's resolution.

## 1. The line's tip is an ancestor

```
$ git rev-parse HEAD refs/heads/night/bind-029c/bind-029c refs/heads/night/back-029c/back-029c && git merge-base --is-ancestor f411d8e1b3427f1b78f4bae55343a75922dbb027 refs/heads/night/bind-029c/bind-029c; echo "exit=$?"; git merge-base --is-ancestor f411d8e1b3427f1b78f4bae55343a75922dbb027 refs/heads/night/back-029c/back-029c; echo "exit=$?"; cat /sys/fs/cgroup/cpu.max; date -u
5cf85bdb5aee295a84df970f13d5c20b13fe2a91
5cf85bdb5aee295a84df970f13d5c20b13fe2a91
27151091bf78f4758ce18772ff4758b40cbb9073
exit=0
exit=0
400000 100000
Mon Nov 16 15:48:30 UTC 2026
```

`f411d8e1` is an ancestor of the base (exit 0) and of back-029c's tip (exit 0).

## 2. The merge

Preview:

```
$ git merge-tree --write-tree --name-only HEAD refs/heads/night/back-029c/back-029c; echo "exit=$?"
910d94dd5e71f20cdc2ca625781cac133de93b54
specs/029-room-polish/plan.md

Auto-merging specs/029-room-polish/plan.md
CONFLICT (content): Merge conflict in specs/029-room-polish/plan.md
Auto-merging specs/029-room-polish/tasks.md
exit=1
```

The merge, after the save point `e62bdcae`:

```
$ git merge --no-ff refs/heads/night/back-029c/back-029c; echo "exit=$?"; git status --short
Auto-merging specs/029-room-polish/plan.md
CONFLICT (content): Merge conflict in specs/029-room-polish/plan.md
Auto-merging specs/029-room-polish/tasks.md
Automatic merge failed; fix conflicts and then commit the result.
exit=1
M  apps/web/src/room/scene/bundle3d.ts
A  apps/web/test/room/paper-back.test.ts
M  apps/web/test/room/paper-sheet.test.ts
A  specs/029-room-polish/back-c.md
UU specs/029-room-polish/plan.md
M  specs/029-room-polish/tasks.md
```

There was one conflict, the expected one. No source or test file was in conflict.

**The resolution** was made with the Edit tool. back-029c's bullet now ends §R-C7, after D-C7 and before bind-029c's "### R-C8" heading and its section. The blank line between the bullet and the heading is back-029c's own blank line after its bullet. To check it, I compared the resolved file with each side:

```
$ grep -c -E '^(<<<<<<<|=======|>>>>>>>)' specs/029-room-polish/plan.md; echo "-- vs HEAD (bind):"; git diff --no-index --stat <(git show HEAD:specs/029-room-polish/plan.md) specs/029-room-polish/plan.md; git diff HEAD -- specs/029-room-polish/plan.md | grep -E '^[+-]' | cut -c1-90; echo "-- vs MERGE_HEAD (back):"; git diff MERGE_HEAD -- specs/029-room-polish/plan.md | grep -E '^[+-]' | cut -c1-90
0
-- vs HEAD (bind):
 /dev/fd/63 => specs/029-room-polish/plan.md | 2 ++
 1 file changed, 2 insertions(+)
--- a/specs/029-room-polish/plan.md
+++ b/specs/029-room-polish/plan.md
+- **back-029c, the sheet's back (§R-C4; FR-020; the page's Q38, its recommended answer t
+
-- vs MERGE_HEAD (back):
--- a/specs/029-room-polish/plan.md
+++ b/specs/029-room-polish/plan.md
+**As bound (`bind-029c`; the page's Q26, provisional; D-C8):** each face carries its plac
+
+### R-C8. Departures in implementation (`bind-029c`)
+
+Recorded in the commit that binds the faces. D-C1 stands as `impl-029c`'s record; D-C8 is
+
+- **D-C8, the bindings, on Q26's recommended answer (§R-C2, FR-022, spec 004's FR-052; s
+- **D-C9, the words' rows (§R-C1, §R-C3).** The monitor's block has two lines, "Applied
+
```

Against bind-029c, the result adds only back-029c's bullet and its blank line. Against back-029c, it adds only bind-029c's lines: the "As bound" paragraph (merged cleanly, outside the conflict) and §R-C8. No line was removed or changed. tasks.md T-C07's citation ("plan §R-C7's back-029c bullet") holds.

`git diff --cc` before the commit, as run (lines cut at 140 characters by the command; the full text is in `plan.md`):

```
$ git diff --cc specs/029-room-polish/plan.md | cut -c1-140
diff --cc specs/029-room-polish/plan.md
index 97f5619d,9381a007..00000000
--- a/specs/029-room-polish/plan.md
+++ b/specs/029-room-polish/plan.md
@@@ -149,13 -147,8 +149,15 @@@ These are recorded in the same commits 
  
  - **D-C7, a test of an earlier spec rewritten (§R-C4).** `paper.word` joins the closed list of UI keys (`src/room/ui-keys.ts`), which `te
  
+ - **back-029c, the sheet's back (§R-C4; FR-020; the page's Q38, its recommended answer taken provisionally under rule 1; rv-impl-029c's C
+ 
 +### R-C8. Departures in implementation (`bind-029c`)
 +
 +Recorded in the commit that binds the faces. D-C1 stands as `impl-029c`'s record; D-C8 is what followed the answer.
 +
 +- **D-C8, the bindings, on Q26's recommended answer (§R-C2, FR-022, spec 004's FR-052; spec.md's Assumptions).** The page's Q26 is taken 
 +- **D-C9, the words' rows (§R-C1, §R-C3).** The monitor's block has two lines, "Applied" and "AI Engineer", each `about_author: true` wi
 +
  **Backlog** (not this spec's, `rework-cd.md` S-6): RT13 can't tell his words from a reading beside them; any quoted run in the intent pass
  
  ## 8. Group D design
```

`git show --stat HEAD` after the commit:

```
commit 640b803cba352df10020e6285660f58e0c5e95e7
Merge: e62bdcae 27151091
Author: night-implementer <night-implementer@night-shift.h4reet-ai>
Date:   Mon Nov 16 15:49:21 2026 +0000

    merge(verify-029c): back-029c's tip 27151091 into bind-029c's 5cf85bdb
    
    One conflict, specs/029-room-polish/plan.md at §R-C7's end: both sides
    kept, back-029c's bullet ending §R-C7 before bind-029c's "### R-C8",
    so tasks.md T-C07's citation ("plan §R-C7's back-029c bullet") holds.
    No other line changed.
    
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

 apps/web/src/room/scene/bundle3d.ts    |  47 ++++-
 apps/web/test/room/paper-back.test.ts  | 302 +++++++++++++++++++++++++++++++++
 apps/web/test/room/paper-sheet.test.ts |  30 +++-
 specs/029-room-polish/back-c.md        | 149 ++++++++++++++++
 specs/029-room-polish/plan.md          |   2 +
 specs/029-room-polish/tasks.md         |   1 +
 6 files changed, 515 insertions(+), 16 deletions(-)
```

## 3. Setup

```
$ make setup 2>&1 | tail -30; echo "exit=${PIPESTATUS[0]}"
npm ci --ignore-scripts

added 431 packages, and audited 435 packages in 30s

84 packages are looking for funding
  run `npm fund` for details

14 vulnerabilities (1 low, 12 moderate, 1 high)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm notice
npm notice New major version of npm available! 11.19.0 -> 12.2.2
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.2
npm notice To update run: npm install -g npm@12.2.2
npm notice
git hooks: /home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks
exit=0
```

## 4. The `apps/web` suite on the merge

Workers: `/sys/fs/cgroup/cpu.max` reads `400000 100000`. The quota divided by the period is 400000 ÷ 100000 = 4 (whole, so rounding down changes nothing; at least 1). That gives `--maxWorkers=4`.

The suite ran once, in the background with a two-hour timeout. I waited for its own completion notice ("completed (exit code 0)"):

```
$ cd apps/web && npx --no-install vitest run --maxWorkers=4 > /tmp/verify-029c-vitest.log 2>&1; echo "exit=$?" >> /tmp/verify-029c-vitest.log
```

The runner's own lines: its header, then its totals and exit code (the log's last lines, verbatim):

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-16/verify-029c/apps/web
```

```
 Test Files  266 passed (266)
      Tests  4662 passed | 6 skipped (4668)
   Start at  15:50:00
   Duration  1723.01s (tests 70%, import 30%)

exit=0
```

There were no failures, so no failure lines to paste. The log's other 43 lines are the tests' own console prints: pet/reach byte and millisecond figures, the visitor's and chase floors' obstacle boxes, "room floor: 201 starts × 600 frames, least distance kept 0.141 m, 0 violations", the chase and dino benches, and T-B03's composed points. None of them is a failure.

`test/room/twin-2d.test.ts` passed in this run, so it needed no rerun alone. The run took 28 min 43 s at 4 workers, against verify-029b's ~22 min. No Python file changed, so `pytest` was not run.

## 5. `make lint` on the merge

```
$ make lint > /tmp/verify-029c-lint.log 2>&1; echo "exit=$?"; wc -l /tmp/verify-029c-lint.log; tail -40 /tmp/verify-029c-lint.log
exit=0
11 /tmp/verify-029c-lint.log
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
882 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
```

## 6. Not run, and not mine

- **The full `make check`** belongs to the integration task, not this one.
- **The image stage** fails in the workers' containers (night 3's Q46 and Q48). It is left to the Author's gate.
- **`services/gateway`'s suite** was not run (Q30, Q34). Group C didn't touch it.
- **`pytest`** was not run, since no Python file changed.
- **`make evals`** was not run. It is part of `make check`, the integration's job, and this task's instructions name only the touched suites and `make lint`.
- **rv-back-029c's R-1** (`spec.md:169`) belongs to `respec-029c`. Its **R-6** (`impl-c.md:139` and `:230`, stale) and the other nits go to the item's note. `spec.md` and `impl-c.md` were not edited.
- **Refusals:** none. No hook, bash gate, or permission prompt refused a command in this task.
- **Save points:** `e62bdcae`, `78b3d52a`, and `8d1d8e06` are empty `wip(verify-029c)` commits. Each step had nothing to save before it ran.
