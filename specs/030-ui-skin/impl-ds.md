# Spec 030, group DS, the image skin: `impl-030ds`'s notes

Night 5 (2026-11-17). Implementer `impl-030ds`, branch `night/impl-030ds/impl-030ds`, from `rework-030b`'s tip
`447080237464f0706e657d78e3f293490851bea8` (group B, reviewed and approved). I wrote none of spec 030, its group B,
the round, or their reviews. The documents are `rework3-spec-030`'s tip `01999312`, read there and never edited:
`plan.md` §R-D3, §R-D4 and §9's DS row (with its "As built, the DS row"), `tasks.md` T-DS01 to T-DS05, `spec.md`
FR-024 to FR-027 and SC-007. The round's record is `judge-ui-r1`'s `3996c6c4`, `studio-round-1.md` from line 80.

My share, as the supervisor's queue splits the DS row: T-DS01 (a) and (b); T-DS02's `build/ui-skins-image.ts`,
`build/ui-skins.ts`'s image case and `src/ui/button-image.css`; T-DS03, T-DS04, T-DS05. DSB's part (T-DS01 (c);
`web_image.py`, `release.py`, `apps/web/Dockerfile`) is `impl-030dsb-r5`'s `b1320584`; none of those files is touched
here. Paths are under `apps/web/` unless they start otherwise.

## Commits

| Commit | What |
|---|---|
| `3ac4e582` | save point, RED |
| `2eb450d7` | RED, T-DS01 (a) and (b): `test/ui-skin-image.test.ts`, `test/ui/button-image-skin.test.ts` (new); B's two image-skin cases in `test/ui-skins.test.ts` rewritten (departure 1) |
| `0d828c34` | save point, GREEN |
| `6a67a97b` | RED corrections found while writing T-DS02, tests only (below) |
| `31a0e69d` | GREEN, T-DS02: `build/ui-skins-image.ts` (new), `build/ui-skins.ts`'s image case, `src/ui/button-image.css` (new); no test file |
| `2bf0ccfc` | save point, T-DS03 |
| `e624c110` | RED for T-DS03: the repository's `metal-image` case; B's two `active: metal` pins rewritten (departure 1) |
| `16334462` | T-DS03, data: `content/ui-skins.yaml`'s `metal-image` (hashes `pending`) and `active: metal-image` |
| `d2d8c7cc` | save point, T-DS05 |
| `9dbab255` | RED for T-DS05: the record's hashes, none pending; the "files absent" line |
| `865f12a7` | T-DS05, data: the record's eleven SHA-256s into `metal-image` |
| `a2fd1170` | save point, T-DS04 |
| `64938cf9` | save point, these notes |
| this one | these notes |

## What I built

