# Spec 029, room polish: handover-029's record

Task `handover-029` (implementer, Claude Opus 5.5), night 4, 2026-11-16 (UTC, started 18:44Z). Branch
`night/handover-029/handover-029`, base `refs/heads/night/merge-029-3/merge-029-3`. I wrote none of spec 029's groups, the
line's merges, int-029, or rework-int-029. The stack's note is `docs/merge-requests/2026-11-16-029-room-polish.md`; this
file is the record of what I ran, every command and its output as printed.

Tips:

| What | SHA |
|---|---|
| Base, merge-029-3's tip | `e4b4c5164780ad93d441dbb7f5c0b48ae65083f0` |
| rework-int-029's reviewed tip (rv-rework-int-029 not blocking) | `1f9d63be5265e33961b287e0004cb0846bbcd062` |
| `refs/heads/main` | `a556a93320f391a3217a230d7df1cec1ccc11451` |
| The q15 patch's base | `f411d8e1b3427f1b78f4bae55343a75922dbb027` |
| int-029's tip, the merge base | `f718ac2e9d3b68db611cd7da4b25e0fcebd0c0a7` |
| **My merge commit**, the last change to anything but the note and this file | `b7cdc6322b047a531aa87a9eb9783b11f73005c7` |

My commits before this file, first parent only (save points are empty commits, except step 2's):

```text
$ git log --format='%H %s' e4b4c516..HEAD --first-parent | cut -c1-200
18fbccfac841aa6109e4e2c9fdb97d067281b7d6 wip(handover-029): step 3 done (orders A, B, C on fresh exports of main; q15 on f411d8e1; SHA-256s match); step 4 make setup, docs tests, make lint next
f3cdbbf7e72d9b28b86ae50082c41b68e2ffc04e wip(handover-029): step 2 done: N-1 (apply lines read from the stack, q15 too), N-2, N-3, N-4, The stack paragraph; step 3 the hand-over's checks next
ee361a667c2be0cac5dd3c85a29a1979a68e15ab wip(handover-029): step 1 done (merge b7cdc632); step 2 the four nits and The stack paragraph next
b7cdc6322b047a531aa87a9eb9783b11f73005c7 merge(029): rework-int-029's reviewed tip 1f9d63be5265e33961b287e0004cb0846bbcd062 (Q62, rv-int-029's A-1; rv-rework-int-029 not blocking) onto merge-029-3's t
a8374f441e1b7b7aa25f894714df27d49837b2a4 wip(handover-029): step 0 confirmed (HEAD e4b4c516, rework tip 1f9d63be, main a556a933); step 1 merge next
```

The gitleaks and arrival-check lines the commit hook prints on each commit ("no leaks found", "arrival-check: 0
findings") are left out of the pastes below; every commit printed them with no finding.

## 0. The branch's start

```text
$ git rev-parse HEAD && git rev-parse refs/heads/night/rework-int-029/rework-int-029 && git rev-parse refs/heads/main && git status --short && date -u
e4b4c5164780ad93d441dbb7f5c0b48ae65083f0
1f9d63be5265e33961b287e0004cb0846bbcd062
a556a93320f391a3217a230d7df1cec1ccc11451
Mon Nov 16 18:44:25 UTC 2026
```

HEAD at `e4b4c516` and the rework tip at `1f9d63be`, as the brief expects; the tree clean.

## 1. The merge

```text
$ git merge --no-ff --no-commit refs/heads/night/rework-int-029/rework-int-029; echo "exit $?"; git status --short
Auto-merging docs/merge-requests/2026-11-16-029-room-polish.md
CONFLICT (content): Merge conflict in docs/merge-requests/2026-11-16-029-room-polish.md
Automatic merge failed; fix conflicts and then commit the result.
exit 1
UU docs/merge-requests/2026-11-16-029-room-polish.md
M  docs/merge-requests/2026-11-16-029-room-text-approvals.patch

$ grep -n -E '^(<<<<<<<|=======|>>>>>>>)' docs/merge-requests/2026-11-16-029-room-polish.md; wc -l docs/merge-requests/2026-11-16-029-room-polish.md
1267:<<<<<<< HEAD
1301:=======
1324:>>>>>>> refs/heads/night/rework-int-029/rework-int-029
1611 docs/merge-requests/2026-11-16-029-room-polish.md
```

**Where the conflict was.** One conflict, in the note only, one hunk, as the page says; but at **§6's end**, not §8's
end. Both sides inserted after §6's last line ("`make lint` once more on the final tree, … That commit's message
records it."): merge-029-3 its new "## 6a. After the one `make check`: pulse-029a merged" (lines 1268-1300), the rework
its paragraph "**rework-int-029's run**, last, …" with its `make lint` paste (lines 1302-1323). §8's additions from both
sides (merge-029-3's block "From the line's review and the pulse fix's review" and the rework's backlog lines) are 9 base
lines apart and merged without conflict. The supervisor's own check, reproduced:

```text
$ git merge-tree --write-tree --name-only e4b4c516 1f9d63be; echo "exit $?"; git merge-base e4b4c516 1f9d63be
8b699a094d36a17d26aac0dc3baeaeb6f432435b
docs/merge-requests/2026-11-16-029-room-polish.md

Auto-merging docs/merge-requests/2026-11-16-029-room-polish.md
CONFLICT (content): Merge conflict in docs/merge-requests/2026-11-16-029-room-polish.md
exit 1
f718ac2e9d3b68db611cd7da4b25e0fcebd0c0a7

$ git diff f718ac2e e4b4c516 -- docs/merge-requests/2026-11-16-029-room-polish.md | grep -n '^@@'; echo ---; git diff f718ac2e 1f9d63be -- docs/merge-requests/2026-11-16-029-room-polish.md | grep -n '^@@'
5:@@ -1127,6 +1127,40 @@ shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transacti
46:@@ -1210,6 +1244,11 @@ If he overturns one, the group named in its "Blocks" line is reworked before he
58:@@ -1270,6 +1309,23 @@ here was changed tonight.
---
5:@@ -228,52 +228,189 @@ of kind `room-text`.
222:@@ -1127,6 +1264,29 @@ shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transacti
252:@@ -1222,6 +1382,10 @@ here was changed tonight.
263:@@ -1279,6 +1443,9 @@ here was changed tonight.
273:@@ -1302,19 +1469,25 @@ and compare `image` with main's (Q46, Q50).
306:@@ -1333,7 +1506,19 @@ Checking patch evals/product/cases/twin-08-hareet-ai-q15-non-engineer.yaml...
```

Both sides' hunks at base line 1127 are the conflict. I read "a conflict anywhere else: stop and ask" as a conflict
outside this one hunk of the note, and this is the one hunk, in another place than written. I resolved it by the
brief's rule and put the different place on the page as a question (`/night/io/out/questions.md`, recommended: yes).

**Resolution**, with the Edit tool (two edits: the rework's block cut from after `=======`, and put in place of
`<<<<<<< HEAD`): the rework's paragraph first, whole, then merge-029-3's §6a, whole. That is also the order the text
reads in: the rework's paragraph closes §6 ("Only this paragraph came after it"), and §6a is a new section. Checked as
an exact union of both sides:

```text
$ N=docs/merge-requests/2026-11-16-029-room-polish.md; grep -c -E '^(<<<<<<<|=======|>>>>>>>)' $N; echo "--- vs rework tip: only merge-029-3's additions expected"; git diff --stat 1f9d63be -- $N; git diff 1f9d63be -- $N | grep -E '^-[^-]' | wc -l; echo "--- vs e4b4c516: only rework's changes expected"; git diff e4b4c516 -- $N | grep -c -E '^-[^-]'; git diff f718ac2e 1f9d63be -- $N | grep -c -E '^-[^-]'
0
--- vs rework tip: only merge-029-3's additions expected
 docs/merge-requests/2026-11-16-029-room-polish.md | 56 +++++++++++++++++++++++
 1 file changed, 56 insertions(+)
0
--- vs e4b4c516: only rework's changes expected
35
35

$ git diff f718ac2e e4b4c516 --stat -- docs/merge-requests/2026-11-16-029-room-polish.md
 docs/merge-requests/2026-11-16-029-room-polish.md | 56 +++++++++++++++++++++++
 1 file changed, 56 insertions(+)
```

merge-029-3 added 56 lines to the note and removed none; the merged note is the rework's note plus exactly those 56
lines, and against `e4b4c516` it removes exactly the rework's 35 lines.

```text
$ git add docs/merge-requests/2026-11-16-029-room-polish.md && git commit -q -F - <<'EOF' … EOF; echo "exit $?"; git rev-parse HEAD; git log --format='%H %P' -1
exit 0
b7cdc6322b047a531aa87a9eb9783b11f73005c7
b7cdc6322b047a531aa87a9eb9783b11f73005c7 a8374f441e1b7b7aa25f894714df27d49837b2a4 1f9d63be5265e33961b287e0004cb0846bbcd062
```

The merge's first parent is my step-0 save point `a8374f44` (an empty commit on `e4b4c516`), its second the rework
tip. The brief's two diffs:

```text
$ git diff --stat e4b4c516 HEAD
 docs/merge-requests/2026-11-16-029-room-polish.md  | 255 ++++++++++++++++++---
 .../2026-11-16-029-room-text-approvals.patch       |  17 +-
 2 files changed, 227 insertions(+), 45 deletions(-)
exit 0
$ git diff 1f9d63be HEAD -- docs/merge-requests/2026-11-16-029-room-text-approvals.patch
exit 0
```

Only the note and the approvals patch; the patch is byte for byte the rework's (empty diff).

## 2. rv-rework-int-029's four nits and its note, in the stack's note only

Commit `f3cdbbf7e72d9b28b86ae50082c41b68e2ffc04e`, one file, `docs/merge-requests/2026-11-16-029-room-polish.md`:

- **N-1.** Every apply line in "The patches for his hand" now reads its patch from the stack:
  `git show feat/029-room-polish:docs/merge-requests/2026-11-16-029-room-text-approvals.patch | head -n 16 | patch -p1 -F0 --dry-run`
  (then without `--dry-run`); `… | tail -n +17 | patch -p1 -F0` (a dry run first); `… | patch -p1 -F0` for both at
  once. The q15 patch's step gains its own lines, read the same way:
  `git show feat/029-room-polish:docs/merge-requests/2026-11-16-q15-agents-share.patch | patch -p1 --dry-run`, then
  without `--dry-run`, in a checkout of the stack's tip. The pasted records of earlier runs (§4's runs a to g, the
  `git apply --check` and export dry-run blocks) stay as they were run.
- **N-2.** By the "both at once" line: it has no dry run, because a whole-file `patch -p1 -F0 --dry-run` checks section
  2 against main's bytes, before section 1's comma exists, and fails (exit 1), though the real apply succeeds (§4, run
  g). Checked below (§3, the claims' export).
- **N-3.** §4's "Why `-F0`": C-0005's closing line is the context's own second line before C-0008, the line section 1
  changes (it adds the comma), not a third line outside the context. The sentence says so and keeps its conclusion.
- **N-4.** A failed `-F0` apply (not a dry run) leaves the policy file unchanged and writes
  `assets/policy/content-approvals.json.rej` and `.orig` beside it, to delete before he commits. Checked below.
- **"The stack" paragraph.** `feat/029-room-polish`, named by the supervisor after `rv-handover-029`'s review; its tip
  is this branch's last commit, which the note can't hold, so the page records it; my merge commit `b7cdc632…` named as
  the last change to anything but the note and this file. The paragraph's old `night/int-029/int-029` and
  "`rv-int-029`'s review" are gone.

## 3. The hand-over, checked as written, no patch changed

Every export is a fresh `git archive` into its own `mktemp -d /tmp/ho029-<run>.XXXXXX` folder, `assets/policy` only
(the q15 export: only the five files its patch touches). `feat/029-room-polish` doesn't exist yet, so each line reads
the patch with `git -C "$W" show HEAD:…` in place of `git show feat/029-room-polish:…`, where `W` is this worktree
(`/home/h4reet/h4reet-ai/night/2026-11-16/handover-029`; `-C` because an export isn't a repository). HEAD was
`f3cdbbf7` (orders A to C) and the patch at it is `9b998caa…`, the merged one. Each result is read as JSON by
`python3 -I -c "$R"`, where `R` is:

```text
import json,sys; d=json.load(open(sys.argv[1])); a=d["approvals"]; print(len(a), "entries"); [print(e["id"], e["kind"], e["sha256"], e["date"], e["reason"]) for e in a[5:]]
```

It fails (non-zero) if the file isn't JSON, and prints the entries from the sixth on. The fills were made in the
export copies with the Edit tool (`2026-11-17`, `ok`), as the hand-over tells him to fill the applied file.

**The claims' export** (N-2 and N-4, run before I wrote them, and the "makes it fail" line):

```text
export: /tmp/ho029-claims.iDGPAy
archive exit 0
$ git show HEAD:… | patch -p1 -F0 --dry-run   (whole file, on main)
checking file assets/policy/content-approvals.json
checking file assets/policy/content-approvals.json
Hunk #1 FAILED at 17.
1 out of 1 hunk FAILED
exit 1
$ … | tail -n +17 | patch -p1 -F0   (section 2 on main without section 1, not a dry run)
patching file assets/policy/content-approvals.json
Hunk #1 FAILED at 17.
1 out of 1 hunk FAILED -- saving rejects to file assets/policy/content-approvals.json.rej
exit 1
./assets/policy/content-approvals.json.rej
./assets/policy/content-approvals.json.orig
cmp with main exit 0
```

(Its full command: `P=$PWD/docs/…approvals.patch; d=$(mktemp -d /tmp/ho029-claims.XXXXXX); git archive refs/heads/main
assets/policy | tar -x -C "$d"; cd "$d"`, then `git -C "$W" show HEAD:docs/merge-requests/2026-11-16-029-room-text-approvals.patch | patch -p1 -F0 --dry-run`,
then the same piped through `tail -n +17` into `patch -p1 -F0`, then `find . \( -name '*.rej' -o -name '*.orig' \)`,
then `git -C "$W" show refs/heads/main:assets/policy/content-approvals.json | cmp - assets/policy/content-approvals.json`.)
The failed apply left the file byte for byte main's, with a `.rej` and an `.orig` beside it.

**Order A, the hand-over's: section 1 (dry run, apply), fill C-0006's and C-0007's, [commit], section 2 (dry run,
apply), fill C-0008's, [commit].**

```text
fresh export: /tmp/ho029-a.zJNPDd from refs/heads/main a556a93320f391a3217a230d7df1cec1ccc11451
$ git archive refs/heads/main assets/policy | tar -x -C /tmp/ho029-a.zJNPDd
exit 0
$ cd /tmp/ho029-a.zJNPDd && git -C "$W" show HEAD:docs/merge-requests/2026-11-16-029-room-text-approvals.patch | head -n 16 | patch -p1 -F0 --dry-run
checking file assets/policy/content-approvals.json
exit 0
$ cd /tmp/ho029-a.zJNPDd && git -C "$W" show HEAD:docs/merge-requests/2026-11-16-029-room-text-approvals.patch | head -n 16 | patch -p1 -F0
patching file assets/policy/content-approvals.json
exit 0
$ grep -n "<the day you apply it>" assets/policy/content-approvals.json
21:     "date": "<the day you apply it>", "reason": "<your words>"},
24:     "date": "<the day you apply it>", "reason": "<your words>"}

after the fill (Edit tool: C-0006's and C-0007's date 2026-11-17, reason ok)
$ python3 -I -c '<reader>' assets/policy/content-approvals.json
7 entries
C-0006 room-text a0442aa53e370f321692b0d6b5e0ec366ad227dc0a9ff2be0c41a752445e81ad 2026-11-17 ok
C-0007 room-text 8d5464d93aa0833e2c016bd55f7421e02bd7156c98b1160410175d1c3bc611eb 2026-11-17 ok
exit 0
$ cd /tmp/ho029-a.zJNPDd && git -C "$W" show HEAD:docs/merge-requests/2026-11-16-029-room-text-approvals.patch | tail -n +17 | patch -p1 -F0 --dry-run
checking file assets/policy/content-approvals.json
exit 0
$ cd /tmp/ho029-a.zJNPDd && git -C "$W" show HEAD:docs/merge-requests/2026-11-16-029-room-text-approvals.patch | tail -n +17 | patch -p1 -F0
patching file assets/policy/content-approvals.json
exit 0
$ python3 -I -c '<reader>' assets/policy/content-approvals.json
8 entries
C-0008 room-text e62c10989645eea491355105ab7917658b61c7f39ca13e020bb295881d6ccaca <the day you apply it> <your words>
C-0006 room-text a0442aa53e370f321692b0d6b5e0ec366ad227dc0a9ff2be0c41a752445e81ad 2026-11-17 ok
C-0007 room-text 8d5464d93aa0833e2c016bd55f7421e02bd7156c98b1160410175d1c3bc611eb 2026-11-17 ok
exit 0
$ find . ( -name '*.rej' -o -name '*.orig' )
exit 0

A, after C-0008's fill (Edit tool: date 2026-11-17, reason ok)
$ python3 -I -c '<reader>' /tmp/ho029-a.zJNPDd/assets/policy/content-approvals.json
8 entries
C-0008 room-text e62c10989645eea491355105ab7917658b61c7f39ca13e020bb295881d6ccaca 2026-11-17 ok
C-0006 room-text a0442aa53e370f321692b0d6b5e0ec366ad227dc0a9ff2be0c41a752445e81ad 2026-11-17 ok
C-0007 room-text 8d5464d93aa0833e2c016bd55f7421e02bd7156c98b1160410175d1c3bc611eb 2026-11-17 ok
exit 0
```

Section 2 applied exactly (no fuzz or offset line) on top of section 1 with its date and reason filled: A-1's case.

**Order B, Q1 answered "yes" first: both at once, then fill all three.** No dry run, as the hand-over now says (N-2).

```text
B. fresh export: /tmp/ho029-b.fyKgTm from refs/heads/main a556a93320f391a3217a230d7df1cec1ccc11451
$ git archive refs/heads/main assets/policy | tar -x -C /tmp/ho029-b.fyKgTm
exit 0
$ cd /tmp/ho029-b.fyKgTm && git -C "$W" show HEAD:docs/merge-requests/2026-11-16-029-room-text-approvals.patch | patch -p1 -F0
patching file assets/policy/content-approvals.json
patching file assets/policy/content-approvals.json
exit 0
$ python3 -I -c '<reader>' assets/policy/content-approvals.json
8 entries
C-0008 room-text e62c10989645eea491355105ab7917658b61c7f39ca13e020bb295881d6ccaca <the day you apply it> <your words>
C-0006 room-text a0442aa53e370f321692b0d6b5e0ec366ad227dc0a9ff2be0c41a752445e81ad <the day you apply it> <your words>
C-0007 room-text 8d5464d93aa0833e2c016bd55f7421e02bd7156c98b1160410175d1c3bc611eb <the day you apply it> <your words>
exit 0
$ find . ( -name '*.rej' -o -name '*.orig' )
exit 0

B, after the fill of all three (Edit tool: date 2026-11-17, reason ok)
$ python3 -I -c '<reader>' /tmp/ho029-b.fyKgTm/assets/policy/content-approvals.json
8 entries
C-0008 room-text e62c10989645eea491355105ab7917658b61c7f39ca13e020bb295881d6ccaca 2026-11-17 ok
C-0006 room-text a0442aa53e370f321692b0d6b5e0ec366ad227dc0a9ff2be0c41a752445e81ad 2026-11-17 ok
C-0007 room-text 8d5464d93aa0833e2c016bd55f7421e02bd7156c98b1160410175d1c3bc611eb 2026-11-17 ok
exit 0
$ cmp /tmp/ho029-a.zJNPDd/assets/policy/content-approvals.json /tmp/ho029-b.fyKgTm/assets/policy/content-approvals.json
exit 0
```

Both orders end on the same bytes.

**Order C, "`-F0` makes it fail if section 1 isn't on":** section 2's dry run on main.

```text
C. fresh export: /tmp/ho029-c.JlG8Z6 from refs/heads/main a556a93320f391a3217a230d7df1cec1ccc11451
$ git archive refs/heads/main assets/policy | tar -x -C /tmp/ho029-c.JlG8Z6
exit 0
$ cd /tmp/ho029-c.JlG8Z6 && git -C "$W" show HEAD:docs/merge-requests/2026-11-16-029-room-text-approvals.patch | tail -n +17 | patch -p1 -F0 --dry-run
checking file assets/policy/content-approvals.json
Hunk #1 FAILED at 17.
1 out of 1 hunk FAILED
exit 1
$ git -C "$W" show refs/heads/main:assets/policy/content-approvals.json | cmp - assets/policy/content-approvals.json
exit 0
$ find . ( -name '*.rej' -o -name '*.orig' )
exit 0
```

A dry run that fails leaves nothing behind; only a real failed apply leaves the `.rej` and `.orig` (the claims' export).

**The q15 patch on its base, `f411d8e1`**, read from the stack as N-1 now writes it:

```text
fresh export: /tmp/ho029-q15.SOHazQ from f411d8e1 f411d8e1b3427f1b78f4bae55343a75922dbb027
$ git archive f411d8e1 config/twin/corpus.json corpus/08-hareet-ai.md docs/corpus-size.json evals/product/cases/twin-08-hareet-ai-q15-engineer.yaml evals/product/cases/twin-08-hareet-ai-q15-non-engineer.yaml | tar -x -C /tmp/ho029-q15.SOHazQ
exit 0
$ cd /tmp/ho029-q15.SOHazQ && git -C "$W" show HEAD:docs/merge-requests/2026-11-16-q15-agents-share.patch | patch -p1 --dry-run
checking file config/twin/corpus.json
checking file corpus/08-hareet-ai.md
checking file docs/corpus-size.json
checking file evals/product/cases/twin-08-hareet-ai-q15-engineer.yaml
checking file evals/product/cases/twin-08-hareet-ai-q15-non-engineer.yaml
exit 0
$ find . ( -name '*.rej' -o -name '*.orig' )
exit 0
```

And the hand-over's pasted `git apply --check`, again at this branch's tree (the stack's content; read-only):

```text
$ git apply --check -v docs/merge-requests/2026-11-16-q15-agents-share.patch
Checking patch config/twin/corpus.json...
Checking patch corpus/08-hareet-ai.md...
Checking patch docs/corpus-size.json...
Checking patch evals/product/cases/twin-08-hareet-ai-q15-engineer.yaml...
Checking patch evals/product/cases/twin-08-hareet-ai-q15-non-engineer.yaml...
git apply --check exit 0
```

**Every SHA-256 the note gives**, recomputed at `f3cdbbf7` (the patches and hashed files are the same at every later
commit of this branch; `git status --short` was empty):

```text
SHA-256s, at HEAD f3cdbbf7e72d9b28b86ae50082c41b68e2ffc04e
$ sha256sum docs/merge-requests/2026-11-16-029-room-text-approvals.patch docs/merge-requests/2026-11-16-q15-agents-share.patch
9b998caaa5f3b8e632ce34fb1a1c09734bfecd73c08cf28572730f5fb9de1274  docs/merge-requests/2026-11-16-029-room-text-approvals.patch
0a5d790eed2163ce31201cd6ba00c34271612347497ac066ec5e969e42e3a64e  docs/merge-requests/2026-11-16-q15-agents-share.patch
exit 0
$ git show HEAD:docs/merge-requests/2026-11-16-029-room-text-approvals.patch | sha256sum
9b998caaa5f3b8e632ce34fb1a1c09734bfecd73c08cf28572730f5fb9de1274  -
$ git show HEAD:docs/merge-requests/2026-11-16-q15-agents-share.patch | sha256sum
0a5d790eed2163ce31201cd6ba00c34271612347497ac066ec5e969e42e3a64e  -
$ sha256sum apps/web/content/room/outlines/lettering-busy.outline.json apps/web/content/room/outlines/lettering-cool.outline.json apps/web/content/room/monitor-line.yaml
a0442aa53e370f321692b0d6b5e0ec366ad227dc0a9ff2be0c41a752445e81ad  apps/web/content/room/outlines/lettering-busy.outline.json
e62c10989645eea491355105ab7917658b61c7f39ca13e020bb295881d6ccaca  apps/web/content/room/outlines/lettering-cool.outline.json
8d5464d93aa0833e2c016bd55f7421e02bd7156c98b1160410175d1c3bc611eb  apps/web/content/room/monitor-line.yaml
exit 0
$ head -n 16 docs/merge-requests/2026-11-16-029-room-text-approvals.patch | sha256sum
8a9c0f59ee84da618c52ec2c18da882de571ff5393cf3b4917be3d8aa2a5d69c  -
$ git show f718ac2e:docs/merge-requests/2026-11-16-029-room-text-approvals.patch | head -n 16 | sha256sum
8a9c0f59ee84da618c52ec2c18da882de571ff5393cf3b4917be3d8aa2a5d69c  -
$ python3 -I -c '<topics reader>' config/twin/corpus.json   (read, not recomputed: the pack's recorded topic hashes)
hobbies-and-travel d574f1fa248e8f1814687338cf9c7d1008e1441a343ab29290ef5dd57b350507
mission c028c92d9303beebeae8b32bdd8213dd112a057ea238886638ae39cc22a568ad
work-projects 6fdd269b9dd0b207511fa36113f95c596d3de86c659ce71bbaf0abbb8395aadc
exit 0
```

(`<topics reader>` is `import json,sys; [print(t["id"], t["sha256"]) for t in json.load(open(sys.argv[1]))["topics"]]`.)

| The note gives | Recomputed | |
|---|---|---|
| approvals patch `9b998caaa5f3b8e632ce34fb1a1c09734bfecd73c08cf28572730f5fb9de1274` | the same | match |
| q15 patch `0a5d790eed2163ce31201cd6ba00c34271612347497ac066ec5e969e42e3a64e` | the same | match |
| `lettering-busy.outline.json` `a0442aa5…45e81ad` (C-0006) | `a0442aa53e370f321692b0d6b5e0ec366ad227dc0a9ff2be0c41a752445e81ad` | match |
| `lettering-cool.outline.json` `e62c1098…d6ccaca` (C-0008) | `e62c10989645eea491355105ab7917658b61c7f39ca13e020bb295881d6ccaca` | match |
| `monitor-line.yaml` `8d5464d9…bc611eb` (C-0007) | `8d5464d93aa0833e2c016bd55f7421e02bd7156c98b1160410175d1c3bc611eb` | match |
| section 1, `head -n 16 … \| sha256sum`, `8a9c0f59…a5d69c` at `f718ac2e` and now | `8a9c0f59ee84da618c52ec2c18da882de571ff5393cf3b4917be3d8aa2a5d69c` both | match |
| Q17's three topic hashes (§2, group B) | the pack's recorded values, the same | match (read, not recomputed) |

The note's other abbreviated hash, `666fcde5…`, is the rework's intermediate patch file (runs a to e of §4), which no
commit on this branch holds; I didn't recompute it. No mismatch.

Exports made: six folders (`ho029-claims`, `-a`, `-b`, `-c`, `-q15`, and `/tmp/ho029-logs` for logs), a few KB each;
none removed (Q33).

## 4. `make setup`, the docs tests, and `make lint`

```text
$ make setup > /tmp/ho029-logs/setup.log 2>&1; echo "make setup exit $?"; wc -l /tmp/ho029-logs/setup.log; tail -30 /tmp/ho029-logs/setup.log
make setup exit 0
22 /tmp/ho029-logs/setup.log
npm ci --ignore-scripts

added 431 packages, and audited 435 packages in 42s

84 packages are looking for funding
  run `npm fund` for details

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
```

(The whole log: 22 lines, all shown by `tail -30`.)

**The docs tests that cover `docs/merge-requests/`**: the two night 3's handover-028 ran (`b1fcc68d`), and its links
check. Found by `git grep -l merge-requests` over the test trees: `evals/test_repository_docs.py` and
`evals/test_docs_links.py` read the folder as a whole; the others that name it (`apps/web/test/content/film-links.test.ts`,
`evals/test_breach.py`, `scripts/corpus/test_film_claims.py`, `scripts/infra/…`) read other named files, none this
task changed. Run at `18fbccfa` (the tree with step 2's note):

```text
$ python3 -I -m pytest -q -p no:cacheprovider evals/test_repository_docs.py evals/test_docs_links.py
.............................................................            [100%]
61 passed in 2.10s
exit 0
$ python3 -I evals/docs_links.py | tail -1
exit 0
docs links: 0 failed, 2557 relative links in 510 files
$ node_modules/.bin/prettier --check docs/merge-requests/2026-11-16-029-room-polish.md
Checking formatting...
All matched files use Prettier code style!
exit 0
```

(`docs_links.py` ran as `python3 -I evals/docs_links.py > /tmp/ho029-logs/links.log 2>&1; echo "exit $?"; tail -1
/tmp/ho029-logs/links.log`.)

**`make lint`, last, on the final tree:** below, in §6.

**Not run**, as the brief says: the whole `apps/web` suite (merge-029-3's: 273/273 files, 4820 passed, 6 skipped, exit
0, `specs/029-room-polish/merge-3.md`), the full `make check` (int-029's, the note's §5), and the image stage (night 3's
Q46 and Q48; his gate). `make test` and `make evals` were not run: since `e4b4c516` this branch changes no source, test,
spec, or eval file, only the stack's note, the approvals patch (the rework's, merged unchanged), and this file.

## 5. Refusals and questions

No refusal by the permission layer, a hook, or the bash gate in this task. One question written to
`/night/io/out/questions.md`: whether the conflict's resolution at §6's end (not §8's, as the page says) is right;
recommended: yes; blocks nothing.

## 6. `make lint`

Run at `0deb9c3d787e3230704957023723c0c0784d48fb` (this file through §5, the note with its pointer to it; `git status`
clean), after `make setup` and the docs tests. Only this section came after it.

```text
$ make lint > /tmp/ho029-logs/lint.log 2>&1; echo "make lint exit $?"; cat /tmp/ho029-logs/lint.log
make lint exit 0
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
900 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
```

`ruff format` counts 900 files where the note's earlier runs (§6, rework-int-029's) count 897. Since `f718ac2e` three
files were added, all Markdown:

```text
$ git diff --name-only --diff-filter=A f718ac2e HEAD
specs/029-room-polish/handover.md
specs/029-room-polish/merge-3.md
specs/029-room-polish/pulse-a.md
```

My reading: `ruff format` counts these Markdown files too; 897 + 3 = 900. I didn't prove that rule from ruff's code.

`make lint` runs once more on the final tree, with this section in place, before the last commit; that commit's message
records its exit code.

**Result: green.** The merge kept both sides whole; the hand-over's lines run as written (with `HEAD:` for the name),
in each order it gives, with the exit codes it claims; every SHA-256 matches; the docs tests, the links check, and
`make lint` pass. The stack's tip is this branch's last commit, which the page records.
