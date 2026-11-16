// back-029c (spec 029; FR-020; the decision page's Q38, recommended answer, taken provisionally; rv-impl-029c's C-1 and
// N-3; plan.md §R-C7): the drawn sheet the twin hands over and the visitor keeps reads "RESUME" from both of its sides,
// as FR-020 has it, lower left to upper right, unmirrored. The walking view's follow camera stands behind the figure and
// sees the held sheet's back (scene/grip.ts turns its +Z to the figure's front), so a back that showed the front's
// drawing through the paper would read mirrored there, upper left to lower right.
// - Through the real buildRoom and the real paper drawing (paper.ts's drawPaper on the sheet's canvas, its calls
//   recorded): for each sheet, the travelling one and the kept one, and each side of it, every mesh that draws that
//   side is followed from the drawing's word, through its map's transform and the plane's UVs, to the world, and seen
//   by a viewer on that side, the sheet's +Y up: the word runs from lower left to upper right along the diagonal, and
//   its letters' up lies to the left of its run (a mirror image turns that the other way).
// - The back is the front's own drawing (the one canvas), white, transparent, and at the front's opacity whatever sets
//   it: the hand-off's cross-fade (showHandoff) or the kept paper's showing (scene/avatars.ts writes the materials).
// - Through createScene (N-3: scene.ts hands buildRoom the document, which no other test holds): the sheets in the
//   drawn scene carry the drawn canvas texture, "RESUME" drawn on it, and read so from both sides.
import { JSDOM } from "jsdom";
import { BackSide, CanvasTexture, DoubleSide, FrontSide, Matrix3, Mesh, Object3D, Vector3 } from "three";
import type { MeshBasicMaterial, Object3D as Node, Scene, Texture } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { createScene } from "../../src/room/scene";
import { buildRoom, showHandoff } from "../../src/room/scene/bundle3d";
import { SHEET_SIZE } from "../../src/room/scene/grip";
import { FakeClock, repositoryBundle } from "../helpers/room";
import type { TestWindow } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

const swapped = vi.hoisted(() => ({ renderer: null as ((parameters: unknown) => unknown) | null }));

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return swapped.renderer ? swapped.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

afterEach(() => {
  swapped.renderer = null;
});

/** The paper's canvas, paper.ts's PAPER_PX through bundle3d.ts. */
const W = 512;
const H = 724;

/** What drawPaper drew on one canvas: its word's centre, turn, and run, from the context's own calls. */
interface Drawn {
  centre: [number, number] | null;
  angle: number | null;
  words: string[];
  run: number | null;
}

/**
 * A document whose paper-sized canvases record drawPaper's calls on a stand-in 2D context; every other canvas has no
 * context, as jsdom's own, so the faces and labels draw as they do in the other tests.
 */
function recordingDocument(): { doc: Document; win: TestWindow; drawn: Map<HTMLCanvasElement, Drawn> } {
  const win = new JSDOM("<main></main>", { url: "http://127.0.0.1:18105/", pretendToBeVisual: true })
    .window as unknown as TestWindow;
  const drawn = new Map<HTMLCanvasElement, Drawn>();
  win.HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, kind: string) {
    if (kind !== "2d" || this.width !== W || this.height !== H) return null;
    const canvas = this;
    const record: Drawn = drawn.get(canvas) ?? { centre: null, angle: null, words: [], run: null };
    drawn.set(canvas, record);
    return new Proxy(
      {},
      {
        get:
          (_t, name: string) =>
          (...args: unknown[]) => {
            if (name === "translate") record.centre = [Number(args[0]), Number(args[1])];
            if (name === "rotate") record.angle = Number(args[0]);
            if (name === "fillText") {
              record.words.push(String(args[0]));
              record.run = Number(args[3]);
            }
          },
        set: () => true,
      },
    );
  } as unknown as HTMLCanvasElement["getContext"];
  return { doc: win.document, win, drawn };
}

/** A canvas pixel to the texture's UV: three.js uploads a canvas with flipY, so the canvas's top is v = 1. */
const pixelToTextureUv = ([x, y]: [number, number]): Vector3 => new Vector3(x / W, 1 - y / H, 1);

/** A canvas pixel on a mesh of the sheet's plane to the world: the map's transform undone, then the plane's UVs. */
function pixelToWorld(mesh: Mesh, map: Texture, pixel: [number, number]): Vector3 {
  map.updateMatrix();
  const uv = pixelToTextureUv(pixel).applyMatrix3(new Matrix3().copy(map.matrix).invert());
  const local = new Vector3((uv.x - 0.5) * SHEET_SIZE[0], (uv.y - 0.5) * SHEET_SIZE[1], 0);
  return local.applyMatrix4(mesh.matrixWorld);
}

