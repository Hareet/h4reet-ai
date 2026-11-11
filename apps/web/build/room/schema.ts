// The room's data files as zod strictObjects (spec 004; FR-002 to FR-005, FR-020, FR-029 to FR-033, FR-036, FR-040,
// FR-043, FR-049; R-01; data-model.md §3 to §8; contracts/room-data-files.md §2 to §12), the constraints T076 and T077
// give quoted beside each. An unknown key, a missing key, or a value outside its type or range refuses the file
// (checks/rd.ts maps each issue to RD2, RD3, or RD4). A constraint that a rule of another family names carries that
// rule in its message, `<rule>: <reason>` (`own`), so the file is refused with that rule instead: RI1's grammars, RI9's
// corpus form, RG2's unit vectors, RG3's stylized scale, RS1's signal, RS6's cable figures, RL1's poll and freshness,
// RT1's region sources, RT7's missing exclude, RT13's outline keys, cap height, and path data, RV2's point counts, path
// data, and finite numbers, and RV3's stroke width. Relations between values, within a file or across files, are the
// families' (checks/). Nothing here is evaluated: values are only compared.
import { z } from "zod";

import {
  GLOW_MOTIONS,
  LIVE_SWITCHES,
  LOOK_METHODS,
  RENDERERS,
  ROLES,
  TIER_VALUES,
  TURN_COST_PARTS,
  TYPEFACE_USES,
} from "../../src/room/compose/vocabulary";
import { isUiKey } from "../../src/room/ui-keys";
import { AVATARS } from "../../src/choice/avatars";

/** IDs `^[a-z][a-z0-9-]{1,40}$` (§3.1), and every other name (§3.2). */
export const ID = /^[a-z][a-z0-9-]{1,40}$/;
/** A live face's role, FR-018's object-name rule (§3.2). */
export const ROLE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A colour by value, `#rrggbb` in lowercase (§2). */
export const HEX = /^#[0-9a-f]{6}$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A topic's corpus file, `corpus/NN-<topic>.md` at the corpus's top level, spec 002's C1 form (§6; RI9). */
export const CORPUS_FILE = /^corpus\/\d{2}-[a-z0-9-]+\.md$/;
/** An outline's `intent_ref`, `intent-NNN` (§8). */
export const INTENT_REF = /^intent-\d{3}$/;
/** An outline's `source.id`, spec 003's source-ID form (§8). */
export const SOURCE_ID = /^[A-Za-z0-9-]{3,40}$/;
/** A retired ID's kinds (§3.3). */
export const NAMESPACES = ["piece", "placement", "selectable", "topic"] as const;

const OWNED = /^(R[A-Z]\d+): (.+)$/s;

/** A check's message naming the rule that refuses it, `<rule>: <reason>`. */
export function own(rule: string, reason: string): { error: string } {
  return { error: `${rule}: ${reason}` };
}

/** The rule and reason an `own` message carries, or null for zod's own messages. */
export function owner(message: string): { rule: string; reason: string } | null {
  const m = OWNED.exec(message);
  return m ? { rule: m[1] as string, reason: m[2] as string } : null;
}

// ---- Values every file shares (§2) ----

const num = z.number();
const positive = z.number().gt(0);
const count = z.number().int().min(1);
const vec3 = z.tuple([num, num, num]);
const pair = z.tuple([num, num]);
const line = (reason: string) => z.string().regex(/^[^\n\r]*$/, own("RD3", reason));
/** A name: the ID grammar, RI1's. */
const name = (what: string) => z.string().regex(ID, own("RI1", `${what} outside the grammar ${ID.source}`));
/** "A turn: {x, y, z} in degrees, each 0 when absent and at most 360 in size." */
const degrees = z.number().min(-360).max(360).default(0);
const turn = z.strictObject({ x: degrees, y: degrees, z: degrees }).default(() => ({ x: 0, y: 0, z: 0 }));
/** "A box: {min: [x, y, z], max: [x, y, z]}, min below max on every axis." */
const box = z.strictObject({ min: vec3, max: vec3 }).superRefine((b, ctx) => {
  if (!b.min.every((v, i) => v < (b.max[i] as number)))
    ctx.addIssue({ code: "custom", message: "RD3: min isn't below max on every axis" });
});
const version = () => z.literal(1, own("RD4", "a version other than 1"));
/** A `{file, quote}`: an intent's words (`words_from`), or a corpus citation (`claims`). */
const quoteRef = z.strictObject({ file: z.string(), quote: z.string() });
/** A placement's anchor, `{placement, anchor}`. */
const anchorRef = z.strictObject({ placement: z.string(), anchor: z.string() });
const labelKey = z.string().startsWith("label.", own("RD3", "not a UI word key label.<name>"));
const isPowerOfTwo = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/** A unit vector within 1e-6: RG2's. */
const unit = z
  .tuple([num, num, num])
  .refine((v) => Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) <= 1e-6, own("RG2", "not a unit vector within 1e-6"));

/**
 * Path data, §8's grammar: SVG's path commands `M m Z z L l H h V v C c S s Q q T t A a`, finite numbers (an optional
 * sign, digits with at most one decimal point, an optional exponent), commas, and spaces, and nothing else, opening
 * with a move as SVG's own grammar does.
 */
