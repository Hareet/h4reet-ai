# ADR 0045: The room loads behind a loader: a game-style bar from "Enter" to the hand-off, the room's models shown while it shows, a ceiling that keeps spec 002's SC-005, and hints as data (spec 012)

Status: proposed, 2026-11-09 · Spec: 012 (FR-001 to FR-055; its Clarifications, taken provisionally and approved by the Author as taken; plan §1, PD-1 to PD-25, and its departures) · Amends spec 004's research R-28, step 4 (when a set model parses), and spec 009's FR-019 (a) and FR-022 (the figures' wait and when an avatar swaps in), each by name as the spec's Amendments L6 and L11 word it; replaces no decision of [ADR 0036](0036-the-room-composed-from-data.md) or [ADR 0043](0043-the-room-fills-the-window.md) · Number: the next free one across every branch when spec 012's T001 ran (0044 is `docs/001-ec2-default`'s)

## Context

The Author's words of 2026-11-09, as spec 012's intent records them:

> "We may as well get you working on a progress bar as the web assets are downloading, make it like a game progress bar with the web page faded in the background. We should have hints below the progress bar on how to interact with the twin, and what the neon sign displays, how we evaluate costs. "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure." "Ask about the latest work" "click on objects to have the twin start discussing them" . Add this as a complete item to your work to start as I'm away for dinner. You can do it!"

He approved the spec, its plan, and every provisional answer the same day: "Also we aprove of the spec 012: the loading screen".

Until this change, after "Enter" the room showed one line, "Loading the room…", until the 3D scene mounted (at most `SCENE_WAIT_MS`, 4 s), waited for the figures' avatars (at most the scene's `wait_ms`, 1.5 s), and played the hand-off. Its studio models, 6,593,757 bytes as served in spec 005's recorded build against about 200 KB of 3D code, were fetched from the 3D stage's mount and parsed and shown only after the hand-off ended (spec 004's R-28, step 4), so the visitor met the room as placeholder shapes that turned into models one by one once it was theirs.

## Decision

1. **A loader from "Enter" to the hand-off, in 3D only** (FR-003, FR-017 to FR-019; plan PD-1): the choice screen stays the door, and "Enter" is the game's "Start". The loader shows over the room's own page, in place of "Loading the room…", and gives way at the first of: every needed file ended, the room in 2D, or the ceiling. A room in 2D from "Enter" shows none.
2. **The bar counts the first visit's files as each ends** (FR-010 to FR-016; plan PD-3 to PD-5, PD-22): four parts, the 3D code (10%), the room's text (2%), the typefaces (3%), and the figures' files and the set models (85%, by their bytes as served). A file counts once its load has ended, shown, failed after its retry, or skipped, never within it, so the fetch keeps the browser's integrity check. Ends heard before the 3D stage says what it will load are kept and counted when it does. The value is a whole percentage that never goes down and reads 100 only when every part has ended.
3. **The room's models are shown while the loader shows** (FR-021; plan PD-6): a set model takes the gate a figure's file already takes, open while the loader shows and closed from its giving way to the hand-off's end; a parse begun before it finishes, and its model swaps in when the hand-off ends. So the room is whole when the hand-off plays, on a connection that allows it, and the hand-off itself stays smooth, R-28's reason.
4. **A ceiling that keeps spec 002's SC-005 by construction** (FR-020; plan PD-2, PD-7): `LOADING_CEILING_MS`, 7 s after "Enter", on the room's clock, owned by the room and not by the loader's view, so a view that throws can't hold the hand-off. Every failure takes the room's existing degraded path.
5. **The page behind, tinted by element, held still** (FR-024 to FR-027; plan PD-9, PD-10, PD-18, PD-20): a tint on each part of the room's page in each of spec 005's layouts, never on the AI disclosure or the stage's notes; the card is dark glass, fixed below the measured strip and the notes' reserve in the column and dock layouts, and first in the page's flow in the stacked one; nothing behind it takes input, and the scene's own motion is held by a hold of the motion store that shows no "Paused at".
6. **Hints as data, their figures from configuration** (FR-028 to FR-036; plan PD-12 to PD-14, PD-21, PD-25): `apps/web/room/hints.yaml`, the Author's three first and verbatim, then the session's, each with its sources, checked by the compositor's words family (RT2, RT3, RT9, and the new RT14 to RT17), its figures filled at build from `config/budgets.yaml`, `config/prices.yaml`, and `config/routing.yaml`, and carried filled in the index. One at a time, a new one every 6 seconds, paused, stopped, and stepped as the WAI-ARIA carousel pattern has it.
7. **One usage event** (FR-046 to FR-050; plan PD-16; D1): `loading_cut_short`, with no identifier, once a visit, when the ceiling cuts the loading short; row V4's trigger names it in the same commit, and the dashboard's "Room" row graphs it.

## Alternatives considered

- **A bar over today's waits alone** (Q1's B): the code usually arrives behind the choice, so the bar would show almost never and the room would still change after the hand-off.
- **Streaming each file's bytes and checking its SHA-256 in the page** (Q1's D): a smoother bar for moving a security check out of the browser.
- **A boot loader before the choice screen** (Q3's B): delays the door past SC-005's 3 seconds.
- **Downloading the models behind the choice** (Q3's D): about 6.6 MB for every visitor who opens the page, entering or not.
- **No ceiling, or a 15-second one** (Q5's D and C): amends SC-005.
- **One fixed scrim with the strip and the notes lifted over it** (plan PD-9): a backdrop filter on any ancestor makes a stacking context and would bury them.
- **The hints as a list in code** (plan PD-13): no compositor checks, and figures that go stale when a ceiling or a price changes.

## Consequences

- **Cost: $0 in the cloud**; no new file, request, or transfer but at most one beacon per visit cut short. On the visitor's device the same parsing, done before the hand-off rather than after it.
- **The hand-off can start later than before**: on a slow connection up to 7 seconds after "Enter", where it started within about 1.5 seconds of the scene's mount over placeholder shapes. The cut-short panel shows how often the ceiling binds.
- **The entry chunk grows** by the loader's code, styles, words, and hints, measured against spec 002's 150 KB and the index's 16 KB in the branch's note.
- **A change to a ceiling or a price changes the cost hints with it**, in a checkout's build and the web image's alike, once `fix/007-image-readiness`'s list carries the three paths (plan PD-21).
