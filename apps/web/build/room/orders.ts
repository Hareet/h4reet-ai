// The studio's documents (spec 004; FR-014, FR-025, FR-026, FR-032, FR-078; R-14, R-59; contracts/room-bundle.md §9):
// a work order per catalog entry and the photo guide, which `npm run room:generate` writes under docs/studio/ and
// commits, and make test holds fresh (generated.test.ts). Neither holds a path outside the repository, a studio
// folder's path (folders are named by their role: the photos folder, the studio's inbox, the workflows folder), a host
// or user name, a time, or the bundle's digest, so a change to one piece leaves the other pieces' orders unchanged.
// - A work order: `# Work order: <name>`, the line saying what generates it, then §9.1's sections in order: Method,
//   Shots, Measurements (with a "Measure:" line for each `estimated` mark: the size, an anchor, or the mount of a
//   placement or pose of the piece), Size, origin, and bounds (the tolerance the larger of 2 cm and 3%), Anchors and
//   Live faces at the model's scale, States, Budget beside the caps, Look, Export rules (glb/rules.ts's, which the fit
//   check's refusals quote), Record (a records.json entry template), and Studio notes. The caps are named as main's
//   room block or FR-053's starting figures, never by the source the compose read them from, which differs between a
//   checkout and the gate's container.
// - The photo guide: §9.2's fixed template, which is code and names no ID (FR-026's steps before the first shot;
//   FR-025's paragraph, quoted; the photo-work setup, five steps; their checklist, a line each; the tracing steps), then
//   the layout checklist generated from the scene: each placement mounted, directly or through others, on the survey's
//   desk, at its position from the desk's corner in the scene's axes, then each placement mounted on the shell, at its
//   anchor and offset, each "measured" or "estimated" from the marks on the way. The figures are the avatars, not
//   pieces of the Author's room, so neither list holds them. A placement is named by its label's UI word, or by its ID.
import { origin } from "../../src/room/compose/math";
import type { Vec3 } from "../../src/room/compose/math";
import { TIER_VALUES } from "../../src/room/compose/vocabulary";
import { count, exportRules, RULE_TEXT, TOLERANCE } from "../../src/room/glb/rules";
import { sideWallFrame } from "./checks/rg";
import type { Composed } from "./emit";
import type { Loaded } from "./load";
import type { CatalogEntry, Placement } from "./schema";

export const WORK_ORDERS_DIR = "docs/studio/work-orders";
export const PHOTO_GUIDE = "docs/studio/photo-guide.md";

/** A length or a coordinate, to 1e-6, −0 as 0, in JavaScript's shortest form. */
function n(value: number): string {
  const q = Math.round(value * 1e6) / 1e6;
  return String(Number.isFinite(q) && q !== 0 ? q : 0);
}
const tuple = (v: readonly number[]): string => `(${v.map(n).join(", ")})`;
const turn = (t: { x: number; y: number; z: number }): string => tuple([t.x, t.y, t.z]);
const code = (text: string): string => `\`${text}\``;
const bullets = (items: readonly string[]): string[] => (items.length === 0 ? ["None."] : items.map((i) => `- ${i}`));
const series = (items: readonly string[]): string =>
  items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1) ?? ""}`;

/** How the caps are named in a document: main's room block, or FR-053's starting figures and why. */
function capsWords(c: Composed): string {
  if (c.policy.caps !== null) return "main's room caps, `per_asset.room` in `assets/policy/caps.json`";
  if (c.policy.caps_source === "defaults")
    return "FR-053's starting figures, while main has no room caps; every model stays a stand-in until it has them";
  return "FR-053's starting figures, while RK4 refuses main's room caps; every model stays a stand-in until they read";
}

/** The "Measure:" lines: the size, each anchor, and each mount of a placement or pose of the piece, marked estimated. */
function measures(c: Composed, e: CatalogEntry): string[] {
  const out: string[] = [];
  const s = e.size;
  if (s.estimated) out.push(`Measure: the size, now estimated at ${n(s.w)} × ${n(s.h)} × ${n(s.d)} m (w × h × d).`);
  for (const [name, a] of Object.entries(e.anchors))
    if (a.estimated)
      out.push(`Measure: the anchor ${code(name)}, now estimated at ${tuple(a.at)} m in the piece's frame.`);
  for (const p of c.scene?.placements ?? []) {
    if (p.piece !== e.id || !p.mount?.estimated) continue;
    const m = p.mount;
    out.push(
      `Measure: where ${code(p.id)} sits, now estimated: on ${code(m.on)}'s anchor ${code(m.anchor)}, offset ` +
        `${tuple(m.offset)} m.`,
    );
  }
  for (const sw of c.scene?.switches ?? []) {
    if (sw.piece !== e.id) continue;
    for (const [name, pose] of Object.entries(sw.poses)) {
      const m = pose.mount;
      if (!m.estimated) continue;
      out.push(
        `Measure: where the pose ${code(name)} of ${code(sw.id)} sits, now estimated: on ${code(m.on)}'s anchor ` +
          `${code(m.anchor)}, offset ${tuple(m.offset)} m.`,
      );
    }
  }
  return out;
}

