# Spec 030, the integration: `int-030`'s record (T-INT01, T-INT02b)

Night 5 (2026-11-17). Branch `night/int-030/int-030`, from F's tip `ab6e64e60a7ba2ae39e14d47980c130d173cca9e` (spec
001's eight fixes, merged and reviewed). Tasks: T-INT01 (the merges) and T-INT02b (B's look's cases), from
`tasks.md`; T-INT02, T-INT02a, T-INT03, and T-INT04 are later tasks'. The order is the supervisor's (documents, A,
DSB, T-INT02b's RED, B, DS, C, DJ), which differs from `tasks.md`'s T-INT01 (A, B, C, DJ, DS): DSB didn't exist when
the task was written, and C and DJ come as verify tips that carry F's line. Every merge `--no-ff`.

## The merges

| # | What | Merged commit | Merge commit | Conflicts |
|---|---|---|---|---|
| 1 | The documents (`rework3-spec-030`) | `019993120f3818e7b9a55ad6d949b6a641737584` | `6047f0a6c1eaee4a76054aba3654616ed1e439c4` | none |
| 2 | A (`rework-030a`) | `9026b4ba14b8292a087a09e24cf0dc93bced69b8` | `214124111c3c25ee3db6d7e7537e0269ab2bbd99` | none (`plan.md`, `tasks.md` auto-merged) |
| 3 | DSB (`verify-030dsb`'s line, `impl-030dsb-r5` inside) | `b1320584719aa41a811945ca9b2893f3552b0478` | `a5692b92d80622bd69af6ac9bf8338ea7f74526f` | none: the `plan.md`/`tasks.md` conflict went with the documents in (`plan.md` auto-merged) |
| 4 | T-INT02b's RED (a test commit, not a merge) | | `5cf48ac5fcea50ab5c8f66109bb8c49c0e385e0d` | |
| 5 | B (`rework-030b`) | `447080237464f0706e657d78e3f293490851bea8` | `ca8b2575172d6476f4f8e2f6c28eecd1fdc9c641` | `plan.md`, three hunks (below) |
| 6 | DS (`rework-030ds`, carries B) | `192652e00567130c3e2f2f8f8109ae19a7fb994b` | `a8b0c94220a1faf6fa24e68fde756d4b8153b40c` | none |
| 7 | C (`verify-030c`, F merged in) | `cb1a537b13422a107152a69f367e1bfd36f42c1e` | `143f554ce67b2fe4e77ce97b88979ce8d19ffe9a` | none (`plan.md` auto-merged) |
| 8 | DJ (`verify-030dj`, `judge-ui-r1`'s `3996c6c4` inside) | `46b726bacecb370dd3cf42d411d0538aeb5b811e` | `31fd7a94f258004aabcde91a88712a8d41119c9b` | `studio-round-1.md`, one hunk (below) |

No code file conflicted in any merge; nothing in a group's code was resolved by hand.

**B's `plan.md` conflict**, three hunks, resolved by the brief's rule (keep the documents' bullets, append B's "As
built" lines under them), with the Edit tool:

- §R-B2/§R-B3: the documents' N-3 bullet, then B's two §R-B2 "As built" bullets; the documents' §R-B3 bullets, then
  B's "As built (impl-030b, T-B03)" and "As built (rework-030b)" lists. B's side's pre-rework §R-B3 bullets (the
  `clip-path`-on-the-control route the documents replaced) dropped.
- §R-B4/§R-B5: not named in the brief, but the same file and the same shape, so the same rule: the documents' §R-B4
  bullets, then B's two §R-B4 "As built" lists; the documents' §R-B5 paragraph, then B's "As built" sentence (its two
  helpers) as a bullet.
- §9's table: the documents' A, B, and C rows. B's side held older rows only, no "As built" line; B's helpers go to
  §9's "As built" (this task's `plan.md` commit).

Against the merge's first parent, `plan.md`: 39 insertions, 0 deletions (`git diff HEAD --stat` before the commit).

**DJ's `studio-round-1.md` conflict**, one hunk (the record's four `*(R-3)*` placeholders against `judge-ui-r1`'s
record): `judge-ui-r1`'s side, by the page's Q86. The resolved file checked byte for byte against `3996c6c4`'s:

```
$ sha256sum specs/030-ui-skin/studio-round-1.md; git show 3996c6c4:specs/030-ui-skin/studio-round-1.md | sha256sum; git show 3996c6c4:specs/030-ui-skin/studio-round-1.md | cmp - specs/030-ui-skin/studio-round-1.md && echo BYTE-IDENTICAL
05e396e81375e64fe34b908363521185d1fb9941f2019007389141029fe35b93  specs/030-ui-skin/studio-round-1.md
05e396e81375e64fe34b908363521185d1fb9941f2019007389141029fe35b93  -
BYTE-IDENTICAL
```

