# Contract: the room's screens, objects, and modes

What the visitor sees and can do, with the IDs other parts use. Spec: FR-001 to FR-011, FR-042 to FR-048, FR-057. Plan: §4. Research: R-03, R-04, R-11, R-13, R-14.

## 1. Screens

| Screen | Shows | Leaves when |
|---|---|---|
| **Choice** | the path (two radio buttons: "Engineer", "Not an engineer"); the avatar (four radio buttons with names and flat previews); the AI disclosure; the data-flow disclosure link; "Download the resume (PDF)"; "Enter" (disabled until both choices are made) | "Enter", with both chosen (FR-001) |
| **Hand-off** | the scene, the twin handing the paper; a live-region line | it ends, at most 5 s after it starts (FR-007, FR-008) |
| **After the hand-off** | two buttons, "Read the resume now" and "Keep it for later" | either |
| **Room** | the scene (3D or 2D); the "In the room" list; the toolbar: "Resume", "2D view", the AI disclosure; the conversation panel: the text box, "Send", and the talk button | — (a reload starts a new visit) |
| **Resume** | the interactive resume beside or over the room; "Download (PDF)"; "Close" | "Close" or Escape, back to the room with focus on "Resume" |

**The AI disclosure** is always visible ("You're talking with an AI representation of the Author, not the Author."), and wherever the twin speaks aloud, "Its voice is a cloned voice." (FR-004). The data-flow disclosure link is on the choice screen and in the room's toolbar.

**(spec 005)** In the room, the AI disclosure is the HUD's strip at the window's top, `index.html`'s own header fixed there, over the scene and in view at every scroll position and in full screen; the choice screen keeps its header (Amendment H6). The **Room** screen gains the full-screen control, in the bar after "Pause the room", where the browser reports that the page can enter full screen. The **Resume** opens over the room, in the clear area, as an opaque panel; "Close" and Escape still return focus to "Resume" (Amendment H2).

**(spec 012)** A **Loading** screen sits between **Choice** and **Hand-off**, in 3D only (its Amendment L1; FR-018, FR-024): from "Enter", the room's page is built as before, dimmed by a tint on each of its parts and inert, and the loader's card shows over it, in place of the stage's line "Loading the room…": a heading, "Loading the room"; a progress bar with its percentage and a line naming what is still loading; and hints below it. It leaves when the loader gives way: every needed file ended, the room fell to 2D, or 7 seconds after "Enter" (its FR-019, FR-020). The AI disclosure and the stand-in line are never tinted or covered (its FR-025). A room in 2D from "Enter" shows no Loading screen (its FR-003).

## 2. Objects

| ID | What | Topic | Position |
|---|---|---|---|
| `snowboard` | the snowboard hanging on the left | hobbies and general life | left wall |
| `bicycle` | the bicycle hanging on the right | travel adventures | right wall |
| `laptop` | the laptop and screen on the desk | work projects | the desk |

Each object is a mesh with `userData.objectId`, a raycast target for pointer and touch, and a `<button>` in the "In the room" list with the object's name and topic. All three paths call `selectObject(id)`. The window, its artwork, the view, and the desk are scenery, not objects.

## 3. The hand-off

- **Length:** 4.5 s in 3D, never more than 5 s.
- **Reduced motion:** 1 s, a crossfade of the paper from the twin's hand to the visitor's avatar.
- **2D mode:** three still frames, 1.5 s each.
- **No skip:** no control skips it, and keys and clicks during it do nothing but move focus.
- **Announced:** at its start, the live region (polite) gets "The twin hands you a paper: the Author's resume." At its end, focus moves to "Read the resume now".
- **(spec 012)** **When it starts:** once the loader has given way (its Amendment L2; FR-019) and spec 009's wait for the figures has ended, and never before. **No skip** covers the loader too: no control skips it (its FR-023).

## 4. Modes and quality

| Mode | Entered when | Shows |
|---|---|---|
| `3d` | WebGL 2 is available, at the start | the Three.js scene, at quality 0 (full) |
| `reduced` | the 5-second median frame rate is below the target (30 on a touch-primary device, 60 otherwise) at quality 0; each further miss steps quality 1 → 2 → 3 | lower pixel ratio, no shadows, smaller textures, fewer simultaneous animations |
| `2d` | no WebGL 2 at the start (before any 3D chunk loads); below 24 frames a second for 5 s at quality 3; a lost context that doesn't restore; or the visitor's "2D view" | an inline SVG of the work area, with the objects' buttons at their positions, and the same toolbar, resume, and conversation panel |

The mode never moves back up during a visit. Entering `2d` sends one `mode_2d` event.

**(spec 005)** `reduced` also turns the HUD's backdrop blur off from quality 2, and caps the drawing buffer at each level's pixel cap (`scene/levels.ts`'s `pixelCap`; spec 005's FR-010, FR-011). `2d` fills the window the same way, the drawing at 8:5 in the clear area under the same HUD. A resize, a turned device, full screen, and a change of pixel ratio re-fit the room in every mode, and never step the quality down (Amendment H4).

## 5. Keyboard and assistive technology

- **Tab order:** the toolbar, the "In the room" list, the conversation panel, then the resume when it's open. Focus is always visible (a 2-pixel outline at 3:1 contrast or better).
- **The canvas** has `aria-hidden="true"`. The list is the objects' accessible equivalent (FR-045).
- **Live regions:** the twin's and the narration's words (polite), and the hand-off line (polite).
- **Touch targets:** at least 44 by 44 CSS pixels. No hover-only cue.
- **The talk button** works with a held Space or Enter while focused (FR-026). Until recognition exists, a press announces `voice_unavailable` and moves focus to the text box (R-14).

- **(spec 005)** The toolbar is the HUD's bar at the window's foot; its Tab order is unchanged, with the full-screen control after "Pause the room". Each collapsible panel's header button comes first in its panel: the list's (`list.heading`) and the conversation's log's (`hud.log_toggle`). The order is the same in every layout, and 44 by 44 holds in every layout, the stacked one included (Amendment H3).

## 6. Layout

From 320 CSS pixels wide, in either orientation. In portrait, the camera's vertical field of view and the conversation panel's height keep the twin, the desk, the snowboard, the bicycle, the text box, and the talk button on screen without scrolling (FR-047). An orientation change reframes the scene and keeps the visit's state.

**(spec 005)** The canvas fills the browser's window, and the interface is a HUD of dark glass laid over it (Amendment H1): the AI disclosure as a strip at the top, a bar of controls at the foot, and one column on the right holding the list above the conversation; on a window held upright, the list, the text box, and the bar docked at the foot instead. Their places are one table, `compose/hud.ts`. The room is framed whole into the clear area the docked panels leave, the scene continuing behind them. The portrait guarantee (the twin, the desk, the snowboard, the bicycle, the text box, and the talk button on screen without scrolling) holds in the HUD. A resize, a turned device, full screen, and a change of pixel ratio each re-fit the room and keep the visit's state. Where the HUD can't fit (a high zoom, a large text size, a window under 320 CSS pixels wide), the stacked layout keeps this section's grid.

## 7. What the page never does

- It never writes a cookie, `localStorage`, `sessionStorage`, IndexedDB, or the URL with the visit's state (FR-003).
- It never requests anything from another origin (FR-057; the CSP enforces it, [web-serving.md §3](web-serving.md#3-headers)).
- It never asks for the microphone before a press that can reach recognition (FR-027).
