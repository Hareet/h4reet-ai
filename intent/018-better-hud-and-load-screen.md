# Intent: A better HUD, from his examples, and a load screen to match
Author: the Author (drafted by the night-shift spec-writer from the Author's words of 2026-11-13, as the supervisor's brief relays them). Status: draft. Created: 2026-11-14.

His answer on the decision page accepts this intent, or corrects it, before any of it reaches main.

## The Author's words

Verbatim, as the brief relays them.

> "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog."

His item, in the brief's quotation of it: "better HUD with examples provided, and load screen". This intent is item a). The other items are other intents.

How far the night goes, in his words (2026-11-13):

> "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over"

## The examples

His two examples are screenshots of another game's menus. They stay outside the repository, in `~/night-inputs/hud/`, because the art and branding aren't ours; the night-shift session that wrote this could not open them. What follows is the supervisor's description of them, which is not his words. Correct it where it's wrong.

- **Left side: the conversation.** His file is named `conversation-left-side`. A translucent dark panel with a soft, rough-edged frame fills the left half. Above it at its top-left is a title. At its top-right is one action hint: a button glyph and a short label. Inside the panel, at its top-left, is a small emblem. Beside the emblem is a row of three stats, each a small capitals label above a large value. Below them are two short paragraphs of body text, in the panel's left two-thirds. The speaking character stands at the panel's right edge, overlapping the frame.
- **Right side: choosing.** His file is named `item-selection-right-side`. A right-aligned list on the right of the screen. At the top-right is "Back" with its button glyph. Above the list is a small capitals label, "Select a …". The selected entry is larger and in the accent colour, with hand-drawn strokes above and below and the confirm glyph to its right. The other entries are muted off-white on the same right edge, with generous spacing.

The brief's instruction: take the placement and patterns from it, and use the room's own art, type, and colours.

## Problem

Said by the Author's item: he wants a better HUD, he has examples of what he means, and a load screen goes with it. How the HUD and the loader look today is in specs 005, 012, and 014. What is wrong with them, beyond his words, is not his; the spec names it as a reading, not a fact.

## Proposed outcome

- A HUD whose conversation sits on the left and whose choosing sits on the right, placed and patterned as his two examples show, in the room's own art, type, and colours.
- A load screen to go with it.

## Affected users and systems

Visitors on every screen and input; the Author, who judges the look. The room's web app (`apps/web`); specs 005, 012, and 014 are amended where they place the HUD.

## Constraints

The examples' art and branding are not ours and stay outside the repository. His order to go beyond the plan and approval applies: the night goes on to implementation and review, and every answer taken is his to overturn on the morning page. Every merge, and the look approval, are his.

## Expected cost impact

None expected: the room is static. The spec carries the estimate.

## Data-flow impact

None expected: no new byte leaves the visitor's device. The spec confirms it.

## Open questions

Carried to the spec: which "choosing" the right-hand list is; what the emblem, the three stats, and the speaking character show; what the action hints do; what the "hand-drawn strokes" are drawn as. Each is in the spec's Clarifications with a recommended answer.
