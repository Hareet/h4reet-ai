// RI, identity and references (spec 004; FR-003, FR-004, FR-005, FR-007, FR-008, FR-009, FR-023, FR-029, FR-036,
// FR-070; R-02; contracts/room-data-files.md §3, §5, §13.2). RI1's grammars and RI9's corpus form are checks the
// schemas hold (schema.ts), so the loader refuses a file that breaks one as it reads it; the rest are here:
// RI2 a duplicate ID or name; RI3 a retired ID taken again; RI4 a reference that doesn't resolve; RI5 an ID equal to
// a vocabulary word; RI6 too many selectables, a repeated member, or a placement in two; RI7 a model not directly under
// assets/room/, off its piece's ID, or not recorded with the kind room and its SHA-256; RI8 the root, the figures, and
// the hand-off, each hand on the side the other figure's lies on, and spec 009's stand-in, an avatar of the table;
// RI10 lookdev.yaml's placements, and since spec 014 its hands view's avatars, in a drafts build; RI11 a label nothing
// references.
// A reference into a file the loader refused (or a required file that is missing) isn't reported again: that file's
// finding is the one to fix. No reason holds a value from the data.
import { createHash } from "node:crypto";

import { isAvatarId } from "../../../src/choice/avatars";
import { invert, origin, transformPoint } from "../../../src/room/compose/math";
import { anchorWorld, resolveMounts } from "../../../src/room/compose/mount";
import type { MountPiece } from "../../../src/room/compose/mount";
import { isVocabulary } from "../../../src/room/compose/vocabulary";
import { sideOf } from "../../../src/room/handoff";
import { isTwinClipRole, isTwinState } from "../../../src/room/scene/twin-states";
import { isObject, strictJson } from "../../../src/room/glb/json";
import { pathOf, TOPICS_FILE } from "../load";
import type { Loaded } from "../load";
import { HEX } from "../schema";
import type { AnchorRef, CatalogEntry, Mount, Placement } from "../schema";
import type { Context, Family } from "./family";

/** The gateway's cap on event objects, so on selectables (B7). */
export const MAX_SELECTABLES = 64;
export const RECORDS_PATH = "assets/room/records.json";
export const MODELS_DIR = "assets/room";

const has = (o: object, key: string): boolean => Object.hasOwn(o, key);

/** The scene's placements and the catalog's pieces by ID, the first of each where two share one (RI2's to report). */
function indexes(ctx: Context): {
  pieces: Map<string, Loaded<CatalogEntry>>;
  placements: Map<string, Placement>;
} {
  const pieces = new Map<string, Loaded<CatalogEntry>>();
  for (const c of ctx.room.catalog) if (!pieces.has(c.value.id)) pieces.set(c.value.id, c);
  const placements = new Map<string, Placement>();
  for (const p of ctx.room.scene?.value.placements ?? []) if (!placements.has(p.id)) placements.set(p.id, p);
  return { pieces, placements };
}

