// Names in a room model (spec 004 FR-018; contracts/plain-model-fit.md §5, RX6): FR-018's rule for node and mesh names,
// a port of spec 003's M8 for every name (`name_problem` in tools/gates/arrival_check.py, carried by the Author's patch
// docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.patch on feat/003-us1-arrival-check; read, never applied),
// and the scrubber's neutral IDs for materials, images, textures, and samplers. Pure: no Node, DOM, or three.js.

/** FR-018's rule for a node's or a mesh's name: lowercase letters and digits in runs joined by single hyphens, which
 *  excludes Blender's `.001` suffixes. */
export const NAME_RULE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** M8's file name: a dot and 1 to 5 letters, Blender's side suffixes `.L` and `.R` aside. */
const NAME_EXTENSION = /\.(?![LRlr](?![A-Za-z]))[A-Za-z]{1,5}(?![A-Za-z0-9])/;

/** M8's camera or phone file stem, case-insensitive: IMG_, PXL_, MVIMG_, DSC and DSCN, Screenshot, WhatsApp's
 *  IMG-YYYYMMDD-WA, and Samsung's YYYYMMDD_HHMMSS. Python reads its digit class as any decimal digit, so `\p{Nd}`. */
const CAMERA_STEM =
  /(?<![a-z0-9])(?:img_|img-\p{Nd}{8}-wa|pxl_|mvimg_|dscn?(?=[_\p{Nd}])|screenshot)|(?<!\p{Nd})(?:19|20)\p{Nd}{6}_\p{Nd}{6}(?!\p{Nd})/iu;

export type NameProblem = "path" | "file-name" | "camera-stem";

/** `name_problem`, ported: whether a name holds a path, a file name, or a camera's file stem, in M8's order. */
export function nameProblem(value: string): NameProblem | null {
  if (value.includes("/") || value.includes("\\")) return "path";
  if (NAME_EXTENSION.test(value)) return "file-name";
  if (CAMERA_STEM.test(value)) return "camera-stem";
  return null;
}

/** The kinds the scrubber renames to a neutral ID. */
export const NEUTRAL_KINDS = ["material", "image", "texture", "sampler"] as const;
export type NeutralKind = (typeof NEUTRAL_KINDS)[number];

export function isNeutralKind(kind: string): kind is NeutralKind {
  return (NEUTRAL_KINDS as readonly string[]).includes(kind);
}

/** The scrubber's neutral ID, `<kind>-<its own index>` (`image-0`, `material-2`). */
export function neutralId(kind: NeutralKind, index: number): string {
  return `${kind}-${index}`;
}

/** Whether a key from the file may be printed in a finding's path: identifier-like, and holding nothing M8 refuses. A
 *  key that isn't printable is left out of the path, so a refusal never prints a name, a path, or a file name. */
export function printableKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) && nameProblem(key) === null;
}
