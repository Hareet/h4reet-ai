// The room's side of the interactive resume (spec 002, contracts/room-scene.md §1; tasks.md T029). The room owns the
// resume's panel: it opens it from "Resume", "Read the resume now", or a fixed message's "Read the resume", gives it
// its heading ("The resume") and the focus, closes it on Escape, returns focus to "Resume", and counts resume_opened.
// What goes inside is a ResumeView's: here, Phase 3's view (src/resume/), behind an adapter.
import type { VisitPath } from "../choice/visit";
import { fetchRoomResume, resumePanel } from "../resume";
import type { RoomResume } from "../resume";
import { ABSENT } from "../resume/data";
import { h } from "./dom";

export interface ResumeContext {
  doc: Document;
  /** The visitor's path, for the narration's depth (Phase 5). */
  path: VisitPath;
  /** Closes the panel; the view's own "Close" calls it. */
  close(): void;
  /** A "Download (PDF)" link was followed (pdf_downloaded). */
  pdfFollowed(): void;
  /** A resume item was selected (item_selected, for an ID the manifest lists; narration in Phase 5). */
  itemSelected(id: string): void;
}

export interface ResumeView {
  /** Renders the resume into `host`, an empty element inside the room's panel. */
  mount(host: HTMLElement, context: ResumeContext): void;
  /** The panel is closing: stop anything playing (narration stops at once, FR-024) and clear `host`. */
  unmount(): void;
}

/**
 * Phase 3's view in the room's panel. It:
 * - loads room-data.json the first time the resume opens, and shares that one load with every later opening, unless
 *   it failed: then the next opening loads again;
 * - shows "Loading the resume…" until it arrives, then the view's panel, unhidden (the view builds it hidden);
 * - drops the view's own heading and dialog role: the room's section and heading frame it, in the page's flow;
 * - wires the view's "Close" and "Download (PDF)" to the room, and passes `room:item-selected` on;
 * - is the only way the view opens: the view has no opener of its own, so nothing opens it a second way or counts
 *   it twice beside the room's resume_opened.
 * A load that fails reads as absent, and the view says so beside the PDF link.
 */
export function resumeView(load: () => Promise<RoomResume> = () => fetchRoomResume()): ResumeView {
  let built: Promise<HTMLElement> | null = null;
  let current: { host: HTMLElement; context: ResumeContext } | null = null;

  const build = async (doc: Document): Promise<HTMLElement> => {
    const data = await load().catch(() => ABSENT);
    // A load that failed isn't kept: the next opening tries again. One that worked is kept for the visit.
    if (data.resume_state === "absent") built = null;
    const panel = resumePanel(doc, data);
    panel.hidden = false;
    panel.removeAttribute("role");
    panel.removeAttribute("aria-labelledby");
    panel.querySelector("#resume-title")?.remove();
    panel.querySelector(".resume-close")?.addEventListener("click", () => current?.context.close());
    panel.querySelector(".resume-pdf")?.addEventListener("click", () => current?.context.pdfFollowed());
    panel.addEventListener("room:item-selected", (event) => {
      const id: unknown = (event as CustomEvent<{ id?: unknown }>).detail?.id;
      if (typeof id === "string") current?.context.itemSelected(id);
    });
    return panel;
  };

  return {
    mount(host, context) {
      current = { host, context };
      host.replaceChildren(h(context.doc, "p", { class: "resume-loading" }, "Loading the resume…"));
      built ??= build(context.doc);
      void built.then((panel) => {
        if (current?.host === host) host.replaceChildren(panel);
      });
    },
    unmount() {
      current?.host.replaceChildren();
      current = null;
    },
  };
}
