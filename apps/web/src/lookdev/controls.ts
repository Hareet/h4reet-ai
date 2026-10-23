// The lookdev page's controls (spec 004; FR-067; research.md R-41; contracts/lookdev.md §3): the widgets page.ts builds
// its panels from, each a native form control with its own label, so every one is reachable and operable by keyboard
// and named for a screen reader: a group of radios under a legend, a labelled select, a toggle button with
// aria-pressed, which the page can set too, a plain button, and the "Load a candidate…" file picker, its input inside
// its label. Built with the room's h() (src/room/dom.ts), attributes only: no markup string, and no style attribute the
// site's CSP would refuse. A picker hands its page the picked file and nothing else of it: it clears its own value at
// once, so the name the browser shows beside a file input is never kept on the page (§4).
import { h } from "../room/dom";

/** One choice of a group or a select. */
export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** A control that a run turns off while it measures, and on again. */
export interface Control {
  readonly element: HTMLElement;
  setEnabled(on: boolean): void;
}

/** An ID for a control and its label, unique within the page. */
const ids = new WeakMap<Document, number>();
function uid(doc: Document, prefix: string): string {
  const n = (ids.get(doc) ?? 0) + 1;
  ids.set(doc, n);
  return `lookdev-${prefix}-${n}`;
}

export interface RadioGroup<T extends string> extends Control {
  readonly value: T;
  set(value: T): void;
}

/** Radios under a legend, one checked, calling `onChange` with the value chosen. */
export function radioGroup<T extends string>(
  doc: Document,
  options: {
    readonly legend: string;
    readonly choices: readonly Choice<T>[];
    readonly value: T;
    onChange(value: T): void;
  },
): RadioGroup<T> {
  const name = uid(doc, "group");
  let value = options.value;
  const inputs = options.choices.map((choice) => {
    const id = uid(doc, "radio");
    const input = h(doc, "input", { type: "radio", id, name, value: choice.value, checked: choice.value === value });
    input.addEventListener("change", () => {
      if (!input.checked || choice.value === value) return;
      value = choice.value;
      options.onChange(value);
    });
    return {
      input,
      item: h(doc, "div", { class: "lookdev-choice" }, input, h(doc, "label", { for: id }, choice.label)),
    };
  });
  const element = h(
    doc,
    "fieldset",
    { class: "lookdev-group" },
    h(doc, "legend", {}, options.legend),
    ...inputs.map((i) => i.item),
  );
  return {
    element,
    get value() {
      return value;
    },
    set(next) {
      value = next;
      for (const { input } of inputs) input.checked = input.value === next;
    },
    setEnabled(on) {
      (element as HTMLFieldSetElement).disabled = !on;
    },
  };
}

export interface SelectControl extends Control {
  readonly select: HTMLSelectElement;
}

/** A labelled select, calling `onChange` with the value chosen. */
export function selectControl<T extends string>(
  doc: Document,
  options: {
    readonly label: string;
    readonly choices: readonly Choice<T>[];
    readonly value: T;
    onChange(value: T): void;
  },
): SelectControl {
  const id = uid(doc, "select");
  const select = h(
    doc,
    "select",
    { id },
    ...options.choices.map((c) => h(doc, "option", { value: c.value, selected: c.value === options.value }, c.label)),
  );
  select.value = options.value;
  select.addEventListener("change", () => {
    const chosen = options.choices.find((c) => c.value === select.value);
    if (chosen) options.onChange(chosen.value);
  });
  const element = h(doc, "div", { class: "lookdev-field" }, h(doc, "label", { for: id }, options.label), select);
  return {
    element,
    select,
    setEnabled(on) {
      select.disabled = !on;
    },
  };
}

export interface Toggle extends Control {
  /** Shows a state the page set, without calling `onChange`: a run's, while it measures. */
  set(on: boolean): void;
}

/** A toggle button, its state in aria-pressed, calling `onChange` with the state it moved to. */
export function toggleButton(
  doc: Document,
  options: { readonly label: string; readonly pressed: boolean; onChange(on: boolean): void },
): Toggle {
  let pressed = options.pressed;
  const button = h(doc, "button", { type: "button", "aria-pressed": String(pressed) }, options.label);
  button.addEventListener("click", () => {
    pressed = !pressed;
    button.setAttribute("aria-pressed", String(pressed));
    options.onChange(pressed);
  });
  return {
    element: button,
    setEnabled(on) {
      button.disabled = !on;
    },
    set(on) {
      pressed = on;
      button.setAttribute("aria-pressed", String(pressed));
    },
  };
}

/** A button that calls `onClick`. */
export function actionButton(doc: Document, label: string, onClick: () => void): HTMLButtonElement {
  const button = h(doc, "button", { type: "button" }, label);
  button.addEventListener("click", onClick);
  return button;
}

/** What the picker hands the page: the picked file, of which only its first 4 bytes, through slice(0, 4), and then a
 *  GLB's whole, through arrayBuffer(), are ever read (§4; the review's page-10). */
export type PickedFile = Pick<Blob, "arrayBuffer" | "slice">;

/**
 * "Load a candidate…": a file input inside its label, for one piece. The input is named for the piece, keeps its
 * piece's ID in `data-piece`, and takes a GLB; it clears its value once it has handed the file over, so the picked
 * file's name stays nowhere on the page.
 */
export function filePicker(
  doc: Document,
  options: { readonly piece: string; readonly name: string; onPick(file: PickedFile): void },
): Control {
  const input = h(doc, "input", {
    type: "file",
    class: "lookdev-file",
    accept: ".glb,model/gltf-binary",
    "data-piece": options.piece,
    "aria-label": `Load a candidate for ${options.name}`,
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) options.onPick(file);
  });
  const element = h(doc, "label", { class: "lookdev-pick" }, "Load a candidate…", input);
  return {
    element,
    setEnabled(on) {
      input.disabled = !on;
    },
  };
}