/** The mesh's front's normal in the world: three.js's, through the normal matrix, which a mirroring transform flips. */
function frontNormal(mesh: Mesh): Vector3 {
  return new Vector3(0, 0, 1).applyMatrix3(new Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();
}

/** Whether the mesh draws the side a viewer looking from `toward` (from the sheet, out) sees. */
function drawsSide(mesh: Mesh, toward: Vector3): boolean {
  const side = (mesh.material as MeshBasicMaterial).side;
  if (side === DoubleSide) return true;
  const facing = frontNormal(mesh).dot(toward) > 0;
  return side === FrontSide ? facing : side === BackSide ? !facing : false;
}

/** The sheet's plane: a mesh of the sheet's size. */
const isSheet = (node: Node): node is Mesh => {
  const mesh = node as Partial<Mesh>;
  const params = (mesh.geometry as unknown as { parameters?: { width?: number; height?: number } } | undefined)
    ?.parameters;
  return mesh.isMesh === true && params?.width === SHEET_SIZE[0] && params.height === SHEET_SIZE[1];
};

/**
 * The sheet `root` (and whatever it holds) seen by a viewer on its front and on its back, its +Y up: for each mesh that
 * draws that side, the drawn word's run and its letters' up, on the viewer's screen (x right, y up).
 */
function seen(root: Object3D, drawing: Drawn): { side: "front" | "back"; run: [number, number]; up: [number, number] }[] {
  root.updateWorldMatrix(true, true);
  const [cx, cy] = drawing.centre ?? [NaN, NaN];
  const a = drawing.angle ?? NaN;
  const half = (drawing.run ?? NaN) / 2;
  // The word's two ends, its first letter's and its last's, and a point above its centre along its letters' up, in the
  // canvas (y down): rotate(a) turns the text's +x to (cos a, sin a) and its up, −y, to (sin a, −cos a).
  const start: [number, number] = [cx - half * Math.cos(a), cy - half * Math.sin(a)];
  const end: [number, number] = [cx + half * Math.cos(a), cy + half * Math.sin(a)];
  const above: [number, number] = [cx + 40 * Math.sin(a), cy - 40 * Math.cos(a)];
  const normal = frontNormal(root as Mesh);
  const sheetUp = new Vector3(0, 1, 0).transformDirection(root.matrixWorld);
  const out: { side: "front" | "back"; run: [number, number]; up: [number, number] }[] = [];
  for (const [side, toward] of [
    ["front", normal.clone()],
    ["back", normal.clone().negate()],
  ] as const) {
    const right = new Vector3().crossVectors(sheetUp, toward).normalize();
    const screen = (p: Vector3): [number, number] => [p.dot(right), p.dot(sheetUp)];
    root.traverse((node) => {
      if (!isSheet(node)) return;
      const map = (node.material as MeshBasicMaterial).map;
      if (!map || !drawsSide(node, toward)) return;
      const [s, e, u] = [start, end, above].map((px) => screen(pixelToWorld(node, map, px)));
      const centre = screen(pixelToWorld(node, map, [cx, cy]));
      out.push({
        side,
        run: [e[0] - s[0], e[1] - s[1]],
        up: [u[0] - centre[0], u[1] - centre[1]],
      });
    });
  }
  return out;
}

/** Each side of the sheet shows the word, and every mesh drawing it reads lower left to upper right, unmirrored. */
function expectReadsFromBothSides(root: Object3D, drawing: Drawn, label: string): void {
  const views = seen(root, drawing);
  expect(
    views.map((v) => v.side),
    `${label}: a mesh draws each side`,
  ).toEqual(expect.arrayContaining(["front", "back"]));
  const diagonal = Math.atan2(SHEET_SIZE[1], SHEET_SIZE[0]);
  for (const { side, run, up } of views) {
    const where = `${label}, seen from its ${side}`;
    expect(run[0], `${where}: the word runs left to right`).toBeGreaterThan(0);
    expect(run[1], `${where}: the word runs upward`).toBeGreaterThan(0);
    expect(Math.atan2(run[1], run[0]), `${where}: along the diagonal`).toBeCloseTo(diagonal, 6);
    // Its letters' up lies to the left of its run: the run turned a quarter counter-clockwise, never clockwise.
    expect(run[0] * up[1] - run[1] * up[0], `${where}: unmirrored`).toBeGreaterThan(0);
  }
}

let drafts: ComposeResult | undefined;
const fixture = (): ComposeResult => (drafts ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: true }));

