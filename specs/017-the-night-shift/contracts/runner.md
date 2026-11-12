# Contract: the runner (`night.py`)

Installed copy only: `~/.local/share/h4reet-ai/night-shift/night.py`, run as `/usr/bin/python3 -I -B night.py <command>`. The Author never runs the copy in the repository. It is the only process that uses the host's Docker socket.

Its own `git` runs as `git -c core.hooksPath=/dev/null -c core.fsmonitor=false` with `GIT_NO_REPLACE_OBJECTS=1` and `GIT_CONFIG_NOSYSTEM=1`, because it runs outside every container in worktrees agents write. It names main only as `refs/heads/main`. Its `docker` runs with the Author's own client configuration, and no session ever sees it.

Added in the build (G1), each for a reason:
- Its git drops the caller's `GIT_*` variables. In a session's worktree it sets `GIT_DIR` (the worktree's folder under `.git/worktrees/`, recorded when the runner made it), `GIT_COMMON_DIR`, and `GIT_WORK_TREE` itself, and never reads the worktree's own `.git` file again: a session can rewrite that file, and only the common config is out of its reach.
- What it reads or writes in a folder a session can write (the queue, the page, the inbox and outbox) it opens one component at a time with `O_NOFOLLOW`, so a planted link can't make it read or write elsewhere as the Author.
- `installed.txt` is `~/.local/share/h4reet-ai/night-shift/installed.txt`, with lines `file <path> <sha256>`, `image <ref> <id>`, and `network <name> <id>` (the install, G4, writes it).

## 1. Commands

| Command | Does |
|---|---|
| `start` | the preflight (§2), then egress, engine-fwd, the supervisor, and the queue loop |
| `stop` | `docker stop` (SIGTERM, then SIGKILL after 60 s) on every night container; prints each task's state |
| `status` | each task's state, the locks' holders, the next reset if waiting |
| `check` | the preflight alone |

Exit codes: 0 on success, 1 when a check refuses, 2 when it can't run.

## 2. Preflight (refuses on the first failure, with one line)

- each live spec's SHA-256 is the one in `installed.txt`, and none has the example marker or sits outside `~/.config/h4reet-ai/night-shift/containers/`;
- each image's ID is the one the install recorded;
- the token file `~/.config/h4reet-ai/night-shift/claude.env` exists, is mode 0600, and holds exactly one line, `CLAUDE_CODE_OAUTH_TOKEN=…`. The runner never prints it;
- the runner's own environment holds none of `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY` (FR-041);
- the networks `h4-night`, `h4-night-studio`, `h4-night-plan`, and `h4-night-engine` exist and are internal, and so does every network a live spec names. `h4-night-engine` is the build's addition: `engine-fwd` sits on it alone, so a role without it has no route to the forwarder (plan §9's row). The install (G4) makes it, and the implementer, red-teamer, and ops specs (G2) name it;
- the facts file is valid (data-model.md); if not, the runner can't run (exit 2);
- `/` and `/mnt/c` each have at least 30 GB free, and free memory is at least 8 GB (the 2026-10-08 rule; settings);
- no other `night.py start` holds the runner's own lock.

## 3. Starting a session

The runner turns a role's live spec into one `docker run` line. A test checks the line for each role:

```text
docker run --rm --name h4-night-<task> --user <uid>:<gid> \
  --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,nosuid,size=2g \
  --memory 4g --cpus 2 --pids-limit 512 --network h4-night [--network h4-night-engine] \
  --env-file ~/.config/h4reet-ai/night-shift/claude.env \
  -e HTTPS_PROXY=http://egress:3128 -e NO_PROXY=engine-fwd -e SANDBOX_RUNTIME=1 \
  -e CLAUDE_CONFIG_DIR=/night/claude -e DISABLE_AUTOUPDATER=1 -e DISABLE_TELEMETRY=1 \
  -e DISABLE_ERROR_REPORTING=1 -e CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
  -v <worktree>:<worktree>:rw -v <repo>/.git:<repo>/.git:rw \
  -v <repo>/.git/hooks:<repo>/.git/hooks:ro …(each mask, contracts/containers.md §4) \
  …(the role's own mounts, from its spec) \
  -v <role claude folder>:/night/claude:rw -v <NIGHT_ROOT>/.io/<task>:/night/io:rw \
  -w <worktree> h4-night-worker:<sha12> \
  claude -p "<prompt>" --output-format stream-json --verbose --settings /night/settings-<role>.json
```