/** RI2: an ID twice in its namespace, or a name twice where §3.2 makes it unique. */
function duplicates(ctx: Context): void {
  const { room } = ctx;
  const twice = (ids: readonly string[], report: (i: number) => void): void => {
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      if (seen.has(id)) report(i);
      seen.add(id);
    });
  };
  twice(
    room.catalog.map((c) => c.value.id),
    (i) => ctx.report("RI2", room.catalog[i]?.file ?? "", "id", "a piece ID the catalog already has"),
  );
  for (const c of room.catalog) {
    twice(
      c.value.glows.map((g) => g.id),
      (i) => ctx.report("RI2", c.file, ctx.path("glows", i, "id"), "a glow's name its piece already has"),
    );
    twice(
      c.value.live_faces.map((f) => f.role),
      (i) => ctx.report("RI2", c.file, ctx.path("live_faces", i, "role"), "a live face's role its piece already has"),
    );
  }
  const scene = room.scene;
  if (scene) {
    const s = scene.value;
    const at = (list: string, i: number, reason: string): void =>
      ctx.report("RI2", scene.file, ctx.path(list, i, "id"), reason);
    twice(
      s.placements.map((p) => p.id),
      (i) => at("placements", i, "a placement ID the scene already has"),
    );
    twice(
      s.selectables.map((x) => x.id),
      (i) => at("selectables", i, "a selectable ID the scene already has"),
    );
    twice(
      s.switches.map((x) => x.id),
      (i) => at("switches", i, "a switch's name the scene already has"),
    );
    twice(
      s.retired.map((x) => x.id),
      (i) => at("retired", i, "an ID retired[] already lists"),
    );
  }
  const topics = room.topics;
  if (topics)
    twice(
      topics.value.topics.map((t) => t.id),
      (i) => ctx.report("RI2", topics.file, ctx.path("topics", i, "id"), "a topic ID topics.yaml already has"),
    );
  for (const kind of [room.looks, room.fixtures] as const)
    twice(
      kind.map((x) => x.value.id),
      (i) => ctx.report("RI2", kind[i]?.file ?? "", "id", "a name another file of its kind has"),
    );
  // Room text: blocks and outlines share one set of names (§3.2).
  const text = [
    ...room.blocks.map((b) => ({ file: b.file, key: "block", name: b.value.block })),
    ...room.outlines.map((o) => ({ file: o.file, key: "sign", name: o.value.sign })),
  ];
  twice(
    text.map((t) => t.name),
    (i) => {
      const t = text[i];
      if (t) ctx.report("RI2", t.file, t.key, "a room-text name a block or an outline already has");
    },
  );
}

/** RI3: a piece, placement, selectable, or topic that takes an ID retired[] lists for its kind. */
function retired(ctx: Context): void {
  const scene = ctx.room.scene;
  if (!scene) return;
  const kinds = new Map<string, Set<string>>();
  for (const r of scene.value.retired) kinds.set(r.id, new Set([...(kinds.get(r.id) ?? []), ...r.kinds]));
  const taken = (id: string, kind: string): boolean => kinds.get(id)?.has(kind) ?? false;
  const reason = (kind: string): string => `takes an ID retired[] lists for ${kind}s`;
  for (const c of ctx.room.catalog) if (taken(c.value.id, "piece")) ctx.report("RI3", c.file, "id", reason("piece"));
  scene.value.placements.forEach((p, i) => {
    if (taken(p.id, "placement")) ctx.report("RI3", scene.file, ctx.path("placements", i, "id"), reason("placement"));
  });
  scene.value.selectables.forEach((x, i) => {
    if (taken(x.id, "selectable"))
      ctx.report("RI3", scene.file, ctx.path("selectables", i, "id"), reason("selectable"));
  });
  const topics = ctx.room.topics;
  topics?.value.topics.forEach((t, i) => {
    if (taken(t.id, "topic")) ctx.report("RI3", topics.file, ctx.path("topics", i, "id"), reason("topic"));
  });
}