/** The states of a piece a switch places: each pose, the value it claims, the cases that show it, and where it sits. */
function states(c: Composed, e: CatalogEntry): string[] {
  const switches = (c.scene?.switches ?? []).filter((sw) => sw.piece === e.id);
  if (switches.length === 0) return ["No switch places this piece."];
  const out: string[] = [];
  for (const sw of switches) {
    out.push(
      `The switch ${code(sw.id)} places this piece in each of its poses, one for each value of the tier. A state is ` +
        "a separate placement, never an animation (FR-020, FR-043).",
      "",
    );
    for (const [name, pose] of Object.entries(sw.poses)) {
      const claims = e.claims && Object.hasOwn(e.claims.poses, name) ? e.claims.poses[name] : null;
      const shows = TIER_VALUES.filter((v) => (Object.hasOwn(sw.cases, v) ? sw.cases[v] : sw.default) === name).map(
        code,
      );
      const m = pose.mount;
      out.push(
        `- ${code(name)} ${claims ? `claims ${code(claims)}` : "claims nothing"}, and ` +
          `${shows.length === 0 ? "no case shows it" : `the ${shows.length === 1 ? "case" : "cases"} ${series(shows)} ${shows.length === 1 ? "shows" : "show"} it`}: ` +
          `on ${code(m.on)}'s anchor ${code(m.anchor)}, offset ${tuple(m.offset)} m, turn ${turn(m.turn)}°.`,
      );
    }
  }
  return out;
}

/** The records.json entry the file's arrival takes (spec 003's record, as Amendments C1, C2, C5, and C8 read it). */
function recordTemplate(e: CatalogEntry): string {
  const file = e.model?.file ?? e.model?.card ?? `${e.id}.glb`;
  const entry = {
    file,
    sha256: "<the scrubbed file's SHA-256, as the lookdev page showed it>",
    kind: "room",
    made: "<YYYY-MM-DD>",
    source: { type: "<photo, prompt, asset, or design>", id: "<an opaque ID>" },
    likeness: false,
    steps: [
      {
        name: "<what the step did>",
        by: "model",
        models: [
          {
            name: "<model>",
            repository: "<org/name>",
            revision: "<commit or version>",
            role: "primary",
            license: "<its licenses.json ID>",
            license_version: "<version>",
          },
        ],
        models_checked: "<YYYY-MM-DD>",
        service: {
          name: "<the studio's session, where it scripted the step>",
          license: "<its terms' licenses.json ID>",
          license_version: "<version>",
          disclosure_row: "D4",
        },
      },
      {
        name: "<what the step did>",
        by: "hand",
        tools: [
          { name: "<tool>", version: "<version>", license: "<its licenses.json ID>", license_version: "<version>" },
        ],
      },
    ],
    media_license: "all-rights-reserved-2026",
    approval: "<the Author's approval ID>",
  };
  return JSON.stringify(entry, null, 2);
}

