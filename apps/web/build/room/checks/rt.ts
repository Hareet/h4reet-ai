// RT, words (spec 004; contracts/room-data-files.md §13.5): a stub that reports nothing; T078 fills it, and the RT2
// walk below.
import type { Context, Family } from "./family";

/** RT: regions' text, spec 002's C6, C1 to C5, and C8, the monitor's scripts, the chalk's excludes, grids, quotes,
 *  typefaces, the tier's words, the closed list's keys, and outlines (RT1 and RT3 to RT13; RT2 is the walk's). */
export const rt: Family = () => {};

/**
 * RT2, spec 002's C9 over every string value of every loaded file, IDs and names (map keys among them) included: a
 * "Do not claim" key phrase of the corpus, the surname rule (`ctx.policy.full_name`), or a private-denylist phrase
 * where the session can read it. compose() runs it after RD and before every other family; it reports each hit, its
 * reason ending `(from <source>)`, and gives back the strings it refused, which no later reason or path may print
 * (`ctx.printable`). A stub that refuses nothing; T078 fills it.
 */
export const walkStrings: (ctx: Context) => ReadonlySet<string> = () => new Set();
