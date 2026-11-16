# verify-029d: group D's reviewed tip, verified

- Task: `verify-029d` (implementer; wrote none of group D), night 2026-11-16
- Date: 2026-11-16
- Base: `refs/heads/night/rework-029d/rework-029d` at `807eaa1cd364f6d3788a5644dd7f5f227a6e507f` (impl-029d, then rework-029d; rv-029d-1 found it not blocking)
- Branch: `night/verify-029d/verify-029d`
- The line's tip: the stack's base, `f411d8e1b3427f1b78f4bae55343a75922dbb027` (no merge task has run yet)

**Verdict: green.** The line's tip is an ancestor of the base, so there was nothing to merge. The whole `apps/web` suite passed (263 files; 4635 passed, 6 skipped, 0 failed), and `make lint` exited 0. `test/room/twin-2d.test.ts` didn't fail, so it wasn't rerun alone. No source, test, spec, plan, or tasks file was changed.

## 1. The line's tip

```
$ git merge-base --is-ancestor f411d8e1b3427f1b78f4bae55343a75922dbb027 807eaa1cd364f6d3788a5644dd7f5f227a6e507f; echo "exit=$?"
exit=0
```

Exit 0: `f411d8e1` is an ancestor of `807eaa1c`. Nothing to merge, so this branch's tree is the base's tree plus this note.

What group D changed over the line's tip (`git diff --stat f411d8e1b3427f1b78f4bae55343a75922dbb027 807eaa1c`):

```
 apps/web/room/hints.yaml              |   2 +-
 apps/web/src/choice/cards.ts          |  56 ++++
 apps/web/src/choice/choice.css        | 198 ++++++++++-
 apps/web/src/choice/choice.ts         | 182 ++++++++--
 apps/web/test/ui/choice-cards.test.ts | 606 ++++++++++++++++++++++++++++++++++
 apps/web/test/ui/choice.test.ts       |   5 +-
 intent/029-room-polish.md             |  44 +++
 specs/012-loading-screen/spec.md      |   2 +-
 specs/029-room-polish/analysis.md     |  42 +++
 specs/029-room-polish/impl-d.md       | 296 +++++++++++++++++
 specs/029-room-polish/notes.md        |  68 ++++
 specs/029-room-polish/plan.md         | 212 ++++++++++++
 specs/029-room-polish/probe-pick.md   | 255 ++++++++++++++
 specs/029-room-polish/rework-cd.md    |  48 +++
 specs/029-room-polish/spec.md         | 304 +++++++++++++++++
 specs/029-room-polish/tasks.md        |  58 ++++
 16 files changed, 2335 insertions(+), 43 deletions(-)
```

No Python file changed, so there's no `pytest` run. The area is `apps/web`.

## 2. Setup

```
$ make setup
npm ci --ignore-scripts

added 431 packages, and audited 435 packages in 31s

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

(These are the last 30 lines, from `make setup 2>&1 | tail -30`. `git status --short` was empty afterwards.)

## 3. The whole `apps/web` suite

`<n>` comes from the cgroup's CPU quota:

```
$ cat /sys/fs/cgroup/cpu.max
400000 100000
```

400000 ÷ 100000 = 4, rounded down 4, at least 1, so `<n>` = 4.

### The run

The first attempt, a foreground call, reached the tool's 600 s limit and was moved to the background with a 10-minute cap. The last full `apps/web` run in `impl-d.md` (R-6) took 2513.98 s, so that cap would have killed it partway. I stopped it with TaskStop (my own task, `b85vefx15`) before it produced any results; its log had only the `RUN` header. I checked that none of its vitest processes were left, then started the same command again in the background with a two-hour limit. The run below is that second, complete one, and it is the only one with results.

```
$ cd apps/web && npx --no-install vitest run --maxWorkers=4 > /tmp/verify-029d-vitest.log 2>&1; echo "exit=$?"; wc -l /tmp/verify-029d-vitest.log
exit=0
48 /tmp/verify-029d-vitest.log
```

The log, in full (`/tmp/verify-029d-vitest.log`):

```

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-16/verify-029d/apps/web


pet.select and pet.frame, a whole petting of 251 frames (turn 19, petting 211, return 20; 59 eased): 3.94 bytes a petting

pet.select and pet.frame, a short petting of 9 frames: 0.72 bytes a petting

pet.frame through a cut petting of 40 frames (fade 11): 0.24 bytes a cut petting

applyReachLayer at weight 1: 0.46 bytes a frame; legs off 0.45; 0.0054 ms a frame; legs off 0.0079 ms

applyReachLayer at weight 0.37: 0.45 bytes a frame; legs off 0.45; 0.0042 ms a frame; legs off 0.0036 ms

