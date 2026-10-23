// RG, geometry (spec 004; contracts/room-data-files.md §13.3): a stub that reports nothing; T078 fills it.
import type { Family } from "./family";

/** RG: mounts (RG1), bounds, faces, glows, and stand-ins (RG2), framing (RG4, RG5), spacing (RG6), legibility (RG7),
 *  the poses' separation, reported only (RG8), and regions (RG9). RG2's unit vectors and RG3 are the loader's. */
export const rg: Family = () => {};
