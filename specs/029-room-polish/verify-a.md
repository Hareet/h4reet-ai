# verify-029a: group A's tip, verified

- Verifier: `verify-029a` (an implementer; I wrote none of group A).
- Date: 2026-11-16 (the suite started 15:49:07 UTC; this note written 16:18 UTC).
- Base (group A's reviewed tip, rv-029a-3 not blocking): `5321ae91af3dd7734b15d4e3a36de1a9991349c7` (`refs/heads/night/rework3-029a/rework3-029a`).
- Branch: `night/verify-029a/verify-029a`.
- The line's tip: the stack's base, `f411d8e1b3427f1b78f4bae55343a75922dbb027` (no merge task has run yet).

**Result: green.** Group A's tip passes the whole `apps/web` suite (266 files, 4659 passed, 6 skipped, 0 failed) and `make lint` (exit 0). There was nothing to merge.

## 1. The line's tip is an ancestor of the base

```
$ git merge-base --is-ancestor f411d8e1b3427f1b78f4bae55343a75922dbb027 5321ae91; echo "exit=$?"
exit=0
```

Exit 0: `f411d8e1` is an ancestor of `5321ae91`. Nothing to merge, and no merge commit on this branch.

## 2. Setup

```
$ make setup
npm ci --ignore-scripts

added 431 packages, and audited 435 packages in 35s

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

Every vitest run below uses `npx --no-install`, so it runs the lockfile's vitest (`v5.0.3`, in the run's header) and nothing is fetched.

## 3. The workers

```
$ cat /sys/fs/cgroup/cpu.max
400000 100000
```

quota ÷ period = 400000 ÷ 100000 = 4, rounded down 4 (at least 1): `--maxWorkers=4`.

## 4. The whole `apps/web` suite

Group A touched `apps/web` only (`src/room/app.ts`, `src/room/compose/over.ts`, `src/room/hud/split.css`, `src/room/layout.ts`, `src/room/room.css`, `test/ui/hud-over-*.test.ts`) and spec documents. I started the run in the background with a two-hour timeout and waited for its completion notice.

```
$ cd apps/web && npx --no-install vitest run --maxWorkers=4 > /tmp/verify-029a-vitest.log 2>&1; echo "exit=$?" >> /tmp/verify-029a-vitest.log
```

The whole log, as the runner wrote it:

```

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-16/verify-029a/apps/web


pet.select and pet.frame, a whole petting of 251 frames (turn 19, petting 211, return 20; 59 eased): 3.89 bytes a petting

pet.select and pet.frame, a short petting of 9 frames: 0.72 bytes a petting

pet.frame through a cut petting of 40 frames (fade 11): 0.24 bytes a cut petting

applyReachLayer at weight 1: 0.46 bytes a frame; legs off 0.45; 0.0062 ms a frame; legs off 0.0034 ms

applyReachLayer at weight 0.37: 0.45 bytes a frame; legs off 0.45; 0.0046 ms a frame; legs off 0.0034 ms

the wired twin's frame (pet.frame, the run's shell, figures.update): linked 695.35 bytes and 0.0187 ms a frame; unlinked 688.81 bytes and 0.0055 ms; the reach adds 6.54 bytes and 0.0132 ms
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
chase bench: 600 frames, mean ms a frame per run 0.0124, 0.0116, 0.0187; best 0.0116
T-B03 composed points: {"twin_home":[0.66,0.469],"taken_origin":[0.977,1.49,0.222],"taken_box_floor":{"x":[0.889,1.065],"z":[-0.287,0.481]},"shell_floor":{"x0":-1.0668,"x1":1.0668,"z0":-0.6096,"z1":0.6096},"chase_bounds":{"x0":-0.9468,"x1":0.9468,"z0":-0.48960000000000004,"z1":0.5846},"chase_obstacles":[{"x0":-0.87,"x1":0.87,"z0":-0.7296,"z1":0.3124},{"x0":-0.766,"x1":0.458,"z0":-0.6946,"z1":-0.16927999999999999},{"x0":-0.942303,"x1":0.8445,"z0":-0.6365999999999999,"z1":-0.3089},{"x0":0.3,"x1":0.8,"z0":-0.5496,"z1":-0.0696},{"x0":0.2742,"x1":0.8259,"z0":-0.5613049999999999,"z1":-0.0796},{"x0":-0.839191,"x1":-0.260612,"z0":-0.43058599999999997,"z1":-0.047686000000000006},{"x0":0.8713,"x1":1.1873,"z0":-0.33999999999999997,"z1":0.13999999999999999},{"x0":-1.1867999999999999,"x1":-0.8872000000000001,"z0":-0.19,"z1":0.7652},{"x0":-1.186792,"x1":-0.748936,"z0":-0.676198,"z1":-0.123802},{"x0":0.76902,"x1":1.18458,"z0":-0.407138,"z1":0.601205},{"x0":-1.12,"x1":1.12,"z0":-0.7296,"z1":-0.42879999999999996},{"x0":-1.08,"x1":1.08,"z0":-0.7184,"z1":-0.4697},{"x0":-0.490847,"x1":0.209343,"z0":-0.278034,"z1":0.25013399999999997},{"x0":-0.007175000000000001,"x1":0.327606,"z0":-0.162291,"z1":0.203151},{"x0":-0.836073,"x1":-0.2388,"z0":-0.247423,"z1":0.28185},{"x0":0.558607,"x1":1.149177,"z0":-0.346763,"z1":0.191209},{"x0":-0.092282,"x1":0.710491,"z0":-0.5776129999999999,"z1":0.074719},{"x0":0.901655,"x1":1.1867999999999999,"z0":-0.556,"z1":-0.244}],"start":{"x":-0.7,"z":0.58},"dog_home":[0.3,0.45]}

