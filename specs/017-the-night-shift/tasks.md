# Tasks: The night shift

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: required. The spec's FR-035 and the constitution's Principle II apply: tests are written first, RED then GREEN, one commit each.

**Groups**: plan §12's G1 to G6, each reviewed by a reviewer agent that didn't write it (FR-035). Branch `feat/017-the-night-shift`, in a worktree under `$TMPDIR` with a save-point commit per task (plan, "Also for the Author").

**Rules for every task**:
- Protected paths only as patches built from plain copies. That means `git show refs/heads/main:<path>`, an edit, then `diff -u` with `a/` and `b/` labels. Each patch is verified with `patch -p1` on a fresh `git archive` export. Never `git apply`, never a write into a worktree.
- No heredoc whose text names a bash-gate word: write files with the Write tool.
- Test values that look like 64-hex secrets are built at run time.

## Phase 0: The Author

- [ ] T000 The Author approves `plan.md`, with his answers to the Questions for the Author (Q1 to Q12). He commits `intent/017-the-night-shift.md` (in his checkout, uncommitted), runs the probe at the runbook's SHA, and tells the session the report's path. **No task below starts before this.**

## Phase 1: Setup

- [ ] T001 Create `feat/017-the-night-shift` from `spec/017-the-night-shift`'s reviewed tip, in a worktree, and record the probe's facts that shape the build in `research.md`: Landlock ABI, nesting result, mask result, ComfyUI port and listing, Claude Code's flags, and nono's checksum and schema. Update R-01 to R-08's "unconfirmed" rows from them, in `specs/017-the-night-shift/research.md`.
- [ ] T002 Pin nono: `NONO_VERSION` and `NONO_SHA256` (the probe's checksum, confirmed against GitHub's digest) in `.devcontainer/toolchain.vars`.
- [ ] T003 Add `deploy/night-shift` to `PYTEST_DIRS` in `Makefile`. `deploy/night-shift/tests/` has no `conftest.py`: the tests load modules by path, as `tools/gates/test/` does.

## Phase 2: Foundational, G1 the profiles (US2, P1)

**Goal**: eight profiles, each complete, each in its lattice parent, each refusing the never-readable paths. **Independent test**: `pytest deploy/night-shift/tests/test_profiles.py`.

- [ ] T010 [P] [US2] RED: `deploy/night-shift/tests/test_profiles.py`, covering every point of contracts/profiles.md 1 to 10:
  - each file is valid JSON with no `extends`;
  - every deny of §3 is in every profile;
  - no grant is an ancestor of a deny, or one of §4's forbidden grants;
  - no write grant of §5;
  - ports exactly as plan §2's table;
  - only §8's placeholders;
  - the example marker;
  - `build.py --check` is clean.
- [ ] T011 [P] [US2] RED: `deploy/night-shift/tests/test_lattice.py`. For every edge in plan §2, each child grant (by access: read under read or allow, write under write or allow) is covered by a parent grant, after expanding placeholders and `$WORKDIR`. Ports and command policies are subsets. The runner's task grants (contracts/runner.md §3) count as the role's.
- [ ] T012 [P] [US2] RED: in the same file, no profile grants a path that a glob of `.claude/settings.json`'s `denyRead`, `denyWrite`, or `Read(...)` denies (read from `refs/heads/main` by `git cat-file`).
- [ ] T013 [US2] GREEN: `deploy/night-shift/profiles/fragments.json` and `deploy/night-shift/profiles/build.py`, written against the probe's `profile schema` (T001). `build.py` writes the eight `deploy/night-shift/profiles/<role>.json` files and supports `--check`.
- [ ] T014 [US2] GREEN: the command policies of plan §3 in the fragments: `terraform`, `docker`, `make` `check`, and `blender`, with `executable` pinned by placeholder. The plan and gate requests are in no profile.
- [ ] T015 [US2] Review G1 (a reviewer agent, read-only); fix blockers; backlog the rest in the note.

## Phase 3: G2 the runner (US3, P1)

**Goal**: the supervisor and up to ten workers, locks, save points, the weekly resume, idle stop, the page. **Independent test**: `pytest deploy/night-shift/tests/test_runner.py` with stub `nono` and `claude`.