**Q95's N-2, the rewrap of `deploy/scripts/web_image.py:57`: no commit, already done.** The brief asks for it after
DSB's merge, in its own commit. DSB's merged line already holds it: `impl-030dsb-r5`'s GREEN `5ad70a02` ("N-2's
docstring rewrap", 157 characters to 116 + 40, words unchanged), an ancestor of the merge (`git merge-base
--is-ancestor 5ad70a02 HEAD`). After the merge, lines 53 to 58 of `web_image.py` are 113, 118, 114, 112, 116, and 40
characters. Q95 was written from `verify-030dsb`'s tip `4b64ac73`, before `impl-030dsb-r5`; the brief's DSB commit,
`b1320584`, is that later line. Nothing was left to rewrap.

## T-INT02b: B's look's cases, RED then GREEN

**The cases** (`impl-b.md`, "T-B01 (d)", its whole-suite run on B's GREEN tip): `test/ui/hud-look.test.ts`, "every
HUD control a tile (spec 014, T024; FR-022)", its two cases "gives every control the tile's face in the column
layout, never the page's white button" and "… in the dock layout, …" (`:117-140` at A's merge; A's file). No other
case failed in that run. `impl-b.md`'s failure: `AssertionError: button.: Send: expected 'var(--_label)' to be
'var(--hud-text)'` at `:129`. Its cause, by `impl-b.md`'s reading: the file's reader splits every selector at every
comma, inside `:is()` too, so a bare fragment of `button.css`'s list matched "Send" on a page without `data-skin`.

**Old assertion** (both cases, one loop): for every HUD control (`.hud-bar button, .hud-bar a, .room-list button,
.talk button, .room-walk`), on the source page with no `data-skin`, the winning `background` a tile face
(`var(--tile-face)` or `rgb(var(--glass) / var(--glass-alpha))`, the split layout's "Back" the over-room plate) and
the winning `color` `var(--hud-text)`; the list's and the conversation's buttons `border` `1px solid
var(--tile-border)` and `border-radius` `0.5rem`.

**New assertion** (Q73's form, for these two cases alone; the cases renamed "gives every skinned control the built
skin's tokens in the {column, dock} layout, the rest the tile's face"): the root's `data-skin` set to
`content/ui-skins.yaml`'s `active`, as the build sets it. Each of Q5's skinned controls (spec.md FR-008: `.hud-bar
.hud-tile`, `.room-walk`, `.room-eat`, `.split-back`, `.split-hint`, `.resume-close`, `.talk-larger`,
`.talk-log-toggle`, `.talk-form button[type="submit"]`) takes three things from the skin's
`--btn-<variant>-<normal|selected|disabled>-*` tokens, by the cascade: its label (`color` through `--_label`), its
face (its `::before`'s `background-color` through `--_face`), and its border's line (`--_border`). "Send" is primary
and the rest secondary (Q6). Its own `background-color` and `border-color` are `transparent`, and its
`border-radius` is `var(--btn-radius)`. Every other control keeps spec 014's tile face and `var(--hud-text)`, and the
tile's border and radius. More than six skinned controls are found, and `active` is read. The cascade for these two
cases splits each list at its top-level commas only. `:is()`, `:not()`, and `:has()` take their most specific
argument's specificity, and `:where()` none. The file's other 13 cases and its readers (`RULES`, `winning()`) are
unchanged. The resume case (`:138`) and the contrast pairs stay T-INT02's, as Q73 words them.

Checked before the RED commit on two scratch exports (`git merge-tree --write-tree` of HEAD with B, and of HEAD with
DS, whose `active` is `metal-image`), the file copied in: 15 passed on each.

### RED, at `5cf48ac5` (A and DSB merged, B not): seen failing

From `apps/web/`, `npx --no-install vitest run test/ui/hud-look.test.ts`, exit 1:

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/int-030/apps/web

 ❯ test/ui/hud-look.test.ts (15 tests | 2 failed) 17855ms
   ❯ every HUD control a tile (spec 014, T024; FR-022) (4)
     × gives every skinned control the built skin's tokens in the column layout, the rest the tile's face 17564ms
     × gives every skinned control the built skin's tokens in the dock layout, the rest the tile's face 70ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/ui/hud-look.test.ts > every HUD control a tile (spec 014, T024; FR-022) > gives every skinned control the built skin's tokens in the column layout, the rest the tile's face
 FAIL  test/ui/hud-look.test.ts > every HUD control a tile (spec 014, T024; FR-022) > gives every skinned control the built skin's tokens in the dock layout, the rest the tile's face
AssertionError: button.hud-tile: Resume: label: expected 'var(--hud-text)' to match /^var\(--btn-secondary-(normal|selecte…/

- Expected:
/^var\(--btn-secondary-(normal|selected|disabled)-label\)$/

+ Received:
"var(--hud-text)"

 ❯ test/ui/hud-look.test.ts:259:81
    257|           const token = (what: string): RegExp =>
    258|             new RegExp(`^var\\(--btn-${variant}-(normal|selected|disab…
    259|           expect(throughPrivate(el, cascaded(el, ["color"])), `${name}…
       |                                                                                 ^
    260|           expect(throughPrivate(el, cascaded(el, ["background-color"],…
    261|           expect(cascaded(el, ["--_border"]), `${name}: border's line`…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 13 passed (15)
   Start at  08:58:35
   Duration  85.48s (tests 95%, transform 3%, import 3%)

exit=1
```

### GREEN, at `ca8b2575` (B merged): passing

From `apps/web/`, `npx --no-install vitest run test/ui/hud-look.test.ts test/ui-skins.test.ts
test/ui/button-skin.test.ts test/ui/button-states.test.ts` (the RED's file with B's three), exit 0:

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/int-030/apps/web


 Test Files  4 passed (4)
      Tests  83 passed (83)
   Start at  09:08:16
   Duration  109.49s (tests 95%, import 3%, transform 2%)

exit=0
```

`hud-look.test.ts` passed again after DS's merge, after C's, and on the whole suite (below). **No case was found
failing only after a later merge**, so none is named "found at integration".

## The runs after each merge

All from `apps/web/` with `npx --no-install vitest run <files>` (Q25), `make setup` first (`node_modules` was
missing; exit 0). "The seven" are B's and DS's: `test/ui-skins.test.ts test/ui-skin-image.test.ts
test/ui/button-skin.test.ts test/ui/button-states.test.ts test/ui/button-image-skin.test.ts
test/ui/button-room-helper.test.ts test/ui/button-shipped-css.test.ts`.

**After A's merge (and DSB's, and the RED), at `5cf48ac5`.** A's own files, the 27 test files A's line changed or
added (`git diff --name-only` against its merge base; the same as `impl-a.md`'s lists): `test/lookdev/phone.test.ts
test/room/geometry.test.ts test/room/halves.test.ts test/room/hud-contrast.test.ts test/room/hud-split-geometry.test.ts
test/room/hud-wall-geometry.test.ts test/room/hud.test.ts test/room/report.test.ts test/room/stages-checks.test.ts
test/room/stages.test.ts test/room/eat-box.test.ts test/room/protect.test.ts test/ui/degraded.test.ts
test/ui/hud-a11y.test.ts test/ui/hud-halves-contrast.test.ts test/ui/hud-halves.test.ts test/ui/hud-look.test.ts
test/ui/hud-model.test.ts test/ui/hud-no-blur.test.ts test/ui/hud-notes.test.ts test/ui/hud-over-layers.test.ts
test/ui/hud-over-room.test.ts test/ui/hud-over-walking.test.ts test/ui/hud-split-dog.test.ts test/ui/hud.test.ts
test/ui/loading-a11y.test.ts test/ui/pick.test.ts`. The seven didn't exist yet. Exit 1, the RED's two cases alone
(the same failure as the RED's run above, its 22 lines not repeated):

```
 ❯ test/ui/hud-look.test.ts (15 tests | 2 failed) 18694ms
   ❯ every HUD control a tile (spec 014, T024; FR-022) (4)
     × gives every skinned control the built skin's tokens in the column layout, the rest the tile's face 18389ms
     × gives every skinned control the built skin's tokens in the dock layout, the rest the tile's face 65ms
…
 Test Files  1 failed | 26 passed (27)
      Tests  2 failed | 492 passed (494)
   Start at  09:01:42
   Duration  276.59s (tests 69%, import 31%)

exit=1
```

A's run was made after the RED commit, not between A's merge and DSB's: I merged DSB before running A's files.
DSB changes no `apps/web` file but `Dockerfile`, so A's files read the same tree either way.

**After DSB's merge.** DSB's files are Python. `python3 -I -B -m pytest -q -p no:cacheprovider
deploy/scripts/test_release.py deploy/scripts/test_web_image.py scripts/studio/` (Q53's command; `-q -p
no:cacheprovider` added so no cache is written), exit 0:

```
........................................................................ [ 25%]
........................................................................ [ 50%]
........................................................................ [ 76%]
...................................................................      [100%]
283 passed in 15.22s
exit=0
```

**After B's merge**: the GREEN run above (B's three and `hud-look`): 83 passed.

**After DS's merge, at `a8b0c942`.** The seven, `test/ui/hud-look.test.ts`, and `test/ui/hud-halves.test.ts` (A's
halves, which DS's departure 6 leaves to the integration to run beside its stand-in), exit 0:

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/int-030/apps/web


 Test Files  9 passed (9)
      Tests  151 passed (151)
   Start at  09:10:19
   Duration  115.33s (tests 95%, import 3%, transform 1%)

exit=0
```

**After C's merge, at `143f554c`.** C's 14 (T-C03's list in `impl-c.md`: `test/ui/dark-pages.test.ts
test/ui/choice-cards.test.ts test/ui/choice.test.ts test/ui/a11y.test.ts test/ui/loading-a11y.test.ts
test/ui/loading-degraded.test.ts test/ui/loading-faults.test.ts test/ui/loading-notes.test.ts
test/ui/loading-page.test.ts test/ui/loading-style.test.ts test/ui/credits.test.ts test/disclosure.test.ts
test/site.test.ts test/smoke.test.ts`), the seven, and `hud-look`, exit 0:

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/int-030/apps/web


 Test Files  22 passed (22)
      Tests  374 passed (374)
   Start at  09:12:24
   Duration  195.02s (tests 82%, import 18%)

exit=0
```

**After DJ's merge, at `31fd7a94`.** DJ's files are `scripts/studio/`'s: the brief's pytest command, `python3 -I -B -m
pytest -p no:cacheprovider deploy/scripts/test_release.py deploy/scripts/test_web_image.py scripts/studio/`, exit 0:

```
============================= test session starts ==============================
platform linux -- Python 3.12.3, pytest-9.1.1, pluggy-1.6.0
rootdir: /home/h4reet/h4reet-ai/night/2026-11-17/int-030
collected 305 items

deploy/scripts/test_release.py ......................................... [ 13%]
..                                                                       [ 14%]
deploy/scripts/test_web_image.py ....................................... [ 26%]
..............................................................           [ 47%]
scripts/studio/test_comfyui_params.py ...                                [ 48%]
scripts/studio/test_line.py ............................................ [ 62%]
........................................................................ [ 86%]
........................................                                 [ 99%]
scripts/studio/test_studio_prompt.py ..                                  [100%]

============================= 305 passed in 28.60s =============================
exit=0
```

And the seven, exit 0:

```
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/int-030/apps/web


 Test Files  7 passed (7)
      Tests  122 passed (122)
   Start at  09:16:40
   Duration  113.34s (tests 95%, import 4%, transform 2%)

exit=0
```

## The whole `apps/web` suite, once, on the last code commit

On `304823128a68817a4cafb297b70160857814a592` (every merge, the RED, and the `lightningcss` line; every later commit
of this branch touches `specs/` alone: `git diff --stat 30482312 HEAD -- . ':!specs' ':!docs'` is empty, and no
`apps/web` test reads `specs/030-ui-skin/` or spec 001's `plan.md`). From `apps/web/`, started in the background with
a two-hour limit and its own notice waited for: `npx --no-install vitest run --reporter=default --reporter=json
--outputFile.json=/tmp/int030/suite.json`, exit 0. The log is 3,482 lines (every file's cases, verbose, as the
default reporter prints with no TTY; at `/tmp/int030/run-suite.txt` for this session); its end:

```
 Test Files  285 passed (285)
      Tests  5009 passed | 6 skipped (5015)
   Start at  09:19:09
   Duration  1609.43s (tests 72%, import 28%)

JSON report written to /tmp/int030/suite.json
exit=0
```

**No case failed.** So no failure needs an owner here. T-INT02's cases (the dead declarations, the resume case, the
contrast pairs) and T-INT02a's contrast re-run aren't written yet. They are the next task's, and nothing of theirs
ran red. `test/room/twin-2d.test.ts` passed in this run. The six skipped, from the JSON report (`numFailedTests` 0,
`numPendingTests` 6), are the same count as B's own whole-suite run (`impl-b.md`, "4885 passed | 6 skipped"). No
group's notes predicted them as new:

- `test/content/film-links.test.ts`, "spec 023: the candidate, before and after the Author publishes it", five cases
  (5, 7, 8, 9, and "writes the candidate from the approved file…").
- `test/room/legacy-stages.test.ts`, "the frozen stages of e324771e (spec 005, T004) give exactly the shipped module's
  stages while it holds the base's formulas".

C's notes asked the integration to check the built `index.html` with B merged (B's plugin must keep C's
`class="dark-page"`). The suite's own release build (`test/global-build.ts`, `/tmp/h4-web-release-85g7vv`, made at
09:19) gives `<html lang="en" class="dark-page" data-skin="metal" data-skin-kind="css">`: C's class kept, and
`metal-image` falling back to `metal` (no files before his intake). `dark-pages.test.ts`'s "carries dark-page on
index.html's own <html>…" case passed after C's merge and in the suite.

## `make lint`, at the end

From the repository's root, on `0a9e26ac` (the code of `30482312`), exit 0. Its whole output:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
952 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit=0
```

Before the RED commit, `prettier --check`, `eslint --max-warnings 0`, and `tsc --noEmit -p apps/web` were run on the
rewritten test alone. ESLint flagged one `no-useless-assignment` and Prettier gave two formatting differences
(Prettier's output written to `/tmp`, applied with the Edit tool). Both were fixed before the commit, and the RED was
run again on the final file (the paste above). `make test`, `make evals`, and `make check` weren't run: the brief
gives the one `make check` to the handover (T-INT04).

## The commits after the merges

| Commit | What |
|---|---|
| `30482312` | `lightningcss` 1.33.0 declared in `apps/web/package.json`'s devDependencies, and the matching line in `package-lock.json` (DS's departure 14; `rv-rework-030ds`'s nit 2). The brief's condition was checked on a scratch export of the merged tree first. `npm install --package-lock-only --offline --ignore-scripts` after the `package.json` line changed `package-lock.json` by one line alone (`packages["apps/web"].devDependencies`), exit 0, with no network. Both lines were then written here with the Edit tool. The same command on a fresh export of this tree left the lockfile byte-identical (`cmp`). Nothing was installed. |
| `69b15d23` | This record's first part (the merges, the RED and GREEN, each merge's run): T-INT02b's GREEN, pasted. |
| `943ac02e` | `plan.md`: §R-D4's "As built" with DS's departures 1 to 14 (DS left `plan.md` alone); §R-B3's "As built (int-030)" on `border-image-source: none` (`rv-rework-030ds`'s nit 3), with a pointer beside each place that says `border-image: none`: `spec.md`'s forced-colours line and FR-014, `plan.md` §R-B3's states bullet and B's "Nothing on the control", §R-B4's `button-states` bullet, and §R-D4's two; §9's "As built (int-030)", the files each merge changed beyond its row. A's, B's, C's, DJ's, and DSB's own departures were already in `plan.md` from their branches and are not restated. |
| `7ee966de` | `impl-ds.md`'s "The labels over the band" (the band table, Q74, Q102) moved under `studio-round-1.md`'s record, word for word (`cmp` of the 48 lines), a pointer left behind. |
| `fe494820` | `tasks.md`: the rows built and reviewed ticked, each citing its tip (below). |
| `c7543c1e` | Spec 001's `plan.md` night-5 index: `- [`fixes/merge-f-3.md`](fixes/merge-f-3.md): the merge of F7` (Q76). |
| `0a9e26ac` | `impl-ds.md`'s "The band's crossings" (T-DS01 (b)'s list) moved under the record too, word for word (`cmp` of the 38 lines). The first move took the labels alone, but T-DS05's row says "paste both" and DS's backlog names the two sections. `rv-rework-030ds`'s nit 1 added to DS's backlog in `impl-ds.md`, in its words. |

**The ticks** (`fe494820`): T-A06 to T-A08 at `9026b4ba` (ticked here because A's branch's `tasks.md` predates them;
A's N-2); T-B01 to T-B04 at `44708023`; T-C01 to T-C03 at `cb1a537b` (`rework-030c`'s `a3898c60` inside); T-DJ01 and
T-DJ02 at `46b726ba` (`impl-030dj`'s `c77eb4ce` inside); R-1 at `35a75b2c`; R-2 on his machine (the candidate judged
by R-3); R-3 at `3996c6c4`; T-DS01 to T-DS05 at `192652e0`, with DSB's share at `b1320584`. T-A01 to T-A05 were
already ticked. **Not ticked:** T-INT01 and T-INT02b, which are built here but not yet reviewed (each has a note
saying so); T-INT02, T-INT02a, T-INT03, and T-INT04, which are later tasks'.

## What's done, and what isn't (for the next task)

Done:

- T-INT01: the eight merges, in the supervisor's order, each `--no-ff`. The merge commits' own messages number them
  1 to 7 (the RED isn't a merge), and the table above numbers them in the brief's 1 to 8.
- T-INT02b: RED `5cf48ac5`, seen failing before B; GREEN after B's merge. No case was found failing only after a
  later merge.
- Each merge's tests, the whole `apps/web` suite (no failure), the brief's pytest line (305 passed), and `make lint`.
- `plan.md`'s "As built" and §9, the `border-image-source` note, the band table and crossings under the record, the
  ticks, Q76's line, and the `lightningcss` line.

Not done, and not this task's:

- **T-INT02** (the next task, `int2-030`): the dead declarations of `room.css` and `split.css`, test-first. Its RED
  per Q73 still has `hud-look.test.ts`'s resume case (`:138`) and the tile colour pairs of `hud-contrast.test.ts`
  and `hud-over-contrast.test.ts` to rewrite. The column and dock cases of `hud-look.test.ts` are already in Q73's
  form (T-INT02b, this task; question 1 below).
- **T-INT02a**: `hud-halves-contrast.test.ts` with B's faces in A's cascade. It passed in the whole suite here.
- **C's ask**: `dark-pages.test.ts`'s colour checks still run under a stand-in `:root[data-skin="metal"]` of plan
  §R-B1's estimates, and C asked that they use B's built stylesheet at T-INT (`impl-c.md`). That needs a test edit,
  which my brief doesn't name (question 2 below).
- **T-INT03** (`adr-030`), and **T-INT04** (the handover): the one `make check`, the merge-request note, and F-3's
  band table in `docs/merge-requests/human-patches/030.md` beside row 1 (Q102; the page's sixty-ninth wake gives it
  to the handover). `human-patches/030.md` came in with DJ's merge and isn't changed here.
- **Backlog, not fixed:** `rv-rework-030ds`'s nit 1 (in `impl-ds.md`'s backlog); DS's N-1 (the image skin's PNGs
  not on Vite's watch list); the reviews' findings in `impl-c.md`'s backlog.
- **His**: the look (SC-008), the round's intake (`human-patches/030.md`, the `.patch` from DJ's line), and Q102.

## Questions (in `/night/io/out/questions.md`, each with a recommended answer)

1. Should T-INT02's RED take only what Q73 names beyond the two cases T-INT02b rewrote (the resume case and the
   colour pairs)? Recommended: yes.
2. Who moves `dark-pages.test.ts`'s colour checks from the stand-in `metal` to B's built stylesheet, as C's notes
   ask? Recommended: T-INT02's task, test-first.

## Departures and slips, named

- **No rewrap commit for Q95's N-2**: it was already in DSB's merged line (above).
- **A's files ran after DSB's merge and the RED, not right after A's merge.** DSB touches no `apps/web` file but
  `Dockerfile`, so A's files read the same tree.
- **B's `plan.md` hunk in §R-B4/§R-B5**: resolved by the brief's §R-B2/§R-B3 rule, since it is the same file and the
  same shape. It is inside the documents, so not a stop.
- **The band's two sections in two commits** (`7ee966de`, `0a9e26ac`): I read "the band table" as the labels' section
  alone and saw DS's backlog only afterwards.
- **Scratch, outside the repository**: `git merge-tree --write-tree` exports in `/tmp/int030-greencheck.K1m9` (HEAD
  with B) and `/tmp/int030-dscheck.8ieI` (HEAD with DS; its `apps/web/package.json` edited there for the lockfile
  check), `/tmp/int030-lock.uAvi` (the lockfile check on this tree), and `/tmp/int030/` (the runs' logs, the commit
  messages, the JSON report). The two exports' `node_modules` were symlinks to this worktree's, removed with
  `unlink` before the `npm` command (the other's at the end). The three export folders are removed (`rm -rf` after
the links were gone; the worktree's `node_modules` intact). `/tmp/int030/` and the page copies `/tmp/int030-*.md` stay
for this session. Nothing under
  `/srv/studio/` was read or written.
- **No refusal** from a hook or the gate this session. No human-only path was written (`.claude/**`, CLAUDE.md,
  REVIEW.md, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`,
  `redteam/forbidden-actions.sh`, `assets/**`). No request to the runner. No push, merge to `main`, PR, container,
  release, plan against the account, or AWS call. No new endpoint or model call, so no cost, span, panel, or
  data-flow entry.

## int2-030

Night 5 (2026-11-17). Branch `night/int2-030/int2-030`, from `int-030`'s tip `fd26f860` (approved by `rv-int-030`,
nits only). Tasks: T-INT02 and T-INT02a, with the page's Q73, Q100, Q107, Q108 taken as recommended (his rule 1), and
`rv-int-030`'s three nits. T-INT03 and T-INT04 are later tasks'. All runs from `apps/web/` with `npx --no-install
vitest run <files>` (Q25), after `make setup` (exit 0). Logs at `/tmp/int2030/` for this session.

### The commits

| Commit | What |
|---|---|
| `5ffdfb66`, `7c871249` | Save points of the RED (the rewritten cases, `test/helpers/built-skin.ts`, the probe). |
| `3ff26628` | **T-INT02's RED**: the rest of the rewritten cases, `test/helpers/layers.ts` (B's faces in A's cascade), the probe's `KEPT`. With the two save points, the one test commit before the removal. |
| `b35b407c` | **T-INT02's GREEN**: 104 dead declarations out of `room.css` and `split.css`. |
| `5b0bf4b2`, `81a56df2` | Save points: Q100's RED in progress (`hud-wall-geometry.test.ts`), and the documents (`tasks.md`, `plan.md`). |
| `05e8dfe2` | **T-INT02a's RED** (Q100): `test/room/hud-wall-geometry.test.ts`. |
| `b821b2b9` | **T-INT02a's GREEN** (Q100): `compose/hud.ts`'s `listFloor` and condition (b). The last code commit. |
| `9b203dc7` | Save point: `plan.md`'s "As built" for Q100. |
| this record's commit | `int.md`, and `tasks.md`'s last note. |

### Step 1: T-INT02's RED, each case's old and new assertion

**Q107: `test/ui/hud-look.test.ts`'s column and dock cases are T-INT02b's** (`5cf48ac5`, reviewed at `fd26f860`).
Their assertions are unchanged. **Nit 1:** the constant they set `data-skin` from (`:116-122`, used at `:244` and by the
resume case) is now `resolveSkin(readSkins(<the yaml>)).id`, the resolved skin's ID (`metal` while the image skin's
files aren't in the tree, as the built page has it). It was `active` (`metal-image`).

| # | File, case | Old assertion | New assertion |
|---|---|---|---|
| 1 | `test/ui/hud-look.test.ts`, the resume case (`:281` at `fd26f860`) | "keeps the resume's panel spec 005's white document, its buttons the page's": no `data-skin`, "Resume" clicked and the panel read at once; its `background` `#ffffff`, and each `button` in it `#ffffff`, by `winning()` | "…, its Close the skin's secondary button, the rest the page's": `data-skin` the resolved ID, the view rendered (`flush()`); the panel `#ffffff`; `.resume .resume-close` matches the skinned list and takes `--btn-secondary-normal-{label,face,border}` by the cascade (label through `--_label`, face on its `::before`), its own background and border `transparent`, radius `var(--btn-radius)`; `.resume-pdf` and an item (as `resume/view.ts` marks one) not skinned, no `--btn-`/`--_` token in their colour, background, or border, the item `#ffffff` |
| 2 | `test/ui/hud-look.test.ts`, "gives the control its own glass hover…" (`:467`) | room.css's `html[data-hud="{column,dock}"] .room-walk:hover`: background `rgb(var(--glass) / var(--glass-alpha-lit))`, border `var(--accent-neon)` | "gives the control the skin's hover…": no room.css hover rule names `.room-walk`; `ui/button.css`'s `(hover: hover)` rule for it sets `--_face` and `--_border` to the secondary hover tokens. Every hover still under `(hover: hover)` (unchanged) |
| 3 | `test/room/hud-contrast.test.ts`, `pairs()` | "text on a tile", "a tile's border on the glass", "the focus ring on a tile", "the pressed mark on a tile" from `--tile-face`/`--tile-border`, for every control | the tile pairs renamed for the tiles the skin leaves (the panels' buttons); the pressed mark dropped there (every pressable control is skinned); `skinPairs()` added, from the built skin's tokens (`test/helpers/built-skin.ts`), each variant and state over white and black at the glass's alpha: label on face 4.5, edge (border's line or face) on the glass 3, ring inside the face 3 (not disabled), selected line on face 3 |
| 4 | same, "draws the HUD from the palette…" | `${at} .hud-tile`'s background, colour, border; `.hud-tile[aria-pressed]`'s inset `box-shadow`; `.room-walk`'s background and colour, room.css's | "…from the palette and the skin…": the panels' buttons' background, colour, border, room.css's; the pressed tile's underline (kept); `ui/button.css`'s rule for the tiles and the walking control: `color: var(--_label)`, `--_face`/`--_border` the secondary normal tokens, `background-color: transparent`; its `::before` `background-color: var(--_face)`; its pressed rule the selected face and a 2 px line |
| 5 | same, "lets each fallback outrank the HUD's rule it undoes" | the list held `.hud-tile`'s ButtonFace/ButtonText, `.hud-glass.room-walk:focus-visible`'s Highlight, `.room-walk:hover`'s ButtonFace, Highlight, and reduced transparency's opaque glass | those dropped (the skin's own forced-colours rule; no hover or ring of theirs left in room.css); the panels' buttons' ButtonFace/ButtonText added |
| 6 | `test/ui/hud-over-contrast.test.ts`, `pairs()` | tile pairs for every tile, "a tile's icon", "the pressed mark", and the walking control's face the glass at `--glass-alpha` ("text on the walking control", its ring) | the tile pairs for the tiles the skin leaves; the skinned controls' from the built skin's tokens over the over-room glass (label, icon, edge, ring, selected line), each a tile pair (FR-006) |
| 7 | same, "draws the focus ring inside its control over the room…" | room.css's `.hud-tile:focus-visible` and `.hud-tile[data-over="room"]:focus-visible` over the room at `outline-offset ≤ -4px` | the panels' buttons' ring at `≤ -4px` (kept); `ui/button.css`'s ring: `outline-width: 2px`, offset `calc(-2px - var(--_line-w) - var(--btn-chamfer) / 2)`, inside the face at the built skin's chamfer |
| 8 | `test/ui/dark-pages.test.ts` (Q108), the three "… with a stand-in for B's metal skin" cases | the stand-in `:root[data-skin="metal"] { --btn-frame: #2a3038; --btn-chamfer: 0.5rem; --btn-secondary-selected-glow: #46d7f0; }` appended last, `data-skin="metal"` | "… with B's built skin (metal)": the built skin's generated stylesheet at its place in the bundle (after `style.css`), `data-skin` the resolved ID |

Also in the RED: **`test/helpers/layers.ts`** (A's model; T-INT02a's change, brought here because the removal needs
it, plan §R-A3 "As built (int2-030)"), and **`test/ui/button-dead-declarations.test.ts`** (new, the probe, below).

**The old forms, seen failing (or not).**

- *The resume case* (row 1), copied untracked into `test/ui/scratch-old-hud-look.test.ts` with `data-skin="metal"` set
  (removed after): as written it **passes, vacuously**. It reads the panel before the view renders, and finds 0
  buttons. With a `flush()` first (3 buttons) its `winning()` reader still passes. That reader splits `:is()` at
  every comma and reads `background` alone, not B's `background-color`. Read by the whole-list cascade
  (`cascaded(el, ["background-color", "background"])`), it fails:

  ```
  × OLD, data-skin set, the view rendered, read by the whole-list cascade: its buttons the page's 36ms
  AssertionError: resume-close: expected 'transparent' to be '#ffffff' // Object.is equality
        Tests  1 failed | 2 passed | 14 skipped (17)
  exit=1
  ```

- *The colour pairs* (rows 3, 6) and *the stand-in* (row 8) read no root and no cascade, so `data-skin` can't make them
  fail. They are stand-ins replaced, not REDs. The stand-in's three tokens equal B's built `metal`'s. The old
  `dark-pages.test.ts` passes on the GREEN tree (below).
- *The cases that read the removed text* (rows 2, 4, 5, 7), and A's two layers files with the old model: the files at
  `fd26f860`, copied untracked into `test/**/scratch-old-*.test.ts` (and `test/helpers/scratch-old-layers.ts`), run on
  the GREEN tree `b35b407c`, then removed. Exit 1:

  ```
   FAIL  test/room/scratch-old-hud-contrast.test.ts > … > draws the HUD from the palette: the glass, the tiles, their borders, the focus ring, and the pressed mark
  AssertionError: html[data-hud="column"]: expected undefined to be 'var(--tile-face)' // Object.is equality
   FAIL  test/room/scratch-old-hud-contrast.test.ts > … > lets each fallback outrank the HUD's rule it undoes
  AssertionError: expected [ …(6) ] to deeply equal []
   FAIL  test/ui/scratch-old-hud-look.test.ts > … > gives the control its own glass hover, and every hover rule only where the pointer hovers
  AssertionError: column: expected undefined to be 'rgb(var(--glass) / var(--glass-alpha-…' // Object.is equality
   FAIL  test/ui/scratch-old-hud-over-contrast.test.ts > … > draws the focus ring inside its control over the room, or on a plate, never on the bare glass
  AssertionError: .hud-tile:focus-visible: expected false to be true // Object.is equality
   FAIL  test/ui/scratch-old-hud-halves-contrast.test.ts > both halves at AA over the room … (12 cases, each window and view)
  AssertionError: expected [ …(13) ] to deeply equal []
   Test Files  4 failed | 1 passed (5)
        Tests  16 failed | 63 passed (79)
  exit=1
  ```

  The passing file is the old `dark-pages.test.ts`.

**The new forms, seen passing.** Before the removal, on an export of the RED `3ff26628` (`git archive` into
`/tmp/int2030-red.YUT1`, the worktree's `node_modules` linked): the probe and the hover case fail (that is the RED);
every other rewritten case passes. Exit 1:

```
 ❯ test/ui/hud-look.test.ts (15 tests | 1 failed) 17598ms
     × gives the control the skin's hover, and every hover rule only where the pointer hovers 5ms
 ❯ test/ui/button-dead-declarations.test.ts (1 test | 1 failed) 293519ms
     × leaves none that matches a skinned control and wins nowhere, in any layout, media, or state 293518ms
AssertionError: expected [ …(117) ] to deeply equal [ …(13) ]
AssertionError: expected [ …(4) ] to deeply equal []
 ❯ test/ui/hud-look.test.ts:515:92
 Test Files  2 failed | 5 passed (7)
      Tests  2 failed | 102 passed (104)
exit=1
```

The seven files: the probe, `hud-look`, `hud-contrast`, `hud-over-contrast`, `dark-pages`, `hud-over-layers`, and
`hud-halves-contrast`. After the removal, every one passes (the GREEN's run below).

### Step 2: T-INT02's GREEN, the probe's list, and the removal

**The probe** is `test/ui/button-dead-declarations.test.ts`, not a mode of `button-skin.test.ts`, which is B's file and
stays unchanged. It reads the page as B's tests do (`bundleSheets`, `button-cascade.ts`'s cascade, `data-skin` the
resolved ID). It goes through 17 windows of the real room: split, column, dock, stacked; at rest, walking, the
conversation open, the resume open, the toggles pressed, and 2D. It reads each under 6 media (default, forced
colours, less transparency, more contrast, reduced motion, no hover) and 4 states. It lists each declaration of
`room.css` or `split.css` that is dead, meaning all of these hold:

- its property is one the component owns, or a shorthand of such longhands alone (`font` never counts, since it also
  sets the size);
- it matches skinned controls and no other element;
- its selector names a skinned control or the bar;
- it wins on no element.

The first runs, before the filter on owned shorthands and unskinned elements, gave 125. That list held `font` and
generic rules (`.hud-glass`, `.room button[aria-disabled]`, `.hud-glass a:focus-visible`), which B doesn't own. With
the filter and pressed windows: **117**. Each is below (`KEPT` = kept, `gone` = removed by `b35b407c`):

```
KEPT  room/hud/split.css | | html[data-split="on"][data-hud="column"] .hud-bar .hud-tile | min-height: calc(3.75rem * var(--wall-scale-right))
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .hud-bar .hud-tile | min-width: 0
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .hud-bar .hud-tile | white-space: normal
KEPT  room/hud/split.css | | html[data-split="on"][data-hud="column"] .room-list[data-over="room"] .split-back | background: rgb(var(--glass) / var(--over-plate-alpha))
KEPT  room/hud/split.css | | html[data-split="on"][data-hud="column"] .room-list[data-over="room"] .split-back | border-radius: 0.25rem
KEPT  room/hud/split.css | | html[data-split="on"][data-hud="column"] .room-list[data-over="room"] .split-back | box-shadow: 0 0 0 0.25rem rgb(var(--glass) / var(--over-plate-alpha))
KEPT  room/hud/split.css | | html[data-split="on"][data-hud="column"] .split-back | min-height: 2.75em
KEPT  room/hud/split.css | | html[data-split="on"][data-hud="column"] .split-hint | min-height: 2.75em
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk-log-toggle | background: none
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk-log-toggle | border: 0
KEPT  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk[data-over="room"] .split-hint | background: rgb(var(--glass) / var(--over-plate-alpha))
KEPT  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk[data-over="room"] .split-hint | border-radius: 0.25rem
KEPT  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk[data-over="room"] .split-hint | box-shadow: 0 0 0 0.25rem rgb(var(--glass) / var(--over-plate-alpha))
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk[data-over="room"] .split-hint | box-shadow: none
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk[data-over="room"] .split-hint:focus-visible | outline-offset: -4px
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk[data-over="room"] .talk-log-toggle | background: rgb(var(--glass) / var(--over-plate-alpha))
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk[data-over="room"] .talk-log-toggle | border-radius: 0.25rem
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk[data-over="room"] .talk-log-toggle | box-shadow: 0 0 0 0.25rem rgb(var(--glass) / var(--over-plate-alpha))
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk[data-over="room"] .talk-log-toggle | box-shadow: none
gone  room/hud/split.css | | html[data-split="on"][data-hud="column"] .talk[data-over="room"] .talk-log-toggle:focus-visible | outline-offset: -4px
gone  room/room.css | @media (forced-colors: active) | .hud-bar a | background: ButtonFace
gone  room/room.css | @media (forced-colors: active) | .hud-bar a | border-color: ButtonText
gone  room/room.css | @media (forced-colors: active) | .hud-bar a | color: ButtonText
gone  room/room.css | @media (forced-colors: active) | .hud-bar button | background: ButtonFace
gone  room/room.css | @media (forced-colors: active) | .hud-bar button | border-color: ButtonText
gone  room/room.css | @media (forced-colors: active) | .hud-bar button | color: ButtonText
gone  room/room.css | @media (forced-colors: active) | :root[data-hud] .hud-glass.room-eat:focus-visible | outline-color: Highlight
gone  room/room.css | @media (forced-colors: active) | :root[data-hud] .hud-glass.room-walk:focus-visible | outline-color: Highlight
gone  room/room.css | @media (forced-colors: active) | :root[data-hud] .hud-tile | background: ButtonFace
gone  room/room.css | @media (forced-colors: active) | :root[data-hud] .hud-tile | border-color: ButtonText
gone  room/room.css | @media (forced-colors: active) | :root[data-hud] .hud-tile | color: ButtonText
gone  room/room.css | @media (forced-colors: active) | :root[data-hud] .room-walk:hover | background: ButtonFace
gone  room/room.css | @media (forced-colors: active) | :root[data-hud] .room-walk:hover | border-color: Highlight
gone  room/room.css | @media (forced-colors: active) | :root[data-hud] .room-walk:hover | color: ButtonText
gone  room/room.css | @media (hover: hover) | html[data-hud="column"] .hud-bar a.hud-tile:hover | background: var(--tile-face-lit)
gone  room/room.css | @media (hover: hover) | html[data-hud="column"] .hud-bar a.hud-tile:hover | border-color: var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="column"] .hud-bar a.hud-tile:hover | box-shadow: inset 0 0 0 1px var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="column"] .hud-bar button:hover | background: var(--tile-face-lit)
gone  room/room.css | @media (hover: hover) | html[data-hud="column"] .hud-bar button:hover | border-color: var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="column"] .hud-bar button:hover | box-shadow: inset 0 0 0 1px var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="column"] .room-walk:hover | background: rgb(var(--glass) / var(--glass-alpha-lit))
gone  room/room.css | @media (hover: hover) | html[data-hud="column"] .room-walk:hover | border-color: var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="column"] .room-walk:hover | box-shadow: inset 0 0 0 1px var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="dock"] .hud-bar a.hud-tile:hover | background: var(--tile-face-lit)
gone  room/room.css | @media (hover: hover) | html[data-hud="dock"] .hud-bar a.hud-tile:hover | border-color: var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="dock"] .hud-bar a.hud-tile:hover | box-shadow: inset 0 0 0 1px var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="dock"] .hud-bar button:hover | background: var(--tile-face-lit)
gone  room/room.css | @media (hover: hover) | html[data-hud="dock"] .hud-bar button:hover | border-color: var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="dock"] .hud-bar button:hover | box-shadow: inset 0 0 0 1px var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="dock"] .room-walk:hover | background: rgb(var(--glass) / var(--glass-alpha-lit))
gone  room/room.css | @media (hover: hover) | html[data-hud="dock"] .room-walk:hover | border-color: var(--accent-neon)
gone  room/room.css | @media (hover: hover) | html[data-hud="dock"] .room-walk:hover | box-shadow: inset 0 0 0 1px var(--accent-neon)
gone  room/room.css | @media (prefers-reduced-motion: no-preference) | html[data-hud="column"] .hud-tile | transition: border-color 120ms ease-out, background-color 120ms ease-out, transform 120ms ease-out, opacity 120ms ease-out
gone  room/room.css | @media (prefers-reduced-motion: no-preference) | html[data-hud="dock"] .hud-tile | transition: border-color 120ms ease-out, background-color 120ms ease-out, transform 120ms ease-out, opacity 120ms ease-out
gone  room/room.css | @media (prefers-reduced-transparency: reduce) | :root[data-hud] .room-walk:hover | background: rgb(var(--glass))
gone  room/room.css | | .room-eat | background: #ffffff
gone  room/room.css | | .room-eat | border-radius: 4px
gone  room/room.css | | .room-eat | border: 2px solid #1a1a1a
gone  room/room.css | | .room-eat | color: #1a1a1a
gone  room/room.css | | .room-walk | background: #ffffff
gone  room/room.css | | .room-walk | border-radius: 4px
gone  room/room.css | | .room-walk | border: 2px solid #1a1a1a
gone  room/room.css | | .room-walk | color: #1a1a1a
gone  room/room.css | | html[data-hud="column"] .hud-glass.room-eat:focus-visible | outline-offset: 2px
gone  room/room.css | | html[data-hud="column"] .hud-glass.room-eat:focus-visible | outline: 2px solid var(--hud-focus)
gone  room/room.css | | html[data-hud="column"] .hud-glass.room-walk:focus-visible | outline-offset: 2px
gone  room/room.css | | html[data-hud="column"] .hud-glass.room-walk:focus-visible | outline: 2px solid var(--hud-focus)
gone  room/room.css | | html[data-hud="column"] .hud-tile | background: var(--tile-face)
gone  room/room.css | | html[data-hud="column"] .hud-tile | border-radius: 0.5rem
gone  room/room.css | | html[data-hud="column"] .hud-tile | border: 1px solid var(--tile-border)
gone  room/room.css | | html[data-hud="column"] .hud-tile | color: var(--hud-text)
KEPT  room/room.css | | html[data-hud="column"] .hud-tile | min-height: 2.75rem
KEPT  room/room.css | | html[data-hud="column"] .hud-tile | min-width: 2.75rem
gone  room/room.css | | html[data-hud="column"] .hud-tile | white-space: nowrap
gone  room/room.css | | html[data-hud="column"] .hud-tile:active | transform: translateY(1px)
gone  room/room.css | | html[data-hud="column"] .hud-tile[aria-disabled="true"] | color: var(--hud-text)
gone  room/room.css | | html[data-hud="column"] .hud-tile[aria-disabled="true"] | opacity: 0.75
gone  room/room.css | | html[data-hud="column"] .hud-tile[aria-pressed="true"] | background: var(--tile-face)
gone  room/room.css | | html[data-hud="column"] .hud-tile[aria-pressed="true"] | box-shadow: inset 0 0 0 2px var(--hud-text)
gone  room/room.css | | html[data-hud="column"] .hud-tile[aria-pressed="true"] | color: var(--hud-text)
gone  room/room.css | | html[data-hud="column"] .hud-tile[data-over="room"]:focus-visible | outline-offset: -4px
gone  room/room.css | | html[data-hud="column"] .room-eat | background: rgb(var(--glass) / var(--glass-alpha))
gone  room/room.css | | html[data-hud="column"] .room-eat | border: 1px solid var(--tile-border)
gone  room/room.css | | html[data-hud="column"] .room-eat | color: var(--hud-text)
gone  room/room.css | | html[data-hud="column"] .room-eat | white-space: normal
gone  room/room.css | | html[data-hud="column"] .room-walk | background: rgb(var(--glass) / var(--glass-alpha))
gone  room/room.css | | html[data-hud="column"] .room-walk | border: 1px solid var(--tile-border)
gone  room/room.css | | html[data-hud="column"] .room-walk | color: var(--hud-text)
gone  room/room.css | | html[data-hud="column"] .room-walk | white-space: normal
gone  room/room.css | | html[data-hud="column"] [data-over="room"] .hud-tile:focus-visible | outline-offset: -4px
gone  room/room.css | | html[data-hud="dock"] .hud-glass.room-eat:focus-visible | outline-offset: 2px
gone  room/room.css | | html[data-hud="dock"] .hud-glass.room-eat:focus-visible | outline: 2px solid var(--hud-focus)
gone  room/room.css | | html[data-hud="dock"] .hud-glass.room-walk:focus-visible | outline-offset: 2px
gone  room/room.css | | html[data-hud="dock"] .hud-glass.room-walk:focus-visible | outline: 2px solid var(--hud-focus)
gone  room/room.css | | html[data-hud="dock"] .hud-tile | background: var(--tile-face)
gone  room/room.css | | html[data-hud="dock"] .hud-tile | border-radius: 0.5rem
gone  room/room.css | | html[data-hud="dock"] .hud-tile | border: 1px solid var(--tile-border)
gone  room/room.css | | html[data-hud="dock"] .hud-tile | color: var(--hud-text)
KEPT  room/room.css | | html[data-hud="dock"] .hud-tile | min-height: 2.75rem
KEPT  room/room.css | | html[data-hud="dock"] .hud-tile | min-width: 2.75rem
gone  room/room.css | | html[data-hud="dock"] .hud-tile | white-space: nowrap
gone  room/room.css | | html[data-hud="dock"] .hud-tile:active | transform: translateY(1px)
gone  room/room.css | | html[data-hud="dock"] .hud-tile[aria-disabled="true"] | color: var(--hud-text)
gone  room/room.css | | html[data-hud="dock"] .hud-tile[aria-disabled="true"] | opacity: 0.75
gone  room/room.css | | html[data-hud="dock"] .hud-tile[aria-pressed="true"] | background: var(--tile-face)
gone  room/room.css | | html[data-hud="dock"] .hud-tile[aria-pressed="true"] | box-shadow: inset 0 0 0 2px var(--hud-text)
gone  room/room.css | | html[data-hud="dock"] .hud-tile[aria-pressed="true"] | color: var(--hud-text)
gone  room/room.css | | html[data-hud="dock"] .hud-tile[data-over="room"]:focus-visible | outline-offset: -4px
gone  room/room.css | | html[data-hud="dock"] .room-eat | background: rgb(var(--glass) / var(--glass-alpha))
gone  room/room.css | | html[data-hud="dock"] .room-eat | border: 1px solid var(--tile-border)
gone  room/room.css | | html[data-hud="dock"] .room-eat | color: var(--hud-text)
gone  room/room.css | | html[data-hud="dock"] .room-eat | white-space: normal
gone  room/room.css | | html[data-hud="dock"] .room-walk | background: rgb(var(--glass) / var(--glass-alpha))
gone  room/room.css | | html[data-hud="dock"] .room-walk | border: 1px solid var(--tile-border)
gone  room/room.css | | html[data-hud="dock"] .room-walk | color: var(--hud-text)
gone  room/room.css | | html[data-hud="dock"] .room-walk | white-space: normal
gone  room/room.css | | html[data-hud="dock"] [data-over="room"] .hud-tile:focus-visible | outline-offset: -4px
```

The run that printed it (on `7c871249`, before the removal):
`the probe: 347 declarations matched, 179 on a skinned control, 117 dead, 12 losing there but not B's alone`. The 12
"not B's alone" weren't judged. Each is a generic rule: `.hud-glass`'s forced colours,
`.room button[aria-disabled="true"]`, `.room button[aria-pressed="true"]` (three), `.hud-glass a:focus-visible`
(column, dock, forced), and the dock's `.hud-glass button:focus-visible` offset, which also reaches the list's buttons.

