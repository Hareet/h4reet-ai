# verify-030dsb: group DS's build part, with F's line merged

Night 5, 2026-11-17 (runs about 05:00Z to 05:09Z by the container's clock). Implementer `verify-030dsb`, which wrote none of
spec 030 or its code. Branch `night/verify-030dsb/verify-030dsb`.

- **The base** (`refs/heads/night/impl-030dsb/impl-030dsb`): `7ac200dad8c078f7d7c3997cbc80f81130cdc04f`.
- **F's line** (`merge-f-4`'s tip, F1 to F8): `ab6e64e60a7ba2ae39e14d47980c130d173cca9e`.
- **The merge commit**: `b1f168fecc645848df3321ec40d3b90b1db334df`, tree `bbfcd593c0eb6fb7b62a538ab06ef14518d35b75`
  (parents: the empty save point `a9de5779`, whose tree is `7ac200da`'s, and `ab6e64e6`).
- **The note's commit** (`impl-dsb.md`, R-5, N-1, N-2): `d7a50432`.
- **The suites ran at** `f70fe6d0813c7ac1c909932e099fe5a8174b6857` (the save point after the note), whose tree differs
  from the merge's only in `specs/030-ui-skin/impl-dsb.md` (`git diff --stat b1f168fe HEAD`: 1 file changed, 17
  insertions, 2 deletions).
