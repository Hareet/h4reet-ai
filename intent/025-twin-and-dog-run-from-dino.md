# Intent: the twin and the dog run from the dinosaur
Author: the Author (his order of 2026-11-13, item h), drafted by the night-shift spec-writer on the night of 2026-11-13, and reworked on 2026-11-14 after the review rv-spec-025. Status: draft. Created: 2026-11-13.

## Problem

The Author's night-shift order of 2026-11-13, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

His item, the letter and the title in his words:

> h) "twin and dog running from dino"

His orders file lists it as item 8 and adds "Needs c, d, and e."; the number and that note are the orders file's, not his words.

The items it needs are c, "avatar walking leg animations" (spec 019), d, "dog modeled and brought in" (spec 020), and e, "dinosaur modeled and brought in" (spec 021). Today the twin stands at its place, the room has no dog figure of its own, and the dinosaur is one of the four avatars a visitor chooses.

## Proposed outcome

Only what the item says: the twin and the dog run from the dinosaur. Reading (the spec-writer's, for the Author to correct, never in place of his words): the dinosaur is the visitor's figure when the visitor chose the Dinosaur (spec 021's Q1); when that figure walks the room, the twin and the room's dog move away from it on the room's floor, the twin's legs by spec 019's gait and the dog by its own clips from spec 020.

## Affected users and systems

Visitors (the room's scene: a dog figure of the room, and the run), the Author (his look approval of each asset it relies on is specs 019 to 021's, not this one's; the run's look is his), the room's runtime, its build's first-visit check, and its tests. No cloud, corpus, or CI change.

## Constraints

The constitution's principles apply: degraded mode first (the twin and the dog stay where they are when any of the three items' files can't show), honest AI (the twin is stylized, shown by his choice; the dog's likeness line, spec 020's, shows wherever the dog's model shows), the first visit's budget, reduced motion, and no byte about the visitor's choice of avatar leaving the device. Needs items c, d, and e: it can't ship before them.

## Expected cost impact

None in the cloud. Dev-time model spend only.

## Data-flow impact

None expected: no new byte leaves the visitor's device. The room's dog figure's files are the site's own static files, row V1's.

## Open questions

What starts and ends the run, whether the dinosaur ever catches them, where they run to, what the visitor's walking becomes during the run, what the twin does while it talks, and whether the room's dog shows beside a visitor who chose the dog: carried to the spec's clarifications, each with a recommended answer.
