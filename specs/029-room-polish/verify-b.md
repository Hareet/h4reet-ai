# verify-029b: group B's tip, verified

- Task: `verify-029b` (implementer; wrote none of group B), night 2026-11-16
- Base: `refs/heads/night/rework2-029b/rework2-029b` at `b46b67f3780247ef333081b781f3d2e41485064b` (impl-029b, rework-029b, rework2-029b; review rv-029b-2 found it not blocking)
- Branch: `night/verify-029b/verify-029b`
- Date: 2026-11-16 (runs 14:37–15:21 UTC)
- Result: **green**. The whole `apps/web` suite: 264 files passed, 4676 tests passed, 6 skipped. `make lint` exit 0. Nothing was fixed or edited; this file is the branch's only tracked change.

## 1. The line's tip

No merge task has run yet, so the line's tip is the stack's base, `f411d8e1`.

```
$ git rev-parse HEAD refs/heads/night/rework2-029b/rework2-029b && git merge-base --is-ancestor f411d8e1b3427f1b78f4bae55343a75922dbb027 HEAD; echo "exit=$?"
b46b67f3780247ef333081b781f3d2e41485064b
b46b67f3780247ef333081b781f3d2e41485064b
exit=0
```

`f411d8e1` is an ancestor of the base, so there was nothing to merge.

## 2. `make setup`

```
$ make setup 2>&1 | tail -30; echo "exit=${PIPESTATUS[0]}"
npm ci --ignore-scripts

added 431 packages, and audited 435 packages in 37s

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

This paste is the output's last 30 lines (`tail -30`), and it starts at the recipe's `npm ci` line, so nothing before it was cut that I could see. The git-hooks line is expected in the agent sandbox.

## 3. `<n>` from the cgroup

```
$ cat /sys/fs/cgroup/cpu.max
400000 100000
```

400000 ÷ 100000 = 4, which is ≥ 1, so `<n>` = 4.

## 4. The whole `apps/web` suite

### First run: stopped at the tool's time limit, no result

```
$ cd apps/web && npx --no-install vitest run --maxWorkers=4 > /tmp/verify-029b-vitest.log 2>&1; echo "exit=$?"; tail -40 /tmp/verify-029b-vitest.log
```

This went past the 600 s foreground limit and was moved to the background, where the tool stopped it at its background limit after about 20 minutes. When it was stopped, the log held only the bench lines (41 lines): no file results, no totals, no failure. No vitest process was left over. This was the shell tool's time limit, not a refusal by a hook or the permission layer, and not a test failure.

### Second run: the one counted

The same command, in the background with a two-hour limit, timed:

```
$ cd apps/web && date -u && time npx --no-install vitest run --maxWorkers=4 > /tmp/verify-029b-vitest-2.log 2>&1; echo "exit=$?"; date -u
Mon Nov 16 14:58:45 UTC 2026

real	21m29.672s
user	80m3.876s
sys	1m48.400s
exit=0
Mon Nov 16 15:20:14 UTC 2026
```

The runner's whole log, unedited (`/tmp/verify-029b-vitest-2.log`):

```

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-16/verify-029b/apps/web


pet.select and pet.frame, a whole petting of 251 frames (turn 19, petting 211, return 20; 59 eased): 3.94 bytes a petting

pet.select and pet.frame, a short petting of 9 frames: 0.72 bytes a petting

pet.frame through a cut petting of 40 frames (fade 11): 0.24 bytes a cut petting

applyReachLayer at weight 1: 0.46 bytes a frame; legs off 0.45; 0.0042 ms a frame; legs off 0.0032 ms

applyReachLayer at weight 0.37: 0.45 bytes a frame; legs off 0.45; 0.0045 ms a frame; legs off 0.0035 ms

