# Contract: the loader's progress, its giving way, and when the room's files are shown

The interface between the room (`apps/web/src/room/app.ts`), the 3D stage (`scene.ts`, `scene/loader.ts`), and the loader (`src/room/loading/`). Spec: FR-001 to FR-027, FR-037, FR-038, FR-046, FR-049. Plan: §2 to §5. Every name below that doesn't exist on the branch's base is the plan's, and a file named here that doesn't exist yet is named in a code span, never linked.

## 1. The parts

A room in 3D has five parts. A room in 2D has none, and shows no loader (FR-003).

| Part | Kind | Share of the bar | Ends when | From |
|---|---|---|---|---|
| `code` | step | 10 | the 3D chunk's import resolves (the scene module) | `app.ts`'s `scene` promise, begun behind the choice screen |
| `text` | step | 2 | `room-data.json`'s first load at "Enter" settles, loaded or failed (its retry 10 s later is not waited for) | `app.ts`'s `loadText(1)` |
| `typefaces` | step | 3 | every typeface the index names has arrived or failed, or `TYPEFACE_WAIT_MS` (2 s) has passed | `faces/fonts.ts`'s loader, which gains `settled(): Promise<void>` |
| `files` | bytes | 85 | every expected file has ended (`loaded`, `failed`, or `skipped`) | the 3D stage's `expected` (§3) and the room's asset events (`recordAsset`) |

The shares are the plan's (PD-3), whole numbers summing to 100, each one edit in `loading/progress.ts`'s table.

**The files' part.** Each expected file counts `bytes / total × 85`, where `bytes` is its served size (the 3D part's `bytes`, the `.glb.gz` copy's length, C11) and `total` the sum over expected files, once the asset event for its `asset` reports `loaded`, `failed`, or `skipped`. A `retried` event counts nothing. An expected file counts once, whatever events follow. An asset event whose `asset` no expected file names counts nothing. Until `expected` resolves, the files' part counts 0; once it resolves with no file, or with a total of 0 bytes, the part has ended.

**Why the ends, not the bytes in flight.** The loader fetches with `integrity` (spec 004's R-28, step 3), which, as the Fetch standard reads, resolves the response only once the whole body is read and checked. So the page can't count a file's bytes as they stream without moving the check into the page, which this contract doesn't do (FR-015). The plan's T001 confirms the browsers' behaviour.

## 2. The progress model (`src/room/loading/progress.ts`)

A pure module, no DOM, no clock, tested in Node.

```ts
export type Part = "code" | "text" | "typefaces" | "files";
export type Outcome = "loaded" | "failed" | "skipped";
export interface ExpectedFile { readonly asset: string; readonly bytes: number }

export interface ProgressState {
  /** A whole percentage, 0 to 100, never lower than any earlier value; 100 only once every part has ended. */
  readonly value: number;
  /** What the stage line names (FR-016). */
  readonly stage: "code" | "pieces" | "finishing" | "done";
  /** The expected files ended, and their count: the stage line's {done} and {total}. */
  readonly done: number;
  readonly total: number;
  /** Whether every part has ended. */
  readonly complete: boolean;
}

export interface Progress {
  ended(part: Exclude<Part, "files">): void;
  expected(files: readonly ExpectedFile[]): void;
  asset(asset: string, outcome: Outcome | "retried"): void;
  readonly state: ProgressState;
}

export function createProgress(): Progress;
```

Rules:
- `value` is ⌊the sum of the ended shares⌋, the files' share counted in proportion, and is held at the highest value reached, so it never goes down.
- `value` is 100 only when `complete`; while not complete, it is at most 99, even where rounding would give 100.
- `stage` is `code` while `code` hasn't ended; else `pieces` while the files' part hasn't ended; else `finishing` while `text` or `typefaces` hasn't; else `done`.
- `expected` is taken once; a second call is ignored. Duplicate `asset` names in it count once, at their largest `bytes`.
- Every method is total: it never throws on an unknown part, asset, or outcome; it ignores them.

## 3. The 3D stage's side (`stage.ts`, `scene.ts`, `scene/loader.ts`)

**`Stage3D.expected: Promise<readonly ExpectedFile[]>`**, a new field. It resolves once the loader chunk has built the entries, with each `modelEntries(part)` entry and each `figureEntries(part, avatar)` entry as `{ asset, bytes }`; with `[]` where the part sets no model and no avatar loads, or the device is below ADR 0010's floor (each file is then `skipped` at once, as today); and with `[]` where the loader chunk fails to load (each model is then `failed` or `skipped` at once, as today, `scene.ts`'s catch). It never rejects.

**The parse gate.** `LoaderOptions` gains `modelGate?: () => Promise<unknown>`, which the set models take as figure files take `figureGate` today: the 3D stage gives both the same function, `() => (started ? handoffEnded : Promise.resolve())`, where `started` turns true at the stage's first `showHandoff`. So a set model parses at once while the hand-off hasn't started, the loader showing, and after it ends otherwise. Without `modelGate`, as on the lookdev page, a model waits for `handoff`, as today.

**The swap gate.** A set model whose parse began before the hand-off started, and ended during it, swaps only once the hand-off has ended, as spec 009's FR-022 has it for avatars. `LoaderOptions` gains `swapGate?: () => Promise<unknown>`, which the 3D stage gives as `() => (started ? handoffEnded : Promise.resolve())`, awaited between the parse and the swap. Its quality hold covers the wait.

