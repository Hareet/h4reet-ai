# Spec 028, the room after the Author's review: the stack (T-INT)

Spec: [specs/028-room-after-review/](../../specs/028-room-after-review/spec.md) · Intent: [intent/028-room-after-review.md](../../intent/028-room-after-review.md) · Line note: [2026-11-15-night-028-line.md](2026-11-15-night-028-line.md)
Written by: implementer (night shift, Opus 5.5; task `int-028`, T-INT). I wrote none of the line I integrate. · Date: 2026-11-15 · Branch: `night/int-028/int-028`, from the 028 line as `merge-028-6` left it (`e34ef9d6`)
Session: /home/h4reet/h4reet-ai/night/2026-11-15/int-028 · Repo hooks active: yes (each commit: gitleaks "no leaks found"; "arrival-check: 0 findings")
Authorized by: the Author's orders for night 3 (2026-11-15), item 1 and rules 2, 4, 12, 14; the supervisor's task `int-028`

## His words

His review of `main` (`make up ENV=prod`), 2026-11-15, verbatim:

> 1. The Conversation UI is good, in that convo panel on the left side of the page, let's remove the thumbnail icon view, and let's make that conversation panel UI the length of the left side of the page, so it should be the same length as the room wall. 2) The dinosaur doesn't load the model, or do any of the eating of assets. 3) When I view the resume and download the PDF, the downloaded PDF doesn't have links to the films where the category text is listed in the sub headlines. 4) The dog isn't supposed to show all the time, or when a different visitor is selected. Only when someone selects the dog, does it come in the room, or if someone selects the dinosaur, then the twin should wave, scream that there is a dinosaur in the room, then the dog enters the room and the twin adn the dog grab the bicycle and leave, and the dinosaur can then eat the assets. If the dog was selected, then the twin has one introduction sentence about how much they love Arya, and all the adventures we've had of course, i'll show her all the work i've been doing, and then the dog selected visitor is the same concept as the woman or man visitor, they will just engage with the twin or the room assets. 4) Delete the warning labels in the top left corner "This is an AI Twin." "The AI dog is a nova scotia ... ", and delete the bottom panel below the room "Around the room listing". 5) The UI on the right side lays over itself, when hovering over the snowboard, you can see the UI highlight snowboard and the enter button is covering up some of it, making it not legible.

> And align the UI elements so they are next the room wall, and take up all of the grey space, i.e. make the bigger, and responsive so that they are not all teh way to the corners as seen in teh screen shot

His answers to the page's Q2 and Q3 (his orders' rule 14, 2026-11-15, about 01:20 his time), verbatim: "q2) I mean't when i downloaded the pdf, there was no link on those sub headlines "LOCAL MODELS FIRST". I figured that would have existed as we know what the link on the repo will be. q3) keep it as waiting for model intake p9".

## Before starting

```text
$ git log -1 --format='%H %s'
e34ef9d6cd9fcc5c45f9e6eb6ec56f3a14f661bf docs(028): merge-028-6 merges verify2-028b (14587f71) as affdf97b into the 028 line, no conflict; …; Result: green
$ grep -n "Result:" docs/merge-requests/2026-11-15-night-028-line.md   # merge-028-6's section starts at line 719
815:**Result: green.** Merge `affdf97b` (verify2-028b's `14587f71`): group B is on the line beside group A.
```

Green, so T-INT went on.

## What T-INT did

### tasks.md's T-INT

- **The merges** were the merge tasks' (`merge-028-1` to `merge-028-6`, the line note), each with no conflict. `src/room/app.ts`, the one file both groups edit (plan §6: A first, B second), auto-merged at `merge-028-6`.
- **Row V1's still sentence** (FR-002, FR-030), test-first. RED `07bad8c8`: both disclosure tests, cell for cell, take spec 018's H-11 clause out of V1's Carries after spec 028's FR-030, as FR-002 says (`test/disclosure.test.ts`: 2 failed, the two V1 cases; `evals/test_disclosure.py`: 1 failed). GREEN `133999f9`: `docs/data-flow-disclosure.md` V1 loses ", or, in a 3D visit, once, when the conversation panel first opens in the split layout (spec 018)"; the twin's still is named only "in a visit that shows the 2D room" again. vitest 11 passed; pytest 36 passed.

### The steps `rework-spec-028` added

