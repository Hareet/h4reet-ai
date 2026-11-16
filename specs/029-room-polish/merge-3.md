# merge-029-3: pulse-029a into the stack, after the one `make check`

- Date: 2026-11-16 (night 4)
- Task: `merge-029-3` (implementer; I wrote none of pulse-029a or the integration)
- Branch: `night/merge-029-3/merge-029-3`
- Base (int-029's tip, the line `c315c5d5` with the integration and its note): `refs/heads/night/int-029/int-029` = `f718ac2e9d3b68db611cd7da4b25e0fcebd0c0a7`
- pulse-029a's reviewed tip (Q59; rv-pulse-029a not blocking): `refs/heads/night/pulse-029a/pulse-029a` = `a939c2bce39d342699e10e07d2611127dbec3ed5`
- Merge commit: `b49ec2f7c77238eda10323e3b9b3534164360b36` (parents `f718ac2e9d3b68db611cd7da4b25e0fcebd0c0a7`, `a939c2bce39d342699e10e07d2611127dbec3ed5`)
- Result: **green**. The whole `apps/web` suite passed on the merge: 273 of 273 files, 4820 tests passed, 6 skipped, exit 0, at 4 workers. `make lint` exited 0.

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

The run's notice: `completed (exit code 0)`. The log is 49 lines, pasted whole:

```

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-16/merge-029-3/apps/web


pet.select and pet.frame, a whole petting of 251 frames (turn 19, petting 211, return 20; 59 eased): 3.94 bytes a petting

pet.select and pet.frame, a short petting of 9 frames: 0.72 bytes a petting

pet.frame through a cut petting of 40 frames (fade 11): 0.24 bytes a cut petting

applyReachLayer at weight 1: 0.46 bytes a frame; legs off 0.45; 0.0058 ms a frame; legs off 0.0048 ms

applyReachLayer at weight 0.37: 0.45 bytes a frame; legs off 0.45; 0.0061 ms a frame; legs off 0.0074 ms

the wired twin's frame (pet.frame, the run's shell, figures.update): linked 692.35 bytes and 0.0177 ms a frame; unlinked 688.77 bytes and 0.0070 ms; the reach adds 3.57 bytes and 0.0107 ms
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
chase bench: 600 frames, mean ms a frame per run 0.0132, 0.0139, 0.0116; best 0.0116
T-B03 composed points: {"twin_home":[0.66,0.469],"taken_origin":[0.977,1.49,0.222],"taken_box_floor":{"x":[0.889,1.065],"z":[-0.287,0.481]},"shell_floor":{"x0":-1.0668,"x1":1.0668,"z0":-0.6096,"z1":0.6096},"chase_bounds":{"x0":-0.9468,"x1":0.9468,"z0":-0.48960000000000004,"z1":0.5846},"chase_obstacles":[{"x0":-0.87,"x1":0.87,"z0":-0.7296,"z1":0.3124},{"x0":-0.766,"x1":0.458,"z0":-0.6946,"z1":-0.16927999999999999},{"x0":-0.942303,"x1":0.8445,"z0":-0.6365999999999999,"z1":-0.3089},{"x0":0.3,"x1":0.8,"z0":-0.5496,"z1":-0.0696},{"x0":0.2742,"x1":0.8259,"z0":-0.5613049999999999,"z1":-0.0796},{"x0":-0.839191,"x1":-0.260612,"z0":-0.43058599999999997,"z1":-0.047686000000000006},{"x0":0.8713,"x1":1.1873,"z0":-0.33999999999999997,"z1":0.13999999999999999},{"x0":-1.1867999999999999,"x1":-0.8872000000000001,"z0":-0.19,"z1":0.7652},{"x0":-1.186792,"x1":-0.748936,"z0":-0.676198,"z1":-0.123802},{"x0":0.76902,"x1":1.18458,"z0":-0.407138,"z1":0.601205},{"x0":-1.12,"x1":1.12,"z0":-0.7296,"z1":-0.42879999999999996},{"x0":-1.08,"x1":1.08,"z0":-0.7184,"z1":-0.4697},{"x0":-0.490847,"x1":0.209343,"z0":-0.278034,"z1":0.25013399999999997},{"x0":-0.007175000000000001,"x1":0.327606,"z0":-0.162291,"z1":0.203151},{"x0":-0.836073,"x1":-0.2388,"z0":-0.247423,"z1":0.28185},{"x0":0.558607,"x1":1.149177,"z0":-0.346763,"z1":0.191209},{"x0":-0.092282,"x1":0.710491,"z0":-0.5776129999999999,"z1":0.074719},{"x0":0.901655,"x1":1.1867999999999999,"z0":-0.556,"z1":-0.244}],"start":{"x":-0.7,"z":0.58},"dog_home":[0.3,0.45]}

pet.select and pet.frame over the real adapters, with chase.frame: 6.60 bytes a petting of 252 frames; 0.0001 ms a frame
dino scene: mean ms a frame per run 0.0004, 0.0001, 0.0001

 Test Files  273 passed (273)
      Tests  4820 passed | 6 skipped (4826)
   Start at  18:11:55
   Duration  1627.30s (tests 72%, import 28%)

exit 0
```

No failure, so `test/room/twin-2d.test.ts` needed no rerun (it passed in the run).

Against int-029's `apps/web` run in its `make check` (273 files, 4805 passed, 6 skipped), there are 15 more tests and the
same file count. The merge changes one test file, `test/ui/hud-over-layers.test.ts`, so the 15 come from pulse-029a's
section there (24 tests in the file now, §3).

## 5. `make lint`

From the worktree's root, after the suite:

```
$ make lint > /tmp/merge-029-3-lint.log 2>&1; echo "make lint exit $?"; cat /tmp/merge-029-3-lint.log
make lint exit 0
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
899 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
```

After the stack's note took its three additions (§6a, Q59 in §7, the block at §8's end; commit `wip(merge-029-3): the
stack's note…`), `make lint > /tmp/merge-029-3-lint2.log 2>&1` ran once more on that tree: `make lint exit 0`, the same
lines as above (prettier "All matched files use Prettier code style!"). After it, only this paragraph changed.

## 6. Not run

- **The full `make check`.** int-029 ran the stack's one, on `f718ac2e`'s tree without pulse-029a (the stack's note, §5).
  Only the `apps/web` suite and `make lint` ran again here, on the merge.
- **The image stage.** It fails in the workers' containers (night 3's Q46 and Q48); the image is left to his gate.
- **`pytest`.** No Python file changed.

## 7. Refusals and questions

No refusal by a hook, the bash gate, or the permission layer. No question.

`/tmp` holds this task's `merge-029-3-page.md`, `merge-029-3-setup.log`, `merge-029-3-vitest.log`,
`merge-029-3-lint.log`, and `merge-029-3-old/` (a copy of the test file at `f718ac2e`, read to compare); nothing deleted
(Q33).
