// FR-073's report (spec 004; FR-052 to FR-054, FR-073, SC-006, SC-010; R-21, R-24; contracts/room-bundle.md §10;
// contracts/plain-model-fit.md §8.3): the Markdown `npm run room:report` prints and every merge-request note of a
// branch that changes the room's data or models pastes whole. It isn't written into dist/. Its parts, in §10's form:
// - the header: the bundle's digest (its first 16 hex), the build's kind, and the caps' source and SHA-256, or FR-053's
//   starting figures while main has no room block;
// - a row per catalog entry: how many placements and poses show it, its source (the studio file, the stand-in and why,
//   with the findings' rules and never their data, or the avatar a figure shows), its model's plain and gzip-9 bytes,
//   triangles, and texture memory, and its budget; its stylized scale beside its ID where above 1;
// - the totals: the largest set model against the caps; the scene's texture memory by class, RK3's own sum through its
//   own function (checks/rk.ts's `sceneTextureTotal`, at the bundle's framing): each piece placed by a placement that
//   isn't a figure's, or by a switch, by its budget once, models and image cards by its picture's class; the twin's
//   models and the largest visitor avatar's, measured, with a note while their files don't exist, and one counting each
//   model that can't be read, which counts 0; every bound face's canvas at min(px, its largest on-screen size × the
//   reference phone's pixel ratio); the first visit, the placed models' .glb.gz and cards beside the design's estimate
//   and the enforced phase-3 limit, and spec 003's F3 view, every file under assets/room/ at gzip-9; and a note for
//   each small prop the caps name that the catalog doesn't have;
// - legibility: each bound face's smallest cap height on each reference stage at the production framing, with the
//   floor, the margin, and readable, atmosphere (max <n>), or under: RG7's own measure (checks/rg.ts's `faceCaps`);
// - the switches: each one's case-to-pose table, and for every two poses its cases show, the largest on-screen distance
//   any part of the piece moves, or the size of a cue a pose's glow adds, on each stage: apart, or under the floor, RG8's
//   own measure (`poseSeparations`), which only reports;
// - the findings, each line, a lenient one marked warn in a lenient build, or "none".
// Bytes are integers with thousands separators and glyph heights are to 0.1 px. Nothing in it is a time, a path outside the repository, or a data string: pieces,
// placements, faces, switches, and poses are named by IDs, each only where RT2 passed it.
import { TIER_VALUES } from "../../src/room/compose/vocabulary";
import { gzipBytes } from "../../src/room/glb/gzip";
import { count, fixed } from "../../src/room/glb/rules";
import type { RoomIndex } from "../../src/room/compose/bundle";
import type { Composed, RoomReport } from "./emit";
import { formatPath } from "./checks/family";
import { faceCaps, poseSeparations } from "./checks/rg";
import type { FaceCaps } from "./checks/rg";
import { MODELS_DIR } from "./checks/ri";
import { sceneTextureTotal, TWIN_DIR, VISITORS_DIR } from "./checks/rk";
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
