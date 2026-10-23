// FR-073's report (spec 004; FR-052 to FR-054, FR-073, SC-006, SC-010; R-21, R-24; contracts/room-bundle.md §10;
// contracts/plain-model-fit.md §8.3): the Markdown `npm run room:report` prints and every merge-request note of a
// branch that changes the room's data or models pastes whole. It isn't written into dist/. Its parts, in §10's form:
// - the header: the bundle's digest (its first 16 hex), the build's kind, and the caps' source and SHA-256, or FR-053's
//   starting figures while main has no room block;
// - a row per catalog entry: how many placements and poses show it, its source (the studio file, the stand-in and why,
//   with the findings' rules and never their data, or the avatar a figure shows), its model's plain and gzip-9 bytes,
//   triangles, and texture memory, and its budget; its stylized scale beside its ID where above 1;
// - the totals: the largest set model against the caps; the scene's texture memory by class, summed as RK3 sums it
//   (each placed piece's budget once, by its picture's class; the twin's and the largest visitor avatar's measured
//   textures, 0 with a note while their files don't exist; every bound face's canvas at min(px, its largest on-screen
//   size × the reference phone's pixel ratio)); the first visit, the placed models' .glb.gz and cards beside the
//   design's estimate and the enforced phase-3 limit, and spec 003's F3 view, every file under assets/room/ at gzip-9;
//   and a note for each small prop the caps name that the catalog doesn't have;
// - legibility: each bound face's smallest cap height on each reference stage at the production framing, with the
//   floor, the margin, and readable, atmosphere (max <n>), or under (RG7's measure);
// - the switches: each one's case-to-pose table, and for every two poses that show different placements, the largest
//   on-screen distance any corner of the piece moves, or the largest glow a pose changes, on each stage: apart, or under
//   the floor (RG8, which only reports);
// - the findings, each line, a lenient one marked warn in a lenient build, or "none".
// Bytes are integers with thousands separators and glyph heights are to 0.1 px. Nothing in it is a time, a path
// outside the repository, or a data string: pieces, placements, faces, switches, and poses are named by IDs, each only
// where RT2 passed it.
import type { Box } from "../../src/room/compose/framing";
import { regionCap, smallestCapPx, typefaceFor } from "../../src/room/compose/legibility";
import type { CapRegion, CapSource } from "../../src/room/compose/legibility";
import { transformPoint } from "../../src/room/compose/math";
import type { Mat4, Vec3 } from "../../src/room/compose/math";
import { projector, toStage } from "../../src/room/compose/project";
import { TIER_VALUES } from "../../src/room/compose/vocabulary";
import { fit, textureMemory } from "../../src/room/glb/fit";
import { gzipBytes } from "../../src/room/glb/gzip";
import { count, fixed } from "../../src/room/glb/rules";
import type { RoomIndex } from "../../src/room/compose/bundle";
import type { Composed, RoomReport, StageView } from "./emit";
import { formatPath } from "./checks/family";
import type { Pose, Switch } from "./schema";
import { compareBytewise } from "./source";
import type { Tree } from "./source";

/** The design's estimate of the room's share of the first visit (FR-053). */
export const DESIGN_ESTIMATE = 12_000_000;

const DASH = "–";
const px = (value: number | null): string => (value === null ? DASH : `${fixed(value, 1)} px`);
/** A plain number as the report prints a figure that isn't bytes: to 1e-6, in its shortest form. */
const plain = (value: number): string => String(Math.round(value * 1e6) / 1e6 || 0);

/** Every file under a folder of the tree, by its path, in listing order. */
function filesUnder(tree: Tree, dir: string): { path: string; data: Uint8Array }[] {
  const out: { path: string; data: Uint8Array }[] = [];
  for (const name of tree.list(dir)) {
    const path = `${dir}/${name}`;
    const data = tree.read(path);
    if (data !== null) out.push({ path, data });
    else out.push(...filesUnder(tree, path));
  }
  return out;
}

/** A GLB's texture memory, Σ ⌊16 · w · h / 3⌋ over its images, as the fit check measures it; 0 where it can't. */
function textureBytesOf(path: string, data: Uint8Array): number {
  const input = { bounds: { min: [0, 0, 0], max: [0, 0, 0] }, faces: [], smallPropTexturePx: null } as const;
  return fit(data, input, { file: path, gzipBytes: 0 }).measures.textureBytes ?? 0;
}

