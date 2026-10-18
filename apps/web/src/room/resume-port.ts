// The room's side of the interactive resume (spec 002, contracts/room-scene.md §1; tasks.md T029). The room owns the
// resume's panel: it opens it from "Resume" or "Read the resume now", gives it a heading and the focus, closes it on
// Escape, and returns focus to "Resume". What goes inside (the items, "Download (PDF)", "Close") is the resume view's,
// which Phase 3 builds in src/resume/. Until that lands, the stub below stands in, and src/main.ts names it: the
// integration replaces that one import with Phase 3's view, adapted to ResumeView if its shape differs.
import { h } from "./dom";
import type { VisitPath } from "../choice/visit";

export interface ResumeContext {
  doc: Document;
  /** The visitor's path, for the narration's depth (Phase 5). */
  path: VisitPath;
  /** Closes the panel; the view's own "Close" calls it. */
  close(): void;
  /** A "Download (PDF)" link was followed (pdf_downloaded). */
  pdfFollowed(): void;
}

export interface ResumeView {
  /** Renders the resume into `host`, an empty element inside the room's panel. */
  mount(host: HTMLElement, context: ResumeContext): void;
  /** The panel is closing: stop anything playing (narration stops at once, FR-024) and clear `host`. */
  unmount(): void;
}

/** The stand-in until Phase 3's view: a line saying so, the PDF's link, and "Close". */
export function stubResumeView(): ResumeView {
  let mounted: HTMLElement | null = null;
  return {
    mount(host, context) {
      const { doc } = context;
      const pdf = h(doc, "a", { href: "./resume.pdf", download: true }, "Download (PDF)");
      pdf.addEventListener("click", () => context.pdfFollowed());
      const close = h(doc, "button", { type: "button" }, "Close");
      close.addEventListener("click", () => context.close());
      host.replaceChildren(
        h(doc, "p", {}, "The interactive resume isn't in this build yet."),
        h(doc, "p", { class: "resume-actions" }, pdf, " ", close),
      );
      mounted = host;
    },
    unmount() {
      mounted?.replaceChildren();
      mounted = null;
    },
  };
}
