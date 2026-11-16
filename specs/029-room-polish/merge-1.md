# merge-029-1: groups B and D into the line

- Date: 2026-11-16 (night 4)
- Task: `merge-029-1` (implementer; wrote none of groups B or D)
- Branch: `night/merge-029-1/merge-029-1`
- Base (the line's tip, the stack's base): `f411d8e1b3427f1b78f4bae55343a75922dbb027`
- Group B's verify tip (Q52): `refs/heads/night/verify-029b/verify-029b` = `2b960dcbf605fdb1d73e3991c38ec24cca9e5001`
- Group D's verify tip (Q45): `refs/heads/night/verify-029d/verify-029d` = `4d985962a034d2890bd15efec3f9e4367b1fc38d`
- Merge commits: B `37510bac3b9820c756534c77cead776e5dc898a7` (parents `463eb235`, `2b960dcb`); D `d830a15419dc9d5b056ad8139f2ef8eef93fe11b` (parents `5647cb1caa9de1373f996898e8de845522638263`, `4d985962a034d2890bd15efec3f9e4367b1fc38d`)
- Result: **green**. `apps/web` suite 265 of 265 files passed, 4702 tests passed, 6 skipped, exit 0. `make lint` exit 0.

## 1. The tips and their ancestry

```
$ git rev-parse HEAD; git rev-parse refs/heads/night/verify-029b/verify-029b; echo "exit $?"; git rev-parse refs/heads/night/verify-029d/verify-029d; echo "exit $?"; git merge-base --is-ancestor f411d8e1b3427f1b78f4bae55343a75922dbb027 2b960dcbf605fdb1d73e3991c38ec24cca9e5001; echo "B ancestor exit $?"; git merge-base --is-ancestor f411d8e1b3427f1b78f4bae55343a75922dbb027 4d985962a034d2890bd15efec3f9e4367b1fc38d; echo "D ancestor exit $?"; git status --short
f411d8e1b3427f1b78f4bae55343a75922dbb027
2b960dcbf605fdb1d73e3991c38ec24cca9e5001
exit 0
4d985962a034d2890bd15efec3f9e4367b1fc38d
exit 0
B ancestor exit 0
D ancestor exit 0
```

Both tips match the brief, and `f411d8e1` is an ancestor of each (exit 0). The worktree was clean.

A preview with `git merge-tree` (after the save point `463eb235`):

```
$ git merge-tree --write-tree --name-only HEAD 2b960dcbf605fdb1d73e3991c38ec24cca9e5001; echo "B merge-tree exit $?"; git merge-tree --write-tree --name-only 2b960dcbf605fdb1d73e3991c38ec24cca9e5001 4d985962a034d2890bd15efec3f9e4367b1fc38d; echo "B+D merge-tree exit $?"
9f7bb7bd76ad526678c0511fb3e46b92ac39e479
B merge-tree exit 0
598d2609099a739ec5f121914f0f8ee42bafceab
specs/029-room-polish/plan.md
specs/029-room-polish/spec.md
specs/029-room-polish/tasks.md

Auto-merging specs/029-room-polish/plan.md
CONFLICT (content): Merge conflict in specs/029-room-polish/plan.md
Auto-merging specs/029-room-polish/spec.md
CONFLICT (content): Merge conflict in specs/029-room-polish/spec.md
Auto-merging specs/029-room-polish/tasks.md
CONFLICT (content): Merge conflict in specs/029-room-polish/tasks.md
B+D merge-tree exit 1
```