/** The figures' measured texture memory: the twin's largest GLB under assets/twin/, and the largest visitor avatar's
 *  under assets/visitors/; null for one whose files don't exist. */
function avatars(tree: Tree): { twin: number | null; visitor: number | null } {
  const largest = (files: { path: string; data: Uint8Array }[]): number | null => {
    const glbs = files.filter((f) => f.path.endsWith(".glb"));
    return glbs.length === 0 ? null : Math.max(...glbs.map((f) => textureBytesOf(f.path, f.data)));
  };
  return { twin: largest(filesUnder(tree, "assets/twin")), visitor: largest(filesUnder(tree, "assets/visitors")) };
}

/** A box's eight corners. */
function corners(b: Box): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}

/** What the report prints in place of an ID RT2 refused. */
const REFUSED = "(an ID RT2 refused)";

export function roomReport(c: Composed, digest: string, index: RoomIndex): RoomReport {
  const shown = (id: string): string => (c.reader.printable(id) ? `\`${id}\`` : REFUSED);
  const scene = c.scene;
  const lines: string[] = [];

  // The header.
  const sha16 = c.policy.caps_sha256?.slice(0, 16) ?? "";
  const caps =
    c.policy.caps !== null
      ? `${c.policy.caps_source}, assets/policy/caps.json ${sha16}`
      : c.policy.caps_source === "defaults"
        ? "FR-053's starting figures: main has no room caps; every model stays a stand-in"
        : `${c.policy.caps_source}, assets/policy/caps.json ${sha16}: RK4 refuses its room block, so FR-053's starting ` +
          "figures stand in, and every model stays a stand-in";
  lines.push(
    "## Room report",
    "",
    `Bundle ${digest.slice(0, 16)} · ${c.options.drafts ? "drafts" : "release"} build · caps: ${caps}`,
    "",
  );

  // A row per piece.
  const shows = new Map<string, number>();
  const bump = (piece: string, by: number): void => {
    shows.set(piece, (shows.get(piece) ?? 0) + by);
  };
  for (const p of scene?.placements ?? []) bump(p.piece, 1);
  for (const sw of scene?.switches ?? []) bump(sw.piece, Object.keys(sw.poses).length);
  const figureOnly = (piece: string): boolean => {
    const placed = (scene?.placements ?? []).filter((p) => p.piece === piece);
    return (
      placed.length > 0 &&
      placed.every((p) => c.figures.has(p.id)) &&
      !(scene?.switches ?? []).some((s) => s.piece === piece)
    );
  };
  lines.push(
    "| Piece | Placements | Source | Bytes | gzip-9 bytes | Triangles | Texture memory | Budget (gzip-9 · triangles · texture) |",
    "|---|---:|---|---:|---:|---:|---:|---|",
  );
  const ids = [...c.pieces.keys()].sort(compareBytewise);
  for (const id of ids) {
    const entry = c.pieces.get(id)?.value;
    const picture = c.pictures.get(id);
    if (!entry || !picture) continue;
    const name = `${shown(id)}${entry.stylized_scale > 1 ? ` at ${plain(entry.stylized_scale)}×` : ""}`;
    const file = (f: string): string => (c.reader.printable(id) ? `\`${f}\`` : "(a file RT2 refused)");
    let cells: string[];
    if (picture.kind === "model") {
      const m = picture.measures;
      cells = [
        `studio, ${file(picture.file)}`,
        count(picture.bytes.length),
        count(picture.gz.length),
        count(m.triangles ?? 0),
        count(m.textureBytes ?? 0),
      ];
    } else if (picture.kind === "card") {
      cells = [
        `studio, ${file(picture.file)}`,
        count(picture.bytes.length),
        count(gzipBytes(picture.bytes)),
        DASH,
        count(picture.textureBytes),
      ];
    } else if (figureOnly(id)) cells = ["avatar", DASH, DASH, DASH, DASH];
    else {
      const why = picture.rules.length > 0 ? `${picture.reason}: ${picture.rules.join(", ")}` : picture.reason;
      cells = [`stand-in (${why})`, DASH, DASH, DASH, DASH];
    }
    const b = entry.budget;
    const budget = `${count(b.gzip_bytes)} · ${count(b.triangles)} · ${count(b.texture_bytes)}`;
    lines.push(`| ${name} | ${shows.get(id) ?? 0} | ${cells.join(" | ")} | ${budget} |`);
  }
  lines.push("");

  // The totals: the largest set model against the caps, the scene's texture memory by class, and the first visit.
  const placed = new Set<string>();
  for (const p of scene?.placements ?? []) if (!c.figures.has(p.id)) placed.add(p.piece);
  for (const sw of scene?.switches ?? []) placed.add(sw.piece);
  const set = [...placed].flatMap((id) => {
    const picture = c.pictures.get(id);
    return picture && picture.kind !== "stand-in" ? [picture] : [];
  });
  const models = set.flatMap((p) => (p.kind === "model" ? [p] : []));
  const largestGz = Math.max(0, ...models.map((m) => m.gz.length));
  const largestTriangles = Math.max(0, ...models.map((m) => m.measures.triangles ?? 0));
  let [modelBytes, cardBytes] = [0, 0];
  for (const id of placed) {
    const entry = c.pieces.get(id)?.value;
    if (!entry) continue;
    if (c.pictures.get(id)?.kind === "card") cardBytes += entry.budget.texture_bytes;
    else modelBytes += entry.budget.texture_bytes;
  }
  const phone = c.stages.find((s) => s.name === "phone");
  const canvases = index.faces.reduce((sum, f) => {
    const dpr = phone?.dpr ?? 1;
    const w = Math.min(f.px[0], Math.floor(f.screen_css[0] * dpr));
    const h = Math.min(f.px[1], Math.floor(f.screen_css[1] * dpr));
    return sum + textureMemory(w, h);
  }, 0);
  const figures = avatars(c.reader.tree);
  const avatarBytes = (figures.twin ?? 0) + (figures.visitor ?? 0);
  const total = modelBytes + cardBytes + avatarBytes + canvases;
  const share = set.reduce((sum, p) => sum + (p.kind === "model" ? p.gz.length : p.bytes.length), 0);
  const f3 = filesUnder(c.reader.tree, "assets/room").reduce((sum, f) => sum + gzipBytes(f.data), 0);
  lines.push(
    `Per piece, the largest against the caps: ${count(largestGz)} of ${count(c.caps.gzip_bytes)} gzip-9 bytes; ` +
      `${count(largestTriangles)} of ${count(c.caps.triangles)} triangles.`,
    `Scene texture memory: ${count(total)} of ${count(c.caps.scene_texture_bytes)} bytes (models ${count(modelBytes)} · ` +
      `image cards ${count(cardBytes)} · avatars ${count(avatarBytes)} · live-face canvases ${count(canvases)}).`,
  );
  if (figures.twin === null && figures.visitor === null)
    lines.push("The twin's and the visitors' avatars have no file under assets/ yet, so they count 0.");
  else if (figures.twin === null) lines.push("The twin has no file under assets/twin/ yet, so it counts 0.");
  else if (figures.visitor === null)
    lines.push("No visitor's avatar has a file under assets/visitors/ yet, so they count 0.");
  lines.push(
    `First visit, the room's share: ${count(share)} gzip-9 bytes of placed models and cards, beside the design's ` +
      `estimate of ${count(DESIGN_ESTIMATE)}; the enforced limit is spec 003's phase-3 first visit, ` +
      `${count(c.policy.phase3_bytes)}. Spec 003's F3 view, every file under assets/room/: ${count(f3)}.`,
  );
  if (c.policy.caps !== null)
    c.caps.small_props.forEach((id, i) => {
      if (!c.pieces.has(id)) lines.push(`The caps' small_props[${i}] names no piece of the catalog.`);
    });
  lines.push("");

  // Legibility, RG7's measure, on both reference stages.
  lines.push(...legibility(c, index), "");

  // The switches: their cases, and their poses' separation (RG8).
  lines.push(...switches(c), "");

  // The findings.
  if (c.findings.length === 0) lines.push("Findings: none.");
  else {
    const warn = (lenient: boolean): string => (c.options.mode === "lenient" && lenient ? "warn " : "");
    lines.push(
      `Findings: ${c.findings.length}.`,
      "",
      "```text",
      ...c.findings.map((f) => `${warn(f.lenient)}${f.rule} ${f.file}:${f.path}: ${f.reason}`),
      "```",
    );
  }
  return { markdown: `${lines.join("\n")}\n` };
}