export function isPathData(d: string): boolean {
  const token = /([MmZzLlHhVvCcSsQqTtAa])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|([ ,]+)/y;
  let commands = 0;
  for (let at = 0; at < d.length;) {
    token.lastIndex = at;
    const m = token.exec(d);
    if (m === null) return false;
    if (m[1] !== undefined) {
      if (commands === 0 && m[1] !== "M" && m[1] !== "m") return false;
      commands++;
    } else if (m[2] !== undefined && (commands === 0 || !Number.isFinite(Number(m[2])))) return false;
    at = token.lastIndex;
  }
  return commands > 0;
}

const pathData = (rule: string) => z.string().refine(isPathData, own(rule, "path data outside §8's grammar"));

// ---- The catalog (§4; T076) ----

const anchor = z.strictObject({ at: vec3, turn, estimated: z.boolean().default(false) });

/** `live_faces[]`: `role` FR-018's rule; `size` "[w, h] in metres, each above 0"; `facing` and `up` unit vectors, `up`
 *  required when `facing` is ±Y; `px` "[w, h], integers 16 to 2048"; `readable` required. */
const liveFace = z
  .strictObject({
    role: z.string().regex(ROLE, own("RI1", `a live face's role outside the object-name rule ${ROLE.source}`)),
    at: vec3,
    size: z.tuple([positive, positive]),
    facing: unit,
    up: unit.optional(),
    px: z.tuple([z.number().int().min(16).max(2048), z.number().int().min(16).max(2048)]),
    readable: z.boolean(),
  })
  .superRefine((f, ctx) => {
    if (f.up === undefined && f.facing[0] === 0 && f.facing[2] === 0)
      ctx.addIssue({ code: "custom", message: "RD3: up is required where facing is ±Y", path: ["up"] });
  });

/** Spec 014 (FR-045; T001's RD6): a path glow's spread, its half-width in metres at scale 1, above 0 and at most 0.05. */
const SPREAD_MAX = 0.05;

/** `glows[]`: `radius` "metres above 0"; `motion` flicker, breathe, or steady; `level` "0 to 1, default 1". Since spec
 *  014 (its FR-045; Amendment W9) a glow gives exactly one of a `radius`, with its `at`, and a `path` of at least two
 *  points with a `spread` in (0, 0.05]; RD6 refuses anything else, and RG10 a path point outside the piece's bounds. */
const glow = z
  .strictObject({
    id: name("a glow's name"),
    at: vec3.optional(),
    radius: positive.optional(),
    path: z.array(vec3).optional(),
    spread: z.number().optional(),
    tone: z.string(),
    motion: z.enum(GLOW_MOTIONS),
    level: z.number().min(0).max(1).default(1),
  })
  .superRefine((g, ctx) => {
    const fail = (message: string): void => ctx.addIssue({ code: "custom", message: `RD6: ${message}` });
    if (g.radius !== undefined && g.path !== undefined) return fail("both a radius and a path");
    if (g.radius === undefined && g.path === undefined) return fail("neither a radius nor a path");
    if (g.radius !== undefined) {
      if (g.spread !== undefined) return fail("a spread without a path");
      if (g.at === undefined)
        ctx.addIssue({ code: "custom", message: "RD3: a disc glow's at is required", path: ["at"] });
      return;
    }
    if ((g.path?.length ?? 0) < 2) return fail("a path of fewer than two points");
    if (g.spread === undefined) return fail("a path without a spread");
    if (!(g.spread > 0) || g.spread > SPREAD_MAX) return fail("a spread not above 0 and at most 0.05");
  });

/** `claims`: `{signal: tier, poses}`, each pose to the tier value it claims, or null. */
const claims = z.strictObject({
  signal: z.literal("tier"),
  poses: z.record(name("a pose's name"), z.enum(TIER_VALUES).nullable()),
});

/** Every stand-in shape takes `at`, an optional `turn` and `scale`, `color`, and `lit` (default true) (§4.1). */
const shaped = {
  at: vec3,
  turn,
  scale: z.union([num, vec3]).optional(),
  color: z.string(),
  lit: z.boolean().default(true),
};
/** `standin[]`: "at least one", from the closed shape grammar. */
const standin = z.discriminatedUnion("shape", [
  z.strictObject({ shape: z.literal("box"), size: vec3, ...shaped }),
  z.strictObject({ shape: z.literal("cylinder"), radius: num, height: num, ...shaped }),
  z.strictObject({ shape: z.literal("capsule"), radius: num, length: num, ...shaped }),
  z.strictObject({ shape: z.literal("sphere"), radius: num, ...shaped }),
  z.strictObject({ shape: z.literal("torus"), radius: num, tube: num, ...shaped }),
  z.strictObject({ shape: z.literal("plane"), size: pair, ...shaped }),
  z.strictObject({ shape: z.literal("circle"), radius: num, ...shaped }),
  z.strictObject({ shape: z.literal("tube"), from: vec3, to: vec3, radius: num, ...shaped }),
  z.strictObject({ shape: z.literal("polygon"), points: z.array(pair).min(3), depth: num, ...shaped }),
]);

/** A drawing's number: finite, RV2's. */
const drawn = z.number({
  error: (iss) => (typeof iss.input === "number" ? "RV2: a number that isn't finite" : undefined),
});
const drawnPair = z.tuple([drawn, drawn]);
/** "2 to 256 [x, y] pairs", RV2's. */
const points = z
  .array(drawnPair)
  .min(2, own("RV2", "fewer than 2 points"))
  .max(256, own("RV2", "more than 256 points"));
