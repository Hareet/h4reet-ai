# docfix3-028: the line note's document findings from rv-docfix-028 and rv-docfix2-028

Task `docfix3-028` (spec-writer, Opus 5.5, documents only), night 2026-11-15. Base: the 028 line's tip `5437a191` (`night/merge-028-3/merge-028-3`). Branch: `night/docfix3-028/docfix3-028`. The findings are quoted in the line's note, `docs/merge-requests/2026-11-15-night-028-line.md`, sections "Review (rv-docfix-028)" and "Review (rv-docfix2-028)", copied there word for word from the night page.

No code, no test, and no human-only path changed. Not touched, as the supervisor's brief says: `plan.md`, `tasks.md`, `analysis.md`, `impl-a.md`, `impl-b.md` (written on the groups' branches), rv-docfix-028's Nit 2, Nit 3's `tasks.md` part, and rv-docfix2-028's I-1 (Q36), which needs a measurement first. `plan.md` and `tasks.md` didn't change, so their line "Approved provisionally by the Author's order of 2026-11-15" stands as it was.

The Author's rule the one new clarification is taken under, word for word from the brief: "**Approval, given ahead.** The spec-writer takes the recommended answer at clarify and at the plan, as for nights 1 and 2, and records at the top of `plan.md` and `tasks.md`: "Approved provisionally by the Author's order of 2026-11-15", with his words above. Each question still goes on the morning page with its recommended answer; an answer he overturns is reworked before he merges."

Line numbers below are on this branch's tip unless named.

## The commits

| Commit | What |
|---|---|
| `df8b3603` | Save point: start. |
| `03ab5817` | rv-docfix-028's Nit 1 and Nit 4; rv-docfix2-028's N1 to N5. |
| `b139efa0` | ADR 0055: its spec 028 citations moved, FR-027's quote requoted, "Q1 to Q25" (beyond the findings; below). |
| `32b1816c` | rv-docfix-028's Nit 3 (the line note) and Nit 5. |
| `831d827e` | A "Done by docfix3-028" line under each of the nine findings fixed, in the line note. |
| this file's commit | This record. |

## rv-docfix-028

### Nit 1: eight links, not four

The finding (the line note, quoting the page): "`human-patches/023.md:17` (and FR-031, `spec.md:253`; the timing cell :11) says `pdfinfo -url` lists the four film URLs, but the candidate carries eight links (the four films and C-0002's mail, GitHub profile, and hareet.ai twice), so your P8 check will show eight rows; fix: say eight, naming both sets".

The check. `pdfinfo` isn't installed in this container (`/bin/bash: line 1: pdfinfo: command not found`, exit 127), so the annotations were read from the file's bytes. The mail address is shown here as `mailto:…`; it is in the file, and I didn't copy it into another one.

```text
$ sha256sum apps/web/content/candidates/resume-author-links.pdf
5de0e7eeaed34587d4d79e29f0cbfb7c577a224ce31616f1d75fcbe4e0ff21fb  apps/web/content/candidates/resume-author-links.pdf
$ grep -a -o '/URI *([^)]*)' apps/web/content/candidates/resume-author-links.pdf   (mail address shown as …)
/URI (mailto:…)
/URI (https://github.com/Hareet)
/URI (https://hareet.ai/)
/URI (https://hareet.ai/)
/URI (https://github.com/hareet/h4reet-ai/tree/main/films/local-first)
/URI (https://github.com/hareet/h4reet-ai/tree/main/films/cost-meter)
/URI (https://github.com/hareet/h4reet-ai/tree/main/films/kill-switch-b2)
/URI (https://github.com/hareet/h4reet-ai/tree/main/films/data-flows)
$ grep -a -c '/Subtype */Link' apps/web/content/candidates/resume-author-links.pdf
8
$ sha256sum apps/web/content/resume-author.pdf      (C-0002's file, served today)
5523e5327a752bc10b92538ce8e016243aa5ea22e4e79c21f439f6b877549d6d  apps/web/content/resume-author.pdf
$ grep -a -o '/URI *([^)]*)' apps/web/content/resume-author.pdf   (mail address shown as …)
/URI (mailto:…)
/URI (https://github.com/Hareet)
/URI (https://hareet.ai/)
/URI (https://hareet.ai/)
```