pet.select and pet.frame over the real adapters, with chase.frame: 6.60 bytes a petting of 252 frames; 0.0001 ms a frame
dino scene: mean ms a frame per run 0.0006, 0.0002, 0.0003

 Test Files  266 passed (266)
      Tests  4659 passed | 6 skipped (4665)
   Start at  15:49:07
   Duration  1683.88s (tests 70%, import 29%)

exit=0
```

My reading, beside the runner's lines: every file passed, including `test/room/twin-2d.test.ts` (the known flake under load), so I had no reason to rerun it alone. No test failed, so there was no failure to name and no export of `f411d8e1` to rerun against; I made none. The run took about 28 minutes at 4 workers, against verify-029b's 22.

No Python file changed in group A, so I ran no `pytest`.

## 5. `make lint`

```
$ make lint > /tmp/verify-029a-lint.log 2>&1; echo "exit=$?" >> /tmp/verify-029a-lint.log
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
879 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit=0
```

This lint ran on the tree before this note was added. The note is markdown only, so I checked it with prettier on its own (before this paragraph, which only changes prose):

```
$ node_modules/.bin/prettier --check -- specs/029-room-polish/verify-a.md; echo "exit=$?"
Checking formatting...
All matched files use Prettier code style!
exit=0
```

## Not run

- **The full `make check`.** It is the integration task's job, run once on the stack.
- **The image stage.** It fails in the workers' containers (night 3's Q46 and Q48), so I left it to the Author's gate.
- **`services/gateway`'s suite.** Its 5 G8 failures at `f411d8e1` (Q30, Q34) are outside group A, which didn't touch `services/gateway`.
- **`pytest`.** No Python file changed.

## Left alone

- rv-029a-3's nits (RS-1 to RS-3) go to the item's note, which the supervisor keeps. I didn't act on them.
- I edited no source, test, spec, plan, or tasks file, and no human-only path. I didn't merge, push, or open a PR.
- No refusal by a hook, the bash gate, or the permission layer happened during this task.
