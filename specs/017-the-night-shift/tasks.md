# Tasks: The night shift

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: required. The spec's FR-035 and the constitution's Principle II apply: tests are written first, RED then GREEN, one commit each.

**Re-planned 2026-11-12 around containers** (the Author: "Yes, let's re-plan around containers and ensure setup-token can work with the Subscription Ultra Plan and doesnt require API credits"). The nono tasks are gone; the nono probe stays as the record.

**Groups**: plan §12's G1 to G6, each reviewed by a reviewer agent that didn't write it (FR-035). Branch `feat/017-the-night-shift`, in a worktree under `$TMPDIR` with a save-point commit per task.

**Rules for every task**:
- Protected paths only as patches built from plain copies. That means `git show refs/heads/main:<path>`, an edit, then `diff -u` with `a/` and `b/` labels. Each patch is verified with `patch -p1` on a fresh `git archive` export. Never `git apply`, never a write into a worktree.
- No heredoc whose text names a bash-gate word: write files with the Write tool.
- Test values that look like 64-hex secrets are built at run time.
- This session can't run Docker. Every container claim is a test of the runner's command lines here, proven later by the Author's probe and rehearsal.

## Phase 0: The Author

- [ ] T000 The Author approves `plan.md`, with his answers to the open questions (Q3, Q4, Q6, Q7, Q10, Q13 to Q16). He commits `intent/017-the-night-shift.md` (in his checkout, uncommitted), and makes the night-shift token (`claude setup-token`, into `~/.config/h4reet-ai/night-shift/claude.env`, 0600). He turns extra usage off in his account, runs the container probe at the runbook's SHA, and tells the session the report's path. **If the probe's first line is `BOUNDARY: FAILED`, everything stops (his Q8).** No task below starts before `BOUNDARY: holds` and `PLAN-ONLY: yes`.

## Phase 1: Setup

- [ ] T001 Create `feat/017-the-night-shift` from `spec/017-the-night-shift`'s reviewed tip, in a worktree. Record the container probe's rows in `specs/017-the-night-shift/research.md`: whether Claude Code's sandbox starts inside a container, the engine forwarder, and the GPU runtime.
- [ ] T002 Pin the night images' bases by digest, and Claude Code at `CLAUDE_VERSION`, in `deploy/night-shift/images/pins.json`. The pins are read by `install.sh` and checked by P-8.
- [ ] T003 Add `deploy/night-shift` to `PYTEST_DIRS` in `Makefile`. `deploy/night-shift/tests/` has no `conftest.py`; tests load modules by path, as `tools/gates/test/` does.

## Phase 2: G1, the runner (US3, P1)

**Goal**: the supervisor and up to ten workers, locks, save points, the weekly resume, idle stop, the page, and the requests, with every `docker run` line built and checked without an engine. **Independent test**: `pytest deploy/night-shift/tests/test_runner.py` with a stub `docker` and stub streams.

- [ ] T010 [P] [US3] RED: the queue's validation per contracts/queue.md: `id` matches `[a-z0-9-]{3,40}` and is unique; `role` and `locks` come from their sets; no cycle; `base` is a full ref or a 40-hex SHA; a refused file keeps the last good one.
- [ ] T011 [P] [US3] RED: scheduling. At most ten run at once with fifteen ready; locks serialise (two GPU tasks); `after` waits; starts are staggered by 10 s (a fake clock); before a `gpu` task the disk and memory checks rerun, and a failure leaves it queued with a page line.
- [ ] T012 [P] [US3] RED: a stub stream's usage-limit event with a reset time stops all containers. The runner sleeps once until the reset plus 300 s (one sleep call on a fake clock, no other timer) and requeues. A limit with no time stops the night and writes the page line.
- [ ] T013 [P] [US3] RED: the idle stop. Silent for 15 minutes with a clean worktree means stopped and recorded; a dirty worktree isn't stopped; a session that ends dirty is recorded, not committed for.
- [ ] T014 [P] [US3] RED: the preflight of contracts/runner.md §2:
  - a spec with the example marker or outside the live folder;
  - a SHA-256 mismatch;
  - a token file that isn't 0600 or not exactly one `CLAUDE_CODE_OAUTH_TOKEN=` line;
  - an API-billing variable in the runner's environment;
  - a network that isn't internal;
  - low disk or memory;
  - a second runner.

  Each refuses with one line, and the token's value appears in no output.