/** A piece's work order (contracts/room-bundle.md §9.1). */
export function workOrder(c: Composed, loaded: Loaded<CatalogEntry>): string {
  const e = loaded.value;
  const s = e.stylized_scale;
  const { min, max } = e.origin.bounds;
  const tolerance = [0, 1, 2].map((i) =>
    Math.max(TOLERANCE.boundsMetres, TOLERANCE.boundsShare * ((max[i] ?? 0) - (min[i] ?? 0)) * s),
  );
  const faces = e.live_faces.map(
    (f) =>
      `| ${code(f.role)} | ${tuple(f.at.map((v) => v * s))} | ${n(f.size[0] * s)} × ${n(f.size[1] * s)} | ` +
      `${tuple(f.facing)} | ${tuple(f.up ?? [0, 1, 0])} |`,
  );
  const anchors = Object.entries(e.anchors).map(
    ([name, a]) => `| ${code(name)} | ${tuple(a.at.map((v) => v * s))} | ${turn(a.turn)} |`,
  );
  const small = c.caps.small_props.includes(e.id);
  const look = c.look?.value;
  const lines = [
    `# Work order: ${e.name}`,
    "",
    `Generated by \`npm run room:generate -w apps/web\` from \`${loaded.file}\`, the scene, and the chosen look: don't ` +
      "edit it. Change the data, then generate it again.",
    "",
    "## Method",
    "",
    e.work_order.method,
    "",
    "## Shots",
    "",
    ...bullets(e.work_order.shots),
    "",
    "## Measurements",
    "",
    ...bullets([...e.work_order.measurements, ...measures(c, e)]),
    "",
    "## Size, origin, and bounds",
    "",
    `- The size: ${n(e.size.w)} × ${n(e.size.h)} × ${n(e.size.d)} m (w × h × d), ` +
      `${e.size.estimated ? "estimated" : "measured"}.`,
    `- The stylized scale: ${n(s)}, so the model is made at ${n(e.size.w * s)} × ${n(e.size.h * s)} × ` +
      `${n(e.size.d * s)} m (FR-051).`,
    `- The origin: ${e.origin.point}`,
    `- The expected bounds at that scale: from ${tuple(min.map((v) => v * s))} to ${tuple(max.map((v) => v * s))} m.`,
    `- Their tolerance at both corners, the larger of 2 cm and 3% of the extent on each axis: x ${n(tolerance[0] ?? 0)} ` +
      `m, y ${n(tolerance[1] ?? 0)} m, z ${n(tolerance[2] ?? 0)} m (FR-019).`,
    "",
    "## Anchors",
    "",
    ...(anchors.length === 0
      ? ["None: nothing mounts on this piece."]
      : [
          "At the model's scale, in the piece's frame (FR-003):",
          "",
          "| Anchor | Position (m) | Turn (°) |",
          "|---|---|---|",
          ...anchors,
        ]),
    "",
    "## Live faces",
    "",
    ...(faces.length === 0
      ? ["None: no face of this piece is live."]
      : [
          "At the model's scale, in the piece's frame. Each is its own object, named for its role: one quad in one plain " +
            "colour, its texture coordinates filling 0 to 1 in reading order as the GLB stores them (Blender's v runs " +
            "bottom to top, and its exporter flips it), within 1 mm and 1° of the figures below (FR-017).",
          "",
          "| Object name | Centre (m) | Size (m) | Facing | Up |",
          "|---|---|---|---|---|",
          ...faces,
        ]),
    "",
    "## States",
    "",
    ...states(c, e),
    "",
    "## Budget",
    "",
    "| Measure | Budget | Cap |",
    "|---|---:|---:|",
    `| gzip-9 bytes | ${count(e.budget.gzip_bytes)} | ${count(c.caps.gzip_bytes)} |`,
    `| Triangles | ${count(e.budget.triangles)} | ${count(c.caps.triangles)} |`,
    `| Largest texture side | ${count(e.budget.texture_px)} px | ` +
      `${small ? `${count(c.caps.small_prop_texture_px)} px` : "– (not a small prop)"} |`,
    `| Texture memory | ${count(e.budget.texture_bytes)} | ${count(c.caps.scene_texture_bytes)} for the whole scene |`,
    "",
    `The caps: ${capsWords(c)} (FR-053).`,
    "",
    "## Look",
    "",
    look
      ? `The look ${code(look.id)}, ${look.method}: ${look.material_notes}`
      : "No look: the scene's look doesn't resolve.",
    "",
    "Flat base colours, and no baked light, shadow, ambient occlusion, glow, or outline geometry: the look adds them at " +
      "run time (FR-022, FR-070).",
    "",
    "## Export rules",
    "",
    "From `apps/web/src/room/glb/rules.ts`, the rules the fit check applies to the scrubbed file (FR-015 to FR-022).",
    "",
    ...exportRules(c.caps.small_prop_texture_px).flatMap((r) => [`### ${r.title} (${r.spec})`, "", r.text, ""]),
    "### What the fit check refuses",
    "",
    ...Object.entries(RULE_TEXT).map(([rule, text]) => `- **${rule}** ${text}`),
    "",
    "## Record",
    "",
    "The file's entry in `assets/room/records.json`, which spec 003's intake takes when it arrives:",
    "",
    "```json",
    recordTemplate(e),
    "```",
    "",
    "- `kind` is `room`, and `approval` names the Author's approval of the SHA-256 the lookdev page showed (FR-023).",
    "- `source.type` is `photo`, `prompt`, `asset`, or `design` (Amendment C2), and `source.id` an opaque ID, never a " +
      "file name.",
    "- `likeness` is true only when the file shows the Author (Amendment C5).",
    "- Each step is by a model or by hand. A step the studio's session scripted is a model step, and names the " +
      'session as its `service`, with `disclosure_row: "D4"` (Amendments C1, C8).',
    "",
    "## Studio notes",
    "",
    e.work_order.studio_notes,
    "",
  ];
  return lines.join("\n");
}

