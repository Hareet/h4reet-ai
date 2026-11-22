# Intent: the resume in the visitor's hand
Author: the Author (Hareet), captured by Claude Code from his words. Status: accepted (the Author, 2026-11-22: "Go with your recommendations. Let's have you build it out in this session"). Created: 2026-11-22.

## Problem

When the visit starts, the twin hands the visitor the Author's resume, and the room stops on a box: "The twin handed
you the Author's resume." with two buttons, "Read the resume now" and "Keep it for later" (spec 002's hand-off;
`apps/web/src/room/layout.ts:401`, `apps/web/src/room/handoff.ts`, `apps/web/src/choice/visit.ts`). The visitor must
answer it before they can click around the room or talk, though the UI already has a resume button, clearly labeled.

The paper the visitor then holds is only a picture: hovering it shows nothing, and clicking it does nothing.

And the paper flickers while it's in the visitor's hand: its top half goes blank about every two seconds.

## Proposed outcome

In the Author's words, 2026-11-22, verbatim:

> "Let's remove the box and option selection "The twin handed you the Author's resume." with the buttons "Read the
> resume now" "Keep it for later". We dont' need that option anymore, we can have the visitor drop right into being
> able to click around the room or start the conversation. We already have the resume button in our UI clearly
> labeled. 2) Let's have the resume paper that is in the hand of the visitor be highlightable when hovered over and
> clickable that laucnhes the same link as the resume ui button. 2) The resume asset flickers when it is in the hand
> of the visitor. The top half of the resume paper flickers and goes blank every 2 seconds."

Read beside his words, not in their place:

1. No hand-off box: the visitor lands in the room able to click around or start the conversation at once. The
   paper is still handed over, and the resume button stays the way to read it.
2. The paper in the visitor's hand highlights on hover and, when clicked, opens the same link as the UI's resume
   button. It is reachable by keyboard and has a name for assistive technology, as the room's other clickable things.
3. The paper no longer flickers: its whole face shows, steadily, while it's held.

## Affected users and systems

Visitors (desktop, phone, keyboard, screen reader); `apps/web` (the room's layout, the hand-off, the visit's choice,
the resume's port, the room's clickable pieces and their highlight); the room's tests and look-dev captures; the
data-flow disclosure only if the link changes (it doesn't: the same link as the button).

## Constraints

- Features as data: the paper's click and highlight reuse the room's existing clickable-piece behaviour.
- Accessibility at the room's level: keyboard, focus ring, name, reduced motion, forced colours.
- The resume link and its disclosure stay as they are.
- Spec 002's hand-off contract and any spec that depends on the box are amended, not left contradicting the code.

## Expected cost impact

None at runtime. Dev-time model spend for the spec and implementation.

## Data-flow impact

None. The click opens the same resume link the button opens today.

## Open questions

1. Does "Keep it for later" leave anything behind that other code reads (a saved choice, an event, a metric)? The
   spec removes or redirects each reader.
2. What does the paper's highlight look like: the room's existing hover highlight for clickable pieces, recommended.
3. The flicker's cause (z-fighting between the paper's face and the hand or a second mesh, a texture swap, an
   animation's keyframe, or the walking camera's near plane): the spec names it from a reproduction before the fix.