**How each was removed** (`b35b407c`; `git diff --numstat`: `room.css` 19 lines in, 75 out; `split.css` 7 in, 20
out; the lines in are comments and the shortened selector lists). Where a
declaration was dead for every selector of its rule, the declaration went. Where it was dead for some selectors of a
shared list, and every declaration of the rule was dead for those selectors, those selectors were dropped from the
list. Examples: the walking control and "Eat" from the focus ring's list, the bar's tiles from the hover list, the
forced-colours button list, and the transition list. So no winner changes. A short comment names the skin where a rule
lost its look.

**The 13 kept** (the probe's `KEPT`, each with its reason; a question on the page). An earlier test outside Q73's set
reads each one's text, and those tests pass unchanged:

- spec 005's `test/ui/hud.test.ts` (the tiles' `min-height`/`min-width: 2.75rem`, a regex on `room.css`);
- spec 028's `test/ui/hud-wall-dom.test.ts` (the split tiles' scaled `min-height`);
- spec 026's `test/ui/hud-split-dog.test.ts` ("Back"'s `min-height: 2.75em`, which `hud-model.ts` counts, though B's 44
  px wins);
- B's `test/ui/button-states.test.ts` and DS's `test/ui/button-image-skin.test.ts`. Their "no shadow on the control"
  cases need spec 029's plate on "Back" and "Close, Escape" in the cascade to discriminate ("the plate rule matched:
  expected 0 to be greater than 0" without it).