the wired twin's frame (pet.frame, the run's shell, figures.update): linked 692.29 bytes and 0.0126 ms a frame; unlinked 688.81 bytes and 0.0052 ms; the reach adds 3.49 bytes and 0.0074 ms
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
chase bench: 600 frames, mean ms a frame per run 0.0110, 0.0108, 0.0104; best 0.0104
T-B03 composed points: {"twin_home":[0.66,0.469],"taken_origin":[0.977,1.49,0.222],"taken_box_floor":{"x":[0.889,1.065],"z":[-0.287,0.481]},"shell_floor":{"x0":-1.0668,"x1":1.0668,"z0":-0.6096,"z1":0.6096},"chase_bounds":{"x0":-0.9468,"x1":0.9468,"z0":-0.48960000000000004,"z1":0.5846},"chase_obstacles":[{"x0":-0.87,"x1":0.87,"z0":-0.7296,"z1":0.3124},{"x0":-0.766,"x1":0.458,"z0":-0.6946,"z1":-0.16927999999999999},{"x0":-0.942303,"x1":0.8445,"z0":-0.6365999999999999,"z1":-0.3089},{"x0":0.3,"x1":0.8,"z0":-0.5496,"z1":-0.0696},{"x0":0.2742,"x1":0.8259,"z0":-0.5613049999999999,"z1":-0.0796},{"x0":-0.839191,"x1":-0.260612,"z0":-0.43058599999999997,"z1":-0.047686000000000006},{"x0":0.8713,"x1":1.1873,"z0":-0.33999999999999997,"z1":0.13999999999999999},{"x0":-1.1867999999999999,"x1":-0.8872000000000001,"z0":-0.19,"z1":0.7652},{"x0":-1.186792,"x1":-0.748936,"z0":-0.676198,"z1":-0.123802},{"x0":0.76902,"x1":1.18458,"z0":-0.407138,"z1":0.601205},{"x0":-1.12,"x1":1.12,"z0":-0.7296,"z1":-0.42879999999999996},{"x0":-1.08,"x1":1.08,"z0":-0.7184,"z1":-0.4697},{"x0":-0.490847,"x1":0.209343,"z0":-0.278034,"z1":0.25013399999999997},{"x0":-0.007175000000000001,"x1":0.327606,"z0":-0.162291,"z1":0.203151},{"x0":-0.836073,"x1":-0.2388,"z0":-0.247423,"z1":0.28185},{"x0":0.558607,"x1":1.149177,"z0":-0.346763,"z1":0.191209},{"x0":-0.092282,"x1":0.710491,"z0":-0.5776129999999999,"z1":0.074719},{"x0":0.901655,"x1":1.1867999999999999,"z0":-0.556,"z1":-0.244}],"start":{"x":-0.7,"z":0.58},"dog_home":[0.3,0.45]}

pet.select and pet.frame over the real adapters, with chase.frame: 6.55 bytes a petting of 252 frames; 0.0001 ms a frame

dino scene: mean ms a frame per run 0.0002, 0.0001, 0.0002

 Test Files  264 passed (264)
      Tests  4676 passed | 6 skipped (4682)
   Start at  14:58:45
   Duration  1288.43s (tests 71%, import 29%)

```

My reading: every file passed, including `test/room/twin-2d.test.ts`, so I didn't need to rerun it alone. There's no failure to name, and nothing to compare against an export of `f411d8e1`. The 6 skips are part of the suite as written; I didn't look into them, since no failure called for it.

## 5. `make lint`

```
$ make lint > /tmp/verify-029b-lint.log 2>&1; echo "exit=$?"
exit=0
```

The whole log (`/tmp/verify-029b-lint.log`):

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

eslint, tsc, and shellcheck printed nothing beyond their command lines, which means no findings. prettier and ruff each reported clean.

## 6. Not run

- **The full `make check`**: that's the integration task's run, not this one's.
- **The image stage**: it fails in the workers' containers (night 3's Q46 and Q48), so it's left to the Author's gate.
- **`pytest`**: group B changed no Python file.
- **The `services/gateway` suite**: group B didn't touch it. Its 5 G8 failures at `f411d8e1` (Q30, Q34) aren't group B's, and I didn't run it.

## 7. Refusals

None. No hook, bash-gate, or permission-layer refusal came up during this task. The one stopped command (§4, first run) hit the shell tool's time limit, which isn't a refusal.

## 8. For the next run

On this engine, the whole `apps/web` suite takes about 21.5 minutes with 4 workers (1288 s by the runner's count). That's longer than the shell tool's 600 s foreground limit and its default 10-minute background limit. The next verify or merge task should start it in the background with a longer limit from the beginning.
