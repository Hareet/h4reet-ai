# verify-f2: F2's verify

Date: 2026-11-17 (night 5), runs from 03:11Z. Task `verify-f2` (implementer; wrote none of F2). Branch `night/verify-f2/verify-f2`.

- Base: `refs/heads/night/impl-f2/impl-f2`, `ea3e97a84a0a8b83a5297376716fd87c0c256539` (`rv-f2`: not blocking).
- Tip at which every run below ran: `d5cfb50ce49fc1637a55e7b8fdfe0e1e7f439dce`. Its tree differs from the base's in `specs/001-cloud-elevation/fixes/f2.md` alone (the review's findings, below; `git diff --stat ea3e97a8 HEAD`: `f2.md | 14 ++++++++++++--`, 1 file). The branch's last commit adds only this file.

**Result: green.** Every run below passed, with no skips; nothing failed, so nothing was compared against `f6baef8c` and nothing was fixed.

## 1. The line's tip

No merge task has run, so F's line is at the stack's base. It is an ancestor of this branch's base:

```text
$ git merge-base --is-ancestor f6baef8ce027dbffb4056a73c61b28d4625ffb18 HEAD; echo "exit=$?"
exit=0
```

(Run at `ea3e97a8`, before any commit of mine.) Nothing to merge.

## 2. The review's findings, into `f2.md`

By the Edit tool, nothing else in the note changed (commit `37b0e2eb`):

- R-2, morning step 2: the first release with the fix runs `networkctl reload` then `networkctl reconfigure ens5` (`deploy/hosts/tunnel-end/shared_state.py:269-272`) on the live interface; expect a possible blip of a few seconds (`no_host_serving`, `/api/status`'s `"serving":"none"`, until the relay counts EC2 healthy again), and read `/api/status` after it.
- R-4, `f2.md:24`: the `/32` reading kept; "is why … answered EC2 on the night of the deploy" now says EC2 would have been answered even without his lines, that this is a reading of the routes and not an observation (his in-memory `fwmark 0x105` rule also routed those replies that night), and that morning step 4 confirms it.
- A `## Backlog`, each entry with its file:line at `ea3e97a8` (checked at the base): R-1 (`shared_state.py:249-282`, a failed enable or restart of `h4-reply-route.service` leaves the drop-in, so the next run reloads nothing and returns 0), R-2's other half (`shared_state.py:269-272`, whether `networkctl reload` alone suffices on AL2023's systemd 252), R-3 (`release/zz-h4-reply-route.conf:13-16`, a host process's hairpin to its own published `10.42.1.10:<port>` leaves `ens5`).
- Under them: "From `rv-f2`'s review (not blocking), folded in by `verify-f2`."

## 3. The suites

F2 touched Python (`deploy/hosts/tunnel-end/shared_state.py`, `deploy/hosts/test_reply_route.py`, `deploy/hosts/test_shared_state.py`), three host files under `deploy/hosts/tunnel-end/release/`, and two documents (`docs/runbooks/tunnel-end.md`, `contracts/tunnel.md`). No `apps/web` or TypeScript file changed, so no vitest.

`f2.md`'s first run, every test of `deploy/hosts/`:

```text
$ pytest -q -p no:cacheprovider -rs deploy/hosts/
........................................................................ [ 71%]
.............................                                            [100%]
101 passed in 1.43s
exit 0
```

`f2.md`'s second run, the other tests that name the changed files:

```text
$ pytest -q -p no:cacheprovider -rs deploy/scripts/test_deployer.py deploy/scripts/test_compose_env.py deploy/scripts/test_preflight.py tools/gates/test/test_compose_policy.py
........................................................................ [ 13%]
........................................................................ [ 27%]
........................................................................ [ 41%]
........................................................................ [ 54%]
........................................................................ [ 68%]
........................................................................ [ 82%]
........................................................................ [ 96%]
.....................                                                    [100%]
525 passed in 2.89s
exit 0
```

The docs tests that read the runbook or `contracts/tunnel.md`. The brief says to find them with the Grep tool; this session has none ("No such tool available: Grep"), so `git grep` through Bash: `git grep -l -E "runbooks/tunnel-end|tunnel-end\.md|contracts/tunnel\.md|tunnel\.md"` and `git grep -l -E "runbooks|…"` over `test_*.py`, then each hit read for whether it opens the file or only names it in a docstring. Those that read either: `evals/test_runbooks.py` (every page of `docs/runbooks/`), `evals/test_docs_links.py` (every link and heading in `docs/**` and `specs/**`, so `f2.md` as edited here too), `evals/test_repository_docs.py` (`docs/runbooks`), and `deploy/scripts/test_dashboard.py` (`contracts/tunnel.md` §7, `docs/runbooks/`):

```text
$ pytest -q -p no:cacheprovider -rs evals/test_runbooks.py evals/test_docs_links.py evals/test_repository_docs.py deploy/scripts/test_dashboard.py
........................................................................ [ 34%]
........................................................................ [ 69%]
..............................................................           [100%]
206 passed in 1.27s
exit 0
```

Skips (Q11's engine tests): none in any of the three runs; `-rs` printed no `SKIPPED` line. Totals: 101 + 525 + 206 = 832 passed, 0 failed, 0 skipped.

`make lint` first needed the toolchain (`node_modules/.bin/eslint` was missing): `make setup`, exit 0; its last lines:

```text
npm notice To update run: npm install -g npm@12.2.2
npm notice
git hooks: /home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks
exit 0
```

`make lint`, its whole output:

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
908 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

## 4. Not run here

- The full `make check`, `make test`, and `make evals`: the integration task's one run over F's and U's stack (rule 4).
- The image stage (Q46, Q48): his gate's.
- `nft` and systemd-networkd on a host: the container has neither, so `h4-reply-route.nft`'s `priority mangle - 1`, the drop-in's `FirewallMark=261` and `Table=105` route by `Gateway=_dhcp4`, and the reload's blip are read, not run. His morning step 2.
- AWS: no plan, no apply, nothing with his session.

## 5. A refusal

One, at the permission layer: a `Monitor` wait for `make setup` to finish (an `until grep -q '^exit ' <log>; do sleep 5; done; tail -3 <log>` loop) was refused ("The following parts require approval"). Not rerun another way: I waited for the background task's own completion notice instead. It is on the page (`/night/io/out/questions.md`). No hook or bash gate refused anything.