/** Each primitive takes `fill` and `stroke` (colours, or none) and `stroke_width` ("metres, at least 0", RV3's). */
const paint = {
  fill: z.string().default("none"),
  stroke: z.string().default("none"),
  stroke_width: drawn.min(0, own("RV3", "a negative stroke width")).default(0),
};
const primitive = z.discriminatedUnion("primitive", [
  z.strictObject({ primitive: z.literal("rect"), x: drawn, y: drawn, w: drawn, h: drawn, ...paint }),
  z.strictObject({ primitive: z.literal("circle"), cx: drawn, cy: drawn, r: drawn, ...paint }),
  z.strictObject({ primitive: z.literal("ellipse"), cx: drawn, cy: drawn, rx: drawn, ry: drawn, ...paint }),
  z.strictObject({ primitive: z.literal("line"), x1: drawn, y1: drawn, x2: drawn, y2: drawn, ...paint }),
  z.strictObject({ primitive: z.literal("polyline"), points, ...paint }),
  z.strictObject({ primitive: z.literal("polygon"), points, ...paint }),
  z.strictObject({ primitive: z.literal("path"), d: pathData("RV2"), ...paint }),
]);
/** `drawing`: `{primitives: [...]}` or `{from: standin}`. */
const drawing = z
  .strictObject({ primitives: z.array(primitive).optional(), from: z.literal("standin").optional() })
  .superRefine((d, ctx) => {
    if ((d.primitives === undefined) === (d.from === undefined))
      ctx.addIssue({ code: "custom", message: "RD3: a drawing is primitives or from: standin, one of the two" });
  });

/** `budget`: `{gzip_bytes, triangles, texture_px, texture_bytes}`, "integers above 0"; `texture_px` a power of two. */
const budget = z.strictObject({
  gzip_bytes: count,
  triangles: count,
  texture_px: count.refine(isPowerOfTwo, own("RD3", "not a power of two")),
  texture_bytes: count,
});

/** `model`: `{file: "<piece>.glb"}` or `{card: "<piece>.png"}` (or `.jpg`, `.webp`). */
const model = z
  .strictObject({
    file: z
      .string()
      .regex(/\.glb$/, own("RD3", "not a .glb file"))
      .optional(),
    card: z
      .string()
      .regex(/\.(png|jpg|webp)$/, own("RD3", "not a .png, .jpg, or .webp file"))
      .optional(),
  })
  .superRefine((m, ctx) => {
    if ((m.file === undefined) === (m.card === undefined))
      ctx.addIssue({ code: "custom", message: "RD3: a model is a file or a card, one of the two" });
  });

/** `work_order`: `{method, shots[], measurements[], studio_notes}`. */
const workOrder = z.strictObject({
  method: z.string(),
  shots: z.array(z.string()),
  measurements: z.array(z.string()),
  studio_notes: z.string(),
});

/** `apps/web/room/catalog/<piece>.yaml` (§4). */
export const catalogSchema = z.strictObject({
  version: version(),
  id: name("a piece's ID"),
  /** "string, 1 to 60 characters" */
  name: z.string().min(1).max(60),
  /** "{w, h, d}, each above 0", with `estimated` a boolean */
  size: z.strictObject({ w: positive, h: positive, d: positive, estimated: z.boolean().default(false) }),
  /** "number, 1 to 4, default 1", RG3's */
  stylized_scale: z
    .number()
    .min(1, own("RG3", "a stylized scale under 1"))
    .max(4, own("RG3", "a stylized scale over 4"))
    .default(1),
  origin: z.strictObject({ point: z.string(), bounds: box }),
  /** "map of anchor name to {at, turn?, estimated?}" */
  anchors: z.record(name("an anchor's name"), anchor).default(() => ({})),
  live_faces: z.array(liveFace).default(() => []),
  glows: z.array(glow).default(() => []),
  claims: claims.optional(),
  standin: z.array(standin).min(1),
  /** Optional in the schema: a piece with none is RV1's. */
  drawing: drawing.optional(),
  budget,
  model: model.optional(),
  work_order: workOrder,
});

// ---- The scene (§5; T076) ----

/** A mount: `offset` "default [0, 0, 0]"; `turn` 0 each by default; `estimated` "default false". */
const mount = z.strictObject({
  on: z.string(),
  anchor: z.string(),
  offset: vec3.default((): [number, number, number] => [0, 0, 0]),
  turn,
  estimated: z.boolean().default(false),
});

const fraction = z.number().min(0).max(1);
const extent = z.number().gt(0).max(1);
const grid = z.strictObject({ cols: count.optional(), rows: count.optional(), chars: count.optional() });

/** The grid each renderer takes (§5.3): `{cols, rows}`, `{rows}`, `{chars}`, or none for a sign. */
function gridFits(renderer: string, g: { cols?: unknown; rows?: unknown; chars?: unknown } | undefined): boolean {
  const has = (k: "cols" | "rows" | "chars"): boolean => g !== undefined && g[k] !== undefined;
  switch (renderer) {
    case "terminal":
    case "desktop-session":
      return has("cols") && has("rows") && !has("chars");
    case "chalk":
      return has("rows") && !has("cols") && !has("chars");
    case "neon":
      return has("chars") && !has("cols") && !has("rows");
    default:
      return g === undefined;
  }
}

/** A region: `rect` "[x, y, w, h], fractions of the face" (w and h above 0), with exactly one of `text`,
 *  `resume_titles` (chalk only), `ui`, and `signal` with `part` (neon only), RT1's. */
