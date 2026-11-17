// The skin the build ships (spec 030, T-INT02; Q73, Q108): content/ui-skins.yaml resolved as build/ui-skins.ts's
// plugin resolves it (the image skin's files read from the repository's root, so `metal`, its CSS fallback, while they
// aren't in the tree), its generated stylesheet (`virtual:ui-skin.css`), the ID the build writes on the root's
// data-skin, and the custom properties of its one rule, `:root[data-skin="<id>"]`. For the tests that judge a colour
// pair of the skinned controls, or a page with the skin in place, from what the build emits rather than an estimate.
// Declares no test.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { STATES, VARIANTS, readSkins, resolveSkin, skinCss } from "../../build/ui-skins";
import type { ButtonState, Variant } from "../../build/ui-skins";
import { WEB, parseCss } from "./room";

export interface BuiltSkin {
  /** The resolved skin's ID, the root's data-skin on the built page. */
  readonly id: string;
  /** The generated stylesheet's text. */
  readonly css: string;
  /** Its rule's custom properties, by name. */
  readonly tokens: ReadonlyMap<string, string>;
}

/** The skin the build ships from the repository's content/ui-skins.yaml. */
export function builtSkin(): BuiltSkin {
  const resolved = resolveSkin(readSkins(readFileSync(join(WEB, "content", "ui-skins.yaml"), "utf8")));
  const css = skinCss(resolved);
  const selector = `:root[data-skin="${resolved.id}"]`;
  const rule = parseCss(css).rules.find((r) => r.selector === selector);
  if (!rule) throw new Error(`the built skin's stylesheet has no ${selector} rule`);
  return { id: resolved.id, css, tokens: rule.declarations };
}

/** The variants and the states of the skin's tokens (build/ui-skins.ts). */
export const SKIN_VARIANTS: readonly Variant[] = VARIANTS;
export const SKIN_STATES: readonly ButtonState[] = STATES;

/** One state's colours of a variant from the built skin's tokens: its face, label, and border's line; the variant's
 *  focus ring. */
export function stateColours(
  skin: BuiltSkin,
  variant: Variant,
  state: ButtonState,
): { face: string; label: string; border: string; ring: string } {
  const get = (name: string): string => {
    const v = skin.tokens.get(name);
    if (v === undefined) throw new Error(`the built skin has no ${name}`);
    return v;
  };
  return {
    face: get(`--btn-${variant}-${state}-face`),
    label: get(`--btn-${variant}-${state}-label`),
    border: get(`--btn-${variant}-${state}-border`),
    ring: get(`--btn-${variant}-ring`),
  };
}
