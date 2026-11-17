# verify-f3: F3's verify

Date: 2026-11-17 (night 5). Task `verify-f3` (implementer; wrote none of F3). Branch `night/verify-f3/verify-f3`.

- Base: `refs/heads/night/impl-f3/impl-f3`, `b6b4d84790ae9a14e2645048f9d620d5555cedb4` (`rv-f3`: not blocking).
- Tip at which every run below ran: `7f09bc9f7088f7be2e331eb3585143c8618308b4`. Its tree differs from the base's in `specs/001-cloud-elevation/fixes/f3.md` alone (the review's findings, below). The branch's last commit adds only this file.

**Result: green.** Every run below passed; nothing failed, so nothing was compared against `f6baef8c` and nothing was fixed.

## 1. The line's tip

No merge task has run, so F's line is at the stack's base. It is an ancestor of this branch's base:

```
$ git merge-base --is-ancestor f6baef8ce027dbffb4056a73c61b28d4625ffb18 HEAD; echo "exit=$?"
exit=0
```

(Run at `b6b4d847`, before any commit of mine.) Nothing to merge.

## 2. The review's findings, into `f3.md`

By the Edit tool, nothing else in the note changed (commit `29281f99`):

- R-1: a new section, "What it serves in spec 001", quotes FR-017 and User Story 2's acceptance scenario 2 from `specs/001-cloud-elevation/spec.md` word for word, with a one-line reading beside them.
- R-3: the optional morning check prints `CA: same` when the parameter and the laptop's value match, and `CA: differs (both may still decode; compare the decoded PEMs)` when they don't; the text after it says the PEM header is no success then. It stays read-only (`aws ssm get-parameter`, `grep`, `base64 -d`).
- R-4: checked at the base: `deploy/scripts/write_env.py:43` is `UNSAFE = re.compile(r"[\s$\"'`\\#]")` and `:132` is `if value == "" or UNSAFE.search(value):` in `render`. The note's `:44` and `:133` now read `:43` and `:132`. (The RED paste's `write_env.py:136` is the runner's own line for the `raise`, correct, and unchanged.)
- R-5: cause bullet 4 now says a value holding any whitespace (`\s`) is outside the grammar, and a PEM's newlines alone put it there; the aside about a space is gone.
- R-2: a `## Backlog` section: the test's `assert_both_readers_take` doesn't run EC2's preflight P23 (`deploy/scripts/preflight.py:1729-1736`) on the stored value; the real value passes it today.
- Under them: "From `rv-f3`'s review (not blocking), folded in by `verify-f3`."

## 3. The suites

F3 touched Python only (`scripts/infra/shared_state.py`, `deploy/hosts/test_shared_state_ca.py`) and two documents. No `apps/web` file changed, so no vitest.

`make lint` first needed the toolchain: `make setup`, exit 0; its last lines:

```
npm notice New major version of npm available! 11.19.0 -> 12.2.2
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.2
npm notice To update run: npm install -g npm@12.2.2
npm notice
git hooks: /home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks
```

```
$ pytest -q -rs deploy/hosts/
........................................................................ [ 85%]
............                                                             [100%]
84 passed in 2.34s
exit=0
```

```
$ pytest -q -rs scripts/infra/
........................................................................ [ 48%]
.................................................................sssssss [ 97%]
ssss                                                                     [100%]
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
137 passed, 11 skipped in 10.55s
exit=0
```

```
$ pytest -q -rs deploy/scripts/test_write_env.py
....................                                                     [100%]
20 passed in 0.05s
exit=0
```

```
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
exit=0
```

Summary, beside the runs: `deploy/hosts/` 84 passed; `scripts/infra/` 137 passed and 11 skipped (`test_tunnel_keys.py`'s, no `ssh-keygen` in the worker's container; F3 doesn't touch it); `deploy/scripts/test_write_env.py` 20 passed; `make lint` exit 0. The same totals as `f3.md`'s runs.

## 4. Failures

None. So no file was rerun on a `git archive` export of `f6baef8c`.

## What I didn't run

- The full `make check`: the integration task's (rule 4).
- The image stage: his gate's (Q46, Q48).
- Anything against AWS: none is needed (F3's morning steps: none required; the optional check is his, read-only).
- `make test` and `make evals` as wholes: covered by the integration's `make check`, per rule 4.

No source or test file edited, no human-only path, no patch for his hand, no refusal met. Questions: one, on the page (`/night/io/out/questions.md`): whether F3's tip is green.
