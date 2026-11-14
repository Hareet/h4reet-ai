// A key cap (spec 018; FR-013, plan.md §1 P4): a small span in code that shows a key's name beside an action. It is
// decoration: hidden from assistive technology, its name carried in the button's own accessible name, and styled by
// class only (the CSP's `style-src 'self'`).

/** The key cap for a key's name, e.g. "Esc" or "Enter". */
export function keycap(doc: Document, name: string): HTMLElement {
  const cap = doc.createElement("span");
  cap.className = "hud-keycap";
  cap.setAttribute("aria-hidden", "true");
  cap.textContent = name;
  return cap;
}
