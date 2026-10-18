# fix/000-stage-e-probes
Spec: specs/000-local-foundations/ (T099: stage E; SC-003) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5), the integrating session · Date: 2026-10-13, rebuilt 2026-10-17
Session: worked in `/tmp/claude-1000/wt-stage-e`, launched from `~/h4reet-ai/h4reet-ai` · Repo hooks active: yes (the command guard refused three of this session's commands: two searches whose text named the engine script and its subcommands, and a `git reset --hard` in a scratch worktree, read as moving main. None was respelled: the searches went through the Read tool, and the scratch worktree was made again). The first build was lost uncommitted when WSL restarted and `/tmp` was wiped; this is the same change, rebuilt and verified again.
Authorized by: T099, whose stage E must pass for SC-003, and the Author's first full stage E run (2026-10-13: 14 passed, 2 failed).

**Status: ready for your review.** Branched from 01f7f36, main's tip. `deploy/agents-engine/` is human-only, so the code is a patch: you merge this branch, apply the patch on main, reinstall the engine's copies, and run stage E again (the steps below).

## Runs in the Author's terminal

ADR 0017 puts this section first.

| What | How it runs | Check before you apply it |
|---|---|---|
| `docs/merge-requests/2026-10-13-fix-000-stage-e-probes.patch` | `git apply --index` on main, after the merge; then `engine.sh setup`, which installs the plugin's root-owned copy | **`authz.py`**, rule A14's second layer: `os.path.lexists` in place of `os.path.exists` before `realpath`. **`prove-limits.sh`**: E5c's classifier also takes the daemon's form of the kernel's refusal, for the planted link's own path only. E10 lets the state root hold the empty `dev-cpu/gateway` that `seed` makes, and nothing else. **Tests:** two in `test/test_authz.py`, and a new `test/test_prove_limits_sh.py`, which runs the classifier, cut from the script, in bash. |

## Stage E's two failures, and why neither was an escape

| Row | What the run saw | What it was |
|---|---|---|
| E5 (E5c) | the bind through a link to `/etc`, planted in the tree and in the state root: `error while creating mount source path '<link>': mkdir <link>: file exists` | **The kernel refused it.** The roots are mounted `nosymfollow`, so the daemon's stat of the link got `ELOOP`. It then tried to make the source as a directory, and mkdir found the link. No container ran, and nothing was mounted. The probe recognizes only the plugin's refusal or the word `ELOOP`, so it failed the row. **The plugin's second layer had a gap:** A14 checked `os.path.exists(source)` before `realpath`. On a `nosymfollow` root, `exists` follows the link, gets `ELOOP`, and reads False, so the plugin never resolved the link and admitted the bind. `realpath` reads links with `readlink(2)`, which `nosymfollow` allows, so `lexists` closes it. |
| E10 | `the state root still holds dev-cpu` | **The reset was clean.** Your check on 2026-10-13 found exactly `dev-cpu` and `dev-cpu/gateway`, both empty directories. The reset ends with `seed`, whose `chown_state` has made dev-cpu's state directory since T145 (a8e9cb7). E10's "an empty state root" (c30b9a5) is older, and this was the first full stage E run since. |

contracts/agents-engine.md says the same: the symlink paragraph after A14's table, and rows E5 and E10.

## Verification

- With the patch, on a scratch copy of the branch: `deploy/agents-engine/test`, 442 passed; shellcheck clean on `prove-limits.sh`; ruff lint and format clean (2026-10-13, and again on the rebuild, 2026-10-17).
- With the new tests and the old `authz.py` and `prove-limits.sh` (2026-10-13): the link test and the `file exists` test fail, as they should. 191 others pass.

## For the Author

1. Commit this branch in `/tmp/claude-1000/wt-stage-e`: the contract, this note, and the patch file.
2. From main's checkout: `tools/gates/gate fix/000-stage-e-probes`, then the merge command it prints. The branch touches nothing under `deploy/agents-engine/`, so the gate's stage E step is SKIP.
3. On main: `git apply --index docs/merge-requests/2026-10-13-fix-000-stage-e-probes.patch`, then `git commit -m "Apply the stage E probes patch (T099)"`.
4. Reinstall and restart: `deploy/agents-engine/engine.sh setup`, then `deploy/agents-engine/engine.sh down`, `deploy/agents-engine/engine.sh up`, and `deploy/agents-engine/engine.sh status`.
5. Ask the session to bring dev-cpu up (row E14), then run `deploy/agents-engine/engine.sh prove` again. Expected: `stage E: 16 passed, 0 failed`, with E5c refused "by the plugin (A14)".