- **This branch's tip**: the commit that adds this file, after the empty save point `wip(verify-030dsb): step 4,
  verify-dsb.md`.

Verdict: **green.** The merge had no conflict and its tree is the supervisor's `bbfcd593`. Every suite I ran passed,
with no failure and no skip: 188, 1186, and 106 passed. `make lint` exited 0. No known failure from F's line showed
up, because F7's and F8's known failures are in files outside these runs (section 4).

## 1. The base and F's line

```text
$ git rev-parse HEAD refs/heads/night/impl-030dsb/impl-030dsb; echo "exit=$?"; git merge-base --is-ancestor f6baef8ce027dbffb4056a73c61b28d4625ffb18 HEAD; echo "is-ancestor exit=$?"
7ac200dad8c078f7d7c3997cbc80f81130cdc04f
7ac200dad8c078f7d7c3997cbc80f81130cdc04f
exit=0
is-ancestor exit=0
$ git log --oneline -1 ab6e64e60a7ba2ae39e14d47980c130d173cca9e
ab6e64e6 docs(001): merge-f-4's record: F8 merged into F's line (b189d835); the suites on the result, F8's two known failures, the four patches green on an export
```

The save point, then the merge:

```text
$ git commit --allow-empty -q -m "wip(verify-030dsb): step 1, F's line merge"
exit=0
$ git merge --no-ff -m "merge(verify-030dsb): F's line (F1 to F8, merge-f-4's tip ab6e64e6) into DSB's build part" ab6e64e60a7ba2ae39e14d47980c130d173cca9e
Auto-merging deploy/scripts/release.py
Auto-merging deploy/scripts/test_release.py
Merge made by the 'ort' strategy.
 [76 files changed, 8866 insertions(+), 93 deletions(-): the stat list, all of F's files, is in the merge commit]
merge exit=0
$ git rev-parse HEAD HEAD^{tree}
b1f168fecc645848df3321ec40d3b90b1db334df
bbfcd593c0eb6fb7b62a538ab06ef14518d35b75
```

No conflict, so I resolved nothing. The two auto-merged files are the ones the supervisor's `git merge-tree` named.

## 2. The review's findings, into the note

`specs/030-ui-skin/impl-dsb.md`, using the Edit tool (commit `d7a50432`):

- A `## Backlog and review notes` section at the end has R-5, N-1, N-2, and the line "From `rv-030dsb`'s and
  `rv2-030dsb`'s reviews (not blocking), folded in by `verify-030dsb`." The page gives no line numbers for R-5 and N-1,
  so I took them from the trees: `release.py:815` at `7ac200da` (`git show 7ac200da:deploy/scripts/release.py | grep -n
  "wi.ASSET_CONTEXTS"` prints `815:`), `:831` on the merge; `web_image.py:109` (`ASSET_CONTEXTS = (`) and `:116`
  (`WITHOUT = {`), the same before and after the merge.
- N-2: lines 63-64 of the GREEN entry now say the over-width line wasn't rewrapped and that `web_image.py:57` grew from
  148 characters (at `8e83e7fc`, its `:52`) to 157. Both lengths come from `awk '...{print length($0)}'` on each tree.
  The correction takes three lines instead of two. I left the rewrap to the integration and changed no code.

## 3. The suites on the merge result

The worktree had no `node_modules`. `make setup` exited 0, with one line about the hooks: "git hooks:
/home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks".
I ran the suites one at a time, each in the background with a 900 s limit, and wrote each one's output to `/tmp`. Those
files are left in place: `/tmp/verify-030dsb-run1.txt`, `-run2.txt`, `-run3.txt`, `-setup.txt`, and `-lint.txt`.

### 3.1 The release, the web image, and the Makefile pin

```text
$ python3 -m pytest -q -p no:cacheprovider -rs deploy/scripts/test_release.py deploy/scripts/test_web_image.py scripts/test_makefile.py
........................................................................ [ 38%]
........................................................................ [ 76%]
............................................                             [100%]
188 passed in 5.18s
exit=0
```

### 3.2 The rest of `deploy/scripts`

```text
$ python3 -m pytest -q -p no:cacheprovider -rs deploy/scripts --deselect deploy/scripts/test_release.py --deselect deploy/scripts/test_web_image.py --ignore=deploy/scripts/test_release.py --ignore=deploy/scripts/test_web_image.py
[progress lines]
........................................................................ [ 97%]
..................................                                       [100%]
1186 passed in 16.87s
exit=0
```

These two runs add up to 1186 + 134 = 1320 in `deploy/scripts` (`--collect-only` on the release and web-image
files gives 134). `merge-f-4` counted 1304 on F's line. `impl-030dsb` added 10 test functions to those two files,
two of them parametrized (`git diff 8e83e7fc 7ac200da`), and I didn't confirm case by case that they account for
the 16. A `git archive` of `ab6e64e6`'s `deploy/scripts` alone in `/tmp/verify-030dsb-f-export.2kek` (left in place)
collected with an error ("26 tests collected, 1 error") because it lacks the rest of the tree, so I don't use it.

### 3.3 `deploy/hosts`

```text
$ python3 -m pytest -q -p no:cacheprovider -rs deploy/hosts
[progress lines]
........................................................................ [ 67%]
..................................                                       [100%]
106 passed in 2.60s
exit=0
```

### 3.4 `make lint`

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
941 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit=0
```

## 4. Failures, skips, and F's known failures

- **Failures:** none. **Skips:** none (`-rs` printed no skip lines). I didn't export `7ac200da`, because no failure
  needed one.
- **F's known failures** (`merge-f-4.md` line 11 and its verdict, `f8.md`):
  `test_the_target_is_the_authors_and_runs_its_script` and `test_every_make_target_a_runbook_names_exists`. Both fail
  until F8's target patch adds its `Makefile` target. They're in `scripts/` and the evals files, which the brief didn't
  give me to run, so they don't show up above. `f7.md`'s RED lists are F7's own commits before its fixes, and
  `merge-f-3.md` records F7 as green.

## 5. What I didn't run

- `make check` (the integration's), `make test`, and `make evals`. Following his rule 4, this verify runs only the
  suites the brief names, plus `make lint`.
- `scripts/` (apart from `scripts/test_makefile.py`), `evals/`, `infra/test`, and the `apps/web` suite.
- The image build and the image stage (Q46, Q48; his gate).
- Any release, any plan, any AWS call, and any container. Nothing here used the agents' engine.
- F's patches for his hand on a patched export. `merge-f-4` did that for the same `ab6e64e6`.