- The role's settings layer is baked into the image at `/night/settings-<role>.json`, from the reviewed commit. (The plan's draft said `/night/settings.json`; one worker image serves seven roles, so each layer has its own name, as tasks.md T033 says.)
- The task's own mounts, in order: the worktree and `.git`, then the masks `.git/{hooks,config,info,packed-refs,refs/heads/main,refs/tags,objects/info,HEAD,index}`, the task's `commondir`, the other `.git` paths main's settings deny (`refs/replace`), then the worktree paths main's settings deny. `HEAD` and `index` are the build's addition to containers.md §4's list: they are the main checkout's own, no worktree uses them, and unmasked a session could move the Author's HEAD or rewrite his index.
- A `.git` mask target that's missing is made first, so a session can't create it: an empty `packed-refs`, a loose `refs/heads/main` holding main's SHA, or an empty folder. A missing `config` or `HEAD` refuses the start; a missing `index` isn't masked. A worktree path that's absent (main's `./makefile`) isn't masked, and the log says so: docker would make it as root, in the worktree. A mask path that is a link refuses the start.
- Reading roles (reviewer, red-teamer, gate-runner) mount the worktree and `.git` read-only and need no masks. The studio has no worktree and works in `/night/io`.
- Worktrees are `<NIGHT_ROOT>/<date>/<task>` on `night/<task>/<slug>` (the supervisor's on `night/supervisor/<date>`). A worktree the runner didn't make, or whose `gitdir` and `commondir` don't name the repository, refuses the start.
- A spec's mount may not lie over a task mount, nor sit at `/`, `/etc`, `/usr`, `/night/claude`, `/night/io`, or `/night/settings*`; and no spec mount (only the runner's task mounts) touches the main checkout, `.git` included.
- `--bare` never appears.
- Starts are staggered by 10 s.
- Before any task with the `gpu` lock starts, the disk and memory checks run again; a failure leaves the task queued and writes the reason on the page (FR-031).

## 4. Watching

- **A usage limit**: a stream event whose text matches the limit's message and carries a reset time. The runner stops every night container, sleeps once until the reset plus 300 s, and requeues `running` tasks. With no parseable time, it stops the night and records why. That sleep is its only timer. It never answers an extra-usage prompt; headless, none can be accepted.
  - The message's text isn't documented, so the matcher is one named pattern in `night.py` (`LIMIT_TEXT`): "usage limit", "limit reached", or "hit your limit", case-insensitive; the reset as epoch seconds after a `|`, an ISO-8601 time with its zone, or a clock time after "resets" in the named zone or the host's. Only Claude Code's own messages count: a `result` event with `is_error: true`, or an `assistant` event whose model is `<synthetic>`, under 500 characters. A tool's output or the model's words never stop the night. The first real limit confirms the text.
  - Three sessions failing within 120 s of starting stop the night, with a page line: probably a limit the matcher missed, and the queue isn't burned through.
- **Idle**: no stream event for `IDLE_MINUTES` (15), `git status --porcelain` empty in the worktree, and the container's process list showing only `claude` and its idle children (`claude` or `node`). The runner stops the container and records "stopped: waited with nothing to do".
- **End**: the stream's result event, or the container's exit. If the worktree is dirty, that's recorded; the runner never commits.
- **The supervisor**: when a worker ends or stops idle while the supervisor isn't running, the runner starts the supervisor again, telling it which task ended and how. The night ends when no session runs, no request is pending, and no queued task can start.

## 5. Requests (inbox and outbox)