describe("the sheet from both sides, in buildRoom (Q38; C-1; FR-020)", () => {
  const build = () => {
    const recording = recordingDocument();
    const { scene: part, index } = fixture();
    const room = buildRoom(part, { avatar: "dog", label: () => new Object3D(), index, paper: { doc: recording.doc } });
    const canvas = (room.paper.atTwin.map?.image ?? null) as HTMLCanvasElement | null;
    const drawing = canvas ? recording.drawn.get(canvas) : undefined;
    if (!drawing) throw new Error("the paper's canvas was not drawn");
    return { room, drawing };
  };

  it("draws the word once on the sheet's canvas, through paper.ts", () => {
    const { drawing } = build();
    expect(drawing.words).toEqual(["RESUME"]);
    expect(drawing.centre).toEqual([W / 2, H / 2]);
    expect(drawing.angle).toBeCloseTo(-Math.atan2(H, W), 9);
  });

  it("reads RESUME lower left to upper right, unmirrored, from the front and the back of both sheets", () => {
    const { room, drawing } = build();
    // Turned as a hand turns it (scene/grip.ts): a quarter about +Y, then tipped, so the check isn't the identity's.
    for (const [mesh, label] of [
      [room.paper.sheet, "the travelling sheet"],
      [room.paper.kept, "the kept sheet"],
    ] as const) {
      expectReadsFromBothSides(mesh, drawing, `${label}, as built`);
      mesh.rotation.set(0.3, Math.PI / 2, -0.2);
      expectReadsFromBothSides(mesh, drawing, `${label}, turned`);
      mesh.rotation.set(0, 0, 0);
    }
  });

  it("draws the back from the front's one drawing, white and transparent, at the front's opacity", () => {
    const { room } = build();
    const backs = (root: Mesh): Mesh[] => {
      const found: Mesh[] = [];
      root.updateWorldMatrix(true, true);
      const behind = frontNormal(root).negate();
      root.traverse((node) => {
        if (isSheet(node) && node !== root && drawsSide(node, behind)) found.push(node);
      });
      return found;
    };
    const pairs = [
      [room.paper.sheet, room.paper.atTwin],
      [room.paper.kept, room.paper.atVisitor],
    ] as const;
    for (const [mesh, front] of pairs) {
      const [back, ...more] = backs(mesh);
      expect(back, "a back of its own").toBeDefined();
      expect(more).toEqual([]);
      const material = back?.material as MeshBasicMaterial;
      expect(material.map?.image).toBe(front.map?.image);
      expect(material.color.getHexString()).toBe("ffffff");
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(front.opacity);
    }
    // The hand-off's cross-fade, under reduced motion, and the kept paper's showing, which writes the materials.
    showHandoff(room, 0.25, true);
    for (const [mesh, front] of pairs) expect((backs(mesh)[0]?.material as MeshBasicMaterial).opacity).toBe(front.opacity);
    room.paper.atTwin.opacity = 0;
    room.paper.atVisitor.opacity = 1;
    expect((backs(room.paper.sheet)[0]?.material as MeshBasicMaterial).opacity).toBe(0);
    expect((backs(room.paper.kept)[0]?.material as MeshBasicMaterial).opacity).toBe(1);
  });
});

describe("the sheet through createScene (N-3; scene.ts gives buildRoom the document)", () => {
  it("draws the held paper with the drawn canvas texture, RESUME on it, readable from both sides", () => {
    const recording = recordingDocument();
    const rendered: Scene[] = [];
    swapped.renderer = () => ({
      autoClear: true,
      outputColorSpace: "",
      shadowMap: { enabled: true },
      setPixelRatio: () => undefined,
      setSize: () => undefined,
      initTexture: () => undefined,
      render: (scene: Scene) => {
        rendered.push(scene);
      },
      dispose: () => undefined,
    });
    const clock = new FakeClock();
    const stage = createScene({
      win: recording.win,
      doc: recording.doc,
      clock,
      room: repositoryBundle().index,
      avatar: "dog",
      reducedMotion: false,
      select: () => undefined,
      onFrame: () => undefined,
    });
    try {
      clock.advance(32);
      const scene = rendered.at(-1);
      expect(scene, "a frame drawn").toBeDefined();
      // The scene's sheets that stand on their own, the travelling one and the kept one (a back is held by its sheet).
      const sheets: Mesh[] = [];
      scene?.traverse((node) => {
        if (isSheet(node) && !isSheet(node.parent as Node)) sheets.push(node);
      });
      expect(sheets).toHaveLength(2);
      for (const sheet of sheets) {
        const map = (sheet.material as MeshBasicMaterial).map;
        expect(map).toBeInstanceOf(CanvasTexture);
        const canvas = map?.image as HTMLCanvasElement;
        expect([canvas.width, canvas.height]).toEqual([W, H]);
        const drawing = recording.drawn.get(canvas);
        expect(drawing?.words).toEqual(["RESUME"]);
        if (drawing) expectReadsFromBothSides(sheet, drawing, "a sheet of the drawn scene");
      }
    } finally {
      stage.dispose();
    }
  });
});