/** Each bound face's smallest cap height on each reference stage, with the floor, the margin, and its status. */
function legibility(c: Composed, index: RoomIndex): string[] {
  if (index.faces.length === 0) return ["No face is bound."];
  const floor = c.caps.legibility_floor_css_px;
  const outlines = new Map(c.room.outlines.map((o) => [o.value.sign, o.value]));
  const ratio = new Map(c.typefaces.map((t) => [t.use, t.cap_ratio]));
  const out = ["| Face | Readable | Desktop | Phone | Floor | Margin | Status |", "|---|---|---:|---:|---:|---:|---|"];
  for (const face of index.faces) {
    const p = c.placements.get(face.placement);
    const live = p && c.pieces.get(p.piece)?.value.live_faces.find((f) => f.role === face.role);
    const model = c.model.get(face.placement);
    let sizes: (number | null)[] = c.stages.map(() => null);
    if (live && model) {
      const geometry = { at: live.at, size: live.size, facing: live.facing, up: live.up ?? ([0, 1, 0] as const) };
      // A sign's region measures its outline; any other, its typeface's cap ratio.
      const sourceOf = (r: (typeof face.regions)[number]): CapSource | null => {
        if (r.renderer === "sign") {
          const outline = "room_text" in r.source ? outlines.get(r.source.room_text) : undefined;
          return outline ? { outline } : null;
        }
        const use = typefaceFor(r.renderer, r.source);
        const capRatio = use === null ? undefined : ratio.get(use);
        return capRatio === undefined ? null : { capRatio };
      };
      const regions: CapRegion[] = face.regions.flatMap((r) => {
        const source = sourceOf(r);
        const cap = source && regionCap(geometry, { rect: r.rect, renderer: r.renderer, grid: r.grid }, source);
        return cap ? [{ rect: r.rect, cap }] : [];
      });
      sizes = c.stages.map((s) => smallestCapPx(model, geometry, regions, s.camera, s.stage));
    }
    const known = sizes.filter((s): s is number => s !== null);
    const smallest = known.length === sizes.length && known.length > 0 ? Math.min(...known) : null;
    const status = face.atmosphere
      ? `atmosphere (max ${face.max_chars ?? 0})`
      : smallest !== null && smallest >= floor
        ? "readable"
        : "under";
    const at = (c.scene?.placements ?? []).findIndex((x) => x.id === face.placement);
    const name =
      c.reader.printable(face.placement) && c.reader.printable(face.role)
        ? `\`${face.id}\``
        : formatPath(["placements", at, "faces", face.role], (key) => c.reader.printable(key));
    out.push(
      `| ${name} | ${face.readable ? "yes" : "no"} | ${sizes.map(px).join(" | ")} | ${plain(floor)} | ` +
        `${smallest === null ? DASH : px(smallest - floor)} | ${status} |`,
    );
  }
  return out;
}

