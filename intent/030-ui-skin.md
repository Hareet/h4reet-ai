# Intent: the interface's skin: the right column in two halves, without blur; buttons as a swappable skin; dark pages; a studio image skin
Author: the Author (his review of the live site, 2026-11-16, and his answer to the page's Q1 the same evening, as his orders for night 5 record them), drafted by the night-shift spec-writer for spec 030 on the night of 2026-11-17. Status: draft. Created: 2026-11-17.

## Problem

He looked at the live site, 2026-11-16 about 19:15 his time, verbatim:

> 1. You can see from one of our latest two screenshots in the resume/ that the right side panel UI is not transparent, it is more blurred. We also want to change the UI buttons to look more like the screenshot in resume/ (the other one that is the latest). Let's separate the right-side panel UI into two halves, making the separation a horizontal slice. Then use the buttons, and let's create them in css and data so we can swap them out. 2) Let's make the character selection screen, the credits, the data flow all dark themed web pages, and use the same button styling if appropriate on the character selection screen. Maybe use the studio pipeline to create the buttons for UI? https://www.sprungstudios.com/how-to-design-a-ui-button-for-video-games/

His answer to the page's Q1, 2026-11-16 about 19:50 his time, verbatim:

> Let's use studio image skins now

His two screenshots (`resume/Screenshot 2026-11-16 191154.png` and `resume/Screenshot 2026-11-16 191244.png`, in his checkout, untracked) are out of this session's reach: `resume/` isn't in this worktree. The orders describe them, in their words, not his:

- 191154: "the live room at a wide window. The left panel holds a conversation with answers (THIS CALL $0.001079 est.; SERVING "Unknown", item F7). The right column, from "Back" and "In the room" down through the piece list (Snowboard to Dog, "Laptop and screen" selected) and the six buttons (Resume, 2D view, Pause the room, Full screen, How data flows, Credits) and "Stop walking", sits over the room with a strong blur behind it: the room is smeared, not seen."
- 191244: "his reference, a sci-fi pause menu (PAUSED, then RESUME, RESTART, OPTIONS, EXIT): a dark metal frame with chamfered corners and bolts; the selected button yellow with a glow, the others cyan, each with a bevel and an inner highlight. It is likely someone's game art: a style reference only. Draw our own in its spirit; copy nothing from it."

## Proposed outcome

Only what his words say. Reading (this intent's, for the Author to correct; it is not his): his item 1 is three asks (the right column not blurred, two halves split by a horizontal slice, and buttons in the reference's spirit made in CSS and data so they can be swapped); his item 2 is two (the selection screen, the credits page, and the data-flow page dark, with the buttons on the selection screen where they fit, and the studio pipeline for the buttons, which his answer to Q1 makes tonight's). Spec 030's groups A to D follow them.

## Affected users and systems

Visitors (the room's right column and controls, the selection screen, the credits and data-flow pages), keyboard, screen-reader, forced-colours, phone, and reduced-motion visitors; the Author (his look, his intake of the studio's files into `assets/`, any `assets/policy/` patch); the studio line (`scripts/studio/line.py`, a brief, a studio task, a judge, a record); the build.

## Constraints

The constitution's principles apply: accessibility (WCAG 2.2 AA contrast over the room, every button state, 44 × 44 targets, reduced motion), no byte about the visitor leaves the device, the studio's own models only (main's tools list with `outputs_ship: true`), nothing taken from the reference image, the corpus is his hand only, the human-only paths are his. What stays his: every merge, the look approval, the intake of studio files into `assets/`, and any `assets/policy/` change.

## Expected cost impact

None in the cloud expected; the skin, the pages, and the halves are local. The studio round runs on his machine with local models; its agent's session is dev-time model spend (row D4).

## Data-flow impact

None new expected for visitors. The studio's session is row D4's, as for every studio round.

## Open questions

What "two halves" means at each layout; whether the glass goes clearer than night 4's or only loses its blur; which buttons are primary; what the selection screen's cards take from the buttons; how the image skin reaches the selection screen without a fetch before "Enter"; which studio tools draw the set: carried to the spec's clarifications, each with a recommended answer.
