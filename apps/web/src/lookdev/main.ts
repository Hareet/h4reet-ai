// The lookdev page's entry point (spec 004; FR-066 to FR-070; User Story 3; research.md R-41; contracts/lookdev.md §1
// to §6), drafts builds only. startLookdev builds the whole page inside its root: the site's page calls it with no probe
// (lookdev/index.html, through site.ts), and the phone copy's entry (phone.ts) after its probe. It hands page.ts the
// drafts build's own inputs, the 3D part (virtual:room-scene), the fixtures (virtual:room-fixtures), and the lookdev
// inputs with the page's own copy of the index (virtual:room-lookdev), which a release build refuses to resolve
// (FR-066); a WebGLRenderer on the page's one canvas; the window's clock; and capability(), which ADR 0010's floor
// reads. Where the page can't be built, it says why in its root and builds nothing else: that lookdev needs WebGL 2
// only where the renderer can't make its WebGL context, and otherwise "The page didn't start:" with the error's
// message. It then throws the error on, so the phone copy's panel says why beside its verdict, since the phone has no
// console, and the site's page's console has it (the review's page-2 and phone-1).
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

/** What the page says where its renderer can't make a WebGL context. */
export const NO_WEBGL2 = "This browser can't draw the room here: lookdev needs WebGL 2.";
/** What the page says, before the error's message, where it throws as it starts for any other reason; the phone
 *  copy's panel says it too, since the phone has no console to say it. */
export const PAGE_FAILED = "The page didn't start:";

/** Builds the lookdev page inside `root`; where it can't, says why there and throws the error on. */
export function startLookdev(root: HTMLElement, options: LookdevOptions): void {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;
  let noContext = false;
  try {
    createLookdev(root, options, {
      win,
      clock: windowClock(win),
      inputs: { part, index: room, lookdev, fixtures },
      renderer: (canvas) => {
        try {
          return new WebGLRenderer({ canvas, antialias: true });
        } catch (error) {
          noContext = true;
          throw error;
        }
      },
      capability: () => capability(win),
    });
  } catch (error) {
    const note = doc.createElement("p");
    note.textContent = noContext
      ? NO_WEBGL2
      : `${PAGE_FAILED} ${error instanceof Error ? error.message : String(error)}`;
    root.replaceChildren(note);
    throw error;
  }
}
