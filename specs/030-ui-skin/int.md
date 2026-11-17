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
 Test Files  7 passed (7)
      Tests  122 passed (122)
   Start at  09:16:40
   Duration  113.34s (tests 95%, import 4%, transform 2%)

exit=0
```
