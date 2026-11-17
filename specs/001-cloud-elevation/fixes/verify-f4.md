# verify-f4: F4's verify

Night 5, 2026-11-17, by `verify-f4` (an implementer that wrote none of F4). Branch `night/verify-f4/verify-f4`.

- **Base:** `refs/heads/night/impl-f4/impl-f4` at `75cd828fb1940354021342b0a0718fc2db134899`, which `rv-f4` found not blocking (tonight's page, the twelfth wake, Q10 and Q11).
- **Tip the runs ran at:** `b0b0171a3a7293f4ddfe2b7605702ba8f7b32615`. From the base it changes `specs/001-cloud-elevation/fixes/f4.md` and `specs/001-cloud-elevation/contracts/tunnel.md` alone (commit `ec0cbfdc`, the review's findings); no source or test file. The commit that adds this file sits on top and changes only this file.

## 1. The line's tip

No merge task has run, so F's line is at the stack's base, `f6baef8ce027dbffb4056a73c61b28d4625ffb18`:

```text
$ git merge-base --is-ancestor f6baef8ce027dbffb4056a73c61b28d4625ffb18 HEAD; echo "exit=$?"
exit=0
```

It is an ancestor of the base (HEAD was `75cd828f` then), so there was nothing to merge.

## 2. The review's non-blocking findings

Each file:line was checked at the base before the edit; each matched the review. All edits were made with the Edit tool; nothing else changed.

- **R-4**, `fixes/f4.md:65`: the test list now names `test_the_entrypoint_copies_as_root_then_runs_ssh_as_the_tunnel_user` (was `…_then_drops_to_the_tunnel_user`, which doesn't exist; `deploy/tunnel/test_tunnel.py:855`), and adds `test_the_entrypoint_stops_when_a_file_is_missing` (`:879`) and `test_no_other_mode_runs_as_root` (`:891`), which hold the refusal.
- **R-5**, `fixes/f4.md:50`: as root, `client` and `admin` copy and then drop; only the other modes exit 77 (`deploy/tunnel/entrypoint.sh:146-157`). The note had listed `client` and `admin` among the modes that refuse root.
- **R-1**, `fixes/f4.md`, "Done, and not done": no container has run the fix (`deploy/tunnel/test_tunnel.py:899` skipped at RED and GREEN), so morning step 4 is the first live proof and step 5 the container proof (Q11).
- **R-2**, `contracts/tunnel.md:45`: "The same image, unprivileged." is now qualified as §3's own bullet (`:58`) says: root with `DAC_OVERRIDE`, `SETUID` and `SETGID` alone for the copy, then `tunnel` (10001) with no capability.
- **`## Backlog`** in `fixes/f4.md` (night 4's rule 11): R-3, `deploy/tunnel/ssh_config:3-4`'s header (a source comment, for a later change); R-2's other half, `plan.md:427` ("unprivileged"), for the merge's index of the fix files; then "From `rv-f4`'s review (not blocking), folded in by `verify-f4`."

## 3. The suites

All in this worktree, at `b0b0171a`. `make setup` first (no `node_modules` here); it exited 0, its last line:

```text
git hooks: /home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks
```

The touched Python suites, in the background with a two-hour limit (Q53):

```text
$ pytest -q -p no:cacheprovider -rs deploy/tunnel/ deploy/scripts/ tools/gates/test/test_compose_policy.py scripts/test_operator.py
.........sssssss.......s................................................ [  3%]
........................................................................ [  7%]
........................................................................ [ 11%]
........................................................................ [ 15%]
........................................................................ [ 19%]
........................................................................ [ 23%]
........................................................................ [ 27%]
........................................................................ [ 31%]
........................................................................ [ 35%]
........................................................................ [ 39%]
........................................................................ [ 43%]
........................................................................ [ 47%]
........................................................................ [ 51%]
........................................................................ [ 55%]
........................................................................ [ 59%]
........................................................................ [ 63%]
........................................................................ [ 67%]
........................................................................ [ 71%]
........................................................................ [ 75%]
........................................................................ [ 79%]
........................................................................ [ 83%]
........................................................................ [ 87%]
........................................................................ [ 91%]
........................................................................ [ 95%]
........................................................................ [ 99%]
.....                                                                    [100%]
=========================== short test summary info ============================
SKIPPED [1] deploy/tunnel/test_tunnel.py:616: the agents' engine isn't answering (deploy/agents-engine/docker-relay docker version)
SKIPPED [1] deploy/tunnel/test_tunnel.py:621: the agents' engine isn't answering (deploy/agents-engine/docker-relay docker version)
SKIPPED [1] deploy/tunnel/test_tunnel.py:628: the agents' engine isn't answering (deploy/agents-engine/docker-relay docker version)
SKIPPED [1] deploy/tunnel/test_tunnel.py:642: the agents' engine isn't answering (deploy/agents-engine/docker-relay docker version)
SKIPPED [1] deploy/tunnel/test_tunnel.py:655: the agents' engine isn't answering (deploy/agents-engine/docker-relay docker version)
SKIPPED [1] deploy/tunnel/test_tunnel.py:670: the agents' engine isn't answering (deploy/agents-engine/docker-relay docker version)
SKIPPED [1] deploy/tunnel/test_tunnel.py:682: the agents' engine isn't answering (deploy/agents-engine/docker-relay docker version)
SKIPPED [1] deploy/tunnel/test_tunnel.py:899: the agents' engine isn't answering (deploy/agents-engine/docker-relay docker version)
1797 passed, 8 skipped in 32.55s
exit 0
```

Summary, beside it: no failure. The 8 skips are all the agents' engine's (Q11): the seven older tunnel container checks (`:616` to `:682`) and F4's own container check, `test_the_client_reads_a_0700_folder_it_doesnt_own_and_runs_as_10001` (`:899`). Not chased, as the brief says.

The compose policy:

```text
$ python3 -I -B tools/gates/compose_policy.py --root .
compose policy: PASS (deploy/compose.yaml with 5 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
exit 0
```

shellcheck on the entrypoint:

```text
$ shellcheck -- deploy/tunnel/entrypoint.sh
exit 0
```

(no output)

`make lint`:

```text
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
907 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

No `apps/web` file changed, so no vitest.

## Verdict

F4's tip is green: no failure in any suite above, so nothing to compare against `f6baef8c…`. The only gap is the container proof. No container has run the fix: the eight engine checks skipped here, as they did at F4's RED and GREEN (Q11).

## Not run

- The full `make check` (the integration task's), and with it `make evals`.
- The image stage (his gate's; Q46, Q48).
- Real containers: this session doesn't reach the agents' engine, so `deploy/tunnel/test_tunnel.py`'s engine checks skipped (Q11).
- AWS: none needed. No `terraform`, `make plan`, release, or call with his session.

No refusal met. No human-only path, source file, or test file touched. Nothing merged, pushed, or opened.
