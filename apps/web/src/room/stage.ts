// What the room draws the work area on (spec 002, contracts/room-scene.md §4): the 3D scene, from the 3D chunk
// (scene.ts), or the 2D drawing (flat.ts). The room holds one at a time, and swaps the scene for the drawing when the
// quality controller, a lost context, or the visitor asks; never back.
import type { AvatarId } from "../choice/avatars";
import type { Clock } from "./clock";
import type { RoomIndex } from "./compose/bundle";

export interface Stage {
  readonly mode: "3d" | "2d";
  /** The element the room puts in its stage: the canvas, or the drawing. The room keeps it aria-hidden (§5). */
  readonly element: HTMLElement;
  /** Draws the hand-off at its progress, 0 to 1 (contracts/room-scene.md §3). */
  showHandoff(progress: number): void;
  dispose(): void;
}

export interface Stage3D extends Stage {
  readonly mode: "3d";
  readonly canvas: HTMLCanvasElement;
  /** The quality controller's level, 0 (full) to 3 (R-04). */
  setQuality(level: number): void;
}

export interface SceneOptions {
  win: Window;
  doc: Document;
  clock: Clock;
  /** The bundle's index (spec 004): the 3D part is drawn only if it's this index's, with its words and its cases. */
  room: RoomIndex;
  avatar: AvatarId;
  reducedMotion: boolean;
  /** The one handler a pick, a touch, and the list's button all call, with a selectable's ID. */
  select(id: string): void;
  /** Each frame's time, for the quality controller. */
  onFrame(time: number): void;
}

/** The 3D chunk's interface, which the room imports only after the WebGL 2 check. */
export interface SceneModule {
  createScene(options: SceneOptions): Stage3D;
}