- [ ] T020 [P] [US3] RED: the queue's validation per contracts/queue.md: `id` matches `[a-z0-9-]{3,40}` and is unique; `role` and `locks` come from their sets; no cycle; `base` is a full ref or a 40-hex SHA; a refused file keeps the last good one. In `deploy/night-shift/tests/test_runner.py`.
- [ ] T021 [P] [US3] RED: scheduling. At most ten at once with fifteen ready. A lock is held by one task at a time (two GPU tasks serialise). `after` waits. Starts are staggered by 10 s (a fake clock). Before a `gpu` task starts, the disk and memory checks run again, and a failure leaves it queued with a page line (FR-031).
- [ ] T022 [P] [US3] RED: a stub stream's usage-limit event with a reset time stops all workers. The runner sleeps once until the reset plus 300 s (fake clock, one sleep call, no other timer) and requeues. A limit with no time stops the night and writes the page line.
- [ ] T023 [P] [US3] RED: the idle stop. Silent for 15 minutes, a clean worktree, and no child process mean stopped and recorded. A dirty worktree is not stopped. A worker that ends dirty is recorded and not committed for.
- [ ] T024 [P] [US3] RED: the preflight of contracts/runner.md §2. It refuses a profile with the example marker, a profile outside `~/.config/h4reet-ai/nono/`, a SHA-256 mismatch, low disk or memory, and a second runner.
- [ ] T025 [P] [US3] RED: the session command line of contracts/runner.md §3. It holds exactly the listed environment, and nothing from a planted `ANTHROPIC_API_KEY` or `AWS_*` in the runner's own environment. Under `LAYERING=fallback` it starts with the `unshare` wrapper and the mask list.
- [ ] T026 [P] [US3] RED: requests (contracts/runner.md §5). A plan or gate request while off is refused with "off: waiting for P-2, P-3, P-6". An unknown kind is refused. When on (a stub), the gate runs from `GATE_CHECKOUT` without `--prove`, under the gate lock.
- [ ] T026a [P] [US3] RED: the allowlisting proxy (contracts/runner.md §3). `CONNECT` to an allowlisted host:port is passed; any other host or port is refused with a page line; absolute-form HTTP is refused except to `127.0.0.1:<COMFYUI_PORT>` for the studio role. The mask-and-bridge script's command line under `LAYERING=fallback` is exactly the contract's.
- [ ] T026b [P] [US3] RED: the decision page (contracts/decision-page.md). Its sections come in order; each question appears once, with a recommended answer and the task it blocks; the runner appends only under `## The runner`.
- [ ] T027 [US3] GREEN: `deploy/night-shift/runner/night.py` (standard library, `python3 -I -B`), with `start`, `stop`, `status`, and `check`.
- [ ] T028 [P] [US3] `deploy/night-shift/runner/prompts/{supervisor,spec-writer,implementer,reviewer,red-teamer,ops,gate-runner,studio}.md`: each says its role's limits, that it commits a save point before each step, how it asks for a plan or a gate, and that questions go to the decision page with a recommended answer (contracts/decision-page.md).
- [ ] T029 [P] [US3] `deploy/night-shift/claude/<role>.settings.json`: each role's Claude Code settings layer. It holds the permission mode, the sandbox on or off by layering (two variants), and, for the studio, the ComfyUI route rule's hook (Q11).
- [ ] T030 [US3] Review G2; fix blockers; backlog the rest.

## Phase 4: G3 the studio line (US4, P2)

**Goal**: briefs, candidates, three rounds, the tools list. **Independent test**: `pytest scripts/studio/test_line.py` with fixture GLBs built at run time.

