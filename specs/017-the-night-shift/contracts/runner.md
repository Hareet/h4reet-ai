# Contract: the runner (`night.py`)

Installed copy only: `~/.local/share/h4reet-ai/night-shift/night.py`, run as `/usr/bin/python3 -I -B night.py <command>`. The Author never runs the copy in the repository. It is the only process that uses the host's Docker socket.

Its own `git` runs as `git -c core.hooksPath=/dev/null -c core.fsmonitor=false` with `GIT_NO_REPLACE_OBJECTS=1` and `GIT_CONFIG_NOSYSTEM=1`, because it runs outside every container in worktrees agents write. It names main only as `refs/heads/main`. Its `docker` runs with the Author's own client configuration, and no session ever sees it.

Added in the build (G1), each for a reason:
- Its git drops the caller's `GIT_*` variables, and sets `GIT_COMMON_DIR=<repo>/.git` (and `GIT_DIR`) on every call (G1's review, B1), so no `commondir` file, a planted top-level one included, ever steers which config or refs it reads. In a session's worktree it sets `GIT_DIR` (the worktree's folder under `.git/worktrees/`, recorded when the runner made it) and `GIT_WORK_TREE` itself, and never reads the worktree's own `.git` file again: a session can rewrite that file, and only the common config is out of its reach.
- What it reads or writes in a folder a session can write (the queue, the page, the inbox and outbox) it opens one component at a time with `O_NOFOLLOW`, so a planted link can't make it read or write elsewhere as the Author.
- `installed.txt` is `~/.local/share/h4reet-ai/night-shift/installed.txt`, with lines `file <path> <sha256>`, `image <ref> <id>`, and `network <name> <id>` (the install, G4, writes it). The install's own `sha`, `dir`, and `scratch` lines are for `--undo`, and the runner ignores them (contracts/install.md).

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
- none of `commondir`, `main`, `refs/main`, `refs/remotes/main`, or `refs/tags/main` exists in the repository's `.git`, and `packed-refs` names none of those refs (G1's review, B1): a top-level `commondir` would steer any git run without `GIT_COMMON_DIR` (the Author's, the gate's), and a ref named main anywhere else shadows the branch;
- `/` and `/mnt/c` each have at least 15 GB free, and free memory is at least 8 GB (the 2026-10-08 rule's check; 30 GB until the first install, 2026-11-12);
- no other `night.py start` holds the runner's own lock.

## 3. Starting a session

The runner turns a role's live spec into one `docker run` line. A test checks the line for each role:

```text
docker run --rm --name h4-night-<task> --user <uid>:<gid> \
  --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,exec,nosuid,size=2g \
  --memory 4g --cpus 2 --pids-limit 512 --network h4-night [--network h4-night-engine] \
  --env-file ~/.config/h4reet-ai/night-shift/claude.env \
  -e HTTPS_PROXY=http://egress:3128 -e NO_PROXY=engine-fwd -e SANDBOX_RUNTIME=1 \
  -e CLAUDE_CONFIG_DIR=/night/claude -e DISABLE_AUTOUPDATER=1 -e DISABLE_TELEMETRY=1 \
  -e DISABLE_ERROR_REPORTING=1 -e CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
  -v <worktree>:<worktree>:rw -v <repo>/.git:<repo>/.git:ro \
  -v <git>/objects:…:rw -v <git>/objects/info:…:ro \
  -v <git>/worktrees/<admin>:…:rw -v <git>/worktrees/<admin>/commondir:…:ro \
  -v <git>/refs/heads/night/<task>:…:rw -v <git>/logs/refs/heads/night/<task>:…:rw \
  …(the worktree paths main's settings deny, :ro) \
  -v <share>/gate/gitleaks.toml:<repo>/.gitleaks.toml:ro …(the role's own mounts, from its spec) \
  -v <role claude folder>:/night/claude:rw -v <NIGHT_ROOT>/.io/<task>:/night/io:rw \
  -w <worktree> <the ID installed.txt records for h4-night-worker:<sha12>> \
  claude -p "<prompt>" --output-format stream-json --verbose --settings /night/settings-<role>.json
```

- The role's settings layer is baked into the image at `/night/settings-<role>.json`, from the reviewed commit. (The plan's draft said `/night/settings.json`; one worker image serves seven roles, so each layer has its own name, as tasks.md T033 says.)
- The task's own mounts, in order (FR-012's narrow mount; G1's review, B1): the worktree read-write; the repository's `.git` read-only; then read-write only where a commit on the task's own branch writes, each made outside before the run: `objects` (with `objects/info`, the alternates, read-only over it), the task's `worktrees/<admin>` (with its `commondir` read-only over it), `refs/heads/night/<task>`, and `logs/refs/heads/night/<task>`; then any `.git` path main's settings deny that falls under one of those (a denied path that holds one refuses the start); then the worktree paths main's settings deny; then main's committed `.gitleaks.toml` from `<share>/gate/`, read-only at `<repo>/.gitleaks.toml`. Everything else in `.git` (hooks, config, info, packed-refs, refs/heads/main, refs/tags, refs/replace, HEAD, index, other branches, other worktrees) lies under the read-only `.git` and needs no mask. A session's git can commit on `night/<task>/<slug>`; it can't stash, make another branch, add a worktree, or gc into the common folder, and those fail.
- The container probe tested the broad shape (all of `.git` read-write, with masks). The rehearsal's commit row (R3, R4) proves this narrow one.
- A missing `objects/info` is made first; a missing denied path under a read-write mount isn't masked, and the log says so. A worktree path that's absent (main's `./makefile`) isn't masked, and the log says so: docker would make it as root, in the worktree. A mask path or read-write folder that is a link refuses the start.
- Every container (sessions, helpers, the plan, ComfyUI) starts by the image ID `installed.txt` records for its tag, never by the tag, so a tag moved after the preflight changes nothing.
- A spec may join `h4-night-engine` only for implementer, red-teamer, or ops, and then its `NO_PROXY` must name `engine-fwd`.
- Reading roles (reviewer, red-teamer, gate-runner) mount the worktree and `.git` read-only and need no masks. The studio has no worktree and works in `/night/io`.
- Worktrees are `<NIGHT_ROOT>/<date>/<task>` on `night/<task>/<slug>` (the supervisor's on `night/supervisor/<date>`). A worktree the runner didn't make, or whose `gitdir` and `commondir` don't name the repository, refuses the start.
- A spec's mount may not lie over a task mount, nor sit at `/`, `/etc`, `/usr`, `/night/claude`, `/night/io`, or `/night/settings*`; and no spec mount (only the runner's task mounts) touches the main checkout, `.git` included.
- `--bare` never appears.
- Starts are staggered by 10 s.
- A task that holds a worktree also gets `refs/heads/main:.gitleaks.toml`, written by the runner into `<share>/gate/gitleaks.toml` at 0444 and mounted read-only at `<repo>/.gitleaks.toml`, where make check's secrets gate reads it; nothing else of the main checkout is mounted (T090 round 2).
- Before any task starts (with the `gpu` lock or not, since 2026-11-12), the disk and memory checks run again; a failure leaves the task queued and writes the reason on the page (FR-031).
- Every container (sessions, helpers, the plan, ComfyUI) runs with `--init` (FR-014), so a session's orphaned children are reaped.
- **The memory sum** (FR-014): a container starts only while the memory limits of every running night container (sessions, the egress helpers and engine-fwd, ComfyUI, a running plan and its egress) plus the new one sum to no more than the host's total memory (`MemTotal`) less 8 GB. Otherwise a queued task stays queued with one page line, a ComfyUI or plan request is refused with the reason, and the supervisor's start refuses. On a studio night that holds the studio's 8 GB and ComfyUI's 24 GB against the workers.
- **The never-mounted check** at every start covers contracts/containers.md §3 whole: besides the secrets and sockets, `~/.local/state/h4reet` and `~/.local/state/h4reet-ai`, the provider mirror `~/.local/share/h4reet/terraform-providers` (but for `plan.json`), `/srv/studio/workflows` and `/srv/studio/outputs` (but for the studio; ComfyUI keeps the outputs), and, for the session roles, every path outside the worktree in main's `sandbox.filesystem.denyRead` and `sandbox.credentials.files`, with `~` expanded.

## 4. Watching

- **A usage limit**: a stream event whose text matches the limit's message and carries a reset time. The runner stops every night container, sleeps once until the reset plus 300 s, and requeues `running` tasks. With no parseable time, it stops the night and records why. That sleep is its only timer. It never answers an extra-usage prompt; headless, none can be accepted.
  - The message's text isn't documented, so the matcher is one named pattern in `night.py` (`LIMIT_TEXT`): "usage limit", "limit reached", or "hit your limit", case-insensitive; the reset as epoch seconds after a `|`, an ISO-8601 time with its zone, or a clock time after "resets" in the named zone or the host's. Only Claude Code's own messages count: a `result` event with `is_error: true`, or an `assistant` event whose model is `<synthetic>`, under 500 characters. A tool's output or the model's words never stop the night. The first real limit confirms the text.
  - Three sessions failing within 120 s of starting stop the night, with a page line: probably a limit the matcher missed, and the queue isn't burned through.
  - A reset already past, or more than 8 days ahead, counts as no usable time: the night stops with a page line. A second limit within 10 minutes of resuming stops the night instead of waiting again.
- **Idle**: no stream event for `IDLE_MINUTES` (15), `git status --porcelain` empty in the worktree, no request of the task's still pending, and the container's process list showing only `claude` and its idle children (`claude` or `node`). The runner stops the container and records "stopped: waited with nothing to do".
- **End**: the stream's result event, or the container's exit. If the worktree is dirty, that's recorded; the runner never commits.
- **The supervisor**: when a worker ends or stops idle while the supervisor isn't running, the runner starts the supervisor again, telling it which task ended and how. The night ends when no session runs, no request is pending, and no queued task can start.
- **A stop** (`night.py stop`'s SIGTERM, or Ctrl-C): a second signal is ignored, not an abort of the cleanup. A running gate's process group gets SIGTERM, then SIGKILL after 10 s, while its lock is still held; a running plan's container and `h4-night-egress-plan` are stopped; then every session stops, unfinished tasks stay queued, and the plan's credentials are swept. The helpers' stop includes `h4-night-egress-plan`.
- An unreadable or linked `queue.json` is refused once, not at every look.

## 5. Requests (inbox and outbox)

A worker writes `/night/io/out/<n>.json` (on the host, `<NIGHT_ROOT>/.io/<task>/out/`); the runner answers in `in/<n>.json`.

- **`{"kind":"plan","root":"bootstrap|account|prod","sha":"<40 hex>"}`**: refused while `NIGHT_PLAN=off` ("off: waiting for P-2, P-3, P-6"). When on:
  - a detached worktree at the SHA;
  - `aws configure export-credentials --profile $PLAN_AWS_PROFILE --format env-no-export` into a 0600 file in the runner's state folder;
  - `docker run` with `plan.json`'s spec and that `--env-file`, running the SHA's `scripts/infra/infra_plan.py --root <root>`;
  - the file deleted, and the redacted block or the refusal line returned.
- **`{"kind":"gate","sha":"<40 hex>"}`**: refused while `NIGHT_GATE=off`. When on: only while `REPO`'s HEAD is `refs/heads/main` and its tree is clean (else answered with that reason), under the `gate` lock, `/usr/bin/python3 -I -B tools/gates/gate <sha>` on the host from `REPO`, never `--prove`. The answer is the log's path and its `gate:` and `merge:` lines.
- **`{"kind":"comfyui","action":"start","params":[…]}`**: only from a studio task holding the `gpu` lock. Each parameter must be in the installed allowlist (seeded from the Author's launch lines), else the request is refused, naming it. The disk and memory checks run again first (FR-031); a failure refuses the request with the reason. The runner starts the comfyui container (`comfyui.json`) on `h4-night-studio` and answers when `GET /system_stats` responds, or after 120 s with the container's last log lines.
- **`{"kind":"comfyui","action":"stop"}`**, and the end of the task: the runner stops it.
- **Anything else**: refused.

Details the build fixed:
- A request holds only the keys shown; any other key (`"prove"`, `"apply"`) refuses it. Plan requests come only from ops tasks, gate requests only from gate-runner tasks (plan §2's table). While off, both answer `off: waiting for P-2, P-3, P-6` whatever the role.
- An answer is `{"n", "kind", "ok", "answer", …}`. The gate's also holds `log` (`/night/io/in/<n>.log`, the log copied into the task's inbox) and `lines`.
- The gate request takes the `gate` lock for its run unless its task already holds it, and answers "the gate lock is held" if another process holds it.
- The plan's container is `h4-night-plan-<task>-<n>`, with `egress-plan` (`allowlist-plan.json`) on `h4-night-plan` for the run. Its detached worktree is `<NIGHT_ROOT>/.plan/<sha12>-<task>-<n>`, mounted read-only, and so is the repository's `.git`, since the worktree's `.git` file points into `.git/worktrees/` (G2's integration review); the runner's state folder is never mounted. The plan's environment names no `AWS_` variable (the spec check refuses one): its credentials come only through the 0600 `--env-file`, which is deleted after the run and swept at the night's start and end.
- ComfyUI's allowlist is `~/.config/h4reet-ai/night-shift/comfyui-params.json`, installed from G3's `deploy/night-shift/comfyui-params.json` (T045): `{"schema": 1, "fixed_by_runner": ["--listen", …], "allowed": [{"flag": "--birefnet", "value": null, "optional": true, …}]}`. A request's parameter is allowed only if it is, as a whole token, the `flag` of an `allowed` entry whose `value` is null: flags only for now, so `--birefnet=x` is refused, and an entry with a non-null `value` allows nothing. A parameter naming a flag in the file's `fixed_by_runner`, or in the runner's own floor (`--listen`, `--port`, `--output-directory`, `--temp-directory`, `--user-directory`, which the file can add to but never remove), is refused as the runner's alone. Any other shape of the file (wrong `schema`, a missing list, an entry without `flag` and `value`, a flag not `--name`) fails closed: nothing is allowed. The command is `<COMFYUI_VENV>/bin/python main.py --listen 0.0.0.0 --port <COMFYUI_PORT> --output-directory /srv/studio/outputs --temp-directory /comfyui/temp --user-directory /comfyui/user <params>`, in `<COMFYUI_DIR>`, so `comfyui.json` (G2) mounts its writable folders at `/comfyui/temp` and `/comfyui/user`. Readiness is `docker exec` of the venv's Python fetching `/system_stats` on its own loopback.
- The egress helpers: `h4-night-egress` and `h4-night-egress-studio` run the egress image on `h4-night-out` with the allowlist at `/etc/h4-egress/settings.json` and their log in the runner's state folder, then join `h4-night` (alias `egress`) and `h4-night-studio` (alias `egress-studio`). `h4-night-engine-fwd` runs the worker image's `socat` to `198.18.0.1:2376` alone and joins `h4-night-engine` (alias `engine-fwd`). The worker image therefore has no entrypoint of its own (G2).

## 6. Naming a finished stack

When the supervisor marks a stack done in `queue.json` with `"name": "feat/NNN-…"`, the runner runs `git branch <name> <tip>` if the name is free, outside every container, and writes it on the page.

**The merge-time refusal** (G2's integration review). Masks can't cover a denied path a fresh worktree lacks, and with the index and objects writable a session can commit any content for a masked path (`git hash-object -w`, then `git update-index --cacheinfo`) without writing it. So, at every writing session's end and again before naming a stack, the runner:
- lists what the branch changes: `git merge-base refs/heads/main <tip>`, then `git diff-tree -r -z --name-only --no-renames <base> <tip>` (plumbing, so no diff configuration applies; a rename shows both names);
- matches each path against main's `sandbox.filesystem.denyWrite` (its `./` entries: the path or anything under it), the first `case` of main's `.claude/hooks/protected-paths.sh` (read by `git cat-file blob refs/heads/main:…`, first match wins as in bash, so `corpus/proposals/` stays open) and its protected Terraform names, and `deploy/night-shift/` (human-only by P-1; held in the runner until main's hook says so);
- writes one page line per path, once per task: `<task> touches a human-only path: <path>; the Author's patch route`;
- and doesn't name a stack that has any (`stack <name> not named: …`). A hook that can't be read or parsed refuses every name (fails closed).
