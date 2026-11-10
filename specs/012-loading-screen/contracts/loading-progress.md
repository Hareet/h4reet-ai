# Contract: the loader's progress, its giving way, and when the room's files are shown

The interface between the room (`apps/web/src/room/app.ts`), the 3D stage (`scene.ts`, `scene/loader.ts`, `scene/avatars.ts`), the motion store (`motion.ts`), and the loader (`src/room/loading/`). Spec: FR-001 to FR-031, FR-037 to FR-042, FR-046, FR-049. Plan: §2 to §6. Every name below that doesn't exist on the branch's base is the plan's, and a file named here that doesn't exist yet is named in a code span, never linked. Read at af82c6c5.

## 1. The parts

A room in 3D has four parts. A room in 2D has none, and shows no loader (FR-003).

| Part | Kind | Share of the bar | Ends when | From |
|---|---|---|---|---|
| `code` | step | 10 | the 3D chunk's import resolves (the scene module) | `app.ts`'s `scene` promise, begun behind the choice screen |
| `text` | step | 2 | `room-data.json`'s first load at "Enter" settles, loaded or failed (its retry 10 s later is not waited for); at once where the room has no `roomData` loader | `app.ts`'s `loadText(1)` |
| `typefaces` | step | 3 | every typeface the index names has arrived or failed, or `TYPEFACE_WAIT_MS` (2 s) has passed | `faces/fonts.ts`'s loader, which gains `settled(): Promise<void>` |
| `files` | bytes | 85 | every expected file has ended (`loaded`, `failed`, or `skipped`) | the 3D stage's `expected` (§3) and the room's asset events (`recordAsset`) |

The shares are the plan's (PD-3), whole numbers summing to 100, each one edit in `loading/progress.ts`'s table.

**The files' part.** Each expected file counts `bytes / total × 85`, where `bytes` is its served size (the 3D part's `bytes`, the `.glb.gz` copy's length, C11) and `total` the sum over expected files, once an asset event for its `asset` reports `loaded`, `failed`, or `skipped`. A `retried` event counts nothing. An expected file counts once, whatever events follow. Until `expected` resolves, the files' part counts 0, but every end heard is kept (§2); once it resolves with no file, or with a total of 0 bytes, the part has ended.

**Ends heard before the list.** Below ADR 0010's floor, the room's loader records `skipped` for every figure's file at once (`loadFigures`, `scene/loader.ts`, before its first await) and for every set model after one await (`load()`), both before `expected` reaches the model. Those ends are kept, and count the moment the list arrives, so such a device's loader gives way when its steps end, not at the ceiling (FR-014).

**Why the ends, not the bytes in flight.** The loader fetches with `integrity` (spec 004's R-28, step 3), which, as the Fetch standard reads, resolves the response only once the whole body is read and checked. So the page can't count a file's bytes as they stream without moving the check into the page, which this contract doesn't do (FR-015). The Author's checklist confirms the browsers' behaviour (tasks.md T039).

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
- `asset` keeps every `loaded`, `failed`, or `skipped` it hears in a set of ended asset names, whether or not `expected` has been called. Once `expected` is called, each expected file whose name is in that set counts at once, and each later end counts as it comes.
- `value` is ⌊the sum of the ended shares⌋, the files' share counted in proportion, and is held at the highest value reached, so it never goes down.
- `value` is 100 only when `complete`; while not complete, it is at most 99, even where rounding would give 100.
- `stage` is `code` while `code` hasn't ended; else `pieces` while the files' part hasn't ended; else `finishing` while `text` or `typefaces` hasn't; else `done`.
- `expected` is taken once; a second call is ignored. Duplicate `asset` names in it count once, at their largest `bytes`.
- Every method is total: it never throws on an unknown part, asset, or outcome; it ignores them.

## 3. The 3D stage's side (`stage.ts`, `scene.ts`, `scene/loader.ts`, `scene/avatars.ts`)

**`Stage3D.expected: Promise<readonly ExpectedFile[]>`**, a new field. It resolves once the loader chunk has built the entries, with each `modelEntries(part)` entry and each `figureEntries(part, avatar)` entry as `{ asset, bytes }`; with `[]` where the part sets no model and no avatar loads; with the list below ADR 0010's floor, every file then `skipped` (§1); and with `[]` where the loader chunk fails to load (each model is then `failed` or `skipped` at once, as today, `scene.ts`'s catch). It never rejects.

