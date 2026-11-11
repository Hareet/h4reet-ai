# Contract: the twin's states, its clips, its line, and the paper

The interface between the conversation panel (`apps/web/src/talk/talk.ts`), the room (`src/room/app.ts`, `stage.ts`, `scene.ts`), the twin's state machine (`src/room/scene/twin-states.ts`, new), the figures' controller (`scene/avatars.ts`), the hand-off (`scene/bundle3d.ts`, `flat.ts`), and the frame log. Spec: FR-014, FR-018 to FR-028, FR-031 to FR-034, FR-052. Plan: [plan.md](../plan.md) R-08 to R-11, R-17.

## 1. The panel's activity

`renderTalk`'s options gain:

```ts
/** What the twin's states need from the conversation, and nothing else (FR-022). */
onActivity?(activity: TalkActivity): void;

type TalkActivity =
  | { kind: "draft"; holds: boolean }   // the text box holds text the visitor typed and hasn't sent; on each input event and on send
  | { kind: "turn"; out: boolean }      // a turn went (true), or ended, answered, failed, or stopped (false)
  | { kind: "answer"; words: number }   // the twin's answer was appended under "AI twin"; its words, by whitespace
  | { kind: "selected" };               // a piece was selected, whatever its topic
```

- `answer` is sent only for a twin's answer, never for a fixed message (`cannot_talk`, `topic_not_ready`, a failure's message, `turn_stopped`).
- No activity carries words, a topic, a feature, a cost, or a time.
- The room passes each activity to the 3D stage (`Stage3D.twinActivity`), which passes it to the controller; in 2D, nothing reads them.

## 2. The states (`twin-states.ts`)

```ts
type TwinState = "arriving" | "answering" | "listening" | "resting" | "present";

interface TwinStates {
  /** The arrival: the hand-off's start where the twin shows then, else its first show; once a visit. */
  arrive(now: number, length_s: number): void;
  signal(activity: TalkActivity, now: number): void;
  /** Moves the timers on; returns the state now. */
  tick(now: number): TwinState;
  readonly state: TwinState;
}
function createTwinStates(block: { rest_after_s: number; speak_wpm: number; speak_s: [number, number] }): TwinStates;
```

The state is the first that holds, in this order (FR-021):

| Order | State | Holds |
|---|---|---|
| 1 | `arriving` | from `arrive(now)` for `length_s`, the greeting clip's length; `arrive` after the first does nothing |
| 2 | `answering` | from an `answer` for `clamp(words × 60 / speak_wpm, speak_s[0], speak_s[1])` seconds; a later `answer` restarts it |
| 3 | `listening` | while the last `draft` said `holds: true`, or the last `turn` said `out: true` |
| 4 | `resting` | from `rest_after_s` after the last moment any of 1 to 3 held or a `selected` came, until the next `draft` with `holds: true`, `turn` with `out: true`, `selected`, or `answer` |
| 5 | `present` | otherwise |

Times are the room's clock's, in milliseconds; the module reads no other clock and no DOM. It runs whether or not the motion store animates (FR-024).

## 3. The clips

- Each state's clip role is the bundle's `twin.block.clips[state]` (contracts/twin-data.md §1).
- A role whose clip isn't loaded, failed, or names a bone the model lacks plays `idle` in its place; with no `idle`, the rest pose stands still (FR-003).
- `greeting` plays once (`LoopOnce`); every other role loops. The mixer's `finished` for the arriving clip ends `arriving` at once, whatever the clock says.
- **Crossfades** (FR-023), while the motion store animates: 0.25 s; 0.4 s where the role left or entered is `desk-lean`.
- **Cuts** (FR-024), while it doesn't: the new role's action starts at time 0 with its weight 1 and the old one stops; no mixer advances, so the pose is the new clip's first frame.
- At quality level 1 or more, the twin's mixer advances and the visitor's doesn't (FR-025).
- Where the twin's figure shows the stand-in, none of this applies; spec 009's `wanted()` rules it (FR-026).

## 4. The line

One slot, the stage's note's second paragraph and the text copy's `{twin_line: true}`:

| The twin's figure shows | The slot says |
|---|---|
| its model (3D) | the index's `twin.line` |
| its still (2D) | the index's `twin.line` |
| the stand-in avatar, the capsule, or its 2D drawing | the UI word `twin.stand_in` |
| nothing yet (loading) | the UI word `twin.stand_in` |

The slot changes text in place when the picture changes; it isn't a live region, so nothing is announced (the stage's note today). The AI disclosure strip is untouched.

## 5. The paper appearing

`showHandoff(room, progress, reducedMotion, mode)` in `bundle3d.ts` gains `mode: "travel" | "appear"`, `travel` by default, today's.

- The controller decides the mode once, at the hand-off's first frame: `appear` where the twin's figure shows its own model, `travel` otherwise; the 2D room decides it the same way from its still.
- **`appear`**: the twin's sheet has opacity 0 at every frame; the visitor's sheet sits at the visitor's holding hand's grip (spec 014), or at the visitor's anchor where it shows its fallback, its opacity `progress` (0 at the start, 1 at the end); the figures' turns are spec 002's; the visitor plays `idle-holding` from the first frame where it has it, and no `take`; the twin enters `arriving`.
- **Reduced motion**: 1 s, no turns, the same fade.
- `handoff.ts`'s timing, `HANDOFF_LINE`, and the offer at the end are unchanged.

## 6. The 2D room's twin

- Where the index has `twin.still` and the room shows its 2D room, `flat.ts` fetches the still once, same-origin with `integrity`, turns the verified bytes into a `data:image/png;base64,…` URL, and draws an SVG `image` in the twin's place at `still.rect`, `preserveAspectRatio="xMidYMin slice"`, under a `clipPath` of the twin figure's projected box; the twin's drawing hides while it shows.
- On a failure after one retry, the drawing shows again, and the line slot says the stand-in line.
- The 2D hand-off's paper takes `appear` while the still shows.

## 7. The frame log (drafts builds)

Beside spec 009's `picture` and `clip` entries, for the twin:

- `{kind: "picture", figure: "twin", shows: "own" | "stand-in" | "fallback" | "still" | "drawing", why}`;
- `{kind: "twin-state", state, role}` on each state change;
- `{kind: "clip", figure: "twin", role}` as today.

Page memory only; a release build keeps none.
