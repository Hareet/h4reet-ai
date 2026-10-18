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

## 4. Modes and quality

| Mode | Entered when | Shows |
|---|---|---|
| `3d` | WebGL 2 is available, at the start | the Three.js scene, at quality 0 (full) |
| `reduced` | the 5-second median frame rate is below the target (30 on a touch-primary device, 60 otherwise) at quality 0; each further miss steps quality 1 → 2 → 3 | lower pixel ratio, no shadows, smaller textures, fewer simultaneous animations |
| `2d` | no WebGL 2 at the start (before any 3D chunk loads); below 24 frames a second for 5 s at quality 3; a lost context that doesn't restore; or the visitor's "2D view" | an inline SVG of the work area, with the objects' buttons at their positions, and the same toolbar, resume, and conversation panel |

The mode never moves back up during a visit. Entering `2d` sends one `mode_2d` event.

## 5. Keyboard and assistive technology

- **Tab order:** the toolbar, the "In the room" list, the conversation panel, then the resume when it's open. Focus is always visible (a 2-pixel outline at 3:1 contrast or better).
- **The canvas** has `aria-hidden="true"`. The list is the objects' accessible equivalent (FR-045).
- **Live regions:** the twin's and the narration's words (polite), and the hand-off line (polite).
- **Touch targets:** at least 44 by 44 CSS pixels. No hover-only cue.
- **The talk button** works with a held Space or Enter while focused (FR-026). Until recognition exists, a press announces `voice_unavailable` and moves focus to the text box (R-14).

## 6. Layout

From 320 CSS pixels wide, in either orientation. In portrait, the camera's vertical field of view and the conversation panel's height keep the twin, the desk, the snowboard, the bicycle, the text box, and the talk button on screen without scrolling (FR-047). An orientation change reframes the scene and keeps the visit's state.

## 7. What the page never does

- It never writes a cookie, `localStorage`, `sessionStorage`, IndexedDB, or the URL with the visit's state (FR-003).
- It never requests anything from another origin (FR-057; the CSP enforces it, [web-serving.md §3](web-serving.md#3-headers)).
- It never asks for the microphone before a press that can reach recognition (FR-027).
