# feat/012-loading-screen

Spec: specs/012-loading-screen/ · Intent: specs/012-loading-screen/intent.md · Written by: implementer (an agent session) · Date: 2026-11-09, revised 2026-11-10 (the merge of `main` at b335b9b2, its checks, and your steps)
Session: /home/h4reet/h4reet-ai/h4reet-ai, working in the worktree /tmp/claude-1000/wt-feat012 · Repo hooks active: the session's hooks; the worktree's commits ran the repository's git hooks (gitleaks and the arrival check print on each commit)
Authorized by: the spec and the plan, approved by the Author on 2026-11-09 as taken (tasks.md T000, recorded in his words)

## Status: ready for its gate on this commit, `refs/heads/main` b335b9b2 merged in; reviewed once (T036), every finding and nit fixed (T037); not merged

**Ready for its gate.** The branch was stacked on `feat/005-full-window-room`: it was cut at `spec/012-loading-screen-r2`'s tip, b0bd247e, which sits on `feat/005-full-window-room` at af82c6c5. That branch is now on `main`, as b335b9b2 ("Merge feat/005-full-window-room (6949c3f6af2c)"), after it had taken in `main` 67028747 (constitution 1.1.0 and ADR 0044 accepted). This branch then merged `refs/heads/main` at b335b9b2 (a9a4f09e), with one conflict, in `docs/adr/README.md`, both rows kept. The guard still anchors on 91593f6e, the reviewed and fixed content, and checks the index's row on its own (For the Author, step 2).

| Commit | What |
|---|---|
| b906c5e7 to 6cea0c5d | T000 to T032, T034, and T035 (The RED and GREEN runs, below) |
| 034215bc | the merge of `refs/heads/main` at d0fac811, with no conflict: gate 1 (the avatars and the timing fix), gate 1b (`fix/007-image-readiness`), and gate 2 (the Anthropic switch) |
| 87db6def, 4a3a257b | T041, after that merge: the image's room build copies `config/routing.yaml` and `config/prices.yaml` |
| 4989cb5c | the note after User Story 6: the tip T036's review read |
| fb77b91b to 75019b6c | T037: the review's I-1, N1, N4, N3, and the price lookup, a RED commit and then a GREEN one for each (Review) |
| 91593f6e | T037's docs: the review's N2 (Amendment L12), plan.md's tree, the README. The content the guard anchors on |
| 0e5f5b44 | this note, ready for its gate after `feat/005-full-window-room`, with T033's checks on 91593f6e |
| a9a4f09e | the merge of `refs/heads/main` at b335b9b2, `git --no-replace-objects merge --no-edit refs/heads/main`, with one conflict, in `docs/adr/README.md`: both rows kept, 0044 then 0045, as the main session directed; the merged index is `main`'s with the 0045 row added |
| 158c4b60 | this note in progress, a save point while `make check` ran |
| this commit | this note: the checks on a9a4f09e, the guard on 91593f6e, and your steps for a clean gate or a hand merge |

