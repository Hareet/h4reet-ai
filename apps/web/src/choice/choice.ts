// The choice screen (spec 002, T040; FR-001–FR-004; contracts/room-scene.md §1): the path, engineer or not, and one
// of the four placeholder avatars, both as radio buttons; the data-flow disclosure link and the PDF link, which works
// without entering the room (FR-018); and "Enter", disabled until both are chosen. Nothing in the room plays before it.
// The AI disclosure is index.html's header, on every screen. The form is built by script and never submits, so no
// browser restores or remembers its choices: a reload asks again (FR-002).
//
// Spec 029 (group D; FR-024 to FR-035; plan.md §R-D2, §R-D3): two numbered steps of cards over the same native radio
// groups and values. Step 1's role cards and an outcome card that shows what the chosen role means for the visit (not a
// live region); step 2's character cards, each with its flat picture, name, and line. Each radio stays inside its
// `label.choice-option`, named by the card's name and described by its line. A pointer activation, Enter, or Space on a
// role card moves focus to step 2; the `click` an arrow key fires (detail 0) doesn't, and Enter in step 1 never submits.
//
// Spec 030 (group C; FR-015 to FR-018; plan.md §R-C1): a dark page. The body carries dark-page while the screen shows,
// from its render until "Enter" (the room has its own look); dark.css holds the room's panel tokens, and choice.css draws
// the cards from them and from group B's skin tokens, each with a fallback. Both arrive in the bundle's stylesheet, so
// nothing is fetched before "Enter" (FR-018).
import "../pages/dark.css";
import "./choice.css";

import { PDF_HREF, pdfFileName } from "../resume/download";
import { h, svg } from "../room/dom";
import { AVATARS, avatarPreview, isAvatarId } from "./avatars";
import type { AvatarId } from "./avatars";
import { AVATAR_LINES, HINT, ROLE_CARDS, ROLE_COMMON, ROLE_EMPTY, SELECTED, STEPS } from "./cards";
import { PATHS, isVisitPath } from "./visit";
import type { VisitPath } from "./visit";

export interface Choice {
  path: VisitPath;
  avatar: AvatarId;
}

/** The role cards' marks, drawn in code on a 24-unit square: a code bracket, and a speech bubble. */
const ROLE_MARKS: Readonly<Record<VisitPath, string>> = {
  engineer: "M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16",
  "non-engineer": "M4 5h16v11H10l-5 4v-4H4z",
};

