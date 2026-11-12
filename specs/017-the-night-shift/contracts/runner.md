# Contract: the runner (`night.py`)

Installed copy only: `~/.local/share/h4reet-ai/night-shift/night.py`, run as `/usr/bin/python3 -I -B night.py <command>`. The copy in the repository is never run by the Author.

Its own `git` runs as `git -c core.hooksPath=/dev/null -c core.fsmonitor=false` with `GIT_NO_REPLACE_OBJECTS=1` and `GIT_CONFIG_NOSYSTEM=1`, because it runs outside every sandbox in worktrees agents write (the review's finding 11). It names main only as `refs/heads/main`.

## 1. Commands

| Command | Does |
|---|---|
| `start` | the preflight (§2), then the supervisor, then the queue loop |
| `stop` | SIGINT to every session, SIGTERM after 60 s; prints each task's state |
| `status` | each task's state, the locks' holders, the next reset if waiting |
| `check` | the preflight alone |

Exit codes: 0 on success, 1 when a check refuses, 2 when it can't run.

## 2. Preflight (refuses on the first failure, with one line)

- nono's SHA-256 is the pin recorded by the install;
- each live profile's SHA-256 is the one in `installed.txt`, and none has the example marker;
- `LAYERING` is set;
- `/` and `/mnt/c` each have at least 30 GB free, and free memory is at least 8 GB (the 2026-10-08 rule; settings);
- no other `night.py start` holds the runner's own lock.

## 3. Starting a session

Before any task with the `gpu` lock starts, the disk and memory checks of §2 run again; a failure leaves the task queued and writes the reason on the page (FR-031).

```text
nono run --rollback --profile ~/.config/h4reet-ai/nono/<role>.json \
  --allow <worktree> --allow <repo>/.git/worktrees/<task> \
  --allow <repo>/.git/refs/heads/night/<task> --allow <repo>/.git/logs/refs/heads/night/<task> \
  [--allow <repo>/.git/objects]                                    # writing roles
  --env-credential CLAUDE_CODE_OAUTH_TOKEN \
  -- <CLAUDE_BIN> -p <prompt> --output-format stream-json --settings <role settings layer>
```

The environment: `CLAUDE_CONFIG_DIR=<role folder>`, `TMPDIR=<task tmp>`, `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=gc.auto`, `GIT_CONFIG_VALUE_0=0`, and nothing else from the Author's environment but `PATH`, `HOME`, `LANG`, `TERM`.

Each worker gets its worktree on `night/<task>/<slug>`, made with `git worktree add -b`. Starts are staggered by 10 s.

## 4. Watching

- **A usage limit**: a stream event whose text matches the limit's message with a reset time. The runner stops all sessions, sleeps once until the reset plus 300 s, and requeues `running` tasks. With no parseable time, it stops the night and records why. It has no timer but that one.
- **Idle**: no stream event for `IDLE_MINUTES` (15), `git status --porcelain` empty, and no child process but the session's own. The runner stops the session and records "stopped: waited with nothing to do".
- **End**: the stream's result event. If the worktree is dirty, that's recorded; the runner never commits.

## 5. Requests (inbox and outbox)

A worker writes `<NIGHT_ROOT>/.io/<task>/out/<n>.json`; the runner answers in `<NIGHT_ROOT>/.io/<task>/in/<n>.json`. The folder sits outside the worktree, so nothing touches the repository's human-only `.git/info/exclude`; the task's grants add `--allow` on its own `.io/<task>` (contracts/profiles.md §6 counts it).

- **`{"kind":"plan","root":"bootstrap|account|prod","sha":"<40 hex>"}`**: refused while `NIGHT_PLAN=off`. When on: a detached worktree at the SHA, then `aws configure export-credentials --profile $PLAN_AWS_PROFILE --format env-no-export` into the runner's memory, then `nono run --profile plan.json --env-credential …` running the SHA's `scripts/infra/infra_plan.py --root <root>`. The answer is the block or the refusal line.
- **`{"kind":"gate","sha":"<40 hex>"}`**: refused while `NIGHT_GATE=off`. When on: only while `REPO`'s HEAD is `refs/heads/main` and its tree is clean (else answered with that reason), under the `gate` lock, `nono run --profile gate.json -- /usr/bin/python3 -I -B tools/gates/gate <sha>` from `REPO`, the Author's checkout ("It can use my checkout of main"). The answer is the log's path and its `gate:` and `merge:` lines. Never `--prove`.
- **Anything else**: refused.

## 6. Naming a finished stack

When the supervisor marks a stack done in `queue.json` with `"name": "feat/NNN-…"`, the runner runs `git branch <name> <tip>` if the name is free, outside the sandbox, and writes it on the page.