**The second merge of `main`.** It brought ten files, none of them code or configuration: `.specify/memory/constitution.md`, `README.md`, ADRs 0001 and 0044, the ADR index, `docs/how-we-build/lifecycle.md`, three files in `docs/merge-requests/` (the constitution's patch, `docs/001-ec2-default`'s note, and `feat/005-full-window-room`'s), and `specs/005-full-window-room/tasks.md`. In `docs/adr/README.md` each side had added a row after 0043: `main`'s 0044, EC2 as prod's default host, and this branch's 0045, the room loads behind a loader. Both are kept in number order, each in its own side's words, and the merged file differs from `main`'s by the 0045 row alone. No file the hints read or cite changed, and nothing under `apps/`, `services/`, or `config/`, so the sizes and the hints measured on 91593f6e stand.

**The two patches beside this note** (`2026-11-09-feat-012-us6-t030-t031.patch` and `-t032.patch`) touch nine files, and none of them changed in this merge, so neither patch was rebuilt. Both were applied in 793b44ca and 6cea0c5d and stay as the record of the held work.

- **Built, test-first:** T000 to T032, T034, and T035, and T041 after the merge. Every story is in.
- **User Story 6:** the main session confirmed that `config/room-events.yaml` is generated and not protected, so T030 and T031 (793b44ca) and T032 (6cea0c5d) applied the two held patches, the first regenerating that file with `npm run manifest`: one line, the kind. No other file under `config/` changed. The two patch files stay beside this note as the record of the held work.
- **T041, after the merge:** the image's room build copies `config/routing.yaml` and `config/prices.yaml` (87db6def, 4a3a257b).
- **Reviewed:** T036's review of 4989cb5c said not ready, with one Important finding and five nits; T037 fixed each, a RED commit and then a GREEN one for each change to code (Review). The post-fix tip is 91593f6e, which the guard anchors on: after it, only this note changes.
- **Checked on the post-fix tip (T033):** `make lint`, `make test`, `make evals`, `make check ENGINE_MODE=none-yet`, `gitleaks dir` on an export, and the rehearsal into `refs/heads/main` (Verification on the post-fix tip).
- **Checked again on the merged tip, a9a4f09e:** the same four `make` runs, `gitleaks dir` on an export of this commit's tree, and the guard's rehearsal in a scratch clone under zsh and bash (Verification on the merged tip).
- **Done, but not ticked:** T033, T036, and T037 are done but stay unticked in `tasks.md`, because only this note may change after 91593f6e. Their ticks go with the next commit that moves the anchor, or with yours.
- **The Author's:** T038 (the gate and the merge), T039 (his runs and his look on the live room), and T040 (ADR 0045).

## What changed and why

The Author's words of 2026-11-09, as the intent records them: "We may as well get you working on a progress bar as the web assets are downloading, make it like a game progress bar with the web page faded in the background. We should have hints below the progress bar on how to interact with the twin, and what the neon sign displays, how we evaluate costs. "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure." "Ask about the latest work" "click on objects to have the twin start discussing them" . Add this as a complete item to your work to start as I'm away for dinner. You can do it!" His approval, the same day: "Also we aprove of the spec 012: the loading screen".

What this branch builds, by plan.md:

- **A loader from "Enter" to the hand-off, in 3D only** (`app.ts`): over the room's own page, in place of "Loading the room…", focused on its heading. It gives way once, at the first of every part ended (`ready`), the ceiling, `LOADING_CEILING_MS` = 7,000 ms after "Enter" on the room's clock (`ceiling`), or the room in 2D by any road (`2d`). The room owns the timer, so a view that throws can't hold the hand-off. The hand-off starts once the loader has given way and spec 009's figures wait has ended.
- **A pure progress model** (`src/room/loading/progress.ts`): the 3D code 10, the room's text 2, the typefaces 3 (`faces/fonts.ts`'s new `settled()`), and the figures' files and the set models 85 by their bytes as served, each counting once its load has ended. Every end is kept, those heard before the 3D stage's list among them.
- **The room's models shown while the loader shows** (`scene.ts`, `scene/loader.ts`, `scene/avatars.ts`): the 3D stage says what it will load (`expected`) and keeps one flag, `closed`, turned by the room's `gaveWay` or its first `showHandoff`; one gate (`figureGate`, `modelGate`, `swapGate`) holds every parse and a set model's swap from then until the hand-off ends. The fetch, its integrity check, and its order are unchanged.
- **The card, the bar, and the page behind** (`loading/view.ts`, `loading/loading.css`, `layout.ts`): the card is the HUD's dark glass in every layout, fixed below the measured strip and the notes' reserve in the column and dock layouts, first in the page's flow in the stacked one. The bar is a progress bar with its value text ("64%: Loading the room's pieces: 12 of 21"), its fill's fraction set through the CSS object model. The scrim is a tint by element, per layout, never on the AI disclosure or the stage's notes. The scene's own motion is held by a counted hold of the motion store. The card fades out in 200 ms, inert from its first frame, and at once under reduced motion.
- **The hints** (`apps/web/room/hints.yaml`, `build/room/hints.ts`, `build/room/checks/rt.ts`, `loading/hints.ts`): his three verbatim, then the session's twelve as The Hint Copy words them, checked by RT2, RT3, RT9, and the new RT14 to RT17, every figure filled at build from the configuration, carried filled in the index's new `hints`. One at a time below the bar, a new one every 6 seconds, paused by the pointer, stopped by focus from the keyboard (a press's own focus isn't a stop, the review's I-1), with "Pause hints" or "Play hints", "Previous hint", and "Next hint".
- **The event, its row, and its panel**: `loading_cut_short`, with no identifier, once a visit cut short at the ceiling (`events.ts`, `app.ts`); row V4's trigger in the same commit; `config/room-events.yaml` regenerated; "Visits whose loading was cut short" in the dashboard's Room row and spec 000's §7.8.
- **The words**: twelve UI words (`ui-keys.ts`, `apps/web/room/ui-words.yaml`, the fixture room's), with the slots `{done}`, `{total}`, and `{n}`.
- **The record**: ADR 0045, proposed; the living interfaces' "(spec 012)" passages (spec 002's room-scene.md §1 and §3; spec 004's research R-28, room-bundle.md §3.1, and room-data-files.md §1, §9, and §13.5); the room's README's "The loader and its hints".

## His T000 answers

Recorded in tasks.md T000, in his words, verbatim: "Also we aprove of the spec 012: the loading screen". In the session's words: he accepts the intent and approves the spec, the plan, Q1 to Q5 (each option A) and D1 to D13 as taken, and The Hint Copy as written. FR-035 is answered as D6 took it: his hints 1 and 2 always show, with no `when`. No provisional answer was changed; every one stands.

## Acceptance criteria

| FRs                      | Status                                                                                                                           | Proven by                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| FR-001, FR-002           | met                                                                                                                              | `test/ui/loading-degraded.test.ts` (T006), `test/ui/loading-faults.test.ts` (T027)        |
| FR-003, FR-004           | met                                                                                                                              | T006, T027                                                                                |
| FR-005 to FR-007         | met                                                                                                                              | T006, T027, `test/room/loader.test.ts` and `scene.test.ts` (T005)                         |
| FR-008                   | met                                                                                                                              | `test/ui/loading-a11y.test.ts` (T025)                                                     |
| FR-009                   | met                                                                                                                              | T027 (the page hidden: the hints still, the ceiling on)                                   |
| FR-010 to FR-014         | met                                                                                                                              | `test/room/loading-progress.test.ts` (T004), T005, T006, `test/room/faces.test.ts` (T007) |
| FR-015                   | met: the fetch's options unchanged                                                                                               | T005                                                                                      |
| FR-016                   | met                                                                                                                              | `test/ui/loading.test.ts` (T012)                                                          |
| FR-017 to FR-020         | met                                                                                                                              | T006, T012, `test/room/quality.test.ts` (T007)                                            |
| FR-021                   | met                                                                                                                              | T005, `test/room/avatar-scene.test.ts`, `avatar-handoff.test.ts`                          |
| FR-022, FR-023           | met                                                                                                                              | T012, T025                                                                                |
| FR-024 to FR-027         | met in jsdom by the CSS rules and the geometry model; the look on screen is the Author's (T039)                                  | `test/ui/loading-page.test.ts`, `loading-notes.test.ts` (T016)                            |
| FR-028 to FR-031 | met, a press's own focus no stop since T037 (the review's I-1) | `test/room/loading-hints.test.ts` (T020), `test/ui/loading.test.ts`'s T021 and T037 cases |
| FR-032 to FR-034 | met, in a checkout's build and the web image's | `test/room/hints-compose.test.ts` (T018), `hints.test.ts` (T019), `test/room/image-inputs.test.ts` (T041) |
| FR-035                   | met: hints 1 and 2 with no `when`                                                                                                | T019                                                                                      |
| FR-036                   | met                                                                                                                              | T021                                                                                      |
| FR-037 to FR-043         | met in jsdom; the keyboard-only and screen-reader runs are the Author's (T039)                                                   | T012, T025, `test/room/loading-contrast.test.ts` (T025)                                   |
| FR-044, FR-045 | met: on 91593f6e, the entry 46,021 bytes (+4,298) and the index 6,221 (+1,025), which `test/room/chunk.test.ts`'s own assertions hold too; no package added | T033's numbers below |
| FR-046 to FR-048, FR-050 | met: the kind, its emit once a visit, row V4's trigger in the same commit, §7.8's row and the panel | T029; the gateway's route test; `deploy/scripts/test_dashboard.py` |
| FR-049                   | met                                                                                                                              | T006                                                                                      |
| FR-051                   | met                                                                                                                              | `test/room/vocabulary.test.ts` (T013)                                                     |
| FR-052, FR-053           | met: `apps/web/nginx.conf`, the compose files, `deploy/env*`, and the services unchanged; sizes only through `style.setProperty` | T012's spy; the branch's paths                                                            |
| FR-054                   | ADR 0045, proposed                                                                                                               | `make evals`' docs links                                                                  |
| FR-055                   | the look ships without a lookdev approval; his look is T039                                                                      | –                                                                                         |

SC-006's hands-on runs and SC-010 are the Author's, after the merge (T039).

## Constitution check

| Principle                                 | How this branch complies                                                                                                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Data-local by default | No new request or destination: the model reads page memory, and a fetch and beacon spy sees nothing new in every fault run (T006, T027). The one event, `loading_cut_short`, with no identifier, and row V4's trigger in the same commit (793b44ca). The degraded paths were built first (Phase 2) |
| II. Production-grade | Tests first in every phase, RED and GREEN below; the frame log's `loading` entries; the event's counter and its panel; ADR 0045 and the room's README |
| III. Intent before spec, spec before code | From the approved spec and plan; every departure recorded in plan.md (C1 to C7) in its commit; the living contracts marked "(spec 012)"; no agent merges                                                                                             |
| IV. Least privilege | No header, permission, sandbox domain, or human-only file changed; nothing under `.claude/`, `tools/gates/`, `evals/agent-config/`, `assets/`, `corpus/`, `infra/`, `CLAUDE.md`, or `REVIEW.md`, and under `config/` only the generated `config/room-events.yaml`; the integrity check on every model kept; the web image copies two more public configuration files, through fix/007's list and test |
| V. Cost | $0 in the cloud; no transfer change; at most one beacon per visit cut short. The cost hints read the configuration that enforces the ceilings, in the image as in a checkout |
| VI. Build in public                       | The shares, the ceiling, the hints and their sources committed                                                                                                                                                                                       |
| VII. Own the whole product                | The reasoning in plan.md, its departures, and ADR 0045; the Author's hints shown as typed                                                                                                                                                            |
| VIII. Honest AI                           | The AI disclosure and the stand-in line are never tinted or covered, by construction and by the geometry test (T016)                                                                                                                                 |

## Review

T036's review, by an agent that wrote none of this work, read the tip 4989cb5c. The main session ran it and relayed its findings; the reviewer's name isn't given to this session. **Verdict: not ready**, with one Important finding and five nits. T037 fixed each test-first, a RED commit and then a GREEN one for each change to code:

| Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | RED      | GREEN                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------ |
| **I-1** (FR-030, SC-005, WCAG 2.2's 2.2.2). A mouse click or a tap on "Pause hints" started the rotation, in the browsers that focus a button as it is pressed (Chrome, Edge, and Firefox on Windows and Linux, Chrome on Android): the press's own focus reached the controls' `focusin` as focus entering them, which stopped the rotation, and the click then played it. jsdom's `click()` never focuses, so the tests missed it. Now a `pointerdown` on the controls marks a press, which the next focus or click consumes; keyboard focus still stops the hints. Tests send the browsers' sequences: a mouse press, and a tap (pointerdown, pointerup, pointerleave, focus, click) | fb77b91b | f7e76839                             |
| **N1.** `scene/loader.ts` asked the texture ledger before the swap gate's wait and uploaded after it, so two parses in flight as the loader gave way could both fit and both upload. It asks again after the wait                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 24e64d10 | 01d7d746                             |
| **N2.** Hint 15 shows "Langfuse" on the loader's card, where spec 004's FR-049 and `REVIEW.md` name the neon sign alone. spec.md gains Amendment L12, naming the loader beside the sign and recording that the Author approved the copy as written, whose hint 15 he saw in the session's report. `REVIEW.md` is his to change; his look, below                                                                                                                                                                                                                                                                                                                                         | –        | 91593f6e (docs)                      |
| **N3.** The panel's description said the share "reads low rather than high"; the event is sent before the hand-off, so a visit cut short that leaves before the offer counts in the numerator alone, and the share can read high too. The description and §7.8's reading now say it is rough in both directions (plan.md's departure C7)                                                                                                                                                                                                                                                                                                                                                | 616aebf7 | 22ede5db                             |
| **N4** (drafts builds). `toFlat`'s skips could end the bar's last part and give way as `ready` before its own `giveWay("2d")`, so the frame log said the wrong reason. The fall gives way as `2d` first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 977b970d | 07d03eeb                             |
| **N5.** The note gave two growth figures for the entry chunk. Remeasured on the post-fix tip; one figure, below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | –        | this note                            |
| The price lookup. By provider and model, not model alone: the provider is fixed by each adapter's type in the gateway's own code, which nothing outside its adapters names, so the cheap safe half landed: two entries for prod's fallback model in the last version leave the price unfilled (RT17) rather than one picked by the file's order. A lookup by provider too is yours to ask for                                                                                                                                                                                                                                                                                           | 3c834c59 | 75019b6c                             |
| plan.md's file tree, corrected to the files built; the README's loader section, `loading_cut_short`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | –        | 91593f6e (docs)                      |
| Hint 13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | –        | unchanged, as the Author approved it |

The guard anchors on the post-fix tip, 91593f6e: after it, only this note changes.

## Departures

Each is in plan.md's Departures, in the commit that made it. ADR 0045 lists C1 to C6; C7, the panel's wording from the review's N3, is plan.md's alone, since it changes no decision the ADR records:

| ID  | What                                                                              | Why                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `settled()` resolves at once on a page with no `document.fonts`                   | Such a page asks for no typeface; jsdom has none, and a 2-second wait would hold every 3D test's hand-off for files never asked for. Where the API exists, the 2-second bound holds |
| C2  | A 3D stage that gives no `expected` counts no file                                | `Stage3D.expected` is optional, as `figures` is; the room's own stage always gives it                                                                                               |
| C3  | The end line is said together with the hand-off's when both fall in one turn      | The status region holds one text at a time; two says in a turn would leave a screen reader only the second                                                                          |
| C4  | `setLoading("on" \| "leaving" \| "off")`, and `insertLoader(card)`                | So the tints fade with the card, and "Around the room" is reachable from the fade's first frame                                                                                     |
| C5  | The stage line reads "Loading the room's code" until the stage's list has arrived | The loader's own chunk is 3D code too; "pieces: 0 of 0" would read wrong                                                                                                            |
| C6  | The track is `rgb(0 0 0 / 0.35)`, not `rgb(255 255 255 / 0.16)`                   | T025 found the yellow fill at 2.44:1 against the planned track over white beneath, under FR-041's 3:1                                                                               |
| C7 | The panel's description says the share is rough in both directions | `loading_cut_short` is sent before the hand-off, so a visit cut short that leaves before the offer counts in the numerator alone (the review's N3) |

## The RED and GREEN runs

Each phase's tests were committed failing before the code that makes them pass. The runs are `npx vitest run <files>` in `apps/web`, under Node 24.21.0, with two or three workers while the Author's gate ran.

| Phase                                                | RED commit | What failed                                                                                                                                                                                                                                                                                                                                               | GREEN commit       | What passed                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2, Foundational (T004 to T007, then T008 to T011)    | 261fc750   | 41 of the new cases in 9 files: loading-progress couldn't load; no `expected`, no gates, no `settled()`, no `hold()`, no `LOADING_CEILING_MS`, no loader. Passing at once: the gate closing at give-way (models wait for the hand-off today), the fetch unchanged, no loader without WebGL 2 or with the chunk failed before Enter, the figures' own wait | 5783a367           | the 9 files, 250; the hand-off, degraded, and a11y UI tests, 113; the other 24 files that start the room, 378                                                                                                                                                                                         |
| 5, the compositor lane (T018, T019, then T022, T023) | 6036df0e   | hints-compose and hints couldn't load; 6 of compose.test.ts's 241 (bad/RT14 to RT17, the catalogue)                                                                                                                                                                                                                                                       | 7ebe2ff2, 119d3c63 | hints-compose 33; schema and compose 458; hints.test 5 of 6 still failing until T023's file, then 6; bundle and data-only 71; `room:check` 0 findings                                                                                                                                                 |
| 3, User Story 1 (T012, T013, then T014, T015)        | 5d9a764f   | 6 of loading's 11, 3 of vocabulary's 10. Passing at once: the first value, focus and the quiet status region, the end lines, reduced motion's removal, which Phase 2 holds                                                                                                                                                                                | 2ce0258e           | loading 11, vocabulary 10; the UI suite and the stylesheet, compositor, and HUD tests, 35 files, 835                                                                                                                                                                                                  |
| 4, User Story 2 (T016, then T017)                    | 5b2f4222   | 6 of loading-page's 16 (the tints and their positions). Passing at once: the card's place and its geometry (T014 wrote them), and the through-the-room cases (Phase 2)                                                                                                                                                                                    | 6e8cf62d           | loading-page and loading-notes, 20; the UI suite and the stylesheet tests, 34 files, 501                                                                                                                                                                                                              |
| 5, the view lane (T020, T021, then T024)             | 352b61ff   | loading-hints and loading couldn't load (no `loading/hints`)                                                                                                                                                                                                                                                                                              | 248b9b83           | loading and loading-hints, 27; the UI suite and the room tests that start the room, 34 files, 574                                                                                                                                                                                                     |
| 6, User Story 4 (T025, then T026)                    | ac1f9a92   | one pair: the fill against the track over white beneath, 2.44:1 under 3:1. All else passed at once                                                                                                                                                                                                                                                        | 1a28cf50           | loading-a11y, loading-contrast, loading, loading-page, 53                                                                                                                                                                                                                                             |
| 7, User Story 5 (T027, T028)                         | a39e9aff   | none: the 16 fault runs passed at once, so T028 changed no code                                                                                                                                                                                                                                                                                           | –                  | –                                                                                                                                                                                                                                                                                                     |
| 8, User Story 6 (T029, then T030 to T032) | 480d75bc | web 4 of 57, gateway 3 of 46, pytest 2 of 85 | 793b44ca, 6cea0c5d | events, manifest, disclosure, loading-degraded, and generated, 74; the gateway's room-events-config and room-events route, 46; the dashboard test, 85 |
| 5, the image's reads (T041, after the merge) | 87db6def | 3 of image-inputs' 5: neither build stage copied the two files, and the copies from `config/` were five, not seven | 4a3a257b | image-inputs 5; `deploy/scripts/test_web_image.py` 85 |

**The merge of `refs/heads/main`** at d0fac811 (034215bc) had no conflict. After it, every targeted file passed: the loader's ten, the hints', the 3D stage's, loader's, and avatars', the faces', quality's, and motion's, the compositor's (vocabulary, schema, bundle, data-only, avatars-compose, generated), image-inputs, events, manifest, disclosure, and the hand-off, degraded, a11y, and avatars UI tests, 33 files, 886; compose, chunk, and dist, 267, so `main`'s readiness fix holds `test/room/chunk.test.ts`'s index assertion here too; the gateway's two files, 46; the dashboard test, 85; and `npm run room:check`, 0 findings. The avatars `main` brings are counted by the bar as figures' files, with no change here.

**My own test bugs, corrected before each GREEN** (no check weakened): loading-progress's expected value counted the files' share only once all had ended; two late-chunk cases awaited a stage that never came (they press Enter without waiting now); the 21-hint case shared one `sources` array, which the YAML writer wrote as an anchor; jsdom reflects a CSSOM write into a `style` attribute, which isn't markup (the check looks for `script` and `style` elements); the first-value case read the bar after a microtask; the room's parts stay inert until the hand-off's offer is answered, as today; focusing "Pause hints" stops the rotation, so its words become "Play hints", by design; one T029 case advanced the fake clock past both the 2D fall's timer and the ceiling in one step, so the fall's promise couldn't run between them as it would in a browser (corrected in T030's commit).

## Test expectations that changed (each where the hand-off now waits for the loader, or for the new data; no check weakened)

- `test/helpers/room.ts`: `intoRoom` steps the clock through a showing loader (`throughLoader`), a no-op where it has given way; the fake 3D stage gives `expected` and an `onCreate` hook; `start()` takes `withoutRoomData`, a `loadingView`, and `fonts`. degraded.test.ts's "timed out" and "failing to decode" model faults needed the stepping: their loads end inside async parses that one long advance of the fake clock never yields to.
- `test/room/quality.test.ts`: the late chunk's announcement reads "The room is ready. " before the hand-off's line (C3).
- `test/room/compose.test.ts`: 17 RT rules; RT17 lenient; RT14 strict-only. `test/room/schema.test.ts`: the hints kind. `test/room/bundle.test.ts`: the index's `hints` key.
- `test/room/data-only.test.ts` and `test/room/avatars-compose.test.ts`'s data-only proof: the compositor's reads gain the three config files and each file a session hint cites (L8, spec 004's room-data-files.md §1).
- `test/room/vocabulary.test.ts`: the closed list's 61 keys, and `SLOTS` with `done`, `total`, and `n`.
- `test/room/image-inputs.test.ts` (fix/007-image-readiness's, through the merge): its list of the files the room's build reads gains `ROUTING_FILE` and `PRICES_FILE`, and its read check runs the hints' `hintFigures` too (T041).

## The hints, as the built index holds them

In a checkout's build (`compose()` over the repository, lenient, with the twin's readiness), in order, 0 findings, read again after the merge of `main` at d0fac811; the merge of b335b9b2 changed no file they read or cite. Since gate 2, prod's fallback is the Anthropic API, so hint 12's figures are that adapter's model's entry in the price table's last version; they read as before:

1. Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure.
2. Ask about the latest work
3. click on objects to have the twin start discussing them
4. A border lights up around any piece you can talk about as you point at it; each is also in the "In the room" list.
5. Once a piece has started a conversation, type a question in the conversation's box and press Send.
6. Your path sets the twin's depth: "Engineer" for each topic's detail, "Not an engineer" for the overview, with the same facts in both.
7. Press "Walk around": W, A, S, D or the arrow keys walk, Q and E turn, and tapping or clicking the floor walks there.
8. The twin speaks only from a curated, versioned corpus about the Author's real work, and says so when it doesn't know.
9. The neon sign on the monitor counts what your conversation costs: "this call" for the latest answer, "this visit" for all of them.
10. On the sign, an answer from the Author's own machine reads "local" at no cost; a paid cloud answer shows its estimated cost, marked "est.".
11. This visit's total is summed in this page's memory, never stored or sent, and starts again on reload. An unknown cost reads "cost unavailable".
12. The gateway prices every answer from a versioned table: the paid fallback costs $0.10 per million input tokens and $0.50 per million output tokens.
13. The Author's machine answers first, at no marginal cost. A paid cloud model answers only when it can't, inside a $2 fallback sub-budget a day.
14. A real-time meter caps spend: $5 a day, $20 a month. At a ceiling, fixed messages replace the twin's answers until the Author resets it.
15. The sign's second line, "metered by the gateway · traced in Langfuse", says where its figures come from.

**In the web image**, the `Dockerfile`'s install stage, on which both of apps/web's builds stand, now copies `config/routing.yaml` and `config/prices.yaml` beside `config/budgets.yaml` (T041), so the image's build reads the same seven configuration files a checkout's does and fills hints 12 to 14 alike; `test/room/image-inputs.test.ts` holds it to that. This session has no container engine, so the built image's own hints are yours to read (For the Author).

## Verification on the merged tip (a9a4f09e)

Every check ran on a9a4f09e, the merge of `refs/heads/main` at b335b9b2, under Node 24.21.0, one at a time. The only difference in the working tree was this note's edits, uncommitted until the save point 158c4b60 during `make check`. Another branch's `make check` ran on the same machine, and the load average stood at 2 to 26 as the runs began and ended.

| Check | Result |
|---|---|
| `make lint` | exit 0 |
| `make test` | exit 2, the gateway's suite only. Two timing cases failed under a load average near 24: `test/integration/app.test.ts`'s graceful shutdown ("TypeError: fetch failed", ECONNRESET, the 50 ms race), and `test/integration/twin-paid-timeout.test.ts`'s D43 case (a 6 s paid delay that timed out at 25 s). Each file, run alone once right after and recorded as such, passed whole: 18 of 18, and 3 of 3. The web suite passed whole, 3,071 with 1 skipped. `make test` stops at npm's step, so its pytest step ran on its own: 4,101 passed |
| `make evals` | exit 0; the behavioral tier's WARN, an information line (spec 006 FR-002); docs links 0 failed, 1,931 in 279 files |
| `make check ENGINE_MODE=none-yet` | 11 PASS, 1 SKIP, 1 WARN, 1 FAIL; `failing: matrix FAIL`, on E10 and E14 alone, the environment's: E10's engine reset needs 22 GiB free on both drives to seed, and E14's dev-cpu ports on the host's 127.0.0.1 are out of the sandbox's reach (stage S). Its hook layer's line, `853 passed, 2 failed, 57 known gaps`, is as on 91593f6e. Its `test` stage passed whole, the two timing cases among them: the gateway 1,655 with 13 skipped, the web 3,071 with 1 skipped, and pytest 4,101. The WARN is the behavioral tier's information line, and the SKIP is the image stage's (no agents' engine yet, T046) |
| gitleaks on an export of this commit's tree | no leaks found, exit 0 (below) |
| The rehearsal of your steps, in a scratch clone | every case as expected, under `zsh -f` and `bash --noprofile --norc`: go on a candidate for this commit, after a clean gate and for a hand merge; no with one more changed file after the anchor, and in each failing case. The trial merge into `refs/heads/main` has no conflict (below) |

This branch changes no gateway source. Against `main` it changes two gateway test files, `test/integration/room-events.test.ts` and `test/unit/room-events-config.test.ts` (User Story 6), and neither failed.

### `make lint`, on a9a4f09e

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
478 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit: 0
```

`make lint` ran again on this commit's tree, after its last edit and before the commit: exit 0, with the same lines as above, 478 files formatted among them.

### `make test`, on a9a4f09e

Its result lines, every failure's lines, and the reruns; the whole output is in the session's log.

```text
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
 RUN  v5.0.3 /tmp/claude-1000/wt-feat012/services/gateway

 ❯ test/integration/twin-paid-timeout.test.ts (3 tests | 1 failed) 49824ms
   ❯ a twin turn's one 9 s attempt on a paid adapter (spec 007's plan, D43) (3)
     × answers a visitor's turn that the paid fallback takes 6 s over 25147ms
 ❯ test/integration/app.test.ts (18 tests | 1 failed) 73554ms
   ❯ graceful shutdown (1)
     × lets a request in flight finish, then closes both listeners and the store 5510ms

 FAIL  test/integration/app.test.ts > graceful shutdown > lets a request in flight finish, then closes both listeners and the store
TypeError: fetch failed
Caused by: Error: connect ECONNRESET 127.0.0.1:45331

 FAIL  test/integration/twin-paid-timeout.test.ts > a twin turn's one 9 s attempt on a paid adapter (spec 007's plan, D43) > answers a visitor's turn that the paid fallback takes 6 s over
Error: Test timed out in 25000ms.
 ❯ test/integration/twin-paid-timeout.test.ts:91:3

 Test Files  2 failed | 93 passed (95)
      Tests  2 failed | 1653 passed | 13 skipped (1668)
   Start at  07:41:28
   Duration  153.20s (tests 97%, import 2%, transform 1%)

npm error Lifecycle script `test` failed with error:
npm error workspace @h4reet/gateway@0.1.0

> @h4reet/web@0.1.0 test
 RUN  v5.0.3 /tmp/claude-1000/wt-feat012/apps/web

 Test Files  137 passed (137)
      Tests  3071 passed | 1 skipped (3072)
   Start at  07:44:02
   Duration  128.93s (tests 76%, import 23%, transform 1%)

make: *** [Makefile:246: test] Error 1
exit: 2

$ npx vitest run test/integration/app.test.ts    # in services/gateway, the file alone, once, at 07:46 (load 15.9)
 Test Files  1 passed (1)
      Tests  18 passed (18)
   Duration  15.09s (tests 94%, transform 3%, import 2%)
exit: 0

$ npx vitest run test/integration/twin-paid-timeout.test.ts    # in services/gateway, the file alone, once, at 07:47 (load 12.3)
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  24.81s (tests 97%, transform 2%, import 2%)
exit: 0

$ pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts    # make test's pytest step, on its own
4101 passed in 362.07s (0:06:02)
exit: 0
```

### `make evals`, on a9a4f09e

Every line but the 250 per-case PASS lines; the whole output is in the session's log.

```text
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
twin 00-profile engineer: 6 of 6 golden cases passed (100%; the bar is 5 of 6)
twin 00-profile non-engineer: 6 of 6 golden cases passed (100%; the bar is 5 of 6)
twin 01-ai-strategy-and-cht engineer: 18 of 18 golden cases passed (100%; the bar is 17 of 18)
twin 01-ai-strategy-and-cht non-engineer: 18 of 18 golden cases passed (100%; the bar is 17 of 18)
twin 02-production-infrastructure-national-scale engineer: 5 of 5 golden cases passed (100%; the bar is 4 of 5)
twin 02-production-infrastructure-national-scale non-engineer: 5 of 5 golden cases passed (100%; the bar is 4 of 5)
twin 03-grants-and-credits engineer: 2 of 2 golden cases passed (100%; the bar is 1 of 2)
twin 03-grants-and-credits non-engineer: 2 of 2 golden cases passed (100%; the bar is 1 of 2)
twin 04-hobbies-and-travel engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
twin 04-hobbies-and-travel non-engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
twin 05-mission engineer: 7 of 7 golden cases passed (100%; the bar is 6 of 7)
twin 05-mission non-engineer: 7 of 7 golden cases passed (100%; the bar is 6 of 7)
twin 06-work-projects engineer: 7 of 7 golden cases passed (100%; the bar is 6 of 7)
twin 06-work-projects non-engineer: 7 of 7 golden cases passed (100%; the bar is 6 of 7)
twin 07-denver-local-ai engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
twin 07-denver-local-ai non-engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
twin 08-hareet-ai engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
twin 08-hareet-ai non-engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
evals product (fake): 187 passed, 0 failed
INFO (twin readiness): hobbies-and-travel: ready, its evidence at the running hashes
INFO (twin readiness): mission: ready, its evidence at the running hashes
INFO (twin readiness): work-projects: ready, its evidence at the running hashes
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite narration --adapter fake
evals narration (fake): 44 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
agent-config static: 0 failed, 0 planned
tier=0; python3 -I -B -X pycache_prefix=/dev/null evals/behavioral_line.py || tier=$?; python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py && exit $tier
behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 05cec03a74a5
WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
agent-config behavioral: fail, 0 planned
note: the behavioral tier's line is information in make evals, not a merge block (spec 006 FR-002): the gate's agent-config-evals step waits for a run only for a branch that changes CLAUDE.md, REVIEW.md, .claude/, or the Claude Code pin
docs links: 0 failed, 1931 relative links in 279 files
exit: 0
```

### `make check ENGINE_MODE=none-yet`, on a9a4f09e's tree

It ran from 07:55 to 08:07. The save point 158c4b60, this note in progress, was committed during the run, two minutes in, from the working tree it checked, so its `secrets` and `arrival` stages counted 43 commits since `main`, the save point among them.

Its summary, every stage's line.

```text
PASS     makefiles-check
PASS     githooks-check
PASS     toolchain-check
PASS     policy
PASS     validate-config
PASS     lint
PASS     test
PASS     content-check
PASS     secrets
PASS     arrival
WARN     evals  WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
PASS     redteam
FAIL     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL
make: *** [Makefile:159: check] Error 1
exit: 2

The test stage's totals:
      Tests  1655 passed | 13 skipped (1668)
      Tests  3071 passed | 1 skipped (3072)
4101 passed in 316.78s (0:05:16)

The matrix's failing rows and its hook layer's line:
E10  FAIL  (from prove-limits.sh): E10   FAIL engine.sh reset leaves a new engine holding only the seeded images -- seen: engine.sh reset failed: engine.sh: not enough free space to seed: need 22 GiB on both the Windows drive and ext4; 19 of the 19 seeded images are missing
E14  FAIL  (from prove-limits.sh): E14   FAIL dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18305); no answer on 18300 18301 18302 18303 18304 18305; the sandbox cannot reach them (stage S)
forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps

The secrets and arrival stages' lines:
-> PASS 43 commits since main (b335b9b2ff7f..HEAD)
arrival-check: 0 findings in 210 files (43 commits)
```

### gitleaks on a fresh export of this commit's tree

A `git archive` export of the staged tree, this note included, went into a new, empty folder and was scanned from inside it, as the gate's gitleaks-tree step scans:
- with `main`'s `.gitleaks.toml`, which this branch doesn't change, kept outside the export;
- with a fresh empty folder as the ignore path, so no `.gitleaksignore` entry applies;
- with `--ignore-gitleaks-allow`, so no inline allow applies either.

The tree scanned held this note as it is, but for this block's and the rehearsal's outputs, which were filled in after it. The session scanned the final tree again before the commit, with the same result.

```text
export of bca42a9e2344b04d1f5fe699c75ecc0e2614e3c7 (staged tree) into a new folder: 1985 files
v8.30.1
8:09AM INF scanned ~52692618 bytes (52.69 MB) in 1.67s
8:09AM INF no leaks found
exit=0
report: []
```

### The rehearsal of your steps, in a scratch clone

The rehearsal ran in a bare clone under `$TMPDIR` (`git clone --bare --shared`), which reads the repository's objects and writes nothing to it. It ran against the real `refs/heads/main`, b335b9b2, and a candidate for this commit: this commit's tree, but for this block's and gitleaks' outputs, on 158c4b60. The clone's own scratch refs are:
- `rehearse/extra`: one more file, `apps/web/src/extra-after-anchor.ts`;
- `rehearse/readme`: one more line in the index;
- `rehearse/notes`: a line added to this note;
- `rehearse/premerge`: 0e5f5b44, the tip before the merge of b335b9b2.

Each case runs the note's own blocks, extracted from this file, over a gate log made for it: 2a or 2b, then 2c, under `zsh -f` and under `bash --noprofile --norc`. The gate logs' FAIL lines copy vitest's own, as fix/007's note recorded them. 2c's two HEAD lines are left out in every case but the last, because the bash gate refused pointing the clone's HEAD at `main` (For the Author, the refusals). In the last case the whole guard ran, and the clone's HEAD, `wip-park/11-9-2026`, gave no.

```text
zsh  clean ok    guard: go     63e82340: the tip, a clean gate
zsh  hand  ok    guard: go     63e82340: the tip, a hand merge
zsh  clean ok    guard: no     63e82340: a clean form on a failing summary, with a stray merge line
zsh  clean ok    guard: no     63e82340: a clean form with no merge line
zsh  hand  ok    guard: no     63e82340: a hand form on a clean gate
zsh  hand  ok    guard: no     63e82340: a hand form, test and matrix-h failing
zsh  hand  ok    guard: no     63e82340: a hand form, two FAIL lines
zsh  hand  ok    guard: no     63e82340: a hand form, one FAIL line in another file
zsh  clean ok    guard: no     63e82340: the branch moved after the gate
zsh  clean ok    guard: no     9f374c30: one more changed file after the anchor, clean
zsh  hand  ok    guard: no     9f374c30: one more changed file after the anchor, hand
zsh  clean ok    guard: no     55ac97a3: one more line in the index
zsh  clean ok    guard: go     8fe75a6b: a change to this note alone
zsh  clean ok    guard: no     0e5f5b44: the tip before the merge of main
zsh  clean ok    guard: no     63e82340: the whole guard, HEAD not on main
bash clean ok    guard: go     63e82340: the tip, a clean gate
bash hand  ok    guard: go     63e82340: the tip, a hand merge
bash clean ok    guard: no     63e82340: a clean form on a failing summary, with a stray merge line
bash clean ok    guard: no     63e82340: a clean form with no merge line
bash hand  ok    guard: no     63e82340: a hand form on a clean gate
bash hand  ok    guard: no     63e82340: a hand form, test and matrix-h failing
bash hand  ok    guard: no     63e82340: a hand form, two FAIL lines
bash hand  ok    guard: no     63e82340: a hand form, one FAIL line in another file
bash clean ok    guard: no     63e82340: the branch moved after the gate
bash clean ok    guard: no     9f374c30: one more changed file after the anchor, clean
bash hand  ok    guard: no     9f374c30: one more changed file after the anchor, hand
bash clean ok    guard: no     55ac97a3: one more line in the index
bash clean ok    guard: go     8fe75a6b: a change to this note alone
bash clean ok    guard: no     0e5f5b44: the tip before the merge of main
bash clean ok    guard: no     63e82340: the whole guard, HEAD not on main
rehearsal: every case as expected
```

The merge forms, 3a and 3b, ran under both shells with `git` replaced by a function that prints each argument in brackets, so nothing merged. With `ok=no`, neither form runs anything:

```text
== zsh, 3a, ok=go
[--no-replace-objects]
[merge]
[--no-ff]
[-m]
[Merge feat/012-loading-screen (63e82340b309)]
[-m]
[gate: 63e82340b309c6a9a2e62a53ea5f172bb57e3d85 (feat/012-loading-screen) by tools/gates/gate at b335b9b2ff7f: 20 PASS, 3 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 0 FAIL]
[63e82340b309c6a9a2e62a53ea5f172bb57e3d85]
(end, exit 0)
== zsh, 3b, ok=go
[--no-replace-objects]
[merge]
[--no-ff]
[-m]
[Merge feat/012-loading-screen (63e82340b309) by hand]
[-m]
[gate: 63e82340b309c6a9a2e62a53ea5f172bb57e3d85 (feat/012-loading-screen) by tools/gates/gate at b335b9b2ff7f: 19 PASS, 3 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: test FAIL]
[-m]
[test: app.test.ts shutdown race (50 ms) under load; no gateway source here, pytest 4101]
[63e82340b309c6a9a2e62a53ea5f172bb57e3d85]
(end, exit 0)
== zsh, 3a, ok=no
(end, exit 1)
== zsh, 3b, ok=no
(end, exit 1)
(bash --noprofile --norc printed the same lines, byte for byte)
```

The trial merge of this commit's candidate into `refs/heads/main`:

```text
$ git merge-tree --write-tree --name-only refs/heads/main 63e82340b309c6a9a2e62a53ea5f172bb57e3d85
bca42a9e2344b04d1f5fe699c75ecc0e2614e3c7
exit: 0
the candidate's tree: bca42a9e2344b04d1f5fe699c75ecc0e2614e3c7
refs/heads/main (b335b9b2) is an ancestor of the candidate, so a --no-ff merge's tree is the candidate's own
```

## Verification on the post-fix tip (91593f6e, T033)

Every check ran on the post-fix tip, 91593f6e, under Node 24.21.0, one at a time, while other branches' checks ran on the same machine (its load average stood at 2 to 27).

|                                                         | At the base (b906c5e7)              | At 91593f6e                                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The entry chunk and its CSS, gzipped                    | 41,723 bytes (JS 37,377, CSS 4,346) | 46,021 bytes (JS 41,068, CSS 4,953): +4,298, within the plan's 8 KB, of 153,600                                                                          |
| The index, serialized, gzip level 9                     | 5,196 bytes                         | 6,221 bytes: +1,025, of 16,384 (R-11); `test/room/chunk.test.ts`'s own assertions pass                                                                   |
| `npm run room:check`                                    | 0 findings                          | 0 findings, the hints' strict rules among them                                                                                                           |
| `package-lock.json`, every `package.json`               |                                     | unchanged (FR-045)                                                                                                                                       |
| `apps/web/nginx.conf`, the compose files, `deploy/env*` |                                     | unchanged (FR-052, FR-053); `deploy/` gains the dashboard's panel and its test's case; the `Dockerfile` gains the two configuration files' copies (T041) |

**What failed, and whose it is.**

- `make test`: the web suite's one failure was `test/lookdev/candidate.test.ts`'s 80-variant case, a timeout (62.5 s against its 60 s) while the machine ran other branches' checks. That file alone passed whole (18), and the case alone took about 30 s. Its compose runs over fixture trees that hold no hints file, so nothing this branch adds runs for it but two empty checks. The gateway's suite passed whole, its timing tests among them. `make test` stops at the web suite, so its pytest step ran on its own: 4,101 passed.
- `make evals`: exit 0. Its one line short of a pass is the behavioral tier's WARN, an information line in `make evals` (spec 006 FR-002): the newest run for the agent config's trigger hash is `feat/011`'s, and this branch changes none of the agent config, so the gate's step doesn't wait on one.
- `make check ENGINE_MODE=none-yet`: 11 PASS, 1 SKIP, 1 WARN, 1 FAIL. The matrix failed E10 and E14 alone, for the environment, as on the switch's note: E10's engine reset needs 22 GiB free on both drives to seed, and E14's dev-cpu ports on the host's 127.0.0.1 are out of the sandbox's reach (stage S). Its hook layer's line, `853 passed, 2 failed, 57 known gaps`, is the switch's own. The WARN is the behavioral tier's line above, and the SKIP is the image stage's (no agents' engine yet, T046). Its test stage passed whole, the candidate case among them: the gateway 1,655 passed with 13 skipped, the web 3,071 passed with 1 skipped, and pytest 4,101.

**One figure for the entry chunk** (the review's N5). The entry chunk grew 4,298 bytes, compressed, against the base, measured on 91593f6e. That figure counts this branch's code and whatever the merge of `refs/heads/main` at d0fac811 brought to the entry. The note's earlier figures were steps on the way: +4,221 before the merge, then +4,253 before T037's fixes, which add 45 bytes. The acceptance table and the cost section now say +4,298 too.

### `make lint`

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
476 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit: 0
```

### `make test`

Its three suites' totals, with every failure's line; the whole output is in the session's log.

```text
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run

 RUN  v5.0.3 /tmp/claude-1000/wt-feat012/services/gateway

 Test Files  95 passed (95)
      Tests  1655 passed | 13 skipped (1668)
   Start at  00:21:56
   Duration  105.24s (tests 96%, import 3%, transform 1%)

> @h4reet/web@0.1.0 test
> vitest run

 RUN  v5.0.3 /tmp/claude-1000/wt-feat012/apps/web

 ❯ test/lookdev/candidate.test.ts (18 tests | 1 failed) 121675ms
   ❯ a candidate's findings and measures are compose()'s for the same bytes and piece (FR-068) (4)
     × every variant of test/helpers/glb.ts gets compose()'s findings, in its order, `candidate` for the file 62544ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/lookdev/candidate.test.ts > a candidate's findings and measures are compose()'s for the same bytes and piece (FR-068) > every variant of test/helpers/glb.ts gets compose()'s findings, in its order, `candidate` for the file
Error: Test timed out in 60000ms.
  ❯ test/lookdev/candidate.test.ts:161:3

 Test Files  1 failed | 136 passed (137)
      Tests  1 failed | 3070 passed | 1 skipped (3072)
   Start at  00:23:34
   Duration  158.29s (tests 75%, import 21%, transform 4%)

npm error Lifecycle script `test` failed with error:
npm error code 1
npm error path /tmp/claude-1000/wt-feat012/apps/web
npm error workspace @h4reet/web@0.1.0
npm error location /tmp/claude-1000/wt-feat012/apps/web
npm error command failed
npm error command sh -c vitest run
make: *** [Makefile:246: test] Error 1
exit: 2

$ npx vitest run test/lookdev/candidate.test.ts    # the timed-out file alone, after
 Test Files  1 passed (1)
      Tests  18 passed (18)
   Duration  81.94s (tests 98%, transform 1%, import 1%)
exit: 0

$ pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts    # make test's pytest step, on its own
4101 passed in 340.15s (0:05:40)
exit: 0
```

### `make evals`

Every line but the 250 per-case PASS lines; the whole output is in the session's log.

```text
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
twin 00-profile engineer: 6 of 6 golden cases passed (100%; the bar is 5 of 6)
twin 00-profile non-engineer: 6 of 6 golden cases passed (100%; the bar is 5 of 6)
twin 01-ai-strategy-and-cht engineer: 18 of 18 golden cases passed (100%; the bar is 17 of 18)
twin 01-ai-strategy-and-cht non-engineer: 18 of 18 golden cases passed (100%; the bar is 17 of 18)
twin 02-production-infrastructure-national-scale engineer: 5 of 5 golden cases passed (100%; the bar is 4 of 5)
twin 02-production-infrastructure-national-scale non-engineer: 5 of 5 golden cases passed (100%; the bar is 4 of 5)
twin 03-grants-and-credits engineer: 2 of 2 golden cases passed (100%; the bar is 1 of 2)
twin 03-grants-and-credits non-engineer: 2 of 2 golden cases passed (100%; the bar is 1 of 2)
twin 04-hobbies-and-travel engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
twin 04-hobbies-and-travel non-engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
twin 05-mission engineer: 7 of 7 golden cases passed (100%; the bar is 6 of 7)
twin 05-mission non-engineer: 7 of 7 golden cases passed (100%; the bar is 6 of 7)
twin 06-work-projects engineer: 7 of 7 golden cases passed (100%; the bar is 6 of 7)
twin 06-work-projects non-engineer: 7 of 7 golden cases passed (100%; the bar is 6 of 7)
twin 07-denver-local-ai engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
twin 07-denver-local-ai non-engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
twin 08-hareet-ai engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
twin 08-hareet-ai non-engineer: 8 of 8 golden cases passed (100%; the bar is 7 of 8)
evals product (fake): 187 passed, 0 failed
INFO (twin readiness): hobbies-and-travel: ready, its evidence at the running hashes
INFO (twin readiness): mission: ready, its evidence at the running hashes
INFO (twin readiness): work-projects: ready, its evidence at the running hashes
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite narration --adapter fake
evals narration (fake): 44 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
agent-config static: 0 failed, 0 planned
tier=0; python3 -I -B -X pycache_prefix=/dev/null evals/behavioral_line.py || tier=$?; python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py && exit $tier
behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 05cec03a74a5
WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
agent-config behavioral: fail, 0 planned
note: the behavioral tier's line is information in make evals, not a merge block (spec 006 FR-002): the gate's agent-config-evals step waits for a run only for a branch that changes CLAUDE.md, REVIEW.md, .claude/, or the Claude Code pin
docs links: 0 failed, 1919 relative links in 277 files
exit: 0
```

### `make check ENGINE_MODE=none-yet`

Its summary, every stage's line.

```text
PASS     makefiles-check
PASS     githooks-check
PASS     toolchain-check
PASS     policy
PASS     validate-config
PASS     lint
PASS     test
PASS     content-check
PASS     secrets
PASS     arrival
WARN     evals  WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
PASS     redteam
FAIL     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL
make: *** [Makefile:159: check] Error 1
exit: 2

The test stage's totals:
      Tests  1655 passed | 13 skipped (1668)
      Tests  3071 passed | 1 skipped (3072)
4101 passed in 398.42s (0:06:38)

The matrix's failing rows and its hook layer's line:
E10  FAIL  (from prove-limits.sh): E10   FAIL engine.sh reset leaves a new engine holding only the seeded images -- seen: engine.sh reset failed: engine.sh: not enough free space to seed: need 22 GiB on both the Windows drive and ext4; 19 of the 19 seeded images are missing
E14  FAIL  (from prove-limits.sh): E14   FAIL dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18305); no answer on 18300 18301 18302 18303 18304 18305; the sandbox cannot reach them (stage S)
forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps
```

### gitleaks on a fresh export

A `git archive` export of the post-fix tip into a new, empty folder, scanned from inside it, as the gate scans, with the export's own `.gitleaks.toml`, an empty folder as the ignore path, and `--ignore-gitleaks-allow`.

```text
export of 91593f6e77e487f3ce9724ca11f3c220a8874b2d into a new folder: 1982 files
v8.30.1
12:48AM INF scanned ~52350526 bytes (52.35 MB) in 1.66s
12:48AM INF no leaks found
exit=0
```

### The rehearsal into `refs/heads/main`

`git merge-tree` against `refs/heads/main`, which writes no worktree, and the guard's tree comparison with `rv` at 91593f6e, as 0e5f5b44's step 2 made it, before the merge of b335b9b2. Run on 91593f6e itself, nothing differed. The guard as it is now is rehearsed under "Verification on the merged tip".

```text
$ git merge-tree --write-tree --name-only refs/heads/main 91593f6e77e487f3ce9724ca11f3c220a8874b2d
92b1fc19498485b44fe1dc7902d852a9d3f5fb88 (exit 0)
tip tree: 92b1fc19498485b44fe1dc7902d852a9d3f5fb88
main: d0fac811ca297a6d9ead42022043d8a12fb4418e
main is an ancestor of the tip: a --no-ff merge's tree is the tip's
expected tree (main merged with rv 91593f6e77e487f3ce9724ca11f3c220a8874b2d): 92b1fc19498485b44fe1dc7902d852a9d3f5fb88
guard's tree comparison (rv=91593f6e77e487f3ce9724ca11f3c220a8874b2d) on 91593f6e77e487f3ce9724ca11f3c220a8874b2d: go
what differs between rv's merge and the tip, all paths:
```

## Cost and data-flow impact

$0 in the cloud. No new file, request, or transfer: the loader watches the loads the room already makes. At most one `loading_cut_short` beacon a visit cut short at the ceiling, about 30 bytes of body, on spec 002's existing flow, with row V4's trigger in the same commit (793b44ca). On the visitor's device, the same parsing as before, done while the loader shows rather than after the hand-off; the entry chunk grew 4,298 bytes, compressed, against the base (Verification on the post-fix tip, its one figure; the merge of b335b9b2 changed no code).

## For the Author

**The web image's hints** (T041's check, which this session can't run). One read of a built web image returns hints 12 to 14 from its entry chunk and nothing else. Put the image's tag in `I` first; the angle brackets are a placeholder, in quotes so the line parses. Two images qualify:
- The gate tags its build `h4reet-web:<the gated SHA>`, on the agents' engine (`tools/gates/gate` lines 1500 to 1504 and 1549).
- After step 4, `make up ENV=prod` tags prod's `h4reet-web:<the commit it started>`, on your host's engine, with main's policy (`deploy/scripts/web_image.py` line 301).

```bash
I='h4reet-web:<tag>'
P='per million|sub-budget|caps spend'
docker run --rm --entrypoint sh "$I" -c \
  "grep -ohE '[^\"]*($P)[^\"]*' \
  /usr/share/nginx/html/assets/*.js"
```

Expected: the three lines of hints 12 to 14 above, figures included.

**Where things stand.** `feat/005-full-window-room` is on `main` (b335b9b2), and this branch has merged that `main` (a9a4f09e). If `main` moves again before your gate, the guard says no at its first ancestry line: tell the session, which merges `refs/heads/main` here again and checks it. Every block runs from main's checkout. Each line is 45 characters or fewer, every `git switch` is `git --no-replace-objects switch`, and no block holds a comment or a `!` inside double quotes, so each pastes as it is into an interactive zsh, which reads `#` as a word and `!` as history.

**1. The gate** (T038). It runs without `--prove` and without the behavioral tier:
- Stage E (matrix-e) runs only when a branch touches `deploy/agents-engine/` or `.claude/settings.json` (`tools/gates/gate` line 88, `STAGE_E_PATHS` at line 199, and the filter at line 1621).
- The behavioral tier (agent-config-evals) runs only when a branch touches `CLAUDE.md`, `REVIEW.md`, `.claude/`, or the Claude Code pin (line 90, and the filter at line 1661).

Against `refs/heads/main` this branch touches none of them. The gate exits 2 unless your checkout is on `main` (line 14, and lines 468 to 472). Your checkout is parked, so the block starts by switching back:

```bash
git --no-replace-objects switch main
b=feat/012-loading-screen
log=~/gate-012.log
tools/gates/gate "$b" 2>&1 | tee "$log"
```

Expect Ready, with `evals` WARN for the behavioral tier's information line, as `make check` printed it (Verification on the merged tip). If its summary ends `failing: test FAIL` and names nothing else, see step 2's second form. With any other failure, don't merge: tell the session.

**2. The guard.** Its first part has two forms; run the one that fits the gate's result, then the rest, which is the same for both.

**2a. After a clean gate**, one that printed Ready and its `merge: ` line:

```bash
s=$(grep '^gate: ' "$log" | tail -n 1)
sha=$(printf '%s\n' "$s" | awk '{print $2}')
ok=go
case $s in *failing:*) ok=no;; esac
grep -q '^merge: ' "$log" || ok=no
```

The `case` line says no if the gate's summary names any failure: the log holds the container's output too, and a line from it could start with `merge: `.

**2b. Or, for a hand merge.** Use this only when the gate's sole failure is `failing: test FAIL`, and its log has exactly one `FAIL .*test\.ts` line, the gateway's graceful-shutdown case in `app.test.ts`. That case gives a request 50 ms to reach its handler before the server closes, and it fails under load (Verification on the merged tip). This branch changes no gateway source.

```bash
s=$(grep '^gate: ' "$log" | tail -n 1)
sha=$(printf '%s\n' "$s" | awk '{print $2}')
ok=go
k='; failing: test FAIL$'
printf '%s\n' "$s" | grep -q "$k" || ok=no
q='FAIL .*test\.ts'
n=$(grep -c "$q" "$log")
[ "$n" = 1 ] || ok=no
a='app\.test\.ts > graceful shutdown'
grep "$q" "$log" | grep -q "$a" || ok=no
```

- The summary must end `; failing: test FAIL`, so any other failing step, `matrix-h` or `image` among them, says no.
- The log must hold one `FAIL .*test\.ts` line, and only one. A second failed case anywhere in the suites says no. npm runs the web suite even after the gateway's fails, so the web suite's lines are in the log too.
- The one line must name the case as well as the file: `app.test.ts > graceful shutdown`, as vitest prints it. The gate's container has no terminal, so vitest adds no colour codes (`tools/gates/gate` lines 804 to 826, a `docker run` without `-t`).

**2c. Then, after either form, the rest.** It prints `guard: go` only if all of these hold:
- the first part held;
- your checkout is on `main`;
- the branch is at the SHA the gate checked;
- `main` is an ancestor of that SHA;
- the reviewed and fixed content, 91593f6e, is an ancestor of that SHA;
- that SHA's tree is `main` merged with 91593f6e, with nothing different outside `docs/merge-requests/` and `docs/adr/README.md`;
- that SHA's `docs/adr/README.md` is `main`'s with one line added, 91593f6e's 0045 row.

```bash
h=$(git symbolic-ref -q HEAD)
[ "$h" = refs/heads/main ] || ok=no
t=$(git rev-parse --verify "refs/heads/$b")
[ "$t" = "$sha" ] || ok=no
mr=refs/heads/main
anc=(merge-base --is-ancestor)
git "${anc[@]}" "$mr" "$sha" || ok=no
rv=91593f6e77e487f3ce9724ca11f3c220a8874b2d
git "${anc[@]}" "$rv" "$sha" || ok=no
mt=(merge-tree --write-tree "$mr" "$rv")
e=$(git "${mt[@]}" | head -n 1)
[ -n "$e" ] || ok=no
f=docs/adr/README.md
x=(diff --quiet "$e" "$sha" --)
x+=(':!docs/merge-requests' ":(exclude)$f")
git "${x[@]}" || ok=no
r=$(git show "$rv:$f" | grep -F '[0045](')
o=(show "$mr:$f")
p=(show "$sha:$f")
d=$(diff <(git "${o[@]}") <(git "${p[@]}"))
d=$(printf '%s\n' "$d" | grep '^[<>]')
[ "$d" = "> $r" ] || ok=no
echo "guard: $ok"
```

**Why `rv` is 91593f6e, and why the guard compares against a merge-tree.** The review read 4989cb5c. T037's fixes end at 91593f6e, the content the review and its fixes settled. After it, the branch changes only this note and, through the merge of `main`, the ADR index. A plain diff of `$rv` against `$sha` would show every change `main` gained after 91593f6e and say no. So the guard builds the tree that `main` and 91593f6e would merge to (`git merge-tree --write-tree`, which writes no worktree), and requires the gated SHA to equal it but for the notes and the index.

**Why the index's row is checked on its own.** Against `main` b335b9b2, 91593f6e and `main` conflict in `docs/adr/README.md`: each adds a row after 0043. So `git merge-tree` exits 1 and writes that file with conflict markers. The guard takes the tree's ID from its first line all the same, and leaves that one file out of the comparison. Any other conflict would still differ from the gated SHA and say no. It then checks the index by itself: `main`'s file with exactly one line added, 91593f6e's 0045 row. That is the resolution in a9a4f09e, both rows kept. The index is excluded with `:(exclude)`, git's long form of `:!`, because it sits in double quotes beside `$f`, where an interactive zsh would read `!$` as history. The folder's `:!` is in single quotes, where neither shell does.

**What the rehearsal showed** (Verification on the merged tip): every line of 2a, 2b, and 2c but the two that read HEAD gave go on this commit, under `zsh -f` and under `bash --noprofile --norc`. They gave no on a commit with one more changed file after the anchor, and on each failing case below. On `guard: no`, don't merge: tell the session.

**3. The merge, only after `guard: go`.**

**3a. After 2a (a clean gate)**, the gate's merge line rebuilt from its log (`tools/gates/gate` lines 1958 to 1962):

```bash
m="Merge $b (${sha:0:12})"
o=(--no-replace-objects merge --no-ff)
o+=(-m "$m" -m "$s" "$sha")
[ "$ok" = go ] && git "${o[@]}"
```

**3b. Or, after 2b (a hand merge)**, the same merge "by hand", with a third paragraph that records the reason and this session's passing pytest count. The gate's `make test` stops after npm's step fails, so pytest never runs there:

```bash
m="Merge $b (${sha:0:12}) by hand"
w='test: app.test.ts shutdown race (50 ms)'
w="$w under load; no gateway source here,"
w="$w pytest 4101"
o=(--no-replace-objects merge --no-ff)
o+=(-m "$m" -m "$s" -m "$w" "$sha")
[ "$ok" = go ] && git "${o[@]}"
```

That is the shape of c01545ce, `docs/001-ec2-default`'s hand merge. 4101 is this session's pytest count on a9a4f09e's tree, in `make test`'s pytest step run on its own and again in `make check`'s test stage (Verification on the merged tip).

**4. The room on main.** Bring it up as you do, from main's checkout after the merge:

```bash
git symbolic-ref HEAD
make up ENV=prod
```

**5. Your look and your runs, after the merge** (T039, in one batch):

- **The browsers** (PD-4, R-1): in desktop Chrome, Firefox, and Safari, and Android's Chrome, with the network throttled in the developer tools, whether the bar moves only as whole files end (expected), or within one.
- **The screen readers** (plan §6.1): what NVDA, JAWS, and VoiceOver say when the loader shows, as the bar's value changes, and as each hint appears. Expected: "Loading the room" once, each hint once, and no running count.
- **A keyboard-only run and a screen-reader run** (SC-006), on a wide window, a phone held upright, and the stacked layout (a 400% zoom): each hears or sees that the room is loading, reads its percentage and stage, reads every hint by its controls, and lands on the room's heading when it gives way, unaided and never trapped.
- **Reflow and text size** (SC-006): at 400% zoom on a 1280 × 1024 window and at 200% text on a phone-sized window, nothing on the card clipped or overlapping, the page scrolling only vertically.
- **"Pause hints" by mouse and by touch** (the review's I-1): one click, and on a phone one tap, pauses the hints and the control reads "Play hints"; Tab into the controls stops them too.
- **Hint 15's "Langfuse"** (the review's N2; spec.md's Amendment L12): the loader's card quotes the neon sign's second line, "metered by the gateway · traced in Langfuse", as plain text, where spec 004's FR-049 and `REVIEW.md` name the sign alone. You approved the copy as written; if you'd rather the name stay on the sign, hint 15 is one line in `apps/web/room/hints.yaml` to reword or remove, and `REVIEW.md`'s list is yours to extend.
- **The look** (SC-010): enter once with the network throttled and once without; watch the bar fill and the room come together behind it, still; read the hints, pause them, and step through them; try a phone held upright. A yes or a no for each in a follow-up note; a change to the look is a new intent.

**6. Park off `main` again** when you step away:

```bash
p=wip-park/11-9-2026
git --no-replace-objects switch -C "$p"
```

**One stale row on `main`, yours to change.** `docs/adr/README.md` on `main` still lists ADR 0044 as "proposed", where the ADR's own status line has read "accepted" since your 67028747. This branch keeps `main`'s row as it is, since the guard requires the merged index to be `main`'s plus the 0045 row alone.

**The refusals this session met.** On 2026-11-10, while rehearsing the guard, the bash gate refused one command: `git symbolic-ref HEAD refs/heads/main`, run in the scratch clone under `$TMPDIR` to point that clone's HEAD at `main`, with "Blocked by .claude/hooks/bash-gate.sh — pointing HEAD at main. Route: work on a feature branch (git switch -c <branch>); only the Author changes main" (`.claude/audit/hooks.log`, 2026-11-10T14:42:56Z). It wasn't respelled, and HEAD wasn't set any other way. So the rehearsal ran every line of the guard but the two that read HEAD. Those two ran only as a whole guard, where the clone's HEAD, `wip-park/11-9-2026`, gave no, as it should; their go on `main` is yours, in step 2c. Earlier, the bash gate refused several commits while the main checkout was on `main` (the Author's gate). As the brief directs, the session kept working and committed later, in order, never in another form. One commit made in a burst afterwards took the wrong message (the refused command's message file had never been written); it was amended at once, before anything built on it. Later, while it refused the User Story 6 commit, one attempt left out a patch file's removal, to rule out `git rm` as the trigger; it was refused all the same, so the patch files stay beside this note as the record of the held work, and no other form was tried. And `tasks.md` keeps T033, T036, and T037 unticked: they are done, as this note records, but the guard lets only this note change after 91593f6e, so their ticks wait for the next change that moves the anchor. The merge of `main` at b335b9b2 didn't move it (its one resolution is the index's, which the guard checks on its own), so this note stays their record, and their ticks can go with your merge or the next change to the anchor.

## T001: the base, the outside facts, and the numbers

**The base.** `git rev-parse HEAD` at T001 read b906c5e70709e9e10e88e9109cf0afd945c80c7a, T000's commit on b0bd247e (the spec's two commits, 0e86a99b and b0bd247e) on `feat/005-full-window-room` at af82c6c5. `refs/heads/main` was f76ead549a76649e7c3c49eeb56a71c98f4e9a8e (`Merge fix/007-steady-clock-test (40624d2df922) by hand`). The main session cut the branch; it travels with the spec's documents at its base, so one gate covers both. `npm ci --cache "$TMPDIR/npm-cache-feat012"` ran under Node 24.21.0, the toolchain's pin (a first run under the shell's Node 22.18.0 was redone under the pin).

**Spec 005's rules that plan R-10 lists**, re-read at the base, which is af82c6c5 itself: nothing moved. `notesReserve` and `--notes-h` (`compose/hud.ts`, `layout.ts`'s `applyHud`, `room.css`'s sheets); the measured strip (`metrics.strip`; the strip's `min-height: var(--strip-h)`), which `--clear-y` follows; the HUD's yellow ring on `input` (`html[data-hud=…] .hud-glass input:focus-visible`); the `:root[data-blur]` and `:root[data-hud]` fallbacks; Tab not reaching undrawn controls; the stacked grid (`.room-block` and `.hud-panels` as `display: contents`; the portrait template `"toolbar" "stage" "list" "talk" "around" "resume"` and the landscape one under `(orientation: landscape) and (min-width: 32rem)`); and the refit log's buffer entry. No departure from PD-10.

**`fix/007-image-readiness`** (b0fa1d73 at T001): not in the base, and not in `refs/heads/main`. Its test is `apps/web/test/room/image-inputs.test.ts`; the list it holds the `Dockerfile` to is that file's own constant, `INPUTS`, built from `build/room/readiness.ts`'s exported names (`READINESS_PATH`, `PACK_FILE`, `PROMPT_FILE`, `LINES_FILE`, `BUDGETS_FILE`). `BUDGETS_FILE` is already among them, so T041 adds `ROUTING_FILE` and `PRICES_FILE`. T041 waits for that branch to reach `refs/heads/main` (plan PD-21, R-4).

**The next free ADR number**, read across every `refs/heads/*`: 0045. 0044 is `docs/001-ec2-default`'s (`docs/adr/0044-ec2-as-prods-default-host.md`); no branch holds 0045 or 0046. As D10 expects; no departure from PD-17.

**The numbers at the base** (b906c5e7's code, which is af82c6c5's):
- **The entry chunk**: the release build's entry, `assets/index-CZStXwyk.js`, 37,377 bytes gzipped, and its one stylesheet 4,346 bytes: 41,723 bytes of the 153,600-byte budget, measured as `test/room/chunk.test.ts` measures it (the entry's static graph and the page's stylesheets, gzipped), with a scratch script outside the repository over a release build under an empty policy directory.
- **The index**: 5,196 bytes, serialized and gzipped at level 9 as `test/room/chunk.test.ts` measures it, of its 16,384 (R-11).
- **`npm run room:check`**: "room: 0 findings in 0 files", 2.8 s wall.

The browsers' and the screen readers' facts (plan §6.1, PD-4) are the Author's, in T039's checklist.