1. **The dog that can't walk** (FR-026, Q21): **skipped, done by `rework-028b`** (rv-028b-1's B1-2, RED `11b89e32`, GREEN `8568c959`), as tasks.md's T-B04 says.
2. **Ownership** (N-5; plan §6). Computed from each group's own commits (`git log --no-merges` over `14587f71 ^1ff6b9eb ^ba2b6028` for B, the reverse for A):
   - Group A edited no file §6 gives to group B, and group B none §6 gives to A.
   - Files both edited: `src/room/app.ts` (A first, T-A03 and T-A06; B second, T-B05 and T-B08, after merging A at T-A06's `33436c6e`), auto-merged; `docs/data-flow-disclosure.md` (B's T-B07, then T-INT, as §6 orders); `room/ui-words.yaml`, `src/room/ui-keys.ts`, the good fixture's `ui-words.yaml` (B's T-B01, merged by A for T-A06, unchanged by A).
   - Files group A edited that §6 didn't name: `compose/protect.ts`, `build/room/plugin.ts`, `hud/keycap.ts`. Plan §6 now names all three as A's (`2057fa10`, `d06babc2`; rv-028a-1's A1-N1, rv-028a-4's A4-N2).
3. **The patch order**: the page's Q42 recommended answer, taken provisionally as the supervisor ordered: **022 → merge the 028 stack → 026 r4 → 028's P1**. Plan §7 records it as a departure (Q42's reason: group A and 026 r3 change the same three files, rv-patch6-026's P6-1). `patch7-026` builds r4 and writes `human-patches/026.md`; I didn't touch it, r3, or patch6-026's note. Q41's spec 026 amendments travel in r4, not on this line. P1 already carries its one source file (`corpus/facts/hobbies-and-travel.yaml`) and nothing generated, so no rebuild was needed (its SHA-256 unchanged, below). Dry-runs on fresh `git archive refs/heads/main` exports (main is `b4b474f1` now, one commit past `a36f98ec`: below):

   ```text
   $ sha256sum docs/merge-requests/2026-11-15-corpus-dog-visitor-intro.patch docs/merge-requests/2026-11-14-corpus-film-scripts.patch
   570399a0f2d8ee31fde54243b026c52132505362620dca1f17a47bfc9e5af8ce  …/2026-11-15-corpus-dog-visitor-intro.patch
   d05a7bf11e87c0853ec466eb80b0ede0d28748663a1fab0ac1a7414f0daf7c15  …/2026-11-14-corpus-film-scripts.patch
   $ git show refs/heads/main:docs/merge-requests/2026-11-14-corpus-film-scripts.patch | sha256sum
   d05a7bf11e87c0853ec466eb80b0ede0d28748663a1fab0ac1a7414f0daf7c15  -
   # export A (plain main)
   $ patch -p1 --dry-run < …/2026-11-15-corpus-dog-visitor-intro.patch
   checking file corpus/facts/hobbies-and-travel.yaml
   028 P1 --dry-run on plain main: exit=0
   # export B (plain main)
   $ patch -p1 < …/2026-11-14-corpus-film-scripts.patch
   022 patch -p1 on main: exit=0          (0 lines with offset, fuzz, or FAILED)
   $ patch -p1 --dry-run < …/2026-11-15-corpus-dog-visitor-intro.patch
   checking file corpus/facts/hobbies-and-travel.yaml
   028 P1 --dry-run on main + 022: exit=0
   $ find . -name '*.rej' -o -name '*.orig' | wc -l
   0
   ```

   The check after r4 (P1 on main + 022 + the stack + r4, with the regenerate commands `human-patches/028.md` gives him and `content:check`) is the naming task's. `human-patches/028.md` P1 now gives Q42's order first and keeps the order as group B wrote it below it.
