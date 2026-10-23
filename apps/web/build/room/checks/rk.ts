// RK, budgets and caps (spec 004; contracts/room-data-files.md §13.8): a stub that reports nothing; T078 fills it.
import type { Family } from "./family";

/** RK: a budget above the caps (RK1, against policy.ts's `capsOf`), a model over its budget (RK2, lenient), the scene's
 *  texture memory (RK3), and a malformed room block (RK4: `ctx.policy.caps_problems`, by their path in caps.json). */
export const rk: Family = () => {};
