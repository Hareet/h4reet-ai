# docfix2-028: two document findings, in spec.md only

Task `docfix2-028` (spec-writer, Opus, documents only), night 2026-11-15. Base: the 028 line's tip `c17dd602` (`night/merge-028-2/merge-028-2`). Branch: `night/docfix2-028/docfix2-028`. The findings are on the committed page, `git show 8aeb3d09:docs/night-shift/2026-11-15.md` (Stacks: impl-028b's row for B3-N1, impl-028a's row for A2-2).

Only `spec.md` changed. Not touched: `plan.md`, `tasks.md`, `analysis.md`, `impl-a.md`, `impl-b.md` (the groups' branches write them), any code or test, any human-only path. Neither `plan.md` nor `tasks.md` changed, so their line "Approved provisionally by the Author's order of 2026-11-15" stands as it was.

The Author's rule these answers are taken under, word for word from the brief (spec.md, Clarifications, quotes it too): "**Approval, given ahead.** The spec-writer takes the recommended answer at clarify and at the plan, as for nights 1 and 2, and records at the top of `plan.md` and `tasks.md`: "Approved provisionally by the Author's order of 2026-11-15", with his words above. Each question still goes on the morning page with its recommended answer; an answer he overturns is reworked before he merges."

## B3-N1 (rv-028b-3, impl-028b's row): FR-027

The page's finding, verbatim: "B3-N1 (FR-027 says "in the 2D room when the room first shows" and `readFacts`, against US5 AS2's "When the hand-off ends" and the build's `factsIn`; plan §R-B7's "As built (T-B08)" records the build; a documents fix for T-INT)".

What the build does (read at `refs/heads/night/impl-028b/impl-028b`, tip `ebb4a7a4`; T-B08 is `260a3f9e` RED, `16559c3c` GREEN, `0ac62d1c` docs):

