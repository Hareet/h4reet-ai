// RA, the room's avatars (spec 009; FR-009, FR-014, FR-038; plan.md §3.5, R-12): each avatar's folder under
// assets/visitors/<id>/, as build/room/avatars.ts reads it once a compose:
// - RA1, a model or clip its folder's records.json doesn't record, records with another kind than `avatar` or
//   `animation`, or records with another SHA-256;
// - RA2, a file the GLB reader can't read (as RX1 and RX2 read it, READ_PAST aside), a clip with no animation, or a
//   clip whose channels move a node its model's raw names lack;
// - RA3, the twin's stand-in's model recorded as a likeness, or from a photo;
// - RA4, a file over main's per_asset cap for its kind, as spec 003's F2 measures it.
// Each is lenient: a strict build refuses, and a lenient one prints it prefixed `warn` and leaves the file out, its figure
// on its fallback, so `make up` builds. RA5, a file with no role, is the report's alone (report.ts), as RG8 is. A
// reason names keys and figures, never a value from the data. The stand-in outside the table is RI8's (ri.ts).
// Spec 016 (its FR-009, FR-015, FR-055; contracts/twin-data.md §7): RA1, RA2, and RA4 extend to the twin's files under
// assets/twin/, by their kinds (`avatar`, `animation`, `still`); RA5 to a file there with no role; and RA6, the twin's
// files without an approval in main's likeness approvals naming its model's current SHA-256 with a non-empty line,
// which leaves every file of the twin out of a lenient build. avatars.ts's readTwin reads them once a compose.
import { avatarsOf, twinOf } from "../avatars";
import type { Family } from "./family";

/** RA: every rule of the family, in its order: the visitors' folders, then the twin's. */
export const ra: Family = (ctx) => {
  const scene = ctx.room.scene?.value ?? null;
  for (const p of avatarsOf(ctx.tree, ctx.policy, scene).problems) ctx.report(p.rule, p.file, p.path, p.reason);
  for (const p of twinOf(ctx.tree, ctx.policy, scene).problems) ctx.report(p.rule, p.file, p.path, p.reason);
};
