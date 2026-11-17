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

**Moved** by `int-030`, word for word (checked by `cmp`), under the round's record: [studio-round-1.md](studio-round-1.md),
"The band's crossings (T-DS01 (b), rework 2, Q74)", as T-DS05's row and the backlog below ask.

## The labels over the band (T-DS05; Q74; R-3's row; for the integration to move under the record)

**Moved** by `int-030`, word for word (checked by `cmp`), under the round's record:
[studio-round-1.md](studio-round-1.md), "The labels over the band (T-DS05; Q74, Q102; R-3's row)", with its two tables
and this note's reading, right after the crossings' list, which its "(above)" now names.

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
- **`rv-rework-030ds`'s nit 1** (added by `int-030`, as the page's sixty-ninth wake has it): "`button-shipped-css.test.ts`
  minifies two files only, so a `border-image: none` added elsewhere would ship empty and pass". Not fixed.

# Rework: rework-030ds

Night 5 (2026-11-17). Implementer `rework-030ds`, branch `night/rework-030ds/rework-030ds`, from `impl-030ds`'s tip
`21b2c4e19a72e2a7e738097b4085a500a981249e`. I wrote none of spec 030, B, DS, the round or their reviews. The review is
`rv-030ds`'s (changes requested, one blocking finding), as the supervisor's brief quotes it; the design is
`rework3-spec-030`'s `01999312` (`plan.md` §R-D4, `tasks.md` T-DS01 to T-DS05), read and never edited. His rule 1
takes each recommended answer (Q101: yes). Paths are under `apps/web/` unless they start otherwise.

## Commits

| Commit | What |
|---|---|
| `2dad7eee` | save point, start |
| `57a2ece1` | save point, F-1 RED |
| `50f8cfd3` | RED, F-1: `test/ui/button-shipped-css.test.ts` (new) |
| `870a4a0b` | save point, F-1 GREEN |
| `9f7ebe0d` | GREEN, F-1: `src/ui/button-image.css`, `src/ui/button.css`; no test file |
| `712c53b8` | save point, F-2 RED |
| `fc6e4fc0` | RED, F-2: `test/ui/button-room-helper.test.ts` (new) |
| `d082c3b8` | save point, F-2 GREEN |
| `d337109b` | GREEN, F-2: `test/helpers/button-room.ts` (a helper; it declares no test); no `*.test.ts` |
| `21f2a708` | save point, the nits |
| `e44132bc` | N-2, test only: `test/ui-skins.test.ts`'s swap case |
| `fcc5c873` | N-3, comment only: `build/ui-skins-image.ts` |
| `d4f715d3` | save point, the checks |
| `8cc8da2b` | save point, these notes |
| this one | these notes |

## F-1, the border image turned off as it ships

Seen first, from the repository's root, with the lockfile's lightningcss 1.33.0 (Vite 8.3.3's `minifyCSS` calls its
`transform` with `minify: true`; `node_modules/vite/dist/node/chunks/node.js:30711`):

```
$ node -e '…transform({ code: "a{border-image:none}@media (forced-colors: active){b{border-image:none}}c{border-image-source:none}", minify: true })…'
a{border-image:}@media (forced-colors:active){b{border-image:}}c{border-image-source:none}
```

`minify: false` writes `border-image: ;` too, so it is the printer, not the minifier's merging.

**RED** (`50f8cfd3`), `test/ui/button-shipped-css.test.ts`: one case minifying `src/ui/button.css` and
`src/ui/button-image.css` as Vite does (lightningcss's `transform`, `minify: true`; the build's `targets` aren't
passed, which the bug doesn't depend on), reading the shipped rules: no empty `border-image:` in either file, and
exactly `border-image-source:none` as the `border-image` declarations of B's base rule on the control, B's
forced-colours rule on the control, and DS's forced-colours rule on the halves (`expect.soft`, so each place fails on
its own). On the tip:

```
$ npx --no-install vitest run test/ui/button-shipped-css.test.ts
     × ships no empty `border-image:` and the longhand `border-image-source:none` where a rule turns the image off 10ms
AssertionError: src/ui/button.css as shipped: expected [ 'border-image:;', 'border-image:}' ] to deeply equal []
AssertionError: src/ui/button-image.css as shipped: expected [ 'border-image:}' ] to deeply equal []
AssertionError: button.css's base rule on the control: expected [ 'border-image:' ] to deeply equal [ 'border-image-source:none' ]
AssertionError: button.css's forced-colours rule on the control: expected [ 'border-image:' ] to deeply equal [ 'border-image-source:none' ]
AssertionError: button-image.css's forced-colours rule on the halves: expected 'border-image:' to be 'border-image-source:none' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed (1)
```

**GREEN** (`9f7ebe0d`): `border-image-source: none` in place of `border-image: none` in the three rules, each with a
comment naming why; in `button.css` the comment names it a departure from B's file. With no source no image is drawn,
whatever the other longhands are, and no rule on the control sets them. B's cascade reads (`button-cascade.ts` maps
`border-image-source` to the shorthand and the longhand alike) are unchanged:

```
$ npx --no-install vitest run test/ui/button-shipped-css.test.ts test/ui-skins.test.ts test/ui-skin-image.test.ts \
    test/ui/button-skin.test.ts test/ui/button-states.test.ts test/ui/button-image-skin.test.ts
 Test Files  6 passed (6)
      Tests  118 passed (118)
   Duration  87.94s (tests 94%, import 4%, transform 2%)
```

## F-2, B's helpers after his intake (Q101)

**RED** (`fc6e4fc0`), `test/ui/button-room-helper.test.ts`: the files present without touching the checkout: eleven
stand-in PNGs (RGBA, 192 × 96, the frame 256 × 256, by zlib) written into a temporary root (removed after),
`build/ui-skins-image.ts`'s `REPO_ROOT` mocked to it (`vi.mock`, a getter over the real module), and `node:fs`'s
`readFileSync` serving `content/ui-skins.yaml` with the stand-ins' SHA-256s in place of the record's (every other read
passes through). Four cases: the build's own default path resolves the repository's skin to the image skin
(`metal-image`, `image`: the files are present, a precondition); `bundleSheets()`'s skin sheet is `metal`'s stylesheet
exactly (`skinCss(resolveSkin(readSkins(skinText("metal"))))`) with no `data-skin-kind="image"`; `selectionScreen()`
and `room(the split layout)` are `metal`, by `id` and by the root's `data-skin`; `bundleSheets("plain")` still builds
`plain`. On the tip:

```
$ npx --no-install vitest run test/ui/button-room-helper.test.ts
     × gives the bundle `metal`'s stylesheet in the skin's place 81ms
     × marks the selection screen and the room `metal` 17414ms
AssertionError: expected '/* Generated at build by build/ui-ski…' to be '/* Generated at build by build/ui-ski…' // Object.is equality
AssertionError: expected 'metal-image' to be 'metal' // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
   Duration  87.75s (tests 95%, transform 3%, import 3%)
```

(the first diff: `ui-skins: metal-image (image)`, `:root[data-skin="metal-image"]`, the image's labels, and the
eleven files' `-image`, `-slice`, `-bw` where `metal`'s sheet is expected.)