const region = z
  .strictObject({
    rect: z.tuple([fraction, fraction, extent, extent]),
    renderer: z.enum(RENDERERS),
    grid: grid.optional(),
    text: z.string().optional(),
    resume_titles: z.literal(true).optional(),
    ui: z.array(z.string()).optional(),
    signal: z.literal("turn-cost").optional(),
    part: z.enum(TURN_COST_PARTS).optional(),
  })
  .superRefine((r, ctx) => {
    const sources = [r.text, r.resume_titles, r.ui, r.signal].filter((s) => s !== undefined).length;
    const rt1 = (reason: string): void => ctx.addIssue({ code: "custom", message: `RT1: ${reason}` });
    if (sources !== 1) rt1("a region with none, or more than one, of text, resume_titles, ui, and signal");
    else if (r.resume_titles !== undefined && r.renderer !== "chalk") rt1("resume_titles off a chalk region");
    else if ((r.ui !== undefined || r.signal !== undefined) && r.renderer !== "neon")
      rt1("ui or signal off a neon region");
    if ((r.signal === undefined) !== (r.part === undefined))
      ctx.addIssue({ code: "custom", message: "RD3: part comes with signal, and only with it", path: ["part"] });
    if (!gridFits(r.renderer, r.grid))
      ctx.addIssue({ code: "custom", message: `RD3: not the grid a ${r.renderer} region takes`, path: ["grid"] });
  });

/** A face binding: `atmosphere` "default false"; `max_chars` "integer, at least 1", required with `atmosphere`;
 *  `regions[]` "at least one". */
const faceBinding = z
  .strictObject({
    label: labelKey,
    atmosphere: z.boolean().default(false),
    max_chars: count.optional(),
    regions: z.array(region).min(1),
  })
  .superRefine((f, ctx) => {
    if (f.atmosphere && f.max_chars === undefined)
      ctx.addIssue({ code: "custom", message: "RD3: max_chars is required with atmosphere", path: ["max_chars"] });
  });

/** A placement: `frame` "default false"; `label` a `label.<name>` key; `role` twin or visitor; `faces`. */
const placement = z.strictObject({
  id: name("a placement's ID"),
  piece: z.string(),
  mount: mount.optional(),
  frame: z.boolean().default(false),
  label: labelKey.optional(),
  role: z.enum(ROLES).optional(),
  faces: z.record(z.string(), faceBinding).optional(),
});

/** A pose: its mount, and the glow levels it sets on other placements. */
const pose = z.strictObject({
  mount,
  glows: z
    .array(z.strictObject({ placement: z.string(), glow: z.string(), level: z.number().min(0).max(1) }))
    .default(() => []),
});

/** A cable: `sag` "0 to 0.5 of the span", `radius` "metres above 0", and `drop` "default 0", RS6's. */
const cable = z.strictObject({
  from: z.string(),
  to: anchorRef,
  sag: z.number().min(0, own("RS6", "a sag outside 0 to 0.5")).max(0.5, own("RS6", "a sag outside 0 to 0.5")),
  radius: z.number().gt(0, own("RS6", "a radius not above 0")),
  drop: z.number().min(0, own("RS6", "a negative drop")).default(0),
  rest: anchorRef.optional(),
});

/** A switch: `signal` tier, RS1's; `poses`; `cases`; `default`; `cable`. */
const switchSchema = z.strictObject({
  id: name("a switch's name"),
  signal: z.literal("tier", own("RS1", "a switch on a signal other than tier")),
  piece: z.string(),
  label: labelKey,
  poses: z.record(name("a pose's name"), pose),
  /** Any key: a case for a value the signal doesn't have is RS1's. */
  cases: z.record(z.string(), z.string()),
  default: z.string().optional(),
  cable: cable.optional(),
});

/** A selectable: `name` "string, 1 to 40 characters"; `members` "at least one"; `action` `{talk: {topic, lead?}}` or
 *  `{resume: {}}`; `lead` "one line of at most 120 characters". */
const selectable = z.strictObject({
  id: name("a selectable's ID"),
  name: z.string().min(1).max(40),
  members: z.array(z.string()).min(1),
  action: z
    .strictObject({
      talk: z
        .strictObject({ topic: z.string(), lead: line("a lead of more than one line").max(120).optional() })
        .optional(),
      resume: z.strictObject({}).optional(),
    })
    .superRefine((a, ctx) => {
      if ((a.talk === undefined) === (a.resume === undefined))
        ctx.addIssue({ code: "custom", message: "RD3: an action is talk or resume, one of the two" });
    }),
});

/** `retired[]`: `kinds` defaulting to all four; `retired` YYYY-MM-DD. */
const retired = z.strictObject({
  id: name("a retired ID"),
  kinds: z.array(z.enum(NAMESPACES)).default(() => [...NAMESPACES]),
  retired: z.string().regex(DATE, own("RD3", "not a date, YYYY-MM-DD")),
  reason: z.string(),
});

const LIVE_OFF = { source: "off", poll_s: 30, freshness_s: 35, turn: "off", asset_events: "off" } as const;
/** `live`: `source` off or site, default off; `poll_s` "integer, 30 to 120", default 30; `freshness_s` "integer, at
 *  least poll_s + 5", default 35; `turn` and `asset_events` off or site, default off. The figures are RL1's. */
