// T004 (spec 008; FR-014, FR-015, FR-017 to FR-019, FR-049, SC-002; plan.md R-07): src/room/scene/highlight.ts, the
// 3D highlight, in Node with three's objects and no renderer, the room built with buildRoom from the repository's
// bundle, and then in the 3D stage (src/room/scene.ts) with a stand-in renderer, since Node has no WebGL.
// - The target's draws: what each of its members' placements draws itself, its stand-in or its model, and nothing
//   mounted on it that isn't a member: not the placement mounted on a member (the repository's neon sign on its
//   monitor) and not a switch's case mounted on one (the charger's plug on the laptop). The selectable, the placement,
//   and the case are found in the bundle by those relations, never by an ID written here (the source scan, FR-007).
// - No target draws nothing: no pass, no render call (FR-049).
// - A member's model swapped in, and back to its stand-in, is followed (FR-019).
// - Two passes, in order (FR-049): the target's draws into the stencil, then the ring, a capsule around each of a
//   draw's edges on screen, drawn after the look's frame outside the stencil, so the target never covers it, and with
//   its distances for depth, nearer than the room's own, so the surface the target stands on never hides it (the
//   review of Phase 1, finding 2); its widths, the look's highlight in CSS pixels, from the stage's size. The ring's
//   edges: each geometry's, a box face's diagonal left out. Its widths, the shaders mirrored in JS (ringVertex,
//   ringFragment) and drawn over a box's and a capped tube's edges: every pixel within the band's width of the
//   outline is the band's, every one beyond it to the edge's outer side the edge's, and none farther, at the look's
//   widths and at the schema's least (finding 1).
// - The highlight changes nothing else in the room (FR-019).
// - In the 3D stage: the passes on the first frame after the target is set, after the room's own render, at quality
//   levels 0 to 3 and in the inked-cel, painted, and flat looks (FR-017, FR-018), whatever setQuality does to the ink;
//   the stand-ins' labels drawn after the passes, so a border never paints over a label (FR-019; finding 2); and a
//   renderer with a stencil buffer.
import { JSDOM } from "jsdom";
import { AlwaysStencilFunc, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide } from "three";
import { Float32BufferAttribute, Group, KeepStencilOp, Matrix3, Matrix4, Mesh, MeshBasicMaterial } from "three";
import { NotEqualStencilFunc, Object3D, PerspectiveCamera, PlaneGeometry, ReplaceStencilOp } from "three";
import { Vector2, Vector3, Vector4 } from "three";
import type { Camera, Material, Scene, ShaderMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Look, RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import { REFERENCE_DESKTOP, REFERENCE_PHONE } from "../../src/room/compose/stages";
import { createScene } from "../../src/room/scene";
import { buildRoom, memberDraws } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { HIGHLIGHT_PASSES, LABEL_LAYER, createHighlight, ringFragment } from "../../src/room/scene/highlight";
import { ringContour, ringGeometry, ringVertex } from "../../src/room/scene/highlight";
import type { Clip, Highlight, RingFragment } from "../../src/room/scene/highlight";
import { MODEL_NODE, showModel } from "../../src/room/scene/loader";
import { FakeClock, repositoryBundle } from "../helpers/room";
import type { TestWindow } from "../helpers/room";

/** What the scene module draws and draws with in the stage's runs: a 3D part of the test's and a stand-in renderer. */
const swapped = vi.hoisted(() => ({
  part: null as RoomScene | null,
  renderer: null as ((parameters: unknown) => unknown) | null,
}));

vi.mock("virtual:room-scene", async (importOriginal) => {
  const own = await importOriginal<{ default: RoomScene }>();
  return {
    get default() {
      return swapped.part ?? own.default;
    },
  };
});

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return swapped.renderer ? swapped.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

afterEach(() => {
  swapped.part = null;
  swapped.renderer = null;
});

// --------------------------------------------------------------------------------------------------------------------
// The repository's room, and the relations the tests find in it
// --------------------------------------------------------------------------------------------------------------------
const bundle = (): { scene: RoomScene; index: RoomIndex } => repositoryBundle();
const label = (text: string): Object3D => Object.assign(new Object3D(), { name: `label:${text}` });

function room(part: RoomScene = bundle().scene): Room3D {
  return buildRoom(part, { avatar: "dog", label, index: bundle().index });
}

/** The selectable with the most members: the one whose draws span several placements. */
function group(): RoomIndex["selectables"][number] {
  const sorted = [...bundle().index.selectables].sort((a, b) => b.members.length - a.members.length);
  const first = sorted[0];
  if (!first) throw new Error("no selectable");
  return first;
}

const membersOf = (id: string): readonly string[] => bundle().index.selectables.find((s) => s.id === id)?.members ?? [];

/** The meshes under a node, its own included. */
function meshes(node: Object3D | undefined): Mesh[] {
  const out: Mesh[] = [];
  node?.traverse((n) => {
    if ((n as Mesh).isMesh) out.push(n as Mesh);
  });
  return out;
}

/** The placements mounted directly on one of the members that aren't members themselves. */
function mountedOnMembers(members: readonly string[]): string[] {
  return bundle()
    .scene.placements.filter((p) => p.mount !== null && members.includes(p.mount.on) && !members.includes(p.id))
    .map((p) => p.id);
}

/** Each switch's case whose pose mounts on one of the members, as `<switch>.<pose>`. */
function casesOnMembers(members: readonly string[]): { sw: string; pose: string }[] {
  return bundle().scene.switches.flatMap((sw) =>
    Object.entries(sw.poses)
      .filter(([, pose]) => members.includes(pose.mount.on))
      .map(([pose]) => ({ sw: sw.id, pose })),
  );
}

function highlightOf(r: Room3D, look: Look = bundle().scene.look): Highlight {
  return createHighlight({ room: r, style: look.highlight, members: membersOf });
}

// --------------------------------------------------------------------------------------------------------------------
// A renderer that records each render call
// --------------------------------------------------------------------------------------------------------------------
interface Call {
  readonly scene: Scene;
  readonly name: string;
  readonly autoClear: boolean;
  /** The ring's uniforms as they stood at the call: the stage, the widths, and the two colours as hex. */
  readonly ring: { stage: [number, number]; band: number; outer: number; colors: [string, string] } | null;
  readonly visible: number;
}

function spyRenderer(): {
  renderer: { autoClear: boolean; render(scene: Scene, camera: Camera): void };
  calls: Call[];
} {
  const calls: Call[] = [];
  const renderer = {
    autoClear: true,
    render(scene: Scene): void {
      const shown: Mesh[] = [];
      scene.traverseVisible((n) => {
        if ((n as Mesh).isMesh) shown.push(n as Mesh);
      });
      const u = (shown[0]?.material as ShaderMaterial | undefined)?.uniforms;
      const stage = u?.stage?.value as Vector2 | undefined;
      const hex = (name: string): string => `#${(u?.[name]?.value as Color).getHexString()}`;
      calls.push({
        scene,
        name: scene.name,
        autoClear: renderer.autoClear,
        ring: stage
          ? {
              stage: [stage.x, stage.y],
              band: u?.band?.value as number,
              outer: u?.outer?.value as number,
              colors: [hex("bandColor"), hex("edgeColor")],
            }
          : null,
        visible: shown.length,
      });
    },
  };
  return { renderer, calls };
}

const camera = (): Camera => {
  const c = new PerspectiveCamera(40, REFERENCE_DESKTOP.stage.w / REFERENCE_DESKTOP.stage.h, 0.1, 50);
  c.position.set(0, 1.15, 3);
  c.updateMatrixWorld(true);
  return c;
};

// --------------------------------------------------------------------------------------------------------------------
// The target's draws (FR-014)
// --------------------------------------------------------------------------------------------------------------------
describe("the target's draws (FR-014)", () => {
  it("are its members' own draws, and not a placement or a switch's case mounted on a member", () => {
    const r = room();
    const { id, members } = group();
    expect(members.length).toBeGreaterThan(1);
    const others = mountedOnMembers(members);
    const cases = casesOnMembers(members);
    // The relations this test stands on hold in the repository's room: a placement and a case mounted on a member.
    expect(others.length).toBeGreaterThan(0);
    expect(cases.length).toBeGreaterThan(0);

    const highlight = highlightOf(r);
    highlight.setTarget(id);
    const own = members.flatMap((m) => meshes(r.pictures.get(m)));
    expect(own.length).toBeGreaterThan(0);
    expect(new Set(highlight.draws)).toEqual(new Set(own));
    expect(memberDraws(r, members)).toEqual(highlight.draws);
    const excluded = [
      ...others.flatMap((p) => meshes(r.placements.get(p))),
      ...cases.flatMap(({ sw, pose }) => meshes(r.switches.get(sw)?.get(pose))),
    ];
    expect(excluded.length).toBeGreaterThan(0);
    for (const mesh of excluded) expect(highlight.draws).not.toContain(mesh);
  });

  it("are each one-member selectable's own stand-in's meshes", () => {
    const r = room();
    const highlight = highlightOf(r);
    for (const s of bundle().index.selectables.filter((x) => x.members.length === 1)) {
      highlight.setTarget(s.id);
      expect(new Set(highlight.draws), s.id).toEqual(new Set(meshes(r.pictures.get(s.members[0] ?? ""))));
    }
  });

  it("are none without a target, or for an ID the index doesn't list", () => {
    const highlight = highlightOf(room());
    expect(highlight.target).toBeNull();
    expect(highlight.draws).toEqual([]);
    highlight.setTarget(group().id);
    expect(highlight.draws.length).toBeGreaterThan(0);
    highlight.setTarget(null);
    expect(highlight.draws).toEqual([]);
    highlight.setTarget("fx-elsewhere");
    expect(highlight.draws).toEqual([]);
  });

  it("follow a member's model swapped in, and its stand-in when it falls back (FR-019)", () => {
    const part = bundle().scene;
    const r = room(part);
    const { id, members } = group();
    const member = members[0] ?? "";
    const piece = part.placements.find((p) => p.id === member)?.piece ?? "";
    const highlight = highlightOf(r);
    highlight.setTarget(id);
    const standins = meshes(r.pictures.get(member));
    for (const mesh of standins) expect(highlight.draws).toContain(mesh);

    const model = new Group();
    const parts = [0, 1].map(() => new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial()));
    model.add(...parts);
    showModel(r, part, piece, model);
    highlight.refresh();
    expect(r.placements.get(member)?.children.some((c) => c.name === MODEL_NODE)).toBe(true);
    for (const mesh of parts) expect(highlight.draws).toContain(mesh);
    for (const mesh of standins) expect(highlight.draws).not.toContain(mesh);

    showModel(r, part, piece, null);
    highlight.refresh();
    for (const mesh of parts) expect(highlight.draws).not.toContain(mesh);
    for (const mesh of standins) expect(highlight.draws).toContain(mesh);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// The two passes (FR-015, FR-018, FR-049)
// --------------------------------------------------------------------------------------------------------------------
describe("the passes (FR-015, FR-049)", () => {
  it("draw nothing, and call nothing, without a target", () => {
    const highlight = highlightOf(room());
    const { renderer, calls } = spyRenderer();
    highlight.render(renderer, camera());
    expect(highlight.active).toBe(false);
    highlight.setTarget(group().id);
    expect(highlight.active).toBe(true);
    highlight.setTarget(null);
    expect(highlight.active).toBe(false);
    highlight.render(renderer, camera());
    expect(calls).toEqual([]);
    expect(renderer.autoClear).toBe(true);
  });

  it("are two, the stencil mask, then the ring, each over every draw, without clearing, autoClear restored", () => {
    const r = room();
    const highlight = highlightOf(r);
    highlight.setTarget(group().id);
    const { renderer, calls } = spyRenderer();
    highlight.render(renderer, camera());
    expect(calls.map((c) => c.name)).toEqual([...HIGHLIGHT_PASSES]);
    expect(HIGHLIGHT_PASSES).toEqual(["highlight:mask", "highlight:ring"]);
    for (const call of calls) {
      expect(call.autoClear, call.name).toBe(false);
      expect(call.visible, call.name).toBe(highlight.draws.length);
    }
    expect(renderer.autoClear).toBe(true);
  });

  it("take their colours and widths from the look's highlight, in CSS pixels, the stage's size following it", () => {
    const look = bundle().scene.look;
    const { band, band_px, edge, edge_px } = look.highlight;
    expect(look.highlight).toEqual({ band: "#ffd23f", band_px: 3, edge: "#1a1a1a", edge_px: 1.5 });
    const highlight = highlightOf(room(), look);
    highlight.setTarget(group().id);
    for (const stage of [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage, { w: 320, h: 180 }]) {
      highlight.setStage(stage.w, stage.h);
      const { renderer, calls } = spyRenderer();
      highlight.render(renderer, camera());
      const ring = calls[1]?.ring;
      expect(ring, `${stage.w} × ${stage.h}`).toEqual({
        stage: [stage.w, stage.h],
        band: band_px,
        outer: band_px + edge_px,
        colors: [`#${new Color(band).getHexString()}`, `#${new Color(edge).getHexString()}`],
      });
    }
  });

  it("mask the target's draws in the stencil, then draw the ring outside it, its depth its own, nearest", () => {
    const r = room();
    const highlight = highlightOf(r);
    highlight.setTarget(group().id);
    const { renderer, calls } = spyRenderer();
    highlight.render(renderer, camera());
    calls.forEach((call, k) => {
      const proxies: Mesh[] = [];
      call.scene.traverse((n) => {
        if ((n as Mesh).isMesh) proxies.push(n as Mesh);
      });
      expect(proxies.length).toBe(highlight.draws.length);
      const materials = new Set(proxies.map((p) => p.material as Material));
      expect(materials.size, call.name).toBe(1);
      const [material] = [...materials];
      expect(material?.side, call.name).toBe(DoubleSide);
      expect(material?.stencilWrite, call.name).toBe(true);
      expect(material?.stencilRef, call.name).toBe(1);
      if (k === 0) {
        // The mask: every pixel of the target's draws, front and back, into the stencil, and no colour or depth.
        expect(material?.colorWrite).toBe(false);
        expect(material?.depthTest).toBe(false);
        expect(material?.depthWrite).toBe(false);
        expect(material?.stencilFunc).toBe(AlwaysStencilFunc);
        expect(material?.stencilZPass).toBe(ReplaceStencilOp);
      } else {
        // The ring: outside the mask, the nearest edge's fragment kept where capsules cross, faded at its outer side.
        expect(material?.depthTest).toBe(true);
        expect(material?.depthWrite).toBe(true);
        expect(material?.alphaToCoverage).toBe(true);
        expect(material?.stencilFunc).toBe(NotEqualStencilFunc);
        expect([material?.stencilFail, material?.stencilZFail, material?.stencilZPass]).toEqual([
          KeepStencilOp,
          KeepStencilOp,
          KeepStencilOp,
        ]);
      }
      proxies.forEach((proxy, i) => {
        const source = highlight.draws[i] as Mesh;
        expect(proxy.geometry).toBe(k === 0 ? source.geometry : ringGeometry(source.geometry));
        expect(proxy.matrixWorld.elements).toEqual(source.matrixWorld.elements);
        expect(proxy.castShadow || proxy.receiveShadow).toBe(false);
      });
    });
  });

  it("hide the proxies of a draw that doesn't show, and show them again when it does", () => {
    const r = room();
    const { id, members } = group();
    const highlight = highlightOf(r);
    highlight.setTarget(id);
    const node = r.placements.get(members[0] ?? "");
    if (!node) throw new Error("no member's node");
    // The draws under the member's node: its own, and those of any member mounted on it.
    const under = new Set(meshes(node));
    const hidden = highlight.draws.filter((m) => under.has(m)).length;
    expect(hidden).toBeGreaterThan(0);
    expect(hidden).toBeLessThan(highlight.draws.length);
    const { renderer, calls } = spyRenderer();
    node.visible = false;
    highlight.render(renderer, camera());
    for (const call of calls.slice(0, 2)) expect(call.visible, call.name).toBe(highlight.draws.length);
    node.visible = true;
    highlight.render(renderer, camera());
    for (const call of calls.slice(2, 4)) expect(call.visible, call.name).toBe(highlight.draws.length);
    expect(calls[2]?.visible).toBe((calls[0]?.visible ?? 0) + hidden);
  });

  it("change nothing else in the room: no piece moves, changes material, or shows or hides (FR-019)", () => {
    const r = room();
    const snapshot = (): string[] => {
      const out: string[] = [];
      r.scene.updateMatrixWorld(true);
      r.scene.traverse((n) => {
        const m = (n as Mesh).material as Material | Material[] | undefined;
        const ids = ([] as Material[]).concat(m ?? []).map((x) => x.uuid);
        out.push(`${n.uuid} ${n.visible} ${n.matrixWorld.elements.join(",")} ${ids.join(",")}`);
      });
      return out;
    };
    const before = snapshot();
    const highlight = highlightOf(r);
    const { renderer } = spyRenderer();
    for (const s of bundle().index.selectables) {
      highlight.setTarget(s.id);
      highlight.render(renderer, camera());
    }
    highlight.setTarget(null);
    expect(snapshot()).toEqual(before);
    highlight.dispose();
    expect(snapshot()).toEqual(before);
  });
});

describe("the ring's edges (finding 1)", () => {
  type V3 = [number, number, number];
  /** Each instance's ends and faces' normals. */
  function edgesOf(ring: ReturnType<typeof ringGeometry>): { ends: [V3, V3]; faces: [V3, V3] }[] {
    const get = (name: string, i: number): V3 => {
      const a = ring.getAttribute(name);
      return [a.getX(i), a.getY(i), a.getZ(i)];
    };
    expect(ring.getAttribute("edgeA").count).toBe(ring.instanceCount);
    return Array.from({ length: ring.instanceCount }, (_, i) => ({
      ends: [get("edgeA", i), get("edgeB", i)],
      faces: [get("faceA", i), get("faceB", i)],
    }));
  }

  it("are a box's twelve, no face's diagonal, each an instance of one quad with its two faces' normals", () => {
    const box = new BoxGeometry(0.4, 0.2, 0.1);
    const ring = ringGeometry(box);
    // The quad: its four corners, x the end and y the side, in two triangles.
    expect(Array.from(ring.getAttribute("position").array)).toEqual([1, 1, 0, 1, -1, 0, -1, 1, 0, -1, -1, 0]);
    expect(Array.from(ring.index?.array ?? [])).toEqual([0, 1, 2, 0, 2, 3]);
    const all = edgesOf(ring);
    expect(all.length).toBe(12);
    for (const { ends, faces } of all) {
      // Along one axis: the box's own edges, never a diagonal across a face.
      const differs = [0, 1, 2].filter((k) => Math.abs((ends[0][k] ?? 0) - (ends[1][k] ?? 0)) > 1e-9);
      expect(differs.length).toBe(1);
      // Its two faces, each along an axis the edge doesn't run, outward: away from the box's centre.
      for (const n of faces) {
        expect(Math.hypot(...n)).toBeCloseTo(1, 6);
        const axis = n.findIndex((c) => Math.abs(c) > 0.5);
        expect(differs).not.toContain(axis);
        expect(Math.sign(n[axis] ?? 0)).toBe(Math.sign(ends[0][axis] ?? 0));
      }
      expect(faces[0]).not.toEqual(faces[1]);
    }
    expect(ringGeometry(box)).toBe(ring);
    const released = vi.fn();
    ring.addEventListener("dispose", released);
    box.dispose();
    expect(released).toHaveBeenCalledTimes(1);
  });

  it("are a plane's four sides, a capped tube's rims and sides, and the same without an index", () => {
    // A plane's sides are its borders: each always draws, its faces zero.
    const plane = edgesOf(ringGeometry(new PlaneGeometry(1, 1)));
    expect(plane.length).toBe(4);
    for (const { faces } of plane) expect(faces).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    // 24 sides, each a flat facet: its 24 upright edges and its two rims of 24, no facet's diagonal or cap's spoke.
    const tube = edgesOf(ringGeometry(new CylinderGeometry(0.06, 0.06, 0.6, 24, 1, false)));
    expect(tube.length).toBe(72);
    for (const { faces } of tube) expect(faces.every((n) => Math.hypot(...n) > 0.99)).toBe(true);
    expect(edgesOf(ringGeometry(new BoxGeometry(0.4, 0.2, 0.1).toNonIndexed())).length).toBe(12);
  });

  it("draw always where two triangles run their edge the same way, so their normals don't agree on a side", () => {
    // Two triangles on the edge from (0, 0, 0) to (1, 0, 0), both running it that way.
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
    const shared = edgesOf(ringGeometry(g)).find(
      ({ ends }) => ends.some((q) => q.join() === "0,0,0") && ends.some((q) => q.join() === "1,0,0"),
    );
    expect(shared?.faces).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("are on the contour where their two faces face opposite ways from the eye, or a face is zero", () => {
    // In view space, the eye at the origin looking down -z: an edge 2 m ahead, one face toward the eye, one away.
    const mid: V3 = [0.5, 0, -2];
    expect(ringContour([0, 0, 1], [0, 0, -1], mid, false)).toBe(true);
    expect(ringContour([0, 0, 1], [0.2, 0.1, 0.97], mid, false)).toBe(false);
    expect(ringContour([0, 0, 0], [0, 0, 0], mid, false)).toBe(true);
    // A face edge on to the eye counts as on it.
    expect(ringContour([1, 0, 0.25], [0, 0, 1], mid, false)).toBe(true);
    // Orthographic: facing by the normal's z alone.
    expect(ringContour([0.9, 0, 0.1], [0.9, 0, -0.1], [5, 0, -2], true)).toBe(true);
    expect(ringContour([0.9, 0, 0.1], [0.5, 0, 0.2], [5, 0, -2], true)).toBe(false);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// In the 3D stage (FR-017, FR-018)
// --------------------------------------------------------------------------------------------------------------------
interface StageRun {
  readonly stage: ReturnType<typeof createScene>;
  readonly clock: FakeClock;
  /** Each render call's scene name, in order, since the last read. */
  calls(): string[];
}

function stageIn(look: Look): StageRun {
  const { scene: part, index } = bundle();
  swapped.part = { ...part, look };
  const names: string[] = [];
  const renderer = {
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: (scene: Scene) => names.push(scene.name),
    dispose: () => undefined,
  };
  swapped.renderer = () => renderer;
  const win = new JSDOM("<main></main>", { pretendToBeVisual: true }).window as unknown as TestWindow;
  win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  const clock = new FakeClock();
  const stage = createScene({
    win,
    doc: win.document,
    clock,
    room: index,
    avatar: "dog",
    reducedMotion: false,
    select: () => undefined,
    onFrame: () => undefined,
  });
  const { w, h } = REFERENCE_DESKTOP.stage;
  Object.defineProperty(stage.canvas, "clientWidth", { configurable: true, get: () => w });
  Object.defineProperty(stage.canvas, "clientHeight", { configurable: true, get: () => h });
  return { stage, clock, calls: () => names.splice(0) };
}

/** The repository's three looks, resolved as the drafts build gives the lookdev page them. */
function looks(): readonly Look[] {
  const drafts = repositoryBundle({ drafts: true }).drafts;
  if (!drafts) throw new Error("no drafts modules");
  return drafts.lookdev.looks;
}

describe("in the 3D stage (FR-017, FR-018)", () => {
  it("knows the three looks, each with Q5's highlight", () => {
    expect(
      looks()
        .map((l) => l.method)
        .sort(),
    ).toEqual(["flat", "inked-cel", "painted"]);
    for (const look of looks())
      expect(look.highlight, look.id).toEqual({ band: "#ffd23f", band_px: 3, edge: "#1a1a1a", edge_px: 1.5 });
  });

  for (const level of [0, 1, 2, 3])
    it(`draws the passes after the room on the first frame after the target is set, in each look, at quality ${level}`, () => {
      for (const look of looks()) {
        const run = stageIn(look);
        run.stage.setQuality(level);
        run.clock.advance(16);
        const before = run.calls();
        expect(before.length, look.id).toBeGreaterThan(0);
        expect(
          before.filter((n) => n.startsWith("highlight:")),
          look.id,
        ).toEqual([]);
        run.stage.setTarget(group().id);
        run.clock.advance(16);
        const frame = run.calls();
        const passes = frame.filter((n) => n.startsWith("highlight:"));
        expect(passes, `${look.id} at ${level}`).toEqual([...HIGHLIGHT_PASSES]);
        // After every render of the room's own scene, which the look draws once, or twice with its ink lines, and
        // before the labels' own render where the room has a stand-in's label (finding 2), as the repository's has.
        const at = frame.indexOf(HIGHLIGHT_PASSES[0]);
        expect(at, `${look.id} at ${level}`).toBeGreaterThan(0);
        expect(frame.slice(0, at).every((n) => n === "")).toBe(true);
        expect(frame.slice(at), `${look.id} at ${level}`).toEqual([
          ...HIGHLIGHT_PASSES,
          ...(room().labels.size > 0 ? [""] : []),
        ]);
        run.stage.setTarget(null);
        run.clock.advance(16);
        expect(
          run.calls().filter((n) => n.startsWith("highlight:")),
          look.id,
        ).toEqual([]);
        run.stage.dispose();
      }
    });
});

// --------------------------------------------------------------------------------------------------------------------
// The ring's widths, drawn (the review of Phase 1, finding 1)
// --------------------------------------------------------------------------------------------------------------------
// The shaders mirrored in JS over a hard-edged box's ring and a capped tube's: every quad's corners placed as the
// vertex shader places them, each point's fragment interpolated straight on screen, as the corners' w of 1 makes it,
// and of the fragments covering a point the one with the least depth kept, as the depth test keeps it. The mesh's own
// outline, the convex hull of its projected positions, stands for the mask. Around it, every point nearer than the
// band's width is the band's, every one beyond that to the outer side the edge's, and nothing farther: the widths on
// screen are the data's, with no spur at a corner. The back-face hull missed them: 2.33 px for a band of 3, and 2.47
// for one of 2 once mitered.
describe("the ring's widths on screen (finding 1)", () => {
  const STAGE = REFERENCE_DESKTOP.stage;
  type P = [number, number];
  type Local = readonly [number, number, number];
  interface Drawn {
    readonly tris: { at: [P, P, P]; local: [Local, Local, Local] }[];
    readonly outline: P[];
  }

  /** The convex hull of points, counter-clockwise, y up. */
  function outlineOf(points: P[]): P[] {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: P, a: P, b: P): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list: P[]): P[] => {
      const out: P[] = [];
      for (const q of list) {
        while (out.length >= 2 && cross(out[out.length - 2] as P, out[out.length - 1] as P, q) <= 0) out.pop();
        out.push(q);
      }
      return out.slice(0, -1);
    };
    return [...half(sorted), ...half([...sorted].reverse())];
  }

  /** How far a point lies outside a convex outline, in CSS pixels; 0 inside it. */
  function outside(q: P, poly: P[]): number {
    let inside = true;
    let best = Infinity;
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length] as P;
      const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
      if (ex * (q[1] - a[1]) - ey * (q[0] - a[0]) < 0) inside = false;
      const t = Math.min(Math.max(((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / (ex * ex + ey * ey), 0), 1);
      best = Math.min(best, Math.hypot(q[0] - a[0] - t * ex, q[1] - a[1] - t * ey));
    });
    return inside ? 0 : best;
  }

  function draw(geometry: BufferGeometry, world: Matrix4, reach: number): Drawn {
    const cam = new PerspectiveCamera(45, STAGE.w / STAGE.h, 0.1, 50);
    cam.position.set(0, 0, 3);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const mvp = new Matrix4().multiplyMatrices(
      cam.projectionMatrix,
      new Matrix4().multiplyMatrices(cam.matrixWorldInverse, world),
    );
    const clipOf = (x: number, y: number, z: number): Clip => {
      const v = new Vector4(x, y, z, 1).applyMatrix4(mvp);
      return [v.x, v.y, v.z, v.w];
    };
    const px = (c: Clip): P => [((c[0] / c[3] + 1) / 2) * STAGE.w, ((c[1] / c[3] + 1) / 2) * STAGE.h];
    const pos = geometry.getAttribute("position");
    const points = Array.from({ length: pos.count }, (_, i) => px(clipOf(pos.getX(i), pos.getY(i), pos.getZ(i))));
    const ring = ringGeometry(geometry);
    const modelView = new Matrix4().multiplyMatrices(cam.matrixWorldInverse, world);
    const normals = new Matrix3().getNormalMatrix(modelView);
    const read = (name: string, i: number): Vector3 => {
      const a = ring.getAttribute(name);
      return new Vector3(a.getX(i), a.getY(i), a.getZ(i));
    };
    const view = (q: Vector3): [number, number, number] => {
      const v = q.clone().applyMatrix4(modelView);
      return [v.x, v.y, v.z];
    };
    const turned = (n: Vector3): [number, number, number] => {
      const v = n.clone().applyMatrix3(normals);
      return [v.x, v.y, v.z];
    };
    const corner = ring.getAttribute("position");
    const tris: Drawn["tris"] = [];
    for (let e = 0; e < ring.instanceCount; e += 1) {
      const [a, b] = [read("edgeA", e), read("edgeB", e)];
      const mid = view(a.clone().add(b).multiplyScalar(0.5));
      if (!ringContour(turned(read("faceA", e)), turned(read("faceB", e)), mid, false)) continue;
      const corners = [0, 1, 2, 3].map((k) => {
        const [end, side] = [corner.getX(k), corner.getY(k)];
        const [own, far] = end > 0 ? [a, b] : [b, a];
        return ringVertex(clipOf(own.x, own.y, own.z), clipOf(far.x, far.y, far.z), [end, side], [STAGE.w, STAGE.h], reach);
      });
      if (corners.some((c) => c === null)) continue;
      const placed = corners.map((c) => ({ at: px(c?.clip as Clip), local: c?.local as Local }));
      for (const [i, j, k] of [
        [0, 1, 2],
        [0, 2, 3],
      ] as const) {
        const [x, y, z] = [placed[i], placed[j], placed[k]] as [(typeof placed)[0], (typeof placed)[0], (typeof placed)[0]];
        tris.push({ at: [x.at, y.at, z.at], local: [x.local, y.local, z.local] });
      }
    }
    return { tris, outline: outlineOf(points) };
  }

  /** The fragment the depth test keeps at a point: of those covering it, the least depth; or none. */
  function fragmentAt(drawn: Drawn, q: P, band: number, outer: number, reach: number): RingFragment | null {
    let best: RingFragment | null = null;
    for (const {
      at: [a, b, c],
      local,
    } of drawn.tris) {
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((b[1] - c[1]) * (q[0] - c[0]) + (c[0] - b[0]) * (q[1] - c[1])) / det;
      const l2 = ((c[1] - a[1]) * (q[0] - c[0]) + (a[0] - c[0]) * (q[1] - c[1])) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const [la, lb, lc] = local;
      const mixed: Local = [
        l1 * la[0] + l2 * lb[0] + l3 * lc[0],
        l1 * la[1] + l2 * lb[1] + l3 * lc[1],
        l1 * la[2] + l2 * lb[2] + l3 * lc[2],
      ];
      const f = ringFragment(mixed, band, outer, reach);
      if (f && (best === null || f.depth < best.depth)) best = f;
    }
    return best;
  }

  const shapes = (): { name: string; geometry: BufferGeometry; world: Matrix4 }[] => [
    { name: "a box", geometry: new BoxGeometry(0.8, 0.4, 0.05), world: new Matrix4().makeTranslation(0.3, 0.2, 0) },
    {
      name: "a capped tube",
      geometry: new CylinderGeometry(0.06, 0.06, 0.6, 24, 1, false),
      world: new Matrix4().makeTranslation(0.2, 0.1, 0),
    },
  ];

  it.each([
    [3, 1.5],
    [2, 1],
  ] as const)("are the data's: a band of %s px, then an edge of %s px, and nothing beyond", (band, edge) => {
    const outer = band + edge;
    const reach = outer + 1;
    for (const { name, geometry, world } of shapes()) {
      const drawn = draw(geometry, world, reach);
      const { outline } = drawn;
      const centre: P = [
        outline.reduce((sum, q) => sum + q[0], 0) / outline.length,
        outline.reduce((sum, q) => sum + q[1], 0) / outline.length,
      ];
      // Across the right side and the top, from the outline outward: the band's width, then the edge's.
      for (const [side, dir] of [
        ["right", [1, 0]],
        ["top", [0, 1]],
      ] as const) {
        let [lo, hi] = [0, 1000];
        for (let k = 0; k < 60; k += 1) {
          const mid = (lo + hi) / 2;
          if (outside([centre[0] + dir[0] * mid, centre[1] + dir[1] * mid], outline) > 0) hi = mid;
          else lo = mid;
        }
        const start: P = [centre[0] + dir[0] * lo, centre[1] + dir[1] * lo];
        let [bandEnd, edgeEnd] = [0, 0];
        for (let s = 0.005; s <= outer + 1; s += 0.01) {
          const f = fragmentAt(drawn, [start[0] + dir[0] * s, start[1] + dir[1] * s], band, outer, reach);
          if (f && f.alpha >= 0.5) {
            edgeEnd = s;
            if (f.tone < 0.5) bandEnd = s;
          }
        }
        expect(bandEnd, `${name}: the band at its ${side}`).toBeCloseTo(band, 1);
        expect(edgeEnd - bandEnd, `${name}: the edge at its ${side}`).toBeCloseTo(edge, 1);
      }
      // Every point around the outline, a quarter pixel apart: the band's within its width, then the edge's, and
      // none beyond the outer side, corners and all.
      const xs = outline.map((q) => q[0]);
      const ys = outline.map((q) => q[1]);
      const wrong: string[] = [];
      for (let x = Math.min(...xs) - reach; x <= Math.max(...xs) + reach; x += 0.25)
        for (let y = Math.min(...ys) - reach; y <= Math.max(...ys) + reach; y += 0.25) {
          const d = outside([x, y], outline);
          if (d === 0 || d > outer + 1) continue;
          const f = fragmentAt(drawn, [x, y], band, outer, reach);
          const shows = f !== null && f.alpha >= 0.5;
          const ok =
            d >= outer + 0.02
              ? !shows
              : d <= outer - 0.02
                ? shows && (d < band - 0.02 ? (f?.tone ?? 1) < 0.5 : d > band + 0.02 ? (f?.tone ?? 0) >= 0.5 : true)
                : true;
          if (!ok) wrong.push(`(${x.toFixed(2)}, ${y.toFixed(2)}) ${d.toFixed(3)} px out: ${JSON.stringify(f)}`);
        }
      expect(wrong.slice(0, 5), `${name}: ${wrong.length} points`).toEqual([]);
    }
  });

  it("follow the shaders line for line: the lines the mirrors copy stand in the ring's material", () => {
    const highlight = highlightOf(room());
    highlight.setTarget(group().id);
    const { renderer, calls } = spyRenderer();
    highlight.render(renderer, camera());
    let material: ShaderMaterial | null = null;
    calls[1]?.scene.traverse((n) => {
      if ((n as Mesh).isMesh) material = (n as Mesh).material as ShaderMaterial;
    });
    const { vertexShader, fragmentShader } = material as unknown as ShaderMaterial;
    for (const line of [
      "float sa = isOrthographic ? -na.z : dot( na, mid );",
      "float sb = isOrthographic ? -nb.z : dot( nb, mid );",
      "if ( sa * sb > 0.0 || ( da < 0.0 && db < 0.0 ) ) {",
      "if ( da < 0.0 ) a = mix( a, b, da / ( da - db ) );",
      "else if ( db < 0.0 ) b = mix( b, a, db / ( db - da ) );",
      "vec2 dir = len > 1e-4 ? d / len : vec2( 1.0, 0.0 );",
      "gl_Position = vec4( ( p + ( dir + position.y * perp ) * reach ) / half_, 0.0, 1.0 );",
      "vLocal = vec3( position.x * vec2( len * 0.5 + reach, position.y * reach ), len * 0.5 );",
    ])
      expect(vertexShader).toContain(line);
    for (const line of [
      "float along = max( abs( vLocal.x ) - vLocal.z, 0.0 );",
      "if ( d > outer + 0.5 ) discard;",
      "gl_FragDepth = 1e-3 * d / reach;",
      "mix( bandColor, edgeColor, clamp( d - band + 0.5, 0.0, 1.0 ) ), clamp( outer + 0.5 - d, 0.0, 1.0 )",
    ])
      expect(fragmentShader).toContain(line);
  });

  it("cut an edge at the near plane, draw nothing of one wholly behind it, and a disc of an edge seen end on", () => {
    const stage = [800, 600] as const;
    expect(ringVertex([0, 0, -2, 1], [0.1, 0, -3, 1], [1, 1], stage, 5)).toBeNull();
    const cut = ringVertex([0.5, 0, -2, 1], [0, 0, 0.5, 1], [1, 1], stage, 5);
    expect(cut?.clip.every((v) => Number.isFinite(v))).toBe(true);
    expect(cut?.clip[3]).toBe(1);
    // Both ends at one point on screen: the quad a square of the reach around it, and the fragment a disc.
    const end = ringVertex([0.2, 0.1, 0.5, 1], [0.4, 0.2, 0.9, 2], [1, -1], stage, 5);
    expect(end?.local).toEqual([5, -5, 0]);
    expect(ringFragment([5, -5, 0], 3, 4.5, 5.5)).toBeNull();
    expect(ringFragment([0, 2, 0], 3, 4.5, 5.5)).toMatchObject({ tone: 0, alpha: 1 });
    expect(ringFragment([0, 4, 0], 3, 4.5, 5.5)).toMatchObject({ tone: 1, alpha: 1 });
  });
});

// --------------------------------------------------------------------------------------------------------------------
// The labels after the passes, and a stencil buffer (the review of Phase 1, finding 2)
// --------------------------------------------------------------------------------------------------------------------
describe("the stage's frame with a target (finding 2)", () => {
  it("asks for a stencil buffer, and draws the stand-ins' labels after the passes, so no border paints over a label", () => {
    const standins = repositoryBundle({ standins: true });
    swapped.part = standins.scene;
    const calls: { name: string; labels: boolean; onlyLabels: boolean }[] = [];
    let parameters: unknown = null;
    swapped.renderer = (p) => {
      parameters = p;
      return {
        autoClear: true,
        outputColorSpace: "",
        shadowMap: { enabled: true },
        setPixelRatio: () => undefined,
        setSize: () => undefined,
        initTexture: () => undefined,
        render: (scene: Scene, cam: Camera) =>
          calls.push({
            name: scene.name,
            labels: cam.layers.isEnabled(LABEL_LAYER),
            onlyLabels: cam.layers.mask === 1 << LABEL_LAYER,
          }),
        dispose: () => undefined,
      };
    };
    const win = new JSDOM("<main></main>", { pretendToBeVisual: true }).window as unknown as TestWindow;
    win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
    const clock = new FakeClock();
    const stage = createScene({
      win,
      doc: win.document,
      clock,
      room: standins.index,
      avatar: "dog",
      reducedMotion: false,
      select: () => undefined,
      onFrame: () => undefined,
    });
    expect(parameters).toMatchObject({ stencil: true });
    const { w, h } = REFERENCE_DESKTOP.stage;
    Object.defineProperty(stage.canvas, "clientWidth", { configurable: true, get: () => w });
    Object.defineProperty(stage.canvas, "clientHeight", { configurable: true, get: () => h });
    clock.advance(16);
    // No target: the room as before, its labels in its own render, nothing after it.
    const plain = calls.splice(0);
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((c) => c.name === "" && c.labels && !c.onlyLabels)).toBe(true);
    stage.setTarget(standins.index.selectables[0]?.id ?? "");
    clock.advance(16);
    const frame = calls.splice(0);
    const at = frame.findIndex((c) => c.name.startsWith("highlight:"));
    expect(at).toBeGreaterThan(0);
    expect(frame.slice(0, at).every((c) => c.name === "" && !c.labels)).toBe(true);
    expect(frame.slice(at, at + HIGHLIGHT_PASSES.length).map((c) => c.name)).toEqual([...HIGHLIGHT_PASSES]);
    expect(frame.slice(at + HIGHLIGHT_PASSES.length)).toEqual([{ name: "", labels: true, onlyLabels: true }]);
    stage.dispose();
  });
});
