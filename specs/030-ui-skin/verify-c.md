# Verify: verify-030c (group C, the dark pages), night of 2026-11-17

`verify-030c`, implementer, wrote none of spec 030 or its code. Date: 2026-11-17 (run 05:05Z to 05:11Z).

| What | SHA |
|---|---|
| Base, `refs/heads/night/rework-030c/rework-030c` | `a3898c6069ee44772ba027c7dc3164deb24fd294` |
| F's line, `merge-f-4`'s tip (F1 to F8) | `ab6e64e60a7ba2ae39e14d47980c130d173cca9e` |
| The merge commit | `c5011b6c101a7ea53446c9008ec0aae0ea4f6b56` (tree `47ca34d03bcb2cd8232c18ac8d647b902de6c221`) |
| The suites ran on | `f7f7eeb5` (the merge plus `impl-c.md`'s backlog, `c6b95bfb`, and two empty save points; the same source and tests as the merge) |
| This branch's tip | the commit that adds this file (`night/verify-030c/verify-030c`) |

**Summary:** the merge was clean (tree `47ca34d0`, the supervisor's). T-C03's 14 files: 237 passed. `deploy/scripts`: 1304 passed, no skip. `make lint`: exit 0. Nothing failed, so there's nothing to compare against `a3898c60` alone. C's verify tip is green and ready for the integration.

## 1. F's line

```
$ git rev-parse HEAD refs/heads/night/rework-030c/rework-030c; echo "exit=$?"
a3898c6069ee44772ba027c7dc3164deb24fd294
a3898c6069ee44772ba027c7dc3164deb24fd294
exit=0
$ git merge-base --is-ancestor f6baef8ce027dbffb4056a73c61b28d4625ffb18 HEAD; echo "is-ancestor exit=$?"
is-ancestor exit=0
```

Save point `49d6cfe5` (`wip(verify-030c): merge F's line`), then:

```
$ git merge --no-ff -m "merge(verify-030c): F's line (F1 to F8, merge-f-4's tip ab6e64e6) into C's rework tip" ab6e64e60a7ba2ae39e14d47980c130d173cca9e; echo "merge exit=$?"
Merge made by the 'ort' strategy.
 [76 files changed, 8866 insertions(+), 93 deletions(-); the diffstat is in the merge commit]
merge exit=0
$ git rev-parse HEAD HEAD^{tree}
c5011b6c101a7ea53446c9008ec0aae0ea4f6b56
47ca34d03bcb2cd8232c18ac8d647b902de6c221
```

No conflict. The tree is the one the supervisor's `git merge-tree --write-tree` found (`47ca34d0`). F's line touches none of C's files: its 76 paths are under `deploy/`, `docs/merge-requests/human-patches/`, `docs/runbooks/`, `evals/`, `infra/`, `scripts/`, `services/relay/` and `specs/001-cloud-elevation/`.

## 2. The reviews' findings

Into `specs/030-ui-skin/impl-c.md`, a new `## Backlog and review notes` section at its end, written with the Edit tool, nothing else in the note changed (`c6b95bfb`): `rv2-rework-030c`'s R-1 (Q93), R-2, R-3 and R-4; `rv-030c`'s R-3 (Q62), R-4 and R-6; then the line naming the two reviews. Fixed none. For R-2: the `(0,4,0)` words are in dark.css's comment (`dark.css:38` here; the page gives `:35-36`), `plan.md:132`'s rework bullet, and `impl-c.md:580` and `:640`.

## 3. The suites, on the merge result

`make setup` first (the worktree had no `node_modules`): exit 0. Its last lines were npm's audit and version notices, then `git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks`.

Each suite ran alone, in the background, with an 1,800 s limit. Logs are in `/tmp/verify-030c/` (`setup.log`, `vitest-14.log`, `pytest-deploy-scripts.log`, `make-lint.log`), left in place.

### T-C03's 14 files, from `apps/web/`

```
$ cd apps/web && npx --no-install vitest run test/ui/dark-pages.test.ts test/ui/choice-cards.test.ts test/ui/choice.test.ts test/ui/a11y.test.ts test/ui/loading-a11y.test.ts test/ui/loading-degraded.test.ts test/ui/loading-faults.test.ts test/ui/loading-notes.test.ts test/ui/loading-page.test.ts test/ui/loading-style.test.ts test/ui/credits.test.ts test/disclosure.test.ts test/site.test.ts test/smoke.test.ts; echo "exit=$?"

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/verify-030c/apps/web


 Test Files  14 passed (14)
      Tests  237 passed (237)
   Start at  05:06:28
   Duration  198.86s (tests 77%, import 23%, transform 1%)

exit=0
```

Summary: 237 passed, the count the review read on the tip. No failure, no skip.

### `deploy/scripts`, from the worktree's root

```
$ python3 -m pytest -q -p no:cacheprovider -rs deploy/scripts; echo "exit=$?"
........................................................................ [  5%]
........................................................................ [ 11%]
........................................................................ [ 16%]
........................................................................ [ 22%]
........................................................................ [ 27%]
........................................................................ [ 33%]
........................................................................ [ 38%]
........................................................................ [ 44%]
........................................................................ [ 49%]
........................................................................ [ 55%]
........................................................................ [ 60%]
........................................................................ [ 66%]
........................................................................ [ 71%]
........................................................................ [ 77%]
........................................................................ [ 82%]
........................................................................ [ 88%]
........................................................................ [ 93%]
........................................................................ [ 99%]
........                                                                 [100%]
1304 passed in 18.48s
exit=0
```

Summary: 1304 passed. `-rs` listed no skip. F's files (`test_compose_env.py`, `test_handover.py`, `test_release.py`, `test_release_rerun.py`) passed beside the rest.

### `make lint`, in the worktree

```
$ make lint; echo "exit=$?"
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
941 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit=0
```

Summary: exit 0, zero warnings.

## 4. Failures

None. Nothing to export at `a3898c60` alone.

## 5. Not run here

- The whole `apps/web` suite, `make test`, `make evals` and `make check`: the integration's (rule 4).
- The image stage (Q46, Q48): his gate.
- No plan, no AWS call, no container, nothing on the agents' engine.
- No source or test file edited, and no human-only path touched, so there's no patch for his hand.

## 6. Interruptions

No refusal by the bash gate, a hook or the permission layer. The merge-request note for spec 030 is the integration's (T-INT04). This branch ends with this file and `impl-c.md`'s backlog, as the brief says and as `verify-f8` ended.

## 7. Question

One, in `/night/io/out/questions.md`: is C's verify tip green and ready for the integration? Recommended: yes.