The base has no `specs/029-room-polish/` folder. B's and D's merge base is `c743e2dab595cd0f9fff08bcba628f4ba8de9bf4` (spec 029's documents). Its text is the "base" that both sides' changes are measured against below.

## 2. The merges (T-INT's order: B, then D)

### B

```
$ git merge --no-ff 2b960dcbf605fdb1d73e3991c38ec24cca9e5001 -m "merge(029): group B, verify-029b's tip 2b960dcbf605fdb1d73e3991c38ec24cca9e5001 (Q52) …"
 …
 create mode 100644 specs/029-room-polish/probe-chat.md
 create mode 100644 specs/029-room-polish/rework-ab.md
 create mode 100644 specs/029-room-polish/spec.md
 create mode 100644 specs/029-room-polish/tasks.md
 create mode 100644 specs/029-room-polish/verify-b.md
exit 0
37510bac3b9820c756534c77cead776e5dc898a7
```

Clean. The `…` marks the start of the output's file list, which `tail -5` cut off.

### D

```
$ git merge --no-ff 4d985962a034d2890bd15efec3f9e4367b1fc38d -m "merge(029): group D, verify-029d's tip 4d985962a034d2890bd15efec3f9e4367b1fc38d (Q45)"
Auto-merging specs/029-room-polish/plan.md
CONFLICT (content): Merge conflict in specs/029-room-polish/plan.md
Auto-merging specs/029-room-polish/spec.md
CONFLICT (content): Merge conflict in specs/029-room-polish/spec.md
Auto-merging specs/029-room-polish/tasks.md
CONFLICT (content): Merge conflict in specs/029-room-polish/tasks.md
Automatic merge failed; fix conflicts and then commit the result.
exit 1
UU specs/029-room-polish/plan.md
UU specs/029-room-polish/spec.md
UU specs/029-room-polish/tasks.md
```

These are the three files and places the brief named. No code file conflicted. D's code (`apps/web/src/choice/*`, `apps/web/room/hints.yaml`, `apps/web/test/ui/choice*.test.ts`, `specs/012-loading-screen/spec.md`) merged without conflict.

I viewed the files once with `git checkout --conflict=diff3` to see the base. Then I restored git's own markers with `git checkout --conflict=merge` and resolved those. Below are the hunks exactly as git showed them, "ours" being B (the line after B's merge) and "theirs" D. Each hunk is followed by its resolution.

#### Conflict 1: `specs/029-room-polish/plan.md` (§9's "Group A owns" paragraph and §10's bullets; git showed one hunk)

As git showed it:

```
<<<<<<< ours
Group A owns: `compose/over.ts`, `layout.ts` (`HudApplied`'s `room`, `applyHud`, `setWalking`), `app.ts`'s re-fit (`:240-295`), `room.css` (`:root`'s two alphas, the over-room block), the appended block of `hud/split.css`, its two tests. Group B owns: `talk/talk.ts`, `talk/messages.ts`, `content/messages.yaml`, `hud/split.css:273` and the rows' rule (or the frame's `z-index`), `app.ts`'s one `topicReady` line in the `renderTalk` call, `build/room/readiness.ts` (`readinessReasons`; `twinReadiness` its projection), `build/room/report.ts` (the readiness section), `build/room/checks/family.ts` (`ComposeOptions.readinessReasons`, one field) and `build/room/cli.ts`'s `report` (the hand-in; rework-029b's departure, §R-B4), its two tests. Group C owns: `build/room/lettering.ts`, `build/room/schema.ts` (the two keys), `content/lettering/*`, `content/room/outlines/*` (new files), `content/room/monitor-line.yaml`, `room/scene.yaml`, `room/catalog/busy-sign.yaml`, `dog-sign.yaml` (comments, names), `room/looks/inked-cel.yaml`, `faces/terminal.ts`, `scene/faces3d.ts`, `src/room/paper.ts`, `scene/bundle3d.ts`, `flat.ts`, `ui-words.yaml`, `ui-keys.ts`, its tests. Group D owns: `src/choice/choice.ts`, `choice.css`, `cards.ts`, `room/hints.yaml`, `test/ui/choice-cards.test.ts`, `test/ui/choice.test.ts`.

## 10. What waits for his hand

- **The room-text approvals** (R-C5): three SHA-256 entries in `assets/policy/content-approvals.json`, a patch for him; the dog sign's after his answer to Q6, recorded verbatim in the intent.
- **The intent's move**: on accepting it, `git mv intent/029-room-polish.md specs/029-room-polish/intent.md` and the two outlines' `intent_ref` in the same commit (R-1 below).
- **The twin's readiness** (B0's fault 1, Q-B0-1): re-run his evaluations and the red-team on `f411d8e1`'s regenerated pack and mark the three new pack hashes in `config/twin-readiness.yaml` (his file alone); until then the room sends no turn and, after T-B02, says so (a piece: `topic_not_ready`; typed text with no piece open: `cannot_talk.unavailable`, as on `f411d8e1`, while no topic is ready, Q20; `cannot_talk.free_talk_closed` only once one is). FR-014a's report line shows the state in his terminal.
- **B0's DevTools snippet** (its §4): read-only, in his browser, after one send in a wide window; it confirms the log's 0 px row before the fix and its height after. Beside it, one more read-only line (rv-spec-029's S-1): `document.elementFromPoint` at the centre of `#talk-log`'s client rect returns the log or a descendant of it, never the frame (boxes and node names only, never the log's words); `impl-b.md` carries it after the snippet.
=======
Group A owns: `compose/over.ts`, `layout.ts`, `room.css` (`:root`'s two alphas, the over-room block), the appended block of `hud/split.css`, its two tests. Group B owns: `talk/talk.ts`, `talk/messages.ts`, `content/messages.yaml`, `hud/split.css:273`, `build/room/report.ts` (the readiness section), its two tests. Group C owns: `build/room/lettering.ts`, `build/room/schema.ts` (the two keys), `content/lettering/*`, `content/room/outlines/*` (new files), `content/room/monitor-line.yaml`, `room/scene.yaml`, `room/catalog/busy-sign.yaml`, `dog-sign.yaml` (comments, names), `room/looks/inked-cel.yaml`, `faces/terminal.ts`, `scene/faces3d.ts`, `src/room/paper.ts`, `scene/bundle3d.ts`, `flat.ts`, `ui-words.yaml`, `ui-keys.ts`, its tests. Group D owns: `src/choice/choice.ts`, `choice.css`, `cards.ts`, `room/hints.yaml`, row 6 of `specs/012-loading-screen/spec.md`'s The Hint Copy (§R-D5), `test/ui/choice-cards.test.ts`, `test/ui/choice.test.ts`.

## 10. What waits for his hand

- **The room-text approvals** (R-C5): three SHA-256 entries in `assets/policy/content-approvals.json`, a patch for him; the dog sign's after his answer to Q6, which is its only hold (§R-C6).
- **The intent's move**: on accepting it, `git mv intent/029-room-polish.md specs/029-room-polish/intent.md` (intent/README.md, step 2); nothing else follows it, since the outlines name `intent-029` by number (§R-C1).
- **The twin's readiness** (B0's fault 1, Q-B0-1): re-run his evaluations and the red-team on `f411d8e1`'s regenerated pack and mark the three new pack hashes in `config/twin-readiness.yaml` (his file alone); until then the room sends no turn and, after T-B02, says so. FR-014a's report line shows the state in his terminal.
- **B0's DevTools snippet** (its §4): read-only, in his browser, after one send in a wide window; it confirms the log's 0 px row before the fix and its height after.
>>>>>>> theirs
```

The diff3 view shows that, measured against the base, each side changed:
- §9's paragraph: **both**. B rewrote Group A's and Group B's lists. D added "row 6 of `specs/012-loading-screen/spec.md`'s The Hint Copy (§R-D5), " to Group D's list.
- §10's bullet 1 (approvals) and bullet 2 (the intent's move): **D only**. B's side is the base text.
- §10's bullet 3 (readiness) and bullet 4 (DevTools snippet): **B only**. D's side is the base text.

Resolution:

```
Group A owns: `compose/over.ts`, `layout.ts` (`HudApplied`'s `room`, `applyHud`, `setWalking`), `app.ts`'s re-fit (`:240-295`), `room.css` (`:root`'s two alphas, the over-room block), the appended block of `hud/split.css`, its two tests. Group B owns: `talk/talk.ts`, `talk/messages.ts`, `content/messages.yaml`, `hud/split.css:273` and the rows' rule (or the frame's `z-index`), `app.ts`'s one `topicReady` line in the `renderTalk` call, `build/room/readiness.ts` (`readinessReasons`; `twinReadiness` its projection), `build/room/report.ts` (the readiness section), `build/room/checks/family.ts` (`ComposeOptions.readinessReasons`, one field) and `build/room/cli.ts`'s `report` (the hand-in; rework-029b's departure, §R-B4), its two tests. Group C owns: `build/room/lettering.ts`, `build/room/schema.ts` (the two keys), `content/lettering/*`, `content/room/outlines/*` (new files), `content/room/monitor-line.yaml`, `room/scene.yaml`, `room/catalog/busy-sign.yaml`, `dog-sign.yaml` (comments, names), `room/looks/inked-cel.yaml`, `faces/terminal.ts`, `scene/faces3d.ts`, `src/room/paper.ts`, `scene/bundle3d.ts`, `flat.ts`, `ui-words.yaml`, `ui-keys.ts`, its tests. Group D owns: `src/choice/choice.ts`, `choice.css`, `cards.ts`, `room/hints.yaml`, row 6 of `specs/012-loading-screen/spec.md`'s The Hint Copy (§R-D5), `test/ui/choice-cards.test.ts`, `test/ui/choice.test.ts`.

## 10. What waits for his hand

- **The room-text approvals** (R-C5): three SHA-256 entries in `assets/policy/content-approvals.json`, a patch for him; the dog sign's after his answer to Q6, which is its only hold (§R-C6).
- **The intent's move**: on accepting it, `git mv intent/029-room-polish.md specs/029-room-polish/intent.md` (intent/README.md, step 2); nothing else follows it, since the outlines name `intent-029` by number (§R-C1).
- **The twin's readiness** (B0's fault 1, Q-B0-1): re-run his evaluations and the red-team on `f411d8e1`'s regenerated pack and mark the three new pack hashes in `config/twin-readiness.yaml` (his file alone); until then the room sends no turn and, after T-B02, says so (a piece: `topic_not_ready`; typed text with no piece open: `cannot_talk.unavailable`, as on `f411d8e1`, while no topic is ready, Q20; `cannot_talk.free_talk_closed` only once one is). FR-014a's report line shows the state in his terminal.
- **B0's DevTools snippet** (its §4): read-only, in his browser, after one send in a wide window; it confirms the log's 0 px row before the fix and its height after. Beside it, one more read-only line (rv-spec-029's S-1): `document.elementFromPoint` at the centre of `#talk-log`'s client rect returns the log or a descendant of it, never the frame (boxes and node names only, never the log's words); `impl-b.md` carries it after the snippet.
```

§9 is B's paragraph with D's added clause in Group D's list. In §10, bullets 1 and 2 are D's words and bullets 3 and 4 are B's.

#### Conflict 2: `specs/029-room-polish/spec.md` (the table of earlier specs' changes, rows 012, 007 FR-036, 018 FR-005)

As git showed it:

```
<<<<<<< ours
| 007, FR-036 (a failure's fixed message) | Also a fixed message when the room doesn't take input yet (`turn_wait.room`), and one for typed text while free talk is closed and a topic is ready (`cannot_talk.free_talk_closed`), in place of `cannot_talk.unavailable`, which stays while no topic is ready. | His point 2; Q4; Q20; FR-012 |
| 018, FR-005 (the panel's frame behind its content) | Held: the frame and the heading out of the grid's flow, so the log keeps its row (the fault spec 028's one-column panel exposed), and the sheet's rows painted above the frame. | B0; rv-spec-029 (S-1); FR-011, FR-013 |
=======
| 012, The Hint Copy, row 6 ("Your path sets the twin's depth: …", his approved copy of 2026-11-09) | "Your role sets the twin's depth: …", the rest unchanged; `hints.yaml`'s `your-path` with it, since `test/room/hints.test.ts` reads the hints' words from that table | Q15 (the page's Q16); FR-036 |
| 007, FR-036 (a failure's fixed message) | Also a fixed message when the room doesn't take input yet (`turn_wait.room`), and one for typed text while free talk is closed (`cannot_talk.free_talk_closed`), in place of `cannot_talk.unavailable`. | His point 2; Q4; FR-012 |
| 018, FR-005 (the panel's frame behind its content) | Held: the frame and the heading out of the grid's flow, so the log keeps its row (the fault spec 028's one-column panel exposed). | B0; FR-011, FR-013 |
>>>>>>> theirs
```

Against the base, B rewrote rows 007 and 018. D added row 012 before them and left 007 and 018 as the base had them.

Resolution:

```
| 012, The Hint Copy, row 6 ("Your path sets the twin's depth: …", his approved copy of 2026-11-09) | "Your role sets the twin's depth: …", the rest unchanged; `hints.yaml`'s `your-path` with it, since `test/room/hints.test.ts` reads the hints' words from that table | Q15 (the page's Q16); FR-036 |
| 007, FR-036 (a failure's fixed message) | Also a fixed message when the room doesn't take input yet (`turn_wait.room`), and one for typed text while free talk is closed and a topic is ready (`cannot_talk.free_talk_closed`), in place of `cannot_talk.unavailable`, which stays while no topic is ready. | His point 2; Q4; Q20; FR-012 |
| 018, FR-005 (the panel's frame behind its content) | Held: the frame and the heading out of the grid's flow, so the log keeps its row (the fault spec 028's one-column panel exposed), and the sheet's rows painted above the frame. | B0; rv-spec-029 (S-1); FR-011, FR-013 |
```

D's new row 012 stays where D put it, followed by B's rows 007 and 018.

#### Conflict 3: `specs/029-room-polish/tasks.md` (T-INT's line)

As git showed it:

```
<<<<<<< ours
- [ ] T-INT Merge T-B's branch, then T-A's, T-C's, and T-D's into this line, resolving `src/room/hud/split.css` (B's line 273 and rows' rule, then A's appended block), `src/room/app.ts` (B's `topicReady` line, then A's re-fit) and any conflict in `ui-words.yaml`/`ui-keys.ts` by keeping both sides; rerun `test/ui/hud-over-contrast.test.ts` and `test/ui/talk-answer-shows.test.ts` on the merged tree (plan R-3). Build the room-text approvals patch for his hand (plan §R-C5: `docs/merge-requests/2026-11-16-029-room-text-approvals.patch`, from plain copies of `refs/heads/main`, checked with `patch -p1 --dry-run` on a fresh export, its exit code recorded; the dog sign's entry its own hunk, to apply after his answer to Q6). Write `docs/merge-requests/<date>-029-room-polish.md` (the stack's note: what each group did, B0's two faults and his readiness step, the DevTools snippet, the approvals patch and its order, the intent's move and the outlines' `intent_ref` (plan R-1), the questions on the page). List in the note what waits for his look (FR-008, SC-008). Run the one full `make check` and paste it in the note. Never merge to `main`, push, or open a PR.
=======
- [ ] T-INT Merge T-B's branch, then T-A's, T-C's, and T-D's into this line, resolving `src/room/hud/split.css` (B's line 273, then A's appended block) and any conflict in `ui-words.yaml`/`ui-keys.ts` by keeping both sides; rerun `test/ui/hud-over-contrast.test.ts` and `test/ui/talk-answer-shows.test.ts` on the merged tree (plan R-3). Build the room-text approvals patch for his hand (plan §R-C5: `docs/merge-requests/2026-11-16-029-room-text-approvals.patch`, from plain copies of `refs/heads/main`, checked with `patch -p1 --dry-run` on a fresh export, its exit code recorded; the dog sign's entry its own hunk, to apply after his answer to Q6). Write `docs/merge-requests/<date>-029-room-polish.md` (the stack's note: what each group did, B0's two faults and his readiness step, the DevTools snippet, the approvals patch and its order (the dog sign's hunk its only hold, plan §R-C5), the questions on the page). List in the note what waits for his look (FR-008, SC-008). Run the one full `make check` and paste it in the note. Never merge to `main`, push, or open a PR.
>>>>>>> theirs
```

Against the base, B made two changes. It added "and rows' rule" to the `split.css` clause, and it added "`src/room/app.ts` (B's `topicReady` line, then A's re-fit)". D made one change. It replaced ", the intent's move and the outlines' `intent_ref` (plan R-1)," with " (the dog sign's hunk its only hold, plan §R-C5),", which matches D's §10 bullet 2 above: nothing follows the intent's move.

Resolution:

```
- [ ] T-INT Merge T-B's branch, then T-A's, T-C's, and T-D's into this line, resolving `src/room/hud/split.css` (B's line 273 and rows' rule, then A's appended block), `src/room/app.ts` (B's `topicReady` line, then A's re-fit) and any conflict in `ui-words.yaml`/`ui-keys.ts` by keeping both sides; rerun `test/ui/hud-over-contrast.test.ts` and `test/ui/talk-answer-shows.test.ts` on the merged tree (plan R-3). Build the room-text approvals patch for his hand (plan §R-C5: `docs/merge-requests/2026-11-16-029-room-text-approvals.patch`, from plain copies of `refs/heads/main`, checked with `patch -p1 --dry-run` on a fresh export, its exit code recorded; the dog sign's entry its own hunk, to apply after his answer to Q6). Write `docs/merge-requests/<date>-029-room-polish.md` (the stack's note: what each group did, B0's two faults and his readiness step, the DevTools snippet, the approvals patch and its order (the dog sign's hunk its only hold, plan §R-C5), the questions on the page). List in the note what waits for his look (FR-008, SC-008). Run the one full `make check` and paste it in the note. Never merge to `main`, push, or open a PR.
```

This keeps B's two additions and D's replacement. D's replacement removes base text, and I kept that removal.

#### Check of the resolution

I wanted to confirm that the merged files differ from B's tip only by D's changes, and from D's tip only by B's changes. With the merge base `MB = c743e2da` and `F` the three files, I compared the changed lines of each pair (the edits, without position):

```
$ diff <(git diff -U0 $B -- $F | grep -E '^[+-][^+-]' | sort) <(git diff -U0 $MB $D -- $F | grep -E '^[+-][^+-]' | sort); echo "D sorted: $?"
8c8
< +Group A owns: `compose/over.ts`, `layout.ts` (`HudApplied`'s `room`, … B's paragraph with D's clause …
---
> +Group A owns: `compose/over.ts`, `layout.ts`, `room.css` … the base paragraph with D's clause …
22c22
< -Group A owns: … B's paragraph without D's clause …
---
> -Group A owns: … the base paragraph without D's clause …
D sorted: 1
$ diff <(git diff -U0 $D -- $F | grep -E '^[+-][^+-]' | sort) <(git diff -U0 $MB $B -- $F | grep -E '^[+-][^+-]' | sort); echo "B sorted: $?"
15c15
< +Group A owns: … B's paragraph with D's clause …
---
> +Group A owns: … B's paragraph without D's clause …
29c29
< -Group A owns: … the base paragraph with D's clause …
---
> -Group A owns: … the base paragraph without D's clause …
B sorted: 1
```

The `…` marks long lines I shortened here; the full paragraphs are in conflict 1 above. The only difference in either direction is §9's paragraph, the one line both sides edited, which now carries both edits. Every other changed line in the three files is exactly one side's change. `git diff --stat` matches too: merged vs B equals MB→D (3 files, 45+/33−), and merged vs D equals MB→B (3 files, 90+/33−).

```
$ git add specs/029-room-polish/plan.md specs/029-room-polish/spec.md specs/029-room-polish/tasks.md && git commit --no-edit -F - <<'EOF' …
arrival-check: 0 findings in 14 files
[night/merge-029-1/merge-029-1 d830a154] merge(029): group D, verify-029d's tip 4d985962a034d2890bd15efec3f9e4367b1fc38d (Q45)
d830a15419dc9d5b056ad8139f2ef8eef93fe11b
0
d830a15419dc9d5b056ad8139f2ef8eef93fe11b 5647cb1caa9de1373f996898e8de845522638263 4d985962a034d2890bd15efec3f9e4367b1fc38d
```

## 3. Setup

```
$ make setup > /tmp/merge-029-1/setup.log 2>&1; echo "make setup exit $?"; tail -15 /tmp/merge-029-1/setup.log
make setup exit 0
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

```
$ ls node_modules/.bin/vitest; cd apps/web && npx --no-install vitest --version
node_modules/.bin/vitest
vitest/5.0.3 linux-x64 node-v24.21.0
```

`npx --no-install` resolves to the repository's own vitest 5.0.3, hoisted to the workspace root. Nothing was fetched (Q25).

## 4. Workers

```
$ cat /sys/fs/cgroup/cpu.max
400000 100000
n = 400000 / 100000 = 4
```

The quota is 400000 µs per 100000 µs period, so 400000 ÷ 100000 = 4 (rounded down, at least 1). `<n>` = 4.

## 5. The whole `apps/web` suite on the merge result (`d830a154`, run from save point `5f6e845b`, same tree)

Started in the background with a two-hour limit (Q53). I waited for the run's own completion notice.

```
$ cd apps/web
$ date -u +%FT%TZ > /tmp/merge-029-1/suite.start && npx --no-install vitest run --maxWorkers=4 > /tmp/merge-029-1/suite.log 2>&1; echo "vitest exit $?" >> /tmp/merge-029-1/suite.log; date -u +%FT%TZ >> /tmp/merge-029-1/suite.log
```

The runner's totals, unedited:

```
 Test Files  265 passed (265)
      Tests  4702 passed | 6 skipped (4708)
   Start at  15:51:23
   Duration  1726.59s (tests 70%, import 30%)

vitest exit 0
2026-11-16T16:20:10Z
```

(Start stamp in `suite.start`: `2026-11-16T15:51:22Z`.)

No failures. `grep -n -E "FAIL|✗|×"` over the log matches one line, a passing test's own output (`37:room floor: 201 starts × 600 frames, least distance kept 0.141 m, 0 violations`), not a failure. `test/room/twin-2d.test.ts` passed in this run (265 of 265 files), so it was not rerun alone.

Summary: 265 of 265 files and 4702 tests passed, 6 skipped, exit 0, in 1726.59 s (about 28.8 minutes). For comparison, verify-029b reported 264 files and 4676 tests, and verify-029d 263 files and 4635 tests. The merge holds both items' tests.

## 6. `make lint`

```
$ make lint > /tmp/merge-029-1/lint.log 2>&1; echo "make lint exit $?"; tail -25 /tmp/merge-029-1/lint.log
make lint exit 0
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
885 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
```

The log is 11 lines; this is all of it. Exit 0.

## 7. Not run

- **The full `make check`**: the integration task's (T-INT), not this merge's.
- **The image stage**: it fails in the workers' containers (night 3's Q46 and Q48), so it stays with his gate.
- **`services/gateway`'s suite**: its 5 G8 failures at `f411d8e1` (Q30, Q34) are in a folder neither B nor D touched.
- **`pytest`**: neither item changed a Python file.

## 8. What changed on this branch

Two merge commits (`37510bac`, `d830a154`), save points with no content, and this note. The only content I wrote is the conflict resolution in `specs/029-room-polish/{plan,spec,tasks}.md` and this file. I edited no source, test, or human-only path, and nothing was refused.

## 9. Questions

One, in `/night/io/out/questions.md`: whether the line takes this branch's tip as its new tip (recommended: yes).
