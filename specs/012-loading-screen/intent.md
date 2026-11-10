# Intent: A game-style loading screen for the room, with hints

Author: the Author (drafted by Claude from the Author's words of 2026-11-09, as the main session's brief relays them). Status: accepted provisionally by the session on 2026-11-09, pending the Author's T000 ([tasks.md](tasks.md)), at which he accepts or closes it. He wrote the words below before leaving for dinner and asked for the work to start while he was away; the main session directed this session to take it from intent through clarify (provisionally), plan, and tasks. Created: 2026-11-09, in the spec's folder rather than `intent/`, as the intents of specs 008, 009, and 010 were, so it moves nowhere when accepted; the spec names that location as a deviation from Principle III's "committed to `intent/`".

## The Author's words

Verbatim, as the main session's brief relays them. The hints he wrote in quotation marks are his copy, to be shown on screen as he typed them.

> "We may as well get you working on a progress bar as the web assets are downloading, make it like a game progress bar with the web page faded in the background. We should have hints below the progress bar on how to interact with the twin, and what the neon sign displays, how we evaluate costs. "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure." "Ask about the latest work" "click on objects to have the twin start discussing them" . Add this as a complete item to your work to start as I'm away for dinner. You can do it!"

Claude's reading, phrase by phrase, beside his words and never in their place, to correct where it's wrong:

- **"a progress bar as the web assets are downloading"**: a bar that measures the files the room's first visit needs as they arrive. Which files, and how they are counted, is the spec's Q1.
- **"make it like a game progress bar"**: a game's loading screen: a wide bar that fills, a percentage, a line naming what is loading, and tips below it, between choosing a character and the level starting. Here, between "Enter" and the hand-off.
- **"with the web page faded in the background"**: the page itself stays visible behind the loader, dimmed. Which page, and what it shows while it loads, is the spec's Q2.
- **"hints below the progress bar on how to interact with the twin, and what the neon sign displays, how we evaluate costs"**: three groups of hints, which the session writes from the repository's facts only, each citing its source.
- **"Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure." "Ask about the latest work" "click on objects to have the twin start discussing them"**: his three hints, shown exactly as he typed them, the lower-case "click" and the missing full stop after "Ask about the latest work" included. Capitals and punctuation are his to change.
- **"Add this as a complete item to your work to start as I'm away for dinner."**: the whole lifecycle item, started tonight. Code still waits for his approval of the spec and the plan (`CLAUDE.md`: "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`"), so tonight's work is the documents, and his T000 starts the build.
- **"You can do it!"**: kept.

## Problem

- **The visitor waits with no sense of progress.** After "Enter", the room builds its page and shows one line in the stage, "Loading the room…" (`apps/web/src/room/layout.ts`), until the 3D scene mounts, at most `SCENE_WAIT_MS`, 4 s (`apps/web/src/room/quality.ts`); it then waits for the figures' avatars, at most `wait_ms`, 1.5 s (`apps/web/room/scene.yaml`), and plays the hand-off. Nothing says how far along the room is.
- **The room changes in front of the visitor after the hand-off.** The studio models are fetched from the 3D stage's mount, and are parsed and shown only after the hand-off ends (spec 004's research R-28, step 4; `apps/web/src/room/scene/loader.ts`). In the build recorded in `docs/merge-requests/2026-11-09-feat-005-full-window-room.md`, they are 21 files and 6,593,757 bytes as served, from 11 KB to about 1 MB each, against 40,599 bytes of entry code and about 200 KB of 3D code. So the visitor meets the room as placeholder shapes, which turn into models one by one once it is theirs.
- **Nothing tells a visitor how to use the room before they are in it.** Starting a conversation by choosing a piece, the "In the room" list, the text box, walking, what the neon sign counts, and how the project keeps its costs are each found by trying, or by reading the repository.

## Proposed outcome

- From "Enter" until the room is ready, a loading screen like a game's: a wide progress bar with a percentage, a line naming what is still loading, and hints below it, over the room's own page, dimmed, with the room drawing in behind as its pieces arrive.
- The bar measures the first visit's files as they arrive, and the room's models are shown while the loader is up, so the room is whole when it gives way to the hand-off.
- The loader never holds the room back: it gives way at a ceiling that keeps spec 002's SC-005 ("the hand-off begins no later than 10 seconds after the page was opened" on a typical 4G connection), and every failure takes the room's existing degraded paths: the placeholder shapes, the figures' fallbacks, and the 2D room.
- The hints are data: the Author's three, verbatim, then the session's, each with its source, any figure filled from the project's own configuration at build, never typed.
- Nothing new leaves the visitor's device but one usage event, sent when the ceiling cuts the loading short, disclosed in row V4 and graphed on the dashboard.

