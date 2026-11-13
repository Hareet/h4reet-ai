# feat/017-the-night-shift: the night shift, containers around every agent session

Spec: specs/017-the-night-shift/ · Intent: intent/017-the-night-shift.md (uncommitted, the Author's) · Written by: implementer agents per group (G1 to G5), the docs agent (ADRs, how-we-build, runbook), the main session (merges, the runbook's sections, this note) · Date: 2026-11-12
Session: /home/h4reet/h4reet-ai/h4reet-ai, with each group in its own worktree under /tmp/claude-1000 (wt-017 for the integration branch) · Repo hooks active: yes (the bash gate refused several scratch commands whose text named a refused word, and one commit while the main checkout's HEAD was main; each was redone with the Write and Edit tools or after the checkout was parked, never respelled)
Authorized by: the spec and plan, approved by the Author on 2026-11-12 ("Approve, all recommended", T000, 18e2dcf1), and his answers in spec.md's Clarifications (Q1, Q5, Q8, Q15, Q17, and the move to containers)

## Status: built in five groups, each reviewed once by an agent that didn't write it; every blocker fixed; installed by the Author, and rehearsed (R1 to R3 at a8373026, R4 at cfa29548); nothing applied or merged

The night shift's code, configuration, tests, and documents are on this branch. Its protected-path changes are twelve patches for the Author's hand, P-1 to P-12 ([index](2026-11-12-feat-017-patches.md)). The install-and-rehearse script runs only on the Author's machine, from his runbook, by `git show <sha>:<path>`.

## What changed and why

The Author wants the night shift: a supervisor and up to ten Claude Code workers, plus a studio agent driving Blender and ComfyUI, spec and build his improvements list overnight, so only decisions and merges reach him. nono, the first plan, couldn't hold it on WSL2. Its probe found that Claude Code's own sandbox can't nest inside Landlock (bwrap's uid map is denied), and that there's no socket mediation or host filter without `insecure_proxy` ([ADR 0051](../adr/0051-containers-around-every-agent-session.md), research R-14). So every session runs in a container on his Docker engine, started only by the runner, and the container probe proved that boundary on his machine (`BOUNDARY holds`, `PLAN-ONLY yes`; research R-16 to R-18).

