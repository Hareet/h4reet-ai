# verify-f7: F7's verify

Written by: verify-f7 (implementer, wrote none of F7), night of 2026-11-17 · Date: 2026-11-17 · Branch: `night/verify-f7/verify-f7` · Spec: 001-cloud-elevation · Item: F7 (`fixes/f7.md`) · Review: `rv2-f7` (part 1 and the patches), `rv3-f7a` (parts 2, 3), `rv3-f7b` (parts 4 to 6), not blocking (tonight's page, the twenty-third and twenty-sixth wakes; Q25, Q27, Q28)

- **Base** (`impl-f7`'s reviewed tip): `7ced91c5930a0dac8d9131af381c840ed99f1e85`
- **F's line** (`merge-f-2`'s tip, F1 to F6): `4e41cca6f545fb201962dffe17c1c9525a575ae0`
- **The merge commit**: `c1986a0eccab21da2fb21a7dcba32cddd3a09fe9` (parents: the save point `ba3c633f`, whose tree is the base's, and `4e41cca6`)
- **The runs' tip**: `746f3be9` (save point; its tree is the merge's plus `fixes/f7.md`'s backlog, commit `7cc2df63`: 11 lines added, 1 changed)
- **This branch's tip**: the commit that adds this file, the branch's last (after the empty save point `517d1e82`). Its tree adds this file and nothing else to the runs' tip.

Verdict: **green**. `f6baef8c` is an ancestor (exit 0); the merge of F's line was clean (exit 0); the relay 90 passed; `deploy/scripts` 1304 passed; `deploy/hosts` 106 passed; `scripts/infra` 139 passed, 11 skipped (no `ssh-keygen`); `evals` 898 passed, 2 skipped (no `zsh`); both patches apply with `patch -p1` (exit 0) and their SHA-256s match `f7.md`; the gate's compose-policy tests 199 passed on the patched export, and the policy's command line `PASS`; `make lint` exit 0. No failure.

## 1. The line's tip

```text
$ git rev-parse HEAD
7ced91c5930a0dac8d9131af381c840ed99f1e85
$ git merge-base --is-ancestor f6baef8ce027dbffb4056a73c61b28d4625ffb18 HEAD; echo "exit=$?"
exit=0
$ git cat-file -t 4e41cca6f545fb201962dffe17c1c9525a575ae0
commit
$ git commit --allow-empty -q -m "wip(verify-f7): merge F's line"
$ git merge --no-ff -m "merge(001): F's line at merge-f-2 (F1 to F6, 4e41cca6) into F7's verify" 4e41cca6f545fb201962dffe17c1c9525a575ae0; echo "exit=$?"
Auto-merging deploy/compose.yaml
Auto-merging deploy/hosts/test_shared_state.py
Auto-merging deploy/scripts/test_compose_env.py
Auto-merging docs/runbooks/tunnel-end.md
Merge made by the 'ort' strategy.
 [50 files changed, 5410 insertions(+), 61 deletions(-); the full stat is `git diff --stat c1986a0e^1 c1986a0e`]
exit=0
$ git rev-parse HEAD
c1986a0eccab21da2fb21a7dcba32cddd3a09fe9
```

No conflict. Four files both sides changed merged on their own: `deploy/compose.yaml` (F7's relay bind and shared-state health check; F's line's other services), `deploy/hosts/test_shared_state.py`, `deploy/scripts/test_compose_env.py`, `docs/runbooks/tunnel-end.md`. The suites below run on the merged tree.

## 2. The review's non-blocking findings

In `fixes/f7.md`, by the Edit tool, under a new `## Backlog` after the note's last section: `rv3-f7a`'s R-1, R-2, R-3 and `rv3-f7b`'s R-1, R-2, one entry each with its file:line, as the page's twenty-sixth wake gives them, and the line "From `rv2-f7`'s, `rv3-f7a`'s and `rv3-f7b`'s reviews (not blocking), folded in by `verify-f7`." `rv2-f7` left no nit (twenty-third wake).

`rv3-f7a`'s R-1 is also done in morning step 5 itself, one line (`f7.md:137`): "If it reads `unhealthy`, neither …" now reads "If the tunnel end's release fails `--wait` on `shared-state`, neither …"; its backlog entry says so. Nothing else in the note changed:

```text
$ git diff --stat 7ced91c5 7cc2df63 -- specs/001-cloud-elevation/fixes/f7.md
 specs/001-cloud-elevation/fixes/f7.md | 12 +++++++++++-
 1 file changed, 11 insertions(+), 1 deletion(-)
$ git diff --stat c1986a0e 7cc2df63
 specs/001-cloud-elevation/fixes/f7.md | 12 +++++++++++-
 1 file changed, 11 insertions(+), 1 deletion(-)
```

## 3. The suites, on the merge result

The worktree had no `node_modules`, so `make setup` ran first (background, 900 s limit):

```text
$ make setup > /tmp/verify-f7-logs/setup.log 2>&1; echo "exit=$?"
exit=0
npm notice New major version of npm available! 11.19.0 -> 12.2.2
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.2
npm notice To update run: npm install -g npm@12.2.2
npm notice
git hooks: /home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks
```

Each suite below ran alone, in the background with a 900 s limit, and was read after its own completion notice. `git status --short` was empty after `make setup`.

### The relay's whole suite

`/sys/fs/cgroup/cpu.max` reads `400000 100000`, so 4 workers.

```text
$ cd services/relay && npx vitest run --maxWorkers=4 > /tmp/verify-f7-logs/relay.log 2>&1; echo "exit=$?"
exit=0

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/verify-f7/services/relay


 Test Files  3 passed (3)
      Tests  90 passed (90)
   Start at  03:52:28
   Duration  680ms (tests 40%, import 37%, transform 22%, worker 1%)
```

The three files are all of `services/relay/test/*.test.ts` (the config's `include`): `ec2-state.test.ts` (F7's part 1), `no-telemetry.test.ts`, `relay.test.ts`.

### `deploy/scripts`

```text
$ python3 -m pytest -q -p no:cacheprovider -rs deploy/scripts > /tmp/verify-f7-logs/deploy-scripts.log 2>&1; echo "exit=$?"
exit=0
1304 passed in 19.75s
```

### `deploy/hosts`

```text
$ python3 -m pytest -q -p no:cacheprovider -rs deploy/hosts > /tmp/verify-f7-logs/deploy-hosts.log 2>&1; echo "exit=$?"
exit=0
106 passed in 2.42s
```

### `scripts/infra`

```text
$ python3 -m pytest -q -p no:cacheprovider -rs scripts/infra > /tmp/verify-f7-logs/scripts-infra.log 2>&1; echo "exit=$?"
exit=0
=========================== short test summary info ============================
SKIPPED [1] scripts/infra/test_tunnel_keys.py:128: needs ssh-keygen
SKIPPED [1] scripts/infra/test_tunnel_keys.py:140: needs ssh-keygen
SKIPPED [1] scripts/infra/test_tunnel_keys.py:192: needs ssh-keygen
SKIPPED [1] scripts/infra/test_tunnel_keys.py:203: needs ssh-keygen
SKIPPED [1] scripts/infra/test_tunnel_keys.py:211: needs ssh-keygen
SKIPPED [1] scripts/infra/test_tunnel_keys.py:229: needs ssh-keygen
SKIPPED [1] scripts/infra/test_tunnel_keys.py:236: needs ssh-keygen
SKIPPED [1] scripts/infra/test_tunnel_keys.py:256: needs ssh-keygen
SKIPPED [3] scripts/infra/test_tunnel_keys.py:264: needs ssh-keygen
139 passed, 11 skipped in 11.16s
```

The 11 skips are the tunnel-key tests, for want of `ssh-keygen` in this container, as `verify-f3` saw (Q13). None is F7's: F7 changes `infra/parameters.txt` and its test `scripts/infra/test_secrets_check.py`, which ran.

### `evals`

```text
$ python3 -m pytest -q -p no:cacheprovider -rs evals > /tmp/verify-f7-logs/evals.log 2>&1; echo "exit=$?"
exit=0
=========================== short test summary info ============================
SKIPPED [2] evals/agent-config/test_behavioral.py:2452: no zsh here
898 passed, 2 skipped in 24.19s
```

The 2 skips need `zsh`, which this container lacks; neither is F7's (part 6's tests, in `evals/`, ran).

### F7's two patches, on an export of the merge result

The export is `/tmp/verify-f7-export.FDYEBS` (`git archive c1986a0e`), left in place.

```text
$ D=$(mktemp -d /tmp/verify-f7-export.XXXXXX); echo "$D"
/tmp/verify-f7-export.FDYEBS
$ git archive c1986a0eccab21da2fb21a7dcba32cddd3a09fe9 | tar -x -C "$D"
$ cd "$D" && for p in docs/merge-requests/human-patches/2026-11-17-f7-relay-snapshot-bind.patch docs/merge-requests/human-patches/2026-11-17-f7-ec2-stop-profile.patch; do sha256sum "$p"; patch -p1 < "$p"; echo "patch exit=$?"; done
a1edb4fd880acdb052311f9ec2c5d73d6d332cd2db73486e0c6c780b5eb5db5b  docs/merge-requests/human-patches/2026-11-17-f7-relay-snapshot-bind.patch
patching file tools/gates/compose_policy.py
patching file tools/gates/test/test_compose_policy.py
patch exit=0
54ca471c6cad59b0b64fb7d577cf93a016b83dbe5b75b3f2be3abd1a0185788b  docs/merge-requests/human-patches/2026-11-17-f7-ec2-stop-profile.patch
patching file Makefile
patch exit=0
```

Beside `f7.md`'s table (`f7.md:79-80`):

| Patch | `sha256sum` here | `f7.md` | |
|---|---|---|---|
| `…-f7-relay-snapshot-bind.patch` | `a1edb4fd880acdb052311f9ec2c5d73d6d332cd2db73486e0c6c780b5eb5db5b` | `a1edb4fd880acdb052311f9ec2c5d73d6d332cd2db73486e0c6c780b5eb5db5b` | match |
| `…-f7-ec2-stop-profile.patch` | `54ca471c6cad59b0b64fb7d577cf93a016b83dbe5b75b3f2be3abd1a0185788b` | `54ca471c6cad59b0b64fb7d577cf93a016b83dbe5b75b3f2be3abd1a0185788b` | match |

No `.orig` or `.rej` file was left. Then, in the patched export:

```text
$ cd /tmp/verify-f7-export.FDYEBS && python3 -I -m pytest -q -p no:cacheprovider -rs tools/gates/test/test_compose_policy.py > /tmp/verify-f7-logs/compose-policy-tests.log 2>&1; echo "exit=$?"
exit=0
199 passed in 1.44s
```

199, as the review read on the base's export. `tools/gates/compose_policy.py` has a command line (`main`, `--root`, `compose_policy.py:1429-1442`):

```text
$ cd /tmp/verify-f7-export.FDYEBS && python3 -I tools/gates/compose_policy.py --root /tmp/verify-f7-export.FDYEBS > /tmp/verify-f7-logs/compose-policy-cli.log 2>&1; echo "exit=$?"
exit=0
compose policy: PASS (deploy/compose.yaml with 5 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
```

So on the merged tree, with the gate's patch, the policy admits the relay's read-only `/var/lib/h4reet/snapshot` bind beside F's line's compose changes.

### `make lint`, in the worktree

```text
$ make lint > /tmp/verify-f7-logs/lint.log 2>&1; echo "exit=$?"
exit=0
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
925 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
```

That is the whole log (11 lines): shellcheck printed no finding.

`make lint` ran on the runs' tip, before this file was added. This file is Markdown, which `prettier --check` covers, so it was checked alone before its commit:

```text
$ node_modules/.bin/prettier --check specs/001-cloud-elevation/fixes/verify-f7.md specs/001-cloud-elevation/fixes/f7.md; echo "exit=$?"
Checking formatting...
All matched files use Prettier code style!
exit=0
```

## 4. Failures

None. Nothing failed at the merge result, so there was nothing to locate at `7ced91c5` alone.

## 5. Not run here

- The full `make check`: the integration task's (rule 4).
- The image stage: his gate's (Q46, Q48).
- Any plan (`make plan` or `terraform`), any AWS call, any container (the agents' engine was not used).
- `apps/web`'s suite: F7 changes no `apps/web` file (its panel cause, Q25, is unchanged).
- `tools/gates/compose_policy.py` over this worktree, unpatched: it is the gate's, and without F7's first patch it refuses the relay's bind (`f7.md` step 1).

## 6. Refusals

None in this session: no bash-gate or permission-layer refusal.

## 7. Scratch left in place

`/tmp/verify-f7-export.FDYEBS` (the patched export) and `/tmp/verify-f7-logs/` (each run's log), for the runner's cleanup (Q20).
