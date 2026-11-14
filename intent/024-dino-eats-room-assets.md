# Intent: the dinosaur eats chunks of the room's assets
Author: the Author. Status: draft. Created: 2026-11-13.

Drafted by the night's spec-writer from the Author's order of 2026-11-13. His item is quoted; nothing is added to it. His answer on the decision page accepts it or corrects it before any of it reaches main.

## Problem

The Author's item 7 from his orders of 2026-11-13, word for word:

> 7. i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard". Needs e.

"Needs e" is his item e of the same list, "dinosaur modeled and brought in" (spec 021). Today the room's pieces (`apps/web/room/scene.yaml`) are whole studio models that only the visitor can select; nothing in the room can take a piece apart, and the dinosaur is a flat placeholder (`apps/web/src/choice/avatars.ts`).

## Proposed outcome

The dinosaur can eat chunks of the room's assets, among them the desk, the busy sign, the laptop, and the chalkboard: his words, no more. How a chunk is made, when the dinosaur eats, and what happens to a piece afterwards are not his words yet; they are the spec's open questions below.

## Affected users and systems

Visitors who watch or play the dinosaur; the Author (the room's look); `apps/web` (the 3D room's pieces and the dinosaur's figure); spec 021's dinosaur, which this needs.

## Constraints

- Needs spec 021's dinosaur (his "Needs e"): nothing here ships before it.
- The room is production (constitution II): its degraded modes (2D room, reduced motion, a failed model) hold with the feature present.
- Every new asset or look change waits for the Author's look approval.

## Expected cost impact

None in cloud or model spend; the work runs in the visitor's browser.

## Data-flow impact

None expected. If the spec adds a usage event for a bite, it is a byte that leaves the device and needs a row in `docs/data-flow-disclosure.md` first (open question 3).

## Open questions

1. Who makes the dinosaur eat: the visitor, who has chosen it, or the room by itself?
2. What is a "chunk", and what does the piece look like after, and does it come back?
3. Does a bite send a usage event?