/** RI4: every reference the data makes, resolved, each where it is made. */
function references(ctx: Context): void {
  const { room } = ctx;
  const scene = room.scene;
  if (!scene) return;
  const s = scene.value;
  const file = scene.file;
  const { pieces, placements } = indexes(ctx);
  const failed = (path: string): boolean => room.failed.has(path);
  const ri4 = (path: string, reason: string, where = file): void => ctx.report("RI4", where, path, reason);

  const piece = (id: string, path: string): void => {
    if (!pieces.has(id) && !failed(pathOf("catalog", id))) ri4(path, "no catalog entry of that ID");
  };
  const placement = (id: string, path: string): Placement | undefined => {
    const found = placements.get(id);
    if (!found) ri4(path, "no placement of that ID");
    return found;
  };
  /** An anchor of a placement's piece; a piece that doesn't resolve is reported where it is placed. */
  const anchorOf = (on: Placement, anchor: string, path: string, reason: string): void => {
    const entry = pieces.get(on.piece);
    if (entry && !has(entry.value.anchors, anchor)) ri4(path, reason);
  };
  const mount = (m: Mount, ...at: (string | number)[]): void => {
    const parent = placement(m.on, ctx.path(...at, "on"));
    if (parent) anchorOf(parent, m.anchor, ctx.path(...at, "anchor"), "no anchor of that name on the parent's piece");
  };
  const anchorRef = (ref: AnchorRef, ...at: (string | number)[]): void => {
    const on = placement(ref.placement, ctx.path(...at, "placement"));
    if (on) anchorOf(on, ref.anchor, ctx.path(...at, "anchor"), "no anchor of that name on the placement's piece");
  };
  // Without UI words the loader has already refused the room: ui-words.yaml is required.
  const ui = room.ui;
  const uiWord = (key: string, path: string): void => {
    if (ui && !has(ui.value.words, key)) ri4(path, "no UI word of that key");
  };
  const text = new Set([...room.blocks.map((b) => b.value.block), ...room.outlines.map((o) => o.value.sign)]);
  const textBroken = (name: string): boolean => failed(pathOf("room-text", name)) || failed(pathOf("outline", name));

  s.placements.forEach((p, i) => {
    piece(p.piece, ctx.path("placements", i, "piece"));
    if (p.mount) mount(p.mount, "placements", i, "mount");
    if (p.label !== undefined) uiWord(p.label, ctx.path("placements", i, "label"));
    const entry = pieces.get(p.piece);
    for (const [role, binding] of Object.entries(p.faces ?? {})) {
      const at = ["placements", i, "faces", role] as const;
      if (entry && !entry.value.live_faces.some((f) => f.role === role))
        ri4(ctx.path(...at), "no live face of that role on the placement's piece");
      uiWord(binding.label, ctx.path(...at, "label"));
      binding.regions.forEach((r, j) => {
        if (r.text !== undefined && !text.has(r.text) && !textBroken(r.text))
          ri4(ctx.path(...at, "regions", j, "text"), "no room-text block or outline of that name");
        r.ui?.forEach((key, k) => uiWord(key, ctx.path(...at, "regions", j, "ui", k)));
      });
    }
  });

  s.switches.forEach((sw, i) => {
    piece(sw.piece, ctx.path("switches", i, "piece"));
    uiWord(sw.label, ctx.path("switches", i, "label"));
    for (const [name, pose] of Object.entries(sw.poses)) {
      mount(pose.mount, "switches", i, "poses", name, "mount");
      pose.glows.forEach((g, k) => {
        const at = ["switches", i, "poses", name, "glows", k] as const;
        const on = placement(g.placement, ctx.path(...at, "placement"));
        const entry = on && pieces.get(on.piece);
        if (entry && !entry.value.glows.some((x) => x.id === g.glow))
          ri4(ctx.path(...at, "glow"), "no glow of that name on the placement's piece");
      });
    }
    for (const [value, name] of Object.entries(sw.cases))
      if (!has(sw.poses, name)) ri4(ctx.path("switches", i, "cases", value), "no pose of that name in the switch");
    if (sw.default !== undefined && !has(sw.poses, sw.default))
      ri4(ctx.path("switches", i, "default"), "no pose of that name in the switch");
    if (sw.cable) {
      anchorRef(sw.cable.to, "switches", i, "cable", "to");
      if (sw.cable.rest) anchorRef(sw.cable.rest, "switches", i, "cable", "rest");
    }
  });

  const topics = new Set(room.topics?.value.topics.map((t) => t.id) ?? []);
  s.selectables.forEach((x, i) => {
    x.members.forEach((m, k) => placement(m, ctx.path("selectables", i, "members", k)));
    const topic = x.action.talk?.topic;
    if (topic !== undefined && !topics.has(topic) && !failed(TOPICS_FILE))
      ri4(ctx.path("selectables", i, "action", "talk", "topic"), "no topic of that ID");
  });

  for (const end of ["from", "to"] as const) placement(s.handoff[end].placement, ctx.path("handoff", end, "placement"));
  anchorRef(s.survey.desk_corner, "survey", "desk_corner");

  // The look, and what the catalog names in it: its colours and glow tones.
  const look = room.looks.find((l) => l.value.id === s.look);
  if (!look) {
    if (!failed(pathOf("look", s.look))) ri4("look", "no look of that name");
    return;
  }
  const colour = (c: string): boolean => HEX.test(c) || has(look.value.palette, c);
  for (const c of room.catalog) {
    c.value.standin.forEach((shape, k) => {
      if (!colour(shape.color))
        ri4(ctx.path("standin", k, "color"), "neither #rrggbb nor a palette colour of the scene's look", c.file);
    });
    c.value.glows.forEach((g, k) => {
      if (!has(look.value.glow_tones, g.tone))
        ri4(ctx.path("glows", k, "tone"), "no glow tone of that name in the scene's look", c.file);
    });
  }
}