**`build/ui-skins-image.ts`** (new): `resolveImageSkin(files, read)` over the image skin's files in order, each with
the prefix of its custom properties (`--btn-<variant>-<state>`, `--half-frame`): a `pending` hash stops it ("hash
pending"); `read` (from the repository's root, `REPO_ROOT`, this file's `../../../`, so `/src` in the image) failing
with `ENOENT` is "files absent: <path>", any other failure "unreadable: <path>"; over 48,000 bytes "over 48000 bytes:
<path>"; another SHA-256 "hash differs: <path>"; the eleven over 96,000 "over 96000 bytes in all". Passing, each file
gives `-image` (`url("data:image/png\3b base64,…")`, departure 3), `-slice` (`t r b l`), and `-bw` (each inset ÷ 2,
in px).

**`build/ui-skins.ts`'s image case**: the schema's image skin is `kind`, `fallback`, `labels` (each variant's colour)
and `files` (`primary` and `secondary`, each of the five states, and `panel`; each `{ file, sha256, slice }`): a PNG
under `assets/ui/` (lower-case letters, digits, hyphens; no `..`), 64 lower-case hex digits or `pending`, four whole
insets above 0. An unknown key and the fallback are checked first, so a skin without a CSS fallback is refused for
that (B's two refusals unchanged); then a missing `labels` ("is missing (the label colours of the round's
slices.json)"). `resolveSkin(skins, { root, read })`: the image skin when its files pass (its own ID, `kind: "image"`,
the fallback's tokens with `labels.<variant>` on every state of the variant, the files' properties in the same root
rule, `src/ui/button-image.css`'s text after it, the line `ui-skins: <id> (image)`); else the fallback whole and
`<id>: falling back to <fallback> (<reason>)`. `uiSkins({ source, root? })`; `vite.config.ts` is unchanged (the default
root is the repository's).

**`src/ui/button-image.css`** (new), every rule under `:root[data-skin][data-skin-kind="image"]`: B's state selectors
mirrored in B's order (normal, hover in `@media (hover: hover)`, pressed, selected with the walking control's, disabled;
each secondary then primary), setting `--_img`, `--_slice`, `--_bw` from the state's custom properties, and
`--btn-dash-inset: var(--_bw)` (the dashes on the image's face, inside its frame). On the `::before`:
`border-style: solid; border-width: 0`, `border-image-source: var(--_img)`, `-slice: var(--_slice) fill`,
`-width: var(--_bw)`, `-outset: 0`, `-repeat: stretch`; `padding: var(--_bw)`, `background-color: var(--_face)`,
`background-clip: content-box`; `background-image: none` and `box-shadow: none` (departure 5). On `[data-half]`: the
frame (`--half-frame-*`), no `fill`, `outset` 0, stretch; `border-image: none` under forced colours. No rule sets
anything on a control: B's rules keep it transparent, with no border-image, no shadow, no clip-path, no filter, and
its border and padding the fallback's.

**`content/ui-skins.yaml`**: T-DS03 `metal-image` (`kind: image`, `fallback: metal`, `labels` `#14171c` and
`#e6fbff`, the eleven files under `assets/ui/buttons/`, `pending`, insets 24 and the frame 48) and `active: metal-image`
(Q15); T-DS05 the record's eleven SHA-256s. The insets and labels the entry already held are `slices.json`'s.

**The tests.** T-DS01 (a), `test/ui-skin-image.test.ts` (26 cases at the tip): fixture PNGs written by zlib into the
test's own temporary root (removed after each case), a fixture YAML of the repository's skins plus a `fixture-image`;
files absent → `metal`, the line, the root `metal`/`css`, no image rule served; one hash wrong, a file over 48,000
bytes, the eleven over 96,000 each under 48,000, a `pending` hash → `metal` and the reason naming the file; a fallback
keeps metal's labels; with the files the URIs, slices, widths (one fixture uneven, `[24, 20, 16, 12]` →
`12px 10px 8px 6px`), the frame's, the fallback's faces, borders, chamfer, glow and ring with the fixture's labels on
every state, the root `fixture-image`/`image`, `button-image.css`'s text in the served stylesheet; the schema's ten
refusals; and the repository's `metal-image` (T-DS03, T-DS05). T-DS01 (b), `test/ui/button-image-skin.test.ts` (23
cases): through the real room and selection screen (B's `button-room.ts`), the fixture skin's stylesheet in the skin's
place, read by B's cascade under each skin by switching the root's marks: each control's `::before` in each state in
the split layout, the column layout, the dock, both "Close" buttons and "Enter"; the control itself under `metal` and
the image skin in every layout and state, and "Back", "Close, Escape" and the resume's "Close" with their panel marked
`data-over="room"` (split.css's plate rule asserted in the cascade, and losing); the halves; labels; forced colours;
the disabled `::after`; the band's crossings; the content boxes at 1366 × 768, 1440 × 900, 1920 × 1080, at rest and
walking; nothing before Enter.

## Departures, each with the clause it departs from (for the integration's `plan.md`)

1. **B's four "until T-DS" cases, rewritten on this branch, test-first** (plan §9's B row and §R-B5: B's test files
   are B's alone; tasks T-DS02: "the one sequential share" is `build/ui-skins.ts`'s image case). T-DS02 and T-DS03 as
   the plan words them break them; I rewrote each in a RED commit and saw it fail there (`2eb450d7`, `e624c110`), and
   ask on the page whether he keeps them (questions.md):
   - `test/ui-skins.test.ts`, "resolves an image skin to its CSS fallback…" (`:167` at the base). Old: an image skin
     `files: {}`, the line `pic: falling back to one (image skins not built)`. New: `PIC`, an image skin of T-DS's
     schema (labels, the eleven files, every hash `pending`), the line `pic: falling back to one (hash pending)`.
   - `test/ui-skins.test.ts`, "writes the fallback's ID and kind for an image skin falling back" (`:197`). Old: the
     `files: {}` skin. New: `PIC`; the assertion (`data-skin="one" data-skin-kind="css"`) unchanged.
   - `test/ui-skins.test.ts`, the swap (SC-004, `:367`). Old: `active` `metal`, the copy's one difference
     `active: metal` → `plain`, the line `ui-skins: metal (css)`, the plugin at the repository's root. New: `active`
     `metal-image`, the difference `active: metal-image` → `plain`, the line matching
     `^metal-image: falling back to metal \((hash pending|files absent: .+)\)$`, the page `data-skin="metal"`; the
     plugin's root the test's temporary folder (no `assets/ui/`), so the case holds before his intake and after.
   - `test/ui/button-skin.test.ts`, "ships `metal` as the active skin" (`:199`). Old: `active` `metal`. New: `active`
     `metal-image`, its fallback `metal`, and `resolveSkin` with no files gives `metal`.
   - and `test/ui-skins.test.ts`'s header (its lines 6-7), which said "until T-DS".
2. **How `button-image.css` reaches the page** (plan §R-D4 names its rules "under `:root[data-skin-kind="image"]`" and
   no import; `src/main.ts` is B's, §9): the plugin serves its text inside `virtual:ui-skin.css`, after the root rule,
   only when the image skin resolves; a fallback ships none of it (checked: no `data-skin-kind="image"` in
   `dist/assets/*.css`). Its rules also name the root's mark, so they hold either way. `main.ts` unchanged.
3. **The URI's `;` as the CSS escape `\3b `** (plan §R-D4: `url("data:image/png;base64,…")`): the same URL to a
   browser (CSS Syntax 3's string escapes), written so `test/helpers/room.ts`'s `parseCss` (no group's file, which B's
   cascade reads) doesn't cut the declaration at `;base64`. The CSP's `img-src 'self' data:` (`nginx.conf:49`) admits
   it.
4. **`resolveImageSkin(files, read)`** (plan §R-D4: `resolveImageSkin(entry, read)`): it takes the flat list of files
   with their prefixes, so it imports nothing from `ui-skins.ts` at run time (no import cycle); `resolveSkin` builds
   the list, sets the labels, and returns the stylesheet's parts. The reasons' words (plan: "hash pending", "files
   absent"): `hash pending`, `files absent: <path>`, `unreadable: <path>`, `over 48000 bytes: <path>`,
   `hash differs: <path>`, `over 96000 bytes in all`.
5. **B's gradients off on the image's `::before`** (plan §R-D4: "B's inset shadows (bevel, highlight, the selected
   glow) `none`"): `background-image: none` too, since B's chamfer lines and highlight are background gradients that
   would paint over the face inside the centre.
6. **The halves in T-DS01 (b)** (tasks T-DS01 (b): "each half's own element", "no control's box leaves its half (A's
   `hud-halves.test.ts` run beside)"): A's halves aren't on B's tip, so the case marks `.room-list` `data-half="top"`
   (as A's `layout.ts` does in the split layout) and places a stand-in `div.hud-half[data-half="bottom"]`; the frame,
   its slice without `fill`, and the border and padding under both skins are checked there. A's real halves and the
   run beside `hud-halves.test.ts` are the integration's (`int-030`).
7. **The content boxes' model** (tasks: "its row less them holds the icon and two lines (`compose/hud.ts`'s
   numbers)"): a tile's row (`3.75rem` × `--wall-scale-right`) less its border and padding holds
   `(1.25 + 0.125)rem × scale + 2 × 1.2 × its font size`, all of `hud.ts`'s row model at the column's scale; the
   walking control and "Eat" (one line each) are held to the same border and padding under both skins only.
8. **The measurement over the band in this note, not `studio-round-1.md`** (tasks T-DS05: "paste both in
   studio-round-1.md under the record"): the record isn't on my base and the hunk would conflict at the merge (the
   page's Q86); **the integration moves the section below under the record**.
9. **T-DS03 and T-DS05 each have their own RED test commit** before their data commit (tasks: "one data commit"): the
   data commits hold no test, and each test was seen failing first.
10. **Forced colours on the halves**: `border-image: none` on `[data-half]` (plan §R-D4 names forced colours for the
    control alone).
11. The schema refuses an unquoted all-digit hash (YAML's core schema reads it as an integer); it doesn't check an
    inset against the image's size (that needs decoding; the judge checks it).

**RED corrections** (`6a67a97b`, tests only, before GREEN): "one hash wrong" used 64 zeros, which YAML reads as the
integer 0, so the schema refused it before the case reached its fallback (now 64 `f`); both files' expected URIs take
the escape (departure 3); the crossing case prints one line per control and its sides, with its states, and adds the
list against the frame's band.

**A RED case that couldn't fail before the code**, named so no one reads it as seen failing: "refuses a label that
isn't a colour" (B's schema refused the `labels` key itself, and the message matched `/labels/`).

## Runs

**T-DS01, RED** (`2eb450d7`, from `apps/web/`):

```
$ npx --no-install vitest run test/ui-skin-image.test.ts test/ui-skins.test.ts test/ui/button-image-skin.test.ts
 ❯ test/ui-skins.test.ts (37 tests | 2 failed) 66ms
 ❯ test/ui-skin-image.test.ts (21 tests | 19 failed) 163ms
 ❯ test/ui/button-image-skin.test.ts (23 tests | 23 failed) 18990ms
 Test Files  3 failed (3)
      Tests  44 failed | 37 passed (81)
   Duration  78.60s (tests 85%, transform 8%, import 7%)
```

The reasons (each failure's first line, counted): 24 × `Error: apps/web/content/ui-skins.yaml:
skins.fixture-image.labels: isn't a key the schema knows`, 2 × the same for `skins.pic.labels` (B's two rewritten
cases), and the schema refusals' `expected [Function] to throw error matching /file/` (`/panel/`, `/sha256/`, `/slice/`,
`/sparkle/`) and `expected [Function] to throw an error` (no labels). After the `pressed` fixture's correction (its
regex had matched metal's own `pressed` line), T-DS01 (a) alone, verbose: `Tests 20 failed | 1 passed (21)`, the one
passing "refuses a label that isn't a colour" (above).

**T-DS02, GREEN** (`31a0e69d`):

```
$ npx --no-install vitest run test/ui-skin-image.test.ts test/ui/button-image-skin.test.ts test/ui-skins.test.ts
 Test Files  3 passed (3)
      Tests  81 passed (81)
   Duration  93.72s (tests 88%, transform 6%, import 6%)
```

Before it: `npx --no-install prettier --check` on the three code files, `eslint --max-warnings 0 apps/web/build` and the
three test files, `tsc --noEmit -p apps/web`: clean, exit 0.

**T-DS03.** Its RED (`e624c110`), the three files it touches:

```
$ npx --no-install vitest run test/ui-skin-image.test.ts test/ui-skins.test.ts test/ui/button-skin.test.ts
     × builds metal from the repository's file and plain from a copy whose one difference is `active: plain` 8ms
     × is the active skin, an image skin falling back to metal 3ms
     × names the eleven files under assets/ui/buttons/ with the brief's insets, 24 a button and 48 the frame 0ms
     × carries the brief's labels, which metal's normal labels equal (plan §R-D4) 0ms
     × builds metal without its files, with the line naming why 8ms
     × ships `metal-image` as the active skin, `metal` its fallback, which a build without its files draws (Q15; T-DS) 7ms
 Test Files  3 failed (3)
      Tests  6 failed | 72 passed (78)
      3 AssertionError: expected 'metal' to be 'metal-image' // Object.is equality
      1 AssertionError: expected [ 'ui-skins: metal (css)' ] to deeply equal [ StringMatching{…} ]
      2 Error: no image skin
```

The data commit (`16334462`), from the repository's root:

```
$ npm run build -w apps/web
…
metal-image: falling back to metal (hash pending)
…
build exit 0
$ grep -o '<html[^>]*>' apps/web/dist/index.html
<html lang="en" data-skin="metal" data-skin-kind="css">
$ npx --no-install vitest run test/ui-skin-image.test.ts test/ui-skins.test.ts test/ui/button-skin.test.ts
 Test Files  3 passed (3)
      Tests  78 passed (78)
```

**T-DS05.** Its RED (`9dbab255`): `Tests 2 failed | 24 passed (26)` (`assets/ui/buttons/btn-primary-normal.png:
expected 'pending' to match /^[0-9a-f]{64}$/`; the line still "hash pending"). The data commit (`865f12a7`): the
YAML's eleven hashes against the handoff's bytes, read only:

```
$ diff <(grep -o 'sha256: [0-9a-f]\{64\}' content/ui-skins.yaml | cut -d' ' -f2 | sort) \
       <(sha256sum /srv/studio/handoff/ui-buttons/1/{btn-*,panel-frame}.png | cut -d' ' -f1 | sort) && echo "yaml hashes == handoff bytes (11)"
yaml hashes == handoff bytes (11)
$ sha256sum /srv/studio/handoff/ui-buttons/1/slices.json
a7dcbaf09b29f43d5502330a4858e01166256deaa638d09198a91831856af872  /srv/studio/handoff/ui-buttons/1/slices.json
```

(the record's `slices.json` SHA-256). Resolved in memory with `read` taking each file straight from the handoff
(nothing copied or written), and with the tree's own root:

```
ui-skins: metal-image (image) | id metal-image | kind image | image properties 33 | stylesheet bytes 71890
metal-image: falling back to metal (files absent: assets/ui/buttons/btn-primary-normal.png) | id metal | kind css
```

The build, from the repository's root:

```
$ npm run build -w apps/web
…
metal-image: falling back to metal (files absent: assets/ui/buttons/btn-primary-normal.png)
…
build exit 0
$ grep -o '<html[^>]*>' apps/web/dist/index.html
<html lang="en" data-skin="metal" data-skin-kind="css">
$ npx --no-install vitest run test/ui-skin-image.test.ts test/ui-skins.test.ts
 Test Files  2 passed (2)
      Tests  63 passed (63)
```

**T-DS04** (`a2fd1170`'s tree, the code and data at `865f12a7`):

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
916 files already formatted
… | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit … (the repository's shell scripts)
make lint exit 0

$ cd apps/web && npx --no-install vitest run test/ui-skins.test.ts test/ui/button-skin.test.ts \
    test/ui/button-states.test.ts test/ui-skin-image.test.ts test/ui/button-image-skin.test.ts
 Test Files  5 passed (5)
      Tests  117 passed (117)
   Duration  85.45s (tests 95%, import 3%, transform 2%)
```

## The band's crossings (T-DS01 (b), rework 2, Q74)

Printed by "names each control whose content box crosses its state's band" (run with `--silent=false`): each control
whose border and padding on a side, by the cascade, are less than its state's `--btn-…-bw` there. The fixture's insets
are the record's (24 image px a button, 12 CSS px; the frame 48, 24 CSS px), so these are the record's crossings. Every
control crosses, in every state:

```
BAND the split layout (1366 × 768): the bar's tiles: top, right, bottom, left (every state)
BAND the split layout (1366 × 768): the walking control: top, right, bottom, left (every state)
BAND the split layout (1366 × 768): "Eat": top, right, bottom, left (every state)
BAND the split layout (1366 × 768): "Back": top, right, bottom, left (every state)
BAND the split layout (1366 × 768): the larger view's toggle: top, bottom (every state)
BAND the split layout (1366 × 768): the log's toggle: top, bottom (every state)
BAND the split layout (1366 × 768): "Send": top, bottom (every state)
BAND the split layout (1366 × 768): the list (the top half, the panel frame): top, right, bottom, left (its own)
BAND the split layout, walking: the bar's tiles: top, right, bottom, left (every state)
BAND the split layout, walking: the walking control: top, right, bottom, left (every state)
BAND the split layout, walking: "Eat": top, right, bottom, left (every state)
BAND the split layout, walking: "Back": top, right, bottom, left (every state)
BAND the split layout, walking: the larger view's toggle: top, bottom (every state)
BAND the split layout, walking: the log's toggle: top, bottom (every state)
BAND the split layout, walking: "Send": top, bottom (every state)
BAND the split layout, walking: the list (the top half, the panel frame): top, right, bottom, left (its own)
BAND the column layout (1280 × 720): the bar's tiles: top, right, bottom, left (every state)
BAND the column layout (1280 × 720): the walking control: top, right, bottom, left (every state)
BAND the column layout (1280 × 720): "Eat": top, right, bottom, left (every state)
BAND the column layout (1280 × 720): the larger view's toggle: top, bottom (every state)
BAND the column layout (1280 × 720): the log's toggle: top, bottom (every state)
BAND the column layout (1280 × 720): "Send": top, bottom (every state)
BAND the dock (390 × 844): the bar's tiles: top, right, bottom, left (every state)
BAND the dock (390 × 844): the walking control: top, right, bottom, left (every state)
BAND the dock (390 × 844): "Eat": top, right, bottom, left (every state)
BAND the dock (390 × 844): the larger view's toggle: top, bottom (every state)
BAND the dock (390 × 844): the log's toggle: top, bottom (every state)
BAND the dock (390 × 844): "Send": top, bottom (every state)
BAND the split layout (1366 × 768): "Close, Escape" (the conversation): top, bottom (every state)
BAND the split layout (1366 × 768): "Close" (the resume panel): top, bottom (every state)
BAND the selection screen: "Enter": top, bottom (every state)
```

## The labels over the band (T-DS05; Q74; R-3's row; for the integration to move under the record)

`judge-ui-r1` didn't measure them. Measured here from `/srv/studio/handoff/ui-buttons/1/`, read only, by
`python3 -I -B -` on stdin (`struct` and `zlib`: each PNG's IHDR checked 8-bit RGBA non-interlaced, its IDAT inflated
and unfiltered; nothing written), as R-3's row words it: each variant's `labels` colour against each of its five files'
band pixels (outside the insets, 24 px; the frame's 48) of alpha ≥ 0.5 (≥ 128/255), each composited over white and
over black, the least ratio per file (WCAG's luminance, sRGB's 0.04045 threshold, as B's `ui-skins.test.ts`); and
`#ffffff` (`--hud-text`) against `panel-frame.png`'s band the same way. Beside them, the centre's least the same way
(inside the insets): `btn-primary-disabled.png`'s 5.69:1 is the judge's lowest label ratio (`judge-r1.md`), which
cross-checks the decoding.

| File | Size | Label | Band, least (alpha ≥ 0.5 px) | Band at depth ≥ 6 px, least | Centre, least | SHA-256 (12) |
|---|---|---|---|---|---|---|
| btn-primary-normal.png | 192x96 | #14171c | 1.00:1 (6658 px) UNDER 4.5 | 1.00:1 (6658 px) | 10.53:1 (6912 px) | 17b6faa32027 |
| btn-primary-hover.png | 192x96 | #14171c | 1.00:1 (6658 px) UNDER 4.5 | 1.00:1 (6658 px) | 14.64:1 (6912 px) | ce93cdc64bf4 |
| btn-primary-pressed.png | 192x96 | #14171c | 1.00:1 (6658 px) UNDER 4.5 | 1.00:1 (6658 px) | 6.06:1 (6912 px) | 0e831b953301 |
| btn-primary-disabled.png | 192x96 | #14171c | 1.01:1 (6658 px) UNDER 4.5 | 1.01:1 (6658 px) | 5.69:1 (6912 px) | fe4da5713f32 |
| btn-primary-selected.png | 192x96 | #14171c | 1.03:1 (7140 px) UNDER 4.5 | 1.03:1 (7140 px) | 13.19:1 (6912 px) | 5062c8adb92a |
| btn-secondary-normal.png | 192x96 | #e6fbff | 1.21:1 (6658 px) UNDER 4.5 | 1.21:1 (6658 px) | 12.24:1 (6912 px) | 1d98c57c0782 |
| btn-secondary-hover.png | 192x96 | #e6fbff | 1.00:1 (6658 px) UNDER 4.5 | 1.00:1 (6658 px) | 6.46:1 (6912 px) | 30c1e35db047 |
| btn-secondary-pressed.png | 192x96 | #e6fbff | 1.81:1 (6658 px) UNDER 4.5 | 1.81:1 (6658 px) | 18.39:1 (6912 px) | 1b5af9a30d13 |
| btn-secondary-disabled.png | 192x96 | #e6fbff | 2.25:1 (6658 px) UNDER 4.5 | 2.25:1 (6658 px) | 9.38:1 (6912 px) | 30fd1dcfd3fe |
| btn-secondary-selected.png | 192x96 | #e6fbff | 1.08:1 (7140 px) UNDER 4.5 | 1.08:1 (7140 px) | 8.72:1 (6912 px) | 08e54a06ef44 |
| panel-frame.png | 256x256 | #ffffff | 1.93:1 (12150 px) UNDER 4.5 | 1.93:1 (12150 px) | - | dbf6bd7caf6b |

The least is one pixel's; how much of each band falls under 4.5:1, and the least of the band's inner quarter (depth
≥ 18 px of 24, ≥ 36 of 48: nearest the centre, where a label crossing the band lies first). "Depths" are the
distances from the image's edge holding pixels of alpha ≥ 0.5 (the outer 7 or 8 px are the transparent ring, so a
6 px depth limit changes nothing above):

| File | Label | Band px (alpha ≥ 0.5) under 4.5:1 | Inner band, least | Depths with alpha ≥ 0.5 |
|---|---|---|---|---|
| btn-primary-normal.png | #14171c | 58% | 1.31:1 | 8-23 |
| btn-primary-hover.png | #14171c | 58% | 1.30:1 | 8-23 |
| btn-primary-pressed.png | #14171c | 64% | 1.31:1 | 8-23 |
| btn-primary-disabled.png | #14171c | 85% | 1.20:1 | 8-23 |
| btn-primary-selected.png | #14171c | 54% | 1.31:1 | 7-23 |
| btn-secondary-normal.png | #e6fbff | 23% | 1.25:1 | 8-23 |
| btn-secondary-hover.png | #e6fbff | 28% | 1.03:1 | 8-23 |
| btn-secondary-pressed.png | #e6fbff | 16% | 2.43:1 | 8-23 |
| btn-secondary-disabled.png | #e6fbff | 1% | 5.65:1 | 8-23 |
| btn-secondary-selected.png | #e6fbff | 33% | 1.11:1 | 7-23 |
| panel-frame.png | #ffffff | 11% | - (no pixel of alpha ≥ 0.5 at depth ≥ 36) | 8-22 (the centre's highest alpha 76) |

**My reading, beside the numbers, not in their place:** every file's band holds pixels under 4.5:1 against its label,
most of the primary's band (54% to 85%), a quarter or so of the secondary's but its disabled state, and a tenth of the
frame's; and every control's content box crosses its band (above). So a label that reaches the band can lie on pixels
under 4.5:1 there. Under plan §R-D4 that is a ratio under 4.5:1 for his look (SC-008) and round 2's brief, never a
`line.py` finding and not a reason to `--record` again; it is on the page (questions.md, Q: "Round 1's labels over the
band"). Nothing ships it before his intake: the build falls back to `metal`.

## Not run, and not mine

- `make check`, `make test`, `make evals`, and the whole `apps/web` suite: the integration's one `make check`
  (T-INT04), the supervisor's rule 4. Run here: `make lint`, the five B and DS test files, and the site's build
  (vitest's global setup builds it too, in every run above).
- A's `test/ui/hud-halves.test.ts` beside T-DS01 (b) ("no control's box leaves its half"): A's file isn't on B's tip;
  the integration's (`int-030`), after A's merge.
- The web image's build and stage (Q46, Q48): not run; `REPO_ROOT` is `build/ui-skins-image.ts`'s `../../../`, which is
  `/src` in the image, where DSB's `ui-assets` context lands, not checked in an image.
- No release, no plan against the account, no AWS call, no container. No human-only path written; nothing under
  `assets/**`; `/srv/studio/handoff/` read only, nothing copied from it; no `/srv/studio/briefs/` write. DSB's files
  untouched. No `plan.md` or `tasks.md` edit (the integration takes them from `01999312`, with the departures above).

## Cost, telemetry, data flow

No new endpoint and no model call: no cost, span or dashboard panel. No byte leaves the visitor's device for it: the
images are `data:` URIs in the page's own stylesheet (no data-flow disclosure entry). After his intake the page's CSS
grows by the inlined images, the stylesheet about 72 KB (71,890 bytes measured above), inside the plan's 96,000 bytes of
PNG.

## Backlog

- **B's helpers after his intake** (questions.md): `test/helpers/button-room.ts` builds the repository's `active`
  skin with the checkout's files; once `assets/ui/buttons/` holds the round's files, `metal-image` resolves to the
  image, `data-skin` becomes `metal-image`, and B's cases expecting `metal` (its `s.id`, the labels `#ffffff` on
  secondary hover and selected) fail. Recommended: the helpers build `metal` explicitly before his intake.
- **The labels over the band**: his look; round 2's brief if he asks (questions.md).
- **The integration**: move the two sections above under the record in `studio-round-1.md`; take departures 1 to 11
  into `plan.md` (§R-D4, §9's DS row) and `tasks.md` (T-DS01 to T-DS05); run A's `hud-halves.test.ts` beside
  `button-image-skin.test.ts`.
- **His intake** (`docs/merge-requests/human-patches/030.md` on `judge-ui-r1`'s branch): the data already holds the
  record's hashes and insets, so his intake changes no data; with DSB's `ui-assets` context merged, the image sees the
  files.
