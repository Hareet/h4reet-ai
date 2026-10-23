// The lookdev page (spec 004; FR-066 to FR-070; User Story 3; research.md R-41; contracts/lookdev.md §1 to §6), drafts
// builds only. startLookdev builds the whole page inside its root: the site's page (lookdev/index.html, through
// site.ts) calls it with no probe, and the phone copy's entry (phone.ts) after its probe. Its inputs are the drafts
// build's own: the 3D part, the fixtures, and the lookdev inputs with the page's own copy of the index.
import fixtures from "virtual:room-fixtures";
import lookdev, { room } from "virtual:room-lookdev";

import type { Probe } from "./results";

export interface LookdevOptions {
  /** The phone copy: the phone's own stage, and every model from memory (contracts/lookdev.md §3, §7). */
  readonly phone: boolean;
  /** The phone copy's probe (§7.2); null on the site's page. */
  readonly probe: Probe | null;
}

/** Builds the lookdev page inside `root`. */
export function startLookdev(root: HTMLElement, options: LookdevOptions): void {
  const doc = root.ownerDocument;
  const heading = doc.createElement("h1");
  heading.textContent = "Lookdev, drafts only";
  const summary = doc.createElement("p");
  summary.textContent =
    `Bundle ${room.digest}: ${lookdev.looks.length} looks, ${fixtures.length} sample states` +
    (options.phone ? ", the phone copy" : "");
  root.replaceChildren(heading, summary);
}
