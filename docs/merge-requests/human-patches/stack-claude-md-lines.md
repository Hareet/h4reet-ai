# The stack's CLAUDE.md lines: four reviews' lines for "Things Claude gets wrong" (for the Author's hand)

Written by: implementer (patch-claude-md) · Date: 2026-11-14 · Spec: 022-corpus-from-film-scripts (the task's spec; the lines come from four reviews across the stack)
Branch: `night/patch-claude-md/patch-claude-md`, on `night/merge-1/merge-1` (`74c428b2`). Built from plain copies of `refs/heads/main` at `3c0e4cd0`.

## Status: for his hand; not on main before the gate

`CLAUDE.md` is a human-only path. Nothing on the stack reads these lines, so the patch needn't land before the gate. It waits for his hand, in any order relative to the stack's merges. **But see "The check that fails" below: main's own static eval refuses the patched file as it stands (Q-patch-claude-md-1).**

## What it is

Four reviews this night each proposed one line for CLAUDE.md's "## Things Claude gets wrong". The page's questions recommend adding each one word for word, by his hand. The patch adds them as `- ` bullets at the end of that section, in this order, each in its review's words:

| Question | Review | Item |
|---|---|---|
| Q249 | rv-impl-025 | item 8 |
| Q266 | rv-rework2-026 | item f |
| Q274 | rv2-rounds4-020 | item 3's studio line |
| Q276 | rv-rework5-022 | item 5 |

The diff only appends after main's line 58 (the section's last bullet and the file's last line). Main's other lines don't change.

## Apply

From the repository's root, on main (one line each):

```bash
B=night/patch-claude-md/patch-claude-md
F=docs/merge-requests/human-patches/stack-claude-md-lines.md
git show "refs/heads/$B:$F" > /tmp/stack-claude-md-lines.md
patch -p1 --dry-run < /tmp/stack-claude-md-lines.md
patch -p1 < /tmp/stack-claude-md-lines.md
```

`patch` skips this prose and reads only the diff at the end. The diff alone, as a file (`/tmp/claude-md-K7hi/claude-md.diff`, built by `diff -u --label a/CLAUDE.md --label b/CLAUDE.md` of main's copy and the edited copy), has SHA-256 `3a57512a1d4683cd9b2ef7f93efe479e0830ee93dd4d82c641005ccbf8efb0cd`.

## Checks (on a fresh `git archive refs/heads/main` export, `/tmp/main-export-5ilW`)

`patch`, dry run then real, with the diff alone:

```text
$ patch -p1 --dry-run < /tmp/claude-md-K7hi/claude-md.diff
checking file CLAUDE.md
dry-run exit 0
$ patch -p1 < /tmp/claude-md-K7hi/claude-md.diff
patching file CLAUDE.md
patch exit 0
```

`git diff --no-index` of main's copy (copied out of the export before patching) and the patched copy. This is the `--numstat` line and every changed body line, cut to 60 columns. The full diff isn't pasted here because `patch` would read it as a second diff:

```text
$ git diff --no-index --numstat /tmp/claude-md-K7hi/CLAUDE.md.main-export /tmp/main-export-5ilW/CLAUDE.md
4	0	/tmp/{claude-md-K7hi/CLAUDE.md.main-export => main-export-5ilW/CLAUDE.md}
$ git diff --no-index … | grep -E '^[+-]' | grep -vE '^(\+\+\+|---) ' | cut -c1-60
+- Turning git's hooks off by any spelling (`--no-verify`, `
+- Stating a measured number in notes, plan, or a merge-requ
+- Changing a limit in code without changing every prompt, r
+- Bounding a match on word characters only: also treat a cu
```

The patched file is byte-identical to the edited scratch copy (`cmp /tmp/claude-md-K7hi/CLAUDE.md.new /tmp/main-export-5ilW/CLAUDE.md`: no output, exit 0).

The files under `evals/agent-config/` that name `CLAUDE.md`:

```text
$ grep -l CLAUDE.md evals/agent-config -r
evals/agent-config/test_static.py
evals/agent-config/history/README.md
evals/agent-config/behavioral.py
evals/agent-config/test_behavioral.py
evals/agent-config/cases/pastes-check-output.yaml
evals/agent-config/cases/refuses-to-widen-allowlist.yaml
evals/agent-config/cases/stays-on-branch.yaml
evals/agent-config/static.py
evals/agent-config/cases/fix-task-edits-test.yaml
```

The test files among them are `test_static.py` and `test_behavioral.py`. The others are the modules those tests import, cases they load, and a README. Run on the patched export with the pinned interpreter:

```text
$ /opt/tools/bin/python3 -m pytest -p no:cacheprovider -q evals/agent-config/test_static.py evals/agent-config/test_behavioral.py
FAIL  CLAUDE.md is 62 lines and 6919 bytes; the limits are 60 and 6 KB
agent-config static: 1 failed, 0 planned
FAILED evals/agent-config/test_static.py::test_the_repository_passes_with_only_planned_items
1 failed, 325 passed, 2 skipped in 24.47s
```

(The pytest output is filtered to its FAIL, FAILED, and summary lines with `grep -E "^FAIL |FAILED|passed|failed"`. The unfiltered run's tail showed the same summary, `1 failed, 325 passed, 2 skipped in 24.77s`, exit 1.)

The same two files on an unpatched export of main (`/tmp/main-unpatched-rdPS`), for contrast:

```text
326 passed, 2 skipped in 18.04s
```

### The check that fails

The four lines cause it. `evals/agent-config/test_static.py:81-85` (`test_the_repository_passes_with_only_planned_items`) asserts that `static.main(REPO) == 0`. `static.py`'s `check_claude_md` (`evals/agent-config/static.py:127-137`) caps CLAUDE.md at `CLAUDE_MD_MAX_LINES = 60` and `CLAUDE_MD_MAX_BYTES = 6 * 1024` (`static.py:26-27`). That cap is spec 000's FR-006, "`CLAUDE.md` MUST stay under one page" (`specs/000-local-foundations/spec.md:168`), which plan.md reads as "CLAUDE.md is at most 60 lines and 6 KB" (`specs/000-local-foundations/plan.md:1061`, `:1265`).

Main's CLAUDE.md is 58 lines and 6143 bytes, 1 byte under the cap. The four lines add 4 lines and 776 bytes, for 62 lines and 6919 bytes. No single line fits. With its line break, each line is: Q249 225 bytes, Q266 186, Q274 210, Q276 155. Total 776 (`wc -c` of the four lines, one by one and together: 225, 186, 210, 155; `776 /tmp/claude-md-K7hi/lines.txt`).

No line was shortened here. The question is on the page as Q-patch-claude-md-1. It recommends that he make the room himself, in the same commit as this patch: either trim or merge existing lines in his own words, or raise the cap in `static.py:26-27` and FR-006's reading in spec 000's plan.md together. Both files are human-only (`evals/agent-config/**`), so either way it's his edit. Until he decides, applying this patch alone makes main's `make evals` (and the gate's static tier) fail.

### Lint

The lint target, on this branch (documents only):

LINT_RESULT_PLACEHOLDER

## The diff

```diff
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -56,3 +56,7 @@
 - Deferring or dropping a control the constitution requires without naming the clause as a deviation in the spec's Assumptions, and an ADR when that reverses an accepted one.
 - Letting anything the Author runs execute what agents can write and git doesn't show (a cache, `.venv`, `uv.toml`, an ignored or excluded file): pin the interpreter and skip project config.
 - Running project code from a hook. Hooks run outside the sandbox, so they call only human-only tools with their own configs, never `npx`, `make`, or a repository config that can run code, and pass file names after `--`.
+- Turning git's hooks off by any spelling (`--no-verify`, `-c core.hooksPath`, a `GIT_*` variable, a scratch repository's config) after a refusal, or ever: a throwaway check needs no commit; use `git apply` or `diff` instead
+- Stating a measured number in notes, plan, or a merge-request note without its run pasted beside it, scratch and intermediate runs included: paste the line, or say the run wasn't kept.
+- Changing a limit in code without changing every prompt, runbook, and spec acceptance scenario that states it (`deploy/night-shift/runner/prompts/`, `docs/runbooks/`, `specs/*/spec.md`, `specs/*/contracts/`).
+- Bounding a match on word characters only: also treat a currency sign, a dash, `%`, `+`, and a decimal or thousands mark beside it as part of the number.
```
