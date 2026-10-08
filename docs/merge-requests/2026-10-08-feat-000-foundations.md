# feat/000-foundations (DRAFT: a save point at the usage limit, not ready to merge)
Spec: specs/000-local-foundations/ (Phase 2: T015–T047) · Written by: Claude Code (Opus 5.5), the main session plus three implementer agents in worktrees · Date: 2026-10-08
Authorized by: the Author, 2026-10-08: "See if you can branch off our current work to continue and then our merge process will be later and contain more steps but that should let you be unblocked."

**Merge order:** `feat/000-setup` first, then this branch, which starts from its tip (068a674).

## Done on this branch

- **T022:** the config patch, `docs/merge-requests/2026-10-08-feat-000-foundations-config.patch`. It creates `config/budgets.yaml` and `config/alerts.yaml` exactly as contracts/config-files.md §3.2 and §4.2 give them. It passes `git apply --check`, and you apply it in T046.
- **T039–T044:** the agents' engine (`deploy/agents-engine/**`), cherry-picked from `wt/000-engine` as bee8ea4 to 496222c.
  - 134 new tests for `authz.py` (every rule A0–A35) and `egress-proxy.py`.
  - None of the scripts were run: `setup-host.sh`, `engine.sh`, `prove-limits.sh`, the units, and the relay's network path all need sudo or Docker.
  - One departure, recorded in agents-engine.md §2.2: the relay passes the sandbox proxy's Basic auth to socat through a 0600 temp file.
- **`make check` at 496222c,** exit 0: 5 PASS, 4 SKIP, 2 PLANNED, 0 FAIL, with 245 tests. gitleaks finds no leaks.

## Still to do

1. **Integrate the two stopped tracks** by cherry-picking their committed work.
   - **The gateway (T015–T021, T023–T028):** `git log feat/000-setup..wt/000-gateway`, in the worktree `scratchpad/wt/gateway`.
   - **Compose, env files, and scripts (T029–T038):** `git log feat/000-setup..wt/000-compose`. It owns the Makefile's stack targets.
   - Both were stopped mid-task at the usage limit, so check each worktree's uncommitted changes first.
2. **Integrate the Makefile:**
   - `make validate-config` (T019);
   - `engine-status` and `engine-smoke` (contracts/agents-engine.md §8);
   - `deploy/agents-engine/docker-relay` added to lint's shellcheck list, since it has no `.sh`;
   - remove the stale `@T019`, `@T036`, and `@T037` marks.
3. **Check the relay against the `DOCKER_CONFIG` value,** `~/.config/h4reet/agents-engine/docker`. Docker's CLI doesn't expand `~`, so the relay has to expand it, or the settings need an absolute path.
4. **T045, the early patch, is blocked on you.** Claude Code's auto-mode classifier refused my drafting it, as self-modification: it changes the agents' own sandbox settings, hooks, role grants, and CLAUDE.md. Either tell me in a session to draft it, or write it from plan §15 and T045's list. The engine agent confirmed the settings entries the engine needs:
   - `allowedDomains` gets `198.18.0.1:2376`;
   - `env` gets `DOCKER_CONFIG`;
   - the denies on `/etc/h4agents/pki`, `~/.config/h4reet-ai`, `~/.local/state/h4reet`, and `./deploy/agents-engine`;
   - **never** a deny on `~/.config/h4reet/agents-engine/docker/`, which agents must read.
5. **Review:** reviewer agents' REVIEW.md passes on `feat/000-setup..feat/000-foundations`, then the fixes, then T047 (the lifecycle table and this note, finished).

## For the Author, later (Heavy, with no agents running, after the disk check)

Per the engine agent, in order:
1. the containerd image store (quickstart §0.4);
2. `sudo deploy/agents-engine/engine.sh setup`;
3. `wsl --shutdown`;
4. `deploy/agents-engine/engine.sh up`, then `make engine-status`;
5. the T045 patch, before any agent uses the engine;
6. `engine.sh seed`, after T063;
7. `engine.sh prove`, at T099.

Read `setup-host.sh` and `engine.sh` before running them as root. Neither has been reviewed yet.