- [ ] T015 [P] [US3] RED: the `docker run` line of contracts/runner.md §3 for every role:
  - `--cap-drop ALL`, `no-new-privileges`, `--read-only`, the limits, the internal network, and `--env-file` for the token;
  - none of FR-041's variables, and no `--bare`;
  - every never-mounted path absent, and every mask of contracts/containers.md §4 present.
- [ ] T016 [P] [US3] RED: requests (contracts/runner.md §5):
  - plan or gate while off: refused with "off: waiting for P-2, P-3, P-6";
  - a gate (on, with a stub) only while `REPO`'s HEAD is `refs/heads/main` and clean, never `--prove`, under the gate lock;
  - a plan (on, with a stub) writes its credentials file 0600 and deletes it after;
  - `comfyui start` only under a studio task's GPU lock, each parameter checked against the allowlist;
  - an unknown kind is refused.
- [ ] T017 [P] [US3] RED: the decision page (contracts/decision-page.md). Its sections come in order; each question appears once, with a recommended answer and the task it blocks; the runner appends only under `## The runner`.
- [ ] T018 [US3] GREEN: `deploy/night-shift/runner/night.py` (standard library, `python3 -I -B`), with `start`, `stop`, `status`, and `check`.
- [ ] T019 [P] [US3] `deploy/night-shift/runner/prompts/{supervisor,spec-writer,implementer,reviewer,red-teamer,ops,gate-runner,studio}.md`. Each states its role's limits, the save point before each step, how to ask for a plan, a gate, or ComfyUI, and that questions go to the decision page with a recommended answer.
- [ ] T020 [P] [US3] `deploy/night-shift/claude/<role>.settings.json`: `forceLoginMethod: "claudeai"`, no `apiKeyHelper`, each role's permission mode, and Claude Code's sandbox on or off per the probe's `claude-sandbox-in-container` row. A test checks `forceLoginMethod` in every layer.
- [ ] T021 [US3] Review G1; fix blockers; backlog the rest.

## Phase 3: G2, images and container specs (US2, P1)

**Goal**: the four images and ten specs, each in its lattice parent, none mounting a never-mounted path, every writing spec masked over main's human-only paths. **Independent test**: `pytest deploy/night-shift/tests/test_containers.py`.

- [ ] T030 [P] [US2] RED: `deploy/night-shift/tests/test_containers.py`, covering contracts/containers.md 1 to 11: shape, never-mounted paths and their ancestors, the masks computed from `refs/heads/main:.claude/settings.json`, the environment rules, `forceLoginMethod` in every layer, internal networks only, placeholders, the example marker, and `build.py --check`.
- [ ] T031 [P] [US2] RED: the lattice (plan §2), mount by mount, network by network, with the runner's task mounts.
- [ ] T032 [US2] GREEN: `deploy/night-shift/containers/fragments.json`, `build.py`, and the ten specs.
- [ ] T033 [P] [US2] `deploy/night-shift/images/worker.Dockerfile`: the devcontainer's base and toolchain, with Claude Code at the pin, `jq`, `socat`, and the role layers at `/night/settings-<role>.json`. `egress.Dockerfile`: `python:3.12-slim` by digest, with main's `egress-proxy.py` copied in at build time from `git show refs/heads/main:deploy/agents-engine/egress-proxy.py`.
- [ ] T034 [P] [US4] `deploy/night-shift/images/studio.Dockerfile` (Claude Code, Blender 5.2.3 at its published checksum, as `oc-studio-agent.sh` does) and `comfyui.Dockerfile` (Ubuntu 24.04, whose Python 3.12 runs his `~/flux-env` read-only).
- [ ] T035 [US2] `deploy/night-shift/allowlist.json` in settings shape. The night list is main's `allowedDomains` plus `api.anthropic.com`. `allowlist-studio.json` holds `api.anthropic.com` alone, and `allowlist-plan.json` the AWS hosts `infra/` uses. A test checks each list's shape with main's `egress-proxy.py --list`.
- [ ] T036 Review G2; fix blockers; backlog the rest.