the wired twin's frame (pet.frame, the run's shell, figures.update): linked 692.54 bytes and 0.0147 ms a frame; unlinked 688.77 bytes and 0.0058 ms; the reach adds 3.77 bytes and 0.0089 ms
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
chase bench: 600 frames, mean ms a frame per run 0.0282, 0.0109, 0.0102; best 0.0102
T-B03 composed points: {"twin_home":[0.66,0.469],"taken_origin":[0.977,1.49,0.222],"taken_box_floor":{"x":[0.889,1.065],"z":[-0.287,0.481]},"shell_floor":{"x0":-1.0668,"x1":1.0668,"z0":-0.6096,"z1":0.6096},"chase_bounds":{"x0":-0.9468,"x1":0.9468,"z0":-0.48960000000000004,"z1":0.5846},"chase_obstacles":[{"x0":-0.87,"x1":0.87,"z0":-0.7296,"z1":0.3124},{"x0":-0.766,"x1":0.458,"z0":-0.6946,"z1":-0.16927999999999999},{"x0":-0.942303,"x1":0.8445,"z0":-0.6365999999999999,"z1":-0.3089},{"x0":0.3,"x1":0.8,"z0":-0.5496,"z1":-0.0696},{"x0":0.2742,"x1":0.8259,"z0":-0.5613049999999999,"z1":-0.0796},{"x0":-0.839191,"x1":-0.260612,"z0":-0.43058599999999997,"z1":-0.047686000000000006},{"x0":0.8713,"x1":1.1873,"z0":-0.33999999999999997,"z1":0.13999999999999999},{"x0":-1.1867999999999999,"x1":-0.8872000000000001,"z0":-0.19,"z1":0.7652},{"x0":-1.186792,"x1":-0.748936,"z0":-0.676198,"z1":-0.123802},{"x0":0.76902,"x1":1.18458,"z0":-0.407138,"z1":0.601205},{"x0":-1.12,"x1":1.12,"z0":-0.7296,"z1":-0.42879999999999996},{"x0":-1.08,"x1":1.08,"z0":-0.7184,"z1":-0.4697},{"x0":-0.490847,"x1":0.209343,"z0":-0.278034,"z1":0.25013399999999997},{"x0":-0.007175000000000001,"x1":0.327606,"z0":-0.162291,"z1":0.203151},{"x0":-0.836073,"x1":-0.2388,"z0":-0.247423,"z1":0.28185},{"x0":0.558607,"x1":1.149177,"z0":-0.346763,"z1":0.191209},{"x0":-0.092282,"x1":0.710491,"z0":-0.5776129999999999,"z1":0.074719},{"x0":0.901655,"x1":1.1867999999999999,"z0":-0.556,"z1":-0.244}],"start":{"x":-0.7,"z":0.58},"dog_home":[0.3,0.45]}

pet.select and pet.frame over the real adapters, with chase.frame: 6.60 bytes a petting of 252 frames; 0.0001 ms a frame
dino scene: mean ms a frame per run 0.0002, 0.0001, 0.0016

 Test Files  263 passed (263)
      Tests  4635 passed | 6 skipped (4641)
   Start at  06:35:44
   Duration  1521.77s (tests 71%, import 29%)

```

Summary, beside the runner's lines: no failures. The R-6 failure from `impl-d.md` (`test/room/scan.test.ts`, FR-007, on `cards.ts:47` and `choice-cards.test.ts`) doesn't come back; rework-029d's departure 4 fixed it. `test/room/twin-2d.test.ts` passed in this run, so it wasn't rerun alone.

The 6 skipped tests are conditional guards (`skipIf`/`runIf`) on what the tree or the environment holds: `test/content/film-links.test.ts` (302, 330, 340, 375, 397, 418), `test/content/author-pdf.test.ts:480`, `test/room/legacy-stages.test.ts:40`. None is in group D's two test files: `grep -cE "skip|runIf|todo"` returns 0 for both `test/ui/choice-cards.test.ts` and `test/ui/choice.test.ts`. I didn't work out which 6 of those 8 guards skipped on this tree.

## 4. `make lint`

```
$ make lint > /tmp/verify-029d-lint.log 2>&1; echo "exit=$?"; wc -l /tmp/verify-029d-lint.log
exit=0
11 /tmp/verify-029d-lint.log
```

The log, in full:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
880 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
```

## 5. Failures

None. Nothing was fixed or changed, and no run on `f411d8e1` was needed.

## 6. Not run

- The full `make check`. That's the integration task's run, once, on the stack (orders item 4).
- The image stage. It fails in the workers' containers (night 3's Q46 and Q48), so the image is left to the Author's gate.
- `make test` and `make evals` as targets. This verify's scope is the `apps/web` suite and `make lint` (orders item 7); `make check` covers the rest at integration.
- `pytest`. No Python file changed in group D.

## Refusals

None. No hook, bash-gate, or permission-layer refusal happened during this task.
