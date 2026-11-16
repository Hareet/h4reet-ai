// A key cap (spec 018; FR-013, plan.md §1 P4): a small span in code that shows a key's name beside an action. It is
// decoration: hidden from assistive technology, its name carried in the button's own accessible name, and styled by
// class only (the CSP's `style-src 'self'`).

/** The key cap's metrics (spec 028, FR-011; plan.md §R-A4), which split.css's `.hud-keycap` sets and
 *  test/ui/hud-split-list.test.ts pins: its type in rem, IBM Plex Mono's advance in em (600 units of 1000), its
 *  padding on each side, its least width, and its border. The split list's cap slot is sized from them. */
export const KEYCAP = { fontRem: 0.75, advanceEm: 0.6, padXRem: 0.375, minWidthRem: 1.5, borderPx: 1 } as const;

/** A key cap's width in rem at a 16-pixel root, for a key's name: its characters at the mono advance, its padding,
 *  and its border, at least its least width. */
export function keycapWidthRem(name: string): number {
  const k = KEYCAP;
  return Math.max(k.minWidthRem, name.length * k.advanceEm * k.fontRem + 2 * k.padXRem + (2 * k.borderPx) / 16);
}

/** The key cap for a key's name, e.g. "Esc" or "Enter". */
export function keycap(doc: Document, name: string): HTMLElement {
  const cap = doc.createElement("span");
  cap.className = "hud-keycap";
  cap.setAttribute("aria-hidden", "true");
  cap.textContent = name;
  return cap;
}