**Unchanged:** the fetch (`integrity`, `redirect: "error"`, same-origin, the 10-second timeout, one retry, four at once), the two parse slots, the holds, the texture ledger, the asset events and their fields, the order (`load_order`, after the figures' fetches), `stop()`, and `reload()`.

## 4. The room's sequence (`app.ts`)

At "Enter", in `arrive`, in this order:

1. Build the room's page as today (`renderRoom`), inert (`setInteractive(false)`), and apply the HUD (`refit`). While the loader shows, "Around the room" is inert too (`layout.setLoading(true)`), and stops being so when it gives way (FR-027).
2. Where the device has WebGL 2 and the 3D chunk hasn't already failed: create the progress model; mark `code` ended if the scene module has already resolved; build the loader's view over the page (`loading/view.ts`), focus its heading, and say `loading.heading` once. Start the ceiling's timer, `LOADING_CEILING_MS`, on the room's clock. If building the view throws, go on with no view: the timer and the model still decide when the hand-off starts (FR-007).
3. Start the room's text and the typefaces as today; on each one's first settle, `progress.ended("text")` or `progress.ended("typefaces")`.
4. Await `sceneOrLate()` as today. On the module: `progress.ended("code")`, mount the 3D stage (`mount3d`), and pass its `expected` to `progress.expected`. On none or `late`: `toFlat` as today, which gives way with reason `2d` (FR-004).
5. Every asset event through `recordAsset` also goes to `progress.asset(event.asset, event.outcome)`, before the event's own queue.
6. On each change of the model's state, the view shows it (§5). When `complete`, give way with reason `ready`.
7. When the timer fires before that, give way with reason `ceiling`.
8. **Give way** (once, by the first reason): clear the timer; say `loading.ready` (reasons `ready` and `2d`) or `loading.cut_short` (`ceiling`); fade the view out (FR-022) and remove it; make "Around the room" reachable again (`layout.setLoading(false)`); move focus to the room's heading (FR-039); record the frame log's entry; and, for `ceiling` with `complete` false, emit `loading_cut_short` once a visit (FR-046). Then, once spec 009's figures wait has ended too, start the hand-off as today.

Where the device has no WebGL 2, steps 2 and 5 to 8 don't run, and the hand-off starts as today (FR-003).

`LOADING_CEILING_MS` is 7,000 (D2), in `quality.ts` beside `SCENE_WAIT_MS`, and a test holds it to at most 7,000 (FR-020).

## 5. The view (`src/room/loading/view.ts`)

**The scrim** is not one element. While the loader shows, the page's root carries `data-loading="on"` (`layout.setLoading`), and `room.css` lays a tint, a pseudo-element with `pointer-events: none`, over the stage's view, the bar of controls, the column or the dock, and "Around the room", and over nothing else: the AI disclosure's header and the stage's notes (the placeholder note and the stand-in line) are never tinted, so they stay undimmed by construction rather than by stacking order (FR-025, plan PD-9).

**The card**, in Tab order inside the room's element, after the room block and before "Around the room" in the DOM, fixed to the window and centred in it below the AI disclosure's header:

```text
section.room-loader[aria-labelledby=loader-heading]
  h2#loader-heading[tabindex=-1]            loading.heading
  div[role=progressbar][aria-labelledby=loader-heading]
     [aria-valuemin=0][aria-valuemax=100][aria-valuenow][aria-valuetext]
    div.room-loader-fill                    (its width from --loader-fraction)
  p.room-loader-percent[aria-hidden]        "64%"
  p.room-loader-stage[aria-hidden]          the stage line
  section.room-loader-hints[aria-labelledby=loader-hints-label]
    h3#loader-hints-label.visually-hidden   hints.label
    p.room-loader-hint[aria-live=polite][aria-atomic=true]   the hint's text
    p.room-loader-position                  hints.position
    button                                  hints.pause / hints.play   (aria-pressed)
    button                                  hints.previous
    button                                  hints.next
```

- The percentage and the stage line are hidden from assistive technology, since `aria-valuetext` carries both ("64%: Loading the room's pieces: 12 of 21").
- The fill's width is set through `style.setProperty("--loader-fraction", …)` on the bar, never a `style` attribute (FR-052).
- The card scrolls inside the window where its content is taller than the space below the AI disclosure (FR-042).
- The hint's polite region gets each new hint once (FR-031); the room's own status region gets `loading.heading`, `loading.ready`, and `loading.cut_short` (FR-038).

## 6. The hints' rotation (`src/room/loading/hints.ts`)

A small state machine on the room's clock:

| State | Advances every `HINT_MS` (6,000) | Enters when | Leaves when |
|---|---|---|---|
| `running` | yes | the loader shows; "Play hints" | the pointer enters the hint area (`hovered`); focus reaches a control (`stopped`); "Pause hints" (`paused`); the page hides (`hidden`) |
| `hovered` | no | the pointer enters the hint area | the pointer leaves (`running`) |
| `paused` | no | "Pause hints" | "Play hints" (`running`) |
| `hidden` | no | the page hides | it shows again (the state it left) |
| `stopped` | no | focus reaches any hint control | never, for this loader |

"Previous hint" and "Next hint" step in every state, wrapping at both ends; each restarts nothing. The timer restarts its 6 seconds at each change of hint. Under reduced motion a change of hint has no transition (FR-040).

## 7. The frame log (drafts builds only)

`signals/frame-log.ts` gains one event, `loading`, with these fields, never a file's name or a hint's words:

| `state` | Other fields |
|---|---|
| `shown` | `value` |
| `ended` | `part`, `value` |
| `gave_way` | `why` (`ready`, `ceiling`, or `2d`), `value`, `done`, `total` |
| `hint` | `n` |

## 8. What leaves the device

Only `{"kind": "loading_cut_short"}`, on the beacon, at most once a visit, at step 8's `ceiling` with `complete` false (FR-046). The progress model, the view, and the rotation read page memory and send nothing (FR-001, FR-047).
