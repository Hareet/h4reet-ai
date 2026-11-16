# merge-029-3: pulse-029a into the stack, after the one `make check`

- Date: 2026-11-16 (night 4)
- Task: `merge-029-3` (implementer; I wrote none of pulse-029a or the integration)
- Branch: `night/merge-029-3/merge-029-3`
- Base (int-029's tip, the line `c315c5d5` with the integration and its note): `refs/heads/night/int-029/int-029` = `f718ac2e9d3b68db611cd7da4b25e0fcebd0c0a7`
- pulse-029a's reviewed tip (Q59; rv-pulse-029a not blocking): `refs/heads/night/pulse-029a/pulse-029a` = `a939c2bce39d342699e10e07d2611127dbec3ed5`
- Merge commit: `b49ec2f7c77238eda10323e3b9b3534164360b36` (parents `f718ac2e9d3b68db611cd7da4b25e0fcebd0c0a7`, `a939c2bce39d342699e10e07d2611127dbec3ed5`)
- Result: _the whole `apps/web` suite is running; this line is filled when it ends._

## 0. The starting point

```
$ git rev-parse HEAD; echo "exit $?"; git status --short
f718ac2e9d3b68db611cd7da4b25e0fcebd0c0a7
exit 0
```

My branch was at `f718ac2e` and the tree was clean.

## 1. The tip and its ancestry

```
$ git rev-parse refs/heads/night/pulse-029a/pulse-029a; echo "exit $?"
a939c2bce39d342699e10e07d2611127dbec3ed5
exit 0
$ git merge-base --is-ancestor c315c5d5edb840e360e5ad35fed78f6b9d604454 a939c2bc; echo "exit $?"
exit 0
```

The tip is the one the brief names, and the line's tip `c315c5d5` is its ancestor (exit 0).

## 2. The merge

```
$ git merge --no-ff -m "merge(029): pulse-029a's reviewed tip a939c2bce39d342699e10e07d2611127dbec3ed5 (Q59, rv-line-029's L-1; rv-pulse-029a not blocking) onto int-029's tip f718ac2e …" a939c2bce39d342699e10e07d2611127dbec3ed5; echo "exit $?"; git rev-parse HEAD; git diff --stat f718ac2e HEAD
Merge made by the 'ort' strategy.
 apps/web/src/room/room.css               |  13 +-
 apps/web/test/ui/hud-over-layers.test.ts | 380 ++++++++++++++++++++++++++++++-
 specs/029-room-polish/plan.md            |   5 +
 specs/029-room-polish/pulse-a.md         | 248 ++++++++++++++++++++
 specs/029-room-polish/tasks.md           |   1 +
 5 files changed, 642 insertions(+), 5 deletions(-)
 create mode 100644 specs/029-room-polish/pulse-a.md
exit 0
b49ec2f7c77238eda10323e3b9b3534164360b36
 apps/web/src/room/room.css               |  13 +-
 apps/web/test/ui/hud-over-layers.test.ts | 380 ++++++++++++++++++++++++++++++-
 specs/029-room-polish/plan.md            |   5 +
 specs/029-room-polish/pulse-a.md         | 248 ++++++++++++++++++++
 specs/029-room-polish/tasks.md           |   1 +
 5 files changed, 642 insertions(+), 5 deletions(-)
```

No conflict, as the supervisor's `git merge-tree` said: pulse-029a and int-029 change no file in common. The merge
brings exactly pulse-029a's five files.

## 3. `make setup`, then pulse-029a's section alone (Q25)

```
$ make setup > /tmp/merge-029-3-setup.log 2>&1; echo "exit $?"; tail -15 /tmp/merge-029-3-setup.log
exit 0
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
```

`make setup` left the worktree clean (`git status --short` printed nothing).

From `apps/web`:

```
$ npx --no-install vitest run test/ui/hud-over-layers.test.ts 2>&1 | tail -20; echo "exit ${PIPESTATUS[0]}"
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-16/merge-029-3/apps/web


 Test Files  1 passed (1)
      Tests  24 passed (24)
   Start at  18:10:02
   Duration  106.50s (tests 95%, transform 3%, import 2%)

exit 0
```

24 of 24, as pulse-029a's own run (`pulse-a.md`).

## 4. The whole `apps/web` suite

The touched area is `apps/web` only; no Python file changed, so no `pytest`.

```
$ cat /sys/fs/cgroup/cpu.max
400000 100000
```

`<n>` = quota ÷ period = 400000 ÷ 100000 = **4**.

From `apps/web`, started in the background with a two-hour limit, waited on by the run's own notice (Q53):

```
$ npx --no-install vitest run --maxWorkers=4 > /tmp/merge-029-3-vitest.log 2>&1; echo "exit $?" >> /tmp/merge-029-3-vitest.log
```

_Running._
