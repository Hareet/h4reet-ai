// What the button component's stylesheets ship as (spec 030; rework-030ds, rv-030ds's F-1): Vite's CSS minifier is
// the lockfile's lightningcss (`transform` with `minify: true`, Vite's minifyCSS), and it writes the shorthand
// `border-image: none` as an empty `border-image:`, which a browser drops. So every rule that turns a border image off
// (B's control: its base rule and forced colours, src/ui/button.css; DS's halves under forced colours,
// src/ui/button-image.css) must ship the longhand `border-image-source: none`, and nothing may ship an empty
// `border-image:`. Each file is minified here as Vite minifies it, and the shipped rules are read from the output.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { transform } from "lightningcss";
import { describe, expect, it } from "vitest";

import { WEB } from "../helpers/room";

/** A stylesheet of src/ as the build ships it: lightningcss's `transform`, `minify: true`, as Vite's minifyCSS. */
function shipped(rel: string): string {
  const code = Buffer.from(readFileSync(join(WEB, "src", rel), "utf8"));
  return new TextDecoder().decode(transform({ filename: rel, code, minify: true }).code);
}

/** The body of the first top-level `@media (forced-colors:active){…}` block in minified CSS. */
function forcedColours(css: string): string {
  const head = "@media (forced-colors:active){";
  const start = css.indexOf(head);
  if (start < 0) throw new Error("no forced-colours block");
  let depth = 1;
  let i = start + head.length;
  for (; i < css.length && depth > 0; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") depth -= 1;
  }
  return css.slice(start + head.length, i - 1);
}

/** Each rule of a minified block: its selector and its declarations. */
function rules(block: string): { selector: string; body: string }[] {
  return [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1] ?? "", body: m[2] ?? "" }));
}

/** Every `border-image` declaration of a rule body: `border-image:` (the shorthand) and its longhands, as shipped. */
const borderImage = (body: string | undefined): string[] =>
  (body ?? "").split(";").filter((d) => d.startsWith("border-image"));

/** The control's selector as it ends each of B's rules on the control itself (no pseudo-element, no state). */
const CONTROL = ":root[data-skin] :is(.choice .choice-enter,.ui-button)";

describe("the border image turned off as the build ships it (rv-030ds F-1)", () => {
  it("ships no empty `border-image:` and the longhand `border-image-source:none` where a rule turns the image off", () => {
    const control = shipped("ui/button.css");
    const image = shipped("ui/button-image.css");

    // Nothing anywhere ships the empty shorthand.
    expect.soft(control.match(/border-image:\s*[;}]/g) ?? [], "src/ui/button.css as shipped").toEqual([]);
    expect.soft(image.match(/border-image:\s*[;}]/g) ?? [], "src/ui/button-image.css as shipped").toEqual([]);

    // B's control, its base rule: the first rule whose selector ends at the control.
    const base = rules(control).find((r) => r.selector.endsWith(CONTROL));
    expect.soft(borderImage(base?.body), "button.css's base rule on the control").toEqual(["border-image-source:none"]);

    // B's control under forced colours.
    const forcedControl = rules(forcedColours(control)).find((r) => r.selector.endsWith(CONTROL));
    expect
      .soft(borderImage(forcedControl?.body), "button.css's forced-colours rule on the control")
      .toEqual(["border-image-source:none"]);

    // DS's halves under forced colours: the frame off.
    const halves = rules(forcedColours(image)).find((r) => r.selector.endsWith("[data-half]"));
    expect
      .soft(halves?.selector, "button-image.css's forced-colours rule on the halves")
      .toBe(":root[data-skin][data-skin-kind=image] [data-half]");
    expect.soft(halves?.body, "button-image.css's forced-colours rule on the halves").toBe("border-image-source:none");
  });
});
