# Intent: The room's avatars: the visitor's chosen avatar, and a stand-in for the twin
Author: the Author (drafted by Claude from the Author's message of 2026-11-08, as the main session relayed it). Status: draft. Specified the same night under his "Let's finish this and keep going until you can", while he was away; he accepts or closes it. Created: 2026-11-08, in the spec's folder rather than `intent/`, as spec 008's intent was, so it moves nowhere when accepted.

## The Author's words

Verbatim, as the main session relayed them on 2026-11-08:

> "Okay, what's your overnight plan? Let's finish this and keep going until you can. We should be able to put in one of the visitors as my twin as a stand-in, say the woman visitor and the male one can act as my twin for the full demo to see everything working that we envisioned. Is that possible for you to get to by the time I wake up?"

**The main session's reading**, beside his words and never in their place: "in the full local demo, the visitor's figure shows the studio's woman avatar, and the twin's figure shows the studio's man avatar as a stand-in until the twin's own avatar exists."

**Claude's reading, as a list for the spec**, to correct where it's wrong:

- **"put in one of the visitors as my twin as a stand-in"**: one of the four visitor avatars is drawn in the twin's figure until the twin's own avatar exists. Which one is data, so it changes without code.
- **"say the woman visitor and the male one can act as my twin"**: read with the main session as two parts: the woman as the visitor in his demo, and the man as the twin's stand-in. The other reading, either one standing in, is the spec's Q1 option, and changes only a data value.
- **"for the full demo to see everything working that we envisioned"**: the room as specs 002 to 008 describe it, with avatars in place of flat shapes: the hand-off between two figures (spec 002's FR-007, "the twin's avatar hands the visitor's avatar a paper"), walking (spec 008), and the twin's figure as the one the visitor talks to (spec 007). "Everything working" also means nothing breaks when a file is missing or fails.
- **"Let's finish this and keep going until you can"**: the direction under which the spec's clarifications were taken provisionally. It isn't his acceptance of this intent, nor his approval of the spec.
- **"Is that possible for you to get to by the time I wake up?"**: a question for the main session. The plan answers it in order of work: both avatars standing in the room first, then the hand-off between them, then walking, then the phone.

## Problem

- **The figures are placeholders.** The visitor's figure is a flat cut-out of one of four flat shapes (`apps/web/src/choice/avatars.ts`, intent 000's "a generic woman, a generic man, a generic dinosaur, a generic dog"). The twin's figure is a capsule and a sphere ([its catalog entry](../../apps/web/room/catalog/twin-figure.yaml)).
- **The studio's avatars exist, and nothing can show them.** As the main session relayed the studio's hand-back on 2026-11-08, from a file listing, with no file opened: the woman and the man each have a model and three clips, an idle, an "idle-holding", and a "take"; the dog has a 21-bone rig named `dog`, an idle, and an in-place gallop; the dinosaur has 27 bones with a jaw, an idle, an in-place walk, and a 2.5-second roar. Spec 003's Phase 5, which would load them, waits for spec 001's site and relay, and spec 004's loader waits for "the figures" with a promise that resolves at once (`apps/web/src/room/scene/loader.ts`).
- **The twin's own avatar doesn't exist yet.** It is a likeness made from the Author's photos, which spec 004 puts after the room, and every file under `assets/twin/` needs the Author's approval and an approved disclosure line before it can enter (spec 003's arrival check, rules P1 and P3). So nothing can stand in there.
- **The paper hand-off is drawn for flat shapes.** The paper ends where a flat cut-out's hand would be, from the shape's size (`apps/web/src/room/handoff.ts`), and the studio's "idle-holding" and "take" clips look made for it.

## Proposed outcome

- In 3D, the visitor's figure shows the chosen avatar's model, standing at the visitor's place on the floor at the room's size for it, playing its idle, and holding the resume's paper once the twin has handed it over.
- The twin's figure shows a visitor avatar, the man by default, as a stand-in, and the room says plainly, in its own words, that the figure is a stand-in and not the Author's likeness. Nothing under `assets/twin/` is needed or read for it.
- The hand-off plays between the two avatars when both are ready: the twin holds the paper, and the visitor takes it.
- Walking (spec 008) moves the rigged avatar through the driver interface spec 008 built for it.
- When a file is missing, fails its check, or fails to load, the figure keeps today's flat shape or capsule, and the room goes on. The 2D room keeps its flat shapes.
- The Author brings the woman's and the man's files in by hand, through spec 003's arrival check, as he brought in the room's 21 pieces.

## Affected users and systems

- **Visitors**, on desktop and phone, in 3D and in the 2D room, by pointer, touch, keyboard, and screen reader.
- **`apps/web`**: the room's 3D stage and loader, the figures' pictures and the hand-off, the walking driver (spec 008's), the stage's note and the text copy, the compositor's schema, checks, report, and bundle, the lookdev page, and the scene file's data.
- **Serving**: the web image's build (`deploy/scripts/web_image.py`, `apps/web/Dockerfile`), so `make up` serves the avatars.
- **Telemetry**: the usage events, `config/room-events.yaml`, the gateway's room-events route's tests, spec 000's telemetry contract §7.8, and the dashboard's "Room" row.
- **The data-flow disclosure**: rows V1 and V4.
- **The Author**: his acceptance of this intent and the spec's provisional answers; the intake of the woman's and man's files; his lookdev and phone runs; his gates and merges.
- **Specs 002, 003, 004, and 008**, whose clauses the spec amends by name. Spec 003's Phase 5 stays for the twin's own avatar and the site's relay.

## Constraints

- **Honest AI (Principle VIII).** "The twin is always disclosed as an AI representation of the Author, never presented as the Author." The stand-in must never be presented as the Author's likeness.
- **Degraded mode first (Principle I).** Every failure of an avatar has a defined fallback, defined before the happy path.
- **Data-local (Principle I).** The avatars come from the site's own origin, as the room's models do, but their paths show which avatar the visitor chose. That is disclosed, as spec 003's FR-040(a) planned, in the change that serves them.
- **Production-grade (Principle II).** Tests for every behaviour, telemetry with no payloads, a dashboard panel, a cost estimate, and documentation.
- **The local tier is production.** `make up` must work with the files and without them.
- **Assets.** Agents never edit `assets/**`, `tools/gates/**`, `corpus/`, `.claude/**`, `CLAUDE.md`, `REVIEW.md`, or the constitution. The files come in by the Author's hand.
- **The caps.** `assets/policy/caps.json` on `main` sets the avatar caps, and the scene's texture memory had 41,373,819 bytes of headroom in the last room report (`docs/merge-requests/2026-11-07-feat-004-room-models.md`), which two avatars could exceed.
- **The lifecycle.** No code before an approved spec and plan.

## Expected cost impact

- **Model spend:** none. No avatar calls a model.
- **Cloud:** none before publication, when the Author is the only visitor. After it, a first visit fetches up to two avatar folders, about 10 MB as the files stand, cached after; at 1,000 first visits a month, about 10 GB of transfer, under $1 at typical CDN rates. At most one small usage event per visit whose avatar fails to load.
- **Dev time:** the Claude Team plan. The Author's time: the intake, and the lookdev and phone runs.

## Data-flow impact

The avatar files are same-origin requests (spec 002's row V1), and their paths show which avatar the visitor chose, since only the chosen one is fetched beside the stand-in; row V1 says so in the change that serves them. If the spec adds a usage event, it rides the existing beacon (row V4) with no identifier, and row V4 names it in the same change. Spec 003's asset events stay switched off until spec 001 carries them.

## Open questions

For the spec, which answers them provisionally under "keep going until you can":

1. Which avatar stands in for the twin, and what if the visitor picks the same one?
2. How does the room say the figure is a stand-in, and where?
3. How big is each avatar, and where does it stand?
4. When does the hand-off use the avatars' hands and clips?
5. How is the feature observed: an event, a panel, or nothing new?
