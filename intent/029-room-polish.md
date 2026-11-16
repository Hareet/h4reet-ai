# Intent: the room's polish after the Author's review of the 028 line
Author: the Author (his review of `feat/028-room-after-review-p`, 2026-11-15, and his orders for night 4), drafted by the night-shift spec-writer for spec 029 on the night of 2026-11-16. Status: draft. Created: 2026-11-16.

## Problem

The Author ran `feat/028-room-after-review-p` locally and reviewed it, 2026-11-15 about 21:00 his time, verbatim:

> Okay feedback: Looks great! Dinosaur is in there and the scene of the twin and dog leaving the bicycle works, along with the eating of the desk! A few things to improve: 1) The Interface on both sides of the room looks great, but when walking around or using a smaller browser window, the interface overlaps with the room, i think we could make the interface have an opaque or transparent background, so that it way in those conditions the interface won't block the room visibility. You can see this in the latest screenshot in resume/ 2) We seem to have broken the conversation chat, let's ensure we test it, from the latest screenshot in resume/ you can see that we can't see the chat output in the box below the input text field of "your message" 3) Tying up some last asset polishing, let's add "I AM VERY BUSY" to the desk-sign, let's add "My dog things I'm cool" with a paw print to the dog sign, and let's make the resume paper that the visitor holds into a drawn asset paper that says "RESUME" in diagonal. The monitor should say "Applied AI Engineer" with the cursor in green font

He added one more item a few minutes later, verbatim:

> Oh one more item we want to add to that spec: Let's make the character selection screen more Game-like. "Step 1: Select your role" and then a card that displays the output of that selection, The twin will describe projects and goals as if talking to a non-technical person, etc". "Step 2: Select your avatar' And then game-character like selection cards for our choices

His answer to one question (2026-11-15), as his orders record it:

- The words on the pieces: "Drawn in the room's code (Recommended)": the text and the paw print are drawn as textures on the existing pieces (no studio round, no new model); the monitor reads "Applied AI Engineer" with a green cursor.

The option label in quotes is his choice; the text after the colon is how the orders record what that choice means.

His screenshot (`resume/Screenshot 2026-11-15 205554.png`, in his checkout, untracked) is out of this session's reach. The orders describe it, in their words, not his: "the walking view, a visitor in front of the desk. The right column's piece list (Snowboard to Dog) and its dark panel cover the right part of the room and the twin; the bottom-right buttons sit over the floor. The conversation panel on the left reads "SERVING Unknown", "THIS CALL no call yet", "THIS VISIT $0"; the field holds "What is this" with Send focused; the box below it is empty, with no answer and no message."

## Proposed outcome

Only what his review and his added item say. Reading (this intent's, for the Author to correct; it is not his): his points 1 to 3 and his added item each become one group of spec 029's requirements; "My dog things I'm cool" is read as "My dog thinks I'm cool", a reading put to him as a question, his words quoted as they are.

## Affected users and systems

Visitors (the side panels over the room, the conversation's answers, the words on four pieces, the selection screen at the door), keyboard, screen-reader, phone, and reduced-motion visitors, the Author (his look, his answer on the dog sign's words and on any wording that speaks for him), the room's runtime and tests, and possibly his running stack (if the conversation's fault is in it rather than in the page).

## Constraints

The constitution's principles apply: honest AI (the top banner and the disclosure stay), degraded mode first (the conversation's failure must show as text, not as an empty box), accessibility (contrast over the room, keyboard and screen-reader use of the selection screen, reduced motion), the corpus is the Author's hand only, no fact about him outside the corpus, and no byte about the visitor's choice leaves the device. What stays his: every merge and push, every human-only path, his look approval, and any check that needs his running stack.

## Expected cost impact

None in the cloud expected; the panels, the words, and the selection screen are local. The conversation's fix restores calls that were already budgeted. Dev-time model spend only.

## Data-flow impact

None new expected.

## Open questions

Why the conversation shows no answer (the page, his stack, or his gateway); whether "My dog things I'm cool" means "My dog thinks I'm cool"; whether any of the pieces' words must be corpus; what each role card may say about the visit without speaking for him: carried to the spec's clarifications, each with a recommended answer.
