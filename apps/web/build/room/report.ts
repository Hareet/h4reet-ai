// FR-073's report (spec 004; FR-052 to FR-054, FR-073, SC-006, SC-010; R-21, R-24; contracts/room-bundle.md §10;
// contracts/plain-model-fit.md §8.3): the Markdown `npm run room:report` prints and every merge-request note of a
// branch that changes the room's data or models pastes whole. It isn't written into dist/. Its parts, in §10's form:
// - the header: the bundle's digest (its first 16 hex), the build's kind, and the caps' source and SHA-256, or FR-053's
//   starting figures while main has no room block;
// - a row per catalog entry: how many placements and poses show it, its source (the studio file, the stand-in and why,
//   with the findings' rules and never their data, or the avatar a figure shows), its model's plain and gzip-9 bytes
//   (a card's plain length in both, "as stored", since it is served and checked so), triangles, and texture memory, and
//   its budget; its stylized scale beside its ID where above 1;
// - the totals: the largest set model against the caps; the scene's texture memory by class, RK3's own sum through its
//   own function (checks/rk.ts's `sceneTextureTotal`, at the bundle's framing): each piece placed by a placement that
//   isn't a figure's, or by a switch, by its budget once, models and image cards by its picture's class; the twin's
//   models and the largest visitor avatar's (other than the stand-in's), measured, with a note while their files don't
//   exist, and one counting each model that can't be read, which counts 0; every bound face's canvas at min(px, its
//   largest on-screen size × the reference phone's pixel ratio); the first visit, the placed models' .glb.gz and cards
//   beside the design's estimate and the enforced phase-3 limit, and spec 003's F3 view, every file under assets/room/
//   at gzip-9; and a note for each small prop the caps name that the catalog doesn't have;
// - legibility: each bound face's smallest cap height on each reference stage at the production framing, with the
//   floor, the margin, and readable, atmosphere (max <n>), or under: RG7's own measure (checks/rg.ts's `faceCaps`);
// - the switches: each one's case-to-pose table, and for every two poses its cases show, the largest on-screen distance
//   any part of the piece moves, or the size of a cue a pose's glow adds, on each stage: apart, or under the floor, RG8's
//   own measure (`poseSeparations`), which only reports;
// - spec 008's highlight: each look's band and edge, resolved, with their widths, and the lowest contrast the better of
//   the two gives against a colour of the look's palette, with that colour's name, RW2's own measure
//   (`highlightContrasts`), cut to two decimals;
// - spec 009's avatars (its FR-040): each file of each avatar's folder with its measures and whether it's bundled, the
//   scale its reader's bounds imply, which avatar the twin shows, each file with no role (RA5), RK3's figures with the
//   stand-in, and the first visit with both figures' files (RK5) beside spec 003's F3 view;
// - the findings, each line, a lenient one marked warn in a lenient build, or "none".
// Bytes are integers with thousands separators and glyph heights are to 0.1 px. Nothing in it is a time, a path
// outside the repository, or a data string: pieces, placements, faces, switches, and poses are named by IDs, each only
// where RT2 passed it.
import { AVATAR_SHAPES } from "../../src/choice/avatars";
import { TIER_VALUES } from "../../src/room/compose/vocabulary";
import { gzipBytes } from "../../src/room/glb/gzip";
import { count, fixed } from "../../src/room/glb/rules";
import type { AvatarFile } from "./avatars";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { framing } from "../../src/room/compose/framing";
import type { Box as WorldBox } from "../../src/room/compose/framing";
import { layoutFor } from "../../src/room/compose/hud";
import { memberRect } from "../../src/room/compose/pick";
import {
  REFERENCE_DESKTOP,
  REFERENCE_PHONE,
  WALK_CONTROL,
  framedStages,
  supportedStages,
  sweepScreens,
} from "../../src/room/compose/stages";
import type { Stage } from "../../src/room/compose/stages";
import type { FloorEdge } from "../../src/room/compose/floor";
import type { Composed, RoomReport } from "./emit";
import { formatPath } from "./checks/family";
import { faceCaps, pickSweep, poseSeparations, sideWallPicks, stagesPhrase } from "./checks/rg";
import type { FaceCaps } from "./checks/rg";
import { MODELS_DIR } from "./checks/ri";
import { contrastText, figureStart, highlightContrasts } from "./checks/rw";
import { leanMeasure } from "./checks/ra";
import { reachLine, twinReachOf } from "./reach";
import { figuresVisit, sceneTextureTotal, TWIN_DIR, VISITORS_DIR } from "./checks/rk";
import type { SceneTextureMemory } from "./checks/rk";
import type { Switch } from "./schema";
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

