# Implementation Plan: The night shift

**Branch**: `spec/017-the-night-shift` (this plan), then `feat/017-the-night-shift` (the build) | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

**Status**: waiting for the Author's approval. Nothing below is built yet. The probe (§5) goes with this plan, to run in the same sitting.

## Summary

The night shift has three parts:

- **nono around every agent session.** A supervisor session and its workers each run in their own nono profile, started by one small runner outside every sandbox.
- **A queue, three locks, and one decision page.** The supervisor turns the queue into tasks. Up to ten workers at a time spec and build the Author's improvements, and anything that needs him lands on the page.
- **The studio line.** Repo agents and the studio agent pass briefs and candidates through two folders, with the intake's checks between them.

Agents build all of it inside today's sandbox. The Author runs two things: a read-only probe now, then one install-and-rehearse script read from a reviewed commit.

Four research findings change the brief's design, all named in the spec's Assumptions:

| Brief | What changes | Why |
|---|---|---|
| Profiles "each narrower than its parent" | Each profile is written out whole, and a test proves the subsets | nono's `extends` only appends (R-03) |
| `terraform plan` signed by `aws_auth` through the proxy | The plan runs in its own sandbox with the plan-only role's short-lived credentials; the IAM role is the boundary | No per-command `aws_auth`, the proxy is off on WSL2, and `endpoint_policy` can't match AWS actions (R-05, R-06) |
| Network limited to named hosts | The kernel limits TCP ports, not hosts | Landlock matches ports; the domain proxy is off on WSL2 (R-07) |
| Claude Code's sandbox nested inside nono's | May fail. The probe tests it before anything is built; if it fails, the work stops for the Author's choice (his Q8) | Landlock refuses `mount(2)` (R-08) |

## Technical Context