**GREEN** (`d337109b`), `test/helpers/button-room.ts`, old and new (no assertion of B's changed or loosened):

- Old: `bundleSheets(id)` built `skinCss(resolveSkin(readSkins(skinText(id))))` and `dress` set
  `resolveSkin(readSkins(skinText(id))).id`: the repository's `active` (`metal-image`) where `id` is absent, its files
  read from the checkout's root (`REPO_ROOT`), so with the files in `assets/ui/buttons/` the image skin.
- New: both go through `cssSkin(id)`, `resolveSkin(readSkins(skinText(id ?? "metal")), { read: NO_FILES })`, where
  `NO_FILES` throws `ENOENT` for any path: `metal` where `id` is absent, a named CSS skin as before, a named image skin
  its CSS fallback whole; the checkout's files are never read. `skinText()` itself is unchanged (B's cases still read
  the repository's `active`, `metal-image`, from it). The header's comment says so.

A first GREEN try (not committed) was the no-files reader alone, `skinText(id)`: the room cases passed, and the bundle
case failed on the generated sheet's first line only (`metal-image: falling back to metal (files absent: …)` where
`metal`'s own build says `ui-skins: metal (css)`). The RED pins `metal`'s own stylesheet, the brief's "build `metal`
themselves", so the helper names `metal` (the brief's second route) and keeps the reader for a named image skin.

```
$ npx --no-install vitest run test/ui/button-room-helper.test.ts test/ui/button-shipped-css.test.ts test/ui-skins.test.ts \
    test/ui-skin-image.test.ts test/ui/button-skin.test.ts test/ui/button-states.test.ts test/ui/button-image-skin.test.ts
 Test Files  7 passed (7)
      Tests  122 passed (122)
   Duration  106.49s (tests 95%, import 4%, transform 2%)
```

## The nits

- **N-2** (`e44132bc`, test only): `test/ui-skins.test.ts`'s swap case. Old: the line matching
  `^metal-image: falling back to metal \((hash pending|files absent: .+)\)$`. New: exactly
  `metal-image: falling back to metal (files absent: assets/ui/buttons/btn-primary-normal.png)` (its plugin root is the
  test's temporary folder, which never holds `assets/ui/`, so this holds after his intake too). It passes on the tip, a
  tightening, not a RED: `Tests 37 passed (37)`.
- **N-3** (`fcc5c873`, comment only): `REPO_ROOT`'s comment, "three folders above this file's folder,
  apps/web/build/ (`../../../`)".
- **N-1** (`uiSkins` doesn't watch the PNGs, so `vite dev` keeps the fallback until restarted): backlog, below.

## Departures (for the integration's "As built"; `plan.md` left alone)

12. **`border-image-source: none`, not `border-image: none`** (plan §R-D4: "`border-image: none`" under forced colours;
    B's `button.css`, plan §R-B3: the control "no border-image"): the longhand in DS's halves rule and in B's two rules
    on the control, because Vite's minifier ships the shorthand empty. A departure in B's file, named there. The brief
    counted "B's three `border-image: none` … (base rule, the image skin's off-route, forced colours)"; `button.css`
    holds two (`:74`, the base rule, which is also what keeps the control image-free under the image skin, and `:425`,
    forced colours), and `button-image.css`'s halves rule is the third in the shipped CSS. All three are fixed.
13. **B's helpers build `metal` by name with a reader that finds no file** (plan §9's B row and §R-B5: B's test files
    are B's; Q101, recommended yes, taken): `test/helpers/button-room.ts`, old and new above. B's cases test the CSS
    skin before and after his intake; DS's keep the image side (they already put the fixture skin's sheet in its place).
14. **Two new test files, neither B's**: `test/ui/button-shipped-css.test.ts` (F-1) and
    `test/ui/button-room-helper.test.ts` (F-2, its own file because its `vi.mock`s of `node:fs` and
    `build/ui-skins-image` are file-wide). The first imports `lightningcss` directly: it is in the root lockfile (Vite's
    minifier, `1.33.0`) but not in `apps/web/package.json`'s devDependencies; `make lint` (eslint, `tsc`) passes. If
    the integration wants it declared, that is a lockfile change for the integration.

## Checks after GREEN

**A `/tmp` export of my tip with the files** (`d4f715d3`'s tree; `git archive HEAD` into `/tmp/rw030ds-export.FoBp`,
`node_modules` symlinked from the worktree). Eleven stand-ins made by a stdin script (`python3 -I -B -`, `struct` and
`zlib`), each an RGBA PNG of one colour, 192 × 96, the frame 256 × 256, written into the export's
`assets/ui/buttons/`, and the export's `apps/web/content/ui-skins.yaml` given their SHA-256s:

```
assets/ui/buttons/btn-primary-normal.png 270 bytes 2318c326a2a2
assets/ui/buttons/btn-primary-hover.png 269 bytes 3893fffdccc2
assets/ui/buttons/btn-primary-pressed.png 270 bytes ceedc4c7c3e7
assets/ui/buttons/btn-primary-disabled.png 270 bytes dba2df431c9a
assets/ui/buttons/btn-primary-selected.png 270 bytes 244c7aa39133
assets/ui/buttons/btn-secondary-normal.png 269 bytes 3c7637e642dc
assets/ui/buttons/btn-secondary-hover.png 269 bytes 05156b4c5911
assets/ui/buttons/btn-secondary-pressed.png 269 bytes bcfb4c5265bd
assets/ui/buttons/btn-secondary-disabled.png 269 bytes dd2dbaa1798a
assets/ui/buttons/btn-secondary-selected.png 270 bytes ceb7888f7c4d
assets/ui/buttons/panel-frame.png 667 bytes 18d6486996b0
stand-ins: 11
```

From the export's root:

```
$ npm run build -w apps/web
…
ui-skins: metal-image (image)
…
build exit 0
$ grep -o '<html[^>]*>' apps/web/dist/index.html
<html lang="en" data-skin="metal-image" data-skin-kind="image">
$ grep -o 'border-image[-a-z]*:[^;}]\{0,20\}[;}]' apps/web/dist/assets/*.css | sort | uniq -c
      2 apps/web/dist/assets/index-X-4rp_tO.css:border-image-outset:0;
      2 apps/web/dist/assets/index-X-4rp_tO.css:border-image-repeat:stretch}
      1 apps/web/dist/assets/index-X-4rp_tO.css:border-image-slice:var(--_slice) fill;
      1 apps/web/dist/assets/index-X-4rp_tO.css:border-image-source:none;
      2 apps/web/dist/assets/index-X-4rp_tO.css:border-image-source:none}
      1 apps/web/dist/assets/index-X-4rp_tO.css:border-image-source:var(--_img);
      1 apps/web/dist/assets/index-X-4rp_tO.css:border-image-width:var(--_bw);
      1 apps/web/dist/assets/index-X-4rp_tO.css:border-image-width:var(--half-frame-bw);
```

No empty `border-image:`. The `{0,20}` window can't hold the halves' `var(--half-frame-image)` and
`var(--half-frame-slice)` (23 characters); with `{0,40}` they are there, once each
(`border-image-source:var(--half-frame-image);`, `border-image-slice:var(--half-frame-slice);`), and
`grep -c 'border-image:[;}]'` is 0 in both CSS files. The forced-colours blocks' `border-image` declarations, read out
of the built CSS by a stdin script:

```
FORCED: :root[data-skin][data-skin-kind=image] [data-half] => ['border-image-source:none']
FORCED:  .resume-close),:root[data-skin] :is(.choice .choice-enter,.ui-button) => ['border-image-source:none']
```

The five B and DS files and my two, on the export with the files:

```
$ cd apps/web && npx --no-install vitest run test/ui-skins.test.ts test/ui-skin-image.test.ts test/ui/button-skin.test.ts \
    test/ui/button-states.test.ts test/ui/button-image-skin.test.ts test/ui/button-shipped-css.test.ts test/ui/button-room-helper.test.ts
 Test Files  7 passed (7)
      Tests  122 passed (122)
   Duration  108.98s (tests 95%, import 4%, transform 2%)
```

And F-2 cross-checked there: the export's helper swapped for the base's (`git show 21b2c4e1:…/button-room.ts`), then
put back (`diff` against `HEAD`'s: none):

```
$ npx --no-install vitest run test/ui/button-skin.test.ts
     × gives each control the component, its variant, 44 × 44, and wrapping, in the split layout (1366 × 768) 21411ms
     × gives each control the component, its variant, 44 × 44, and wrapping, in the split layout, walking 84ms
     × gives each control the component, its variant, 44 × 44, and wrapping, in the column layout (1280 × 720) 36ms
     × gives each control the component, its variant, 44 × 44, and wrapping, in the dock (390 × 844) 33ms
AssertionError: expected 'metal-image' to be 'metal' // Object.is equality
      Tests  4 failed | 12 passed (16)
```

the reviewer's four, which pass with the new helper (above).

**My tip as committed, without the files** (no `assets/ui/` in the worktree), from `apps/web/`:

```
$ npx --no-install vitest run test/ui-skins.test.ts test/ui-skin-image.test.ts test/ui/button-skin.test.ts \
    test/ui/button-states.test.ts test/ui/button-image-skin.test.ts test/ui/button-shipped-css.test.ts test/ui/button-room-helper.test.ts
 Test Files  7 passed (7)
      Tests  122 passed (122)
   Duration  108.59s (tests 94%, import 4%, transform 2%)
$ npm run build -w apps/web          # from the repository's root
metal-image: falling back to metal (files absent: assets/ui/buttons/btn-primary-normal.png)
build exit 0
$ grep -o '<html[^>]*>' apps/web/dist/index.html
<html lang="en" data-skin="metal" data-skin-kind="css">
$ grep -o 'border-image[-a-z]*:[^;}]\{0,40\}[;}]' apps/web/dist/assets/*.css | sed 's|.*/||' | sort | uniq -c
      1 index-BboFKGG1.css:border-image-source:none;
      1 index-BboFKGG1.css:border-image-source:none}
```

**`make lint`** (the tree at `d4f715d3`, the code as it ends here; these notes change no linted file):

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
917 files already formatted
… | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit … (the repository's shell scripts)
make lint exit 0
```

**`git merge-tree --write-tree`** of my tip (`d4f715d3`) with each, a scratch `GIT_OBJECT_DIRECTORY` in `/tmp`:

| Tip | Merge base | Result |
|---|---|---|
| A `9026b4ba` | `7cdc31d2` | clean |
| C `cb1a537b` | `7cdc31d2` | clean |
| DSB `b1320584` | `7cdc31d2` | CONFLICT (content) in `specs/030-ui-skin/plan.md` |
| DJ `46b726ba` | `7cdc31d2` | clean |
| rework 3 `01999312` | `7cdc31d2` | CONFLICT (content) in `specs/030-ui-skin/plan.md` |
| F `ab6e64e6` | `b6b4d847` | clean |

Both conflicts are B's, inherited: the base `21b2c4e1` gives the same two, and nothing on this branch touches
`plan.md` (B's `4f75061e`, `5bcd0633`, `d145a484` edit it).

## Interruptions

- The bash gate refused `rm -rf /tmp/rw030ds-export.FoBp /tmp/rw030ds-objs` ("recursive delete outside workspace").
  Not respelled or rerouted; on the page (`/night/io/out/questions.md`, with a recommended answer): 417 MB of the
  export and 396 KB of objects stay in `/tmp`.

## Done, and not done

Done: F-1 (RED `50f8cfd3`, GREEN `9f7ebe0d`), F-2 (RED `fc6e4fc0`, GREEN `d337109b`), N-2 (`e44132bc`), N-3
(`fcc5c873`); the export's checks with stand-ins and the tip's without; `make lint`; the merge-trees. The first
backlog item above, "B's helpers after his intake", is F-2, done.

Not done, and not mine:

- **F-3 (Q102)**: the integration's.
- **N-1**, backlog: `uiSkins` doesn't add the image skin's PNGs to Vite's watch list, so `vite dev` keeps the
  fallback after the files arrive until it is restarted (the build is unaffected).
- `make test`, `make evals`, `make check` and the whole `apps/web` suite: the integration's one `make check` (rule
  4). Run here: the seven files above, both ways, `make lint`, and the site's build both ways.
- No `docs/merge-requests/` note: the supervisor's order ends this branch on these notes, as `impl-030ds`'s did; the
  integration writes the note.
- No `plan.md` or `tasks.md` edit (departures 12 to 14 above, for the integration's "As built"); no human-only path
  written; nothing under `assets/**` in the worktree; no `/srv/studio/` read or write; no container, release, plan
  against the account, or AWS call. No new endpoint or model call: no cost, span, panel or data-flow entry.