function glyph(doc: Document, className: string, d: string): SVGElement {
  return svg(
    doc,
    "svg",
    { class: className, viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
    svg(doc, "path", { d }),
  );
}

/** A card: the native radio, its picture, its name, its line where it has one, and the chosen card's mark and word.
 *  The radio is named by the card's name alone and described by `describedBy`. */
function option(
  doc: Document,
  group: string,
  value: string,
  name: string,
  picture: Element,
  describedBy: string,
  line?: string,
): HTMLElement {
  const nameId = `choice-name-${group}-${value}`;
  const input = h(doc, "input", {
    type: "radio",
    name: group,
    value,
    "aria-labelledby": nameId,
    "aria-describedby": describedBy,
  });
  const label = h(
    doc,
    "label",
    { class: `choice-option choice-card choice-card-${group}` },
    input,
    picture,
    h(doc, "span", { id: nameId, class: "choice-name" }, name),
  );
  if (line !== undefined) label.append(h(doc, "span", { id: describedBy, class: "choice-line" }, line));
  label.append(
    h(
      doc,
      "span",
      { class: "choice-chosen" },
      glyph(doc, "choice-check", "M5 12.5l4.5 4.5L19 7.5"),
      h(doc, "span", { class: "choice-selected", "aria-hidden": "true" }, SELECTED),
    ),
  );
  return label;
}

const roleDescriptionId = (id: VisitPath): string => `choice-role-${id}`;

/** The body's class while the screen shows (spec 030, FR-015; src/pages/dark.css). */
const DARK_PAGE = "dark-page";

export function renderChoice(doc: Document, options: { onEnter(choice: Choice): void; onPdf(): void }): HTMLElement {
  const enter = h(
    doc,
    "button",
    { type: "submit", class: "choice-enter", disabled: true, "aria-describedby": "choice-hint" },
    "Enter",
  );
  const empty = h(doc, "p", { class: "choice-outcome-empty" }, ROLE_EMPTY);
  const descriptions = PATHS.map((p) =>
    h(
      doc,
      "p",
      { id: roleDescriptionId(p.id), class: "choice-outcome-role", hidden: true },
      ROLE_CARDS[p.id].description,
    ),
  );
  const common = h(doc, "p", { class: "choice-outcome-common", hidden: true }, ROLE_COMMON);
  const outcome = h(doc, "div", { class: "choice-outcome" }, empty, ...descriptions, common);
  const roleStep = h(
    doc,
    "fieldset",
    { class: "choice-step choice-step-role" },
    h(doc, "legend", {}, STEPS.role.legend),
    h(doc, "p", { class: "choice-instruction" }, STEPS.role.instruction),
    h(
      doc,
      "div",
      { class: "choice-cards choice-roles" },
      ...PATHS.map((p) =>
        option(doc, "path", p.id, p.name, glyph(doc, "choice-mark", ROLE_MARKS[p.id]), roleDescriptionId(p.id)),
      ),
      outcome,
    ),
  );
  const avatarStep = h(
    doc,
    "fieldset",
    { class: "choice-step choice-step-avatar" },
    h(doc, "legend", {}, STEPS.avatar.legend),
    h(
      doc,
      "div",
      { class: "choice-cards choice-avatars" },
      ...AVATARS.map((a) =>
        option(doc, "avatar", a.id, a.name, avatarPreview(doc, a.id), `choice-line-avatar-${a.id}`, AVATAR_LINES[a.id]),
      ),
    ),
  );
  const form = h(
    doc,
    "form",
    { class: "choice-form", autocomplete: "off", novalidate: true },
    roleStep,
    avatarStep,
    h(doc, "p", { id: "choice-hint", class: "choice-hint" }, HINT),
    enter,
  );
  const pdf = h(doc, "a", { href: PDF_HREF, download: pdfFileName() }, "Download the resume (PDF)");
  pdf.addEventListener("click", () => options.onPdf());

  const checked = (group: string): string | undefined =>
    form.querySelector<HTMLInputElement>(`input[name="${group}"]:checked`)?.value;
  const chosen = (): Partial<Choice> => {
    const path = checked("path");
    const avatar = checked("avatar");
    return { ...(isVisitPath(path) ? { path } : {}), ...(isAvatarId(avatar) ? { avatar } : {}) };
  };
  const showOutcome = (path: VisitPath | undefined): void => {
    empty.hidden = path !== undefined;
    for (const [i, p] of PATHS.entries()) {
      const el = descriptions[i];
      if (el) el.hidden = p.id !== path;
    }
    common.hidden = path === undefined;
  };
  form.addEventListener("change", () => {
    const { path, avatar } = chosen();
    showOutcome(path);
    enter.disabled = !(path && avatar);
  });

  // The focus move (plan.md §R-D3; spec Q10, FR-032). An arrow key in a radio group fires a click (detail 0) on the
  // radio it selects, so only a pointer's own click (detail > 0), Enter, or Space moves. The move runs a task later, so
  // a pointer's click on a card's label and the label's activation (which clicks and focuses the radio in step 1) are
  // both done first; a second click before then (the label's forwarded click) schedules nothing more.
  const win = doc.defaultView;
  let moving = false;
  const toStep2 = (): void => {
    if (moving || !win) return;
    moving = true;
    win.setTimeout(() => {
      moving = false;
      const avatars = [...avatarStep.querySelectorAll<HTMLInputElement>('input[name="avatar"]')];
      (avatars.find((a) => a.checked) ?? avatars[0])?.focus();
    }, 0);
  };
  // The page's own constructors and no `instanceof Element`: the tests' documents are jsdom windows in a node realm.
  const asElement = (target: EventTarget | null): Element | null =>
    target && typeof (target as Element).closest === "function" ? (target as Element) : null;
  const roleRadio = (target: EventTarget | null): HTMLInputElement | null => {
    const el = asElement(target);
    return el?.matches('input[type="radio"][name="path"]') ? (el as HTMLInputElement) : null;
  };
  const choose = (input: HTMLInputElement): void => {
    if (input.checked || !win) return;
    input.checked = true;
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
  };
  roleStep.addEventListener("click", (event) => {
    if (event.detail > 0 && asElement(event.target)?.closest(".choice-card")) toStep2();
  });
  roleStep.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    // No implicit submission from step 1.
    event.preventDefault();
    const input = roleRadio(event.target);
    if (!input) return;
    choose(input);
    toStep2();
  });
  roleStep.addEventListener("keyup", (event) => {
    if (event.key !== " " && event.key !== "Spacebar") return;
    // The browser's click (detail 0) for Space is keyup's default action, after this listener, so the radio isn't
    // checked yet here: check it and send its change before the move (plan.md §R-D3, rv-rework-spec-029cd's RC-1).
    const input = roleRadio(event.target);
    if (!input) return;
    choose(input);
    toStep2();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const { path, avatar } = chosen();
    if (!(path && avatar)) return;
    doc.body.classList.remove(DARK_PAGE);
    options.onEnter({ path, avatar });
  });

  doc.body.classList.add(DARK_PAGE);
  return h(
    doc,
    "section",
    { class: "choice", "aria-labelledby": "choice-heading" },
    h(doc, "h1", { id: "choice-heading" }, "The Author's work area"),
    h(
      doc,
      "p",
      {},
      "Choose your path and an avatar, then enter. As you arrive, the twin hands you the Author's resume.",
    ),
    form,
    h(
      doc,
      "ul",
      { class: "choice-links" },
      h(doc, "li", {}, pdf),
      h(doc, "li", {}, h(doc, "a", { href: "./disclosure/" }, "How data flows")),
    ),
  );
}
