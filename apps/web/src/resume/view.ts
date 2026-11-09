// The interactive resume (spec 002, T029; FR-010, FR-018; contracts/room-scene.md §1 and §5): a panel with the
// header, each section's heading, and each item as a button in a list; "Download (PDF)"; and "Close". The room shows
// it in its resume panel, in the page's flow, through src/room/resume-port.ts, which opens it, closes it with "Close"
// or Escape, and returns focus to "Resume"; the view has no opener of its own.
//
// Selecting an item marks it (aria-current) and dispatches `room:item-selected` with its ID, which the room passes on
// as the usage event item_selected (and narration, Phase 5, will hear). Nothing is stored, and nothing is fetched but
// room-data.json from the site's own origin.
import { ABSENT, asRoomResume, type RoomResume } from "./data";
import { PDF_HREF, pdfFileName } from "./download";

export { PDF_HREF };
export const DRAFT_NOTICE = "Draft, not approved";
/** When room-data.json can't be read: the resume isn't shown, and the PDF link beside this may still work. */
export const LOAD_FAILED = "The resume couldn't be loaded. The PDF may still be available.";
export const ROOM_DATA_HREF = "./room-data.json";

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The panel, built from room-data.json's resume part; hidden until opened. */
export function resumePanel(doc: Document, data: RoomResume): HTMLElement {
  const panel = el(doc, "section", {
    class: "resume",
    role: "dialog",
    "aria-labelledby": "resume-title",
    "data-resume-panel": "",
  });
  panel.hidden = true;

  const bar = el(doc, "div", { class: "resume-bar" });
  bar.append(
    el(doc, "h2", { id: "resume-title", tabindex: "-1" }, "Resume"),
    el(doc, "a", { class: "resume-pdf", href: PDF_HREF, download: pdfFileName() }, "Download (PDF)"),
    el(doc, "button", { type: "button", class: "resume-close" }, "Close"),
  );
  panel.append(bar);

  if (data.resume_state === "absent") {
    panel.append(el(doc, "p", { class: "resume-draft", "data-resume-error": "" }, LOAD_FAILED));
  } else if (data.resume_state !== "approved") {
    panel.append(el(doc, "p", { class: "resume-draft", "data-draft-banner": "" }, DRAFT_NOTICE));
  }

  if (data.header && data.resume_state !== "withheld") {
    const header = el(doc, "div", { class: "resume-header" });
    header.append(el(doc, "p", { class: "resume-name" }, data.header.name));
    for (const line of data.header.lines) header.append(el(doc, "p", { class: "resume-line" }, line));
    panel.append(header);
  }

  for (const section of data.resume_state === "withheld" ? [] : data.sections) {
    const titleId = `resume-section-${section.id}`;
    const part = el(doc, "section", { class: "resume-section", "aria-labelledby": titleId });
    part.append(el(doc, "h3", { id: titleId }, section.title));
    const list = el(doc, "ul", { class: "resume-items" });
    for (const item of section.items) {
      const li = el(doc, "li");
      li.append(el(doc, "button", { type: "button", "data-item-id": item.id }, item.text));
      list.append(li);
    }
    part.append(list);
    panel.append(part);
  }

  panel.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest?.("button[data-item-id]");
    if (!button || !panel.contains(button)) return;
    for (const other of panel.querySelectorAll("button[aria-current]")) other.removeAttribute("aria-current");
    button.setAttribute("aria-current", "true");
    announce(panel, "room:item-selected", { id: button.getAttribute("data-item-id") ?? "" });
  });
  return panel;
}

/** A bubbling event from the panel, made by the panel's own window (jsdom's or the browser's). */
function announce(target: HTMLElement, type: string, detail?: unknown): void {
  const View = target.ownerDocument.defaultView;
  if (View) target.dispatchEvent(new View.CustomEvent(type, { detail, bubbles: true }));
}

/** room-data.json's resume, from the site's own origin; absent when it can't be read. */
export async function fetchRoomResume(fetcher: typeof fetch = fetch): Promise<RoomResume> {
  try {
    const response = await fetcher(ROOM_DATA_HREF, { credentials: "same-origin", cache: "no-cache" });
    return response.ok ? asRoomResume(await response.json()) : ABSENT;
  } catch {
    return ABSENT;
  }
}
