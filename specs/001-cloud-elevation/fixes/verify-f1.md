# verify-f1: F1's reviewed tip, verified

Night 5, 2026-11-17. Implementer `verify-f1`, which wrote none of F1 (`impl-f1`, `rework-f1`).

- Branch: `night/verify-f1/verify-f1`
- Base: `refs/heads/night/rework-f1/rework-f1`, `4611ca25410879571af714c12ff49002db29a608`, which `rv-rework-f1` found not blocking
- F's line, for this task: the stack's base, `f6baef8ce027dbffb4056a73c61b28d4625ffb18` (`merge-f-1` hasn't ended)
- The runs below: at `be952cb3`, whose tree is `9851a719`'s, the commit that folds in the review's findings (the later save points are empty)
- Tip: the commit that adds this file, which changes nothing else

**Verdict: F1's tip is green** in every run below. No failure, so nothing to compare on `f6baef8c`, and no `/tmp` export was made.

## 1. The line's tip

```console
$ git merge-base --is-ancestor f6baef8ce027dbffb4056a73c61b28d4625ffb18 HEAD; echo "exit=$?"
exit=0
```

At the base (`HEAD` was `4611ca25`). F's line is an ancestor of the base, so there is nothing to merge.

## 2. The review's non-blocking findings

Folded in by the Edit tool (`9851a719`), nothing else changed:

- `fixes/f1.md`: a `## Backlog` section at the end, with R-1 (`infra/prod/edge.tf:66-71`'s stale comment against `tunnel-end.tf:178-184`) and R-3 (`_interpolations` calls `ip._template`, `tools/gates/infra_policy.py:314`), and the line "From `rv-rework-f1`'s review (not blocking), folded in by `verify-f1`." The rework's two backlog entries (the rebuild from nothing; the VPC origin replaced or removed) stay where they were, and the new section points to them.
- `fixes/f1.md`, under "Questions (on the morning page)": R-2's line. Q-F1-1 (`tunnel-end.tf:95`, `test_prod_network.py:533`) and `plan.md:777`'s "night 5's Q2" are the page's Q2, and Q-F1-2 (the hand rule's description) is Q3. No code or test renamed.
- `tasks.md`: R-4's line, as the last line of T176's entry (after its `Check:` line, 965 at the base; the entry starts at 961): "Superseded by fix F1 (night 5): the VPC origins' group's 8080 rule is unswitched and one-phase; see `plan.md` §16 item 5 and `fixes/f1.md`."

```console
$ git diff --stat
 specs/001-cloud-elevation/fixes/f1.md | 11 +++++++++++
 specs/001-cloud-elevation/tasks.md    |  1 +
 2 files changed, 12 insertions(+)
```

## 3. The suites

`infra/test` whole (F1's two test files, its fixtures, and what reuses the network checks):

```console
$ pytest -q -p no:cacheprovider --import-mode=importlib infra/test; echo "exit $?"
........................................................................ [ 18%]
........................................................................ [ 37%]
........................................................................ [ 56%]
........................................................................ [ 75%]
........................................................................ [ 94%]
....................                                                     [100%]
380 passed in 7.66s
exit 0
```

380, as `f1.md` and the review read.

The readers of `tools/gates/infra_policy.py`'s view of prod that `f1.md` lists (the hosts' tests and the policy's own tests), and the policy on the HCL, run directly as `f1.md` did:

```console
$ pytest -q -p no:cacheprovider --import-mode=importlib deploy/hosts/test_hosts.py tools/gates/test/test_infra_policy.py; echo "exit $?"
........................................................................ [ 63%]
.........................................                                [100%]
113 passed in 0.63s
exit 0
$ python3 -I -B tools/gates/infra_policy.py; echo "exit $?"
infra-policy: PASS, 32 files
exit 0
```

The docs tests. Found by a read-only `grep -rlE` under `evals/` and `docs/` for `runbooks`, `tasks.md`, `plan.md`, and `specs/`, then each hit read for what it opens. Two read these files:

- `evals/test_runbooks.py`: reads `docs/runbooks/` (`RUNBOOKS`, `:25`), which holds `tunnel-end.md`, and spec 001's `tasks.md` (`spec_001_runbooks`, `:311-315`).
- `evals/test_docs_links.py`: its `test_the_repository_passes` (`:493`) runs `evals/docs_links.py` over every Markdown file under `docs/` and `specs/`, so it reads the runbook, `plan.md`, `tasks.md`, and `fixes/f1.md`.

The other hits read other files: `test_disclosure.py` reads spec 001's `spec.md`, not its plan or tasks, and the rest cite `tasks.md` or `plan.md` only in comments, or read other specs. `docs_links.py` also ran on its own, as `make check` runs it.

```console
$ pytest -q -p no:cacheprovider --import-mode=importlib -rs evals/test_runbooks.py evals/test_docs_links.py; echo "exit $?"
........................................................................ [ 73%]
..........................                                               [100%]
98 passed in 1.17s
exit 0
$ python3 -I -B evals/docs_links.py; echo "exit $?"
PASS  every relative link resolves: 2564 links in 518 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 52 of 52
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2564 relative links in 518 files
exit 0
```

No skips (`-rs` printed none).

`make lint`. The worktree had no `node_modules`, so `make setup` ran first (exit 0; its one note: "git hooks: /home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks"). Both ran in the background, and the session waited for the run's own notice:

```console
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

## 4. Not run, and why

- The full `make check`, and `make test` and `make evals` whole: rule 4 leaves them to the integration task's one run. The image stage is his gate's.
- `terraform fmt -check`, `terraform validate`, and any plan: there is no Terraform or provider mirror in the workers' containers. His gate (fmt, and `validate`, which is what refuses a cycle) and his morning plan from a fresh clone are the first to run them. The offline walk in `infra/test` (`check_cycles`) stands in for the cycle part only.
- No AWS call, no `make plan`, no apply.

## 5. Failures

None. No `/tmp` export was made, so none is left. The logs of the background `make setup` and `make lint` are `/tmp/verify-f1-setup.log` and `/tmp/verify-f1-lint.log`, left in place.

## Refusals

None this session.