const live = z
  .strictObject({
    source: z.enum(LIVE_SWITCHES).default("off"),
    poll_s: z
      .number()
      .int(own("RL1", "a poll interval that isn't an integer"))
      .min(30, own("RL1", "a poll interval outside 30 to 120"))
      .max(120, own("RL1", "a poll interval outside 30 to 120"))
      .default(30),
    freshness_s: z.number().int(own("RL1", "a freshness window that isn't an integer")).default(35),
    turn: z.enum(LIVE_SWITCHES).default("off"),
    asset_events: z.enum(LIVE_SWITCHES).default("off"),
  })
  .superRefine((l, ctx) => {
    const sound = (n: number): boolean => Number.isInteger(n);
    if (sound(l.poll_s) && l.poll_s >= 30 && l.poll_s <= 120 && sound(l.freshness_s) && l.freshness_s < l.poll_s + 5)
      ctx.addIssue({ code: "custom", message: "RL1: a freshness window under poll_s + 5", path: ["freshness_s"] });
  })
  .default(() => ({ ...LIVE_OFF }));

/** Spec 008's walking defaults (its plan.md §3.1; FR-056), each the spec's figure. */
export const WALKING_DEFAULTS = {
  speed_mps: 1,
  turn_dps: 90,
  tilt_dps: 45,
  radius_m: 0.12,
  reach_m: 0.3,
  reach_cone_deg: 60,
  camera: { yaw_deg: 60, pitch_deg: [0, 35] as [number, number], min_distance_m: 1.2, focus_height_m: 1.1 },
} as const;

const W = WALKING_DEFAULTS;
const pitchDeg = z.number().min(0).max(60);

/** The scene's `walking` block (spec 008, FR-056; plan.md §3.1), every key optional with the spec's default: the
 *  speed "0.3 to 2.0", the turn rate "30 to 180", the tilt rate "15 to 90", the radius "0.05 to 0.4", the reach "0.2
 *  to 1.5" and its cone "15 to 90", and the camera's yaw "0 to 75", its pitch "each 0 to 60, the first at most the
 *  second", its minimum distance "0.5 to 3.0", and its focus height "0.5 to 2.0". */
const walkingCamera = z
  .strictObject({
    yaw_deg: z.number().min(0).max(75).default(W.camera.yaw_deg),
    pitch_deg: z
      .tuple([pitchDeg, pitchDeg])
      .default((): [number, number] => [W.camera.pitch_deg[0], W.camera.pitch_deg[1]])
      .superRefine((p, ctx) => {
        if (p[0] > p[1]) ctx.addIssue({ code: "custom", message: "RD3: a pitch whose first is over its second" });
      }),
    min_distance_m: z.number().min(0.5).max(3).default(W.camera.min_distance_m),
    focus_height_m: z.number().min(0.5).max(2).default(W.camera.focus_height_m),
  })
  .default(() => ({ ...W.camera, pitch_deg: [W.camera.pitch_deg[0], W.camera.pitch_deg[1]] as [number, number] }));

const walking = z
  .strictObject({
    speed_mps: z.number().min(0.3).max(2).default(W.speed_mps),
    turn_dps: z.number().min(30).max(180).default(W.turn_dps),
    tilt_dps: z.number().min(15).max(90).default(W.tilt_dps),
    radius_m: z.number().min(0.05).max(0.4).default(W.radius_m),
    reach_m: z.number().min(0.2).max(1.5).default(W.reach_m),
    reach_cone_deg: z.number().min(15).max(90).default(W.reach_cone_deg),
    camera: walkingCamera,
  })
  .default(() => ({
    ...W,
    camera: { ...W.camera, pitch_deg: [W.camera.pitch_deg[0], W.camera.pitch_deg[1]] as [number, number] },
  }));

/** Spec 009's figures block, its defaults (FR-037; plan.md §3.1): no stand-in, avatar textures at most 1,024 pixels a
 *  side, and the hand-off's wait of 1,500 ms. */
export const FIGURES_DEFAULTS = { texture_px: 1024, wait_ms: 1500 } as const;

/** Spec 014 (FR-039; plan.md PD-16; T001's RD7): a grip, the held edge's middle `at` in the hand bone's frame, each
 *  coordinate within ±0.15 m, and the sheet's `turn` from its axes, each within ±180°. */
const GRIP_AT = 0.15;
const GRIP_TURN = 180;
const gripCoordinate = z.number().refine((v) => Math.abs(v) <= GRIP_AT, own("RD7", "past ±0.15 m"));
const gripDegrees = z.number().refine((v) => Math.abs(v) <= GRIP_TURN, own("RD7", "past ±180°"));
const grip = z.strictObject({
  at: z.tuple([gripCoordinate, gripCoordinate, gripCoordinate]),
  turn: z.strictObject({ x: gripDegrees, y: gripDegrees, z: gripDegrees }),
});
/** `figures.grips`: from an avatar of the room's table to `right` and `left`, RD7 refusing any other key. */
const grips = z.record(z.string(), z.record(z.string(), grip)).superRefine((value, ctx) => {
  for (const [avatar, hands] of Object.entries(value)) {
    if (!AVATARS.some((a) => a.id === avatar))
      ctx.addIssue({ code: "custom", message: "RD7: not an avatar of the room's table", path: [avatar] });
    for (const hand of Object.keys(hands))
      if (hand !== "right" && hand !== "left")
        ctx.addIssue({ code: "custom", message: "RD7: a hand but right and left", path: [avatar, hand] });
  }
});

/** Spec 016's twin block's defaults (its FR-021, FR-029, FR-054; contracts/twin-data.md §1): the resting time, the
 *  speaking pace and its bounds, and the lean's figures, the hand-back's for the delivered desk and clip. The clip map's
 *  are twin-states.ts's TWIN_CLIPS_DEFAULT; the texture side's is the block's texture_px; the still's rectangle is the
 *  twin figure's box's width, at its top (emit.ts). */
export const TWIN_DEFAULTS = {
  rest_after_s: 20,
  speak_wpm: 150,
  speak_s: [3, 20] as readonly [number, number],
  behind_m: 0.679,
  right_m: 0.45,
} as const;

