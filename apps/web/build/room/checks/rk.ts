// RK, budgets and caps (spec 004; contracts/room-data-files.md §13.8): a stub that reports nothing; T078 fills it.
import type { Context, Family } from "./family";

/** A bound live face's canvas on the reference phone (FR-054). */
export interface FaceCanvas {
  readonly placement: string;
  readonly role: string;
  readonly px: readonly [number, number];
  /** Its largest on-screen size at the reference stages, in CSS pixels; null where it can't be projected. */
  readonly screen: readonly [number, number] | null;
  readonly canvas: readonly [number, number];
  readonly bytes: number;
}

/** RK3's total by class. */
export interface SceneTextureMemory {
  readonly pieces: number;
  readonly twin: number | null;
  readonly visitor: number | null;
  readonly figures: number;
  readonly canvases: number;
  readonly faces: readonly FaceCanvas[];
  readonly total: number;
}

/** The scene's texture memory on the reference phone: a stub that counts nothing. */
export const sceneTextureMemory: (ctx: Context) => SceneTextureMemory = () => ({
  pieces: 0,
  twin: null,
  visitor: null,
  figures: 0,
  canvases: 0,
  faces: [],
  total: 0,
});

/** RK: a budget above the caps (RK1, against policy.ts's `capsOf`), a model over its budget (RK2, lenient), the scene's
 *  texture memory (RK3), and a malformed room block (RK4: `ctx.policy.caps_problems`, by their path in caps.json). */
export const rk: Family = () => {};