/** RI4, each look's ink and its highlight's two colours (spec 008, plan.md §3.2): every look in looks/, the scene's or
 *  not, names each in its own palette or as #rrggbb, since the lookdev page shows every look to compare them
 *  (contracts/lookdev.md). A highlight's edge left out is the look's ink, already held here. */
function inks(ctx: Context): void {
  const reason = "neither #rrggbb nor a colour of the look's palette";
  for (const { file, value } of ctx.room.looks) {
    const resolves = (colour: string): boolean => HEX.test(colour) || has(value.palette, colour);
    if (!resolves(value.outlines.color)) ctx.report("RI4", file, "outlines.color", reason);
    if (!resolves(value.highlight.band)) ctx.report("RI4", file, "highlight.band", reason);
    if (value.highlight.edge !== undefined && !resolves(value.highlight.edge))
      ctx.report("RI4", file, "highlight.edge", reason);
  }
}

/** RI5: an ID of the four namespaces equal to a word of the closed vocabulary. */
function vocabulary(ctx: Context): void {
  const reason = "an ID that is a word of the closed vocabulary";
  for (const c of ctx.room.catalog) if (isVocabulary(c.value.id)) ctx.report("RI5", c.file, "id", reason);
  const scene = ctx.room.scene;
  if (scene) {
    for (const list of ["placements", "selectables"] as const)
      scene.value[list].forEach((x, i) => {
        if (isVocabulary(x.id)) ctx.report("RI5", scene.file, ctx.path(list, i, "id"), reason);
      });
  }
  const topics = ctx.room.topics;
  topics?.value.topics.forEach((t, i) => {
    if (isVocabulary(t.id)) ctx.report("RI5", topics.file, ctx.path("topics", i, "id"), reason);
  });
}

/** RI6: more than 64 selectables; a selectable with a repeated member; a placement in two selectables. */
function selectables(ctx: Context): void {
  const scene = ctx.room.scene;
  if (!scene) return;
  const list = scene.value.selectables;
  if (list.length > MAX_SELECTABLES)
    ctx.report("RI6", scene.file, "selectables", `${list.length} selectables, over the gateway's ${MAX_SELECTABLES}`);
  const holder = new Map<string, number>();
  list.forEach((x, i) => {
    const own = new Set<string>();
    x.members.forEach((m, k) => {
      const at = ctx.path("selectables", i, "members", k);
      if (own.has(m)) ctx.report("RI6", scene.file, at, "a member the selectable already has");
      else if (holder.has(m)) ctx.report("RI6", scene.file, at, "a placement another selectable holds");
      own.add(m);
      if (!holder.has(m)) holder.set(m, i);
    });
  });
}

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** assets/room/records.json's entries by file, or null when it can't be read as JSON with a list of entries. */
function records(ctx: Context): Map<string, { kind: unknown; sha256: unknown }> | null {
  const data = ctx.tree.read(RECORDS_PATH);
  const read = data === null ? null : strictJson(data);
  if (!read?.ok || !isObject(read.value) || !Array.isArray(read.value.entries)) return null;
  const out = new Map<string, { kind: unknown; sha256: unknown }>();
  for (const e of read.value.entries)
    if (isObject(e) && typeof e.file === "string" && !out.has(e.file))
      out.set(e.file, { kind: e.kind, sha256: e.sha256 });
  return out;
}