| Group | What | Where |
|---|---|---|
| Probes | The nono probe (kept as the record) and the container probe, which passed on his machine in its third version | `deploy/night-shift/probe.sh`, `deploy/night-shift/container-probe.sh` |
| G1 | The runner: queue, locks (matrix, gate, GPU), the ten-worker cap, save points, one sleep until the weekly reset, the idle stop, the decision page's runner lines, plan, gate and ComfyUI requests (plan and gate ship off), FR-012's narrow `.git` mount, and the merge-time refusal of human-only paths; prompts and per-role settings layers; the managed settings that keep sessions on the subscription | `deploy/night-shift/runner/`, `deploy/night-shift/claude/` |
| G2 | Four images (worker, studio, ComfyUI, egress), the pins, ten container specs built from fragments with `--check` and `--fill`, the three egress allowlists | `deploy/night-shift/images/`, `deploy/night-shift/containers/`, `deploy/night-shift/allowlist*.json` |
| G3 | The studio line: brief, candidate, and round checks, with policy read from main only and rounds counted from the studio's handoff folders; ComfyUI's launch allowlist (`--birefnet`) ([G3's note](2026-11-12-feat-017-g3-studio.md)) | `scripts/studio/line.py`, `deploy/night-shift/comfyui-params.json` |
| G4 | `install.sh <sha> [--branch <name>] [--undo]` and its rehearsal R1 to R4; 359 red-team rows | `deploy/night-shift/install.sh`, `deploy/night-shift/rehearse.py`, `redteam/night-shift/` |
| G5 | ADRs 0051 to 0053, the how-we-build page, the runbook; the patches P-1 to P-11 and T062's tests for the plan role (P-12 came with T090's round 2) | `docs/adr/`, `docs/how-we-build/night-shift.md`, `docs/runbooks/night-shift.md`, `docs/merge-requests/2026-11-12-feat-017-p*.patch`, `infra/test/` |
| G6 | The runbook's six sections and its test line; this note | `docs/runbooks/night-shift.md`, `evals/test_runbooks.py`, `specs/017-the-night-shift/plan.md` |

117 files, every group test-first: a RED commit, then GREEN, and the same for each review's fixes. Departures from the plan are in plan.md and the contracts in the same commits (G3's, G4's "Changed while building", the narrow `.git` mount, the merge-time refusal).

## Acceptance criteria

- US1 (install and rehearse with one script): FR-003 to FR-009, SC-001, SC-003. Built and tested against a stub engine; proven only by his run (T090).
- US2 (every session in its role's container): FR-010 to FR-016, FR-036 to FR-038, FR-041, SC-002. The probe proved the boundary; R2 and R4 prove the installed one.
- US3 (the supervisor runs the night): FR-017 to FR-025, SC-005. FR-025's role file is P-3.
- US4 (repo agents and the studio finish an asset): FR-026 to FR-031, FR-040, SC-006. Blocked on P-7 until he sets licences.
- US5 and US6 (plan and gate): FR-032, FR-033, FR-039. Built and off (FR-015) until P-2, P-3, and P-6 merge and a second install (T092).
- US7 (the pilot): T091, after his install.
- FR-034 (red-team rows) and FR-035 (a review per group, the three make targets): below.

## Constitution check

plan.md's Constitution Check table, re-checked at the end:

| Clause | Status |
|---|---|
| III. Intent, spec, plan before code | Pass: no code before T000. |
| III. Only a human merges, applies, or amends | Pass: the gate prints its merge command and never merges; the plan role's apply, the constitution patch (P-9), and every protected path are his. |
| IV. Each role scoped; the implementer never reviews | Pass: one container spec per role; every group was reviewed by another agent. |
| IV. Policy in enforcement points | Pass: mounts, internal networks, the egress proxy, capabilities, the managed settings, and the merge-time refusal, with 359 red-team rows. |
| IV. Short-lived identity-based cloud access | **Deviation, named**: an agent's plan uses a role assumed from his SSO session for one hour (decision 1, ADR 0052). |
| IV. No secrets in agent context | Pass, with the named limit: the Claude token is in each session's environment; it reaches only the allowlist's hosts, signs in only on the plan, and is revoked on its own. |
| Governance: the roles list | **Deviation until P-9**: supervisor, studio, and gate-runner. |
| Development standard: the committed sandbox settings | **Deviation, named**: inside a container the container replaces Claude Code's sandbox; the live specs stay outside (ADR 0051). |
| CLAUDE.md: the Author plans and runs the gate | **Reversed by decisions 1 and 2**, and off until his patches merge (FR-015, P-2). |
| V. Cost | Pass: sessions sign in on the plan; an API key makes them refuse to start or is neutralized (FR-041). |

## Review

One pass per group, by a reviewer agent that didn't write it, then RED tests for the fixes, then GREEN. Blockers block; the rest was fixed where cheap and otherwise is in the backlog.

| Review | Blockers, and what was done | Should-fixes and nits |
|---|---|---|
| Probes | The container probe counted any non-zero exit as "refused to start": now a refusal is read from the egress log, after a turn that proves the log records calls (7b756e2d, b2b9074b, 4db9dd78) | Its run-scoped cleanup and no leftover secrets |
| G1 | B1: every writing session had `.git` read-write, so it could plant `.git/commondir` and steer the runner's own git. Now FR-012's narrow mount: `.git` read-only; read-write only `objects` (`objects/info` masked), the task's `worktrees/<admin>` (`commondir` masked), and its own night ref and log; `GIT_COMMON_DIR` on every runner git call; the preflight refuses a `commondir` or any ref named main but `refs/heads/main` (af02fa86, 5ed200bf) | All four should-fixes (a reset in the past or over 8 days ahead, a second limit soon after resuming, a clean stop with a gate or plan running, ComfyUI's disk and memory check) and all five nits |
| G2, with G1 merged | B1: five paths main denies are absent from a fresh worktree, so no mask covers them, and the index and objects are writable. Now the merge-time refusal: at every writing session's end and before naming a stack, the runner diffs the branch from its merge base with `refs/heads/main` and matches each path against main's denyWrite, the first case of main's `protected-paths.sh`, and `deploy/night-shift/`; one page line per path, and the stack isn't named (6d18bea7, 66a568d0) | The never-mounted check covers contracts/containers.md §3 whole; the plan container's `.git` is read-only and it names no `AWS_` variable; `--init`; the memory sum; FR-014's wording (e95536a5); the filled-spec test calls the runner's own `validate_spec` |
| G3 | 1: policy read from any file the agent named; now from `refs/heads/main` only. 2: deleting a result reset the round limit; now rounds count from the studio's handoff folders (a0881d67) | Importants 2 and 3, nits 1 to 3; Importants 4 to 6 to the backlog |
| G4 | B1: R2 trusted an egress log nothing had proven records calls; now R1's signed-in turn must add an `api.anthropic.com` line, and R2 runs its own proof turn before reading a refusal (b34b5cb9, aabde41a) | S1 to S9 and all five nits; then R4's floor counts a target absent on the host and in the container as checked (44f34f54, 8febc6ca) |
| G5 patches | None | Seven should-fixes, all made (88998c1b, 3988f5eb): P-1's timing, P-2's restored words, P-3's narrowed scopes, P-5's stage S row, P-6's denies, P-7's `outputs_ship: false`, P-10's pins trigger. Two of three nits made; P-2's pointer to the how-we-build page doesn't fit CLAUDE.md's 6,144 bytes |

The docs (G5's ADRs, how-we-build page, and runbook) were reviewed with the integration review; the runbook's sections were fixed when `make test` found them (bc44418e).

### Backlog

- Studio image: Claude Code is installed with `npm install -g` at a pinned version but no integrity hash, and apt packages float (G2 nit 4).
- Studio line (G3 Importants 4 to 6 and the rest of its list): custom nodes named in the workflow file and a step's `service` items checked against the tools list; the decision-page entry for `decide` written by the runner; standalone PNG and JPEG sizes against `texture_px`; more spellings in the by-name refusal; the studio copying the brief into its handoff folder so a rewritten brief can't move the target.
- FR-020's save point at a step's start is in the prompts only; the runner records uncommitted changes at a worker's end.
- P-6: the precondition checks only the name's characters, so a typo passes until the first plan; whether AWS checks the anomaly reads against their ARNs is shown by R5.
- P-2 has no pointer to `docs/how-we-build/night-shift.md` (size).
- R3's log redactor removes any line beginning `secrets:` (its `secret…:` pattern), the gate's own verdict included, so a secrets failure has to be reproduced to be read.
- The disk floor (b97c21dd's review, Importants 1 and 2 and nits 1 to 3):
  - Step 0's floor is a flat 15 GB, not 15 GB plus the build's size when images are missing. A cold build starting at 15–19 GB can end under 15 GB, and R1 then refuses.
  - Nothing re-reads the disk while sessions run. Ten workers can all start at about 19 GB, and the agents' engine's stacks (about 30 GB a day of stack work in October) are not in plan §15's estimate. A hard floor of about 5 GB that pages and stops running sessions is one fix.
  - Hold lines carry the GB reading, so queued tasks write a new page line for each GB the disk loses.
  - A disk hold with nothing running never ends the night; `night.py stop` does.
  - `H4_NIGHT_TEST_RESOURCES` set in a real shell would fake step 0's check silently.
  - `--disk-floor` (its review): nothing rechecks disk between step 0 and R1, so at a low floor a cold build could take C: near empty before R1 refuses; and a rerun at the same SHA without the flag replays the rehearsal as `unchanged` without its `disk_floor` line (step 0 checks 15 GB again, so nights are unaffected).
- R4's rows after install 4 (their review, Important 1 and nits 2 and 3):
  - Three rows prove the mount's layout more than its read-only flag: the alternates hardlink's source is on the worktree mount, so EXDEV answers even without the `objects/info` mask; `git mv` of a bind-mounted file is busy whether the mount is read-only or not; and the gitleaks mask row would hit the read-only root if its mount were missing. Each prints `refused-by=ro-mount`, which overstates it. Sibling rows (`-plain`, `-symlink`, `mask-git-objects-info`) and R3 carry the proof, so R4 can't pass on these alone.
  - On a missing mask, a `git mv` row's cleanup deletes the renamed file instead of renaming it back. That happens only in the scratch worktree, and R4 has already failed by then.
  - No test runs a full install, then `--rehearse`, then a full one at the same SHA. contracts/install.md doesn't say that `--rehearse R1,R2,R3,R4` is a plain run.
- No telemetry span or dashboard panel: the night shift is build-time tooling with no runtime path. Its record is the nightly decision page, `installed.txt`, and the egress log. The G1 review asked for this to be confirmed; see "For the Author".

## Verification

Run in /tmp/claude-1000/wt-017 at f7d5a34b, the integration tip with every group and the rebuilt patches merged. This note and tasks.md's ticks are the only change after it.

`make lint`: exit 0.

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
621 files already formatted
… | xargs -0 -t shellcheck -- … deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh … redteam/night-shift/run.sh … (no findings)
```

`make test`: exit 2. Every failure is environmental, and none is in a file this branch touches.

```text
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
services/gateway:  Test Files  95 passed (95)   Tests  1657 passed | 13 skipped (1670)
apps/web:          Test Files  7 failed | 155 passed (162)   Tests  7 failed | 3463 passed | 1 skipped (3471)
  each of the 7: Error: Test timed out in 60000ms.
  test/manifest.test.ts, test/ui/hud-faults.test.ts, test/ui/loading-degraded.test.ts, test/ui/pick.test.ts,
  test/room/data-only.test.ts, test/room/objects.test.ts, test/room/text.test.ts
make: *** [Makefile:248: test] Error 1
```

The load average was 32 on 24 cores while other sessions ran, and the branch changes nothing under `apps/` or `services/`. The seven files rerun alone (`npx vitest run <the seven>` in apps/web):

```text
 Test Files  7 passed (7)
      Tests  148 passed (148)
```

make stops after npm, so its pytest step ran directly, with the Makefile's own arguments and `PYTEST_DIRS`:

```text
FAILED scripts/infra/test_infra_targets.py::test_infra_check_runs_the_policy_then_waits_for_terraform
  AssertionError: mktemp: failed to create file via template '/tmp/tmp.XXXXXXXXXX': Read-only file system
1 failed, 5670 passed, 1 skipped in 653.99s (0:10:53)
```

That one comes from the agent sandbox. The target under test makes a temp file in `/tmp`, which is read-only here, and it failed the same way on G3's run before any of this branch's Makefile or `scripts/infra/` changes (it has none). The earlier run at 033bc292 had two real failures in `evals/test_runbooks.py`, the runbook's six sections and spec 017's Runbooks line, fixed at bc44418e.

`make evals` (fake adapter): exit 0.

```text
evals product (fake): 187 passed, 0 failed
evals narration (fake): 44 passed, 0 failed
agent-config static: 0 failed, 0 planned
PASS  behavioral tier: 2026-11-12T015050Z-feat-001-cloud-elevation-p-f95459fa7292 passed for trigger hash 95025bddfe03, the newest run for it, on Claude Code 2.1.322
agent-config behavioral: pass, 0 planned
docs links: 0 failed, 2269 relative links in 363 files
```

`gitleaks git --log-opts=5f8790b2..HEAD --redact`: `46 commits scanned … no leaks found`.

`make check ENGINE_MODE=none-yet` wasn't run separately. Its lint, test, and evals are above. Its container stages can't run in this sandbox, and the Author's gate runs them.

Not verified here, and proven only by his install (T090): the images' builds, the containers on his engine, and R1 to R4. The probe proved the boundary, and every script and runner path is tested against a stub engine. The patches' own verification is in their [index](2026-11-12-feat-017-patches.md).

## Cost and data-flow impact

- **Model spend**: none added. Sessions draw on the Author's subscription inside its weekly limits; the managed settings blank `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` and force the claude.ai login, so no session can bill API credits (FR-041; proven by the probe's third run). The runner sleeps until the weekly reset instead of buying more.
- **AWS**: the plan-only role is free; plans' read calls are free; the S3 lock's writes are fractions of a cent a month. Off until P-6.
- **Electricity**: the GPU on studio nights.
- **Data flow**: no visitor byte; nothing here runs at runtime, so `docs/data-flow-disclosure.md` is unchanged. On the build side, sessions reach only the egress allowlist's hosts, and the plan's command reaches AWS's read APIs (ADR 0052).

## For the Author

The steps, in order, are on the runbook artifact as lines of 45 characters or fewer.

1. **Base digests (done, T002)**: you read node's, python's, and docker-cli's on your engine, since the agents' engine can't reach Docker Hub (Forbidden). Ubuntu's is the one `.devcontainer/Dockerfile` pins. They're committed in `pins.json`, and the branch's tip after that commit is the SHA you install.
2. **Before the install**: `facts.env` and the token file (`claude setup-token`, mode 0600) in `~/.config/h4reet-ai/night-shift/`; `/srv/studio/outputs` empty (your Q5; you reported 0 files); `/srv/studio/workflows` present.
3. **Install and rehearse**: the guard on the reviewed SHA, then `install.sh <sha> --branch feat/017-the-night-shift`. Paste back the summary; each failure is fixed on this branch, test-first, with a new SHA (T090). The first run (eba6b12b) built all five images and stopped at R1: the runner's preflight wanted 30 GB free on `/mnt/c`, and C: had 20 GB. The 30 GB was the October rule's margin, not a measured need, and the runner checked disk only at the start and before GPU tasks. Now the floor is 15 GB and every task start checks it (FR-031), so a night stops starting work as C: shrinks. A rerun reuses the built images whose tag matches; a new SHA rebuilds from the build cache. The second run (a5189ee7) passed R1 and R2 and failed R3: make check in the implementer's container failed `policy`, `test`, `secrets`, and `matrix` (471 tests failed, 47 errored, 5155 passed; the web suites all passed). Round 2's causes and fixes:
   - **Sessions' `/tmp` and home were `noexec`** (Docker's tmpfs default): every test that writes a fake program there and runs it failed, terraform's fake included, and the matrix's exit-126 rows. Now `rw,exec,nosuid`.
   - **`policy`**: the four night Dockerfiles had `FROM ${ARG}` with no default. Node and python now come from the lock's own `base:node` and `base:python` (ECR, the same digests every other image uses), ubuntu was already the lock's, and docker-cli has a new `base:docker-cli` line with your digest. The worker's `FROM ${TOOLCHAIN_IMAGE}` needs **P-12**; until it merges, R3 names that one line as known and fails on any other.
   - **`patch(1)`**: T062's tests read iam.tf through P-6 with patch, which the toolchain image (the gate's too) lacked. `.devcontainer/Dockerfile` now installs it.
   - **`secrets`**: its message was redacted in R3's log (the redactor eats any line beginning `secrets:`; backlog). The gate reads `.gitleaks.toml` from the main working tree, which no task mounts, so it stopped there. The runner now writes `refs/heads/main`'s committed copy at 0444 into `~/.local/share/h4reet-ai/night-shift/gate/`, a folder the install makes (the share folder itself stays 0555), and mounts that, read-only, at the path the gate reads; the main checkout itself stays unmounted (FR-012).
   - Not yet known: whatever the matrix's git-hook and pre-commit rows and the engine-endpoint tests still show once programs can run under `/tmp`. The next R3 says.
   - The third run stopped at step 0: C: had 11 GB free. WSL's disk file held about 37 GB of freed space, but ext4 can write to parts of the file it never used, so only C: bounds its growth, and only compacting returns that space. You chose not to shut WSL down while sessions ran, so `--disk-floor <GB>` (5 to 15) lowers the floor for one install run and is named in its summary. `night.py` never takes it, so nights keep 15 GB: compact before the first night.
   - The fourth run (a8373026, `--disk-floor 8`) passed R1 and R2. Its R3 had one real failure, from 471: main's `studio-window.test.ts`, which this branch doesn't touch. Its second window sorted before its first, which only a clock stepping back makes; WSL's tick read 9756, then 9818. The fifth run, at the same SHA with the 15 GB floor, passed R1 to R3. R3's `make check`: 13 of 19 gates PASS; known: policy (P-12), matrix (11 stage-S rows), image. R4 failed six rows. Each was refused, but with an error that proved nothing about the mount, so none was a gap:
     - **Four git rows** (the own commondir, CLAUDE.md, REVIEW.md, the constitution) ran `git config --file` on files that aren't git config. git refused with `bad config line` before it tried to write. The three masked files' git spelling is now `git mv`, which the mount refuses as busy. The commondir's is `git bundle create` onto it, which writes a lockfile in the session's read-write admin folder and renames it over the mask, as git's own lockfiles do, and a new `-rename` row tries the same with mv. `write-alternates-git` no longer runs config on your alternates placeholder, where a broken mask would have left a line; it writes a new name (review nit).
     - **The alternates hardlink** met your repository's empty `.git/objects/info/alternates` (dated 11-09, the sandbox's placeholder) and said `File exists`. It now links to a new name in that folder.
     - **The gitleaks config's mask row** wrote the mount's host path (the share), which the container doesn't have. Mask rows now write the path as the container sees it, and a mask in the main checkout's path is named `mask-main-…`.
     - The sixth run (f0b606dd, `--rehearse R4`) passed every row fixed above. One failed: `mask-main-gitleaks-toml` said `Permission denied`, because the runner writes that file 0444 and the kernel checks its mode before the mount. A mask row on a file whose mode already refuses writing now runs `touch -c`, which changes only the times and meets the mount check first, so only the read-only mount can refuse it (reviewed, no blocker).
     - The seventh run (cfa29548, `--rehearse R4`): **R4 ok**, with 205 rows refused, 5 absent on the host and in the container, the 1 gap row recorded, and 4 of 215 skipped. The skipped four are `.github/workflows`'s rows, absent in the rehearsal's worktree. With the fifth run's R1 to R3, T090 is done. R1 to R4 run together again at the second install (T092).
     - `--rehearse <steps>` runs only those of R1 to R4, as you asked on 2026-11-13, so a fix to R4 alone doesn't rerun R3's hour. The summary names each step not run, and no later run takes the install as rehearsed. The main pass, the second install with plan and gate on (T092), runs all four.
4. **GitHub**: push before the first night (Q17), since the objects store is writable to sessions.
5. **Merge**: after spec 001's W1 gate, unless you say otherwise. `toolchain-check` is WARN until P-8 moves the floor to 2.1.322.
6. **Patches** ([index](2026-11-12-feat-017-patches.md), with each SHA-256): **P-12 on main before this branch's gate**, or its `policy` step fails on the worker's toolchain line; P-1 only where `deploy/night-shift/` already exists, then P-5; P-6 needs your permission set's name in its one local; P-7 on main, with each licence and `outputs_ship` set by you (nothing ships until one is true); plan and gate stay off until P-2, P-3, and P-6 merge and a second install sets `NIGHT_PLAN=on` and `NIGHT_GATE=on` (T092).
7. **Questions, each with a recommendation**:
   - Commit identity for night commits (Q18): **answered 2026-11-13**, "let's use "night-<role>@night-shift.h4reet-ai" as the commit author". Done on this branch.
   - The pilot's size (Q14): **answered 2026-11-13**, "Let's run 4": `NIGHT_WORKERS=4` in your facts file. The pilot is your ordered list from that day, given to the supervisor through `orders.md` (spec Clarifications; FR-036). Before T091: an install from this branch's new tip (`--rehearse R1`, since the runner and prompts changed), then `orders.md` and `NIGHT_WORKERS=4` beside your facts, then `night.py start`. The night drafts each item's intent, spec, and plan for one approval each (spec Assumptions names that deviation).
   - The disk floor: 15 GB free on `/` and `/mnt/c`, checked at install step 0 and before every task (b97c21dd). It was 30 GB, from the October rule's margin, and your first install stopped at R1 with 20 GB on C:. Spec 001's measure run keeps its own 30 GB check (`2026-11-10-feat-001-measure.md`), which this doesn't change; a night writes about 0.5 GB per worktree. **Recommended: 15 GB for the night shift**, and compact WSL's disk when it's convenient, since C: shrinks with every build.
   - Telemetry: **recommended: none for this build-time tool.** Its record is the decision page, `installed.txt`, and the egress log. If you want a dashboard panel, it would be a follow-up spec.
8. **Seen on the way**: `git rev-list --all` fails in your checkout with `fatal: bad object refs/replace`, a ref or file named `refs/replace` itself. Replace objects are off everywhere this branch reads, but you may want to look at it.
