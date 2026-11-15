# The stack's CLAUDE.md lines: five reviews' lines for "Things Claude gets wrong" (for the Author's hand)

Written by: implementer (patch-claude-md), rebuilt by implementer (claudemd2) · Date: 2026-11-14 (rebuilt 2026-11-15, night 2026-11-14) · Spec: 022-corpus-from-film-scripts (the task's spec; the lines come from five reviews across the stack)
Branch: `night/claudemd2/claudemd2`, from `night/patch-claude-md/patch-claude-md` (`40c10cef`). Built from plain copies of `refs/heads/main` at `b6985ad2`. Main's `CLAUDE.md` is the same there as at `3c0e4cd0`, the first build's base (`git diff --stat 3c0e4cd0 b6985ad2 -- CLAUDE.md` prints nothing).

## Status: for his hand; not on main before the gate

`CLAUDE.md` is a human-only path. Nothing on the stack reads these lines, so the patch needn't land before the gate. It waits for his hand, in any order relative to the stack's merges. **But see "The check that fails" below: main's own static eval refuses the patched file as it stands. Making room is his (Q277).**

## What changed in this rebuild (claudemd2)

- **Q301:** Q249's line now ends with its review's full stop, "… use `git apply` or `diff` instead." The first build (`40c10cef`) took it from night 1's question, which quotes it without the full stop.
- **Q298:** a fifth line, rv-rework5-026's, word for word.
- The diff's SHA-256 was `3a57512a1d4683cd9b2ef7f93efe479e0830ee93dd4d82c641005ccbf8efb0cd` (four lines). It is now `79161ebbbc14582ae93d7f28a51baa244920c4fc2e793edc91138103fa617c12` (five lines).

## What it is

Five reviews each proposed one line for CLAUDE.md's "## Things Claude gets wrong". The page's questions recommend adding each one word for word, by his hand. The patch adds them as `- ` bullets at the end of that section, in this order, each in its review's words:

| Question | Review | Item |
|---|---|---|
| Q249 | rv-impl-025 | item 8 |
| Q266 | rv-rework2-026 | item f |
| Q274 | rv2-rounds4-020 | item 3's studio line |
| Q276 | rv-rework5-022 | item 5 |
| Q298 | rv-rework5-026 | item f (026) |

For his hand beside the patch, not in it (Q302): rv-rework2-024's line, word for word from the stack note's item 7 ("For his hand and for others", `docs/merge-requests/2026-11-14-night-stack.md:2860` on `night/merge-2/merge-2`, `ce3f6305`):

> Writing a test figure (RED, GREEN, a count) in a note without pasting its output or marking it 'recorded, not pasted', including in the section that fixes exactly that.

The diff only appends after main's line 58 (the section's last bullet and the file's last line). Main's other lines don't change.

## Each line checked against its sources

Each source line was cut out of its page with `git show <ref>:<file> | sed -n '<line>p'` and its quoting stripped, then compared with `cmp` to the patch's line (the bullet's `- ` and the line break taken off). The review files themselves (`night/.io/<review>/out/review.md`) aren't mounted in this container, so the pages are the sources.

| Line | Source (ref, file, line) | Result |
|---|---|---|
| Q249 | tonight's page, "rv-impl-025's findings, its words" (`night/supervisor/2026-11-14`, `47f56a3a`, `docs/night-shift/2026-11-14.md:611`) | the patch's line matches, with the full stop |
| Q249 | `docs/merge-requests/human-patches/025.md:16` on `night/merge-2/merge-2` (`ce3f6305`) | identical to the findings' copy |
| Q249 | night 1's page, Q249 (`night/supervisor/2026-11-13`, `50fcb941`, `docs/night-shift/2026-11-13.md:1194`) | the question's quote lacks the full stop; the first build matched this copy, which is the one difference fixed (Q301) |
| Q266 | tonight's page, Q266's "Recommended: yes, word for word" (`docs/night-shift/2026-11-14.md:133`) | identical; unchanged from the first build |
| Q274 | tonight's page, Q274's "Recommended: yes, word for word" (`:165`) | identical; unchanged from the first build |
| Q276 | tonight's page, Q276's "The line, in the review's words" (`:174`) | identical; unchanged from the first build |
| Q298 | tonight's page, "rv-rework5-026's findings, its words", its "Feed back" (`:292`) | identical |
| Q298 | tonight's page, Q298's "The line, in its words" (`:49`) | identical to the findings' copy |
| Q302 | tonight's page, Q302's question (`:63`), and the stack note's item 7 (above) | the two copies identical; listed above, not in the patch |

