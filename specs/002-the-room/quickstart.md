# Quickstart: validating spec 002

Phase 1 output of `/speckit-plan`: the runs that prove each task group and each success criterion this spec can prove now. Contracts: [web-serving.md](contracts/web-serving.md), [resume-source.md](contracts/resume-source.md), [room-scene.md](contracts/room-scene.md), [narration.md](contracts/narration.md), [room-events.md](contracts/room-events.md), [room-conversation.md](contracts/room-conversation.md). Data: [data-model.md](data-model.md).

## Conventions

Spec 000's conventions hold ([its quickstart](../000-local-foundations/quickstart.md#conventions)): **the Author's terminal**, **an agent session**, **Heavy**, and **the evidence**. Everything here runs on the local tier; nothing calls AWS, and nothing makes a model call.

## 1. Group 1: serving the room (FR-059)

1. **An agent session:** `make check ENGINE_MODE=none-yet` passes, with `apps/web`'s lint and tests in it.
2. **The Author's terminal:** `make init-env SYNC=1 ENV=prod` (and `ENV=dev`), which appends `H4_SITE_PORT` and `H4_WEB_SUFFIX`. Then `make up ENV=dev`, and `make up ENV=prod`.
3. **Expected:**
   - `make status ENV=dev` shows `web` healthy;
   - `docker image ls h4reet-web` shows prod's `<commit>` and dev's `<commit>-drafts` as two images, and prod's label `org.h4reet.web.policy` names the policy digest read from `main`;
   - `http://127.0.0.1:18105/` serves the choice screen;
   - the response headers carry the CSP and no `Set-Cookie`;
   - `make isolation-check` still passes with prod and dev up.
4. **dev-cpu (an agent session):** `make up ENV=dev-cpu` on the agents' engine, then an HTTP GET of x005 through the operator CLI's probe hop. **Expected:** 200 and the choice screen's HTML.

## 2. Group 2: approvals

1. **The Author's terminal:** apply the patch (`git apply docs/merge-requests/<date>-feat-002-approvals.patch`), then `claude doctor` and `make git-hooks`.
2. **Expected:**
   - from an agent session, an Edit of `assets/policy/content-approvals.json` or `assets/policy/resume-header.json` is refused, and their matrix rows pass;
   - `npm run build -w apps/web` marks every content file a draft;
   - the gate's `content_check` step passes on that build, and fails on a scratch build whose `room-data.json` was edited to publish a draft.

## 3. Group 3: the resume (User Story 1; SC-002)

1. **An agent session:** `npm run build -w apps/web`. **Expected:** the citation check passes; `dist/resume.pdf` and `dist/room-data.json` exist; `test/pdf.test.ts` passes (text equality, tags, language, the two property keys).
2. **The Author:** read `corpus/proposals/resume-<date>.md` and the draft source.
   - When satisfied: `sha256sum apps/web/content/resume.yaml`, then add an entry to `assets/policy/content-approvals.json` ([its format](contracts/resume-source.md#5-approvals)) and commit it on `main`; the build reads approvals only from `main`.
   - Optionally, fill `full_name` and `contact` in `assets/policy/resume-header.json` and commit it on `main`. Not in `corpus/facts/`: the corpus's denylist keeps the surname out of the corpus (spec.md's Assumptions).
3. **Expected after the next `make up`** (the image rebuilds and reads `main` again):
   - the source is approved;
   - with both header values filled, the PDF's header carries them, and the interactive resume's doesn't;
   - with either empty, the two headers match (FR-017).
4. **The PDF by hand (the Author):** open it in a reader with a screen reader. **Expected:** the title is shown as the window's title; the headings, the list, and the reading order are announced; the text selects; and the document properties show only the title and the name (FR-019).
5. **Staleness:** change one character in a cited corpus file, on a scratch branch. **Expected:** `make test` fails with `corpus changed since the lock: <file>` (FR-016).

## 4. Group 4: the room (User Stories 2 and 5; SC-001, SC-003, SC-004, SC-005, SC-012)

Run on dev, at `http://127.0.0.1:18105/`:
1. **A visit:** choose a path and an avatar, then "Enter". **Expected:**
   - the hand-off plays, unskippable, ending within 5 s;
   - "Read the resume now" and "Keep it for later" appear;
   - after "later", the "Resume" button stays in the toolbar.
2. **Reload:** **Expected:** back at the choice, and the hand-off plays again (FR-002).
3. **SC-001, the floor:** stop dev's model server (`docker compose … stop model-server-gpu`, the Author), then repeat 1, open every resume item, and download the PDF. **Expected:**
   - every step succeeds;
   - each object answers `topic_not_ready`, the text box `cannot_talk.unavailable`, and the talk button `voice_unavailable`, with focus on the text box;
   - no microphone prompt.
4. **SC-003:**
   - a keyboard-only visit, through every control, the resume, every item, and every object;
   - a screen-reader visit (NVDA on Windows, or VoiceOver);
   - the axe report from `make test`: 0 violations.

   Record the counts and any blocker.
5. **SC-004:** on the reference phone and laptop (research R-12), the browser's performance panel over a 2-minute visit. **Expected:** 95% of frames within budget at 30 and 60 frames a second, or the quality steps and the 2D switch shown in the run's log.
6. **SC-005:** the browser's 4G emulation (9 Mbps, 150 ms), with the cache disabled. **Expected:** the choice screen interactive within 3 s, and the hand-off begun within 10 s of opening the page, in 19 of 20 loads.
7. **SC-012:** the network log over a whole visit. **Expected:** every request to `127.0.0.1:18105`.
8. **The 2D mode:** "2D view", and a browser with WebGL disabled. **Expected:** the drawn work area with the same buttons, the same resume, and the same messages.

## 5. Group 5: narration (User Story 3; SC-006)

1. **An agent session:** `npm run build -w apps/web` and `make evals`. **Expected:** one script per item and path; the citations pass; the `narration` suite passes on the fake adapter; `evals/run.py --suite narration --adapter local` refuses to run; no committed case holds a private-denylist phrase.
2. **The Author:** read the scripts, and approve each by hash.
3. **Expected on dev:** selecting an item starts its words within 1 s (the performance panel's click-to-paint), at the path's depth; another selection stops it; with the model server stopped, the same.

## 6. Group 6: usage events (User Story 6; SC-010's counts)

1. On dev: select each object and several items, open and keep the resume, download the PDF, enter the 2D mode.
2. **Expected:**
   - the dashboard's "Room" row shows each count within 60 s;
   - `h4.room.events` has only `kind` and `id` labels;
   - a hand-made POST with an extra field, an unknown kind, or an unknown ID is refused and counted;
   - Loki holds no event body.

## 7. Waiting

Groups 7 to 10 wait on the twin's spec, a local recognizer, the cloned voice, spec 003's intake, and spec 001's edge. Their runs are written with them: SC-007 (its answer half with group 7's T081, its transcript half with group 8's T082), SC-008, SC-009, SC-011, SC-013, and SC-014.