## Phase 4: G3, the studio line (US4, P2)

- [ ] T040 [P] [US4] RED: `scripts/studio/test_line.py`, brief cases. A valid brief passes; each of these fails with one line naming the field: `round` must be 1 to 3; a limit above `caps.json`; a tool not `outputs_ship: true`; a missing field.
- [ ] T041 [P] [US4] RED: candidate cases, on a GLB built in the test with `struct` and `json`:
  - over triangles, bytes, or texture pixels;
  - a missing required bone or clip;
  - a tool outside the brief;
  - a record step naming Qwen-Image-2.1 or FLUX [dev], refused even if listed;
  - a file named but absent.
- [ ] T042 [P] [US4] RED: rounds. After three failed rounds `line.py round` prints `decide`, and `line.py brief` refuses a round 4.
- [ ] T043 [US4] GREEN: `scripts/studio/line.py`.
- [ ] T044 [US4] The arrival check's step: `line.py candidate` ends by running main's `tools/gates/arrival_check.py`, read from `refs/heads/main` by `git cat-file` and run as `python3 -I -B` from a temp file, on a scratch repository. A test uses a stand-in arrival check.
- [ ] T045 [US4] The ComfyUI allowlist: `deploy/night-shift/comfyui-params.json`, seeded from `start-comfyui.sh` and his answer to Q15, with `--listen`, `--port`, and the folder flags fixed by the runner, never by the agent.
- [ ] T046 Review G3; fix blockers; backlog the rest.

## Phase 5: G4, red-team rows and the install (US1, P1; US2)

