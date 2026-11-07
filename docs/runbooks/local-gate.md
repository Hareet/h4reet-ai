# Runbook: the local gate

Until publication, the local gate stands in for CI (ADR 0013). Every gate spec 000 adds that can run locally has a make target, and `make check` runs them all, in an agent session; before you merge, the Author's clean-room gate, `tools/gates/gate <branch>`, runs them on an exported tree ([ADR 0017](../adr/0017-clean-room-gate-and-human-only-gate-paths.md)). This page covers a gate that fails, waits for you, or can't run: a FAIL, PENDING, PLANNED, or SKIP line from `make check`, a failing summary from the gate, a secret finding, and a history scan that can't certify. Spec 000: FR-011, FR-012, FR-041, FR-042; plan §11, §12, §14, and §19; quickstart.md §6.3 and §6.4.

## Symptoms

- `make check` prints each gate's output under `== <gate>`, then one line per gate, then a summary such as `make check: 9 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: lint FAIL`. It exits non-zero on any FAIL or PENDING (`tools/gates/run_checks.py`). Each gate's line says why it isn't `PASS`:
  - **FAIL:** its target exited non-zero; or it has no target and no task to add one; or make would do nothing for it; or its `@Tnnn` mark is stale, because the target exists now ("stale mark: make … exists now, so remove @T… from the gate list").
  - **PENDING:** a run only you can make. For the behavioral agent-config evals, that is the gate's `agent-config-evals` step, which reads main's tier for a branch that touches `CLAUDE.md`, `REVIEW.md`, `.claude/**`, or the Claude Code pin (spec 006 FR-004, FR-006), and waits until a history entry that this machine attests has the branch's trigger hash, a hash over those and `evals/agent-config/**` (its history aside) (plan §14). "PENDING (behavioral tier): no run for trigger hash …" means no entry has the hash at all; "PENDING (behavioral tier): no attested run for trigger hash …" means entries have it, but none this machine attests, and it names them. The step is SKIP for any other branch, and one that changes only `evals/agent-config/` is held to its own tests (FR-005).
  - **WARN:** information the merge doesn't wait on. In `make evals`, the behavioral tier's line, for every tree (spec 006 FR-002): the tier's PENDING above, as "WARN (behavioral tier): no run for trigger hash …" or "WARN (behavioral tier): no attested run for trigger hash …", or its FAIL, as "WARN (behavioral tier): <run>, the newest run for trigger hash …, failed: …", which names the newest attested run for the tree's hash, which failed, and why. The docs' links run after it either way, and a tier file that doesn't load still fails `make evals`.
  - **PLANNED (Tnnn):** enforcement a patch adds that you haven't applied yet, naming the task that writes it. It doesn't fail the run.
  - **SKIP:** with its reason: a target a later task adds ("added by T…"), or a gate that can't run where it is, such as the compose policy or the image gate without a docker CLI.
- The image gate fails with "image: the agents' engine didn't build the images; if it's down, ask the Author: deploy/agents-engine/engine.sh up".
- `tools/gates/gate <branch>` ends with a failing summary line; or, run as `tools/gates/gate --host`, its summary says DEGRADED.
- The gate's table shows `matrix-e` PENDING, waiting for `--prove`; or `eval-history` PENDING (an entry this machine didn't attest), FAIL (the branch changes or removes an entry, or one is malformed), or WARN (prod's collector didn't take an entry).
- `make secrets`, or the `pre-commit` hook, reports a finding, or refuses to run while a `.gitleaksignore` exists where it scans.
- `make publish-check` fails: its summary line reads `publish-check: FAIL (exit 1)`, with findings, or `publish-check: CANNOT CERTIFY (exit 3)`. make itself exits 2 for either, so the summary line says which.

## Impact

The branch doesn't merge: every merge-request note carries `make check`'s whole output and the reviewer's passes (FR-041), and the gate's summary line goes into the merge commit's message. Nothing running is affected, except by `tools/gates/gate --prove`: its `deploy/agents-engine/engine.sh prove` resets and reseeds the agents' engine, so agent sessions using it lose their containers, dev-cpu's stack among them. The gates read the tree and change nothing else, except `make git-hooks`, which installs the hooks.

## Act

