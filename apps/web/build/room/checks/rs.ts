// RS, switches and claims (spec 004; contracts/room-data-files.md §13.4): a stub that reports nothing; T078 fills it.
import type { Family } from "./family";

/** RS: cases against the tier's values (RS1), poses against claims (RS2), the claims' cases (RS3), the shared pose
 *  (RS4), the local pose's place (RS5), and the cable's `from` (RS6). RS1's signal and RS6's figures are the
 *  loader's (schema.ts). */
export const rs: Family = () => {};