/** RI7: a model that isn't directly under assets/room/, whose stem isn't its piece's ID, or that records.json doesn't
 *  record with the kind room and the SHA-256 computed from the file. One finding per model, the first that applies. */
function models(ctx: Context): void {
  let recorded: ReturnType<typeof records> | undefined;
  for (const c of ctx.room.catalog) {
    const m = c.value.model;
    if (!m) continue;
    const key = m.file !== undefined ? "file" : "card";
    const name = (m.file ?? m.card) as string;
    const ri7 = (reason: string): void => ctx.report("RI7", c.file, ctx.path("model", key), reason);
    if (/[/\\]/.test(name) || name.startsWith(".")) {
      ri7("not a file directly under assets/room/");
      continue;
    }
    if (name.slice(0, name.lastIndexOf(".")) !== c.value.id) {
      ri7("a model whose stem isn't its piece's ID");
      continue;
    }
    const bytes = ctx.tree.read(`${MODELS_DIR}/${name}`);
    // A model the tree doesn't hold has no SHA-256 to record: it is RX1's, lenient, so an image build without the
    // room-assets context keeps every piece's stand-in and still builds (contracts/serving.md §3).
    if (bytes === null) continue;
    recorded ??= records(ctx);
    const entry = recorded?.get(name);
    if (!entry) ri7("assets/room/records.json doesn't record it");
    else if (entry.kind !== "room") ri7("assets/room/records.json records it with a kind other than room");
    else if (entry.sha256 !== sha256(bytes)) ri7("assets/room/records.json records another SHA-256 for it");
  }
}

/** RI8: exactly one placement without a mount, one twin, and one visitor; no model on a figure's piece; a hand-off
 *  from an anchor of the twin's placement to one of the visitor's; and spec 009's stand-in, an avatar of the table. */
