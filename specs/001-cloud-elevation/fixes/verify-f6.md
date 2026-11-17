# verify-f6: F6's verify

Written by: verify-f6 (implementer, wrote none of F6), night of 2026-11-17 · Date: 2026-11-17 · Branch: `night/verify-f6/verify-f6` · Spec: 001-cloud-elevation · Item: F6 (`fixes/f6.md`) · Review: `rv-f6`, not blocking (tonight's page, thirteenth wake, and Q4)

- **Base** (`impl-f6`'s reviewed tip): `2f02609c4157a160cebdb51d54e039af16cbcf04`
- **The runs' tip**: `ca3ba8a67affebc5b690e36cb91cf218af9df04f` (save point; its tree differs from the base's in `fixes/f6.md` alone: 7 lines added, the backlog)
- **This branch's tip**: the commit that adds this file, the branch's last. Its tree adds this file and nothing else to the runs' tip.

Verdict: **green**. `f6baef8c` is an ancestor (exit 0), so nothing was merged; `deploy/scripts/` 1302 passed; `make lint` exit 0. No failure, no skip.

## 1. The line's tip

No merge task has run yet, so F's line is at the stack's base, `f6baef8ce027dbffb4056a73c61b28d4625ffb18`.

```text
$ git rev-parse HEAD
2f02609c4157a160cebdb51d54e039af16cbcf04
$ git merge-base --is-ancestor f6baef8ce027dbffb4056a73c61b28d4625ffb18 HEAD; echo "exit=$?"
exit=0
```

It is an ancestor: there is nothing to merge.

## 2. The review's non-blocking findings

`rv-f6`'s R-1 and R-2 are in `fixes/f6.md` under a new `## Backlog`, one entry each, with the line "From `rv-f6`'s review (not blocking), folded in by `verify-f6`." under it. Added with the Edit tool after the note's last section; nothing else in the note changed (`git diff --stat 2f02609c HEAD`: `specs/001-cloud-elevation/fixes/f6.md | 7 +++++++`, 7 insertions).

Each file:line was checked at the base before it went in:

```text
$ grep -n -E 'rid = f|ref = f"\{opts.registry\}/\{repository\}:\{rid\}|didn.t build|trees/\{head\}' deploy/scripts/release.py
378:        raise Refused("the room's site didn't build")
672:    rid = f"{now()}-{head[:12]}"
686:            ref = f"{opts.registry}/{repository}:{rid}"
702:                raise Refused(f"{name}'s image didn't build")
762:        "tree": {"key": f"trees/{head}.tar.gz", "sha256": tree_sha},
$ grep -n -E 'raise Refused\(reason\)|"tree"' deploy/scripts/deployer.py | head
245:    tree = release.get("tree") or {}
249:        raise Refused("tree")
386:                raise Refused("tree")
620:            raise Refused(reason)
627:            data = self.fetch(release["tree"]["key"], release["tree"]["sha256"], "tree")
$ grep -n -E 'imageCountMoreThan|Keep the newest ten|resource "aws_ecr_lifecycle_policy"' infra/account/registry.tf
45:resource "aws_ecr_lifecycle_policy" "lambda" {
53:        description  = "Keep the newest ten images"
56:          countType   = "imageCountMoreThan"
67:resource "aws_ecr_lifecycle_policy" "stack" {
75:        description  = "Keep the newest ten tagged releases"
79:          countType      = "imageCountMoreThan"
```

My reading, beside them: `release.py:672` takes the release id and `:686` tags each build with it (R-1); `:762` keys the tree by the commit (R-2). `registry.tf:67-86` is the stack's lifecycle policy, from its `resource` line to its closing brace. `deployer.py:619` is `fetch`'s SHA-256 check (`if data is None or hashlib.sha256(data).hexdigest() != sha256:`), whose `raise Refused(reason)` is `:620`; the tree's fetch passes the reason `tree` at `:627`.

## 3. The suites

F6 touched `deploy/scripts/release.py`, `deploy/scripts/test_release.py`, the new `deploy/scripts/test_release_rerun.py`, `contracts/releases-deployer.md` §2 step 3, and its note. The one Python folder changed is `deploy/scripts/`, run whole. No `apps/web` file (no TypeScript at all) changed, so no vitest.

At the runs' tip, in this worktree, with `/opt/tools/bin/pytest` (the toolchain's):

```text
$ pytest -q -p no:cacheprovider deploy/scripts/; echo "exit $?"
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
........................................................................ [ 94%]
........................................................................ [ 99%]
......                                                                   [100%]
1302 passed in 19.81s
exit 0
```

1302 passed, as `f6.md` and the review read; no failure, no skip.

The worktree had no `node_modules`, so `make setup` first. Its last lines:

```text
$ make setup 2>&1 | tail -15; echo "exit ${PIPESTATUS[0]}"
14 vulnerabilities (1 low, 12 moderate, 1 high)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm notice
npm notice New major version of npm available! 11.19.0 -> 12.2.2
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.2
npm notice To update run: npm install -g npm@12.2.2
npm notice
git hooks: /home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks
exit 0
```

My reading: `npm audit`'s 14 findings are the lock's as it stands on main, not F6's (F6 changes no package file); the hooks line is the sandbox's, as in `f6.md`.

```text
$ make lint 2>&1; echo "exit $?"
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

## 4. Failures

None. Nothing failed, so nothing was rerun on `f6baef8c`, and there is no `git archive` export under `/tmp`: this task left no scratch there.

## What I didn't run

- the full `make check`: the integration task's (rule 4);
- vitest: no `apps/web` or other TypeScript file changed;
- the image stage: it fails in the workers' containers (Q46, Q48); his gate runs it;
- ECR, the release bucket, or any AWS call: none needed, and the release is his;
- the release itself, and its Author-only target: his.

No source or test file changed, no human-only path, no merge into main, no push, no PR. No refusal by the bash gate or the permission layer this session.

## Question (on `/night/io/out/questions.md`)

- Is F6's tip green? Recommended: yes, as above.
