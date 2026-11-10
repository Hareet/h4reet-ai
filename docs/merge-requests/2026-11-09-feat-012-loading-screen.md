# feat/012-loading-screen

Spec: specs/012-loading-screen/ · Intent: specs/012-loading-screen/intent.md · Written by: implementer (an agent session) · Date: 2026-11-09
Session: /home/h4reet/h4reet-ai/h4reet-ai, working in the worktree /tmp/claude-1000/wt-feat012 · Repo hooks active: the session's hooks; the worktree's commits ran the repository's git hooks (gitleaks and the arrival check print on each commit)
Authorized by: the spec and the plan, approved by the Author on 2026-11-09 as taken (tasks.md T000, recorded in his words)

## Status

**Not ready to merge: the review and the full checks are still to come.** The branch is stacked on `feat/005-full-window-room`: it was cut at `spec/012-loading-screen-r2`'s tip, b0bd247e, which sits on `feat/005-full-window-room` at af82c6c5, the reviewed full-window room. So `feat/005-full-window-room` merges first, and this branch after it. The branch has merged `refs/heads/main` at d0fac811 (034215bc), as the main session directed, which brings gate 1 (the avatars and the timing fix), gate 1b (`fix/007-image-readiness`), and gate 2 (the Anthropic switch). The Author's steps come with the final note.

- **Built, test-first:** T000 to T032 and T034, and T041 after the merge. Every story is in.
- **User Story 6, landed:** the main session confirmed that `config/room-events.yaml` is generated and not protected, so T030 and T031 (793b44ca) and T032 (6cea0c5d) applied the two held patches, the first regenerating that file with `npm run manifest`: one line, the kind. No other file under `config/` changed. The two patch files stay beside this note as the record of the held work.
- **T041, landed after the merge:** the image's room build copies `config/routing.yaml` and `config/prices.yaml` (87db6def, 4a3a257b).
- **Not run yet, by the main session's direction (other branches' checks and the Author's paid live runs come first):** `make test` and `make check ENGINE_MODE=none-yet` (T033), `gitleaks dir`, and the whole web suite again after the merge. `make lint`, the whole web suite, and `make evals` ran before the merge, and the targeted tests and `room:check` after it (below).
- **Still to come:** T036's review by an agent that wrote none of this, T037's fixes, T033's full checks, and the Author's T038 to T040.

## What changed and why

The Author's words of 2026-11-09, as the intent records them: "We may as well get you working on a progress bar as the web assets are downloading, make it like a game progress bar with the web page faded in the background. We should have hints below the progress bar on how to interact with the twin, and what the neon sign displays, how we evaluate costs. "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure." "Ask about the latest work" "click on objects to have the twin start discussing them" . Add this as a complete item to your work to start as I'm away for dinner. You can do it!" His approval, the same day: "Also we aprove of the spec 012: the loading screen".

What this branch builds, by plan.md:

- **A loader from "Enter" to the hand-off, in 3D only** (`app.ts`): over the room's own page, in place of "Loading the room…", focused on its heading. It gives way once, at the first of every part ended (`ready`), the ceiling, `LOADING_CEILING_MS` = 7,000 ms after "Enter" on the room's clock (`ceiling`), or the room in 2D by any road (`2d`). The room owns the timer, so a view that throws can't hold the hand-off. The hand-off starts once the loader has given way and spec 009's figures wait has ended.
- **A pure progress model** (`src/room/loading/progress.ts`): the 3D code 10, the room's text 2, the typefaces 3 (`faces/fonts.ts`'s new `settled()`), and the figures' files and the set models 85 by their bytes as served, each counting once its load has ended. Every end is kept, those heard before the 3D stage's list among them.
- **The room's models shown while the loader shows** (`scene.ts`, `scene/loader.ts`, `scene/avatars.ts`): the 3D stage says what it will load (`expected`) and keeps one flag, `closed`, turned by the room's `gaveWay` or its first `showHandoff`; one gate (`figureGate`, `modelGate`, `swapGate`) holds every parse and a set model's swap from then until the hand-off ends. The fetch, its integrity check, and its order are unchanged.
- **The card, the bar, and the page behind** (`loading/view.ts`, `loading/loading.css`, `layout.ts`): the card is the HUD's dark glass in every layout, fixed below the measured strip and the notes' reserve in the column and dock layouts, first in the page's flow in the stacked one. The bar is a progress bar with its value text ("64%: Loading the room's pieces: 12 of 21"), its fill's fraction set through the CSS object model. The scrim is a tint by element, per layout, never on the AI disclosure or the stage's notes. The scene's own motion is held by a counted hold of the motion store. The card fades out in 200 ms, inert from its first frame, and at once under reduced motion.
- **The hints** (`apps/web/room/hints.yaml`, `build/room/hints.ts`, `build/room/checks/rt.ts`, `loading/hints.ts`): his three verbatim, then the session's twelve as The Hint Copy words them, checked by RT2, RT3, RT9, and the new RT14 to RT17, every figure filled at build from the configuration, carried filled in the index's new `hints`. One at a time below the bar, a new one every 6 seconds, paused by the pointer, stopped by focus, with "Pause hints" or "Play hints", "Previous hint", and "Next hint".
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
| FR-028 to FR-031         | met                                                                                                                              | `test/room/loading-hints.test.ts` (T020), T012's T021 cases                               |
| FR-032 to FR-034 | met, in a checkout's build and the web image's | `test/room/hints-compose.test.ts` (T018), `hints.test.ts` (T019), `test/room/image-inputs.test.ts` (T041) |
| FR-035                   | met: hints 1 and 2 with no `when`                                                                                                | T019                                                                                      |
| FR-036                   | met                                                                                                                              | T021                                                                                      |
| FR-037 to FR-043         | met in jsdom; the keyboard-only and screen-reader runs are the Author's (T039)                                                   | T012, T025, `test/room/loading-contrast.test.ts` (T025)                                   |
| FR-044, FR-045 | met: after the merge, the entry 45,976 bytes and the index 6,221, which `test/room/chunk.test.ts`'s own assertion now holds too; no package added | T033's numbers below |
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
| III. Intent before spec, spec before code | From the approved spec and plan; every departure recorded in plan.md (C1 to C6) in its commit; the living contracts marked "(spec 012)"; no agent merges                                                                                             |
| IV. Least privilege | No header, permission, sandbox domain, or human-only file changed; nothing under `.claude/`, `tools/gates/`, `evals/agent-config/`, `assets/`, `corpus/`, `infra/`, `CLAUDE.md`, or `REVIEW.md`, and under `config/` only the generated `config/room-events.yaml`; the integrity check on every model kept; the web image copies two more public configuration files, through fix/007's list and test |
| V. Cost | $0 in the cloud; no transfer change; at most one beacon per visit cut short. The cost hints read the configuration that enforces the ceilings, in the image as in a checkout |
| VI. Build in public                       | The shares, the ceiling, the hints and their sources committed                                                                                                                                                                                       |
| VII. Own the whole product                | The reasoning in plan.md, its departures, and ADR 0045; the Author's hints shown as typed                                                                                                                                                            |
| VIII. Honest AI                           | The AI disclosure and the stand-in line are never tinted or covered, by construction and by the geometry test (T016)                                                                                                                                 |

## Review

T036's review, by an agent that wrote none of this work, hasn't run yet. Its findings go here.

## Departures

Each is in plan.md's Departures, in the commit that made it, and in ADR 0045:

| ID  | What                                                                              | Why                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `settled()` resolves at once on a page with no `document.fonts`                   | Such a page asks for no typeface; jsdom has none, and a 2-second wait would hold every 3D test's hand-off for files never asked for. Where the API exists, the 2-second bound holds |
| C2  | A 3D stage that gives no `expected` counts no file                                | `Stage3D.expected` is optional, as `figures` is; the room's own stage always gives it                                                                                               |
| C3  | The end line is said together with the hand-off's when both fall in one turn      | The status region holds one text at a time; two says in a turn would leave a screen reader only the second                                                                          |
| C4  | `setLoading("on" \| "leaving" \| "off")`, and `insertLoader(card)`                | So the tints fade with the card, and "Around the room" is reachable from the fade's first frame                                                                                     |
| C5  | The stage line reads "Loading the room's code" until the stage's list has arrived | The loader's own chunk is 3D code too; "pieces: 0 of 0" would read wrong                                                                                                            |
| C6  | The track is `rgb(0 0 0 / 0.35)`, not `rgb(255 255 255 / 0.16)`                   | T025 found the yellow fill at 2.44:1 against the planned track over white beneath, under FR-041's 3:1                                                                               |

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

In a checkout's build (`compose()` over the repository, lenient, with the twin's readiness), in order, 0 findings:

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

## Verification (T033, so far)

The numbers are after the merge of `main`, at 4a3a257b; the outputs below are from before it, at a6c2484c with the avatars-compose correction, and wait for T033's full runs after the merge. Node 24.21.0.