/** A count of a figure's models that can't be read, as a sentence: they count 0 (RK3). */
const unreadNote = (n: number, dir: string): string =>
  `${n} ${n === 1 ? "model" : "models"} under ${dir}/ can't be read, so ${n === 1 ? "it counts" : "they count"} 0.`;

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
      // A card is served as stored, and RK2 and the first visit count it so: its plain length, never a gzip-9 copy's.
      cells = [
        `studio, ${file(picture.file)}`,
        count(picture.bytes.length),
        `${count(picture.bytes.length)} as stored`,
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
  // RK3's own sum, by its own function, at the bundle's framing and over the compose's tree.
  const memory = sceneTextureTotal(c.geometry, c.reader.tree);
  const share = set.reduce((sum, p) => sum + (p.kind === "model" ? p.gz.length : p.bytes.length), 0);
  // A set model's copy is already made: its length is the file's gzip-9 bytes.
  const copies = new Map<string, number>();
  for (const p of c.pictures.values()) if (p.kind === "model") copies.set(`${MODELS_DIR}/${p.file}`, p.gz.length);
  const f3 = filesUnder(c.reader.tree, MODELS_DIR).reduce(
    (sum, f) => sum + (copies.get(f.path) ?? gzipBytes(f.data)),
    0,
  );
  lines.push(
    `Per piece, the largest against the caps: ${count(largestGz)} of ${count(c.caps.gzip_bytes)} gzip-9 bytes; ` +
      `${count(largestTriangles)} of ${count(c.caps.triangles)} triangles.`,
    `Scene texture memory: ${count(memory.total)} of ${count(c.caps.scene_texture_bytes)} bytes ` +
      `(models ${count(memory.models)} · image cards ${count(memory.cards)} · avatars ${count(memory.figures)} · ` +
      `live-face canvases ${count(memory.canvases)}).`,
  );
  if (memory.twin === null && memory.visitor === null)
    lines.push("The twin's and the visitors' avatars have no file under assets/ yet, so they count 0.");
  else if (memory.twin === null) lines.push("The twin has no file under assets/twin/ yet, so it counts 0.");
  else if (memory.visitor === null)
    lines.push("No visitor's avatar has a file under assets/visitors/ yet, so they count 0.");
  if (memory.unread.twin > 0) lines.push(unreadNote(memory.unread.twin, TWIN_DIR));
  if (memory.unread.visitor > 0) lines.push(unreadNote(memory.unread.visitor, VISITORS_DIR));
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

  // Spec 009's avatars (its FR-040).
  lines.push(...avatars(c, memory, share, f3), "");

  // Spec 016's twin (its FR-056; contracts/twin-data.md §8).
  lines.push(...twinLines(c, memory), "");

  // Legibility, RG7's measure, on both reference stages.
  lines.push(...legibility(c, index), "");

  // The side-wall selectables FR-064's carve-out (see listOnly) leaves to the list, and where.
  lines.push(...sideWalls(c), "");

  // Spec 005's stages (its FR-052 to FR-054, FR-057): the clear areas RG5 to RG7 and the table above run at.
  lines.push(stagesLine(), "");

  // Spec 014's frame areas (its FR-060, FR-061): the stages RG5 to RG7 run at since, each screen's ease, and the growth.
  lines.push(...frameLines(c), "");

  // The switches: their cases, and their poses' separation (RG8).
  lines.push(...switches(c), "");

  // Spec 008's highlight: each look's band and edge, and RW2's lowest contrast against its palette.
  lines.push(...highlights(c), "");

  // Spec 008's walking lines: the figure's start, RW1's measure, and spec 005's reserved boxes, RG6's.
  lines.push(...walking(c), "");

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

/**
 * Spec 009's avatars (its FR-040; plan.md §3.5): each file of each avatar's folder with its role, bytes, gzip-9 bytes,
 * triangles, and texture memory at its own size and at texture_px, bundled or why not; the scale its model's reader
 * bounds imply for each figure that may show it; which avatar the twin shows; each file with no role (RA5, reported,
 * never refused); RK3's figures with the stand-in; and the first visit with both figures' files (RK5's sum) beside
 * spec 003's F3 view, which counts one visitor folder.
 */
function avatars(c: Composed, memory: SceneTextureMemory, share: number, f3: number): string[] {
  const set = c.avatars;
  const px = set.figures.texture_px;
  const out = ["### Avatars", ""];
  const files = set.avatars.flatMap((a) => [...(a.model ? [a.model] : []), ...a.clips, ...a.others]);
  if (files.length === 0)
    out.push("No visitor avatar has a file under assets/visitors/ yet: both figures show their fallbacks.");
  else {
    out.push(
      `| File | Role | Bytes | gzip-9 bytes | Triangles | Texture memory | At ${px} px | Bundled |`,
      "|---|---|---:|---:|---:|---:|---:|---|",
    );
    const cell = (f: AvatarFile): string[] => [
      `\`${f.path}\``,
      f.role ?? DASH,
      count(f.bytes),
      f.gz === null ? DASH : count(f.gz.length),
      f.measures === null ? DASH : count(f.measures.triangles),
      f.measures === null ? DASH : count(f.measures.texture_bytes),
      f.measures === null ? DASH : count(f.measures.decoded_bytes),
      f.bundled ? "yes" : `no (${f.why ?? DASH})`,
    ];
    for (const f of files) out.push(`| ${cell(f).join(" | ")} |`);
    out.push("");
  }
  // The scale each model's reader bounds imply, for the room's height for it (the visitor's) and the twin's catalog
  // height where it stands in.
  const twinHeight = (c.scene?.placements ?? []).find((p) => p.role === "twin");
  const twinH = (twinHeight && c.pieces.get(twinHeight.piece)?.value.size.h) ?? 0;
  for (const a of set.avatars) {
    const h = a.model?.measures?.height ?? null;
    if (h === null || !(h > 0)) continue;
    const visitor = `${fixed(AVATAR_SHAPES[a.id].height / h, 3)}× for the visitor's ${plain(AVATAR_SHAPES[a.id].height)} m`;
    const twin = a.id === set.figures.stand_in ? `, ${fixed(twinH / h, 3)}× for the twin's ${plain(twinH)} m` : "";
    out.push(`Scale its reader's bounds imply for \`${a.id}\`: ${visitor}${twin}.`);
  }
  const stand = set.figures.stand_in;
  const named = c.scene?.figures.twin_stand_in;
  const standIn = stand === null ? undefined : set.avatars.find((a) => a.id === stand);
  if (stand !== null && standIn?.model?.bundled)
    out.push(`The twin shows \`${stand}\`, a stand-in, not the Author's likeness.`);
  else if (stand !== null) out.push(`The twin shows its capsule: \`${stand}\` has no bundled model.`);
  else if (named !== undefined && c.reader.printable(named))
    out.push(`The twin shows its capsule: RA3 or RI8 refuses its stand-in \`${named}\`.`);
  else out.push("The twin shows its capsule: the scene names no stand-in.");
  // Spec 020 (FR-002, FR-003): a visitor's likeness, whether main's approval holds (its line) or RA9 leaves it out.
  for (const a of set.avatars) {
    if (a.line !== null)
      out.push(`Likeness \`${a.id}\`: main's approval holds for its model, with the line "${a.line}"`);
    else if (a.model && c.findings.some((f) => f.rule === "RA9" && f.file === a.model?.path))
      out.push(
        `Likeness \`${a.id}\`: no approval on main names its model's SHA-256 with a line (RA9), so none of its files ` +
          "is bundled and its figure shows the cut-out.",
      );
  }
  for (const a of set.avatars)
    for (const f of a.others)
      out.push(`RA5: \`${f.path}\` has no role: reported, never refused, never bundled or fetched.`);
  const twinTerm =
    memory.twin === null
      ? "nothing yet"
      : `${count(memory.twin)} (its own model ${memory.twin_own === null ? DASH : count(memory.twin_own)} at ` +
        `${c.twin.texture_px} px, the stand-in's files ${memory.stand_in === null ? DASH : count(memory.stand_in)} at ` +
        `${px} px)`;
  out.push(
    `RK3's figures with the stand-in: the twin's figure counts ${twinTerm}; the visitor's, ` +
      `${memory.visitor === null ? "nothing yet" : count(memory.visitor)}, the largest ` +
      `${stand === null ? "" : "other "}visitor avatar at ${px} px.`,
  );
  // RK5's sum, and spec 003's F3, which counts the largest visitor folder alone (arrival-check.md §3; M13).
  const visit = figuresVisit(set, c.twin);
  const tree = c.reader.tree;
  const glbsUnder = (dir: string): number =>
    filesUnder(tree, dir)
      .filter((f) => f.path.endsWith(".glb"))
      .reduce((sum, f) => sum + gzipBytes(f.data), 0);
  const largestFolder = Math.max(0, ...tree.list(VISITORS_DIR).map((name) => glbsUnder(`${VISITORS_DIR}/${name}`)));
  // assets/animations/ aside, which the compositor never reads (contracts/room-data-files.md §1).
  const f3View = f3 + glbsUnder(TWIN_DIR) + largestFolder;
  const total = share + visit.twin + visit.stand_in + visit.other;
  const twinShare = visit.twin > 0 ? `${count(visit.twin)} of the twin's own files, ` : "";
  out.push(
    `First visit with both figures' files (RK5): ${count(total)} gzip-9 bytes, ${count(share)} of the room's placed ` +
      `models and cards, ${twinShare}${count(visit.stand_in)} of the stand-in's files, and ${count(visit.other)} of ` +
      `the largest ${visit.twin > 0 ? "" : "other "}visitor avatar's${visit.other_id === null ? "" : ` (\`${visit.other_id}\`)`}, against the phase-3 ` +
      `budget of ${count(c.policy.phase3_bytes)}; spec 003's F3 view, which counts one visitor folder (assets/animations/ ` +
      `aside): ${count(f3View)}.`,
  );
  return out;
}

/**
 * Spec 016's twin (its FR-056; contracts/twin-data.md §8): each file of assets/twin/ with its role, bytes, gzip-9
 * bytes, triangles, and texture memory at its own size and at the twin's side, bundled or why not; the model's
 * measured height and bounds; its clips with their lengths; each file with no role (RA5); the line's approval by ID
 * and its source, never its words; and RK3's twin term.
 */
function twinLines(c: Composed, memory: SceneTextureMemory): string[] {
  const twin = c.twin;
  const out = ["### The twin", ""];
  const files = [
    ...(twin.model ? [twin.model] : []),
    ...twin.clips,
    ...(twin.still ? [twin.still] : []),
    ...twin.others,
  ];
  if (files.length === 0) {
    out.push("The twin has no file under assets/twin/ yet: its figure shows the stand-in.");
    return out;
  }
  const px = twin.texture_px;
  out.push(
    `| File | Role | Bytes | gzip-9 bytes | Triangles | Texture memory | At ${px} px | Bundled |`,
    "|---|---|---:|---:|---:|---:|---:|---|",
  );
  for (const f of files) {
    const m = f.measures?.kind === "glb" ? f.measures : null;
    const cells = [
      `\`${f.path}\``,
      f.role ?? DASH,
      count(f.bytes),
      f.gz === null ? DASH : count(f.gz.length),
      m === null ? DASH : count(m.triangles),
      m === null ? DASH : count(m.texture_bytes),
      m === null ? DASH : count(m.decoded_bytes),
      f.bundled ? "yes" : `no (${f.why ?? DASH})`,
    ];
    out.push(`| ${cells.join(" | ")} |`);
  }
  out.push("");
  const model = twin.model?.measures?.kind === "glb" ? twin.model.measures : null;
  if (model?.height != null && model.bounds !== null)
    out.push(
      `The twin's model at rest: ${fixed(model.height, 3)} m tall; bounds from ` +
        `[${model.bounds.min.map((v) => fixed(v, 3)).join(", ")}] to [${model.bounds.max.map((v) => fixed(v, 3)).join(", ")}] m.`,
    );
  const clips = twin.clips.map((f) => {
    const length = f.measures?.kind === "glb" ? f.measures.length_s : null;
    return `\`${f.role}\` ${length === null ? DASH : `${fixed(length, 2)} s`}`;
  });
  if (clips.length > 0) out.push(`Its clips: ${clips.join(", ")}.`);
  if (twin.still?.measures?.kind === "still")
    out.push(`Its still: ${twin.still.measures.width} × ${twin.still.measures.height} pixels.`);
  for (const f of twin.others)
    out.push(`RA5: \`${f.path}\` has no role: reported, never refused, never bundled or fetched.`);
  out.push(
    twin.line === null
      ? "The twin's line: none, so none of its files is shown (RA6)."
      : `The twin's line: from approval \`${twin.line.approval}\` in main's likeness approvals, read from ` +
          `${twin.line.source === "policy-dir" ? "the policy directory" : twin.line.source === "main" ? "refs/heads/main" : "the tree's own copy"}.`,
  );
  // The lean's spot against the placement (contracts/twin-data.md §8), RA7's measure.
  const lean = leanMeasure(c.scene, c.geometry);
  out.push(
    lean === null
      ? "The lean: none in the scene's twin block, so the twin rests in its idle."
      : `The lean: the desk's origin ${fixed(lean.off_m * 100, 1)} cm off its spot behind the twin, ` +
          `${fixed(lean.turn_deg, 1)}° from the twin's facing, and ${fixed(lean.right_m, 2)} m of its top to the ` +
          `twin's right, from ${fixed(lean.gap_m * 100, 1)} cm off its root.`,
  );
  // The twin's reach toward the shell's walls (plan.md R-19), RA8's measure.
  out.push(reachLine(twinReachOf(c.reader.tree, c.scene, c.twin, c.geometry)));
  out.push(
    `RK3's twin term: ${memory.twin === null ? "nothing yet" : count(memory.twin)}, the larger of its own model at ` +
      `${px} px (${memory.twin_own === null ? DASH : count(memory.twin_own)}) and the stand-in's files ` +
      `(${memory.stand_in === null ? DASH : count(memory.stand_in)}).`,
  );
  return out;
}

/** Each bound face's smallest cap height on each reference stage, RG7's, with the floor, the margin, and its status. */
function legibility(c: Composed, index: RoomIndex): string[] {
  if (index.faces.length === 0) return ["No face is bound."];
  const floor = c.caps.legibility_floor_css_px;
  // RG7's measure of each face, the first placement of its ID's, as the index lists them.
  const measured = new Map<string, FaceCaps>();
  for (const f of faceCaps(c.geometry, c.typefaces)) if (!measured.has(f.face)) measured.set(f.face, f);
  const out = ["| Face | Readable | Desktop | Phone | Floor | Margin | Status |", "|---|---|---:|---:|---:|---:|---|"];
  for (const face of index.faces) {
    const caps = measured.get(face.id);
    const sizes = [caps?.desktop ?? null, caps?.phone ?? null];
    const known = sizes.filter((s): s is number => s !== null);
    const smallest = known.length === sizes.length ? Math.min(...known) : null;
    // RG7's one exemption (FR-052): a phone-exempt face under the floor on the phone alone, meeting it on the desktop.
    const exempt =
      caps !== undefined &&
      caps.phone_exempt &&
      caps.desktop !== null &&
      caps.desktop >= floor &&
      caps.phone !== null &&
      caps.phone < floor;
    const status = face.atmosphere
      ? `atmosphere (max ${face.max_chars ?? 0})`
      : exempt
        ? 'exempt on the phone, carried by the text copy\'s "Around the room"'
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

/** FR-064's carve-out (see listOnly): each side-wall selectable the room leaves to the "In the room" list somewhere,
 *  its walls, and the stages where it does, in 3D and in the 2D drawing at each stage's scale, each run as its first
 *  stage by size and how many others (contracts/room-bundle.md §10). A selectable RT2 refused is named by its path. */
function sideWalls(c: Composed): string[] {
  const picks = sideWallPicks(c.geometry);
  if (picks.length === 0) return ["Side-wall selectables: none."];
  const cell = (stages: readonly Stage[]): string =>
    stages[0] === undefined ? DASH : `list-only at ${stagesPhrase(stages[0], stages.length - 1)}`;
  const out = [
    'Side-wall selectables (FR-064): the room draws no pick area for them at the stages named, and the "In the room" list reaches them.',
    "",
    "| Selectable | 3D | 2D |",
    "|---|---|---|",
  ];
  for (const p of picks) {
    const name = c.reader.printable(p.id)
      ? `\`${p.id}\``
      : formatPath(["selectables", p.index], (key) => c.reader.printable(key));
    out.push(`| ${name} (${p.walls.join(", ")}) | ${cell(p.stages)} | ${cell(p.flat)} |`);
  }
  return out;
}

/** Each switch's case-to-pose table, and RG8's separation of every two poses its cases show, apart or not. A switch or
 *  a pose whose name RT2 refused is named by its path. */
function switches(c: Composed): string[] {
  const list = c.scene?.switches ?? [];
  if (list.length === 0) return ["Switches: none."];
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
  for (const pair of poseSeparations(c.geometry, c.policy)) {
    const sw = list[pair.switch];
    if (!sw) continue;
    const [a, b] = pair.poses;
    out.push(
      `| ${switchName(sw, pair.switch)} | ${poseName(a, pair.switch)} / ${poseName(b, pair.switch)} | ` +
        `${px(pair.desktop)} | ${px(pair.phone)} | ${pair.status} |`,
    );
  }
  return out;
}

/** A number as the report prints a size: to the tenth, and a count with its thousands. */
const plainSize = (n: number): string => String(Number(n.toFixed(1)));

/** Spec 005's stages line (FR-052 to FR-054, FR-057; plan.md §10.2): the layouts, the sweep's extent and count, the
 *  supported stages' count, and the two reference stages with their screens. */
function stagesLine(): string {
  const screens = sweepScreens();
  const extent = (k: "w" | "h", f: (...n: number[]) => number): number => f(...screens.map((s) => s[k]));
  const n = (x: number): string => x.toLocaleString("en-US");
  const ref = (r: typeof REFERENCE_DESKTOP): string =>
    `${plainSize(r.stage.w)} × ${plainSize(r.stage.h)} (${r.screen.w} × ${r.screen.h}`;
  return (
    `Stages (spec 005, FR-052 to FR-054): the clear areas of the HUD's column and dock layouts, a dock screen's with ` +
    `its list open and collapsed, over ${n(screens.length)} screens from ${extent("w", Math.min)} × ` +
    `${extent("h", Math.min)} to ${extent("w", Math.max)} × ${extent("h", Math.max)}, ` +
    `${n(supportedStages().length)} stages; the reference desktop's ${ref(REFERENCE_DESKTOP)} at a pixel ratio of ` +
    `${REFERENCE_DESKTOP.dpr}) and the reference phone's ${ref(REFERENCE_PHONE)} at ${REFERENCE_PHONE.dpr}).`
  );
}

/** The room's on-screen height on a stage at its production framing: the framed set's union, projected. */
function roomHeight(framed: readonly WorldBox[], stage: { readonly w: number; readonly h: number }): number {
  if (framed.length === 0 || !(stage.w > 0) || !(stage.h > 0)) return 0;
  const along = (k: 0 | 1 | 2, f: (...n: number[]) => number, side: "min" | "max"): number =>
    f(...framed.map((b) => b[side][k]));
  const union: WorldBox = {
    min: [along(0, Math.min, "min"), along(1, Math.min, "min"), along(2, Math.min, "min")],
    max: [along(0, Math.max, "max"), along(1, Math.max, "max"), along(2, Math.max, "max")],
  };
  const r = memberRect(union, framing(stage.w / stage.h, framed), stage);
  return r ? r.rect[3] : 0;
}

/** Spec 014's frame lines (FR-060, FR-061; plan.md §11): the frame areas' count with their reserved boxes; each screen
 *  class's eases, at 0, between, and at 1, with the median; and the reference stages' ease, frame area, and the room's
 *  growth on screen over spec 005's frame. */
function frameLines(c: Composed): string[] {
  const g = c.geometry;
  const head = "Frame (spec 014, FR-060, FR-061)";
  if (!g) return [`${head}: none, the scene having no geometry to frame.`];
  const made = framedStages(g.protect);
  const n = (x: number): string => x.toLocaleString("en-US");
  const sixteenths = (e: number): string => (e === 0 ? "0" : e === 1 ? "1" : `${Math.round(e * 16)}/16`);
  const classes: readonly [string, (s: { readonly w: number; readonly h: number }) => boolean][] = [
    ["the dock layout", (s) => layoutFor(s) === "dock"],
    ["the column layout under 1280 × 720", (s) => layoutFor(s) === "column" && (s.w < 1280 || s.h < 720)],
    ["the column layout from 1280 × 720", (s) => layoutFor(s) === "column" && s.w >= 1280 && s.h >= 720],
  ];
  const out = [
    `${head}: the frame areas over the same screens, eased from the window toward each clear area only as far as ` +
      `keeps every pressable selectable's core and both figures 0.5rem clear of the HUD's compact boxes; ` +
      `${n(made.stages.length)} stages, each with the HUD boxes over it reserved.`,
  ];
  for (const [name, holds] of classes) {
    const eases = made.screens.filter((x) => holds(x.screen)).map((x) => x.stage.ease ?? 1);
    if (eases.length === 0) continue;
    const sorted = [...eases].sort((a, b) => a - b);
    const median = sorted[Math.floor((sorted.length - 1) / 2)] ?? 1;
    const at0 = eases.filter((e) => e === 0).length;
    const at1 = eases.filter((e) => e === 1).length;
    out.push(
      `- ${name}: ${n(eases.length)} screens and states, ${n(at0)} at ease 0, ${n(eases.length - at0 - at1)} ` +
        `between, ${n(at1)} at ease 1; the median ${sixteenths(median)}.`,
    );
  }
  for (const r of [REFERENCE_DESKTOP, REFERENCE_PHONE]) {
    const framed = made.screens.find((x) => x.screen === r.screen);
    if (!framed) continue;
    const growth = roomHeight(g.framed, framed.stage) / roomHeight(g.framed, r.stage) - 1;
    const which = r === REFERENCE_DESKTOP ? "The reference desktop" : "The reference phone";
    out.push(
      `- ${which} (${r.screen.w} × ${r.screen.h}): ease ${sixteenths(framed.stage.ease ?? 1)}, a frame area of ` +
        `${plainSize(framed.stage.w)} × ${plainSize(framed.stage.h)} over spec 005's ${plainSize(r.stage.w)} × ` +
        `${plainSize(r.stage.h)}, the room ${(growth * 100).toFixed(1)}% larger on screen.`,
    );
  }
  return out;
}

/** Spec 008's walking lines (FR-021, FR-026; plan.md §3.5): the visitor figure's start at the walking radius, RW1's
 *  measure, with how far it stands from the nearest edge of the walkable floor and which; or, where RW1 refuses it,
 *  what it stands in. Then the walking control's box, as RG6 reserves it in 3D, with each side-wall selectable it
 *  leaves to the list and where. An obstacle RT2 refused, or a selectable, is named by its index. */
function walking(c: Composed): string[] {
  const out: string[] = [];
  const s = figureStart(c.geometry);
  const head = "Walking (spec 008, FR-026): the visitor figure's start";
  if (!s) out.push(`${head}: none, the scene having no visitor figure to measure.`);
  else {
    const at = `x ${plain(s.x)} and z ${plain(s.z)}`;
    const radius = `the radius ${plain(s.radius)} m`;
    const { edge } = s.clearance;
    const obstacle = (e: { readonly obstacle: string }): string =>
      c.reader.printable(e.obstacle) ? `\`${e.obstacle}\`` : "an obstacle";
    const side = (e: Exclude<FloorEdge, { readonly obstacle: string }>): string =>
      e === "front" ? "the floor's open front" : `the floor's ${e} wall`;
    if (s.walkable) {
      const nearest = typeof edge === "object" ? `${obstacle(edge)}, grown by the radius` : side(edge);
      const metres = plain(Math.round(s.clearance.distance * 1000) / 1000);
      out.push(`${head}, ${at}, is on the walkable floor at ${radius}, ${metres} m from its nearest edge, ${nearest}.`);
    } else {
      const where =
        typeof edge === "object"
          ? `it lies within ${obstacle(edge)}'s footprint, grown by the radius`
          : `it lies past ${side(edge)}, less the radius`;
      out.push(`${head}, ${at}, isn't on the walkable floor at ${radius}: ${where}.`);
    }
  }
  // Spec 005 (FR-055): every HUD control over the clear area RG6 reserves, one line a box; the walking control's alone.
  const box =
    "Reserved boxes (spec 005, FR-055): the walking control's (spec 008, FR-021) where it stands in the clear area " +
    `(since spec 014's W19, on short column windows and in the dock), ${WALK_CONTROL.widthRem}rem × ` +
    `${WALK_CONTROL.heightRem}rem, ${WALK_CONTROL.insetRem}rem in from the clear area's bottom-right corner,`;
  const holds = c.geometry ? pickSweep(c.geometry).boxHolds : [];
  if (holds.length === 0) out.push(`${box} holds no side-wall selectable at any supported stage.`);
  else {
    const named = holds.flatMap((h) => {
      const [first] = h.stages;
      if (!first) return [];
      const name = c.reader.printable(h.id) ? `\`${h.id}\`` : `selectables[${h.index}]`;
      return [`${name} at ${stagesPhrase(first, h.stages.length - 1)}`];
    });
    out.push(`${box} leaves to the list ${named.join("; ")}, as the carve-out does a side-wall core that can't fit.`);
  }
  return out;
}

/** Spec 008's highlight (FR-016; plan.md §3.5): each look's band and edge, resolved, with their widths, and RW2's own
 *  measure, the lowest contrast the better of the two gives against a colour of the look's palette, with that colour. A
 *  look RT2 refused is named by its place among the looks, and a colour by the refusal. */
function highlights(c: Composed): string[] {
  const rows = highlightContrasts(c.room.looks);
  if (rows.length === 0) return ["Highlight: no look."];
  const out = [
    "Highlight (spec 008, FR-016): each look's band and edge, and the lowest contrast the better of the two gives " +
      "against a colour of its palette; RW2 refuses under 3:1.",
    "",
    "| Look | Band | Edge | Lowest contrast | Against |",
    "|---|---|---|---:|---|",
  ];
  for (const r of rows) {
    const name = c.reader.printable(r.look) ? `\`${r.look}\`` : `looks[${r.index}]`;
    const lowest = r.lowest === null ? DASH : contrastText(r.lowest.contrast);
    const against =
      r.lowest === null
        ? DASH
        : c.reader.printable(r.lowest.against)
          ? `\`${r.lowest.against}\``
          : "(a colour RT2 refused)";
    out.push(
      `| ${name} | ${r.band}, ${plain(r.band_px)} px | ${r.edge}, ${plain(r.edge_px)} px | ${lowest} | ${against} |`,
    );
  }
  return out;
}
