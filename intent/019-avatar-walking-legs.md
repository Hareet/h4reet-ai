# Intent: Avatar walking leg animations
Author: the Author (his item, from his night order of 2026-11-13, "improvements, in your words", item c). Status: draft. Created: 2026-11-14.

## Problem
His item, word for word:

> 2. c) "avatar walking leg animations"

This section is the spec-writer's reading, beside his words and never in their place. In the walking view the visitor's avatar moves across the floor (spec 008), and spec 009's driver plays a "walk" clip where the avatar has one. The man's and the woman's folders hold `idle`, `idle-holding`, and `take` clips and no `walk` clip (`assets/visitors/man/`, `assets/visitors/woman/`), so today the avatar slides across the floor in its idle or `idle-holding`, its legs still.

## Proposed outcome
His words (the order of 2026-11-13): "avatar walking leg animations". Reading: while the visitor's avatar walks, its legs walk; when it stops, they stop. No more than that is read into his words.

## Affected users and systems
Visitors who press "Walk around" in 3D. The room's avatar controller (`apps/web/src/room/scene/avatars.ts`). Tests under `apps/web/test/room/`.

## Constraints
- Night order of 2026-11-13 applies: approval given ahead, provisional; small tests per task; the full suite once at the end of the stack.
- If a motion asset is needed, only the studio's tools list on main (P-7) is used; his look approval of any asset is his. A stand-in goes where an asset isn't there yet.
- Principle I: the degraded mode (no clip, no leg bones, reduced motion) is defined first.
- The first visit stays within its budget (specs 009, 016).

## Expected cost impact
None in cloud spend. Dev-time model spend: one spec and one small stack.

## Data-flow impact
None expected: no new byte leaves the device. A later studio walk clip would come from the site's own origin like the other clips (row V1).

## Open questions
Carried to the spec's clarifications: code-driven legs or a studio clip (or both); which figures; reduced motion; the quality tiers.

After the spec's Opus reviews, three more went to the morning page, Q61 to Q63 (the hips, the walk clip's time scale, allocation per frame); under each, the page has: "Answered: recommended, the Author 2026-11-13." The spec's Clarifications (Q6 to Q8) quote them.
