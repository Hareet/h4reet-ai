# merge-029-2: groups A and C, then respec-029c, into the line

- Date: 2026-11-16 (night 4)
- Task: `merge-029-2` (implementer; I wrote none of groups A or C, nor respec-029c)
- Branch: `night/merge-029-2/merge-029-2`
- Base (the line's tip): `refs/heads/night/merge-029-1/merge-029-1` = `18f67971a7ab211d01b5f2d260a482088f8c50c4` (B and D merged onto `f411d8e1`; `merge-1.md` says green)
- Group A's verify tip (Q55): `refs/heads/night/verify-029a/verify-029a` = `77140aac8b749397cff82e3829d04b8ce254518e`
- Group C's verify tip (Q56): `refs/heads/night/verify-029c/verify-029c` = `30df83831e22eed995736057b777a8ba69c7190d`
- Spec 029's Edge Cases fix for C: `refs/heads/night/respec-029c/respec-029c` = `8f35603c2032192ad0ad0aa88b0195079fab2cb9`
- Merge commits:
  - A: `a37dd5aa4027bac26d0ec5fe2fc94c9fbaf14dc8` (parents `33b6211c242b130e76a59e80468c026c407b9ff8`, `77140aac8b749397cff82e3829d04b8ce254518e`)
  - C: `84605bd19e3c0d66493c796266192d5300e9688c` (parents `d471931cf34146f48deb13636c2ca13466f18c1c`, `30df83831e22eed995736057b777a8ba69c7190d`)
  - respec: `4137ae6bc4e848a8493e9a4a2f571289533c7be6` (parents `c687cf40df868dc14799de6de2169b60d7b3d473`, `8f35603c2032192ad0ad0aa88b0195079fab2cb9`)
- Result: **green**. The whole `apps/web` suite passed: 273 of 273 files, 4805 tests passed, 6 skipped, exit 0. `make lint` exited 0.

## 0. merge-1.md and the starting point

```
$ git status --short && git rev-parse HEAD refs/heads/night/merge-029-1/merge-029-1
18f67971a7ab211d01b5f2d260a482088f8c50c4
18f67971a7ab211d01b5f2d260a482088f8c50c4
$ git show refs/heads/night/merge-029-1/merge-029-1:specs/029-room-polish/merge-1.md | grep -n -i -E "result|green" | head
10:- Result: **green**. `apps/web` suite 265 of 265 files passed, 4702 tests passed, 6 skipped, exit 0. `make lint` exit 0.
...
```

merge-1.md says green (the whole `apps/web` suite and `make lint`). My branch was already at merge-029-1's final tip and the tree was clean, so I needed no `git merge --ff-only`.

## 1. The tips and their ancestry

```
$ git rev-parse refs/heads/night/verify-029a/verify-029a refs/heads/night/verify-029c/verify-029c refs/heads/night/respec-029c/respec-029c; for t in refs/heads/night/verify-029a/verify-029a refs/heads/night/verify-029c/verify-029c refs/heads/night/respec-029c/respec-029c; do git merge-base --is-ancestor f411d8e1b3427f1b78f4bae55343a75922dbb027 $t; echo "$t is-ancestor exit $?"; done
77140aac8b749397cff82e3829d04b8ce254518e
30df83831e22eed995736057b777a8ba69c7190d
8f35603c2032192ad0ad0aa88b0195079fab2cb9
refs/heads/night/verify-029a/verify-029a is-ancestor exit 0
refs/heads/night/verify-029c/verify-029c is-ancestor exit 0
refs/heads/night/respec-029c/respec-029c is-ancestor exit 0
```

All three tips match the brief (respec's `8f35603c` in full is `8f35603c2032192ad0ad0aa88b0195079fab2cb9`), and `f411d8e1` is an ancestor of each (exit 0).

The respec tip changes only `spec.md` against its base in C's line:

```
$ git merge-base --is-ancestor 30df8383 8f35603c; echo "C in respec: $?"; git diff --stat $(git merge-base 30df8383 8f35603c) 8f35603c
C in respec: 1
 specs/029-room-polish/spec.md | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)
```

The two notes' own lines:
- `verify-a.md:9`: "**Result: green.** Group A's tip passes the whole `apps/web` suite (266 files, 4659 passed, 6 skipped, 0 failed) and `make lint` (exit 0). There was nothing to merge."
- `verify-c.md:12`: "**Result: green.** On the merge, the whole `apps/web` suite passed: 266 files, 4662 tests passed, 6 skipped, 0 failed, exit 0. `make lint` exited 0. …"

## 2. The merges (A, then C, then respec)

### A

```
$ git merge --no-ff refs/heads/night/verify-029a/verify-029a -m "merge(029): group A, verify-029a's tip 77140aac8b749397cff82e3829d04b8ce254518e (Q55)"; echo "merge exit $?"; git status --short | …
Auto-merging apps/web/src/room/app.ts
Auto-merging apps/web/src/room/hud/split.css
Auto-merging specs/029-room-polish/plan.md
CONFLICT (content): Merge conflict in specs/029-room-polish/plan.md
Auto-merging specs/029-room-polish/tasks.md
Automatic merge failed; fix conflicts and then commit the result.
merge exit 1
M  apps/web/src/room/app.ts
A  apps/web/src/room/compose/over.ts
M  apps/web/src/room/hud/split.css
M  apps/web/src/room/layout.ts
M  apps/web/src/room/room.css
A  apps/web/test/ui/hud-over-contrast.test.ts
A  apps/web/test/ui/hud-over-layers.test.ts
A  apps/web/test/ui/hud-over-room.test.ts
A  apps/web/test/ui/hud-over-walking.test.ts
A  specs/029-room-polish/impl-a.md
UU specs/029-room-polish/plan.md
M  specs/029-room-polish/tasks.md
A  specs/029-room-polish/verify-a.md
```

This matches the supervisor's preview. `app.ts` and `hud/split.css` auto-merged; the only conflict is `plan.md` §9, the paragraph "Group A owns: …". No code or test file conflicted.

The conflict hunk as git showed it (`git diff specs/029-room-polish/plan.md`):

```
diff --cc specs/029-room-polish/plan.md
index 8c48f1e8,254dab93..00000000
--- a/specs/029-room-polish/plan.md
+++ b/specs/029-room-polish/plan.md
@@@ -231,7 -222,11 +256,15 @@@ Each group edits only the files its tas
  
  No other file is edited by two groups: `room.css` is A's alone, `layout.ts` A's, `app.ts` A's re-fit and B's one `renderTalk` line only (rv-spec-029's S-10 gives A the re-fit; S-3's `topicReady` needs B's line; C's blink is in `faces3d.ts`, D's screen in `choice.ts`, neither edits `app.ts`), `build/room/report.ts` and `build/room/readiness.ts` B's.
  
++<<<<<<< HEAD
 +Group A owns: `compose/over.ts`, `layout.ts` (`HudApplied`'s `room`, `applyHud`, `setWalking`), `app.ts`'s re-fit (`:240-295`), `room.css` (`:root`'s two alphas, the over-room block), the appended block of `hud/split.css`, its two tests. Group B owns: `talk/talk.ts`, `talk/messages.ts`, `content/messages.yaml`, `hud/split.css:273` and the rows' rule (or the frame's `z-index`), `app.ts`'s one `topicReady` line in the `renderTalk` call, `build/room/readiness.ts` (`readinessReasons`; `twinReadiness` its projection), `build/room/report.ts` (the readiness section), `build/room/checks/family.ts` (`ComposeOptions.readinessReasons`, one field) and `build/room/cli.ts`'s `report` (the hand-in; rework-029b's departure, §R-B4), its two tests. Group C owns: `build/room/lettering.ts`, `build/room/schema.ts` (the two keys), `content/lettering/*`, `content/room/outlines/*` (new files), `content/room/monitor-line.yaml`, `room/scene.yaml`, `room/catalog/busy-sign.yaml`, `dog-sign.yaml` (comments, names), `room/looks/inked-cel.yaml`, `faces/terminal.ts`, `scene/faces3d.ts`, `src/room/paper.ts`, `scene/bundle3d.ts`, `flat.ts`, `ui-words.yaml`, `ui-keys.ts`, its tests. Group D owns: `src/choice/choice.ts`, `choice.css`, `cards.ts`, `room/hints.yaml`, row 6 of `specs/012-loading-screen/spec.md`'s The Hint Copy (§R-D5), `test/ui/choice-cards.test.ts`, `test/ui/choice.test.ts`.
++=======
+ Group A owns: `compose/over.ts`, `layout.ts` (`HudApplied`'s `room` and `stage`, `applyHud`, `setWalking`), `app.ts`'s re-fit (`:240-295`), `room.css` (`:root`'s two alphas, the over-room block), the appended block of `hud/split.css`, its tests (T-A01's two, `rework-029a`'s `hud-over-walking.test.ts`, `rework2-029a`'s `hud-over-layers.test.ts`). Group B owns: `talk/talk.ts`, `talk/messages.ts`, `content/messages.yaml`, `hud/split.css:273` and the rows' rule (or the frame's `z-index`), `app.ts`'s one `topicReady` line in the `renderTalk` call, `build/room/readiness.ts` (`readinessReasons`; `twinReadiness` its projection), `build/room/report.ts` (the readiness section), its two tests. Group C owns: `build/room/lettering.ts`, `build/room/schema.ts` (the two keys), `content/lettering/*`, `content/room/outlines/*` (new files), `content/room/monitor-line.yaml`, `room/scene.yaml`, `room/catalog/busy-sign.yaml`, `dog-sign.yaml` (comments, names), `room/looks/inked-cel.yaml`, `faces/terminal.ts`, `scene/faces3d.ts`, `src/room/paper.ts`, `scene/bundle3d.ts`, `flat.ts`, `ui-words.yaml`, `ui-keys.ts`, its tests. Group D owns: `src/choice/choice.ts`, `choice.css`, `cards.ts`, `room/hints.yaml`, `test/ui/choice-cards.test.ts`, `test/ui/choice.test.ts`.
+ 
+ *impl-029a's record, before rv-spec-029 reported (the two paragraphs above win where they differ: B's one `topicReady` line in `app.ts`; A's `HudApplied` also carries `stage`):* No other file is edited by two groups: `room.css` is A's alone, `layout.ts` A's, `app.ts` A's four lines in `refit` (§R-A2's departure) and no other group's (B's messages are in `talk.ts`; C's blink in `faces3d.ts`; D's screen in `choice.ts`), `build/room/report.ts` B's.
+ 
+ Group A owns: `compose/over.ts`, `layout.ts`, `app.ts` (`refit`'s `room` and `stage`, §R-A2), `room.css` (`:root`'s two alphas, the over-room block), the appended block of `hud/split.css`, its two tests. Group B owns: `talk/talk.ts`, `talk/messages.ts`, `content/messages.yaml`, `hud/split.css:273`, `build/room/report.ts` (the readiness section), its two tests. Group C owns: `build/room/lettering.ts`, `build/room/schema.ts` (the two keys), `content/lettering/*`, `content/room/outlines/*` (new files), `content/room/monitor-line.yaml`, `room/scene.yaml`, `room/catalog/busy-sign.yaml`, `dog-sign.yaml` (comments, names), `room/looks/inked-cel.yaml`, `faces/terminal.ts`, `scene/faces3d.ts`, `src/room/paper.ts`, `scene/bundle3d.ts`, `flat.ts`, `ui-words.yaml`, `ui-keys.ts`, its tests. Group D owns: `src/choice/choice.ts`, `choice.css`, `cards.ts`, `room/hints.yaml`, `test/ui/choice-cards.test.ts`, `test/ui/choice.test.ts`.
++>>>>>>> refs/heads/night/verify-029a/verify-029a
  
  ## 10. What waits for his hand
  
```

To read each side against its base, I reran `git checkout --conflict=diff3`. The base is one paragraph, the same as HEAD's paragraph without B's and D's two insertions.

- **HEAD (the line, B and D) changed** the base's one paragraph in two places. In B's list, before B's "its two tests" (from B's merge in merge-1), it added "`build/room/checks/family.ts` (`ComposeOptions.readinessReasons`, one field) and `build/room/cli.ts`'s `report` (the hand-in; rework-029b's departure, §R-B4),". In D's list, after `room/hints.yaml`, it added "row 6 of `specs/012-loading-screen/spec.md`'s The Hint Copy (§R-D5),".
- **A changed** two places in the same paragraph, both in A's own list: "`HudApplied`'s `room`," became "`HudApplied`'s `room` and `stage`,", and A's "its two tests." became "its tests (T-A01's two, `rework-029a`'s `hud-over-walking.test.ts`, `rework2-029a`'s `hud-over-layers.test.ts`).". It also added two new paragraphs after it: "*impl-029a's record …*" and the earlier "Group A owns: `compose/over.ts`, `layout.ts`, `app.ts` (`refit`'s …".

**Resolution:** I kept every change from both sides and added nothing either side didn't write. The paragraph is HEAD's line with A's two in-place edits applied, followed by A's two added paragraphs word for word, each after a blank line. The resolved paragraph, word-diffed against each side:

```
vs ours:
[-`room`,-]
{+`room` and `stage`,+}
[-two tests.-]
{+tests (T-A01's two, `rework-029a`'s `hud-over-walking.test.ts`, `rework2-029a`'s `hud-over-layers.test.ts`).+}
vs theirs:
{+`build/room/checks/family.ts` (`ComposeOptions.readinessReasons`, one field) and `build/room/cli.ts`'s `report` (the hand-in; rework-029b's departure, §R-B4),+}
{+row 6 of `specs/012-loading-screen/spec.md`'s The Hint Copy (§R-D5),+}
```

The resolved text, now at `plan.md:259-263`:

```
Group A owns: `compose/over.ts`, `layout.ts` (`HudApplied`'s `room` and `stage`, `applyHud`, `setWalking`), `app.ts`'s re-fit (`:240-295`), `room.css` (`:root`'s two alphas, the over-room block), the appended block of `hud/split.css`, its tests (T-A01's two, `rework-029a`'s `hud-over-walking.test.ts`, `rework2-029a`'s `hud-over-layers.test.ts`). Group B owns: `talk/talk.ts`, `talk/messages.ts`, `content/messages.yaml`, `hud/split.css:273` and the rows' rule (or the frame's `z-index`), `app.ts`'s one `topicReady` line in the `renderTalk` call, `build/room/readiness.ts` (`readinessReasons`; `twinReadiness` its projection), `build/room/report.ts` (the readiness section), `build/room/checks/family.ts` (`ComposeOptions.readinessReasons`, one field) and `build/room/cli.ts`'s `report` (the hand-in; rework-029b's departure, §R-B4), its two tests. Group C owns: `build/room/lettering.ts`, `build/room/schema.ts` (the two keys), `content/lettering/*`, `content/room/outlines/*` (new files), `content/room/monitor-line.yaml`, `room/scene.yaml`, `room/catalog/busy-sign.yaml`, `dog-sign.yaml` (comments, names), `room/looks/inked-cel.yaml`, `faces/terminal.ts`, `scene/faces3d.ts`, `src/room/paper.ts`, `scene/bundle3d.ts`, `flat.ts`, `ui-words.yaml`, `ui-keys.ts`, its tests. Group D owns: `src/choice/choice.ts`, `choice.css`, `cards.ts`, `room/hints.yaml`, row 6 of `specs/012-loading-screen/spec.md`'s The Hint Copy (§R-D5), `test/ui/choice-cards.test.ts`, `test/ui/choice.test.ts`.

*impl-029a's record, before rv-spec-029 reported (…):* No other file is edited by two groups: … (A's line, unchanged)

Group A owns: `compose/over.ts`, `layout.ts`, `app.ts` (`refit`'s `room` and `stage`, §R-A2), … (A's line, unchanged)
```

```
$ git add specs/029-room-polish/plan.md && git commit -q --no-edit && git log --oneline -1 && git rev-parse HEAD && git diff --stat HEAD^1 HEAD | tail -1
a37dd5aa merge(029): group A, verify-029a's tip 77140aac8b749397cff82e3829d04b8ce254518e (Q55)
a37dd5aa4027bac26d0ec5fe2fc94c9fbaf14dc8
 13 files changed, 2135 insertions(+), 5 deletions(-)
```

No conflict markers were left (`grep -c` over `plan.md` for the four marker shapes: `0`).

### C

```
$ git merge --no-ff refs/heads/night/verify-029c/verify-029c -m "merge(029): group C, verify-029c's tip 30df83831e22eed995736057b777a8ba69c7190d (Q56)"
Auto-merging specs/029-room-polish/plan.md
Auto-merging specs/029-room-polish/spec.md
Auto-merging specs/029-room-polish/tasks.md
Merge made by the 'ort' strategy.
 apps/web/build/room/emit.ts                        |   5 +
 …
 38 files changed, 3590 insertions(+), 42 deletions(-)
merge exit 0
```

(The file list is 38 lines; `git show --stat 84605bd1` gives it in full.)

**This was clean, not the `tasks.md` conflict the supervisor's preview expected.** Here is why:

```
$ git merge-tree --write-tree --name-only a37dd5aa4027bac26d0ec5fe2fc94c9fbaf14dc8 30df83831e22eed995736057b777a8ba69c7190d; echo "A-merge+C merge-tree exit $?"; git merge-tree --write-tree --name-only 77140aac8b749397cff82e3829d04b8ce254518e 30df83831e22eed995736057b777a8ba69c7190d; echo "A-tip+C merge-tree exit $?"; git merge-base 77140aac 30df8383; git merge-base a37dd5aa 30df8383
3b3645c9fbd19df0f5c97f407484e89095b1e192
A-merge+C merge-tree exit 0
5a48f3c173b456093aa0d81ab52fd149496df029
specs/029-room-polish/tasks.md

Auto-merging specs/029-room-polish/plan.md
Auto-merging specs/029-room-polish/spec.md
Auto-merging specs/029-room-polish/tasks.md
CONFLICT (content): Merge conflict in specs/029-room-polish/tasks.md
A-tip+C merge-tree exit 1
c743e2dab595cd0f9fff08bcba628f4ba8de9bf4
287acd27b0e9255cf2c47dbb5942fa6ea5e2f6f3
$ git log --oneline -1 287acd27; for b in 2b960dcb 4d985962 77140aac; do git merge-base --is-ancestor 287acd27 $b; echo "287acd27 in $b: $?"; done
287acd27 docs(029): rework of groups C and D after rv-spec-029 (S-5 to S-9, N-4); rework-cd.md; make lint exit 0
287acd27 in 2b960dcb: 1
287acd27 in 4d985962: 0
287acd27 in 77140aac: 1
```

C against A's tip alone (base `c743e2da`) conflicts in `tasks.md`, as the preview said. On the line, though, C's merge base is `287acd27` (the C-and-D rework), which reached the line with D (`4d985962`) in merge-1. The `tasks.md` lines that conflict against `c743e2da` are therefore already common, and git merged them without a conflict. I resolved nothing in C's merge.

### respec-029c

```
$ git merge --no-ff refs/heads/night/respec-029c/respec-029c -m "merge(029): spec 029's Edge Cases fix for group C, respec-029c's tip 8f35603c2032192ad0ad0aa88b0195079fab2cb9"
Auto-merging specs/029-room-polish/spec.md
Merge made by the 'ort' strategy.
 specs/029-room-polish/spec.md | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)
merge exit 0
```

Clean, and it touched `spec.md` only.

### back-029c's bullet before `### R-C8` (rv-respec-029c's N-2)

```
$ L=$(grep -n "^### R-C8" specs/029-room-polish/plan.md | cut -d: -f1); echo "R-C8 at line $L"; sed -n "$((L-6)),$((L))p" specs/029-room-polish/plan.md | cut -c1-300
R-C8 at line 222
- **D-C6, the converter (§R-C1).** …

- **D-C7, a test of an earlier spec rewritten (§R-C4).** …

- **back-029c, the sheet's back (§R-C4; FR-020; the page's Q38, its recommended answer taken provisionally under rule 1; rv-impl-029c's C-1 and N-3).** §R-C4 put one canvas map on a `DoubleSide` material. …

### R-C8. Departures in implementation (`bind-029c`)
```

It holds: `plan.md` still has back-029c's bullet (line 220) right before the `### R-C8` heading (line 222), in the same order as at C's tip (`30df8383`'s `plan.md:152-154`).

## 3. `make setup`

```
$ make setup > /tmp/merge-029-2/setup.log 2>&1; echo "make setup exit $?"; tail -8 /tmp/merge-029-2/setup.log
make setup exit 0

Run `npm audit` for details.
npm notice
npm notice New major version of npm available! 11.19.0 -> 12.2.2
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.2
npm notice To update run: npm install -g npm@12.2.2
npm notice
git hooks: /home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks
```

The worktree was clean afterwards (`git status --short`: empty).

## 4. Workers

```
$ cat /sys/fs/cgroup/cpu.max
400000 100000
```

n = quota ÷ period = 400000 ÷ 100000 = **4**.

## 5. The whole `apps/web` suite on the merge result (`4137ae6b`, run from save point `df7d13c2`, same tree)

I started it with `run_in_background` and a two-hour timeout, logged it, and waited for its own completion notice:

```
$ cd apps/web && date -u +%Y-%m-%dT%H:%M:%SZ > /tmp/merge-029-2/suite.start && npx --no-install vitest run --maxWorkers=4 > /tmp/merge-029-2/suite.log 2>&1; echo "vitest exit $?" >> /tmp/merge-029-2/suite.log; date -u +%Y-%m-%dT%H:%M:%SZ >> /tmp/merge-029-2/suite.log
```

The runner's totals and the log's last lines:

```
pet.select and pet.frame over the real adapters, with chase.frame: 6.60 bytes a petting of 252 frames; 0.0001 ms a frame
dino scene: mean ms a frame per run 0.0002, 0.0001, 0.0001

 Test Files  273 passed (273)
      Tests  4805 passed | 6 skipped (4811)
   Start at  16:25:11
   Duration  1665.92s (tests 70%, import 30%)

vitest exit 0
2026-11-16T16:52:58Z
```

(Start stamp in `suite.start`: `2026-11-16T16:25:11Z`.)

No failures. `grep -n -E "FAIL|✗|×"` over the 50-line log matches one line, which is a passing test's own output (`37:room floor: 201 starts × 600 frames, least distance kept 0.141 m, 0 violations`), not a failure. `test/room/twin-2d.test.ts` passed in this run (273 of 273 files), so I didn't rerun it alone.

Summary: 273 of 273 files and 4805 tests passed, 6 skipped, exit 0, in 1665.92 s (about 27.8 minutes). merge-1's run had 265 files. A adds four test files (`test/ui/hud-over-{contrast,layers,room,walking}.test.ts`) and C adds four (`test/room/{monitor-cursor,paper-back,paper-sheet,piece-words}.test.ts`), so 265 + 4 + 4 = 273. Group A's contrast tests ran over B's frame (plan §11's R-3) and passed.

## 6. `make lint`

```
$ make lint > /tmp/merge-029-2/lint.log 2>&1; echo "make lint exit $?"; wc -l < /tmp/merge-029-2/lint.log; cat /tmp/merge-029-2/lint.log
make lint exit 0
11
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
893 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
```

The log is 11 lines and this is all of it. Exit 0.

## 7. Not run

- **The full `make check`**: it belongs to the integration task (T-INT), not to this merge.
- **The image stage**: it fails in the workers' containers (night 3's Q46 and Q48), so it stays with his gate.
- **`services/gateway`'s suite**: its 5 G8 failures at `f411d8e1` (Q30, Q34) are in a folder that A, C, and respec-029c don't touch.
- **`pytest`**: no item changed a Python file.

## 8. What changed on this branch

This branch has three merge commits (`a37dd5aa`, `84605bd1`, `4137ae6b`), save points with no content, and this note. The only content I wrote is the conflict resolution in `specs/029-room-polish/plan.md` §9 (in A's merge) and this file. I edited no source, test, or human-only path, and no command was refused.

## 9. Questions

There is one, in `/night/io/out/questions.md`: does the line take this branch's tip as its new tip, ready for T-INT's full `make check`? I recommend yes.