- [ ] T050 [P] [US2] `redteam/night-shift/rows.json` and `run.sh`: the rows of plan §9, each with `id`, `role`, the command, the expected refusal, `layer`, and `rehearsal: true|false`. It includes the gap row for the token in a command's environment, with its bounds.
- [ ] T051 [P] [US2] RED: `deploy/night-shift/tests/test_rows.py`. Every never-mounted path and every forbidden write has rows for each spelling in CLAUDE.md's list (`git -C`/`-c`, `bash -c`, a subshell, quoting, config or API equivalents) plus a symlink and a hard link, and every row names a role that exists.
- [ ] T052 [P] [US1] RED: `deploy/night-shift/tests/test_install.py`, with a stub `docker` and `git` and a fake `$HOME`:
  - it refuses a SHA that doesn't resolve, a facts file missing a key, a token file of the wrong mode or shape, and a base whose digest differs (installs nothing);
  - it reads only by `git show`;
  - it fills placeholders and refuses a leftover;
  - files are 0444 and folders 0555;
  - the R-steps run in order, and a failure stops with `install: FAILED at <step>`;
  - the summary holds no planted secret (a fake `~/.aws/credentials`, and the token file's value);
  - the first install refuses while `/srv/studio/outputs` holds a file, printing only the count;
  - a second run prints `unchanged`;
  - `--undo` leaves the fake home as it was, but the token and facts files, which it names.
- [ ] T053 [P] [US1] RED: `deploy/night-shift/tests/test_container_probe.py`, the container probe with a stub `docker`. It writes only in its folder, removes its containers and networks on success and on failure, passes the token only by `--env-file`, prints no planted secret, and ends with every row of contracts/probe.md §2.
- [ ] T054 [US1] GREEN: `deploy/night-shift/install.sh` per plan §6 and contracts/install.md.
- [ ] T055 Review G4; fix blockers; backlog the rest.

## Phase 6: G5, ADRs, docs, the plan role, the patches (US5, US6, P2)

- [ ] T060 [P] `docs/adr/0050-containers-around-every-agent-session.md` (with the nono evaluation), `docs/adr/0051-agents-plan-and-run-the-gate.md`, and `docs/adr/0052-the-studio-line.md`, with plan §11's content and the Author's words verbatim. Add their rows to `docs/adr/README.md`, and renumber if W1 has claimed them by then.
- [ ] T061 [P] `docs/how-we-build/night-shift.md` and `docs/runbooks/night-shift.md` (start, stop, status, resume, undo, the token's renewal and revocation, the second install).
- [ ] T062 [P] [US5] RED: `infra/test/test_account.py` gains `h4-agent-plan`'s tests:
  - trust only the Author's Identity Center permission-set role, with a one-hour maximum session;
  - `ReadOnlyAccess`, minus decrypted parameter and secret reads, plus `s3:PutObject` and `s3:DeleteObject` on `*.tflock` only;
  - the tags.
- [ ] T063 [US5] P-6: `infra/account/iam.tf`'s role, as a patch, verified on an export where T062 passes.
- [ ] T064 P-1: `.claude/settings.json` (`deploy/night-shift/**` human-only, `CLAUDE_CODE_OAUTH_TOKEN` among the denied variables) and `.claude/hooks/protected-paths.sh`.
- [ ] T065 [US5] [US6] P-2: `CLAUDE.md`'s Infra and Verifying lines, within 6,144 bytes and 60 lines (R-13), checked with main's `evals/agent-config/static.py` on the export.
- [ ] T066 [US5] [US6] P-3: `.claude/agents/supervisor.md`, `studio.md`, `gate-runner.md`, and `ops.md`'s plan request.
- [ ] T067 [US5] P-4: `.claude/hooks/bash-gate.sh`'s `make plan ROOT=` message names the night shift's route.
- [ ] T068 P-5: `redteam/forbidden-actions.sh` rows for P-1, and stage S's container rows if R3 shows they're needed; and `tools/gates/matrix-required.txt`.
- [ ] T069 [US4] P-7: `assets/policy/studio-tools.json`, from his ComfyUI install, each entry's licence from `licenses.json`, with Qwen-Image-2.1 and FLUX [dev] at `outputs_ship: false`.
- [ ] T070 P-8: `tools/gates/toolchain_check.py` checks the night images' Claude Code pin.
- [ ] T071 P-10: `tools/gates/gate`'s agent-config-evals trigger gains `deploy/night-shift/claude/` and `deploy/night-shift/runner/prompts/`, with its test.
- [ ] T072 P-9: `.specify/memory/constitution.md` 1.2.0 (the roles list), if Q10's answer is "amend".
- [ ] T073 Review G5; fix blockers; backlog the rest.

## Phase 7: G6, the note and verification

- [ ] T080 `make lint`, `make test`, `make evals` (and `make check ENGINE_MODE=none-yet`) in the worktree; paste each whole output into the note. Run `gitleaks` over the branch.
- [ ] T081 `docs/merge-requests/<date>-feat-017-the-night-shift.md`: the template's sections, every patch with its SHA-256, the reviews' findings and backlog, and the Author's steps.
- [ ] T082 The install-and-rehearse runbook artifact: the guard on the reviewed SHA, then the one command, in lines of 45 characters or fewer.

## Phase 8: After his run (US1, then US7)

- [ ] T090 [US1] Read his summary; fix each failure on the branch, test-first; a new reviewed SHA and a new script, until R1 to R4 are `ok`.
- [ ] T091 [US7] The pilot: the Resume stream's first queue, at two or three workers (Q14), under the supervisor. The morning page counts each interruption with its cause (SC-004), and his usage page shows the plan, not API charges.
- [ ] T092 [US5] [US6] After P-2, P-3, and P-6 merge and the role is applied: the second install, with `NIGHT_PLAN=on` and `NIGHT_GATE=on`, then R5 and R6.

## Dependencies

- T000 → everything. T001 → T020 (the sandbox row) and T033 (the probe's facts).
- G1 needs only the spec shapes (contracts/containers.md), so it starts first; the Resume pilot can run under today's Claude Code sandbox after G1.
- G2 → G4 (the install builds the images and copies the specs). G3 is independent of G2 but T034.
- G5's patches need G1 to G4 final. G6 last. Phase 8 after his run.

## Parallel opportunities

- RED tests within a group ([P]), in separate files.
- G1 and G3 in two worktrees at once.
- G5's ADRs and docs alongside G4.

## Implementation strategy

The MVP is US1 with US2: the images, the specs, and the install-and-rehearse script, which prove the container boundary on his machine. US3 (the runner) makes it a night shift, and it comes first because the most work hangs on it. US4 makes it a studio line. US5 and US6 turn on when his patches merge. US7 is the pilot.

## Analysis, 2026-11-12 (`/speckit-analyze`, then the session's fixes)

| ID | Severity | Finding | Fixed in |
|---|---|---|---|
| D1 | CRITICAL (constitution) | The fallback layering left agent egress to non-allowlisted hosts unenforced, against "Prohibited without a human: … network egress to non-allowlisted domains from an agent session" | FR-013 (no layering may leave it unenforced); then the Author's Q8 answer removed the fallback: if the nesting fails, the work stops for his choice, and plan §1's candidate A carries the allowlisting proxy |
| D2 | HIGH (constitution) | Prompts, settings layers, and the studio hook outside `.claude/`, which the constitution names for role definitions and hooks | spec Assumptions (deviation, named); P-10 (T070a); Q13 |
| I1 | HIGH | FR-011 "every profile" contradicted the plan and gate requests' own needs | FR-011 (session profiles), FR-039; contracts/profiles.md §11 |
| I2 | HIGH | US2 #5 and US4 #5 promised refusals by host, which Landlock can't give | both scenarios reworded |
| C1 | MEDIUM | FR-023 (the decision page) had no test | T026b |
| C2 | MEDIUM | FR-031's preflight ran only at start | contracts/runner.md §3; T021 |
| A1 | LOW | FR-022's idle limit had no value | FR-022: 15 minutes |
| A2 | LOW | the lattice's "ceiling" was undefined | contracts/profiles.md §10 |

Coverage: 39 requirements (FR-001 to FR-039), each with at least one task. No duplications. After the fixes: no critical issue remains.

The probe's review (a reviewer agent, read-only, on 57988e67) is in research.md R-14; its two blockers and its Important findings are fixed in `deploy/night-shift/probe.sh`. Backlog: FR-002 says "a header per command"; the probe gives one per section and a `--` line per command (the Author's call).

### Re-analysis after the container re-plan (2026-11-12)

| ID | Severity | Finding | Fixed in |
|---|---|---|---|
| R1 | HIGH | With Claude Code's sandbox possibly off inside containers, the agent could edit `.claude/` or the hooks in its own worktree by Bash | plan §1: read-only binds over every path main's settings deny writing (contracts/containers.md §4; T015, T030) |
| R2 | HIGH | The egress proxy refuses `198.18.0.0/15`, so containers couldn't reach the agents' engine for `make check` | plan §1: `engine-fwd`, a forwarder to `198.18.0.1:2376` alone |
| R3 | MEDIUM | The token is readable by a container's own commands | plan §13: named, bounded, a gap row; hidden if Claude Code's sandbox starts in the container |
| R4 | MEDIUM | Stage S may fail inside containers for want of Claude Code's masks | plan §13 and P-5; R3 of the rehearsal shows which rows |
| R5 | LOW | Q9, Q11, and Q12 were nono's | closed in plan's Questions |

Coverage: FR-001 to FR-041, each with at least one task. No critical issue remains.