- `apps/web/build/room/emit.ts:1207`: the room's index gets `dog_visitor_intro: dogVisitorIntro(c.reader.tree)`. `:1215-1229`: `dogVisitorIntro` walks the tree's `corpus/facts/*.yaml`, parses each with `factsIn` (imported from `../content` at `:111`), and returns the slot `hobbies.dog_visitor_intro`'s `value` only where `slot.public_safe === true && typeof slot.value === "string"`; otherwise null.
- `apps/web/src/room/compose/bundle.ts:213-215`: the field is `RoomIndex.dog_visitor_intro: string | null` ("The 3D and the 2D room show it once a dog visit, at the hand-off's end").
- `apps/web/src/room/app.ts:1235-1245`: `introduceDogVisitor()` says the line once (`introduced`), only for `visit.avatar === "dog"` and a non-null line: `announcer.say(line)` in both rooms, and `Stage3D.say(line)` in 3D only. `offerResume()` (`:1247`) calls it (`:1252`), the hand-off's end in both rooms.
- Plan §R-B7's "As built (T-B08)" on that branch, its words: "Read by `build/room/emit.ts` from the tree's `corpus/facts/*.yaml` with `build/content.ts`'s `factsIn`"; "**When**: at the hand-off's end (`app.ts`'s `offerResume`) in both rooms, since the 2D room runs its hand-off too".

Old (at `c17dd602`):

> - **FR-027**: IN a dog visit, WHERE the bundle carries `dog_visitor_intro` (the slot `hobbies.dog_visitor_intro`'s value, his words, read by the room's build through `build/content.ts`'s `readFacts`, and only where its `public_safe` is `true`, as `fillSlots` reads a slot), THE TWIN SHALL show it once a visit: in 3D when the hand-off ends, in the speech bubble of FR-020 over the twin's figure and in the polite live region; in the 2D room when the room first shows, in the polite live region (Q15). It SHALL NOT enter …

New:

> - **FR-027**: IN a dog visit, WHERE the room's index carries `dog_visitor_intro` (`RoomIndex.dog_visitor_intro`: the slot `hobbies.dog_visitor_intro`'s value, his words, read by the room's build, `build/room/emit.ts`, from the tree's `corpus/facts/*.yaml` with `build/content.ts`'s `factsIn`, and only where that value is a string and the slot's `public_safe` is `true`), THE TWIN SHALL show it once a visit, when the hand-off ends (US5 AS2), in the 3D and the 2D room alike, since the 2D room runs its hand-off too: in 3D in the speech bubble of FR-020 over the twin's figure and in the polite live region; in the 2D room in the polite live region (Q15). It SHALL NOT enter …

The rest of FR-027 is unchanged. My reading, beside the words: besides the two points the finding names, I changed "the bundle" to "the room's index" (the build puts the line in the index, not in the 3D and 2D parts), and dropped "as `fillSlots` reads a slot", since the build reads the raw `value` and doesn't apply the slot's `phrasing` as `fillSlots` does. That gap is rv-028b-3's nit B3-N3 ("`dogVisitorIntro` returns the raw `value` and ignores the slot's `phrasing`"), which stays on impl-028b's row. The spec now says what the build does and doesn't settle B3-N3. US5 AS2 already said "When the hand-off ends" and is unchanged.

## A2-2 (rv-028a-2, impl-028a's row; the page's Q34, its recommended answer taken): FR-009 (b) and the Amendments table

The page's finding, verbatim: "A2-2 (Important, documents) goes to `docfix2-028`, not to you:** spec.md FR-009 (b) lacks Q34's width bound, and the Amendments table names neither spec 014 FR-061's clause nor spec 005 FR-054's "only grow" (the reference desktop's stage goes from 1472 × 1120.5 to 1248 × 1172.5); don't edit `spec.md`."

The page's Q34, its recommended answer verbatim: "yes: the split layout is taken only where its frame area is at least 686.4 px wide, spec 004's widest stage (the reference desktop's before spec 005), so no split stage is under its screen's old stage; 1366 × 768 and wider take it, 1280 × 720 keeps the column layout". That is a recommendation taken under rule 1, not the Author's answer. If he overturns it, this is reworked.

Checked against `refs/heads/night/impl-028a/impl-028a`'s `089d137c`:

- `apps/web/src/room/compose/hud.ts:156`: `minAreaWidthPx: 686.4` in `HUD_PLACEMENTS.wall`, its comment "the wall area at least spec 004's widest stage, the reference desktop's before spec 005 (686.4 × 640 CSS pixels)".
- `:668`: `if (area.w < T.minimum.w || area.h < T.minimum.h || area.w < t.minAreaWidthPx) return null;` under `// (b)`. It bounds the area's width only, so the new words say "wide".
- `apps/web/src/room/compose/stages.ts:92-96`: the reference desktop's stage is its clear area, "1472 × 1120.5 (≈ 686 × 640 before spec 005)".
- `plan.md:66` (the table): "1280 × 720 | column (T-A05: the area, 608 px wide, is under 686.4 px)".
- `plan.md:96`, "As built (T-A05, impl-028a)": "RG7's faces readable at the reference desktop's split stage, 1248 × 1172.5" and "FR-009 (b) gains `HUD_PLACEMENTS.wall.minAreaWidthPx: 686.4`: the split layout is taken only where its area is at least that wide, so 1366 × 768 and wider take it and 1280 × 720 keeps the column layout".
- `apps/web/test/room/stages-floor.test.ts:50` ("holds every screen of spec 004's sweep to its old stage at its frame area, in width and in height; outside the split layout, to its clear area (spec 028)") and `:84-102` ("the floor at the split layout's stages"): spec 005's floor itself still holds every screen, the split's included. Only the clear-area clause is lifted in the split layout.

### FR-009

Old:

> (b) with FR-006's frame area, the stage is at least spec 005's floor (304 × 196) and the wall box is at least `wall.minHeightRem` (14rem) tall; … The rule is computed from the table and the wall box, not a width bound; the plan's table gives the windows on each side.

New:

> (b) with FR-006's frame area, the stage is at least spec 005's floor (304 × 196) and its area at least `wall.minAreaWidthPx` wide (686.4 px, spec 004's widest stage; the page's Q34), and the wall box is at least `wall.minHeightRem` (14rem) tall; … The rule is computed from the table and the wall box, not a bound on the window's width (under (b)'s area bound, 1366 × 768 and wider take the split and 1280 × 720, its area 608 px wide, keeps the column layout; the page's Q34); the plan's table gives the windows on each side.

My reading, beside the words: the supervisor's wording was "and its area at least `wall.minAreaWidthPx` (686.4 px, spec 004's widest stage; the page's Q34)". I added "wide" because the code bounds only the width. I also changed the closing sentence's "not a width bound": next to a new width bound, it would have read as a contradiction. It now names the bound as one on the area, with Q34's two windows.

### The Amendments to Earlier Specs table: two new rows

New row after spec 005's Q1 row:

> | 005, FR-054 ("THE REFERENCE STAGES SHALL keep their screens … and their stages SHALL become those screens' clear areas"; "Only the stages they run at change, and those only grow.") | In the split layout the stage is the wall area, not the clear area, held to spec 004's stage (its area at least 686.4 px wide, FR-009 (b); the page's Q34), and RG5 to RG7 run at it, their rules and floors as written: the reference desktop's stage, 1472 × 1120.5, becomes 1248 × 1172.5, narrower, so the reference stages no longer only grow. The clause's first words, "NO CHECK SHALL weaken", and its floor stand: every screen of the sweep keeps a stage at least its stage before spec 005, the split's included (`test/room/stages-floor.test.ts`). | The page's Q34, its recommended answer taken by his rule 1 ("Approval, given ahead"; Clarifications): "the split layout is taken only where its frame area is at least 686.4 px wide, spec 004's widest stage (the reference desktop's before spec 005), so no split stage is under its screen's old stage"; FR-009, FR-010 |

New row after spec 014's cover-cap row:

> | 014, FR-061 ("spec 005's FR-054 floor SHALL hold (every frame area holds the clear area, which holds its stage before spec 005)"); SC-001 ("the frame area holds the clear area") | In the split layout the stage is the wall area, which doesn't hold spec 005's clear area; it is held to spec 004's stage instead (its area at least 686.4 px wide, FR-009 (b); the page's Q34), so no split stage is under its screen's stage before spec 005, and RG5 to RG7 run at it (the reference desktop's stage, 1472 × 1120.5, becomes 1248 × 1172.5). Outside the split layout both stand as written. | The page's Q34, as in spec 005's FR-054 row above; FR-009, FR-010 |