The first build's four lines against their pages, before the rebuild (on a `DIFFER`, the run shows the tail of a `diff` of the two lines folded at 200 columns):

```text
DIFFER: .scratch-claudemd2/src/patch-1.txt .scratch-claudemd2/src/q249-page2-findings.txt
\ No newline at end of file
---
> ply` or `diff` instead.
\ No newline at end of file
identical: .scratch-claudemd2/src/q249-page2-findings.txt .scratch-claudemd2/src/q249-025md.txt
identical: .scratch-claudemd2/src/patch-1.txt .scratch-claudemd2/src/q249-page1-question.txt
identical: .scratch-claudemd2/src/patch-2.txt .scratch-claudemd2/src/q266-page2.txt
identical: .scratch-claudemd2/src/patch-3.txt .scratch-claudemd2/src/q274-page2.txt
identical: .scratch-claudemd2/src/patch-4.txt .scratch-claudemd2/src/q276-page2.txt
identical: .scratch-claudemd2/src/q298-page2-findings.txt .scratch-claudemd2/src/q298-page2-question.txt
```

The `> ply` … `instead.` line is the findings' copy's end; the first build's line ended `instead` with no full stop. Q302's two copies, the same way:

```text
q302 identical
```

The edited copy's five added lines against their pages, after the rebuild, and main's 58 lines kept:

```text
line 1 = q249-page2-findings: identical
line 2 = q266-page2: identical
line 3 = q274-page2: identical
line 4 = q276-page2: identical
line 5 = q298-page2-findings: identical
lines 1-58 unchanged
```

## Apply

From the repository's root, on main (one line each):

```bash
B=night/claudemd2/claudemd2
F=docs/merge-requests/human-patches/stack-claude-md-lines.md
git show "refs/heads/$B:$F" > /tmp/stack-claude-md-lines.md
patch -p1 --dry-run < /tmp/stack-claude-md-lines.md
patch -p1 < /tmp/stack-claude-md-lines.md
```

`patch` skips this prose and reads only the diff at the end. The diff alone, as a file (`claude-md/claude-md.diff`, built by `diff -u --label a/CLAUDE.md --label b/CLAUDE.md` of main's copy and the edited copy), has SHA-256 `79161ebbbc14582ae93d7f28a51baa244920c4fc2e793edc91138103fa617c12`.

## Checks

All of these ran in a scratch folder in the worktree, `.scratch-claudemd2/`, removed before the branch's last commit. Its exports are fresh `git archive refs/heads/main | tar -x` exports of `b6985ad2`. The edited copy is main's copy with the five lines added by the Edit tool (rule 5: Q249's line names git's hook settings, which the bash gate matches falsely in a shell heredoc).

The diff, its size and its SHA-256, and the first build's diff (cut from `40c10cef`'s file) for contrast:

```text
$ diff -u --label a/CLAUDE.md --label b/CLAUDE.md claude-md/CLAUDE.md.main claude-md/CLAUDE.md.new > claude-md/claude-md.diff
diff exit 1
$ sha256sum claude-md/claude-md.diff
79161ebbbc14582ae93d7f28a51baa244920c4fc2e793edc91138103fa617c12  claude-md/claude-md.diff
$ wc -lc claude-md/claude-md.diff
  11 1581 claude-md/claude-md.diff
$ sha256sum claude-md/old.diff
3a57512a1d4683cd9b2ef7f93efe479e0830ee93dd4d82c641005ccbf8efb0cd  claude-md/old.diff
```

(`diff` exits 1 when the files differ, as here.)

`patch`, dry run then real, with the diff alone, on the first export (`export-1`):

```text
$ patch -p1 --dry-run < ../claude-md/claude-md.diff
checking file CLAUDE.md
dry-run exit 0
$ patch -p1 < ../claude-md/claude-md.diff
patching file CLAUDE.md
patch exit 0
$ cmp ../claude-md/CLAUDE.md.new CLAUDE.md
cmp exit 0
$ find . -name "*.orig" -o -name "*.rej"
find exit 0
$ git diff --no-index --numstat ../claude-md/CLAUDE.md.main CLAUDE.md
5	0	../claude-md/CLAUDE.md.main => CLAUDE.md
```

(`find` printed nothing: no `.orig` or `.rej`.)

This file was also applied as he will apply it, prose and all, on a second fresh export (`export-2`), from this branch's committed copy:

```text
$ git -C ../.. show "HEAD:docs/merge-requests/human-patches/stack-claude-md-lines.md" > ../claude-md/stack-claude-md-lines.md
$ patch -p1 --dry-run < ../claude-md/stack-claude-md-lines.md
checking file CLAUDE.md
md dry-run exit 0
$ patch -p1 < ../claude-md/stack-claude-md-lines.md
patching file CLAUDE.md
md patch exit 0
$ cmp ../claude-md/CLAUDE.md.new CLAUDE.md
cmp exit 0
$ find . -name "*.orig" -o -name "*.rej"
find exit 0
$ sed -n '/^--- a\/CLAUDE.md$/,$p' ../claude-md/stack-claude-md-lines.md | sed '$d' | cmp - ../claude-md/claude-md.diff && echo "embedded diff = claude-md.diff"
embedded diff = claude-md.diff
```

The last line says the diff at the end of this file is byte for byte the diff whose SHA-256 is recorded above. This run read the committed copy at `600e60c0`. Later commits change only this prose, never the diff; the final copy was applied again the same way on a third fresh export, and that run is pasted in `docs/merge-requests/2026-11-14-claudemd2.md`.

### The size, against Q277's cap

Each added line's bytes, with its line break, then the five together, then the patched file (on `export-1`):

```text
226
186
210
155
159
936 claude-md/lines.txt
  63 7079 CLAUDE.md