/** The world corners of a switch's piece at a pose: a set model's measured bounds, or the expected ones at its scale. */
function poseCorners(c: Composed, sw: Switch, pose: Pose): Vec3[] | null {
  const world = c.poseWorld(pose);
  const entry = c.pieces.get(sw.piece)?.value;
  if (!world || !entry) return null;
  const picture = c.pictures.get(sw.piece);
  const s = entry.stylized_scale;
  const box: Box =
    picture?.kind === "model"
      ? picture.bounds
      : {
          min: [entry.origin.bounds.min[0] * s, entry.origin.bounds.min[1] * s, entry.origin.bounds.min[2] * s],
          max: [entry.origin.bounds.max[0] * s, entry.origin.bounds.max[1] * s, entry.origin.bounds.max[2] * s],
        };
  return corners(box).map((p) => transformPoint(world, p));
}

/** The glows a pose sets, by placement and glow, at their levels, beside every glow either pose names. */
function glowLevel(c: Composed, pose: Pose, placement: string, glow: string): number {
  const set = pose.glows.find((g) => g.placement === placement && g.glow === glow);
  if (set) return set.level;
  const p = c.placements.get(placement);
  return (p && c.pieces.get(p.piece)?.value.glows.find((g) => g.id === glow)?.level) ?? 1;
}

