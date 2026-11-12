# Implementation Plan: The night shift

**Branch**: `spec/017-the-night-shift` (this plan), then `feat/017-the-night-shift` (the build) | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

**Status**: approved by the Author on 2026-11-12 ("Approve, all recommended"), after the container probe passed (BOUNDARY holds, PLAN-ONLY yes; research R-18). The build is under way on `feat/017-the-night-shift`.

## Summary

The night shift has three parts:

- **A container around every agent session.** A supervisor session and its workers each run in their own container, started by one small runner outside every container. Each container mounts only what its role needs. It reaches the internet only through an allowlisting egress proxy, and signs in with a `claude setup-token` token that draws on the Author's plan, never on API credits.
- **A queue, three locks, and one decision page.** The supervisor turns the queue into tasks. Up to ten workers at a time spec and build the Author's improvements, and anything that needs him lands on the page.
- **The studio line.** Repo agents and the studio agent pass briefs and candidates through two folders, with the intake's checks between them. The studio agent starts ComfyUI itself, in its own GPU container.

Agents build all of it inside today's sandbox. The Author runs two things: the container probe now, then one install-and-rehearse script read from a reviewed commit.

**Why containers, not nono** (the Author's answer, 2026-11-12, after the probes; research R-14):
- Claude Code's sandbox can't start inside nono's, because Landlock refuses `mount(2)`.
- On WSL2, nono can't block Unix sockets. Inside it, the host's Docker socket connected, and `~/.aws/config` was readable under nono's own base.
- nono can't filter hosts there without its insecure proxy mode.

A container gives all three: its own mount namespace (what isn't mounted doesn't exist), its own network (an internal network has no route out), and no socket unless one is mounted. This is also Anthropic's documented pattern for unattended Claude Code. The repository already has the parts:
- the devcontainer, with its `WITH_CLAUDE` switch;
- the agents' engine's `egress-proxy.py`;
- the Author's own `oc-studio-agent.sh`, which runs a studio agent on an internal network.

## Technical Context

- **Language/Version**: Bash 5 for the probe and the install script. Python 3.12, standard library only, run as `python3 -I -B`, for the runner, the spec builder, the studio line's checks, and their tests. Dockerfiles for the images. JSON for specs, queue, briefs, and candidates.
- **Primary Dependencies**:
  - the host's Docker engine (the Author's, with the NVIDIA runtime his model server already uses);
  - Claude Code pinned in the images;
  - the agents' engine (`198.18.0.1:2376`) for the containers that `make check` runs;
  - git;
  - the AWS CLI, on the Author's side only;
  - Blender 5.2.3 and ComfyUI as he installed them.
- **Storage**: files and images only.
  - In the repository: `deploy/night-shift/`.
  - On the Author's machine, outside it:
    - `~/.config/h4reet-ai/night-shift/`: the live specs, the night allowlist, the token file `claude.env`, and the facts file;
    - `~/.local/share/h4reet-ai/night-shift/`: the runner, prompts, and each role's Claude folder;
    - `~/.local/state/h4reet-ai/night-shift/`: locks, the runner's log, and the egress log;
    - `~/h4reet-ai/night/`: the workers' worktrees;
    - `/srv/studio/briefs`, `/srv/studio/handoff`, `/srv/studio/outputs` (his Q5).
- **Testing**: pytest under `deploy/night-shift/tests/` and `scripts/studio/` (`PYTEST_DIRS` gains `deploy/night-shift`). The tests check that the specs and their lattice hold, and that the runner builds each `docker run` command line exactly, without a Docker engine. The bash scripts get `shellcheck`, and a pytest that runs them against stub `docker`, `claude`, `git`, and `aws` binaries with a fake `$HOME`. The Author's probe and rehearsal are the integration tests.
- **Target Platform**: the Author's WSL2 host: kernel 6.18, 24 cores, 62 GB, the RTX 5090.
- **Project Type**: build-time tooling. Nothing runs at runtime.
- **Constraints**:
  - the bash gate's text rules (scripts are written with the Write tool, never in heredocs that name guarded words);
  - CLAUDE.md's 6 KB cap (R-13);
  - protected paths only as patches built from plain copies;
  - this session can't run Docker (its sandbox blocks the socket), so every container claim is proven by the Author's runs.
- **Scale/Scope**: eight container specs, four images, two internal networks, about 600 lines of runner, a 300-line probe, a 500-line install script with a 900-line rehearsal, two schemas, and about 360 red-team rows (every never-mounted path and forbidden write in every spelling, tasks.md T051; the rehearsal runs about half).

## Constitution Check

*Gate: must pass before Phase 0; re-checked after design.*