A worker writes `/night/io/out/<n>.json` (on the host, `<NIGHT_ROOT>/.io/<task>/out/`); the runner answers in `in/<n>.json`.

- **`{"kind":"plan","root":"bootstrap|account|prod","sha":"<40 hex>"}`**: refused while `NIGHT_PLAN=off` ("off: waiting for P-2, P-3, P-6"). When on:
  - a detached worktree at the SHA;
  - `aws configure export-credentials --profile $PLAN_AWS_PROFILE --format env-no-export` into a 0600 file in the runner's state folder;
  - `docker run` with `plan.json`'s spec and that `--env-file`, running the SHA's `scripts/infra/infra_plan.py --root <root>`;
  - the file deleted, and the redacted block or the refusal line returned.
- **`{"kind":"gate","sha":"<40 hex>"}`**: refused while `NIGHT_GATE=off`. When on: only while `REPO`'s HEAD is `refs/heads/main` and its tree is clean (else answered with that reason), under the `gate` lock, `/usr/bin/python3 -I -B tools/gates/gate <sha>` on the host from `REPO`, never `--prove`. The answer is the log's path and its `gate:` and `merge:` lines.
- **`{"kind":"comfyui","action":"start","params":[…]}`**: only from a studio task holding the `gpu` lock. Each parameter must be in the installed allowlist (seeded from the Author's launch lines), else the request is refused, naming it. The runner starts the comfyui container (`comfyui.json`) on `h4-night-studio` and answers when `GET /system_stats` responds, or after 120 s with the container's last log lines.
- **`{"kind":"comfyui","action":"stop"}`**, and the end of the task: the runner stops it.
- **Anything else**: refused.

Details the build fixed:
- A request holds only the keys shown; any other key (`"prove"`, `"apply"`) refuses it. Plan requests come only from ops tasks, gate requests only from gate-runner tasks (plan §2's table). While off, both answer `off: waiting for P-2, P-3, P-6` whatever the role.
- An answer is `{"n", "kind", "ok", "answer", …}`. The gate's also holds `log` (`/night/io/in/<n>.log`, the log copied into the task's inbox) and `lines`.
- The gate request takes the `gate` lock for its run unless its task already holds it, and answers "the gate lock is held" if another process holds it.
- The plan's container is `h4-night-plan-<task>-<n>`, with `egress-plan` (`allowlist-plan.json`) on `h4-night-plan` for the run; its detached worktree is under the runner's state folder and mounted read-only; the credentials file is deleted after the run and swept at the night's start and end.
- ComfyUI's allowlist is `~/.config/h4reet-ai/night-shift/comfyui-params.json`, `{"schema": 1, "params": ["--birefnet"]}` (its content is G3's, T045). Each parameter is a whole token; `--listen`, `--port`, `--output-directory`, `--temp-directory`, and `--user-directory` are the runner's alone. The command is `<COMFYUI_VENV>/bin/python main.py --listen 0.0.0.0 --port <COMFYUI_PORT> --output-directory /srv/studio/outputs --temp-directory /comfyui/temp --user-directory /comfyui/user <params>`, in `<COMFYUI_DIR>`, so `comfyui.json` (G2) mounts its writable folders at `/comfyui/temp` and `/comfyui/user`. Readiness is `docker exec` of the venv's Python fetching `/system_stats` on its own loopback.
- The egress helpers: `h4-night-egress` and `h4-night-egress-studio` run the egress image on `h4-night-out` with the allowlist at `/etc/h4-egress/settings.json` and their log in the runner's state folder, then join `h4-night` (alias `egress`) and `h4-night-studio` (alias `egress-studio`). `h4-night-engine-fwd` runs the worker image's `socat` to `198.18.0.1:2376` alone and joins `h4-night-engine` (alias `engine-fwd`). The worker image therefore has no entrypoint of its own (G2).

## 6. Naming a finished stack

When the supervisor marks a stack done in `queue.json` with `"name": "feat/NNN-…"`, the runner runs `git branch <name> <tip>` if the name is free, outside every container, and writes it on the page.