```

So the lines are Q249 226 bytes, Q266 186, Q274 210, Q276 155, Q298 159. The first four are now 777 bytes (776 before, plus Q249's full stop), and all five are 936. Main's `CLAUDE.md` is 58 lines and 6143 bytes. Patched, it is **63 lines and 7079 bytes**, against the cap of 60 lines and 6144 bytes (`evals/agent-config/static.py:26-27`): 3 lines and 935 bytes over.

### The check that fails

Main's static eval, on the patched first export, with the pinned interpreter (filtered to its FAIL, FAILED and summary lines with `grep -E "^FAIL |FAILED|passed|failed"`; the exit is pytest's):

```text
$ /opt/tools/bin/python3 -m pytest -p no:cacheprovider -q evals/agent-config/test_static.py
FAIL  CLAUDE.md is 63 lines and 7079 bytes; the limits are 60 and 6 KB
agent-config static: 1 failed, 0 planned
FAILED evals/agent-config/test_static.py::test_the_repository_passes_with_only_planned_items
1 failed, 12 passed in 0.03s
exit 1
```

`test_the_repository_passes_with_only_planned_items` (`evals/agent-config/test_static.py:81-85`) asserts that `static.main(REPO) == 0`, and `static.py`'s `check_claude_md` caps the file at `CLAUDE_MD_MAX_LINES = 60` and `CLAUDE_MD_MAX_BYTES = 6 * 1024`. That cap is spec 000's FR-006, "`CLAUDE.md` MUST stay under one page" (`specs/000-local-foundations/spec.md:168`).

No line was shortened here. Making room is his (Q277): trim or merge existing lines in his own words, or raise the cap in `static.py:26-27` and FR-006's reading in `specs/000-local-foundations/plan.md:1061` and `:1265` together, in the same commit as this patch. Both files are human-only. Until then, applying this patch alone makes main's `make evals` (and the gate's static tier) fail.

## The diff

```diff
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -56,3 +56,8 @@
 - Deferring or dropping a control the constitution requires without naming the clause as a deviation in the spec's Assumptions, and an ADR when that reverses an accepted one.
 - Letting anything the Author runs execute what agents can write and git doesn't show (a cache, `.venv`, `uv.toml`, an ignored or excluded file): pin the interpreter and skip project config.
 - Running project code from a hook. Hooks run outside the sandbox, so they call only human-only tools with their own configs, never `npx`, `make`, or a repository config that can run code, and pass file names after `--`.
+- Turning git's hooks off by any spelling (`--no-verify`, `-c core.hooksPath`, a `GIT_*` variable, a scratch repository's config) after a refusal, or ever: a throwaway check needs no commit; use `git apply` or `diff` instead.
+- Stating a measured number in notes, plan, or a merge-request note without its run pasted beside it, scratch and intermediate runs included: paste the line, or say the run wasn't kept.
+- Changing a limit in code without changing every prompt, runbook, and spec acceptance scenario that states it (`deploy/night-shift/runner/prompts/`, `docs/runbooks/`, `specs/*/spec.md`, `specs/*/contracts/`).
+- Bounding a match on word characters only: also treat a currency sign, a dash, `%`, `+`, and a decimal or thousands mark beside it as part of the number.
+- Stating more in a note than the pasted run's assertion checks (e.g. "optimized" where the check also accepts "marked"): say exactly what the check enforces.
```
