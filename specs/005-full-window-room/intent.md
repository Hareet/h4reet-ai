# Intent: The room fills the browser window
Author: the Author (drafted by Claude from the Author's messages). Status: accepted (2026-11-09). Created: 2026-10-26.

## The Author's words, 2026-11-09 (they supersede D4's drawer)

After his first visit to the live room, the Author wrote:

> Okay, walk around is wokring but it's still the placeholders and not the full avatars with rigging? And how do i see it in full screen, or is this how we envisioned it with the interface tabs laid out next to them? Let's organize the interface better, should we make the room responisive, as in the room takes up the whole browser window and the interface is laid over top of it with opaque and make it more game click-able buttons? Everything else is working good, the highlight, the clicking.

He then answered two questions in the session:
- "The full-window room is already intent 005 (you drafted it on 26 Oct, choosing a slide-in drawer, with 'panels laid over the scene, always visible' as the later alternative). You now want the room to fill the window with the interface laid over it as game-style buttons. Which overlay style should the spec take?" → "Translucent HUD (Recommended)". The option read: "The room fills the window; the list and the talk panel float over it as semi-transparent panels with large game-style buttons, always reachable; a full-screen button; the scene stays visible behind the panels."
- "Start spec 005 (the full-window room) now, while you get the avatars' records from the studio?" → "Accept and specify now (Recommended)". The option read: "Intent 005 is accepted with your new words, a spec-writer drafts the spec, and its clarify questions come to you; nothing is built before your approval."

So the layout is now the alternative D4 named, "panels laid over the scene, always visible", as a translucent HUD with game-style buttons and a full-screen button. The drawer below is history. The rest of this intent stands.

## Problem

The room is responsive today, but it sits in a panel: the page is at most 72rem wide (about 1152 px), the room's stage is at most 40rem tall (about 640 px), and in landscape the stage takes three fifths of the width with the "In the room" list beside it (spec 002's `room.css`, pinned for spec 004's checks in `apps/web/src/room/compose/stages.ts`). On a large monitor the visitor sees the room at about 690 × 640 px, not a scene that fills the window.

The Author, 2026-10-24:

> Everything now seems appropriate scale, and the final product experience will be responsive? Like how big their browser window is, it should take up the space as a responsive design. Is that a complete re-write that we should wait to spec and plan when our rate limit is reset or is that already part of the intention and how the experience will work?

## Proposed outcome

The room's stage fills the browser window at every size and shape. The list of things in the room and the talk panel are no longer columns beside it.

On 2026-10-26 the Author took the recommendation offered as D4 (a), "A drawer that slides in from the right on desktop, and a sheet that slides up on phones", adding:

> Okay, for your 5 questions go with the recommendation but note that we may change D4 to "panels laid over the scene, always visible" at a later point in time.

So the layout should make that later switch cheap: panels laid over the scene, always visible, is the known alternative.

## Affected users and systems

- Visitors, on every screen size: the room, its 2D drawing for devices without WebGL 2, the "In the room" list, the talk panel, the toolbar, and the text copy ("Around the room").
- `apps/web` only: `room.css` and the page's layout, `stages.ts` (its constants follow `room.css`, and a test keeps them in step), and the framing and checks that read those stages (spec 004's RG5 to RG7, the legibility floor, and pick spacing).
- Spec 002 (the room's layout) and spec 004 (the supported stages) are amended. The studio's models are not affected: they are built in metres, and only the camera's framing and the page around the room change.

## Constraints

- Accessibility stays whole: the list and the talk panel stay reachable by keyboard and screen reader whether the drawer or sheet is open or closed, focus moves into the drawer when it opens and back when it closes, and every selectable stays reachable from the list (spec 004's FR-063 and FR-064).
- The drawer and sheet respect reduced motion (spec 004's FR-059 and FR-060): no slide when motion is reduced.
- The smallest supported stages (a 320 × 568 phone in portrait, 568 × 320 in landscape) still fit their controls.
- Spec 004's checks keep running against the real stages: a larger stage may only make the spacing and legibility checks easier to pass, never weaken them.
- No new dependency for the drawer.

## Expected cost impact

None. No model calls and no cloud resources change. Dev-time model spend: one spec amendment and a layout change.

## Data-flow impact

None. No byte leaves the visitor's device that didn't before.

## Open questions

- On desktop, does the drawer start open or closed when the visitor enters the room? Does it close on its own when a topic starts?
- Do the list and the talk panel share one drawer (with tabs) or have one each?
- How tall is the phone's sheet at rest: a peek with a handle, or hidden behind a button?
- While the twin is speaking, does the talk panel need to stay visible (for captions or the transcript)?
- Does the 2D room fill the window the same way?
- Which parts of the layout should be configuration, so that switching to "panels laid over the scene, always visible" later is a small change?
