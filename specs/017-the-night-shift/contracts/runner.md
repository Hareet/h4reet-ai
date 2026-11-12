# Contract: the runner (`night.py`)

Installed copy only: `~/.local/share/h4reet-ai/night-shift/night.py`, run as `/usr/bin/python3 -I -B night.py <command>`. The Author never runs the copy in the repository. It is the only process that uses the host's Docker socket.

Its own `git` runs as `git -c core.hooksPath=/dev/null -c core.fsmonitor=false` with `GIT_NO_REPLACE_OBJECTS=1` and `GIT_CONFIG_NOSYSTEM=1`, because it runs outside every container in worktrees agents write. It names main only as `refs/heads/main`. Its `docker` runs with the Author's own client configuration, and no session ever sees it.

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
- the networks `h4-night`, `h4-night-studio`, and `h4-night-plan` exist and are internal;
- `/` and `/mnt/c` each have at least 30 GB free, and free memory is at least 8 GB (the 2026-10-08 rule; settings);
- no other `night.py start` holds the runner's own lock.

## 3. Starting a session

The runner turns a role's live spec into one `docker run` line. A test checks the line for each role:

```text
docker run --rm --name h4-night-<task> --user <uid>:<gid> \
  --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,nosuid,size=2g \
  --memory 4g --cpus 2 --pids-limit 512 --network h4-night \
  --env-file ~/.config/h4reet-ai/night-shift/claude.env \
  -e HTTPS_PROXY=http://egress:3128 -e NO_PROXY=engine-fwd -e SANDBOX_RUNTIME=1 \
  -e CLAUDE_CONFIG_DIR=/night/claude -e DISABLE_AUTOUPDATER=1 -e DISABLE_TELEMETRY=1 \
  -e DISABLE_ERROR_REPORTING=1 -e CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
  -v <worktree>:<worktree>:rw -v <repo>/.git:<repo>/.git:rw \
  -v <repo>/.git/hooks:<repo>/.git/hooks:ro …(each mask, contracts/containers.md §4) \
  -v <role claude folder>:/night/claude:rw -v <NIGHT_ROOT>/.io/<task>:/night/io:rw \
  -w <worktree> h4-night-worker:<sha12> \
  claude -p "<prompt>" --output-format stream-json --verbose --settings /night/settings.json
```

- The role's settings layer is baked into the image at `/night/settings.json`, from the reviewed commit.
- `--bare` never appears.
- Starts are staggered by 10 s.
- Before any task with the `gpu` lock starts, the disk and memory checks run again; a failure leaves the task queued and writes the reason on the page (FR-031).

## 4. Watching

- **A usage limit**: a stream event whose text matches the limit's message and carries a reset time. The runner stops every night container, sleeps once until the reset plus 300 s, and requeues `running` tasks. With no parseable time, it stops the night and records why. That sleep is its only timer. It never answers an extra-usage prompt; headless, none can be accepted.
- **Idle**: no stream event for `IDLE_MINUTES` (15), `git status --porcelain` empty in the worktree, and the container's process list showing only `claude` and its idle children. The runner stops the container and records "stopped: waited with nothing to do".
- **End**: the stream's result event, or the container's exit. If the worktree is dirty, that's recorded; the runner never commits.

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

## 6. Naming a finished stack

When the supervisor marks a stack done in `queue.json` with `"name": "feat/NNN-…"`, the runner runs `git branch <name> <tip>` if the name is free, outside every container, and writes it on the page.