/** `figures.twin` (spec 016, FR-054; plan.md R-15): every key optional. `clips`, from a state to a clip role, whose
 *  closed lists RI8 holds (ri.ts), so a key or value outside them is RI8's, never RD2's; `rest_after_s` "an integer, 5
 *  to 600"; `speak_wpm` "an integer, 60 to 400"; `speak_s` "[min, max], 0.5 ≤ min ≤ max ≤ 60"; `lean` with `against` a
 *  placement ID (RI8: the survey's desk's piece), `behind_m` 0.1 to 2 and `right_m` 0 to 2, defaulting to the
 *  hand-back's; `texture_px` "a power of two, 256 to 4,096"; and `still.rect`, `[x, y, w, h]` in metres, w and h above
 *  0. */
const twinBlock = z.strictObject({
  clips: z.record(z.string(), z.string()).optional(),
  rest_after_s: z.number().int().min(5).max(600).optional(),
  speak_wpm: z.number().int().min(60).max(400).optional(),
  speak_s: z
    .array(z.number())
    .refine(
      (v) =>
        v.length === 2 && 0.5 <= (v[0] as number) && (v[0] as number) <= (v[1] as number) && (v[1] as number) <= 60,
      own("RD3", "not [min, max] with 0.5 ≤ min ≤ max ≤ 60"),
    )
    .optional(),
  lean: z
    .strictObject({
      against: z.string(),
      behind_m: z.number().min(0.1).max(2).default(TWIN_DEFAULTS.behind_m),
      right_m: z.number().min(0).max(2).default(TWIN_DEFAULTS.right_m),
    })
    .optional(),
  texture_px: z.number().int().min(256).max(4096).refine(isPowerOfTwo, own("RD3", "not a power of two")).optional(),
  still: z
    .strictObject({
      rect: z
        .array(z.number())
        .refine(
          (v) => v.length === 4 && (v[2] as number) > 0 && (v[3] as number) > 0,
          own("RD3", "not [x, y, w, h] with w and h above 0"),
        ),
    })
    .optional(),
});

/** `figures` (spec 009, FR-037; plan.md §3.1): `twin_stand_in` an avatar of the room's table, which RI8 holds to it,
 *  absent for none; `texture_px` "a power of two from 256 to 4,096", 1,024 by default; `wait_ms` "an integer from 0 to
 *  3,000", 1,500 by default. */
const figures = z
  .strictObject({
    twin_stand_in: z.string().optional(),
    texture_px: z
      .number()
      .int()
      .min(256)
      .max(4096)
      .refine(isPowerOfTwo, own("RD3", "not a power of two"))
      .default(FIGURES_DEFAULTS.texture_px),
    wait_ms: z.number().int().min(0).max(3000).default(FIGURES_DEFAULTS.wait_ms),
    grips: grips.optional(),
    // Spec 016 (FR-054): the twin's own block, optional, its defaults resolved by the compositor.
    twin: twinBlock.optional(),
  })
  .default(() => ({ ...FIGURES_DEFAULTS }));

/** `apps/web/room/scene.yaml` (§5), with spec 008's optional `walking` block (Amendment M12) and spec 009's optional
 *  `figures` block. */
export const sceneSchema = z.strictObject({
  version: version(),
  look: z.string(),
  live,
  walking,
  placements: z.array(placement),
  switches: z.array(switchSchema).default(() => []),
  selectables: z.array(selectable).default(() => []),
  handoff: z.strictObject({ from: anchorRef, to: anchorRef }),
  survey: z.strictObject({ desk_corner: anchorRef }),
  retired: z.array(retired).default(() => []),
  figures,
});

// ---- Topics, room text, outlines, UI words, looks, fixtures, and lookdev.yaml (§6 to §12; T077) ----

/** `apps/web/room/topics.yaml` (§6): `phrase` "string, 1 to 60 characters"; `words_from` a "list of {file, quote}, at
 *  least one"; `corpus` a "list of paths, corpus/NN-<topic>.md", the form RI9's. */
export const topicsSchema = z.strictObject({
  version: version(),
  topics: z.array(
    z.strictObject({
      id: name("a topic's ID"),
      phrase: z.string().min(1).max(60),
      words_from: z.array(quoteRef).min(1),
      corpus: z
        .array(z.string().regex(CORPUS_FILE, own("RI9", "a corpus path outside the form corpus/NN-<topic>.md")))
        .min(1),
    }),
  ),
});

/** A hint's ID: lowercase words joined by `-`, 1 to 40 characters (spec 012's contracts/hints.md §1). */
const HINT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const hintId = z
  .string()
  .max(40)
  .regex(HINT_ID, own("RD3", `a hint's id outside the grammar ${HINT_ID.source}`));
/** A hint's text before its slots are filled: one line, 1 to 200 characters. */
const hintText = line("a line break in a hint").min(1).max(200);
/** `when`: free_talk_ready alone (spec 012, FR-032, FR-035). */
const hintWhen = z.literal("free_talk_ready").optional();

/** `apps/web/room/hints.yaml` (spec 012's contracts/hints.md §1): 1 to 20 hints, each the Author's, with his words'
 *  `words_from` (exactly one, RT15's), or the session's, with its `sources` (RT14's); the other key refused by its
 *  form; an `id` once in the file. */