1. **Read the failing gate's own output,** under its `== <gate>` line, above the summary.
2. **A FAIL in lint, test, evals, the red-team suite, or the matrix:** fix the code, not the test (CLAUDE.md). A fix task starts from the failing test, which it may not edit (`FIX_TASK=1`).
3. **A stale mark:** the task that adds a target removes its `@Tnnn` from `CHECK_GATES` in the Makefile, and a patch's task deletes its PLANNED entries when the patch lands (plan §11).
4. **PENDING, the agent-config evals** (the gate's `agent-config-evals` step, on a branch that touches `CLAUDE.md`, `REVIEW.md`, `.claude/**`, or the Claude Code pin), in your terminal, from main's checkout, clean. The tier's WARN line in `make evals` asks for no run on a branch that touches none of those:

   ```bash
   git switch main
   make evals-agent-config REF=<branch>
   ```

   main's tier runs against the branch, whose cases and thresholds are data. It shows the branch's diff under `.claude/`, `CLAUDE.md`, `REVIEW.md`, and every human-only path, and starts nothing until you type `yes`. Each case runs three times with `claude -p` on the Team plan, in a fresh clone of the branch with the git hooks installed (plan §14). The entry lands in `evals/agent-config/history/` in main's checkout, untracked, with its attestation under `~/.local/state/h4reet/evals/attested/`. The run ends by printing the commands that commit the entry on the branch from main's repository, never switching main's checkout to the branch: paste them (SC-008), and run the gate again. An entry this machine didn't attest decides nothing. With the Team plan unavailable it stays PENDING, and the merge waits (FR-011).
5. **PLANNED:** expected until the patch that clears it lands. Spec 000's acceptance needs none: after the closing patch (tasks.md T117), no PLANNED line and no SKIP that names a task are left (T118).
6. **The image gate fails:** the agents' engine is down. Follow [agents-engine.md](agents-engine.md).
7. **The toolchain gate fails on a version drift:** `make tools` installs the pinned Node, pytest, gitleaks, and the lint toolchain in your terminal. A tool `make tools` doesn't install is upgraded by hand, or its pin in `.devcontainer/toolchain.vars` changes in a reviewed commit.
8. **The git hooks' gate fails:** `make git-hooks`, in your terminal, once per clone. The agent sandbox can't write `.git/hooks`.
9. **gitleaks is missing:** the hooks and `make secrets` fail closed, and publish-check exits 3 (plan §19). `make tools` installs it.
10. **A secret finding:** never add an allowlist entry, a `gitleaks:allow` marker, or a `.gitleaksignore`: every scan takes its rules only from your `.gitleaks.toml`, and refuses a `.gitleaksignore` (research.md R-36). Rotate the secret if it was real, and take it out of the branch's history, not just its tip, before the merge: a later commit that deletes it leaves it where publish-check looks.
11. **The devcontainer image won't build:** `tools/gates/gate --host <branch>` skips the container phase. In the gate's words: "Lint, tests, the scaffolds, and stage H then run nowhere: never on the host." Every summary line says so, "DEGRADED (--host): no container phase, so lint, tests, the scaffolds, and stage H didn't run" (plan §19), and the merge command the gate prints carries that line into the merge commit's message.
12. **publish-check can't certify,** its summary line `publish-check: CANNOT CERTIFY (exit 3)`: run it in your terminal, in a full clone, with gitleaks at its pin and the denylist in place. `publish-check: FAIL (exit 1)` lists findings by commit, path, line, and rule, never the phrase: clean them out of history before the first push, which ADR 0013 allows once (quickstart.md §6.4). make itself exits 2 for both, so read the summary line, not make's exit code.
13. **The gate's `matrix-e` step is PENDING:** the branch changed `deploy/agents-engine/` or `.claude/settings.json`, so stage E has to prove the engine's limits again. With no agent session using the engine, run `tools/gates/gate --prove <branch>`: it runs `deploy/agents-engine/engine.sh prove`, which resets and reseeds the engine (Heavy).
14. **The gate's `eval-history` step:** PENDING means an entry the branch adds isn't attested on this machine, so it isn't posted and decides nothing: run the evals here. FAIL means the branch changes or removes an entry (the history is append-only) or adds a malformed one. **WARN:** prod's collector didn't take the cost and tokens of one or more of the history entries the branch adds. A WARN means the dashboard missed that run's numbers: in the gate's words, "the dashboard misses them, and Prometheus takes no back-fill". It doesn't block the merge. The gate posts every entry the branch adds on every run, each timestamped at its post, so check prod is up (`make status ENV=prod`); the next gate run on the branch posts them again.
15. **`make secrets` fails closed in an agent session in the main tree:** gitleaks can't open the sandbox's mask at `.gitleaksignore` there. Agents run `make check` in a worktree, where it works; in your terminal there is no mask.

## Verify

- In an agent session, `make check` shows 0 FAIL and 0 PENDING, and every SKIP carries its reason. The whole output goes into the note.
- In your terminal, the gate passes both phases:

  ```bash
  tools/gates/gate <branch>
  ```

  Run it directly, not through make: a planted `GNUmakefile` would shadow the Makefile (plan §11). Once nothing fails or waits, it prints the merge command, which puts its summary line in the merge commit's message; merge with that ([START-HERE §7](../START-HERE.md#7-before-you-merge)).
- After the closing patch: no PLANNED line, and no SKIP that names a task (tasks.md T118).

## Undo

Nothing to undo: the gates change nothing they check. `make git-hooks` replaces the installed hooks with `.claude/git-hooks/`'s copies, which are what the git hooks' gate compares them with. The one exception is `tools/gates/gate --prove`: the reset of the agents' engine can't be undone, by design, and the seed it ends with brings back every pinned image ([agents-engine.md](agents-engine.md)).

## Record

In the merge-request note: `make check`'s whole output from an agent session; the gate's summary line, also in the merge commit's message; the path of the agent-config evals' history entry when they ran; and before the first push, `make publish-check`'s summary line only (quickstart.md §6.4).
