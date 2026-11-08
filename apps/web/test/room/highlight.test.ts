// T004 (spec 008; FR-014, FR-015, FR-017 to FR-019, FR-049, SC-002; plan.md R-07): src/room/scene/highlight.ts, the
// 3D highlight, in Node with three's objects and no renderer, the room built with buildRoom from the repository's
// bundle, and then in the 3D stage (src/room/scene.ts) with a stand-in renderer, since Node has no WebGL.
// - The target's draws: what each of its members' placements draws itself, its stand-in or its model, and nothing
//   mounted on it that isn't a member: not the placement mounted on a member (the repository's neon sign on its
//   monitor) and not a switch's case mounted on one (the charger's plug on the laptop). The selectable, the placement,
//   and the case are found in the bundle by those relations, never by an ID written here (the source scan, FR-007).
// - No target draws nothing: no pass, no render call (FR-049).
// - A member's model swapped in, and back to its stand-in, is followed (FR-019).
// - Two passes, in order, edge then band, each a back-face hull drawn after the look's frame, depth-tested and not
//   depth-written, its width from the look's highlight in CSS pixels on each axis of the stage (scene/look.ts's
//   outlineThickness), the edge at the band's width plus its own; the hull's normals, each vertex's the mean of the
//   normals its position shares, so a hard-edged box extrudes with no gap at its corners (plan.md §10).
// - The highlight changes nothing else in the room (FR-019).
// - In the 3D stage: the passes on the first frame after the target is set, after the room's own render, at quality
//   levels 0 to 3 and in the inked-cel, painted, and flat looks (FR-017, FR-018), whatever setQuality does to the ink.
import { JSDOM } from "jsdom";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import { PerspectiveCamera, PlaneGeometry, Vector3 } from "three";
import type { Camera, Material, Scene, ShaderMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Look, RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import { REFERENCE_DESKTOP, REFERENCE_PHONE } from "../../src/room/compose/stages";
import { createScene } from "../../src/room/scene";
import { buildRoom, memberDraws } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { HIGHLIGHT_PASSES, createHighlight, hullGeometry } from "../../src/room/scene/highlight";
import type { Highlight } from "../../src/room/scene/highlight";
import { MODEL_NODE, showModel } from "../../src/room/scene/loader";
import { outlineThickness } from "../../src/room/scene/look";
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
  /** Each pass's visible proxies' materials' uniforms, as they stood at the call. */
  readonly thickness: [number, number] | null;
  readonly color: string | null;
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
      const material = shown[0]?.material as ShaderMaterial | undefined;
      const t = material?.uniforms?.thickness?.value as { x: number; y: number } | undefined;
      const c = material?.uniforms?.color?.value as Color | undefined;
      calls.push({
        scene,
        name: scene.name,
        autoClear: renderer.autoClear,
        thickness: t ? [t.x, t.y] : null,
        color: c ? `#${c.getHexString()}` : null,
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
    highlight.setTarget(group().id);
    highlight.setTarget(null);
    highlight.render(renderer, camera());
    expect(calls).toEqual([]);
    expect(renderer.autoClear).toBe(true);
  });

  it("are two, edge then band, each over every draw, without clearing, the renderer's autoClear restored", () => {
    const r = room();
    const highlight = highlightOf(r);
    highlight.setTarget(group().id);
    const { renderer, calls } = spyRenderer();
    highlight.render(renderer, camera());
    expect(calls.map((c) => c.name)).toEqual([...HIGHLIGHT_PASSES]);
    expect(HIGHLIGHT_PASSES).toEqual(["highlight:edge", "highlight:band"]);
    for (const call of calls) {
      expect(call.autoClear, call.name).toBe(false);
      expect(call.visible, call.name).toBe(highlight.draws.length);
    }
    expect(renderer.autoClear).toBe(true);
  });

  it("take their colours and widths from the look's highlight, in CSS pixels on each axis of the stage", () => {
    const look = bundle().scene.look;
    const { band, band_px, edge, edge_px } = look.highlight;
    expect(look.highlight).toEqual({ band: "#ffd23f", band_px: 3, edge: "#1a1a1a", edge_px: 1.5 });
    const highlight = highlightOf(room(), look);
    highlight.setTarget(group().id);
    for (const stage of [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage, { w: 320, h: 180 }]) {
      highlight.setStage(stage.w, stage.h);
      const { renderer, calls } = spyRenderer();
      highlight.render(renderer, camera());
      const [edgeCall, bandCall] = calls;
      const at = (px: number): [number, number] => [outlineThickness(px, stage.w), outlineThickness(px, stage.h)];
      expect(edgeCall?.thickness, `${stage.w} × ${stage.h}`).toEqual(at(band_px + edge_px));
      expect(bandCall?.thickness, `${stage.w} × ${stage.h}`).toEqual(at(band_px));
      expect(edgeCall?.color).toBe(`#${new Color(edge).getHexString()}`);
      expect(bandCall?.color).toBe(`#${new Color(band).getHexString()}`);
    }
  });

  it("draw back-face hulls, depth-tested and not depth-written, of the draws' own geometry, where the draws stand", () => {
    const r = room();
    const highlight = highlightOf(r);
    highlight.setTarget(group().id);
    const { renderer, calls } = spyRenderer();
    highlight.render(renderer, camera());
    for (const call of calls) {
      const proxies: Mesh[] = [];
      call.scene.traverse((n) => {
        if ((n as Mesh).isMesh) proxies.push(n as Mesh);
      });
      expect(proxies.length).toBe(highlight.draws.length);
      const materials = new Set(proxies.map((p) => p.material as Material));
      expect(materials.size, call.name).toBe(1);
      const [material] = [...materials] as ShaderMaterial[];
      expect(material?.side, call.name).toBe(1); // BackSide
      expect(material?.depthTest, call.name).toBe(true);
      expect(material?.depthWrite, call.name).toBe(false);
      proxies.forEach((proxy, i) => {
        const source = highlight.draws[i] as Mesh;
        expect(proxy.geometry.getAttribute("position")).toBe(source.geometry.getAttribute("position"));
        expect(proxy.geometry.index).toBe(source.geometry.index);
        expect(proxy.geometry.getAttribute("hullNormal")?.count).toBe(source.geometry.getAttribute("position").count);
        expect(proxy.matrixWorld.elements).toEqual(source.matrixWorld.elements);
        expect(proxy.castShadow || proxy.receiveShadow).toBe(false);
      });
    }
  });

  it("hide the hull of a draw that doesn't show, and show it again when it does", () => {
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
    expect(calls[0]?.visible).toBe(highlight.draws.length);
    node.visible = true;
    highlight.render(renderer, camera());
    expect(calls[2]?.visible).toBe(highlight.draws.length);
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

describe("the hull's normals (plan.md §10)", () => {
  const normals = (g: BufferGeometry): Vector3[] => {
    const a = g.getAttribute("hullNormal");
    return Array.from({ length: a.count }, (_, i) => new Vector3(a.getX(i), a.getY(i), a.getZ(i)));
  };

  it("give each of a box's corners the mean of its three faces' normals, so the hull has no gap", () => {
    const box = new BoxGeometry(0.4, 0.2, 0.1);
    const hull = hullGeometry(box);
    expect(hull.getAttribute("position")).toBe(box.getAttribute("position"));
    expect(hull.index).toBe(box.index);
    for (const n of normals(hull)) {
      expect(n.length()).toBeCloseTo(1, 9);
      for (const v of n.toArray()) expect(Math.abs(v)).toBeCloseTo(1 / Math.sqrt(3), 9);
    }
    expect(hullGeometry(box)).toBe(hull);
  });

  it("keep a flat plane's own normal, and fall back to pointing out from the centre where normals cancel", () => {
    for (const n of normals(hullGeometry(new PlaneGeometry(1, 1)))) expect(n.toArray()).toEqual([0, 0, 1]);
    // Two faces at the same corners, facing away from each other: their normals cancel at every position.
    const flat = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute([...flat, ...flat], 3));
    g.setAttribute(
      "normal",
      new Float32BufferAttribute([...Array(4).fill([0, 0, 1]), ...Array(4).fill([0, 0, -1])].flat(), 3),
    );
    const out = normals(hullGeometry(g));
    out.forEach((n, i) => {
      const p = new Vector3(flat[(i % 4) * 3], flat[(i % 4) * 3 + 1], 0).normalize();
      expect(n.length()).toBeCloseTo(1, 9);
      expect(n.distanceTo(p)).toBeLessThan(1e-6);
    });
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
function looks(): Look[] {
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
        // After every render of the room's own scene, which the look draws once, or twice with its ink lines.
        expect(frame.slice(-2), `${look.id} at ${level}`).toEqual([...HIGHLIGHT_PASSES]);
        expect(frame.slice(0, -2).every((n) => !n.startsWith("highlight:"))).toBe(true);
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