- [ ] T040 [P] [US4] RED: `scripts/studio/test_line.py`, brief cases. A valid brief passes. Each of these fails with one line naming the field: `round` must be 1 to 3; a limit above `caps.json`; a tool not `outputs_ship: true`; a missing field.
- [ ] T041 [P] [US4] RED: candidate cases, on a GLB built in the test (the standard library's `struct` and `json`):
  - over triangles, bytes, or texture pixels;
  - a missing required bone or clip;
  - a tool outside the brief;
  - a record step naming Qwen-Image-2.1 or FLUX [dev], refused even if listed;
  - a file named in `candidate.json` but absent.
- [ ] T042 [P] [US4] RED: rounds. After three failed rounds, `line.py round` prints `decide`, and `line.py brief` refuses a round 4.
- [ ] T043 [US4] GREEN: `scripts/studio/line.py`.
- [ ] T044 [US4] The arrival check's step: `line.py candidate` ends by running main's `tools/gates/arrival_check.py` on a scratch repository (read from `refs/heads/main` by `git cat-file`, run as `python3 -I -B` from a temp file), with a test using a stand-in arrival check.
- [ ] T045 [US4] Review G3; fix blockers; backlog the rest.

## Phase 5: G4 the red-team rows and the install (US1, P1; US2)

**Goal**: the Author's one script, and the refusals it proves. **Independent test**: `pytest deploy/night-shift/tests/test_install.py` with stub binaries and a fake `$HOME`.

- [ ] T050 [P] [US2] `redteam/night-shift/rows.json`: the rows of plan §9, each with `id`, `profile`, the command, the expected refusal, `layer`, and `rehearsal: true|false`. Each row of a host not on the allowlist names the layer that must refuse it (FR-013). There's a gap row for nono's lost `dangerous_commands` with command policies (#2247), and a row that a command's `printenv` doesn't show `CLAUDE_CODE_OAUTH_TOKEN`. `redteam/night-shift/run.sh` runs the rehearsal rows under a named profile, one line each.
- [ ] T051 [P] [US2] RED: `deploy/night-shift/tests/test_rows.py`. Every never-readable path and every forbidden write has rows for each spelling in CLAUDE.md's list: `git -C`/`-c`, `bash -c`, a subshell, quoting, config or API equivalents, plus a symlink and a hard link. Every row names a profile that exists.
- [ ] T052 [P] [US1] RED: `deploy/night-shift/tests/test_install.py`, with stubs on `PATH` and a fake `$HOME`:
  - it refuses a SHA that doesn't resolve, a facts file missing a key, and a checksum mismatch (installs nothing);
  - it reads only by `git show` (a stub `git` logs calls; no working-tree read);
  - it fills placeholders and refuses a leftover;
  - files are 0444 and folders 0555;
  - the R-steps run in order, and a failure stops with `install: FAILED at <step>`;
  - the summary holds no planted secret (a fake `~/.aws/credentials` and a token variable);
  - a second run prints `unchanged`;
  - `--undo` leaves the fake home as it was, but nono's state and the gate checkout, which it names.
- [ ] T053 [P] [US1] RED: `deploy/night-shift/tests/test_probe.py`, the probe with stubs. It writes nothing outside its temp folder (a fake `$HOME` compared before and after), prints no planted secret, and ends with every summary key of contracts/probe.md.
- [ ] T054 [US1] GREEN: `deploy/night-shift/install.sh` per plan §6 and contracts/install.md, with R2's layering choice per Q8's answer.
- [ ] T055 [US1] GREEN: any probe fixes T053 finds, in `deploy/night-shift/probe.sh`.
- [ ] T056 Review G4; fix blockers; backlog the rest.

## Phase 6: G5 ADRs, docs, the plan role, the patches (US5, US6, P2)

- [ ] T060 [P] `docs/adr/0050-nono-as-the-build-time-sandbox.md`, `docs/adr/0051-agents-plan-and-run-the-gate.md`, `docs/adr/0052-the-studio-line.md`, with plan §11's content and the Author's words verbatim. Add their rows to `docs/adr/README.md`. Renumber if W1 has claimed 0050 to 0052 by then.
- [ ] T061 [P] `docs/how-we-build/night-shift.md` (how it works, cold) and `docs/runbooks/night-shift.md` (start, stop, status, resume, undo, the second install).
- [ ] T062 [P] [US5] RED: `infra/test/test_account.py` gains `h4-agent-plan`'s tests:
  - trust: only the Author's Identity Center permission-set role, with a one-hour maximum session;
  - permissions: `ReadOnlyAccess`, minus decrypted parameter and secret reads, plus `s3:PutObject` and `s3:DeleteObject` on `*.tflock` only;
  - tags: project, environment, component.
- [ ] T063 [US5] P-6: `infra/account/iam.tf`'s role, as a patch (it's protected), verified on an export where T062 passes.
- [ ] T064 P-1: `.claude/settings.json` (`deploy/night-shift/**` in the human-only lists, `CLAUDE_CODE_OAUTH_TOKEN` in the denied variables) and `.claude/hooks/protected-paths.sh` (`deploy/night-shift/*` blocked), as one patch.
- [ ] T065 [US5] [US6] P-2: `CLAUDE.md`'s Infra and Verifying lines, at or under 6,144 bytes and 60 lines (R-13), checked with main's `evals/agent-config/static.py` on the export.
- [ ] T066 [US5] [US6] P-3: `.claude/agents/supervisor.md`, `studio.md`, `gate-runner.md`, and `ops.md`'s plan-request line.
- [ ] T067 [US5] P-4: `.claude/hooks/bash-gate.sh`'s `make plan ROOT=` message names the night shift's route; the rule is unchanged.
- [ ] T068 P-5: `redteam/forbidden-actions.sh` rows for P-1, and `tools/gates/matrix-required.txt`. Verified with the matrix on the export.
- [ ] T069 [US4] P-7: `assets/policy/studio-tools.json`, from the probe's ComfyUI listing, each entry's licence from `licenses.json`, with Qwen-Image-2.1 and FLUX [dev] at `outputs_ship: false`. Entries whose licence he hasn't read are marked for him.
- [ ] T070 P-8: `tools/gates/toolchain_check.py` checks nono's pin.
- [ ] T070a P-10: `tools/gates/gate`'s agent-config-evals trigger gains `deploy/night-shift/claude/` and `deploy/night-shift/runner/prompts/` (Q13), with its test in `tools/gates/test/test_gate.py`, on the export.
- [ ] T071 P-9: `.specify/memory/constitution.md` 1.2.0 (the roles list), only if Q10's answer is "amend", with its ADR line.
- [ ] T072 Review G5; fix blockers; backlog the rest.

## Phase 7: G6 the note and verification

- [ ] T080 `make lint`, `make test`, `make evals` (and `make check ENGINE_MODE=none-yet`) in the worktree; paste each whole output into the note. Run `gitleaks` over the branch.
- [ ] T081 `docs/merge-requests/<date>-feat-017-the-night-shift.md`: the template's sections, every patch with its SHA-256, and the reviews' findings and backlog. Add the Author's steps.
- [ ] T082 The install-and-rehearse runbook artifact: the guard on the reviewed SHA, then the one command, in lines of 45 characters or fewer.

## Phase 8: After his run (US1, then US7)

- [ ] T090 [US1] Read his summary. Fix each failure on the branch, test-first; a new reviewed SHA and a new runbook script. Repeat until R1 to R6 are `ok`.
- [ ] T091 [US7] The pilot: the Resume stream's first queue (improvement b's intent, then its spec), under the supervisor. The morning page counts each interruption with its cause (SC-004).
- [ ] T092 [US5] [US6] After P-2, P-3, and P-6 merge and the role is applied: the second install, with `NIGHT_PLAN=on` and `NIGHT_GATE=on`, and R7 and R8.