So the candidate has eight links: C-0002's own four (its hash is `5523e532…549d6d`, the one `023.md:7` names) and the four film links appended. The Author's `pdfinfo -url` should list eight. I didn't run it here, and I make no claim about the order it prints them in.

- `docs/merge-requests/human-patches/023.md:11`. Old: "and `pdfinfo -url apps/web/content/candidates/resume-author-links.pdf` lists the four film URLs below." New: "and `pdfinfo -url apps/web/content/candidates/resume-author-links.pdf` lists eight URLs: the four film URLs below and the four links C-0002's file already carries (its mail address, the GitHub profile, and hareet.ai twice)."
- `023.md:17`. Old: "`pdfinfo -url` on the candidate lists these four, one per small-caps claim (read from the file's annotations by `docfix-028`, 2026-11-15; `films/resume-links.json`'s `repo` and films):" New: "`pdfinfo -url` on the candidate lists eight URLs: the four links C-0002's file already carries (its mail address, the GitHub profile, and hareet.ai twice) and these four, one per small-caps claim (read from the file's annotations by `docfix-028`, 2026-11-15; `films/resume-links.json`'s `repo` and films; the count of eight rechecked by `docfix3-028` from the file's eight `/URI` entries, rv-docfix-028's Nit 1):"
- `spec.md:254` (FR-031). Old: "listing the four film URLs and `sha256sum` matching". New: "listing eight URLs, the four film URLs and the four links C-0002's file already carries (its mail address, the GitHub profile, and hareet.ai twice), and `sha256sum` matching".
- `spec.md:291`, spec 023's Amendments row. The finding doesn't name it, but it makes the same claim. Old: "`pdfinfo -url` listing the four film URLs and `sha256sum`". New: "`pdfinfo -url` listing eight URLs, the four film URLs and C-0002's four, and `sha256sum`".

Unchanged: `023.md`'s `Candidate SHA-256:` line, which `film-links.test.ts:383-384` reads; "click the four links" in spec Q24 (the page's Q26, quoted word for word; four is right there, since only the films' links wait for the repository); and the heading "The four film URLs, and the clicks …".

### Nit 3: "spec Q24" and "page Q24", in the line note only

The finding: ""Q24" names both spec Q24 (page Q26) and page Q24 (the ADR title) in the line note (:174, :181) and `tasks.md` (:76, :86); fix: "spec Q24" and "page Q24"".

- Line note `:174`. Old: "(new Q24)" and "| done | Q24 is the page's Q26". New: "(new spec Q24)" and "| done | Spec Q24 is the page's Q26".
- Line note `:181`. Old: "| rv-doc-028 1 (Q24) |". New: "| rv-doc-028 1 (page Q24) |".
- Line note `:188`, the same ambiguity, edited with Nit 5. Old: "(its Q24 adds four lines to the spec)". New: "(its spec Q24 adds four lines to the spec)".
- `tasks.md` (:76, :86): left for T-INT, as the brief says.

### Nit 4: night 1's Q222 `Answered:` line, whole

The finding: "the record's note (:73) quotes night 1's Q222 `Answered:` line only to its first full stop, leaving out "The step is yours to make in the morning (Q224), so nothing records it before you do."; fix: quote the whole line".

The source, `git show refs/heads/night/supervisor/2026-11-13:docs/night-shift/2026-11-13.md`, line 1061 (Q222's heading is 1058): "Answered: recommended, the Author 2026-11-13 (the orders file's rule; yours to confirm or overturn here). The step is yours to make in the morning (Q224), so nothing records it before you do."

- `docs/merge-requests/2026-11-15-night-record2-dino-r2-record2-dino-r2.md:73`. Old: "And **Q222** (`:1058`), … taken the same way: "Answered: recommended, the Author 2026-11-13 (the orders file's rule; yours to confirm or overturn here)."". New: "And **Q222** (`:1058`, its `Answered:` line `:1061`), … taken the same way: "Answered: recommended, the Author 2026-11-13 (the orders file's rule; yours to confirm or overturn here). The step is yours to make in the morning (Q224), so nothing records it before you do."", plus "Q222's line quoted whole by `docfix3-028`, rv-docfix-028's Nit 4." at the end of the paragraph's parenthesis.
- Left: the same paragraph's Q223 quote also stops at the line's first full stop (its line 1066 goes on: "It is a fact only you can give; item 4's verify carries the wording change to FR-007 and the brief contract into item 4's note."). The finding names only Q222, so Q223 is left as it is and listed below for T-INT.