| Clause | Status | Note |
|---|---|---|
| III. Intent → spec → plan before code | Pass | Intent drafted (uncommitted, his), spec and plan on `spec/017`, no code until he approves. |
| III. Only a human merges, applies, or amends | Pass | The gate never merges; the plan role's apply is his; the constitution patch (P-9) is his. |
| IV. Each role scoped; the implementer never reviews | Pass | One container spec per role; reviewers are other agents. |
| IV. Policy in enforcement points | Pass | The container (mounts, network, capabilities) beneath the hooks and the bash gate, with red-team rows. |
| IV. "Cloud access is short-lived and identity-based (OIDC for CI, SSO for humans)" | **Deviation, named** | Decision 1: an agent's plan uses a role assumed from his SSO session for one hour. ADR 0051. |
| IV. "No secrets … in agent context" | Pass, with a named limit | AWS credentials exist only in the plan container's run. The Claude token is in each session's environment, where its own commands could read it; it can reach only the allowlist's hosts, signs in only on the plan, and is revocable on its own (§13). |
| Security: "network egress to non-allowlisted domains from an agent session" prohibited | Pass | Internal networks have no route out; the egress proxy allows only the night's list (FR-013). |
| Governance: the roles listed in the constitution | **Deviation until P-9** | The supervisor, studio, and gate-runner roles aren't in its list. P-9 proposes 1.2.0 (MINOR), his to apply. |
| Development standard: "run under the project's committed … sandbox settings" | **Deviation, named** | Inside a container, Claude Code's own sandbox may not start (the probe says); the container replaces it. The live specs stay outside (decision 4). ADR 0050. |
| CLAUDE.md: the Author plans and runs the gate | **Reversed by decisions 1 and 2** | Off until his patches merge (FR-015). |
| V. Cost | Pass | No paid route; sessions sign in on the plan, and fail closed on API keys (FR-041). |
| II. Done is a checklist | Pass | Tests, the probes, the rehearsal, a how-we-build page, a runbook, and three ADRs. |

Re-checked after design: no new violation.

## Project Structure

### Documentation (this feature)

```text
specs/017-the-night-shift/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
├── checklists/requirements.md
└── contracts/
    ├── containers.md      # each role's container, the lattice, placeholders
    ├── runner.md          # the runner's commands, its docker run lines, its inbox and outbox
    ├── queue.md           # queue.json
    ├── decision-page.md   # the morning page
    ├── studio-line.md     # brief.json, candidate.json, rounds, folders
    ├── probe.md           # what the probes print
    └── install.md         # the install script's steps, summary, and --undo
```

### Source Code (repository root)

```text
deploy/night-shift/                  # human-only once P-1 merges (the example copy, decision 4)
├── probe.sh                         # the nono probe, kept as the record (research R-14)
├── container-probe.sh               # §5, the next run
├── install.sh                       # §6, the Author's one command
├── rehearse.py                      # §6, the install's Python half: the facts, the pins, R1 to R4
├── images/
│   ├── worker.Dockerfile            # FROM the devcontainer's base, WITH_CLAUDE=1, the repo toolchain
│   ├── studio.Dockerfile            # Claude Code and Blender 5.2.3 (pinned checksum)
│   ├── comfyui.Dockerfile           # Ubuntu 24.04's Python 3.12, to run his venv read-only
│   └── egress.Dockerfile            # python:3.12-slim with main's egress-proxy.py
├── containers/
│   ├── build.py                     # makes every spec from fragments.json
│   ├── fragments.json               # shared pieces, with {{PLACEHOLDERS}}
│   └── <role>.json                  # eight session specs, plus plan.json and comfyui.json
├── allowlist.json                   # the night's egress hosts, in settings shape
├── comfyui-params.json              # ComfyUI's launch allowlist, --birefnet (FR-040, Q15; T045)
├── runner/
│   ├── night.py                     # §4
│   └── prompts/<role>.md            # each worker's opening prompt
├── claude/<role>.settings.json      # each role's Claude Code settings layer (forceLoginMethod, sandbox)
└── tests/

scripts/studio/line.py, test_line.py
infra/account/iam.tf                 # P-6, his patch: h4-agent-plan
infra/test/test_account.py           # the role's tests
assets/policy/studio-tools.json      # P-7, his patch: the weights and nodes list
docs/adr/0050-…, 0051-…, 0052-…      # §11
docs/how-we-build/night-shift.md, docs/runbooks/night-shift.md
redteam/night-shift/rows.json, run.sh # §9 (run.sh runs the installed rehearse.py's R4); matrix rows are P-5
```

## §1 The layers

```text
the Author's terminal
└─ night.py (the runner: the only process that uses the host's Docker socket)
   ├─ h4-night (internal network: no route out)
   │   ├─ egress           (also on a normal network; egress-proxy.py with the night allowlist, :3128)
   │   ├─ engine-fwd       (also on a normal network; forwards :2376 to 198.18.0.1:2376 only; on h4-night-engine,
   │   │                    not h4-night, so only the roles whose specs name that network reach it: the build, runner.md §2)
   │   ├─ supervisor       (its worktree)
   │   └─ workers ×≤10     (each: its worktree, its Claude folder, its io folder)
   │        └─ Claude Code: the project's hooks and permissions, its role's settings layer,
   │           and its own sandbox too if the probe shows it starts inside a container
   ├─ h4-night-studio (internal network)
   │   ├─ egress-studio    (api.anthropic.com only)
   │   ├─ studio           (Claude Code and Blender; --gpus all; the studio's folders)
   │   └─ comfyui          (started on the studio's request; --gpus all; his install read-only)
   └─ h4-night-plan (internal) → plan container + egress-plan (the AWS hosts `infra/` uses, `allowlist-plan.json`), only while a plan runs
```

