// RG, geometry (spec 004; contracts/room-data-files.md §13.3): a stub that reports nothing; T078 fills it.
import type { Box } from "../../../src/room/compose/framing";
import type { LoadedRoom } from "../load";
import type { RoomPolicy } from "../policy";
import type { TreeReader } from "../typefaces";
import type { Family } from "./family";

/** RG: mounts (RG1), bounds, faces, glows, and stand-ins (RG2), framing (RG4, RG5), spacing (RG6), legibility (RG7),
 *  the poses' separation, reported only (RG8), and regions (RG9). RG2's unit vectors and RG3 are the loader's. */
export const rg: Family = () => {};

/** Each resolved placement's framed box, by its ID: a stub. */
export function frameBoxes(room: LoadedRoom): ReadonlyMap<string, Box> {
  void room;
  return new Map();
}

/** A bound face's smallest cap height on each reference stage. */
export interface FaceCaps {
  readonly face: string;
  readonly placement: number;
  readonly role: string;
  readonly readable: boolean;
  readonly atmosphere: boolean;
  readonly max_chars: number | null;
  readonly desktop: number | null;
  readonly phone: number | null;
}

/** Each bound face's cap heights: a stub. */
export function faceCaps(room: LoadedRoom, tree: TreeReader): FaceCaps[] {
  void room;
  void tree;
  return [];
}

/** RG8's measure for two shown poses of a switch. */
export interface PoseSeparation {
  readonly switch: number;
  readonly id: string;
  readonly poses: readonly [string, string];
  readonly desktop: number;
  readonly phone: number;
  readonly status: "apart" | "under the floor";
}

/** RG8's measures: a stub. */
export function poseSeparations(room: LoadedRoom, policy: RoomPolicy): PoseSeparation[] {
  void room;
  void policy;
  return [];
}
