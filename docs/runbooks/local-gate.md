# Runbook: the local gate

Until publication, the local gate stands in for CI (ADR 0013). Every gate spec 000 adds that can run locally has a make target, and `make check` runs them all, in an agent session; before you merge, the Author's clean-room gate, `tools/gates/gate <branch>`, runs them on an exported tree ([ADR 0017](../adr/0017-clean-room-gate-and-human-only-gate-paths.md)). This page covers a gate that fails, waits for you, or can't run: a FAIL, PENDING, PLANNED, or SKIP line from `make check`, a failing summary from the gate, a secret finding, and a history scan that can't certify. Spec 000: FR-011, FR-012, FR-041, FR-042; plan §11, §12, §14, and §19; quickstart.md §6.3 and §6.4.

## Symptoms

- `make check` prints each gate's output under `== <gate>`, then one line per gate, then a summary such as `make check: 9 PASS, 1 SKIP, 0 PLANNED, 0 PENDING, 1 FAIL; failing: lint FAIL`. It exits non-zero on any FAIL or PENDING (`tools/gates/run_checks.py`). Each gate's line says why it isn't `PASS`:
  - **FAIL:** its target exited non-zero; or it has no target and no task to add one; or make would do nothing for it; or its `@Tnnn` mark is stale, because the target exists now ("stale mark: make … exists now, so remove @T… from the gate list").
  - **PENDING:** a run only you can make. In spec 000 that is the behavioral agent-config evals, when the branch changed `CLAUDE.md`, `REVIEW.md`, `.claude/**`, `evals/agent-config/**`, or the Claude Code pin, and no passing history entry has that hash (plan §14).
  - **PLANNED (Tnnn):** enforcement a patch adds that you haven't applied yet, naming the task that writes it. It doesn't fail the run.
  - **SKIP:** with its reason: a target a later task adds ("added by T…"), or a gate that can't run where it is, such as the compose policy or the image gate without a docker CLI.
- The image gate fails with "image: the agents' engine didn't build the images; if it's down, ask the Author: deploy/agents-engine/engine.sh up".
- `tools/gates/gate <branch>` ends with a failing summary line; or, run as `tools/gates/gate --host`, its summary says DEGRADED.
- `make secrets`, or the `pre-commit` hook, reports a finding, or refuses to run while a `.gitleaksignore` exists where it scans.
- `make publish-check` exits 1, with findings, or 3: it can't certify.

## Impact

The branch doesn't merge: every merge-request note carries `make check`'s whole output and the reviewer's passes (FR-041), and the gate's summary line goes into the merge commit's message. Nothing running is affected. The gates read the tree and change nothing, except `make git-hooks`, which installs the hooks.

## Act

1. **Read the failing gate's own output,** under its `== <gate>` line, above the summary.
2. **A FAIL in lint, test, evals, the red-team suite, or the matrix:** fix the code, not the test (CLAUDE.md). A fix task starts from the failing test, which it may not edit (`FIX_TASK=1`).
3. **A stale mark:** the task that adds a target removes its `@Tnnn` from `CHECK_GATES` in the Makefile, and a patch's task deletes its PLANNED entries when the patch lands (plan §11).
4. **PENDING, the agent-config evals,** in your terminal:

   ```bash
   make evals-agent-config
   ```

   It runs the behavioral cases with `claude -p` on the Team plan, in a scratch clone of the branch (plan §14). Commit the entry it writes in `evals/agent-config/history/` on the branch (SC-008), then run the gate again. With the Team plan unavailable it stays PENDING, and the merge waits (FR-011).
5. **PLANNED:** expected until the patch that clears it lands. Spec 000's acceptance needs none: after the closing patch (tasks.md T117), no PLANNED line and no SKIP that names a task are left (T118).
6. **The image gate fails:** the agents' engine is down. Follow [agents-engine.md](agents-engine.md).
7. **The toolchain gate fails on a version drift:** `make tools` installs the pinned Node, pytest, gitleaks, and the lint toolchain in your terminal. A tool `make tools` doesn't install is upgraded by hand, or its pin in `.devcontainer/toolchain.vars` changes in a reviewed commit.
8. **The git hooks' gate fails:** `make git-hooks`, in your terminal, once per clone. The agent sandbox can't write `.git/hooks`.
9. **gitleaks is missing:** the hooks and `make secrets` fail closed, and publish-check exits 3 (plan §19). `make tools` installs it.
10. **A secret finding:** never add an allowlist entry, a `gitleaks:allow` marker, or a `.gitleaksignore`: every scan takes its rules only from your `.gitleaks.toml`, and refuses a `.gitleaksignore` (research.md R-36). Rotate the secret if it was real, and take it out of the branch's history, not just its tip, before the merge: a later commit that deletes it leaves it where publish-check looks.
11. **The devcontainer image won't build:** `tools/gates/gate --host <branch>` runs the gate on host tools, marked DEGRADED in its summary (plan §19). Say so in the merge commit.
12. **publish-check exits 3:** run it in your terminal, in a full clone, with gitleaks at its pin and the denylist in place. Exit 1 lists findings by commit, path, line, and rule, never the phrase: clean them out of history before the first push, which ADR 0013 allows once (quickstart.md §6.4).

## Verify

- In an agent session, `make check` shows 0 FAIL and 0 PENDING, and every SKIP carries its reason. The whole output goes into the note.
- In your terminal, the gate passes both phases:

  ```bash
  tools/gates/gate <branch>
  ```

  Run it directly, not through make: a planted `GNUmakefile` would shadow the Makefile (plan §11). Its summary line goes into the merge commit's message.
- After the closing patch: no PLANNED line, and no SKIP that names a task (tasks.md T118).

## Undo

Nothing to undo: the gates change nothing they check. `make git-hooks` replaces the installed hooks with `.claude/git-hooks/`'s copies, which are what the git hooks' gate compares them with.

## Record

In the merge-request note: `make check`'s whole output from an agent session; the gate's summary line, also in the merge commit's message; the path of the agent-config evals' history entry when they ran; and before the first push, `make publish-check`'s summary line only (quickstart.md §6.4).