export const hintsSchema = z.strictObject({
  version: version(),
  hints: z
    .array(
      z.discriminatedUnion("by", [
        z.strictObject({
          id: hintId,
          by: z.literal("author"),
          text: hintText,
          words_from: z.array(quoteRef).optional(),
          when: hintWhen,
        }),
        z.strictObject({
          id: hintId,
          by: z.literal("session"),
          text: hintText,
          sources: z.array(z.string().min(1)).max(6).optional(),
          when: hintWhen,
        }),
      ]),
    )
    .min(1)
    .max(20)
    .superRefine((hints, ctx) => {
      const seen = new Set<string>();
      hints.forEach((h, i) => {
        if (seen.has(h.id))
          ctx.addIssue({ code: "custom", path: [i, "id"], message: own("RD3", "a hint's id used twice").error });
        seen.add(h.id);
      });
    }),
});

/** A line: `text` with no line break; `about_author` and `pending` default false; `claims`, whose absence on a line
 *  about the Author is RT5's. */
const textLine = z.strictObject({
  text: line("a line break in a line"),
  about_author: z.boolean().default(false),
  claims: z.array(quoteRef).optional(),
  pending: z.boolean().default(false),
});

/** `apps/web/content/room/<block>.yaml` (§7): `block` the file's stem; `renderer` terminal, desktop-session, or chalk;
 *  `words_from` "at least one on a terminal or desktop-session block"; `exclude` required on a chalk block, RT7's;
 *  `lines[]` "at least one". No other key is named `text`, `name`, or `title`. */
export const roomTextSchema = z
  .strictObject({
    version: version(),
    block: name("a room-text block's name"),
    renderer: z.enum(["terminal", "desktop-session", "chalk"]),
    words_from: z.array(quoteRef).optional(),
    exclude: z.array(z.string()).min(1).optional(),
    lines: z.array(textLine).min(1),
  })
  .superRefine((b, ctx) => {
    if (b.renderer !== "chalk" && (b.words_from === undefined || b.words_from.length === 0))
      ctx.addIssue({
        code: "custom",
        message: "RD3: at least one words_from on a terminal or desktop-session block",
        path: ["words_from"],
      });
    if (b.renderer === "chalk" && b.exclude === undefined)
      ctx.addIssue({ code: "custom", message: "RT7: a chalk block without exclude", path: ["exclude"] });
  });

/** An outline's object refuses another key as RT13 (§8: "exactly these keys"). */
const outlineKeys = {
  error: (iss: { code?: string }) => (iss.code === "unrecognized_keys" ? "RT13: a key §8 doesn't give" : undefined),
};

/** `apps/web/content/room/outlines/<sign>.outline.json` (§8): exactly `schema`, `sign`, `words`, `intent_ref`
 *  (intent-NNN), `source` (`type` design or photo; `id` `[A-Za-z0-9-]{3,40}`), `tool` (`name`, `version`, `license`),
 *  `view_box`, `cap_height` "number above 0, at most the view box's height", `advance` (optional, above 0), and
 *  `paths` ("at least one"). */
export const outlineSchema = z
  .strictObject(
    {
      schema: z.literal(1, own("RD4", "an outline's schema other than 1")),
      sign: name("a sign's name"),
      words: z.string(),
      intent_ref: z.string().regex(INTENT_REF, own("RD3", "not intent-NNN")),
      source: z.strictObject(
        {
          type: z.enum(["design", "photo"]),
          id: z.string().regex(SOURCE_ID, own("RD3", "not an opaque source ID")),
        },
        outlineKeys,
      ),
      tool: z.strictObject({ name: z.string(), version: z.string(), license: z.string() }, outlineKeys),
      view_box: z.tuple([num, num, positive, positive]),
      cap_height: z.number().gt(0, own("RT13", "a cap height not above 0")),
      advance: positive.optional(),
      paths: z.array(pathData("RT13")).min(1),
    },
    outlineKeys,
  )
  .superRefine((o, ctx) => {
    if (o.cap_height > o.view_box[3])
      ctx.addIssue({ code: "custom", message: "RT13: a cap height above the view box's height", path: ["cap_height"] });
  });

/** A UI word's key: one of `src/room/ui-keys.ts`'s, or `label.<name>`; any other is RD2's, a label's name RI1's. */
const uiKey = z.string().superRefine((key, ctx) => {
  if (key.startsWith("label.")) {
    if (!ID.test(key.slice("label.".length)))
      ctx.addIssue({ code: "custom", message: `RI1: a label's name outside the grammar ${ID.source}` });
  } else if (!isUiKey(key)) {
    ctx.addIssue({ code: "custom", message: "RD2: a UI word key outside the closed list and label.<name>" });
  }
});

/** `apps/web/room/ui-words.yaml` (§9): `{version: 1, words}`, each value a string or `{text, about_author: true,
 *  claims}`. */
export const uiWordsSchema = z.strictObject({
  version: version(),
  words: z.record(
    uiKey,
    z.union([
      z.string(),
      z.strictObject({ text: z.string(), about_author: z.literal(true), claims: z.array(quoteRef).optional() }),
    ]),
  ),
});

const hex = z.string().regex(HEX, own("RD3", "not a colour #rrggbb in lowercase"));
const intensity = z.number().min(0);
const typeface = z.strictObject({ family: z.string(), weight: z.number().int() });

/** Spec 008's highlight defaults (Clarifications, Q5): a warm yellow band 3 CSS pixels wide, framed on its outer side by
 *  an edge 1.5 CSS pixels wide in the look's ink, its outlines' colour, which the compositor fills where `edge` is
 *  left out (plan.md §3.2, §10). */