// ---- The photo guide (§9.2) ----

/** FR-025's paragraph, quoted exactly (spec.md, FR-025, "The photos and the key"). */
const FR_025 =
  "Every file a photo touches SHALL stay inside the photos folder, which, with the blinding key, every Claude session " +
  "on the machine is denied, the studio's own included: ComfyUI's input, output, temp, and user folders (its " +
  "`--input-directory`, `--output-directory`, `--temp-directory`, and `--user-directory`), and any Blender file that " +
  "loads or links a photo, with its temporary files and autosaves. The studio's own Blender files, temporary files, " +
  "and autosaves SHALL sit in the workflows folder. Only what FR-024 lets the studio's agent receive from a photo, " +
  "each after the Author has reviewed it (a style frame, a mesh stripped to geometry, or a sign's lettering outlines; " +
  "FR-032), SHALL leave the photos folder, into the studio's inbox.";

/** The guide's fixed template: code, naming no ID. */
const TEMPLATE = [
  "# Photo guide",
  "",
  "Generated by `npm run room:generate -w apps/web` from its fixed template and `apps/web/room/scene.yaml`: don't edit " +
    "it. Change the scene, or the template in `apps/web/build/room/orders.ts`, then generate it again.",
  "",
  "Folders are named here by their role: the photos folder, the studio's inbox, and the workflows folder.",
  "",
  "## Before the first shot",
  "",
  "FR-026's steps:",
  "",
  "1. Pause camera-roll backup and gallery sync until cleanup.",
  "2. Turn location off.",
  "3. Move the photos over a USB cable straight into the studio's photos folder.",
  "4. Never send one through chat, email, a cloud drive, or an assistant.",
  "5. Delete them from the phone and its trash once the studio's copy checks out.",
  "",
  "## Where photo-derived files stay",
  "",
  "FR-025:",
  "",
  `> ${FR_025}`,
  "",
  "## Setting up photo work",
  "",
  "Before each session that opens a photo or a file made from one (FR-025's side files and listeners, FR-026):",
  "",
  "- **Blender's Temporary Files.** Start Blender for photo work with a Blender configuration of its own, kept inside " +
    "the photos folder, whose Temporary Files folder is a folder inside the photos folder, so its autosaves, " +
    "`quit.blend`, and recent-files list stay there. The studio's own Blender keeps its own configuration, with its " +
    "temporary files in the workflows folder.",
  "- **TMPDIR.** Start every photo-work tool from a shell whose TMPDIR is that folder inside the photos folder, never " +
    "the system temp folder, which this repository's sandboxed sessions can read.",
  "- **The tracing tool's autosave.** Off.",
  "- **The tracing tool's recent files.** Off, so no list of opened files sits outside the photos folder.",
  "- **ComfyUI.** Started with its four folders inside the photos folder, listening on 127.0.0.1 alone, its default; " +
    "the Author queues its workflows, and no Claude session reaches its port (Confirmation 24).",
  "",
  "## The photo-work checklist",
  "",
  "Tick each line before each photo-work session:",
  "",
  "- [ ] Blender's Temporary Files folder is inside the photos folder.",
  "- [ ] TMPDIR is inside the photos folder.",
  "- [ ] The tracing tool's autosave is off.",
  "- [ ] The tracing tool's recent files are off.",
  "- [ ] ComfyUI listens on 127.0.0.1 alone, and only the Author queues it.",
  "",
  "## Tracing a sign's lettering",
  "",
  "With every line of the photo-work checklist ticked (FR-032):",
  "",
  "1. Trace the lettering with a local tool that runs offline inside the photos folder.",
  "2. Convert its paths to the outline file of contracts/room-data-files.md §8.",
  "3. Run P-8's `outline_check.py` on it there.",
  "4. Review the outlines.",
  "5. Move only the outline file to the studio's inbox.",
  "",
];

/** A placement's name in the layout checklist: its label's UI word, or its ID. */
function nameOf(c: Composed, p: Placement): string {
  const words = c.room.ui?.value.words ?? {};
  const word = p.label !== undefined && Object.hasOwn(words, p.label) ? words[p.label] : undefined;
  if (word === undefined) return code(p.id);
  return typeof word === "string" ? word : word.text;
}

