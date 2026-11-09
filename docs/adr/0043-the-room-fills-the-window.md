# ADR 0043: The room fills the window: a HUD over a full-window scene, the clear area as the stage, and full screen of the page (spec 005)

Status: proposed, 2026-11-09 · Spec: 005 (FR-001 to FR-068; its Clarifications, the Author's answers; plan §1, PD-1 to PD-25, and its departures) · Supersedes the Author's answer of 2026-10-26 to spec 004's D4 (a drawer); amends [ADR 0036](0036-the-room-composed-from-data.md)'s supported stages and [ADR 0039](0039-the-walking-view.md)'s walking control's stage, each by name; replaces no decision of either · Number: the next free one after spec 011's 0042, on `feat/005-full-window-room` when its task T002 ran (0037 stays reserved for spec 004's look)

## Context

After his first visit to the live room, on 2026-11-09, the Author wrote, as spec 005's intent records his words:

> "Okay, walk around is wokring but it's still the placeholders and not the full avatars with rigging? And how do i see it in full screen, or is this how we envisioned it with the interface tabs laid out next to them? Let's organize the interface better, should we make the room responisive, as in the room takes up the whole browser window and the interface is laid over top of it with opaque and make it more game click-able buttons? Everything else is working good, the highlight, the clicking."

And later the same day, as the main session relays it:

> "When we say the "room fills the whole window", i don't mean the little window inside the browser page, we were meaning the browser window. Is it possible that the assets and game are responsive, so if someone makes the browswer window larger, it fills out appropriately"

Until this change the room drew in a stage inside a page column of at most 72rem: about 686 × 640 CSS pixels on a 1920 × 1200 window, with the toolbar, the list, and the conversation laid out beside and below it. Spec 004 judged every selectable's pick area, legibility, and framing at stages computed from those rules (its RG5 to RG7). On 2026-10-26 he had taken spec 004's D4 (a), a drawer, adding: "Okay, for your 5 questions go with the recommendation but note that we may change D4 to "panels laid over the scene, always visible" at a later point in time."

His answers of 2026-11-09, verbatim: "Translucent HUD (Recommended)"; "Bottom bar, plus one column on the right"; "Use the dark glass recommendation and just go ahead with putting everything in instead of approval at lookdev first"; "Only when asked (Recommended)" (the larger conversation); and "Whole room, more around (Recommended)" (contain framing). He approved the spec and its plan with "Approve and build (Recommended)".

## Decision

1. **The canvas is the window** (FR-008 to FR-013): in the room, the canvas fills the browser's viewport, its width and its dynamic height, with no page frame, maximum width, or panel around it. Its drawing buffer follows the device's pixel ratio, capped by the quality level's ratio and by a per-level pixel cap (`scene/levels.ts`), and one `refit` follows every change of the window, the quality controller held while it does.
2. **The HUD's placements are kernel data** (FR-019, FR-020; plan PD-1): one table, `compose/hud.ts`, beside the supported stages, holds the column layout (the AI disclosure as a strip at the top, the bar of controls at the foot, one column on the right of at most 28rem holding the list above the conversation) and the dock layout for a window held upright (the strip, then the list, the text box, and the bar docked at the foot). `room.css` takes its numbers through CSS properties the room sets, and the stages test pins it to the table, so moving a panel is one edit. A data edit can't move the stages, as spec 004 keeps them out of the data files.
3. **The clear area is the stage** (FR-052 to FR-057; plan PD-7 to PD-10): the window less the docked panels, computed from the table, never measured from the page. The supported stages become these clear areas, and every screen of spec 004's sweep gets a stage at least as large as its stage before this change, held by a frozen copy of the old formulas in the tests. The checks' rules and floors don't change; the sweep extends to 5120 × 2160 and to portrait screens up to 2160 × 3840.
4. **Contain framing into the clear area** (FR-015 to FR-018; plan PD-12, PD-13; his "Whole room, more around (Recommended)"): spec 004's framing at the clear area's aspect, and one camera whose projection is shifted (`PerspectiveCamera.setViewOffset`) so the room sits in the clear area and the scene continues behind the panels in the same perspective. The picker, the walking view's taps, and its follow camera take the same shift.
5. **Dark glass at the computed floor** (FR-024 to FR-026; his "Use the dark glass recommendation and just go ahead with putting everything in instead of approval at lookdev first"): the panels' opacity is the lowest 5% step at which every text and mark passes WCAG's contrast over pure white and pure black beneath, a test computing it from `room.css`'s palette; a blur only at quality levels 0 and 1; opaque panels under reduced transparency, more contrast, forced colours, or no backdrop blur. The look ships without a lookdev approval; he looks at the live room after the merge.
6. **Full screen of the page's root, Escape left to the browser** (FR-036 to FR-042; plan PD-19 to PD-21): a control in the bar where the browser reports support, Alt+Enter beside it, and no keyboard, orientation, or pointer lock. Every Escape handler in the room leaves an Escape to the browser while the page is in full screen. One usage event, `fullscreen_entered`, once a visit, with row V4's trigger naming it (D1, provisional).

## Alternatives considered

- **A drawer that slides in from the right, and a sheet on phones** (spec 004's D4 (a), his answer of 2026-10-26): never built; his answer of 2026-11-09 replaces it.
- **The placements as a YAML file under `apps/web/room/`** (plan PD-1): it would move the checks' input into data, which spec 004 keeps out of reach of a data edit.
- **Measuring the panels' boxes in the page** (plan PD-7): jsdom can't lay out, and measured boxes drift from the stages the checks judged.
- **A canvas the size of the clear area** (plan PD-12): no scene behind the glass, against the option's "the scene stays visible behind the panels".
- **Cover framing** (his option B of Q5): crops pieces out of the pointer's reach and fails RG5 by design.
- **Full screen of the room's own element** (plan PD-19): the AI disclosure would leave full screen.

## Consequences

- **Cost: $0 in the cloud**; at most one beacon per visit that enters full screen. The visitor's device draws more pixels, bounded by the pixel caps and the controller's levels; the Author's lookdev runs after the merge measure it (spec 005's SC-008, T049).
- **Every check only gets easier**: a stage can only grow, and the frozen copy of the old stages fails the build if one shrinks.
- **The stacked layout** (FR-007; plan PD-23) keeps the old grid as the fallback where the HUD can't fit: at a high zoom, a large text size, or under 320 CSS pixels wide.
- **The amended contracts** (spec 002's room-scene.md, room-events.md, and data-model.md; spec 004's room-data-files.md; spec 000's telemetry.md) carry passages marked "(spec 005)".
- **What building changed**: spec 005's plan records its departures in the commits that made them; this ADR is finished with them at its task T043.