function figures(ctx: Context): void {
  const scene = ctx.room.scene;
  if (!scene) return;
  const s = scene.value;
  const ri8 = (path: string, reason: string, file = scene.file): void => ctx.report("RI8", file, path, reason);
  const { pieces, placements } = indexes(ctx);
  const roots = s.placements.flatMap((p, i) => (p.mount === undefined ? [i] : []));
  if (roots.length === 0) ri8("placements", "no placement without a mount, where the shell is the one");
  for (const i of roots.slice(1)) ri8(ctx.path("placements", i), "a second placement without a mount");

  const figure: Record<"twin" | "visitor", Placement | null> = { twin: null, visitor: null };
  for (const role of ["twin", "visitor"] as const) {
    const holders = s.placements.flatMap((p, i) => (p.role === role ? [i] : []));
    if (holders.length === 0) ri8("placements", `no placement with the role ${role}`);
    for (const i of holders.slice(1))
      ri8(ctx.path("placements", i, "role"), `a second placement with the role ${role}`);
    figure[role] = holders.length === 1 ? (s.placements[holders[0] as number] ?? null) : null;
    for (const i of holders) {
      const entry = pieces.get(s.placements[i]?.piece ?? "");
      if (entry?.value.model) ri8("model", "a figure's piece has no model: its picture is the avatar's", entry.file);
    }
  }

  const sound = { from: false, to: false };
  for (const [end, role] of [
    ["from", "twin"],
    ["to", "visitor"],
  ] as const) {
    const ref = s.handoff[end];
    const own = figure[role];
    if (!own || !placements.has(ref.placement)) continue;
    if (ref.placement !== own.id) ri8(ctx.path("handoff", end, "placement"), `not the ${role}'s placement`);
    else {
      const entry = pieces.get(own.piece);
      if (entry && !has(entry.value.anchors, ref.anchor))
        ri8(ctx.path("handoff", end, "anchor"), `no anchor of that name on the ${role}'s piece`);
      else sound[end] = entry !== undefined;
    }
  }
  if (sound.from && sound.to) handSides(ctx, ri8);
  // Spec 009's stand-in (its FR-011, FR-037): an avatar of the room's table, in every build.
  const named = s.figures.twin_stand_in;
  if (named !== undefined && !isAvatarId(named))
    ri8(ctx.path("figures", "twin_stand_in"), "a stand-in that isn't an avatar of the room's table");
  twinBlock(ctx, ri8);
  // Spec 016 (FR-036; Amendment M18): a live face drawn into its avatar's own mesh only on a figure's piece.
  const figurePieces = new Set(s.placements.flatMap((p) => (p.role === undefined ? [] : [p.piece])));
  for (const c of ctx.room.catalog)
    c.value.live_faces.forEach((f, i) => {
      if (f.surface === "model" && !figurePieces.has(c.value.id))
        ri8(
          ctx.path("live_faces", i, "surface"),
          "a face drawn into an avatar's mesh on a piece that isn't a figure's",
          c.file,
        );
    });
}

/** RI8 over spec 016's twin block (its FR-054; contracts/twin-data.md §1, §7): each state of its clip map in the closed
 *  list, and each clip role in its own; and the lean against the work desk, the piece the scene's survey names as the
 *  desk (its desk_corner's placement), placed by a placement that isn't a figure's. */
function twinBlock(ctx: Context, ri8: (path: string, reason: string) => void): void {
  const s = ctx.room.scene?.value;
  const twin = s?.figures.twin;
  if (!s || !twin) return;
  for (const [state, role] of Object.entries(twin.clips ?? {})) {
    if (!isTwinState(state)) ri8(ctx.path("figures", "twin", "clips", state), "a state outside the twin's closed list");
    else if (state === "fleeing")
      ri8(
        ctx.path("figures", "twin", "clips", state),
        "a state the run sets, whose clip is the idle (spec 025, FR-011)",
      );
    else if (!isTwinClipRole(role))
      ri8(ctx.path("figures", "twin", "clips", state), "a clip role outside the twin's closed list");
  }
  if (twin.lean) {
    const deskPiece = s.placements.find((p) => p.id === s.survey.desk_corner.placement)?.piece;
    const against = s.placements.find((p) => p.id === twin.lean?.against);
    if (!against || against.role !== undefined || deskPiece === undefined || against.piece !== deskPiece)
      ri8(
        ctx.path("figures", "twin", "lean", "against"),
        "a lean against a placement that isn't the work desk's, the piece the survey's desk_corner names",
      );
  }
}

/**
 * RI8's nearer hands (FR-008; the Author's direction of 2026-10-23, plan.md §10): the paper goes from the twin's hand
 * to the visitor's nearer hand, so each figure's hand anchor lies, in its own frame, on the side the other figure's
 * hand lies on: the visitor's toward the twin's hand, the twin's toward the visitor's. The hand-off reads the sides
 * from the anchors (handoff.ts's `sideOf`), so a scene that moved one figure across the other without moving its hand
 * would hand the paper across both figures. Placements that don't resolve are RI4's or RG1's to report.
 */
