# feat/000-us1-local-stack
Spec: specs/000-local-foundations/ (Phase 3, User Story 1: tasks T048–T066) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5) as the integrator, with three implementer agents (the gateway, the operator CLI, the stack); reviewed by read-only reviewer agents · Date: 2026-10-09
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes
Authorized by: spec 000's plan.md and tasks.md, and the Author's "Continue into Phase 3" (2026-10-08), given before stepping away for the night.

**Status: DRAFT. Not ready to merge.**
- In: the operator CLI (T056) and the stack (T057–T062), with `make check` passing on them.
- Left:
  - the gateway's adapter, routes, and admin API (T048–T055), still being built;
  - the review rounds;
  - the convergence pass (T064 needs the probe image that tasks.md gives T080, so it comes forward);
  - the final `make check`;
  - this note.

**Merge order:** this branch is stacked on `feat/000-foundations` (8a854f8). Merge that branch first, and run its T046; then this one, once this block is gone.

## Runs in the Author's terminal

ADR 0017 puts this section first. Nothing here has run outside the sandbox: there is no Docker, GPU, or registry in it.

| What | How it runs | Check before you run it |
|---|---|---|
| **`scripts/operator.py`** (T056) and **`make operator-token`, `operator-status`, `operator-init`** | through `PY_HOST`, by path, with your real token | It reads the token only from `~/.config/h4reet-ai/operator/<stack>.token` (0600, yours, in a 0700 directory, never through a link), or from `--token-stdin`. It sends the token only to its own stack's port on `127.0.0.1` or `localhost` (18003, 18103, or 18303), with no proxy and no redirects, and never prints it. It refuses an answer that names another stack. For dev-cpu it calls 18303 directly and runs no Docker in your terminal. It runs the working tree's copy, so check `git status` before you use it. |
| **`deploy/scripts/pull-models.sh`** (T057), and `make pull MODELS=…` | your terminal, Heavy | It runs the disk preflight first, downloads over https with no token, and checks size and sha256 before it makes the file read-only and renames it. |
| **`deploy/scripts/isolation-check.sh`** and **`make isolation-check`** (T061) | your terminal, with prod and dev both up | It runs a throwaway probe container on each stack's networks, from the pinned Python image, with no mounts, no capabilities, and a read-only root. |
| **`tools/gates/compose_policy.py`** | the sandbox, and later the gate | It now reports an image whose `images.lock` entry is still open as PLANNED (T063), not FAIL. Preflight still refuses to start a stack with it. This becomes human-only with T098: please review it. |

## What changed and why

| Commits | Change |
|---|---|
| 88e8b3d | **The operator CLI:** `mint`, `status`, and `init`, `AdminClient` for the evals, and the three make targets. Departures in operator-admin.md §6. |
| a9e7878, then five commits titled "(T056's review)" | **The operator CLI's review fixes:**<br>- make passes command-line values as typed, with a test that runs `make operator-init`;<br>- dev-cpu hops only inside the sandbox, through the relay, and from your terminal calls 18303 directly, with no Docker;<br>- a token goes only to its own stack's port, prod's never to an in-network host;<br>- an answer that names another stack is exit 4;<br>- tests for the token file's fstat and the unredirected `Authorization`;<br>- the summaries name the CLI's own stack.<br>Contract text is in operator-admin.md §6, §6.1, and §6.2. |
| 19af254 | **T057:** the model servers, `deploy/models.lock`, and `pull-models.sh`; disclosure rows S4 and P3. |
| 2396aa9 | **T058:** the collector, Prometheus, Loki, and Grafana, with their configs. |
| fd81f67, 6d38a3a | **T059:** Langfuse 4.54.0, ClickHouse, Valkey, and SeaweedFS. |
| fd5454a | **T060:** the `h4-runtime` dashboard's US1 panels. |
| 99e14b2 | **T061:** `make isolation-check`. |
| c8854ab | **T062:** three runbooks. |

## For the Author

Your steps on this branch, after foundations is merged and its T046 is done:
1. **T063 (Heavy, with no agent working):** `make pin-images`, which pins SeaweedFS too; `make pull MODELS=all`; then `deploy/agents-engine/engine.sh seed`. Commit the pins on this branch.
2. **T064** is an agent session on the engine. Ask me to run it once the engine is up.
3. **T065 (Heavy):** quickstart.md §0.7–§0.8 and §1: the env files and tokens, the Telegram bot and mailbox, the first measurements, a cold `make up ENV=prod`, timed for SC-001, and the rollback rehearsal on dev.