**`SceneOptions.gaveWay?: Promise<unknown>`**, a new option: the room's promise that resolves when the loader gives way (§4, step 8). The 3D stage keeps one flag, `closed`, which turns true when `gaveWay` resolves or at the stage's first `showHandoff`, whichever comes first; without `gaveWay`, as on the lookdev page and in 2D, only the latter turns it.

**The parse gate.** `LoaderOptions` gains `modelGate?: () => Promise<unknown>`, which the set models take as figure files take `figureGate` today. The 3D stage gives both the same function, `() => (closed ? handoffEnded : Promise.resolve())`. So a set model or a figure's file parses at once while the loader shows, and, from the loader's giving way on, only after the hand-off ends (FR-021; spec 009's FR-022, as it words this for avatars). Without `modelGate`, a model waits for `handoff`, as today.

**The swap gate.** A file whose parse began before the loader gave way may finish, since a parse can't be stopped part-way; its model swaps in only once the hand-off has ended. `LoaderOptions` gains `swapGate?: () => Promise<unknown>`, which the 3D stage gives as the same function, awaited between the parse and the swap, and raced with `stop()`. Its quality hold covers the wait. `scene/avatars.ts`'s own test of whether the hand-off has started reads the same `closed`, so an avatar parsed during that time shows once the hand-off ends, as FR-022 has it today.

**Unchanged:** the fetch (`integrity`, `redirect: "error"`, same-origin, the 10-second timeout, one retry, four at once), the two parse slots, the holds, the texture ledger, the asset events and their fields, the order (`load_order`, after the figures' fetches), `stop()`, and `reload()`.

## 4. The room's sequence (`app.ts`)

At "Enter", in `arrive`, in this order:

1. Build the room's page as today (`renderRoom`), inert (`setInteractive(false)`), and apply the HUD (`refit`).
2. Where the device has WebGL 2 and the 3D chunk hasn't already failed:
   - create the progress model, and mark `code` ended if the scene module has already resolved;
   - set loading on: `layout.setLoading(true)` sets `data-loading="on"` on the page's root and makes "Around the room" inert (FR-027);
   - take the motion store's hold, `motion.hold()`, which holds the room's motion still with no "Paused at" (FR-024; D13);
   - build the loader's view (§5) and focus its heading, which says "Loading the room" once (FR-038);
   - create the `gaveWay` promise, to hand to the 3D stage;
   - start the ceiling's timer, `LOADING_CEILING_MS`, on the room's clock.

   If building the view throws, go on with no view: the timer and the model still decide when the hand-off starts (FR-007).
3. Start the room's text and the typefaces as today; on each one's first settle, `progress.ended("text")` or `progress.ended("typefaces")`. Where `deps.roomData` is absent, `progress.ended("text")` at once.
4. Await `sceneOrLate()` as today. On the module: `progress.ended("code")`, mount the 3D stage (`mount3d`) with `gaveWay`, and pass its `expected` to `progress.expected`. On none or `late`: `toFlat` as today, which gives way with reason `2d` (FR-004).
5. Every asset event through `recordAsset` also goes to `progress.asset(event.asset, event.outcome)`, before the event's own queue, from "Enter" on, whether or not `expected` has resolved.
6. On each change of the model's state, the view shows it (§5). When `complete`, give way with reason `ready`.
7. When the timer fires before that, give way with reason `ceiling`.
8. **Give way** (once, by the first reason):
   - make the card inert, and resolve `gaveWay`;
   - clear the timer, and release the motion store's hold;
   - say `loading.ready` (reasons `ready` and `2d`) or `loading.cut_short` (`ceiling`) in the room's status region;
   - fade the card out (FR-022) and remove it on `transitionend` or after 250 ms, at once under reduced motion;
   - set loading off (`layout.setLoading(false)`), so "Around the room" is reachable again;
   - move focus to the room's heading (FR-039);
   - record the frame log's entry;
   - for `ceiling` with `complete` false, emit `loading_cut_short` once a visit (FR-046).

   Then, once spec 009's figures wait has ended too, start the hand-off as today.

Where the device has no WebGL 2, steps 2 and 5 to 8 don't run, and the hand-off starts as today (FR-003).

`LOADING_CEILING_MS` is 7,000 (D2), in `quality.ts` beside `SCENE_WAIT_MS`, and a test holds it to at most 7,000 (FR-020).

**The motion store's hold** (`motion.ts`): `hold(): () => void`, counted, as the quality controller's holds are. While any hold is taken, `animate` is false; `paused`, `pausedAt`, "Pause the room"'s `aria-pressed`, and the status polling are untouched. The returned function releases it once.

## 5. The view (`src/room/loading/view.ts`, `src/room/loading/loading.css`)

**The scrim** is not one element. While the loader shows, the page's root carries `data-loading="on"`, and `loading.css` lays a tint, a `::after` pseudo-element with `position: absolute`, `inset: 0`, `pointer-events: none`, and `background: rgb(0 0 0 / 0.55)`, over these elements, each positioned so the tint stays inside it:

| Layout | Tinted | Given `position: relative` while loading |
|---|---|---|
| column, dock | `.room-stage-view`, `.hud-bar`, `.hud-panels`, `.room-around` | `.room-around` (the others are already absolute in these layouts) |
| stacked | `.room-stage-view`, `.hud-bar`, `.room-list`, `.talk`, `.room-around` | `.hud-bar`, `.room-list`, `.talk`, `.room-around` (in the stacked layout `.hud-panels` is `display: contents`, whose `::after` would land on an ancestor, so its two panels are tinted instead) |

Never tinted, in any layout: `.disclosure`, `.room-clear`, `.room-notes`, `.room-note`, `.room-stand-in`, and `.room-loader`. So the AI disclosure and the stand-in line stay undimmed by construction (FR-025, FR-026).

**The card**, a `section.room-loader.hud-glass`, inside the room's element after the room block and before "Around the room" in the DOM. In every layout it carries its own `color: var(--hud-text)` and `background: rgb(var(--glass) / var(--glass-alpha))`, since spec 005's `.hud-glass` colours hold only under the column and dock layouts (FR-008). Its place by layout (FR-025, FR-042):

| Layout | Place | Stacking against the AI disclosure |
|---|---|---|
| column, dock | `position: fixed`; `top: calc(var(--clear-y) + var(--notes-h))`, the clear area's top (the measured strip, spec 005) plus the notes' reserve (`notesReserve`); `left: 0`, `right: 0`, `margin-inline: auto`, `width: min(36rem, 100% - 2rem)`; `max-height: calc(100dvh - var(--clear-y) - var(--notes-h) - 0.5rem)`, `100vh` before it, with `overflow-y: auto` | `z-index: 4`: over the docked panels (3) and the clear box (1), under the strip (5); its top below the strip, so they never meet |
| stacked | `position: static`; `grid-area: loader`, the room grid's first row while loading (`html[data-hud="stacked"][data-loading="on"] .room` prepends `"loader"` to the portrait template and `"loader loader"` to the landscape one) | none of its own: in the page's flow, above the stage; the sticky disclosure (z 2) paints over it where the page scrolls it under |

Its contents, in Tab order:

```text
section.room-loader.hud-glass[aria-labelledby=loader-heading]
  h2#loader-heading[tabindex=-1]            loading.heading
  div[role=progressbar][aria-labelledby=loader-heading]
     [aria-valuemin=0][aria-valuemax=100][aria-valuenow][aria-valuetext]
    div.room-loader-fill                    (its width from --loader-fraction)
  p.room-loader-percent[aria-hidden]        "64%"
  p.room-loader-stage[aria-hidden]          the stage line
  section.room-loader-hints[aria-labelledby=loader-hints-label]
    h3#loader-hints-label.visually-hidden   hints.label
    p.room-loader-hint[aria-live=polite][aria-atomic=true]   empty when created; the hint's text from the next tick
    p.room-loader-position                  hints.position
    button.room-loader-rotate               hints.pause or hints.play, its words alone carrying its state
    button                                  hints.previous
    button                                  hints.next
```

- The percentage and the stage line are hidden from assistive technology, since `aria-valuetext` carries both ("64%: Loading the room's pieces: 12 of 21").
- "Loading the room" is said once, by focus landing on the heading; the room's status region doesn't say it (FR-038).
- The hint's live region is created empty and given the first hint on the next tick, so a screen reader says it (FR-031).
- The fill's width is set through `style.setProperty("--loader-fraction", …)` on the bar, never a `style` attribute (FR-052). The fill has no sheen or other decorative motion; its 150 ms width transition is dropped under reduced motion (FR-040).
- **Focus rings**: `:root .room-loader button:focus-visible` and `:root .room-loader [tabindex]:focus-visible` take `outline: 2px solid var(--hud-focus)` with a `2px` offset, in every layout, outranking the room's blue `.room button:focus-visible` and `.room [tabindex]:focus-visible`; in forced colours, `Highlight` (FR-041).
- **Text spacing**: no text element of the card has a fixed `height` or clips its overflow; sizes are `min-height` (FR-042). The bar's track, which holds no text, has its height.
- The card's text and hints reach the DOM as text nodes, never as markup.

## 6. The hints' rotation (`src/room/loading/hints.ts`)

A small state machine on the room's clock:

| State | Advances every `HINT_MS` (6,000) | Enters when | Leaves when |
|---|---|---|---|
| `running` | yes | the loader shows; "Play hints" | the pointer enters the hint area (`hovered`); focus enters the hint controls from outside them (`stopped`); "Pause hints" (`paused`); the page hides (`hidden`) |
| `hovered` | no | the pointer enters the hint area | the pointer leaves (`running`) |
| `paused` | no | "Pause hints" | "Play hints" (`running`) |
| `hidden` | no | the page hides | it shows again (the state it left) |
| `stopped` | no | focus enters the hint controls from outside them | "Play hints" (`running`); moving focus between the controls doesn't stop it again, as the WAI-ARIA carousel pattern has it ("It does not resume unless the user activates the rotation control") |

The rotation control's words are `hints.pause` in `running` and `hovered`, and `hints.play` in `paused`, `hidden`, and `stopped`; it carries no `aria-pressed` (the WAI-ARIA carousel pattern's rotation control). "Previous hint" and "Next hint" step in every state, wrapping at both ends. The timer restarts its 6 seconds at each change of hint. Under reduced motion a change of hint has no transition (FR-040).

## 7. The frame log (drafts builds only)

`signals/frame-log.ts` gains one event, `loading`, with these fields, never a file's name or a hint's words:

| `state` | Other fields |
|---|---|
| `shown` | `value` |
| `ended` | `part`, `value` |
| `gave_way` | `why` (`ready`, `ceiling`, or `2d`), `value`, `done`, `total` |
| `hint` | `n` |

## 8. What leaves the device

Only `{"kind": "loading_cut_short"}`, on the beacon, at most once a visit, at step 8's `ceiling` with `complete` false (FR-046). The progress model, the view, the rotation, and the motion hold read page memory and send nothing (FR-001, FR-047).