I found these by applying the full removal in the working tree, uncommitted, and running the 52 covering files
(`/tmp/int2030/removal-run.txt`: 24 failed). The failures were those five files' cases, plus every window case of
`hud-halves-contrast.test.ts` and five of `hud-over-layers.test.ts`'s with its plate-step case, whose model read no B
(step 3). The pinned declarations
were put back, and the RED took the model's change.

**After the GREEN, at `b35b407c`.** The covering files: A's 27 (`int.md`'s list above), B's and DS's seven, C's 14,
spec 029's `hud-over-*`, `hud-split-contrast.test.ts`, the probe, and every other file reading `room.css`, `split.css`,
the layers model, or B's helpers. That is 69 files (`/tmp/int2030/green-files.txt`). Exit 0:

```
 Test Files  69 passed (69)
      Tests  1141 passed (1141)
   Start at  11:10:57
   Duration  588.16s (tests 82%, import 18%)

exit=0
```

Step 1's new cases still pass in it, and the probe gives exactly the 13 kept:
`the probe: 243 declarations matched, 75 on a skinned control, 13 dead, 12 losing there but not B's alone` (its run
on the removal tree, `/tmp/int2030/probe5.txt`).

### Step 3: T-INT02a

**B's faces in A's cascade.** `test/helpers/layers.ts` (A's model, used by spec 029's `hud-over-layers.test.ts` and
A's `hud-halves-contrast.test.ts`) now has:

- the skin's generated stylesheet and `ui/button.css` before the three sheets;
- the page read as built (a root with no `data-skin` taken as the built skin's ID);
- a control's `::before` face as a layer under its words;
- a `calc()` reader for the skin's ring offset.

Its exported `RULES` stays the three sheets' (spec 029's file compares it with its own reading). The model's default
cascade is B's rules, then those. `hud-halves-contrast.test.ts` runs unchanged on it. It landed in T-INT02's RED
because the removal needs it (plan §R-A3, "As built (int2-030)").

- Before the removal, on the RED's export: it passes (the seven files' run above).
- After the removal, with the old model: 12 window cases fail (step 1's paste: `expected [ …(13) ] to deeply equal
  []`).
- After the removal, with the new model: it passes (the GREEN's 69 files).

**FR-005's rule: not needed.** No ratio fails with B's faces, so no alpha and no `ui-skins.yaml` token changed, and
there's nothing to record in §R-B1.

**Q100, test-first.**

- RED `05e8dfe2`, `test/room/hud-wall-geometry.test.ts`:
  - (1) "holds spec 028's numbers" (`:190`): old, `HUD_PLACEMENTS.wall` without `listFloor`; new, with
    `listFloor: { padRem: 0.5, backPx: 44 }`.
  - (2) The oracle's (b) (`:125-129`): old, no floor on the list; new, null where `list.h < 0.5 × rem + 44`, with a
    `listFloor` switch to find what it refuses. This moves "agrees with the oracle at every landscape window of the
    sweep" (`:200`), unchanged in its text.
  - (3) New, "refuses the split layout where the list can't hold its top padding and Back's 44 px…" (`:209-241`):
    - every split window's list is at least 52 px;
    - 1360 × 320 is refused;
    - each window the floor alone refuses is 320 to 384 px tall, in the column layout, holding its HUD;
    - 144 of them are at most 368 px tall, and 179 in all.

  On an export of `05e8dfe2` (`/tmp/int2030-q100.eiMO`), exit 1:

  ```
   ❯ test/room/hud-wall-geometry.test.ts (27 tests | 3 failed) 1327ms
       × holds spec 028's numbers 6ms
       × refuses the split layout where the list can't hold its top padding and Back's 44 px, so the column layout takes it 2ms
       × agrees with the oracle at every landscape window of the sweep 221ms
  AssertionError: expected { gapRem: 1, edgeRem: 1, …(7) } to deeply equal { gapRem: 1, edgeRem: 1, …(8) }
  AssertionError: 1360x320: expected 0 to be greater than or equal to 51.999999999
  ```

- GREEN `b821b2b9`, `compose/hud.ts`: `listFloor`, and the check after the list's box in `wallBoxes`. The four
  geometry files, exit 0:

  ```
   Test Files  4 passed (4)
        Tests  52 passed (52)
     Start at  12:50:01
  ```

  (`hud-wall-geometry`, `hud-split-geometry`, `halves`, `hud-halves`.)

**The valve.** Before Q100's RED commit, I ran the whole `apps/web` suite on the working tree with the GREEN applied,
uncommitted. That tree was T-INT02's GREEN, `hud.ts`'s floor, and the RED's file, its describe's quotes not yet
Prettier's. Exit 0:

```
 Test Files  286 passed (286)
      Tests  5011 passed | 6 skipped (5017)
   Start at  11:26:47
   Duration  1677.14s (tests 73%, import 26%)
```

**No earlier case moved.** The sweep counts of `geometry.test.ts`, `report.test.ts`, and `phone.test.ts`, and the Dog
ratchet (1,558), count stages and the five entries, not split windows. So nothing joins plan §R-A4's table but
`hud-wall-geometry.test.ts`'s own row (added). I measured 179 refused windows where the review counted 144: its 144
(320 to 368 px tall) cut "Back" itself, and the other 35 are 384 px tall, where the list held 44 px but not the
8 px of padding above "Back". The floor is 52 px at every scale, not 52 × `--wall-scale-right` as Q100's words had it.
Neither the rem padding nor B's px floor scales (plan §R-A2 "As built (int2-030)"; a question on the page).

### Step 4: the documents

- `tasks.md`:
  - T-INT01 and T-INT02b ticked at `fd26f860`, reviewed by `rv-int-030`.
  - R-2's tick cites `3996c6c4` (nit 2).
  - T-INT02's row notes that T-INT02b did `hud-look`'s column and dock cases (nit 3, Q107).
  - T-INT02 and T-INT02a noted as built, with their commits, not ticked.
- `plan.md`:
  - §R-B3 "As built (int2-030)": the probe, the 104 and the 13, the departures.
  - §R-A3 "As built (int2-030)": the model, and FR-005 not needed.
  - §R-A2 "As built (int2-030)": Q100's floor.
  - §R-A4's table: `hud-wall-geometry`'s Q100 row.

### The whole `apps/web` suite, once, on the last code commit

SUITE-PLACEHOLDER

### `make lint`

LINT-PLACEHOLDER

The first run, from the repository's root on `b821b2b9` itself (the last code commit, the tree clean), exit 0. Its
whole output:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
952 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit=0
```

`make test`, `make evals`, and `make check` weren't run: the brief gives the one `make check` to the handover
(T-INT04).

### What's done, and what isn't

Done:

- **T-INT02**: the RED (Q73, Q107, Q108, nit 1); the probe's list of 117; the removal of 104 in one commit; the 13 kept,
  named. Every covering file passes after it.
- **T-INT02a**: B's faces in A's cascade (no ratio failing, so no FR-005 change), and Q100's floor, test-first.
- The documents (nits 1 to 3), the whole suite, and `make lint`.

Not done, and not this task's:

- T-INT03 (`adr-030`) and T-INT04 (the handover's `make check` and note).
- The 13 kept declarations: a later task, if he wants it (question 1).
- **His**: the look (SC-008). The tiles, "Back", the hint, the title's toggle, the walking control, and "Eat" now draw
  only B's look. The old glass hover, focus ring, and pressed inset of the bar's tiles and the walking control are gone
  from `room.css` (they already lost to B).

### Questions (in `/night/io/out/questions.md`, each with a recommended answer)

1. Should a later task rewrite the four tests that pin the 13 kept declarations and remove them? Recommended: yes,
   after the stack's merge.
2. Should the probe (about 290 s of the suite) stay in the suite? Recommended: yes, as built.
3. Is Q100's unscaled 52 px floor right? Recommended: yes, as built.

### Departures and slips, named

- **The probe is a test file of its own**, not a run of B's `button-skin.test.ts` (B's file, unchanged), and it stays
  in the suite as the removal's guard. It covers more than B's windows: stacked, pressed, 2D, and the media.
- **T-INT02a's model change landed in T-INT02's RED**, ahead of the removal that needs it. `hud-halves-contrast.test.ts`
  itself is unchanged: the model reads every page as built.
- **The RED rewrote more than Q73's colour pairs**: the cases of the same files that read the removed text (rows 2, 4,
  5, 7). The brief's "pass unchanged" holds for the GREEN: no test changed in it.