/** Whether an anchor of a placement's piece is marked estimated. */
function anchorEstimated(c: Composed, on: string, anchor: string): boolean {
  const p = c.placements.get(on);
  const entry = p && c.pieces.get(p.piece)?.value;
  return entry !== undefined && Object.hasOwn(entry.anchors, anchor) && (entry.anchors[anchor]?.estimated ?? false);
}

/** The layout checklist (§9.2 item 6): the desk's items from its corner, then the pieces on the shell. */
function layout(c: Composed): string[] {
  const placements = (c.scene?.placements ?? []).filter((p) => !c.figures.has(p.id));
  const out = [
    "## The layout checklist",
    "",
    "From `apps/web/room/scene.yaml`, in the scene's axes: x to the right, y up, z toward the room's front, in metres. " +
      "A piece on a side wall's anchor of the shell reads as it is measured: its origin, as its catalog entry describes " +
      "it, that origin's distance from the back wall, its height above the floor, and how far it stands out from the " +
      "wall. Each row reads measured or " +
      "estimated, from the data's `estimated` marks; measure each estimated one (FR-026, FR-078).",
    "",
  ];
  const corner = c.scene?.survey.desk_corner;
  const desk = corner && c.placements.get(corner.placement);
  const at = corner && c.anchorPoint(corner.placement, corner.anchor);
  out.push("On the desk, from its front-left corner:", "");
  const rows: string[] = [];
  if (desk && at) {
    for (const p of placements) {
      // Up the mounts to the desk: every mount and anchor on the way, and the corner, decide whether it's measured.
      let estimated = anchorEstimated(c, desk.id, corner.anchor);
      let q: Placement | undefined = p;
      const seen = new Set<string>();
      while (q?.mount && q.id !== desk.id && !seen.has(q.id)) {
        seen.add(q.id);
        estimated ||= q.mount.estimated || anchorEstimated(c, q.mount.on, q.mount.anchor);
        q = c.placements.get(q.mount.on);
      }
      const world = c.world.get(p.id);
      if (p.id === desk.id || q?.id !== desk.id || !world) continue;
      const o: Vec3 = origin(world);
      rows.push(
        `- [ ] ${nameOf(c, p)}: x ${n(o[0] - at[0])}, y ${n(o[1] - at[1])}, z ${n(o[2] - at[2])} ` +
          `(${estimated ? "estimated" : "measured"})`,
      );
    }
  }
  out.push(...(rows.length === 0 ? ["None."] : rows), "", "On the shell, at its anchors:", "");
  const shell = placements.find((p) => p.mount === undefined);
  const onShell = shell ? placements.filter((p) => p.mount?.on === shell.id) : [];
  // The shell's bounds: the floor is their bottom, and the back wall their back.
  const bounds = shell ? c.pieces.get(shell.piece)?.value.origin.bounds : undefined;
  out.push(
    ...(onShell.length === 0
      ? ["None."]
      : onShell.map((p) => {
          const m = p.mount as NonNullable<Placement["mount"]>;
          const estimated = m.estimated || anchorEstimated(c, m.on, m.anchor);
          const mark = `(${estimated ? "estimated" : "measured"})`;
          // A side wall's anchor by RG6's own test (checks/rg.ts's sideWallFrame), and the distance out from that
          // wall from where the piece stands, against the wall's x in the shell's bounds.
          const shellEntry = shell && c.pieces.get(shell.piece)?.value;
          const wall = shellEntry && sideWallFrame(shellEntry, m.anchor);
          const world = c.world.get(p.id);
          const point = c.pieces.get(p.piece)?.value.origin.point.replace(/\.$/, "");
          if (wall && bounds && world && point !== undefined) {
            const o: Vec3 = origin(world);
            const out = wall.side === "min" ? o[0] - wall.x : wall.x - o[0];
            return (
              `- [ ] ${nameOf(c, p)}: on the anchor ${code(m.anchor)}, its origin (${point}) ` +
              `${n(o[2] - bounds.min[2])} from the back wall and ${n(o[1] - bounds.min[1])} above the floor, ` +
              `${n(out)} out from the wall ${mark}`
            );
          }
          return (
            `- [ ] ${nameOf(c, p)}: on the anchor ${code(m.anchor)}, offset x ${n(m.offset[0])}, y ${n(m.offset[1])}, ` +
            `z ${n(m.offset[2])} ${mark}`
          );
        })),
    "",
  );
  return out;
}

/** The photo guide (contracts/room-bundle.md §9.2): the fixed template, then the layout checklist. */
export function photoGuide(c: Composed): string {
  return [...TEMPLATE, ...layout(c)].join("\n");
}