**Each session container**:
- runs as `--user <his uid>:<gid>`, with `--init`, `--cap-drop ALL`, and `--security-opt no-new-privileges` (FR-014);
- has `--read-only` root with a `tmpfs` at `/tmp` (the GPU containers' root stays writable, §2);
- has limits: `--pids-limit 512`, `--memory 4g`, `--cpus 2`, and the supervisor `--memory 2g`. Ten workers then fit 62 GB and 24 cores, with the GPU's model off on studio nights. The runner starts a container only while the memory limits of every running night container plus the new one sum to no more than total memory less 8 GB, so a studio night (the studio's 8 GB and ComfyUI's 24 GB) holds fewer workers (FR-014; contracts/runner.md §3);
- has these mounts, and nothing else:
  - its worktree, read-write, at the same path as on the host;
  - the repository's `.git`, read-only, at the same path, with only the task's own parts read-write (FR-012): `.git/objects`, `.git/worktrees/<task>`, and its branch's refs and logs (`refs/heads/night/<task>/`, `logs/refs/heads/night/<task>/`). Read-only binds sit over `.git/objects/info` and the task's `.git/worktrees/<task>/commondir`. Everything else in `.git` (`hooks`, `config`, `HEAD`, `index`, `refs/heads/main`, `refs/tags`, …) stays read-only without a mask. A session that could write `.git` itself could change its `commondir` and steer git outside the container (G1's review). These are the runner's task mounts (contracts/runner.md §3, contracts/containers.md §4). The container probe proved `.git` read-write with masks; the rehearsal's R3 proves this narrower shape;
  - read-only binds over every path `refs/heads/main:.claude/settings.json` denies writing that exists inside the worktree (`.claude`, `CLAUDE.md`, `REVIEW.md`, `tools/gates`, …). Claude Code's own sandbox may be off in the container, so these binds do what its masks do today. A denied path a fresh worktree lacks (`makefile`, `.mcp.json`, `.gitleaksignore`, `.github/workflows`, `deploy/env`) can't be masked, and with the index and objects writable a session can commit any content for a masked path without writing it; so the runner refuses, at each writing session's end and before naming a stack, any branch that changes a human-only path (the merge-time refusal, §4 and contracts/runner.md §6);
  - its role's Claude folder (`CLAUDE_CONFIG_DIR`);
  - its io folder;
  - per role: the engine's client certificates (read-only), and the studio folders listed in §2;
- gets this environment, and nothing else:
  - `CLAUDE_CODE_OAUTH_TOKEN`, from `--env-file ~/.config/h4reet-ai/night-shift/claude.env`;
  - `HTTPS_PROXY=http://egress:3128` and `NO_PROXY=localhost,127.0.0.1` (the engine roles add `engine-fwd`);
  - `SANDBOX_RUNTIME=1`, so the Author-only make targets refuse, as in today's sandbox, and the relay runs. If the container probe shows Claude Code's own sandbox starts inside a container, commands get the variable from that sandbox, and the runner doesn't set it;
  - `DISABLE_AUTOUPDATER=1`, `DISABLE_TELEMETRY=1`, `DISABLE_ERROR_REPORTING=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`;
  - `HOME=/night/home` (a `tmpfs`), caches under `/tmp`, git's automatic gc off, and the commit identity `night-<role>` (contracts/containers.md §5).
- signs in on the plan only. The role's settings layer sets `forceLoginMethod: "claudeai"`, and the runner refuses to start a container whose environment names an API-billing variable (FR-041).

**Containers on the agents' engine** (`make check`'s and `make up ENV=dev-cpu`'s): a worker's `docker` client talks to `engine-fwd:2376` with the engine's mutual TLS. The relay's nesting path takes `DOCKER_HOST=tcp://127.0.0.1:2376`, which a `socat` inside the worker forwards to `engine-fwd`: the worker image's entrypoint starts it when the spec sets `NIGHT_ENGINE_FWD`, then runs the runner's command unchanged. The worker image adds the Docker CLI, with its compose and buildx plugins, to the devcontainer's toolchain for this. The engine's own admission plugin, egress proxy, and firewall keep governing what runs there, as today.

**Why not the agents' engine for the sessions themselves**: it runs as `h4agents`, which can't write the Author's worktrees or `.git`, and it has no GPU. The host engine runs the session containers, and only the runner uses it.

## §2 The container specs

Each is one JSON file made by `build.py` from `fragments.json`, filled with machine facts by the install. The lattice: "narrower than its parent" means every mount (by path and mode), network, device, and capability of the child is the parent's. The runner starts every container, so "parent" is a policy relation:

```text
ceiling (computed: the union)
├── supervisor
├── ops ─── implementer ─┬─ spec-writer ── reviewer
│                         └─ red-teamer
├── gate-runner
└── studio
```

| Spec | Read-write mounts | Read-only mounts | Network | Extra |
|---|---|---|---|---|
| supervisor | its worktree, its own parts of `.git` | `.git`, the masks, the night folder, `/srv/studio/briefs`, `/srv/studio/handoff` | h4-night | — |
| spec-writer | its worktree, its own parts of `.git` | `.git`, the masks | h4-night | — |
| reviewer | — | its worktree, `.git` | h4-night | — |
| implementer | as spec-writer, plus `/srv/studio/briefs` | the masks, `/srv/studio/handoff`, the engine certificates | h4-night, h4-night-engine | — |
| red-teamer | its temp (a `tmpfs`) | its worktree, `.git`, the engine certificates | h4-night, h4-night-engine | — |
| ops | as implementer | as implementer | as implementer | plan request: **off** |
| gate-runner | — | its worktree, `.git` | h4-night | gate request: **off** |
| studio | `/srv/studio/handoff`, `/srv/studio/outputs` | `/srv/studio/briefs`, `/srv/studio/workflows` | h4-night-studio | `--gpus all` (Blender), under the GPU lock; the ComfyUI request |
| plan (runner only) | `~/.config/h4reet-ai/infra/{data,plans,state}` | the detached worktree (under `<NIGHT_ROOT>/.plan/`), the repository's `.git` (its worktree's `.git` file points there), `~/.config/h4reet-ai/infra`, the provider mirror | h4-night-plan | the role's credentials for that run, by `--env-file` only, with no `AWS_` variable |
| comfyui (runner only) | `/srv/studio/outputs`, `/comfyui/user`; `/comfyui/temp` and its input folder as `tmpfs` | `~/ComfyUI`, `~/flux-env` | h4-night-studio | `--gpus all`; its port on the studio network only |

Every session also has its role's Claude folder (`/night/claude`) and its io folder (`/night/io`), read-write. A request (plan, gate, ComfyUI) is a file in the io folder's `out/`, so the plan's and the gate's outboxes are the io folder, and the spec's `requests` names the kinds the runner takes from the role. The worktree, `.git`, the masks, and those two folders are the runner's task mounts (contracts/runner.md §3); a spec holds only the role's own mounts, and none lies over a task mount, so none can reopen a mask (contracts/containers.md §4).

**Changed while building G2** (contracts/containers.md has the detail):
- The gate runner reads `.git` to name SHAs.
- The plan mounts `~/.config/h4reet-ai/infra` read-only and its `state` read-write, because `bootstrap`'s state is local.
- ComfyUI's uploads go to a `tmpfs` over its input folder, not into his install.
- The session images bake a passwd entry for his uid, since the runner mounts nothing at `/etc`.
- The specs name their image as `h4-night-<name>:{{IMAGE_TAG}}`, the tag the install builds.

**Never mounted in any session container**: `~/.aws`, `~/.ssh`, `~/.config/h4reet-ai`, `~/.config/gh`, `~/.git-credentials`, `~/.docker`, the Author's `~/.claude` and `~/.claude.json`, `/srv/studio/photos`, `/srv/studio/key`, `/var/run/docker.sock`, and the main checkout's working tree. Nor is anything main's settings deny reading outside the worktree (`denyRead`, `credentials.files`), the engine's and the runner's state (`~/.local/state/h4reet`, `~/.local/state/h4reet-ai`), the provider mirror (but for the plan), or, but for the studio, `/srv/studio/workflows` and `/srv/studio/outputs`. A test checks every spec, with the runner's task mounts, against that list and each path's ancestors, and the runner checks it again at every start with its own validate step, which G2's test calls.

## §3 Requests to the runner

A session never starts a container. It asks: it writes `<NIGHT_ROOT>/.io/<task>/out/<n>.json`, and the runner answers in `in/<n>.json` (contracts/runner.md §5).

| Request | The runner | State |
|---|---|---|
| `plan` (root, SHA) | a detached worktree at the SHA, then `aws configure export-credentials --profile $PLAN_AWS_PROFILE` into a 0600 env file it deletes after. It then runs the plan container on h4-night-plan, with egress-plan allowing the AWS hosts `infra/` uses in us-east-1 (`allowlist-plan.json`), running that commit's `scripts/infra/infra_plan.py`, and returns the redacted block | **off** until P-2, P-3, P-6 |
| `gate` (SHA) | `tools/gates/gate <sha>` on the host, from his checkout while it's on `refs/heads/main` and clean, under the gate lock, never `--prove` | **off** until P-2, P-3, P-6 (the runner turns plan and gate on together) |
| `comfyui start` (params) | under the studio task's GPU lock: the comfyui container, `python main.py --listen 0.0.0.0 --port 8188 --output-directory /srv/studio/outputs --temp-directory … --user-directory …` plus the params, each checked against the allowlist seeded from his `start-comfyui.sh` and his answer | on |
| `comfyui stop` | stops it; also when the task ends | on |

## §4 The runner, the queue, the locks

`night.py` (contracts/runner.md). It is the only process outside every container, installed from a reviewed commit, run as `python3 -I -B`. Its own `git` runs with no hooks, no fsmonitor, and no replace objects.

- **Start** (`night.py start`), with a preflight:
  - each live spec's SHA-256 matches `installed.txt`, and none holds the example marker;
  - each image's digest matches what the install built;
  - the token file exists, is 0600, and holds exactly one `CLAUDE_CODE_OAUTH_TOKEN=` line;
  - no API-billing variable is in the runner's own environment (FR-041);
  - the networks exist and are internal;
  - disk and memory are above the 2026-10-08 thresholds.

  Then it starts egress, engine-fwd, and the supervisor.
- **The queue**: `queue.json` in the supervisor's worktree (contracts/queue.md), validated on each change.
- **Workers**: up to ten at once, starts staggered by 10 s. Each gets a worktree on `night/<task>/<slug>`, made outside, and `docker run` with its role's spec and `claude -p "<prompt>" --output-format stream-json --settings <role layer>`.
- **Locks**: `matrix`, `gate`, `gpu`, each a `flock(2)` held for the task's whole run. Before a GPU task, the disk and memory checks run again.
- **Save points**: every role prompt commits `wip(<task>): <step>` before each step. The runner records a dirty worktree at a session's end and never commits for it.
- **The weekly limit**: on a stream's usage-limit event, the runner parses the reset time and stops every container. It sleeps once until the reset plus five minutes, then restarts the unfinished tasks from their branches' tips, the supervisor first. No interval check anywhere (decision 3). Extra usage is never accepted (FR-041).
- **Idle stop**: 15 minutes of a silent stream with a clean worktree stops the container, and the stop is recorded.
- **Naming a stack**: `git branch feat/NNN-… <tip>` outside, when the supervisor marks it done, unless the branch changes a human-only path since its merge base with main: main's denyWrite, main's `protected-paths.sh`, or `deploy/night-shift/`. Each such path is a page line, at every writing session's end too ("touches a human-only path: <path>; the Author's patch route"), and the change goes the Author's patch route (the merge-time refusal, contracts/runner.md §6).
- **Memory**: a start waits while the running night containers' memory limits plus the new one's would pass total memory less 8 GB (FR-014).
- **The decision page**: `docs/night-shift/<date>.md` on `night/supervisor/<date>` (contracts/decision-page.md). The runner appends what it alone sees.

## §5 The container probe

`deploy/night-shift/container-probe.sh` (contracts/probe.md §2), at the runbook's commit. He runs it after making the night-shift token (his step, below). It makes one folder, `~/h4-cprobe.XXXXXX`, builds two small images (`h4-night-probe-worker`, `h4-night-probe-egress`), and makes two networks named for the run: one internal, one ordinary. When it ends, it removes only the containers and networks it made, deletes the container's Claude folder and the scratch files, and names the images it leaves (research R-17).

**What it checks**:
1. **The sign-in**: in the worker container, with only the token, `claude -p` answers. Then, with the settings layer's `forceLoginMethod: "claudeai"`, a stand-in `ANTHROPIC_API_KEY` is added, and then a stand-in `ANTHROPIC_AUTH_TOKEN`. Each time, Claude Code must exit non-zero, and the egress proxy's log must gain no `api.anthropic.com` line for that turn. The proxy is the only way out, so that proves the stand-in was never sent.
2. **The way out**:
   - `api.anthropic.com` through the egress proxy is reachable;
   - `example.com` through the proxy gets the proxy's 403;
   - a direct connection to `1.1.1.1:443` fails as unreachable, and the container has no default route.
3. **What isn't there**: the Docker socket, `~/.aws`, `~/.ssh`, `~/.config/h4reet-ai`, `~/.claude`, `/srv/studio/photos`, and `/srv/studio/key`.
4. **The repository**:
   - in a scratch clone with a worktree, the session writes its worktree and commits;
   - each of these writes is refused: `.git/hooks`, `.git/config`, a masked `.claude/settings.json`, `refs/heads/main`, a tag named `main`, `objects/info/alternates`, and the worktree's `commondir`;
   - git's hooks path can't be set.
5. **The engine**: `engine-fwd` reaches `198.18.0.1:2376` (a TCP connect, nothing sent).
6. **Claude Code's own sandbox inside the container**: the `printenv SANDBOX_RUNTIME` turn, as in the nono probe. This is information only; if it starts, it stays on as a second layer.
7. **The GPU**: `docker info`'s runtimes, and `nvidia-smi` in a `--gpus all` container (name and memory only).

The summary's first line is `BOUNDARY: holds`, `BOUNDARY: FAILED <row>` (stop, his Q8), or `BOUNDARY: UNTESTED <why>`. A second line is `PLAN-ONLY: yes` or `PLAN-ONLY: FAILED <row>`.

**His steps before it**:
1. Run `claude setup-token`, and paste the token into `~/.config/h4reet-ai/night-shift/claude.env` (0600) with a `read -s` line, so it never sits in his shell's history (the runbook).
2. In his Claude account's usage settings, turn extra usage off, so a limit never becomes API-rate billing.
3. Renew his own sign-in (`claude auth login`) before 2026-11-14 for his own sessions.

## §6 The install-and-rehearse script

`deploy/night-shift/install.sh SHA [--undo]` (contracts/install.md), run after a guard on SHA as `bash <(git show "$sha:deploy/night-shift/install.sh") "$sha"`.

| Step | What | Stops if |
|---|---|---|
| 0 | its own `git` (no replace objects, no system config, no hooks); `/usr/bin/python3 -I -B`; the SHA resolves; the facts file (the runner's `read_facts`) and the token file (mode and shape); no billing variable, no night running; on the first install, `/srv/studio/outputs` empty (his Q5) | any is missing or wrong; outputs holds a file (the count is printed, never the names) |
| 1 | images: each build context written from `git show $sha:deploy/night-shift/images/…` and the devcontainer's files into a fresh folder; bases pulled by digest; built with `--pull=false` once pulled; tagged `h4-night-<name>:<sha12>` | a base's digest is null (the line that reads it is printed) or differs from its pin |
| 2 | specs, allowlists, settings layers, `comfyui-params.json`, runner, prompts, `rehearse.py`, and the rows: `git show`; `build.py --check`, then `build.py --fill` (placeholders filled from the facts file, refused if any is left); written read-only | a placeholder is left; the specs aren't what `fragments.json` makes |
| 3 | networks: `h4-night`, `h4-night-engine`, `h4-night-studio`, `h4-night-plan` (internal) and `h4-night-out`; folders: `/srv/studio/briefs`, `/srv/studio/handoff`, `~/h4reet-ai/night/` and its `.comfyui/user`; then `installed.txt`, with each file's SHA-256, image ID, and network ID | a network of that name exists with the wrong `Internal` |
| 4 | **R1**: one test session in an implementer container on a scratch worktree of SHA answers, signed in on the plan | it doesn't |
| 5 | **R2**: the same line with a stand-in `ANTHROPIC_API_KEY`, then `ANTHROPIC_AUTH_TOKEN`: the runner's last look refuses it, and the managed settings neutralize it or refuse to start, with no `api.anthropic.com` line in the egress log for that turn | it used the stand-in, or hung |
| 6 | **R3**: `make setup && make check` inside the container (make check holds the red-team suite and the matrix) | a gate fails that isn't a named, known item: `toolchain-check` (P-8), `image` (needs the agents' engine), stage S's matrix rows (P-5), PENDING |
| 7 | **R4**: §9's rehearsal rows, each expecting a refusal | any succeeds |
| 8 | the summary: step outcomes, image digests, every spec's SHA-256, the reviewed SHA; no token, no env | — |

- **Idempotent**: each step compares before writing; a second run at the same SHA prints `unchanged`.
- **`--undo`**: removes what `installed.txt` lists, the networks, and the images it tagged. It prints what it left: the token file, which is his.

**Changed while building G4** (contracts/install.md has the detail):
- The outputs check runs at step 0, so a refusal installs nothing (the table put it at step 3, after the images and files).
- R2 runs both stand-ins, as the probe did, and passes when the managed settings neutralize them as well as when they refuse to start (research R-18's third run); the runner's own refusal of the line is checked first.
- R3 names its known, environmental results instead of failing on them.
- `deploy/night-shift/rehearse.py` is the install's Python half and the rehearsal: it builds every session line with the installed runner's own code, so R1 to R4 prove the runner's line. `build.py` gains `--fill`, the fill step. `--undo` needs only `installed.txt`, which records the folders the install made (`dir`) and its scratch (`scratch`) besides the files, images, and networks.
- §9's rows are about 360, not 40: T051 asks for every never-mounted path and forbidden write in every spelling. R4 runs the rows marked `rehearsal` (the spellings that reach another path or program, and every row of the other kinds), and `redteam/night-shift/run.sh --all` runs them all. Each row runs only where its host path exists.
- `H4_NIGHT_STUDIO` moves `/srv/studio`, for the install's tests only.

## §7 The studio line

contracts/studio-line.md, unchanged in substance:
1. Briefs go to `/srv/studio/briefs/<asset>/<round>.json`, written by implementers.
2. The studio agent drives ComfyUI (which it starts through the runner, FR-040) and Blender (in its own container, `--gpus all`). It writes `/srv/studio/handoff/<asset>/<round>/` and works in `/srv/studio/outputs`.
3. The repo agent runs `line.py candidate`, which ends by running main's `arrival_check.py` on a scratch copy. There are three rounds at most; `--record` writes each round's result beside its brief, which the next brief reads (data-model.md's Round result; the implementation's addition, 2026-11-12). `line.py round` counts the rounds used from the studio's handoff folders as well as the results, and re-checks a recorded pass, so deleting or forging a result resets nothing. `line.py` reads `caps.json` and `studio-tools.json` from `refs/heads/main` only (G3's review, 2026-11-12).
4. The intake, with the Author's look approval last.

ComfyUI's container mounts his install, custom nodes, models, and `~/flux-env` read-only, and sits on the studio's internal network. ComfyUI-Manager can't install anything, and no node can download.

## §8 Plan and gate: off, then on

- **First install**: the runner refuses plan and gate requests ("off: waiting for P-2, P-3, P-6"). Today's rules hold.
- **Second install**, from a main that holds P-2, P-3, and P-6, with the role applied: `NIGHT_PLAN=on`, `NIGHT_GATE=on`, and the plan role's AWS profile name in the facts file. The rehearsal adds R5 (a plan of `bootstrap`, expecting "No changes") and R6 (a gate on a test branch, expecting its merge line and main unmoved).

## §9 Red-team rows

`redteam/night-shift/rows.json` (agent-written); the install's R4 runs those marked `rehearsal`:
- each never-mounted path, read by `cat`, `python3 open()`, `git -C … show`, `bash -c`, a subshell, a quoted path, a symlink planted in the worktree, and a hard link, per role;
- each forbidden write, by the same spellings, plus `git -c core.hooksPath=…`, `git config`, and writes to `.git/hooks`, `.git/config`, `refs/heads/main`, another task's worktree, and each masked path;
- the Docker socket, by `python3`, `socat`, and `docker -H unix://…`;
- the network: a direct connection (no route), a host off the list through the proxy (refused), and the engine forwarder from a role without it (no route);
- the sign-in: an API key in the environment (refuses to start), `--bare` (refused by the runner), and a command's `printenv` showing the token (**gap row**, bounded, §13);
- plan and gate requests while off (refused), and an example spec or a leftover placeholder (refused).

## §10 Patches for the Author's hand

Each built from plain copies (`git show refs/heads/main:<path>`, edit, `diff -u` with `a/` and `b/` labels and a preamble) and verified with `patch -p1` on a fresh `git archive` export, where its tests run. SHA-256s go in the merge-request note.

| Patch | Paths | What | Needed for |
|---|---|---|---|
| P-1 | `.claude/settings.json`, `.claude/hooks/protected-paths.sh` | `deploy/night-shift/**` human-only (decision 4); `CLAUDE_CODE_OAUTH_TOKEN` in the sandbox's denied variables | the merge |
| P-2 | `CLAUDE.md` | the Infra and Verifying lines name the night shift's plan and gate routes, within 6 KB (R-13) | plan and gate on |
| P-3 | `.claude/agents/` | `supervisor.md`, `studio.md`, `gate-runner.md`; `ops.md`'s plan request | plan and gate on |
| P-4 | `.claude/hooks/bash-gate.sh` | the `make plan ROOT=` refusal's message names the night shift's route; the rule stays | plan on |
| P-5 | `redteam/forbidden-actions.sh`, `tools/gates/matrix-required.txt` | stage-H rows for P-1; stage S's rows, if the rehearsal shows they need to read the container's masks | the merge |
| P-6 | `infra/account/iam.tf` | `h4-agent-plan` (R-06); his apply | plan on |
| P-7 | `assets/policy/studio-tools.json` | the weights and nodes list, from his ComfyUI install (four custom nodes, the model folders), each with its licence | the studio line |
| P-8 | `tools/gates/toolchain_check.py` | the night images' Claude Code pin | the merge |
| P-9 | `.specify/memory/constitution.md` | 1.2.0: the roles list gains supervisor, studio, gate runner (Q10) | his choice |
| P-10 | `tools/gates/gate` | the agent-config evals run when `deploy/night-shift/{claude,runner/prompts}/` change (Q13) | the merge |

## §11 The ADRs

- **ADR 0050, containers around every agent session, after nono on WSL2.** Context: the walls, and the brief's nono. Decision: a container per session, the runner, internal networks with the egress proxy, sign-in on the plan, live specs outside and the example inside. The nono evaluation is the record (R-01 to R-14): the nesting fails, there's no socket mediation, and no host filtering on WSL2. Alternatives: nono with the insecure proxy; bubblewrap outside nono (loopback and the bind mount both failed in the second run); Claude Code's sandbox alone. Consequences: the token in each session's environment (§13); Claude Code's own sandbox off where it can't start.
- **ADR 0051, agents plan through a plan-only role and run the gate.** Decisions 1 and 2, verbatim. The role, the plan request's container, the gate from his checkout of main, all off until P-2, P-3, P-6. Reverses CLAUDE.md's lines and amends ADR 0017's "the Author runs the gate".
- **ADR 0052, the studio line.** Decision 5, his studio and ComfyUI words, verbatim. Two folders, no network path between the sides, three rounds, the tools list, ComfyUI launched by the agent with his install read-only, his look approval last.

(ADR 0048 and 0049 are W1's; these renumber if W1 claims more.)

## §12 Order of work

1. **The container probe** (this branch). If a boundary row fails, stop (his Q8, carried over).
2. **After his approval and a probe that holds**, on `feat/017-the-night-shift`:
   1. G1, the runner and the requests, which don't depend on the images. Its tests use stub `docker`. Workers can already run under today's Claude Code sandbox here, so the Resume pilot can start before G2.
   2. G2, images and specs: the Dockerfiles, fragments, `build.py`, the specs, the lattice and never-mounted tests, the masks list from main's settings.
   3. G3, the studio line: schemas, `line.py`, the round rule, and the ComfyUI request.
   4. G4, red-team rows, and the install script with its stub tests.
   5. G5, ADRs, how-we-build, runbook, the `iam.tf` role's tests, and patches P-1 to P-10.
   6. G6, the merge-request note; `make lint`, `make test`, `make evals` pasted.
3. **The install-and-rehearse script** to him, from G6's reviewed SHA.
4. **After his run**: fixes until R1 to R4 pass; then the Resume pilot in containers.

## §13 Risks

- **The token is readable by a session's own commands.** In a container without Claude Code's sandbox, any command can print its environment. Its bounds:
  - it's the night shift's own token, revocable without touching his sign-in;
  - it signs in only on the plan;
  - it carries no AWS or repository power;
  - the container's only way out is the allowlist, so it can reach only Anthropic's API.

  A gap row records it. If the probe shows Claude Code's sandbox can start inside the container, its denied-variable list hides the token from commands too (P-1).
- **Claude Code's sandbox may not start inside a container** (Docker's default seccomp refuses new user namespaces). The container is the boundary either way.
- **Stage S of the matrix** checks Claude Code's sandbox masks from inside it. In a container without that sandbox, its rows may fail even though the read-only binds hold. The rehearsal's R3 shows which rows. A fix to read the container's masks is P-5's, his.
- **ComfyUI's custom nodes may write into their own folders.** Read-only, those writes fail. Nodes that need it get a named writable folder, decided from the first studio run, never the whole install.
- **Terms of use for ten unattended sessions** (Q14).
- **The host's Docker socket in the runner's hands**: the runner is the Author's reviewed code. It starts only the images the install built, by digest, with the specs' flags, and the stub tests check its command lines.

## §14 Proof

- pytest: specs, lattice, never-mounted list, masks from main's settings, the runner's command lines, queue, locks, limit, idle, page, requests, `line.py`, and the install and probe scripts with stubs.
- The container probe, then the rehearsal (R1 to R4, later R5 and R6).
- The pilot's page (SC-004).

## §15 Cost

No paid route. Sessions sign in on the plan and fail closed on API keys; extra usage is off in his account. The plan role and its reads are free. Ten workers spend the weekly allowance faster, and the runner waits for the reset rather than buying more. Disk: four images, about 4 GB together; C: has 51 GB free, and the images live on WSL's disk.

## §16 Degraded modes

As the spec's. Plus: if an image's digest or a spec's SHA-256 no longer matches, `night.py start` refuses and says so.

## Questions for the Author

| # | Question | Answer |
|---|---|---|
| Q1 | Where does the gate run? | **His**: "It can use my checkout of main" |
| Q2 | How do sessions sign in? | **His**: "ensure setup-token can work with the Subscription Ultra Plan and doesnt require API credits". The plan: a `setup-token` token, `forceLoginMethod: "claudeai"`, and API-billing variables refused (FR-041) |
| Q3 | Where does the example copy live? | Recommended: `deploy/night-shift/containers/`, human-only by P-1 |
| Q4 | Does a plan take the state's lock? | Recommended: yes, `*.tflock` only |
| Q5 | Does the studio read `/srv/studio/outputs`? | **His**: yes, once he's emptied it |
| Q6 | Where does the decision page live? | Recommended: `docs/night-shift/<date>.md` on the supervisor's branch |
| Q7 | May the gate run `--prove`? | Recommended: no |
| Q8 | If a boundary fails, continue or stop? | **His**: stop |
| Q10 | The constitution's roles list: amend or deviate? | Recommended: amend, P-9 |
| Q13 | Prompts and settings layers outside `.claude/`? | Recommended: yes, with P-10 |
| **Q14** | Ten unattended sessions on one subscription: the docs say OAuth is "intended for ordinary Claude Code use" and point products to API keys, and the session couldn't find what the consumer terms say about unattended, concurrent use. Proceed? | Recommended: **yes, for your own development of your own project, which is ordinary Claude Code use**. Start the pilot at two to three workers; you confirm the terms yourself, or ask Anthropic |
| Q15 | ComfyUI's launch parameters? | **His**: "--birefnet" and sometimes it was run with that parameter off, depending on the asset output that was needed. The allowlist is `--birefnet`, on or off per task; the runner fixes `--listen`, `--port`, and the folders. It isn't one of ComfyUI's core flags, as far as the session knows, so the first studio task checks that ComfyUI accepts it at launch |
| **Q16** | Per-worker limits: 2 CPUs and 4 GB each (ten use 20 of your 24 cores, 40 of your 62 GB)? | Recommended: yes |

Q9, Q11, and Q12 were nono's, and closed with it.

## Complexity Tracking

| Departure | Why needed | Simpler alternative rejected because |
|---|---|---|
| A runner outside the containers | Only it may use the host's Docker socket | A session with the socket could start anything as the Author |
| An egress container per network | An internal network has no route out, by design | Anthropic's devcontainer firewall needs `NET_ADMIN` in the session's own container |
| The engine forwarder | The egress proxy refuses IP literals and `198.18.0.0/15`, by design | Widening the proxy would widen every session's egress |