/** The largest on-screen separation of two poses on a stage: any corner's move, or a changed glow's diameter. */
function separation(c: Composed, sw: Switch, a: Pose, b: Pose, view: StageView): number | null {
  const [ca, cb] = [poseCorners(c, sw, a), poseCorners(c, sw, b)];
  if (!ca || !cb) return null;
  const v = projector(view.camera, view.stage.w / view.stage.h);
  const css = (p: Vec3): readonly [number, number] => toStage(v.project(p), view.stage);
  let largest = 0;
  ca.forEach((p, i) => {
    const [x, y] = [css(p), css(cb[i] as Vec3)];
    largest = Math.max(largest, Math.hypot(y[0] - x[0], y[1] - x[1]));
  });
  const named = [...a.glows, ...b.glows].map((g) => [g.placement, g.glow] as const);
  for (const [placement, glow] of named) {
    if (glowLevel(c, a, placement, glow) === glowLevel(c, b, placement, glow)) continue;
    const p = c.placements.get(placement);
    const entry = p && c.pieces.get(p.piece)?.value;
    const g = entry?.glows.find((x) => x.id === glow);
    const model: Mat4 | undefined = c.model.get(placement);
    if (!entry || !g || !model) continue;
    const centre = transformPoint(model, g.at);
    const edge = transformPoint(model, [g.at[0] + g.radius, g.at[1], g.at[2]]);
    const [x, y] = [css(centre), css(edge)];
    largest = Math.max(largest, 2 * Math.hypot(y[0] - x[0], y[1] - x[1]));
  }
  return largest;
}

/** Each switch's case-to-pose table, and every two of its poses that show different placements, apart or not. A switch
 *  or a pose whose name RT2 refused is named by its path. */
function switches(c: Composed): string[] {
  const list = c.scene?.switches ?? [];
  if (list.length === 0) return ["Switches: none."];
  const floor = c.caps.legibility_floor_css_px;
  const printable = (key: string): boolean => c.reader.printable(key);
  const switchName = (sw: Switch, i: number): string =>
    printable(sw.id) ? `\`${sw.id}\`` : formatPath(["switches", i]);
  const poseName = (pose: string, i: number): string =>
    printable(pose) ? `\`${pose}\`` : formatPath(["switches", i, "poses", pose], printable);
  const out = [`| Switch | ${TIER_VALUES.join(" | ")} |`, `|${"---|".repeat(TIER_VALUES.length + 1)}`];
  list.forEach((sw, i) => {
    const cells = TIER_VALUES.map((v) => {
      const pose = Object.hasOwn(sw.cases, v) ? sw.cases[v] : sw.default;
      return pose === undefined ? DASH : poseName(pose, i);
    });
    out.push(`| ${switchName(sw, i)} | ${cells.join(" | ")} |`);
  });
  out.push("", "| Switch | Poses | Desktop | Phone | Status |", "|---|---|---:|---:|---|");
  const same = (a: Pose, b: Pose): boolean =>
    a.mount.on === b.mount.on &&
    a.mount.anchor === b.mount.anchor &&
    a.mount.offset.every((v, i) => v === b.mount.offset[i]) &&
    a.mount.turn.x === b.mount.turn.x &&
    a.mount.turn.y === b.mount.turn.y &&
    a.mount.turn.z === b.mount.turn.z;
  list.forEach((sw, s) => {
    const poses = Object.entries(sw.poses);
    poses.forEach(([nameA, a], i) => {
      for (const [nameB, b] of poses.slice(i + 1)) {
        if (same(a, b)) continue;
        const sizes = c.stages.map((view) => separation(c, sw, a, b, view));
        const apart = sizes.every((size) => size !== null && size >= floor);
        out.push(
          `| ${switchName(sw, s)} | ${poseName(nameA, s)} / ${poseName(nameB, s)} | ${sizes.map(px).join(" | ")} | ` +
            `${apart ? "apart" : "under the floor"} |`,
        );
      }
    });
  });
  return out;
}
