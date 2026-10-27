// The choice screen (spec 002, T040; FR-001–FR-004; contracts/room-scene.md §1): the path, engineer or not, and one
// of the four placeholder avatars, both as radio buttons; the data-flow disclosure link and the PDF link, which works
// without entering the room (FR-018); and "Enter", disabled until both are chosen. Nothing in the room plays before it.
// The AI disclosure is index.html's header, on every screen. The form is built by script and never submits, so no
// browser restores or remembers its choices: a reload asks again (FR-002).
import "./choice.css";

import { h } from "../room/dom";
import { AVATARS, avatarPreview, isAvatarId } from "./avatars";
import type { AvatarId } from "./avatars";
import { PATHS, isVisitPath } from "./visit";
import type { VisitPath } from "./visit";

export interface Choice {
  path: VisitPath;
  avatar: AvatarId;
}

function option(doc: Document, group: string, value: string, name: string, preview?: Element): HTMLElement {
  const input = h(doc, "input", { type: "radio", name: group, value });
  const label = h(doc, "label", { class: "choice-option" }, input);
  if (preview) label.append(preview);
  label.append(h(doc, "span", {}, name));
  return label;
}

export function renderChoice(doc: Document, options: { onEnter(choice: Choice): void; onPdf(): void }): HTMLElement {
  const enter = h(
    doc,
    "button",
    { type: "submit", class: "choice-enter", disabled: true, "aria-describedby": "choice-hint" },
    "Enter",
  );
  const form = h(
    doc,
    "form",
    { class: "choice-form", autocomplete: "off", novalidate: true },
    h(
      doc,
      "fieldset",
      {},
      h(doc, "legend", {}, "Your path"),
      h(doc, "div", { class: "choice-options" }, ...PATHS.map((p) => option(doc, "path", p.id, p.name))),
    ),
    h(
      doc,
      "fieldset",
      {},
      h(doc, "legend", {}, "Your avatar"),
      h(
        doc,
        "div",
        { class: "choice-options" },
        ...AVATARS.map((a) => option(doc, "avatar", a.id, a.name, avatarPreview(doc, a.id))),
      ),
    ),
    h(doc, "p", { id: "choice-hint", class: "choice-hint" }, "Choose a path and an avatar to enter."),
    enter,
  );
  const pdf = h(doc, "a", { href: "./resume.pdf", download: true }, "Download the resume (PDF)");
  pdf.addEventListener("click", () => options.onPdf());

  const checked = (group: string): string | undefined =>
    form.querySelector<HTMLInputElement>(`input[name="${group}"]:checked`)?.value;
  const chosen = (): Partial<Choice> => {
    const path = checked("path");
    const avatar = checked("avatar");
    return { ...(isVisitPath(path) ? { path } : {}), ...(isAvatarId(avatar) ? { avatar } : {}) };
  };
  form.addEventListener("change", () => {
    const { path, avatar } = chosen();
    enter.disabled = !(path && avatar);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const { path, avatar } = chosen();
    if (path && avatar) options.onEnter({ path, avatar });
  });

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
