// RV, vector drawings (spec 004; contracts/room-data-files.md §13.6): a stub that reports nothing; T078 fills it.
import type { Family } from "./family";

/** RV: a piece with no drawing (RV1), and a colour outside the scene's palette (RV3). RV2's point counts, path data, and
 *  finite numbers, and RV3's stroke width, are the loader's (schema.ts). */
export const rv: Family = () => {};