|                                                                           | At the base (b906c5e7)              | Now                                                                                                       |
| ------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The entry chunk and its CSS, gzipped                                      | 41,723 bytes (JS 37,377, CSS 4,346) | 45,976 bytes (JS 41,023, CSS 4,953): +4,253, within the plan's 8 KB, of 153,600 |
| The index, serialized, gzip level 9                                       | 5,196 bytes                         | 6,221 bytes: +1,025, of 16,384 (R-11; `test/room/chunk.test.ts`'s own assertion passes after the merge) |
| `npm run room:check`                                                      | 0 findings                          | 0 findings, the hints' strict rules among them                                                            |
| `package-lock.json`, every `package.json`                                 |                                     | unchanged (FR-045)                                                                                        |
| `apps/web/nginx.conf`, the compose files, `deploy/env*` | | unchanged (FR-052, FR-053); `deploy/` gains the dashboard's panel and its test's case; the `Dockerfile` gains the two configuration files' copies (T041) |

**What failed before the merge, and whose it was.** `make lint` stopped at Prettier on the four history files `main` carried at e324771e, `main`'s known failure, so its later steps were run on their own: all passed. The web suite's 12 failures were `main`'s 8 known readiness failures (`test/room/chunk.test.ts` 6, `test/room/dist.test.ts` 2), which the merge's targeted runs now pass, and T029's 4 RED cases, which T030 and T032 turned GREEN. `make evals` exits 0 with the behavioral tier's WARN, information, never a merge block (spec 006 FR-002).

### `make lint`

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
[warn] evals/product/history/2026-11-09T175245Z-local.json
[warn] evals/product/history/2026-11-09T191058Z-bedrock.json
[warn] redteam/history/20261109T175353Z-local.json
[warn] redteam/history/20261109T191059Z-bedrock.json
[warn] Code style issues found in 4 files. Run Prettier with --write to fix.
make: *** [Makefile:222: lint] Error 1
exit: 2
```

### ruff, ruff format, and shellcheck, the lint target's steps after Prettier

```text
All checks passed!
ruff exit: 0
469 files already formatted
ruff format exit: 0
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
shellcheck exit: 0
```

### The whole web suite (`npx vitest run --maxWorkers=6` in `apps/web`)

Its failing tree and its totals; the rest of its output is each failure's diff.

```text

 RUN  v5.0.3 /tmp/claude-1000/wt-feat012/apps/web

 ❯ test/events.test.ts (7 tests | 1 failed) 118ms
   ❯ the beacon (4)
     × sends each kind once, its body {kind} or {kind, id} alone, as text a beacon sends without a preflight 68ms
 ❯ test/disclosure.test.ts (11 tests | 1 failed) 271ms
   ❯ the disclosure page (11)
     × names the loader cut short in row V4's trigger, before spec 009's closing clause (spec 012, L5) 8ms
 ❯ test/ui/loading-degraded.test.ts (26 tests | 1 failed) 4393ms
   ❯ loading_cut_short (FR-046) (4)
     × is sent once a visit, with no identifier, at the ceiling with a file not ended 26ms
 ❯ test/room/chunk.test.ts (14 tests | 6 failed) 6289ms
   ❯ the release build (7)
     ❯ the room's bundle (FR-011) (3)
       × puts the index, `room`, in the entry chunk, within 16,384 bytes at gzip level 9 3339ms
       × puts the 3D part only behind the entry's dynamic import, beside the scene module, the digest with it 44ms
     ❯ room-manifest.json (Amendment B7) (1)
       × is compose()'s manifest, its build_kind "release" 7ms
   ❯ the drafts build (7)
     ❯ the room's bundle (FR-011) (3)
       × puts the index, `room`, in the entry chunk, within 16,384 bytes at gzip level 9 2612ms
       × puts the 3D part only behind the entry's dynamic import, beside the scene module, the digest with it 28ms
     ❯ room-manifest.json (Amendment B7) (1)
       × is compose()'s manifest, its build_kind "drafts" 1ms
 ❯ test/room/dist.test.ts (12 tests | 2 failed) 9521ms
   ❯ the site's release build (contracts/room-bundle.md §14) (2)
     × holds no † field's value and no pending line of the committed data, in any file 3149ms
   ❯ the site's drafts build (contracts/room-bundle.md §14) (2)
     × holds no † field's value and no pending line of the committed data, in any file 3065ms
 ❯ test/manifest.test.ts (13 tests | 1 failed) 32232ms
   ❯ room-manifest.json (Amendment B7) (7)
     × keeps spec 002's free talk not ready, the four avatars, and the event kinds 2656ms

⎯⎯⎯⎯⎯⎯ Failed Tests 12 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  6 failed | 129 passed (135)
      Tests  12 failed | 3041 passed | 1 skipped (3054)
   Start at  23:10:42
   Duration  137.36s (tests 79%, import 21%, transform 1%)
exit: 1
```

### `make evals`

```text
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
PASS  twin-00-profile-q1-engineer
PASS  twin-00-profile-q1-non-engineer
PASS  twin-00-profile-q2-engineer
PASS  twin-00-profile-q2-non-engineer
PASS  twin-00-profile-q3-engineer
PASS  twin-00-profile-q3-non-engineer
PASS  twin-00-profile-q4-engineer
PASS  twin-00-profile-q4-non-engineer
PASS  twin-00-profile-q5-engineer
PASS  twin-00-profile-q5-non-engineer
PASS  twin-00-profile-q6-engineer
PASS  twin-00-profile-q6-non-engineer
PASS  twin-01-ai-strategy-and-cht-gap-1-engineer
PASS  twin-01-ai-strategy-and-cht-gap-1-non-engineer
PASS  twin-01-ai-strategy-and-cht-gap-2-engineer
PASS  twin-01-ai-strategy-and-cht-gap-2-non-engineer
PASS  twin-01-ai-strategy-and-cht-gap-3-engineer
PASS  twin-01-ai-strategy-and-cht-gap-3-non-engineer
PASS  twin-01-ai-strategy-and-cht-gap-4-engineer
PASS  twin-01-ai-strategy-and-cht-gap-4-non-engineer
PASS  twin-01-ai-strategy-and-cht-q1-engineer
PASS  twin-01-ai-strategy-and-cht-q1-non-engineer
PASS  twin-01-ai-strategy-and-cht-q10-engineer
PASS  twin-01-ai-strategy-and-cht-q10-non-engineer
PASS  twin-01-ai-strategy-and-cht-q11-engineer
PASS  twin-01-ai-strategy-and-cht-q11-non-engineer
PASS  twin-01-ai-strategy-and-cht-q12-engineer
PASS  twin-01-ai-strategy-and-cht-q12-non-engineer
PASS  twin-01-ai-strategy-and-cht-q13-engineer
PASS  twin-01-ai-strategy-and-cht-q13-non-engineer
PASS  twin-01-ai-strategy-and-cht-q14-engineer
PASS  twin-01-ai-strategy-and-cht-q14-non-engineer
PASS  twin-01-ai-strategy-and-cht-q15-engineer
PASS  twin-01-ai-strategy-and-cht-q15-non-engineer
PASS  twin-01-ai-strategy-and-cht-q16-engineer
PASS  twin-01-ai-strategy-and-cht-q16-non-engineer
PASS  twin-01-ai-strategy-and-cht-q17-engineer
PASS  twin-01-ai-strategy-and-cht-q17-non-engineer
PASS  twin-01-ai-strategy-and-cht-q18-engineer
PASS  twin-01-ai-strategy-and-cht-q18-non-engineer
PASS  twin-01-ai-strategy-and-cht-q2-engineer
PASS  twin-01-ai-strategy-and-cht-q2-non-engineer
PASS  twin-01-ai-strategy-and-cht-q3-engineer
PASS  twin-01-ai-strategy-and-cht-q3-non-engineer
PASS  twin-01-ai-strategy-and-cht-q4-engineer
PASS  twin-01-ai-strategy-and-cht-q4-non-engineer
PASS  twin-01-ai-strategy-and-cht-q5-engineer
PASS  twin-01-ai-strategy-and-cht-q5-non-engineer
PASS  twin-01-ai-strategy-and-cht-q6-engineer
PASS  twin-01-ai-strategy-and-cht-q6-non-engineer
PASS  twin-01-ai-strategy-and-cht-q7-engineer
PASS  twin-01-ai-strategy-and-cht-q7-non-engineer
PASS  twin-01-ai-strategy-and-cht-q8-engineer
PASS  twin-01-ai-strategy-and-cht-q8-non-engineer
PASS  twin-01-ai-strategy-and-cht-q9-engineer
PASS  twin-01-ai-strategy-and-cht-q9-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-1-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-1-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-10-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-10-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-11-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-11-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-12-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-12-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-13-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-13-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-2-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-2-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-3-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-3-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-4-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-4-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-5-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-5-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-6-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-6-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-7-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-7-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-8-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-8-non-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-9-engineer
PASS  twin-02-production-infrastructure-national-scale-gap-9-non-engineer
PASS  twin-02-production-infrastructure-national-scale-q1-engineer
PASS  twin-02-production-infrastructure-national-scale-q1-non-engineer
PASS  twin-02-production-infrastructure-national-scale-q2-engineer
PASS  twin-02-production-infrastructure-national-scale-q2-non-engineer
PASS  twin-02-production-infrastructure-national-scale-q3-engineer
PASS  twin-02-production-infrastructure-national-scale-q3-non-engineer
PASS  twin-02-production-infrastructure-national-scale-q4-engineer
PASS  twin-02-production-infrastructure-national-scale-q4-non-engineer
PASS  twin-02-production-infrastructure-national-scale-q5-engineer
PASS  twin-02-production-infrastructure-national-scale-q5-non-engineer
PASS  twin-03-grants-and-credits-gap-1-engineer
PASS  twin-03-grants-and-credits-gap-1-non-engineer
PASS  twin-03-grants-and-credits-gap-2-engineer
PASS  twin-03-grants-and-credits-gap-2-non-engineer
PASS  twin-03-grants-and-credits-gap-3-engineer
PASS  twin-03-grants-and-credits-gap-3-non-engineer
PASS  twin-03-grants-and-credits-q1-engineer
PASS  twin-03-grants-and-credits-q1-non-engineer
PASS  twin-03-grants-and-credits-q2-engineer
PASS  twin-03-grants-and-credits-q2-non-engineer
PASS  twin-04-hobbies-and-travel-q1-engineer
PASS  twin-04-hobbies-and-travel-q1-non-engineer
PASS  twin-04-hobbies-and-travel-q2-engineer
PASS  twin-04-hobbies-and-travel-q2-non-engineer
PASS  twin-04-hobbies-and-travel-q3-engineer
PASS  twin-04-hobbies-and-travel-q3-non-engineer
PASS  twin-04-hobbies-and-travel-q4-engineer
PASS  twin-04-hobbies-and-travel-q4-non-engineer
PASS  twin-04-hobbies-and-travel-q5-engineer
PASS  twin-04-hobbies-and-travel-q5-non-engineer
PASS  twin-04-hobbies-and-travel-q6-engineer
PASS  twin-04-hobbies-and-travel-q6-non-engineer
PASS  twin-04-hobbies-and-travel-q7-engineer
PASS  twin-04-hobbies-and-travel-q7-non-engineer
PASS  twin-04-hobbies-and-travel-q8-engineer
PASS  twin-04-hobbies-and-travel-q8-non-engineer
PASS  twin-05-mission-q1-engineer
PASS  twin-05-mission-q1-non-engineer
PASS  twin-05-mission-q2-engineer
PASS  twin-05-mission-q2-non-engineer
PASS  twin-05-mission-q3-engineer
PASS  twin-05-mission-q3-non-engineer
PASS  twin-05-mission-q4-engineer
PASS  twin-05-mission-q4-non-engineer
PASS  twin-05-mission-q5-engineer
PASS  twin-05-mission-q5-non-engineer
PASS  twin-05-mission-q6-engineer
PASS  twin-05-mission-q6-non-engineer
PASS  twin-05-mission-q7-engineer
PASS  twin-05-mission-q7-non-engineer
PASS  twin-06-work-projects-q1-engineer
PASS  twin-06-work-projects-q1-non-engineer
PASS  twin-06-work-projects-q2-engineer
PASS  twin-06-work-projects-q2-non-engineer
PASS  twin-06-work-projects-q3-engineer
PASS  twin-06-work-projects-q3-non-engineer
PASS  twin-06-work-projects-q4-engineer
PASS  twin-06-work-projects-q4-non-engineer
PASS  twin-06-work-projects-q5-engineer
PASS  twin-06-work-projects-q5-non-engineer
PASS  twin-06-work-projects-q6-engineer
PASS  twin-06-work-projects-q6-non-engineer
PASS  twin-06-work-projects-q7-engineer
PASS  twin-06-work-projects-q7-non-engineer
PASS  twin-07-denver-local-ai-gap-1-engineer
PASS  twin-07-denver-local-ai-gap-1-non-engineer
PASS  twin-07-denver-local-ai-gap-2-engineer
PASS  twin-07-denver-local-ai-gap-2-non-engineer
PASS  twin-07-denver-local-ai-gap-3-engineer
PASS  twin-07-denver-local-ai-gap-3-non-engineer
PASS  twin-07-denver-local-ai-q1-engineer
PASS  twin-07-denver-local-ai-q1-non-engineer
PASS  twin-07-denver-local-ai-q2-engineer
PASS  twin-07-denver-local-ai-q2-non-engineer
PASS  twin-07-denver-local-ai-q3-engineer
PASS  twin-07-denver-local-ai-q3-non-engineer
PASS  twin-07-denver-local-ai-q4-engineer
PASS  twin-07-denver-local-ai-q4-non-engineer
PASS  twin-07-denver-local-ai-q5-engineer
PASS  twin-07-denver-local-ai-q5-non-engineer
PASS  twin-07-denver-local-ai-q6-engineer
PASS  twin-07-denver-local-ai-q6-non-engineer
PASS  twin-07-denver-local-ai-q7-engineer
PASS  twin-07-denver-local-ai-q7-non-engineer
PASS  twin-07-denver-local-ai-q8-engineer
PASS  twin-07-denver-local-ai-q8-non-engineer
PASS  twin-08-hareet-ai-gap-1-engineer
PASS  twin-08-hareet-ai-gap-1-non-engineer
PASS  twin-08-hareet-ai-q1-engineer
PASS  twin-08-hareet-ai-q1-non-engineer
PASS  twin-08-hareet-ai-q2-engineer
PASS  twin-08-hareet-ai-q2-non-engineer
PASS  twin-08-hareet-ai-q3-engineer
PASS  twin-08-hareet-ai-q3-non-engineer
PASS  twin-08-hareet-ai-q4-engineer
PASS  twin-08-hareet-ai-q4-non-engineer
PASS  twin-08-hareet-ai-q5-engineer
PASS  twin-08-hareet-ai-q5-non-engineer
PASS  twin-08-hareet-ai-q6-engineer
PASS  twin-08-hareet-ai-q6-non-engineer
PASS  twin-08-hareet-ai-q7-engineer
PASS  twin-08-hareet-ai-q7-non-engineer
PASS  twin-08-hareet-ai-q8-engineer
PASS  twin-08-hareet-ai-q8-non-engineer
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
PASS  narration-agent-orchestrator-engineer
PASS  narration-agent-orchestrator-non-engineer
PASS  narration-agent-watchdog-engineer
PASS  narration-agent-watchdog-non-engineer
PASS  narration-ai-strategy-engineer
PASS  narration-ai-strategy-non-engineer
PASS  narration-change-management-engineer
PASS  narration-change-management-non-engineer
PASS  narration-cht-agent-data-layer-engineer
PASS  narration-cht-agent-data-layer-non-engineer
PASS  narration-cht-agent-engineer
PASS  narration-cht-agent-non-engineer
PASS  narration-cht-codebase-engineer
PASS  narration-cht-codebase-non-engineer
PASS  narration-cht-docker-architecture-engineer
PASS  narration-cht-docker-architecture-non-engineer
PASS  narration-cht-skills-engineer
PASS  narration-cht-skills-non-engineer
PASS  narration-claude-medic-aws-engineer
PASS  narration-claude-medic-aws-non-engineer
PASS  narration-cloud-data-centers-engineer
PASS  narration-cloud-data-centers-non-engineer
PASS  narration-denver-local-ai-engineer
PASS  narration-denver-local-ai-non-engineer
PASS  narration-hareet-ai-engineer
PASS  narration-hareet-ai-non-engineer
PASS  narration-kenya-localization-engineer
PASS  narration-kenya-localization-non-engineer
PASS  narration-national-benchmarking-engineer
PASS  narration-national-benchmarking-non-engineer
PASS  narration-national-scale-engineer
PASS  narration-national-scale-non-engineer
PASS  narration-no-code-configuration-engineer
PASS  narration-no-code-configuration-non-engineer
PASS  narration-other-deployments-engineer
PASS  narration-other-deployments-non-engineer
PASS  narration-powersync-postgres-engineer
PASS  narration-powersync-postgres-non-engineer
PASS  narration-smart-task-prioritization-engineer
PASS  narration-smart-task-prioritization-non-engineer
PASS  narration-tools-engineer
PASS  narration-tools-non-engineer
PASS  narration-voice-for-cht-engineer
PASS  narration-voice-for-cht-non-engineer
evals narration (fake): 44 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
PASS  CLAUDE.md is 58 lines and 5974 bytes (at most 60 and 6 KB)
PASS  CLAUDE.md names the constitution as superseding it
PASS  REVIEW.md names the constitution as superseding it
PASS  role docs: tools match roles.expected
PASS  role implementer: tools match roles.expected
PASS  role ops: tools match roles.expected
PASS  role red-teamer: tools match roles.expected
PASS  role reviewer: tools match roles.expected
PASS  role spec-writer: tools match roles.expected
PASS  hook .claude/hooks/bash-gate.sh is registered for PreToolUse Bash
PASS  hook .claude/hooks/protected-paths.sh is registered for PreToolUse Edit|Write|MultiEdit|NotebookEdit
PASS  hook .claude/hooks/post-edit-check.sh is registered for PostToolUse Edit|Write|MultiEdit
PASS  hook .claude/hooks/subagent-report-check.sh is registered for SubagentStop (every subagent)
PASS  hook .claude/hooks/content-scan.sh is registered for PreToolUse Edit|Write|MultiEdit
PASS  FR-007: 28 of 28 variables denied by name
agent-config static: 0 failed, 0 planned
tier=0; python3 -I -B -X pycache_prefix=/dev/null evals/behavioral_line.py || tier=$?; python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py && exit $tier
behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 05cec03a74a5
WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
agent-config behavioral: fail, 0 planned
note: the behavioral tier's line is information in make evals, not a merge block (spec 006 FR-002): the gate's agent-config-evals step waits for a run only for a branch that changes CLAUDE.md, REVIEW.md, .claude/, or the Claude Code pin
PASS  every relative link resolves: 1904 links in 272 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 32 of 32
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 1904 relative links in 272 files
exit: 0
```

## Cost and data-flow impact

$0 in the cloud. No new file, request, or transfer: the loader watches the loads the room already makes. At most one `loading_cut_short` beacon a visit cut short at the ceiling, about 30 bytes of body, on spec 002's existing flow, with row V4's trigger in the same commit (793b44ca). On the visitor's device, the same parsing as before, done while the loader shows rather than after the hand-off; the entry chunk grew 4,221 bytes, compressed.

## For the Author

**The web image's hints** (T041's check, which this session can't run). Once your gate has built the web image, one read returns hints 12 to 14 from its entry chunk and nothing else. Set `I` to the image the gate built:

```bash
I=<the web image the gate built>
P='per million|sub-budget|caps spend'
docker run --rm --entrypoint sh "$I" -c \
  "grep -ohE '[^\"]*($P)[^\"]*' \
  /usr/share/nginx/html/assets/*.js"
```

Expected: the three lines of hints 12 to 14 above, figures included.

**Your look and your runs, after the merge** (T039, in one batch; the gate and the merge come with the final note):

- **The browsers** (PD-4, R-1): in desktop Chrome, Firefox, and Safari, and Android's Chrome, with the network throttled in the developer tools, whether the bar moves only as whole files end (expected), or within one.
- **The screen readers** (plan §6.1): what NVDA, JAWS, and VoiceOver say when the loader shows, as the bar's value changes, and as each hint appears. Expected: "Loading the room" once, each hint once, and no running count.
- **A keyboard-only run and a screen-reader run** (SC-006), on a wide window, a phone held upright, and the stacked layout (a 400% zoom): each hears or sees that the room is loading, reads its percentage and stage, reads every hint by its controls, and lands on the room's heading when it gives way, unaided and never trapped.
- **Reflow and text size** (SC-006): at 400% zoom on a 1280 × 1024 window and at 200% text on a phone-sized window, nothing on the card clipped or overlapping, the page scrolling only vertically.
- **The look** (SC-010): enter once with the network throttled and once without; watch the bar fill and the room come together behind it, still; read the hints, pause them, and step through them; try a phone held upright. A yes or a no for each in a follow-up note; a change to the look is a new intent.

**A refusal this session met.** The bash gate refused several commits while the main checkout was on `main` (the Author's gate). As the brief directs, the session kept working and committed later, in order, never in another form. One commit made in a burst afterwards took the wrong message (the refused command's message file had never been written); it was amended at once, before anything built on it.

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
