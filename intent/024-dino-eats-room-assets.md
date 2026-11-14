# Intent: the dinosaur eats chunks of the room's assets
Author: the Author. Status: draft. Created: 2026-11-13.

Drafted by the night's spec-writer from the Author's order of 2026-11-13. His item is quoted; nothing is added to it. His answer on the decision page accepts it or corrects it before any of it reaches main.

## Problem

His item, as his orders file lists it (his own words are the quoted letter and title):

> 7. i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard". Needs e.

The number 7 and "Needs e" are the orders file's, not his. The order that carries the item, in his words (2026-11-13):

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

How far the night goes, in his words (2026-11-13):

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

The orders file's "Needs e" points to his item e of the same order, "dinosaur modeled and brought in" (spec 021). Today the room's pieces (`apps/web/room/scene.yaml`) are whole studio models that only the visitor can select; nothing in the room can take a piece apart, and the dinosaur is a flat placeholder (`apps/web/src/choice/avatars.ts`).

## Proposed outcome

In his words, and no more:

> "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard"

How a chunk is made, when the dinosaur eats, and what happens to a piece afterwards are not his words yet; they are the spec's open questions below.

## Affected users and systems

Visitors who watch or play the dinosaur; the Author (the room's look); `apps/web` (the 3D room's pieces and the dinosaur's figure); spec 021's dinosaur, which this needs.

## Constraints

- Needs spec 021's dinosaur (his "Needs e"): nothing here ships before it.
- The room is production (constitution II): its degraded modes (2D room, reduced motion, a failed model) hold with the feature present.
- Every new asset or look change waits for the Author's look approval.

## Expected cost impact

None in cloud or model spend; the work runs in the visitor's browser.

## Data-flow impact

None expected. If the spec adds a usage event for a bite, it is a byte that leaves the device and needs a row in `docs/data-flow-disclosure.md` first (open question 3). The spec's provisional answer (its Q3, as page Q117 has it, over Q108) adds none: an event sent when the dinosaur eats would tell the stack the visitor chose the dinosaur, which row V4 says the usage events never carry. Nothing leaves the device for the eating, and the spec names the deviation this makes from the constitution's telemetry rules (its Assumptions A5); his answer on the page confirms or overturns it.

## Open questions

1. Who makes the dinosaur eat: the visitor, who has chosen it, or the room by itself?
2. What is a "chunk", and what does the piece look like after, and does it come back?
3. Does a bite send a usage event?
