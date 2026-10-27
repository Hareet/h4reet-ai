// Building the room's DOM (spec 002, Phase 4): elements and SVG from attributes and children, never from markup
// strings, so every text the room shows goes in as text. Attributes only: the CSP's style-src 'self' refuses a style
// attribute, so looks come from the stylesheets' classes.
export type Attrs = Readonly<Record<string, string | number | boolean | undefined>>;

export const SVG_NS = "http://www.w3.org/2000/svg";

function setAll(el: Element, attrs: Attrs): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? "" : String(value));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  setAll(el, attrs);
  el.append(...children);
  return el;
}

export function svg(doc: Document, tag: string, attrs: Attrs = {}, ...children: (Node | string)[]): SVGElement {
  const el = doc.createElementNS(SVG_NS, tag) as SVGElement;
  setAll(el, attrs);
  el.append(...children);
  return el;
}
