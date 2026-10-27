// The interactive resume (spec 002, T029; FR-010, FR-018; contracts/room-scene.md §1 and §5): a panel over the room
// with the header, each section's heading, and each item as a button in a list; "Download (PDF)"; and "Close".
// It opens from any control marked data-resume-open (the room's "Resume" and the hand-off's "Read the resume now"),
// and closes with "Close" or Escape, focus back on the control that opened it.
//
// Selecting an item marks it (aria-current) and dispatches `room:item-selected` with its ID, for narration (Phase 5)
// and the usage events (Phase 6); opening dispatches `room:resume-opened`. Nothing is stored, and nothing is
// fetched but room-data.json from the site's own origin.
import { ABSENT, asRoomResume, type RoomResume } from "./data";

export const PDF_HREF = "./resume.pdf";
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
    el(doc, "a", { class: "resume-pdf", href: PDF_HREF, download: "" }, "Download (PDF)"),
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

/** Wires every control marked data-resume-open to one panel, built on first use from what `load` returns. */
export function wireResumeOpeners(doc: Document, load: () => Promise<RoomResume> = () => fetchRoomResume()): void {
  let panel: HTMLElement | null = null;
  /** The panel while room-data.json is on its way, so presses before it arrives share one load and one panel. */
  let building: Promise<HTMLElement> | null = null;
  let opener: HTMLElement | null = null;

  const build = async (): Promise<HTMLElement> => {
    const built = resumePanel(doc, await load());
    built.querySelector(".resume-close")?.addEventListener("click", close);
    built.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });
    (doc.querySelector("main") ?? doc.body).append(built);
    return built;
  };

  const close = (): void => {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    opener?.focus();
  };

  const open = async (from: HTMLElement): Promise<void> => {
    opener = from;
    building ??= build();
    panel = await building;
    if (!panel.hidden) return;
    panel.hidden = false;
    panel.querySelector<HTMLElement>("#resume-title")?.focus();
    announce(panel, "room:resume-opened");
  };

  doc.addEventListener("click", (event) => {
    const from = (event.target as Element | null)?.closest?.<HTMLElement>("[data-resume-open]");
    if (from) void open(from);
  });
}