4. **P8, now** (FR-031, spec Q24): `023.md`'s part was `docfix-028`'s. `human-patches/028.md`'s PDF line (P2) was `rework-028b`'s (B3-1). T-INT corrected its step 1, which still said `pdfinfo -url` "lists the four film URLs", to eight, as FR-031 says (rv-impl-028b's BR-4). **New on `main`**, found here: his commit `b4b474f1` (`policy(023): approve the resume, C-0005`, 2026-11-15) adds the C-0005 entry with the candidate's SHA-256 (`5de0e7ee…ff21fb`) at `apps/web/content/resume-author.pdf`. The `git mv` of the candidate to that path isn't on `main`, which still serves C-0002's file (`5523e532…`, no film links). So until the move lands, a downloaded PDF still has no film links. `human-patches/028.md` P2 says so. I checked the stack beside his commit on a scratch merge (below, "Runs").
5. **His Q3 answer** (spec Q11; T-B10's change; FR-032): below, "The eating and the dinosaur".

### The findings the line's note routes "for T-INT"

| Finding | What T-INT did | Commit |
|---|---|---|
| rv-docfix-028 Nit 2 | `plan.md` §7's "steps 1, 2, 3, and 5 … are unchanged" corrected; T-B09's line says `023.md`'s part was `docfix-028`'s | `2057fa10` |
| rv-docfix-028 Nit 3 | `tasks.md` :76 "spec Q24", :86 "page Q24" | `2057fa10` |
| rv-docfix2-028 I-1 (the page's Q36) | **Measured**, then spec 014's Amendments row amended (below) | `2057fa10` |
| rv-docfix3-028 Nit A | `spec.md` Open Questions names spec Q25 (the page's Q34) | `2057fa10` |
| rv-docfix3-028 Nit B | ADR 0055 :41: "rechecked … on its tip `ef1284e6` (with spec Q25)"; T-INT's `spec.md` edits are in place and move no line, so ADR 0055's cited lines hold | `2057fa10` |
| rv-028a-4 A4-1 | The stand-in line's reachability check restored in `test/ui/hud.test.ts`, `hud-faults.test.ts`, `loading-faults.test.ts`. I didn't write group A's rewrite, as the page's condition requires. The guards pass on the line and fail under a mutation (`aria-hidden` on the twin's slot in `text-copy.ts`, reverted) | `ea16189f` |
| rv-028a-4 A4-N1 | `plan.md` §R-B8 names `credits.test.ts:48-56` and `hud-faults.test.ts:214-217`, each rewritten after its code | `2057fa10` |
| A1-N1, A4-N2 | `plan.md` §6: `compose/protect.ts`, `build/room/plugin.ts` (and `hud/keycap.ts`) are A's | `2057fa10`, `d06babc2` |
| A4-N3 | `app.ts`'s spec 009 header and `layout.ts`'s spec 012 header no longer say the stage's note shows the stand-in line | `0fb30c26` |
| A4-N4 | `app.ts`'s 211-character doc comment wrapped | `0fb30c26` |
| rv-028a-3 A3-1 | `plan.md:115`'s sentence struck through, superseded by A2-1 (`2736157a`, `ed8486ee`) | `2057fa10` |
| rv-028a-3 A3-3 | `impl-a.md`'s "Not done" item struck through, fixed by A2-1 | `2057fa10` |
| verify-028a's timing note | **Recorded, no change**: `test/room/bundle.test.ts` › "the placeholders flag (spec 014, T040)" once took 63,241 ms against `testTimeout: 60_000` on a shared CPU. It passed in every run here (below). Raising a timeout is a test edit that hides a slow build, so I left it, and it stays on the backlog | — |
| rv-rework2-028b B4-2 | `dino-scene-wiring.test.ts` checks FR-021's left lines exactly, with the noun read from the selectable that holds `figures.leave.takes` (no room ID in the test). It fails under a mutation ("the desk" in `ui-words.yaml`, reverted) | `ea16189f` |
| B4-4 | `plan.md` §R-B2's `gather` and §R-B4's as-built block show `take_at` and `takes`, as `scene.yaml` ships them | `2057fa10` |
| B4-5 | `impl-b.md`'s T-B03 print marked with the renamed keys `taken_origin`, `taken_box_floor` | `2057fa10` |
| rework2-028b's departure (the page's Q37) | FR-021, FR-022 name `take_at` and `takes`, the old name kept beside them; FR-022 names RI12's `takes` refusal | `2057fa10` |
| rv-impl-028b BR-1 | **Recorded, no code change** (plan §R-B3): the adapter picks `walk`, else `run`, which is FR-021's "playing `walk`"; `dogRole` would give `run` only above 1.5 m/s, and the shipped `dog_mps` is 1.2 | `2057fa10` |
| BR-2 | **Not done, backlog**: asserting "above the twin's head" needs the twin's projected feet, and the wiring test's stage exposes no camera to project them (its models never load). No real input reaches it before P9 | — |
| BR-3 | FR-020 now says the bubble shows for the larger of the speaking time and the greeting clip's length, as built (plan §R-B2, §R-B5) | `2057fa10` |
| BR-4 | `impl-b.md`'s B3-N1 (done by `docfix2-028`) and B3-N3 (its `phrasing` half settled by FR-027) marked; `028.md`'s eight URLs; T-B04's `tasks.md` line was already this branch's, kept at verify-028b's merge | `2057fa10` |

`tasks.md`: group B's ten tasks and T-DOC ticked (done on the line: impl-028b, rework-028b, rework2-028b, verify2-028b; doc-028, verify-028doc), and T-INT ticked last.

### I-1, measured (the page's Q36)

A scratch script (outside the worktree, read-only on the repository) swept spec 005's `sweepScreens()` on the room's own bundle at the compositor's metrics. For each screen that takes the split layout, it compared the wall box `wallBoxes(screen, OPENING, DEFAULT_METRICS, { wall: protect }).wall` with the protector's wall at the clear area, `protect.wall(clearArea(screen))`, as Q36 says:

```text
$ node --import tsx <scratch>/measure-scale.mts "$PWD"    # from apps/web/; its last lines
split screens: 3328; smaller than spec 005's: 649
widths 1360 to 2816; heights 736 to 2112
least ratio 0.754 at 1360 x 944 (554.5 under 735.4); greatest 0.9992 at 1472 x 832
widest window smaller: 2816; landscape split windows by width (count smaller): 1408:30 1472:28 1536:25 1600:22 1664:19 1728:16 1792:14 1856:11 1920:10 1984:10 2048:10 2112:10 2176:10 2240:9 2304:8 2368:7 2432:6 2496:5 2560:5 2624:4 2688:3 2752:2 2816:1
1536 x 864: split wall 696.7 px, spec 005's 673.0 px, ratio 1.035
1920 x 1200: split wall 1005.8 px, spec 005's 961.2 px, ratio 1.046
2560 x 1440: split wall 1211.7 px, spec 005's 1167.1 px, ratio 1.038
smaller: aspect w/h from 1.030 to 1.848; not smaller: from 1.364
1366 x 768: ratio 0.947
1920 x 1080: ratio 1.052
1680 x 1050: ratio 0.976
1440 x 900: ratio 0.880
1600 x 900: ratio 1.063
2560 x 1600: ratio 1.034
3840 x 2160: ratio 1.025
```

(The sweep holds no 1366 × 768, 1920 × 1080, 1680 × 1050, 1440 × 900, 1600 × 900, 2560 × 1600, or 3840 × 2160 on its grid; the script adds them for the last seven lines. The 3,328 split screens are the sweep's; `room:report` counts 3,329 split "screens and states".)

The band is wider than Q36's estimate ("windows about 1366 to 1700 px wide"): it runs to 2816 px wide on taller windows. Q36's estimated figures held: about 5% at 1366 × 768 (measured 5.3%), about 12% at 1440 × 900 (12.0%), about 2% at 1680 × 1050 (2.4%). Q36's recommended answer is taken provisionally: the split layout stays as built, and spec 014's Amendments row in `spec.md` now carries SC-001's clause "the room's on-screen scale is at least spec 005's", with these figures. One question went to the page with the measured band (`/night/io/out/questions.md`). Its recommendation, keep as built, is taken.

## The eating and the dinosaur (step 5; FR-025, FR-032)

`probe-eat-028`'s finding (`specs/028-room-after-review/probe-eat.md`), in its words: "**No.** On `main`, a visitor who chose the dinosaur, with no model under `assets/visitors/dinosaur/`, can't eat. The walking view never offers "Eat", key B does nothing, and nothing is eaten." and "This isn't a bug in the eating. Spec 024 turns the eating off without the model on purpose".

Night 1's Q247 is a recommendation taken under that night's rule, not his words. Its recommended answer reads: "Yes, one condition for all three: a dinosaur visit reserves the Eat box, and the compositor checks and reports it, only when the bundle carries the dinosaur's model (the tile can't show without it, FR-001). …". Beside it, night 1's page has the line "Answered: recommended, the Author 2026-11-13 (the orders file's rule; yours to confirm or overturn here)." His own words on it are his answer to the night-3 page's Q3, verbatim: "q3) keep it as waiting for model intake p9".

So, as FR-032 says: **a cut-out dinosaur visit shows no scene and no eating until his intake (P9)**. Its "why" shows on screen only where "Around the room" does (FR-016: the dock and stacked layouts, or while it holds focus). Spec 028 changes no eating code beyond the scene's gate (FR-025).

## Runs

(running)

## Refusals

(none so far)

## Questions

One, to `/night/io/out/questions.md`, with the measured band of I-1 (above); recommended: keep the split layout as built (Q36); taken.

## For the repo agent and the Author

(written at the end)
