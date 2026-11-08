// What the room draws the work area on (spec 002, contracts/room-scene.md §4): the 3D scene, from the 3D chunk
// (scene.ts), or the 2D drawing (flat.ts). The room holds one at a time, and swaps the scene for the drawing when the
// quality controller, a lost context, or the visitor asks; never back.
import type { AssetEvent } from "../asset-events";
import type { AvatarId, ClipRole } from "../choice/avatars";
import type { Mode } from "../choice/visit";
import type { Clock } from "./clock";
import type { RoomIndex } from "./compose/bundle";
import type { TierValue } from "./compose/vocabulary";
import type { TypefaceLoader } from "./faces/fonts";
import type { RoomText } from "./faces/words";
import type { MotionState } from "./motion";
import type { CostState } from "./signals/turn-cost";
import type { TargetInput } from "./walk/target";

export interface Stage {
  readonly mode: "3d" | "2d";
  /** The element the room puts in its stage: the canvas, or the drawing. The room keeps it aria-hidden (§5). */
  readonly element: HTMLElement;
  /** Draws the hand-off at its progress, 0 to 1 (contracts/room-scene.md §3). */
  showHandoff(progress: number): void;
  /** Shows each tier switch's case for a tier value, by the claims rule (spec 004, FR-043; tier.ts's caseFor), at once:
   *  the 3D room draws it on its next frame, the 2D room on its next paint (FR-042, FR-058). */
  apply(value: TierValue): void;
  /** The room text, once room-data.json has loaded at Enter (spec 004, FR-029, FR-061): the faces it words are drawn;
   *  null leaves them plain. A stage made after it loaded is given it at once. */
  setText?(text: RoomText | null): void;
  /** The cost channel's state (spec 004, FR-047, FR-048): the neon sign's counters are drawn again at once, paused or
   *  not (FR-060). A stage made after a report is given the state at its making. */
  setCost?(state: CostState): void;
  /** The room's target (spec 008, FR-007, FR-014; plan.md §2): the selectable the stage shows with the highlight,
   *  from its next frame in 3D, or at once in 2D, or none. */
  setTarget(id: string | null): void;
  dispose(): void;
}

/** What a stage reads of the motion store, throughout the visit (spec 004, FR-059, FR-060; R-34). */
export type MotionView = Pick<MotionState, "animate" | "reducedMotion">;

/** Why the walking view ended without the room asking (spec 008): Escape on its focusable element (FR-022), or a step
 *  that threw, after which the stage is back at the production framing with the figure at its place (FR-005). */
export type WalkEnd = "escape" | "failed";

/** The 3D stage's walking view (spec 008, FR-020 to FR-035; plan.md §2, §3.6): the room enters and leaves it, and the
 *  stage reports a leave it made itself through SceneOptions' walkEnded. */
export interface StageWalk {
  /** Whether the walking view is on. */
  readonly walking: boolean;
  /** Enters the walking view from the production framing, its keys bound to `focus`, the element that holds focus
   *  while walking (R-13); nothing while it's on. */
  enter(focus: HTMLElement): void;
  /** Leaves it, back to the production framing with the figure at its place (FR-022); nothing while it's off. */
  leave(): void;
}

export interface Stage3D extends Stage {
  readonly mode: "3d";
  readonly canvas: HTMLCanvasElement;
  /** The quality controller's level, 0 (full) to 3 (R-04). */
  setQuality(level: number): void;
  /** The walking view (spec 008). */
  readonly walk: StageWalk;
}

export interface SceneOptions {
  win: Window;
  doc: Document;
  clock: Clock;
  /** The bundle's index (spec 004): the 3D part is drawn only if it's this index's, with its words and its cases. */
  room: RoomIndex;
  avatar: AvatarId;
  /** Whether the device asks for reduced motion, read whenever the stage draws: the room gives a getter on its motion
   *  store, so a change mid-visit reaches the stage (spec 004, FR-059). */
  readonly reducedMotion: boolean;
  /** The motion store: idle motion only while it animates (spec 004, FR-059, FR-060). Absent, the stage animates
   *  unless `reducedMotion`. */
  motion?: MotionView;
  /** The one handler a pick, a touch, and the list's button all call, with a selectable's ID. */
  select(id: string): void;
  /** Where the stage's pointer reports its targeting inputs (spec 008, FR-008 (a) and (b)): a hovering pointer's
   *  pick and a press's, a selectable's ID or none. Absent, nothing is reported. */
  target?(input: Extract<TargetInput, "pointer" | "press" | "reach">, id: string | null): void;
  /** Each frame's time, for the quality controller. */
  onFrame(time: number): void;
  /** Where the stage reports a leave of the walking view it made itself (spec 008): Escape, or a failed step (FR-005).
   *  Absent, nothing is reported. */
  walkEnded?(why: WalkEnd): void;
  // What the room's loader takes from the room (spec 004, T134; R-28): absent, models load at once, unheld, at full
  // size, and their events go nowhere.
  /** Whether studio models may load here: ADR 0010's floor, which the room reads once, behind the choice, with spec
   *  002's WebGL 2 check (R-28 step 1). Absent, the stage reads it when its first model would load. */
  floor?: boolean;
  /** Resolves once the hand-off has ended: models parse and swap only after it. */
  handoff?: Promise<void>;
  /** The quality controller's hold, for each model's parse and swap (FR-055). */
  hold?: () => () => void;
  /** The quality level as a model decodes: 1 or more decodes its images at half size (FR-056). */
  level?: () => number;
  /** The visit's mode, for the asset events. */
  mode?: () => Mode;
  /** Records spec 003's asset event for each model's outcome (FR-071). */
  assets?: (event: AssetEvent) => void;
  /** The live faces' typefaces (spec 004, faces/fonts.ts): absent, each face draws at once. */
  typefaces?: TypefaceLoader;
  /** The room text, where room-data.json loaded before the stage was made. */
  text?: RoomText | null;
  /** The cost channel's state when the stage was made (spec 004, FR-048). */
  cost?: CostState;
  /** Spec 009: where the 3D stage reports its figures, each picture's and clip's change, and each avatar file that
   *  failed after its retry (scene/avatars.ts); the room sends avatar_failed once a visit from it and logs the rest in a
   *  drafts build's frame log. Absent, nothing is reported. */
  onFigure?: (signal: FigureSignal) => void;
}

/** One of the room's two figures (spec 009). */
export type FigureId = "twin" | "visitor";

/** Why a figure shows its fallback (spec 009, plan.md §3.4): its avatar has no file in the bundle; a file failed after
 *  its retry, or was skipped (the ledger, a stop); the device is below the floor; the room went to 2D; the avatar
 *  wasn't ready within the hand-off's wait (Phase 2); or its model measured no height. */
export type FigureWhy = "no-file" | "failed" | "skipped" | "floor" | "2d" | "late" | "degenerate";

/** What the 3D stage reports of its figures (spec 009, FR-032, FR-035; plan.md §3.4). */
export type FigureSignal =
  | {
      readonly kind: "picture";
      readonly figure: FigureId;
      readonly shows: "avatar" | "fallback";
      readonly why: FigureWhy | null;
    }
  | { readonly kind: "clip"; readonly figure: FigureId; readonly role: ClipRole }
  | { readonly kind: "failed" };

/** The 3D chunk's interface, which the room imports only after the WebGL 2 check. */
export interface SceneModule {
  createScene(options: SceneOptions): Stage3D;
}
