// The HUD's icons (spec 005; FR-026, FR-029; plan.md §6.6, PD-18): one stroked path each on a 24-unit grid, drawn for
// this change in the repository, no icon font, file, or package. Each is built in the SVG namespace, element by element,
// hidden from assistive technology and never focusable: the control's words stay its name, and the icon sits above
// them. Their stroke is the text's colour, so they take the HUD's contrast (FR-024).
const SVG = "http://www.w3.org/2000/svg";

/** The icons, by what they show. */
export type IconName =
  "resume" | "flat" | "pause" | "fullscreen" | "fullscreen-exit" | "data" | "credits" | "walk" | "chevron";

/** Each icon's path, on a 24 × 24 grid. */
export const ICON_PATHS: Readonly<Record<IconName, string>> = {
  // A page with a folded corner and two lines.
  resume: "M6 3h9l3 3v15H6z M15 3v3h3 M9 11h6 M9 15h6",
  // A flat square: the room drawn flat.
  flat: "M4 6h16v12H4z M4 12h16",
  // Two bars.
  pause: "M9 5v14 M15 5v14",
  // Four corners, outward, and inward while in full screen.
  fullscreen: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5",
  "fullscreen-exit": "M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5",
  // An arrow through a box: data leaving the device.
  data: "M4 5h9v14H4z M9 12h11 M16 8l4 4-4 4",
  // A star.
  credits: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z",
  // A walking figure.
  walk: "M13 4.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0 M11.5 8v6 M11.5 14l-3 6 M11.5 14l3 6 M8 11l3.5-3 3.5 3",
  // A chevron, for a header button: down while open; the CSS turns it while collapsed.
  chevron: "M6 9l6 6 6-6",
};

/** An icon's SVG element. */
export function icon(doc: Document, name: IconName): SVGSVGElement {
  const svg = doc.createElementNS(SVG, "svg");
  for (const [k, v] of [
    ["class", "hud-icon"],
    ["viewBox", "0 0 24 24"],
    ["aria-hidden", "true"],
    ["focusable", "false"],
  ] as const)
    svg.setAttribute(k, v);
  const path = doc.createElementNS(SVG, "path");
  for (const [k, v] of [
    ["d", ICON_PATHS[name]],
    ["fill", "none"],
    ["stroke", "currentColor"],
    ["stroke-width", "2"],
    ["stroke-linecap", "round"],
    ["stroke-linejoin", "round"],
  ] as const)
    path.setAttribute(k, v);
  svg.append(path);
  return svg;
}