Each clause is quoted in its spec's words (`specs/005-full-window-room/spec.md:335`; `specs/014-room-after-the-demo/spec.md:349`, `:383`). These are departures from earlier specs' controls, not the constitution's, so no Assumptions deviation and no ADR. My reading: "only grow" is broken in width only (1472 → 1248), while the height grows (1120.5 → 1172.5). Spec 005's own floor, "NO CHECK SHALL weaken", for every screen against its stage before spec 005, is kept.

## Runs (at this branch, after the edits)

CPU: `/sys/fs/cgroup/cpu.max` is `400000 100000`, so 4 CPUs, / 4 = `--maxWorkers=1`.

`npm ci --ignore-scripts` (root, workspaces): exit 0 (only npm's notice of a new major version printed).

`make lint`: exit 0. Tail:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
858 files already formatted
… shellcheck -- (the repository's .sh files)
exit 0
```

The tests that read spec 028's documents: `grep -rl 028-room-after-review apps/web/test` finds **no file** at this base (`count: 0`). The group tests that read the spec are on `impl-028a` and `impl-028b` and haven't reached the line yet. My first try passed the empty list to vitest, which started the whole suite: `cd apps/web && ../../node_modules/.bin/vitest run --maxWorkers=1` (vitest is hoisted to the root's `node_modules/.bin`). I stopped it with no result. It hit the 600 s foreground limit, moved to the background, and I stopped it once I saw the list was empty. It is not a run of these documents, and no result is claimed.

The tests that do read the spec documents at this base, as merge-028-2 ran them: `python3 -m pytest -q evals/test_repository_docs.py evals/test_docs_links.py`:

```
.............................................................            [100%]
61 passed in 0.98s
exit 0
```

## Refusals

None: no hook, bash gate, or deny rule refused a command this task.

## Questions

None new. The page's Q34 is impl-028a's, already on the page. Its recommended answer is taken here, and an answer he overturns reworks FR-009 (b) and the two rows.

## What's left

- `rv-docfix2-028` (reviewer, another worker, read-only) on this branch's tip; then `merge-028-3` into the line.
- For T-INT, not for this task: the line's `plan.md` §R-B7 at `c17dd602` still says `readFacts(root)` and "(2D) or the room shows". impl-028b's branch fixes that in its "As built (T-B08)" and reaches the line with that branch's merge. B3-N3 (`phrasing` ignored) stays on impl-028b's row.
- The supervisor's vitest instruction finds no file until the groups' tests reach the line. A merge task after that should run it again.