- **13 dead declarations kept**, rather than rewriting tests outside Q73's set and B's own files.
- **The RED is three commits** (`5ffdfb66` and `7c871249` save points, then `3ff26628`), all before the removal.
- **Q100's floor refuses 179 windows**, the review's 144 and 35 more at 384 px; the floor is unscaled.
- **Q100's RED commit message went to `git commit -F -` from a here-document**, not from a file written with the Write
  tool, as the brief asks for a long message. No tracked file was written that way; the other long messages
  came from `/tmp/int2030/msg-*.txt`.
- **Scratch, outside the repository or untracked**:
  - `/tmp/int2030/` (logs, the JSON reports, the probe's outputs, a read-only Python grouping script, the messages);
  - `/tmp/int2030-red.YUT1` and `/tmp/int2030-q100.eiMO` (`git archive` exports; `node_modules` linked);
  - untracked `scratch-old-*` test copies in `apps/web/test/`, removed with `rm` before each commit
    (`git status --short` clean after).

  The exports stay for this session. No `rm -rf` was used.
- **No refusal** from a hook, the bash gate, or the permission layer. One harness block: a foreground `sleep` (I
  waited on the background task's own notice instead). No human-only path was written. No request to the runner. No
  push, merge, PR, container, release, plan, or AWS call. No new endpoint or model call, so no cost, span, panel, or
  data-flow entry.

