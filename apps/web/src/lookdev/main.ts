// The lookdev page's entry point (spec 004; FR-066 to FR-070; User Story 3; research.md R-41; contracts/lookdev.md §1
// to §6), drafts builds only. startLookdev builds the whole page inside its root: the site's page calls it with no probe
// (lookdev/index.html, through site.ts), and the phone copy's entry (phone.ts) after its probe. It hands page.ts the
// drafts build's own inputs, the 3D part (virtual:room-scene), the fixtures (virtual:room-fixtures), and the lookdev
// inputs with the page's own copy of the index (virtual:room-lookdev), which a release build refuses to resolve
// (FR-066); a WebGLRenderer on the page's one canvas; the window's clock; and capability(), which ADR 0010's floor
// reads. Where the browser gives no WebGL 2 context, the page says so and builds nothing else.
import "./lookdev.css";

import { WebGLRenderer } from "three";
import fixtures from "virtual:room-fixtures";
import lookdev, { room } from "virtual:room-lookdev";
import part from "virtual:room-scene";

import { windowClock } from "../room/clock";
import { capability } from "../room/quality";
import { createLookdev } from "./page";
import type { LookdevOptions } from "./page";

export type { LookdevOptions } from "./page";

/** Builds the lookdev page inside `root`. */
export function startLookdev(root: HTMLElement, options: LookdevOptions): void {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;
  try {
    createLookdev(root, options, {
      win,
      clock: windowClock(win),
      inputs: { part, index: room, lookdev, fixtures },
      renderer: (canvas) => new WebGLRenderer({ canvas, antialias: true }),
      capability: () => capability(win),
    });
  } catch {
    const note = doc.createElement("p");
    note.textContent = "This browser can't draw the room here: lookdev needs WebGL 2.";
    root.replaceChildren(note);
  }
}