## Affected users and systems

- **Visitors** whose device draws the room in 3D, from "Enter" to the hand-off. A device that draws the 2D room has nothing to wait for, and sees no loader.
- **`apps/web`**: the room's arrival (`src/room/app.ts`), its page (`layout.ts`, `room.css`), a new loader view and progress kernel, the 3D stage (`scene.ts`) and its loader (`scene/loader.ts`) for when models are shown, the UI words (`room/ui-words.yaml`, `src/room/ui-keys.ts`), a new hints file (`room/hints.yaml`) with the compositor's checks and the index's field, and the usage events (`src/room/events.ts`, which regenerates `config/room-events.yaml`).
- **The dashboard** (`deploy/grafana/dashboards/h4-runtime.json`) and **the disclosure** (`docs/data-flow-disclosure.md`, row V4).
- **Specs 000, 002, 004, 005, and 009**, whose clauses the spec amends by name: the dashboard's room row, the screens and the hand-off, when models parse, the HUD's loading line, and the figures' wait.

## Constraints

- **Degraded mode first** (the constitution's Principle I): "Every user-facing capability MUST define its degraded mode before its happy path."
- **Every byte that leaves is disclosed** (Principle I; `CLAUDE.md`): "data-flow disclosure entry (`docs/data-flow-disclosure.md`) if a byte leaves the visitor's device". The loader adds no request and no new destination; its one event joins row V4.
- **A feature has its graph** (workflow step 7): "A feature without a graph is not done."
- **Spec 002's SC-005**: "On a typical 4G connection, the choice screen is usable within 3 seconds of opening the page, and the hand-off begins no later than 10 seconds after the page was opened, for 95% of test loads."
- **The entry chunk's budget**: spec 002's 150 KB, compressed (`apps/web/test/room/chunk.test.ts`), with the index at most 16 KB within it; 40,599 bytes were used after spec 005.
- **The AI disclosure stays in view** (Principle VIII; spec 005's FR-021), above anything the loader dims.
- **Accessibility**: WCAG 2.2 level AA, as specs 002, 004, 005, and 008 hold the room.
- **The source's words**: his hints stay in his words; a reading goes beside them.
- **No new dependency**, font, image, or file from outside the repository.
- **The room's files keep their integrity check** (spec 004's R-28; spec 009's FR-022).

## Expected cost impact

- **Model spend: $0.** Nothing here calls a model.
- **Cloud: $0 before publication** (ADR 0013: the Author is the only visitor). After it, no new file or transfer: the same files load at the same moments, and the loader only watches them. The one new request is at most one usage-event beacon per visit whose loading is cut short, about 30 bytes of body on an existing route.
- **The visitor's device**: the same parsing work as today, done before the hand-off rather than after it; a dimming layer and a small card while the loader shows.
- **The entry chunk**: the loader's code, styles, words, and hints, an estimated 3 to 8 KB compressed.
- **Development time**: agent sessions on the Author's existing plan.

## Data-flow impact

One new usage-event kind on row V4's existing flow, with no identifier, sent at most once a visit, when the loader gives way at its ceiling with files still loading. Row V4's Trigger gains it in the change that sends it. Nothing else leaves the device: the bar reads the room's own loading state in page memory.

## Open questions

For the spec to answer, provisionally, or to carry to the Author:
1. What does the bar measure, and does the room wait for its studio models before the hand-off?
2. What is "the web page faded in the background": which page, and what does it show while loading?
3. Where does the loader meet the door's choice screen?
4. How do the hints cycle?
5. What happens when a file is slow, stalls, or fails?
6. His first two hints invite questions: "how this web site is built" and "the latest work". Free talk isn't ready (`config/twin-readiness.yaml`), and the site's own corpus file, `corpus/08-hareet-ai.md`, is in no topic's pack (`config/room-topics.yaml`). Are they shown before the twin can take those questions?
7. Which usage event, if any, and which panel?