function handSides(ctx: Context, ri8: (path: string, reason: string) => void): void {
  const s = ctx.room.scene?.value;
  if (!s) return;
  const pieces = new Map<string, MountPiece>();
  for (const c of ctx.room.catalog)
    if (!pieces.has(c.value.id)) pieces.set(c.value.id, { scale: c.value.stylized_scale, anchors: c.value.anchors });
  const resolved = resolveMounts(
    s.placements.map((p) => ({
      id: p.id,
      piece: p.piece,
      mount: p.mount ? { on: p.mount.on, anchor: p.mount.anchor } : null,
      offset: p.mount?.offset ?? [0, 0, 0],
      turn: p.mount?.turn ?? { x: 0, y: 0, z: 0 },
    })),
    Object.fromEntries(pieces),
  );
  /** A hand-off end's anchor: its point in the world, its x in its own figure's frame, and the frame's inverse. */
  const hand = (ref: AnchorRef) => {
    const placement = s.placements.find((p) => p.id === ref.placement);
    const piece = placement && pieces.get(placement.piece);
    const anchor = piece && has(piece.anchors, ref.anchor) ? piece.anchors[ref.anchor] : undefined;
    const world = resolved.world.get(ref.placement);
    const back = world && invert(world);
    if (!piece || !anchor || !world || !back) return null;
    return { x: anchor.at[0], point: origin(anchorWorld(world, piece.scale, anchor)), back };
  };
  const [twin, visitor] = [hand(s.handoff.from), hand(s.handoff.to)];
  if (!twin || !visitor) return;
  for (const [end, own, other, role, toward] of [
    ["to", visitor, twin, "visitor", "twin"],
    ["from", twin, visitor, "twin", "visitor"],
  ] as const)
    if (sideOf(own.x) !== sideOf(transformPoint(own.back, other.point)[0]))
      ri8(
        ctx.path("handoff", end, "anchor"),
        `the ${role}'s hand isn't on the side of the ${role} the ${toward}'s hand lies on, so the paper would cross the ` +
          `${role} to its farther hand`,
      );
}

/** RI10: in a drafts build, lookdev.yaml naming a placement the scene doesn't have, or an avatar outside the table. */
function lookdev(ctx: Context): void {
  const { scene, lookdev: file } = ctx.room;
  if (!ctx.options.drafts || !scene || !file) return;
  const ids = new Set(scene.value.placements.map((p) => p.id));
  const check = (list: readonly string[], ...at: string[]): void =>
    list.forEach((id, k) => {
      if (!ids.has(id)) ctx.report("RI10", file.file, ctx.path(...at, k), "no placement of that ID in the scene");
    });
  check(file.value.vignette.show, "vignette", "show");
  check(file.value.close_up.frame, "close_up", "frame");
  // Spec 014 (FR-042; PD-24): the hands view's avatars, each of the room's avatar table.
  file.value.hands?.avatars.forEach((id, k) => {
    if (!isAvatarId(id))
      ctx.report("RI10", file.file, ctx.path("hands", "avatars", k), "no avatar of that ID in the room's avatar table");
  });
}

/** RI11: a `label.<name>` UI word that no placement, face binding, or switch references. */
function labels(ctx: Context): void {
  const { scene, ui } = ctx.room;
  if (!scene || !ui) return;
  const used = new Set<string>();
  for (const p of scene.value.placements) {
    if (p.label !== undefined) used.add(p.label);
    for (const binding of Object.values(p.faces ?? {})) used.add(binding.label);
  }
  for (const sw of scene.value.switches) used.add(sw.label);
  for (const key of Object.keys(ui.value.words))
    if (key.startsWith("label.") && !used.has(key))
      ctx.report("RI11", ui.file, ctx.path("words", key), "a label nothing references");
}

/** RI: every rule of the family, in its order. */
export const ri: Family = (ctx) => {
  duplicates(ctx);
  retired(ctx);
  references(ctx);
  inks(ctx);
  vocabulary(ctx);
  selectables(ctx);
  models(ctx);
  figures(ctx);
  lookdev(ctx);
  labels(ctx);
};