- **Language/Version**: Bash 5 for the probe and the install script. Python 3.12, standard library only, run as `python3 -I -B`, for the runner, the profile builder, the studio line's checks, and their tests. JSON for profiles, queue, briefs, and candidates.
- **Primary Dependencies**: nono v0.81.0 (R-01); Claude Code (the Author's installed version; the probe prints it); util-linux `unshare` and `mount` (R-08); git; the AWS CLI on the Author's side only; Blender and ComfyUI as he installed them.
- **Storage**: files only.
  - In the repository: `deploy/night-shift/`.
  - On the Author's machine, outside it:
    - `~/.config/h4reet-ai/nono/`: the live profiles;
    - `~/.config/h4reet-ai/night-shift.env`: the machine facts;
    - `~/.local/share/h4reet-ai/night-shift/`: the runner, prompts, and each role's Claude folder;
    - `~/.local/state/h4reet-ai/night-shift/`: locks and the runner's log;
    - `~/h4reet-ai/night/`: the workers' worktrees;
    - `/srv/studio/briefs`, `/srv/studio/handoff`.
- **Testing**: pytest under `deploy/night-shift/tests/` and `scripts/studio/`. `PYTEST_DIRS` already lists `deploy/` subfolders, so the Makefile line gains `deploy/night-shift`. The bash scripts get `shellcheck`, and a pytest that runs them against a fake `$HOME`, with stub `nono`, `claude`, `git`, and `aws` binaries on `PATH`, to check their order, refusals, and `--undo`. The Author's rehearsal is the integration test.
- **Target Platform**: the Author's WSL2 host, kernel 6.18, the RTX 5090.
- **Project Type**: build-time tooling. Nothing runs at runtime.
- **Performance Goals**: none beyond up to ten workers at once; the locks serialise what must be serial.
- **Constraints**:
  - the bash gate's text rules (write scripts with the Write tool, never heredocs naming guarded words);
  - CLAUDE.md's 6 KB cap (R-13);
  - protected paths only as patches built from plain copies;
  - WSL2 (no capability elevation, no Unix-socket mediation, no proxy without the insecure opt-in).
- **Scale/Scope**: eight profiles, about 600 lines of runner, about 400 lines each for the probe and the install script, two schemas, about 40 red-team rows.

## Constitution Check

*Gate: must pass before Phase 0; re-checked after design.*

| Clause | Status | Note |
|---|---|---|
| III. Intent → spec → plan before code | Pass | Intent drafted (uncommitted, his), spec and plan on `spec/017`, no code until he approves. |
| III. Only a human merges, applies, or amends | Pass | The gate runner never merges; the plan role's apply is his; the constitution patch (P-9) is his. |
| IV. Each role scoped; the implementer never reviews | Pass | One profile per role; reviewers are other agents. |
| IV. Policy in enforcement points | Pass | Kernel profiles beneath the hooks and the sandbox, with red-team rows. |
| IV. "Cloud access is short-lived and identity-based (OIDC for CI, SSO for humans)" | **Deviation, named** | Decision 1: an agent's plan uses a role assumed from his SSO session for one hour. ADR 0051. |
| IV. "No secrets … in agent context" | Pass, with a named limit | AWS credentials exist only in the plan's own process. The Claude token is in the worker's environment, hidden from its commands by Claude Code's sandbox (§13, R-05). |
| Governance: the roles listed in the constitution | **Deviation until P-9** | The supervisor, studio, and gate-runner roles aren't in its list. P-9 proposes 1.2.0 (MINOR), his to apply. |
| Development standard: "run under the project's committed … sandbox settings" | **Deviation, named** | Decision 4: the live profiles stay outside; the committed example is what they're made from. ADR 0050. |
| CLAUDE.md: the Author plans and runs the gate | **Reversed by decisions 1 and 2** | Off until his patches merge (FR-015). |
| V. Cost | Pass | No paid route; the dev-time allowance is the Claude plan's weekly limit. |
| II. Done is a checklist | Pass | Tests, the rehearsal, a how-we-build page, a runbook, and three ADRs. |

Re-checked after design: no new violation. With Claude Code's sandbox nested inside nono's, every control in force today stays in force. If the nesting fails, nothing is built until the Author chooses another approach (§1).

## Project Structure

### Documentation (this feature)

```text
specs/017-the-night-shift/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
├── checklists/requirements.md
└── contracts/
    ├── profiles.md        # each profile's grants, the lattice, placeholders
    ├── runner.md          # the runner's commands, its flags to nono, its inbox and outbox
    ├── queue.md           # queue.json
    ├── decision-page.md   # the morning page
    ├── studio-line.md     # brief.json, candidate.json, rounds, folders
    ├── probe.md           # what the probe prints
    └── install.md         # the install script's steps, summary, and --undo
```

### Source Code (repository root)

```text
deploy/night-shift/                  # human-only once P-1 merges (the example copy, decision 4)
├── probe.sh                         # §5, read-only, on this spec branch
├── install.sh                       # §6, the Author's one command
├── profiles/
│   ├── build.py                     # makes every profile from fragments.json
│   ├── fragments.json               # the shared pieces, with {{PLACEHOLDERS}}
│   └── <role>.json                  # eight profiles, generated, committed
├── runner/
│   ├── night.py                     # §4
│   └── prompts/<role>.md            # each worker's opening prompt
├── claude/<role>.settings.json      # each role's Claude Code settings layer
└── tests/                           # pytest: profiles, lattice, runner, install, probe

scripts/studio/
├── line.py                          # brief and candidate checks, the round rule
└── test_line.py

infra/account/iam.tf                 # P-6, his patch: h4-agent-plan
infra/test/test_account.py           # the role's tests (not protected)
assets/policy/studio-tools.json      # P-7, his patch: the weights and nodes list
docs/adr/0050-…, 0051-…, 0052-…      # §11
docs/how-we-build/night-shift.md     # how it works, for a reader cold
docs/runbooks/night-shift.md         # start, stop, resume, undo
redteam/night-shift/                 # §9, rows the rehearsal runs; matrix rows are P-5
```

**Structure Decision**: one folder, `deploy/night-shift/`, holds everything the Author installs, so one protection rule (P-1) covers it, and the install script reads one tree by `git show`.

## §1 The layers

```text
the Author's terminal
└─ night.py (the runner, outside every sandbox; installed from a reviewed commit)
   └─ nono run --profile ~/.config/h4reet-ai/nono/<role>.json [task grants] -- claude -p …
        └─ Claude Code: its hooks, its permissions, and its own sandbox, nested inside nono's
             └─ Bash commands (bash gate) and command policies (terraform, docker, make check, blender)
```

**The nesting comes first** (the Author's Q8: "Let's test that out first before iterating on the whole workflow"). The probe tests it before anything is built (§5, sections 15 and 16). Section 15 runs bubblewrap inside nono against a control outside. Section 16 runs a real Claude Code session, whose sandboxed Bash command runs inside nono, against the same session outside.

- **If it works**, the layers are as drawn. Each holds what it holds today, plus nono's kernel profile around the whole session:
  - Claude Code's sandbox keeps the per-command host allowlist, the Docker socket's seccomp block, and the read masks;
  - nono adds rollback, audit, the command policies, and a boundary around Claude Code itself, its hooks, and its file tools.
- **If it fails** (likely, since Landlock refuses `mount(2)` and bubblewrap mounts): **stop** ("If nesting fails, let's stop quickly and let me know as we need another approach"). The session tells him with the probe's evidence and these candidates, and builds none until he chooses:
  - **A. bubblewrap outside nono.** The runner starts each session in its own user, mount, and network namespace. It masks the Docker socket and the never-readable folders, and gives the namespace one way out, an allowlisting proxy the runner runs. Then nono runs inside, with Claude Code's sandbox off and the hooks on. Strong, but more code the Author runs, and the token becomes readable by commands.
  - **B. nono outside, Claude Code's sandbox only inside.** nono wraps only processes that need no sandbox of their own: the command policies, the runner's plan and gate requests, the studio's Blender. Sessions keep today's Claude Code sandbox, without nono around them. Simpler, but it misses "nono around every agent session".
  - **C. Claude Code's sandbox only**, as today, with the runner, queue, and locks. No nono.

## §2 The profiles

Each is one JSON file made by `build.py` from `fragments.json`. None uses `extends` (R-03). Placeholders are filled by the install from the machine facts.

The lattice: "narrower than its parent" means every grant of the child is in its parent's. The runner starts every session, so "parent" is the profile above it here, not a process:

```text
ceiling (never run: the union)
├── supervisor
├── ops ─── implementer ─┬─ spec-writer ── reviewer
│                         └─ red-teamer
├── gate-runner
└── studio
```

| Profile | Reads | Writes | TCP ports | Command policies |
|---|---|---|---|---|
| **base** (in all) | system paths Claude Code needs (`/usr`, `/etc` but the denies, `/lib*`, `/proc/self`), Claude Code's binary, the role's Claude folder, the main repository's `.git` | the role's Claude folder, `$TMPDIR` | 443 | none |
| supervisor | the night folder (all worktrees), `/srv/studio/briefs`, `/srv/studio/handoff` | its own worktree | 443 | none |
| spec-writer | its worktree | its worktree, its branch's refs and objects | 443 | none |
| reviewer | its worktree | nothing in the repository | 443 | none |
| implementer | its worktree, `/srv/studio/handoff` | its worktree, refs, objects, `/srv/studio/briefs` | 443, 2376 | `make check`, `terraform validate`, `docker` |
| red-teamer | its worktree | nothing in the repository | 443, 2376 | `make check` (for `make redteam`), `docker` |
| ops | as implementer | as implementer, its plan outbox | 443, 2376 | as implementer; **plan request: off** |
| gate-runner | its worktree | its gate outbox | 443 | **gate request: off** |
| studio | `/srv/studio/briefs`, `/srv/studio/workflows`, `/srv/studio/outputs` | `/srv/studio/handoff`, `/srv/studio/outputs` (his Q5) | 443, ComfyUI's port | `blender` |

**In every profile's denies** (none of their parents is ever granted, so nono accepts them, and refuses to start if a later allow covers one):
- `~/.aws` and `~/.ssh`;
- `~/.config/h4reet-ai` (which holds `nono/`, `env/`, `infra/`, and the engine certificate);
- `~/.config/gh`, `~/.git-credentials`, `~/.docker/config.json`;
- `/srv/studio/photos` and `/srv/studio/key`; `/srv/studio/outputs` in every profile but the studio's;
- the Author's `~/.claude` and `~/.claude.json`;
- nono's own state, which nono already refuses.

**Env, state, and plan files**: the repository's `*.env`, `*.tfstate*`, `*.tfplan`, and `*.tfvars*` live only in the folders denied above (`~/.config/h4reet-ai/env`, `~/.config/h4reet-ai/infra`) and in the main checkout's `deploy/env`. The main checkout's working tree is never granted, only its `.git`. A test checks that no profile grants a path a glob of the repository's settings denies.

**The task's grants**: the runner adds these as nono's flags, for this task only:
- `--allow` the worktree;
- `--allow` `.git/worktrees/<task>`;
- `--allow` `.git/refs/heads/night/<task>` and `.git/logs/refs/heads/night/<task>`;
- `--allow` `.git/objects` for the writing roles.

Workers commit on `night/<task>/…` branches, so a worker can move only its own refs. When a stack is done, the runner gives it its conventional name (`feat/NNN-…`) outside the sandbox. The lattice test includes these flags. `.git/hooks`, `.git/config`, `.git/info`, and `refs/heads/main` are never granted.

## §3 Command policies

| Command | Sandbox | Notes |
|---|---|---|
| `terraform` (`validate`, `fmt`, `init -backend=false`) | reads the worktree's `infra/` and the provider mirror `~/.local/share/h4reet/terraform-providers`; writes `$TMPDIR`; no TCP port | no credential; the bash gate still refuses its state-changing commands |
| `docker` | TCP 2376; reads `~/.config/h4reet/agents-engine/docker` (the relay's client folder, not `h4reet-ai`) | the relay's socat tunnel; the host's socket is masked (§1) |
| `make` with `check` | its own `$TMPDIR/make-check`; TCP 443 (npm, PyPI) and 2376 | takes the matrix lock through the runner (§4) |
| `blender` | reads Blender's folder, `/usr/lib/wsl/lib`; reads and writes `/dev/dxg`; writes `/srv/studio/outputs` and `/srv/studio/handoff`; no TCP port | `executable` pinned to the probe's path |
| plan request (off) | the runner runs it (R-06): a detached worktree, the `plan` sandbox reading the root's values file and the provider mirror, writing `~/.config/h4reet-ai/infra/{data,plans}`, TCP 443, the role's credentials via `env://` | turned on by the second install after P-2, P-3, P-6 merge |
| gate request (off) | the runner runs `tools/gates/gate <sha>` from the Author's checkout, only while its HEAD is `refs/heads/main` and it is clean (his Q1: "It can use my checkout of main"), in the `gate` sandbox: the host's Docker socket, the engine certificate (read), gitleaks, his checkout (read), its `$TMPDIR` | turned on likewise; no `--prove` (Q7) |

## §4 The runner, the queue, the locks

`night.py` (contracts/runner.md):

- **Start**: `night.py start` from the Author's terminal. It checks:
  - nono's SHA-256 against the pin;
  - each live profile's SHA-256 against what the install recorded;
  - the layering the rehearsal proved;
  - the disk and memory preflight (C: and `/` free, free memory, the 2026-10-08 thresholds).

  It then starts the supervisor: `nono run --rollback --profile ~/.config/h4reet-ai/nono/supervisor.json -- claude` with the supervisor's prompt, in `~/h4reet-ai/night/supervisor`.
- **The queue**: the supervisor writes `queue.json` in its worktree (contracts/queue.md). The runner reads it on each change, refuses an unknown role, lock, or a cycle, and starts ready tasks up to ten at once.
- **A worker**: the runner makes `~/h4reet-ai/night/<task>` (a worktree on `night/<task>/<slug>` from the task's base), then runs `nono run --rollback --profile <role>.json <task grants> -- claude -p "<prompt>" --output-format stream-json` with `CLAUDE_CONFIG_DIR` set to the role's folder and the token as nono's environment credential.
- **Locks**:
  - `matrix`, for any task whose steps run `make check` or `make matrix`;
  - `gate`, for gate requests;
  - `gpu`, for studio tasks and any `make up ENV=dev`.

  Each is a `flock(2)` the runner holds for the task's whole run. A task names its locks; the runner never guesses.
- **Save points**: every role prompt says to commit `wip(<task>): <step>` before each step. When a worker ends, the runner checks its worktree and, if it's dirty, records it on the page. It never commits for a worker.
- **The weekly limit**: when a stream reports a usage limit, the runner parses its reset time. It stops every worker (SIGINT, then SIGTERM after 60 s), writes the time on the page, sleeps once until the reset plus five minutes, and restarts the unfinished tasks from their branches' tips, the supervisor first. A limit with no readable time stops the night and says so on the page. There is no interval check anywhere (decision 3).
- **Idle stop**: a worker whose stream is silent for 15 minutes, with a clean worktree and no child process but its own, is stopped and recorded ("waited with nothing to do").
- **The decision page**: the supervisor keeps `docs/night-shift/<date>.md` on its branch `night/supervisor/<date>` (contracts/decision-page.md). The runner appends what it alone sees (limits, idle stops, refused tasks).

## §5 The probe

`deploy/night-shift/probe.sh` (contracts/probe.md), on this spec branch, at the commit the runbook names. The Author runs it with a guard on that SHA:

```bash
bash <(git show "$sha:deploy/night-shift/probe.sh")
```

It:
- works from inside its temp folder, `/tmp/h4-probe.XXXXXX`, and writes only there;
- points every nono folder there, and fingerprints `~/.claude/settings.json` and nono's default folders before and after, so a stray write shows;
- prints everything (also kept as `report.txt` in that folder) and deletes raw API answers once parsed;
- runs `ops.md`'s redaction filter over all of it, and prints no process's command line;
- installs nothing.

Its sections:
1. host, kernel, WSL, memory, disk;
2. Landlock ABI (by the `landlock_create_ruleset` syscall) and the LSM list;
3. **the controls**: user, mount, and network namespaces (loopback up), and bubblewrap as Claude Code runs it (`--unshare-user --unshare-pid --unshare-net`), all outside nono;
4. the GPU's paths and `nvidia-smi`'s name and memory;
5. Blender: its path, folder, and version;
6. ComfyUI: its port, `system_stats`' versions, its node modules, its model folders' file names, and its processes' IDs and names;
7. Claude Code: version, paths' existence, the flags the runner uses;
8. the agents' engine: the relay's endpoint, whether it answers, the socket's mode, the Author's groups, and the socket connected outside nono (the control);
9. git and the repository: main's SHA, any tag named main, where the checkout is;
10. the AWS CLI's version and profile names;
11. the toolchain (Terraform with its update check off);
12. nono's release: the assets with GitHub's digests, the exact tarball, our SHA-256, any checksum file;
13. nono's commands: `--version`, `--help`, `setup --check-only`, and the `--help` of `run`, `profile`, `audit`, `rollback`, and `why`, which the install relies on;
14. the Claude Code pack: `pull`, `profile show --json`, `profile init --full --output`, `profile validate`, `profile schema`, and `profile guide`, all into the temp folder;
15. **inside nono** (skippable with `H4_PROBE_NEST=0`, never by editing the file): a `/bin/true` control; bubblewrap; the Docker socket; `~/.aws/config` by exit code only. It runs with explicit read-only grants, never the pack, so nothing can be written to `~/.claude`;
16. **Claude Code nested inside nono** (the same switch): one `claude -p` turn, asked to run `printenv SANDBOX_RUNTIME` under its sandbox with `failIfUnavailable`, outside nono first (the control), then inside nono under the Claude Code pack. These are his own login's two turns, and Claude Code writes its usual session files in `~/.claude`, which the fingerprint shows. The summary's first line is the verdict, and **a failed nesting says to stop**.

## §6 The install-and-rehearse script

`deploy/night-shift/install.sh SHA [--undo]` (contracts/install.md). He runs it from his checkout after a guard that the branch's tip is SHA:

```bash
bash <(git show "$sha:deploy/night-shift/install.sh") "$sha"
```

| Step | What | Stops if |
|---|---|---|
| 0 | `set -euo pipefail`; its own `git` wrapper (no replace objects, no system config, no hooks); `/usr/bin/python3 -I -B`; the SHA resolves; `~/.config/h4reet-ai/night-shift.env` exists with every key | any is missing |
| 1 | nono: download the pinned tarball to a temp folder, SHA-256 equal to `NONO_SHA256` from `git show $sha:.devcontainer/toolchain.vars`, copy the binary to `~/.local/bin/nono` (mode 0555) | the checksum differs |
| 2 | profiles: `git show` each template, fill placeholders from the facts file, refuse any left, `nono profile validate`, diff against the installed copy, write to `~/.config/h4reet-ai/nono/` (files 0444, folder 0555), print each SHA-256 | validation fails |
| 3 | runner, prompts, settings layers: `git show` into `~/.local/share/h4reet-ai/night-shift/`, read-only; record every installed file's SHA-256 in `installed.txt` | — |
| 4 | folders: `/srv/studio/briefs` and `/srv/studio/handoff` (his, 0755), `~/h4reet-ai/night/`; `/srv/studio/outputs` must be empty on the first install (his Q5) | `sudo` would be needed and he declines; `/srv/studio/outputs` holds a file (the count is printed, never the names) |
| 5 | **R1** wrap one test session: `nono run --rollback --profile implementer.json -- claude -p "say ok"` in a scratch worktree | it doesn't answer |
| 6 | **R2** the nesting, again under the real profile: the same session runs one Bash command under Claude Code's sandbox (`SANDBOX_RUNTIME=1` in its output) | it doesn't: stop (his Q8) |
| 7 | **R3** `make check` and the red-team suite inside a wrapped session, in a scratch worktree of the reviewed SHA | either fails |
| 8 | **R4** each forbidden read and write (§9's rehearsal rows), expecting a refusal; each refusal named by `nono why` | any succeeds |
| 9 | **R5** `nono audit verify` on each rehearsal session | it fails |
| 10 | **R6** `nono rollback list` | — |
| 11 | the summary: one block, the step outcomes, the layering, nono's and Claude Code's versions, every profile's SHA-256, the reviewed SHA; nothing from `~/.aws`, no token, no env | — |

- **Idempotent**: each step compares before writing; a second run at the same SHA changes nothing and says so.
- **`--undo`**: removes `installed.txt`'s files, the profiles, `~/.local/bin/nono` (if its SHA-256 is the pin's), and the empty folders it made. It leaves nono's own audit and rollback state (printed).
- **Delivered**: on the runbook artifact, his lines at 45 characters or fewer, with the SHA guard on its own line.

## §7 The studio line

contracts/studio-line.md. In short:

1. A repo agent (implementer) writes `/srv/studio/briefs/<asset>/<round>.json`, schema-checked by `scripts/studio/line.py brief`. It names the spec, the round (1 to 3), and the limits: the caps from main's `assets/policy/caps.json` for the asset's kind, plus the brief's own skeleton, clips, and texture size. It also names the allowed tools (`studio-tools.json` entries with `outputs_ship: true`) and references (copies of public `assets/` files).
2. The studio agent (its own task, GPU lock) reads it and drives ComfyUI and Blender. It writes `/srv/studio/handoff/<asset>/<round>/`: the `.glb`, renders, `candidate.json`, and `records.json` in the arrival check's format.
3. The repo agent copies the round's folder into a scratch repository and runs `line.py candidate`: the schema, the brief's limits, the tools list, Qwen-Image-2.1 and FLUX [dev] refused by name, then main's `arrival_check.py` on the copy. On a failure it writes round *n*+1 with the exact findings. After round 3 it writes no brief, and the asset goes on the page.
4. A pass comes in on a branch through the intake (spec 016's architecture intent, when it lands; until then, as the twin's did), and the Author's look approval is last.

The studio's settings layer refuses ComfyUI-Manager's install routes, and any `POST` to ComfyUI but `/prompt` and `/interrupt`, by a hook in the studio's Claude folder. That hook lives outside the repository's `.claude/`, and arrives with the install (Q11).

## §8 Plan and gate: off, then on

- **First install** (from this branch's reviewed commit): the plan and gate requests are refused by the runner (`"off: waiting for P-2, P-3, P-6"`). Today's rules hold.
- **Second install** (from a main that holds P-2, P-3, P-6 and the role applied): the runner's `night-shift.env` gains `NIGHT_PLAN=on`, `NIGHT_GATE=on`, and the plan role's profile name. The rehearsal adds R7 (a plan of `bootstrap`, expecting "No changes") and R8 (a gate on a test branch, expecting its merge line and main unmoved).

## §9 Red-team rows

`redteam/night-shift/rows.json` (agent-written, on the branch) holds every row; the install's R4 runs those marked `rehearsal`. The rows:

- each never-readable path, read by `cat`, `python3 open()`, `git -C … show`, `bash -c`, a subshell, a quoted path, a symlink planted in the worktree, and `ln` of a hard link (reads), per profile;
- each forbidden write, by the same spellings, plus `git -c core.hooksPath=…`, `git config`, a write to `.git/hooks`, `.git/config`, `refs/heads/main`, another task's worktree, and `~/.config/h4reet-ai/nono/`;
- the Docker socket, connected by `python3`, `socat`, and `docker -H unix://…`;
- the network: a port not granted, refused by the kernel; a host not on the allowlist, refused by Claude Code's sandbox, nested;
- the plan and gate requests while off, refused;
- the example profile pointed at by the runner, refused; a profile with a placeholder left, refused;
- each lattice edge (a test, not a row).

The forbidden-action matrix's own rows for the new human-only path (P-1) come as P-5.

## §10 Patches for the Author's hand

Each built from plain copies (`git show refs/heads/main:<path>`, edit, `diff -u` with `a/` and `b/` labels and a preamble). Each is verified with `patch -p1` on a fresh `git archive` export, where its tests run. Never `git apply`, never written into a worktree. SHA-256s go in the merge-request note.

| Patch | Paths | What | Needed for |
|---|---|---|---|
| P-1 | `.claude/settings.json`, `.claude/hooks/protected-paths.sh` | `deploy/night-shift/**` human-only (decision 4's "human-only path"); the sandbox hides `CLAUDE_CODE_OAUTH_TOKEN` | the merge |
| P-2 | `CLAUDE.md` | the Infra and Verifying lines name the night shift's plan and gate routes, within 6 KB (R-13) | plan and gate on |
| P-3 | `.claude/agents/supervisor.md`, `studio.md`, `gate-runner.md`; `ops.md` gains its plan request | the new roles | plan and gate on |
| P-4 | `.claude/hooks/bash-gate.sh` | the `make plan ROOT=` refusal names the night shift's route in its message (the rule stays; the route is the runner's) | plan on |
| P-5 | `redteam/forbidden-actions.sh`, `tools/gates/matrix-required.txt` | stage-H rows for P-1's path and the token's variable | the merge |
| P-6 | `infra/account/iam.tf` | `h4-agent-plan` (R-06); his apply | plan on |
| P-7 | `assets/policy/studio-tools.json` | the weights and nodes list, from the probe's ComfyUI listing, each with its licence | the studio line |
| P-8 | `tools/gates/toolchain_check.py` | nono's pin checked like the others | the merge |
| P-9 | `.specify/memory/constitution.md` | 1.2.0: the roles list gains supervisor, studio, gate runner (Q10) | his choice |
| P-10 | `tools/gates/gate` | the agent-config-evals trigger adds `deploy/night-shift/claude/` and `deploy/night-shift/runner/prompts/` (Q13) | the merge |

## §11 The ADRs

Drafted with the build, Status: proposed, accepted when he merges:

- **ADR 0050, nono as the build-time sandbox around every agent session.** Context: text rules and walls. Decision: nono profiles per role, live outside, example inside, the runner, the layering chosen by the rehearsal. Alternatives: Claude Code's sandbox alone; containers per agent; a separate Unix user per agent. Consequences: named gaps (ports not hosts, unmediated sockets closed by the outer namespace).
- **ADR 0051, agents plan through a plan-only role and run the gate.** Decisions 1 and 2, verbatim. The role, the plan request, the gate request from his checkout of main, off until P-2, P-3, P-6. Alternatives: the brief's `aws_auth` proxy (not available on WSL2 at v0.81.0); the Author planning, as today. Reverses CLAUDE.md's lines and amends ADR 0017's "the Author runs the gate".
- **ADR 0052, the studio line.** Decision 5 and his studio words, verbatim. Two folders, no network path, three rounds, the tools list, his look approval last, the photos and key closed, the outputs folder the studio's alone once he has emptied it. Alternatives: a network API between the studio and the repo; the Author carrying files, as today.

(ADR 0048 and 0049 are W1's, on `feat/001-w1`. If W1 claims more numbers before this merges, these renumber.)

## §12 Order of work

Each group ends in commits; each is reviewed by a reviewer agent that didn't write it; test first, RED then GREEN.

1. **Probe** (this branch, with this plan). Its sections 15 and 16 are the nesting test (his Q8). **If the nesting fails, everything stops here**, and the session brings him the evidence and §1's candidates.
2. **After his approval and a probe that shows the nesting works**, on `feat/017-the-night-shift`:
   1. G1, profiles: fragments, `build.py`, the eight profiles, the lattice and deny tests.
   2. G2, runner: queue validation, locks, worker start, limit and resume, idle stop, the decision page; tests with stubs.
   3. G3, studio line: schemas, `line.py`, the round rule, tests with fixture GLBs.
   4. G4, red-team rows, and the install script with its stub tests.
   5. G5, ADRs, how-we-build, runbook, the `iam.tf` role's tests, the patches P-1 to P-9.
   6. G6, the merge-request note; `make lint`, `make test`, `make evals` pasted.
3. **The install-and-rehearse script** to him, from G6's reviewed SHA.
4. **After his run**: fixes, a new script, until the rehearsal passes; then the Resume pilot.

## §13 Risks

- **The nesting fails** (likely). The probe finds out before anything is built, and the work stops for his choice (§1's candidates A to C).
- **Command policies on shebang scripts** (#1724, #2164): `tools/gates/gate` is a Python script with a shebang. The gate request runs it as `python3 -I … tools/gates/gate`, which its shebang already uses.
- **nono's schema differs from the extracts** (R-03's unconfirmed keys). `build.py` is written after the probe's `profile schema`, and the install's `profile validate` refuses a wrong key.
- **The 76-second policy setup** (#1317): ten workers start at once; the runner staggers starts by 10 s.
- **The token** is in each worker's environment. Claude Code's sandbox, nested, hides it from commands (P-1), and a red-team row checks that `printenv` in a command doesn't show it. The token is the night shift's own, revocable on its own, with no AWS or repository power.
- **A worker writes `.git/objects` junk**: harmless to refs; `git fsck` in the morning page's checks.

## §14 Proof

- pytest: every profile is valid JSON, carries every deny, grants nothing a settings glob denies, sits in its parent; the runner's queue, locks, limit, idle, and page logic with stubs; `line.py`'s schema and limits with fixtures; the install script's order, refusals, idempotence, and `--undo` with stub binaries and a fake `$HOME`.
- The rehearsal (R1 to R6) on his machine, and later R7 and R8.
- The pilot's page (SC-004).

## §15 Cost

No paid route. The plan role is free; its reads are free; the lock's writes are fractions of a cent. Development time comes out of the Claude plan's weekly allowance; ten workers spend it faster, and the runner waits for the reset rather than buying more.

## §16 Degraded modes

As the spec's Degraded Modes. Plus: if nono's pin no longer matches (a manual upgrade), `night.py start` refuses and says so.

## Questions for the Author

Each with a recommended answer. The spec and this plan take each recommendation provisionally; approving this plan confirms them, and any answer of his overrides.

| # | Question | Recommended | Other |
|---|---|---|---|
| Q1 | Where should the gate run from? | **Answered**: "It can use my checkout of main". Workers commit in their own worktrees, so your checkout on main doesn't stop them | — |
| Q2 | How do workers sign in to Claude? | **A night-shift token from `claude setup-token`**, passed by nono, hidden from commands | Your own login shared read-only (they'd need to write `~/.claude`) |
| Q3 | Where does the example copy live? | **`deploy/night-shift/profiles/` on the branch, made human-only by P-1**, so the install reads it before you merge | An existing human-only path, arriving only as your patch, so you apply it before the first install |
| Q4 | Does an agent's plan take the state's lock? | **Yes**, the role may write and delete only `*.tflock` | `-lock=false` (a plan could race your apply) |
| Q5 | May the studio agent read `/srv/studio/outputs`? | **Answered**: "i will remove all current files in outputs elsewhere, so the studio agent can read inside the directory and iterate on the creation of the remaining assets". The studio reads and writes it; the first install refuses while it holds a file | — |
| Q6 | Where does the decision page live? | **`docs/night-shift/<date>.md` on the supervisor's night branch**, which a morning session turns into a runbook page for you | An artifact published by the supervisor itself (needs claude.ai's sign-in in the night's sessions) |
| Q7 | May the gate runner pass `--prove`? | **No**: stage E stays PENDING for you | Yes, under the gate lock |
| Q8 | If Claude Code's sandbox won't start inside nono's, continue or stop? | **Answered**: "If nesting fails, let's stop quickly and let me know as we need another approach … Let's test that out first before iterating on the whole workflow." The probe tests it first; a failure stops everything | — |
| Q9 | Which nono? | **v0.81.0** (2026-10-29), for its three advisory fixes; 14 days old on 2026-11-12 | v0.80.0 (2026-10-13) |
| Q10 | The constitution lists six roles; the night shift adds three. Amend it, or name a deviation? | **Amend: P-9, 1.2.0 (MINOR)**, your patch | A named deviation in this spec, no amendment |
| Q11 | The studio's ComfyUI rule (no installs, no POST but `/prompt` and `/interrupt`) is a hook in the studio's own Claude folder, outside the repository's `.claude/`. Is that acceptable? | **Yes**: it ships in `deploy/night-shift/claude/` (human-only by P-1) and installs to the studio's folder | Put it under `.claude/hooks/` by patch, for every session |
| Q12 | The probe's section 15 runs the downloaded nono from its temp folder, with read-only grants, to test the nesting and the Docker socket. Run it? | **Run it**: it settles R-08 before the build; it installs nothing and writes only in its temp folder | Skip it with `H4_PROBE_NEST=0`; the rehearsal finds out later |
| Q13 | The workers' prompts, settings layers, and the studio's hook live in `deploy/night-shift/`, outside `.claude/`, which the constitution names for role definitions and hooks. Keep them there? | **Yes, with P-10**: the folder is human-only (P-1), and the gate runs the agent-config evals when it changes | Move them under `.claude/night-shift/` by your patch, so the first install waits for it |

Also for the Author:
- **013 is taken**: the brief said "013 is unused", but `intent/013-privacy-answer-by-host.md` is on `docs/corpus-ec2-proposal`. 017 is free, and is used.
- **This session's worktrees are under `$TMPDIR`**, not your home: its sandbox writes only the checkout and `$TMPDIR`, and `.claude/worktrees` is read-only to its shell. Every step ends in a commit, so a WSL restart loses nothing. The night shift's own workers get worktrees under your home (§4).

## Complexity Tracking

| Departure | Why needed | Simpler alternative rejected because |
|---|---|---|
| A runner outside the sandboxes | Each worker needs its own top-level nono, narrower than any other | Workers as the supervisor's subagents would share its sandbox |
| Plan requests run by the runner | No per-command `aws_auth`; no proxy on WSL2 | The insecure proxy opt-in weakens every session that has it |