export const HIGHLIGHT_DEFAULTS = { band: "#ffd23f", band_px: 3, edge_px: 1.5 } as const;

/** A look's `highlight` (spec 008, FR-015, FR-057; plan.md §3.2), every key optional: `band` and `edge` a palette name
 *  of the look or `#rrggbb`, which RI4 holds to the look's own palette; `band_px` "2 to 8"; `edge_px` "1 to 4". RW2
 *  refuses a look whose two tones both give under 3:1 against a colour of its palette. */
const highlight = z
  .strictObject({
    band: z.string().default(HIGHLIGHT_DEFAULTS.band),
    band_px: z.number().min(2).max(8).default(HIGHLIGHT_DEFAULTS.band_px),
    edge: z.string().optional(),
    edge_px: z.number().min(1).max(4).default(HIGHLIGHT_DEFAULTS.edge_px),
  })
  .default(() => ({ ...HIGHLIGHT_DEFAULTS }));

/** `apps/web/room/looks/<look>.yaml` (§10): `method` inked-cel, painted, or flat; `palette` to `#rrggbb`; `lights`;
 *  `shading.steps` "integer 2 to 5"; `outlines`; `glow_tones`; `typefaces` for each use; `material_notes`; and spec
 *  008's optional `highlight` (Amendment M12). */
export const lookSchema = z.strictObject({
  version: version(),
  id: name("a look's name"),
  method: z.enum(LOOK_METHODS),
  palette: z.record(name("a palette colour's name"), hex),
  lights: z.strictObject({
    ambient: z.strictObject({ sky: hex, ground: hex, intensity }),
    key: z.strictObject({ color: hex, intensity, from: vec3, shadows: z.boolean() }),
  }),
  shading: z.strictObject({ steps: z.number().int().min(2).max(5) }),
  outlines: z.strictObject({ color: z.string(), width: z.number().min(0) }),
  glow_tones: z.record(name("a glow tone's name"), z.strictObject({ color: hex, intensity })),
  typefaces: z.strictObject({
    terminal: typeface,
    "desktop-session": typeface,
    chalk: typeface,
    neon: typeface,
    counters: typeface,
  } satisfies Record<(typeof TYPEFACE_USES)[number], typeof typeface>),
  material_notes: z.string(),
  highlight,
});

/** A turn's outcome (turn-cost.md): a reply may be invalid on purpose, so `route` is any string and `cost_micro_usd`
 *  any number or string; a refused turn's `status` "400 to 499". */
const turnOutcome = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("reply"), route: z.string(), cost_micro_usd: z.union([num, z.string()]) }),
  z.strictObject({ outcome: z.literal("degraded") }),
  z.strictObject({ outcome: z.literal("failed") }),
  z.strictObject({ outcome: z.literal("lost") }),
  z.strictObject({ outcome: z.literal("refused"), status: z.number().int().min(400).max(499) }),
]);

/** `apps/web/room/fixtures/<fixture>.yaml` (§11): `tier` a tier value; `turns[]`. */
export const fixtureSchema = z.strictObject({
  version: version(),
  id: name("a fixture's name"),
  tier: z.enum(TIER_VALUES),
  turns: z.array(turnOutcome),
});

/** `apps/web/room/lookdev.yaml` (§12): `vignette.show` and `close_up.frame`, each "at least one"; since spec 014 (its
 *  FR-042; PD-24), the hands view's `hands.avatars`, optional, at least one, which RI10 holds to the avatar table. */
export const lookdevSchema = z.strictObject({
  version: version(),
  vignette: z.strictObject({ show: z.array(z.string()).min(1) }),
  close_up: z.strictObject({ frame: z.array(z.string()).min(1) }),
  hands: z.strictObject({ avatars: z.array(z.string()).min(1) }).optional(),
});

export type CatalogEntry = z.output<typeof catalogSchema>;
export type Anchor = CatalogEntry["anchors"][string];
export type LiveFace = CatalogEntry["live_faces"][number];
export type Glow = CatalogEntry["glows"][number];
export type StandinEntry = CatalogEntry["standin"][number];
export type Drawing = NonNullable<CatalogEntry["drawing"]>;
export type DrawingPrimitive = NonNullable<Drawing["primitives"]>[number];
export type Scene = z.output<typeof sceneSchema>;
export type Placement = Scene["placements"][number];
export type Mount = NonNullable<Placement["mount"]>;
export type FaceBinding = NonNullable<Placement["faces"]>[string];
export type Region = FaceBinding["regions"][number];
export type Switch = Scene["switches"][number];
export type Pose = Switch["poses"][string];
export type Cable = NonNullable<Switch["cable"]>;
export type Selectable = Scene["selectables"][number];
export type Retired = Scene["retired"][number];
export type Live = Scene["live"];
export type AnchorRef = Scene["handoff"]["from"];
export type Figures = Scene["figures"];
export type Topics = z.output<typeof topicsSchema>;
export type Topic = Topics["topics"][number];
export type RoomTextBlock = z.output<typeof roomTextSchema>;
export type TextLine = RoomTextBlock["lines"][number];
export type Outline = z.output<typeof outlineSchema>;
export type UiWords = z.output<typeof uiWordsSchema>;
export type UiWord = UiWords["words"][string];
export type LookFile = z.output<typeof lookSchema>;
export type Fixture = z.output<typeof fixtureSchema>;
export type TurnOutcome = Fixture["turns"][number];
export type Lookdev = z.output<typeof lookdevSchema>;
export type Hints = z.output<typeof hintsSchema>;
export type Hint = Hints["hints"][number];