### Nit 5: how many citations moved

The finding: "the line note's :188 says 18 moved citations; the ADR's diff moves 20".

I compared every backticked `file:line` citation in ADR 0055 at `05cfd415` (docfix-028's base) and at `cd5a2c6d` (its tip). There are 44 before and 45 after. 20 moved: 17 of `spec.md` (281 → 297, 299 → 316 twice, 219 → 232, 230 → 243 twice, 234 → 247, 62 → 64, 67 → 69, 69 → 71, 295 → 312 three times, 291 → 308 twice, 300 → 317, 257 → 271, 259 → 273), plus `plan.md:23` → `:36` and `analysis.md:42` → `:43`. One was added: `spec.md:65` (Q11).

- Line note `:188`. Old: "18 citations of spec 028, its plan, and its analysis moved". New: "20 citations of spec 028, its plan, and its analysis moved, and one added (`spec.md:65`, Q11)".

## rv-docfix2-028

### N1: `hud.ts:671`, not `:668`

The finding: "**N1** `docfix2.md` cites `hud.ts:668`, the check is `:671` (impl-028a's row has the same `:668`)".

Checked: `git show 089d137c:apps/web/src/room/compose/hud.ts` has `// (b)` at 669, `const area = wallArea(screen, metrics);` at 670, and `if (area.w < T.minimum.w || area.h < T.minimum.h || area.w < t.minAreaWidthPx) return null;` at 671.

- `docfix2.md:39`. Old: "- `:668`: `if (area.w …". New: "- `:671` (first written `:668`; corrected by `docfix3-028`, rv-docfix2-028's N1): `if (area.w …". impl-028a's row is on the page, which isn't mine to edit.

### N2: "the frame area"

The finding: "**N2** FR-009 (b)'s "its area" should read "the frame area"".

Checked: the `area` that `hud.ts:671` bounds is `wallArea(…)`, whose comment (`:629`) reads "The wall area (spec 028, FR-006)". FR-006 calls it "THE FRAME AREA".

- `spec.md:209` (FR-009 (b)). Old: "the stage is at least spec 005's floor (304 × 196) and its area at least `wall.minAreaWidthPx` wide". New: "the stage is at least spec 005's floor (304 × 196) and the frame area at least `wall.minAreaWidthPx` wide".
- `docfix2.md:57`, a new line after its FR-009 reading. It says the spec now reads "the frame area", and that docfix2's "New" quote stays as docfix2 wrote it.
- Left: the two Amendments rows (spec 005's FR-054, spec 014's FR-061) still say "held to spec 004's stage (its area at least 686.4 px wide, FR-009 (b); …)". There, "its" follows "the stage is the wall area", so it reads as the frame area. The finding names FR-009 (b) only.

### N3: the page's Q34 in the Clarifications, as spec Q25

The finding: "**N3** Q34 isn't in the spec's Clarifications".

- `spec.md:88`, new, under "After the line's reviews". It gives spec Q25 (the page's Q34): the page's question word for word as its heading, from `git show 0453336e:docs/night-shift/2026-11-15.md` line 123. Then "Taken: **the page's recommended answer**, provisionally under his rule 1", its words verbatim ("yes: the split layout is taken only where its frame area is at least 686.4 px wide, … 1280 × 720 keeps the column layout"), the page's two other options verbatim, and my reading, which names FR-009 (b) and the two Amendments rows that rest on it. The page has no `Answered:` line for Q34 at `0453336e`, nor at `night/supervisor/2026-11-15`'s tip `60f75f3a`, so none is cited as his words.
- Numbered spec Q25 because the spec's own numbering ends at Q24 (the page's Q26). FR-009 and the Amendments rows keep saying "the page's Q34".

### N4: B3-N3 settled in the build's favour

The finding: "**N4** dropping "as `fillSlots` reads a slot" settles B3-N3 in the build's favour, which `docfix2.md` says it doesn't".

- `docfix2.md:28`. Old: "The spec now says what the build does and doesn't settle B3-N3." New: "The spec now says what the build does. Dropping "as `fillSlots` reads a slot" settles B3-N3 in the build's favour: the spec no longer asks for the slot's `phrasing`, so the raw `value` the build shows is what FR-027 requires. (This sentence first read "The spec now says what the build does and doesn't settle B3-N3"; corrected by `docfix3-028`, rv-docfix2-028's N4. B3-N3 still rests on the page's impl-028b row, and if the Author wants the `phrasing` applied, FR-027 and the build both change.)"

### N5: the stray `**`

The finding: "**N5** a stray `**` in `docfix2.md`'s quote of A2-2."

Checked against `git show 8aeb3d09:docs/night-shift/2026-11-15.md`: the page has "**A2-2 (Important, documents) goes to `docfix2-028`, not to you:** spec.md FR-009 (b) …". The quote began inside the bold, so it kept the closing `**` and not the opening one.

- `docfix2.md:32`. Old: "The page's finding, verbatim: "A2-2 (Important, documents) goes to `docfix2-028`, not to you:** spec.md". New: "The page's finding, verbatim (the page's bold markers dropped; the stray closing `**` removed by `docfix3-028`, rv-docfix2-028's N5): "A2-2 (Important, documents) goes to `docfix2-028`, not to you: spec.md". The words are unchanged.

## Beyond the findings: ADR 0055's citations of spec 028 (`b139efa0`)

N3's new line moves every line of `spec.md` after 87 down one. `docfix2-028`'s two new Amendments rows had already moved every line after about 283 down two, and no review or task had recounted the ADR since. So ADR 0055's spec 028 citations no longer pointed at what they quote. The brief asks for documents true as they stand, so I moved them. A script, written with the Write tool outside the worktree (`/tmp/d3tools/adrfix.py`), changes each citation only if the span the ADR quotes is on the new line:

```text
ADR:16 `specs/028-room-after-review/spec.md:297` -> `specs/028-room-after-review/spec.md:300` x1: span found on spec.md:300
ADR:16 (`:316`) -> (`:319`) x1: span found on spec.md:319
ADR:17 `spec.md:232` -> `spec.md:233` x1: span found on spec.md:233
ADR:18 `spec.md:243` -> `spec.md:244` x1: span found on spec.md:244
ADR:19 `spec.md:247` -> `spec.md:248` x1: span found on spec.md:248
ADR:47 `spec.md:316` -> `spec.md:319` x1: span found on spec.md:319
ADR:48 `spec.md:312` -> `spec.md:315` x1: span found on spec.md:315
ADR:61 `spec.md:308` -> `spec.md:311` x2: span found on spec.md:311
ADR:62 `spec.md:317` -> `spec.md:320` x1: span found on spec.md:320
ADR:62 `spec.md:271` -> `spec.md:272` x1: span found on spec.md:272
ADR:62 `spec.md:273` -> `spec.md:274` x1: span found on spec.md:274
ADR:63 `spec.md:312` -> `spec.md:315` x2: span found on spec.md:315
ADR:63 `spec.md:243` -> `spec.md:244` x1: span found on spec.md:244
moved 15 citations
```

Some citations stay where they were. Q10, Q11, Q15, and Q17 (`spec.md:64`, `:65`, `:69`, `:71`) come before line 88. `plan.md:36` and `analysis.md:43` cite files that didn't change. The ADR's other `spec.md:N` citations (its table's `:176`, `:250`, `:184`, `:239`, `:191`, `:145`, `:254`; `:41`; and `:239`, `:184` at :97) belong to specs 024 and 025.

A second script (`/tmp/d3tools/adrquotes.py`) checked every quoted span on the ADR's spec 028 lines against the spec. It found one stale quote. ADR `:18` quoted FR-027 as it read before `docfix2-028` ("WHERE the bundle carries …", "in the 2D room when the room first shows"). It now quotes FR-027 as it stands: "IN a dog visit, WHERE the room's index carries `dog_visitor_intro` (…), THE TWIN SHALL show it once a visit, when the hand-off ends (US5 AS2), in the 3D and the 2D room alike, since the 2D room runs its hand-off too: in 3D in the speech bubble of FR-020 over the twin's figure and in the polite live region; in the 2D room in the polite live region (Q15). It SHALL NOT …", marked "as `docfix2-028` reworded it, requoted by `docfix3-028`". After that, the spans the script didn't find all quote spec 028's plan or analysis, the page, or other specs' documents, not spec 028's spec. The ADR's telemetry decision is unchanged: FR-027 still sends nothing.

Two more: ADR `:41`'s provenance gains "its spec 028 line numbers and FR-027's quote rechecked by `docfix3-028` on the line after `docfix2-028`, at `5437a191`", and `:97`'s "spec 028's Q1 to Q24" now reads "Q1 to Q25".

## Runs

On `831d827e`, every edit in place except this file.

```text
$ npm ci --ignore-scripts 2>&1 | grep -v '^npm notice' | tail -4; echo "exit=${PIPESTATUS[0]}"
To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
exit=0
$ L=$(mktemp); make lint > "$L" 2>&1; echo "exit=$?"; grep -v "^shellcheck\|xargs" "$L" | tail -10
exit=0
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
859 files already formatted
$ python3 -m pytest -q -p no:cacheprovider evals/test_repository_docs.py evals/test_docs_links.py 2>&1 | tail -4; echo "exit=${PIPESTATUS[0]}"
.............................................................            [100%]
61 passed in 0.92s
exit=0
$ python3 evals/docs_links.py 2>&1 | tail -6; echo "exit=${PIPESTATUS[0]}"
PASS  every relative link resolves: 2524 links in 472 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 52 of 52
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2524 relative links in 472 files
exit=0
```

The lint paste leaves out shellcheck's lines; shellcheck ran, and exit 0 covers it.

I also ran one test beyond the brief's list, because `apps/web/test/content/film-links.test.ts:238` reads `human-patches/023.md`, which this task edits. It used the lockfile's vitest, not `npx`:

```text
$ cd apps/web && ../../node_modules/.bin/vitest run --maxWorkers=1 test/content/film-links.test.ts 2>&1 | tail -8; echo "exit=${PIPESTATUS[0]}"
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-15/docfix3-028/apps/web


 Test Files  1 passed (1)
      Tests  11 passed | 2 skipped (13)
   Start at  14:43:07
   Duration  56.08s (tests 87%, import 7%, transform 6%)

exit=0
```

No other test under `apps/web/test`, `evals`, or `tools` reads spec 028, ADR 0055, the record's note, or the line note (`grep -rln` found none).

## Refusals

None. No hook, bash-gate rule, or deny rule refused a command. Once, the post-edit hook flagged a lint nit (ruff SIM114) in my scratch script `/tmp/d3tools/adrcite.py`, outside the worktree. That was a finding, not a refusal, and I fixed it in the script. Every commit's hooks passed ("no leaks found"; "arrival-check: 0 findings").

## Questions

None new. The page's Q34 is impl-028a's and already on the page. Its recommended answer is taken as spec Q25, and if he overturns it, FR-009 (b), spec Q25, and the two Amendments rows are reworked.

## What's left

- For T-INT, as the brief says: rv-docfix-028's Nit 2 (`plan.md:172`, T-B09 in `tasks.md`), Nit 3's `tasks.md` part (:76, :86), and rv-docfix2-028's I-1 (Q36: the measurement, then spec 014's Amendments row).
- For T-INT, found here: the record's note `:73` quotes night 1's Q223 `Answered:` line only to its first full stop (the same flaw as Nit 4, but not named by it). The line note's docfix-028 table keeps its own line numbers, which hold on docfix-028's tip.
- If a later merge moves `spec.md` again, ADR 0055's spec 028 citations need recounting. `/tmp/d3tools/adrquotes.py`'s check can be rewritten for that; it is outside the worktree and isn't committed.
- `rv-docfix3-028` (another worker, read-only) on this branch's tip, then a merge into the line.