## Dependencies

- T000 → everything.
- T001 → T002, T013 (the schema) and T054 (the layering).
- G1 (T010 to T015) → G2's T024 and T025 (profiles exist), and G4's T050 to T054.
- G2 and G3 are independent of each other once G1's files exist.
- G4's T054 needs G1 to G3's files (the install copies them).
- G5's patches need G1 to G4 final (P-1's path list, P-5's rows).
- G6 last. Phase 8 after his run.

## Parallel opportunities

- RED tests within a group ([P]), in separate files.
- G2 and G3 in two worktrees at once.
- G5's ADRs and docs alongside G4.

## Implementation strategy

The MVP is US1 with US2: profiles plus the install-and-rehearse script, which prove nono on his machine. US3 (the runner) makes it a night shift. US4 makes it a studio line. US5 and US6 turn on when his patches merge. US7 is the pilot.

## Analysis, 2026-11-12 (`/speckit-analyze`, then the session's fixes)

| ID | Severity | Finding | Fixed in |
|---|---|---|---|
| D1 | CRITICAL (constitution) | The fallback layering left agent egress to non-allowlisted hosts unenforced, against "Prohibited without a human: … network egress to non-allowlisted domains from an agent session" | FR-013, FR-037; plan §1; research R-07, R-08; contracts/runner.md §3; T026a: the fallback's own network namespace, whose one way out is the runner's allowlisting proxy |
| D2 | HIGH (constitution) | Prompts, settings layers, and the studio hook outside `.claude/`, which the constitution names for role definitions and hooks | spec Assumptions (deviation, named); P-10 (T070a); Q13 |
| I1 | HIGH | FR-011 "every profile" contradicted the plan and gate requests' own needs | FR-011 (session profiles), FR-039; contracts/profiles.md §11 |
| I2 | HIGH | US2 #5 and US4 #5 promised refusals by host, which Landlock can't give | both scenarios reworded |
| C1 | MEDIUM | FR-023 (the decision page) had no test | T026b |
| C2 | MEDIUM | FR-031's preflight ran only at start | contracts/runner.md §3; T021 |
| A1 | LOW | FR-022's idle limit had no value | FR-022: 15 minutes |
| A2 | LOW | the lattice's "ceiling" was undefined | contracts/profiles.md §10 |

Coverage: 39 requirements (FR-001 to FR-039), each with at least one task. No duplications. After the fixes: no critical issue remains.

The probe's review (a reviewer agent, read-only, on 57988e67) is in research.md R-14; its two blockers and its Important findings are fixed in `deploy/night-shift/probe.sh`. Backlog: FR-002 says "a header per command"; the probe gives one per section and a `--` line per command (the Author's call).
