// T178 (spec 004; FR-029, FR-031, FR-034, FR-054, FR-061, SC-008; R-36, R-37): the live faces' renderers, src/room/faces/.
// - The registry holds exactly the five renderers. Each one's layout gives its words, its text-copy lines, its typing's
//   duration, and its smallest glyph; its draw gives a display list of fills, rectangles, text runs anchored start,
//   middle, or end, paths, and the badges "Draft", "Sample", and "test", which the Canvas2D backend (raster.ts, the 3D
//   chunk's) and the attribute-only SVG backend (svg.ts, the 2D room's) draw alike. In every renderer test the text
//   copy equals the drawn words.
// - The terminal and the desktop session type once, ending within 5 seconds, and show their final frame under reduced
//   motion, pause, quality 3, and in 2D; the desktop session draws a conversation column with no logo.
// - A face's canvas is min(px.w, ceil(screen_css.w × min(dpr, level.pixelRatio) × level.faceScale)) wide, its height by
//   the face's aspect, with no mipmaps.
// - A typeface loads through document.fonts: the face draws with the fallback after 2 seconds and again when the
//   typeface arrives, and no document.fonts counts as late.
// - The laptop's screen stays a plain glow while unbound, and so does a bound face whose words haven't come.
// - A switch pose's `glows` set their placements' glow levels while its case shows, and restore them when another case
//   shows (contracts/room-data-files.md §5.4).
// The words come from compose() over the fixture set (its fx- IDs are synthetic), in a drafts build, so every room-text
// file is a draft and drawn with "Draft".
// T264 (spec 004; FR-034, FR-047 to FR-049, FR-060; contracts/turn-cost.md §5, §6, §8): the neon sign's counters draw
// the room's cost channel's state: each reading's words and badge, the text copy equal to the drawn words; and the 3D
// quads redraw them at once on each new state, while the room is paused too, since a pause stops only the glow's motion.
import { JSDOM } from "jsdom";
import { Object3D } from "three";
import type { Mesh } from "three";
import type { MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { TYPING_CHARS_PER_S, TYPING_LIMIT_S, typingSeconds } from "../../src/room/compose/layout";
import { RENDERERS } from "../../src/room/compose/vocabulary";
import type { Renderer } from "../../src/room/compose/vocabulary";
import { drawnWords } from "../../src/room/faces/display-list";
import type { DisplayList, Op } from "../../src/room/faces/display-list";
import { TYPEFACE_WAIT_MS, loadTypefaces } from "../../src/room/faces/fonts";
import { faceCanvasSize, rasterize } from "../../src/room/faces/raster";
import { REGISTRY } from "../../src/room/faces/registry";
import type { RegionInput } from "../../src/room/faces/registry";
import { faceSvg } from "../../src/room/faces/svg";
import type { SvgNode } from "../../src/room/faces/svg";
import { faceLayout, faceList, faceWords, regionInputs, roomTextOf } from "../../src/room/faces/words";
import { costReadings, createCostChannel } from "../../src/room/signals/turn-cost";
import type { CostState, TurnOutcome } from "../../src/room/signals/turn-cost";
import type { FaceSources, RoomText } from "../../src/room/faces/words";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { buildFaceQuads } from "../../src/room/scene/faces3d";
import { buildGlows } from "../../src/room/scene/glows";
import { qualitySettings } from "../../src/room/scene";
import { FakeClock, repositoryBundle } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

let drafts: ComposeResult | null = null;
/** The fixture set as a drafts build composes it: every room-text file a draft, published with "Draft". */
const fixture = (): ComposeResult => (drafts ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: true }));
/** Its room text as room-data.json carries it, read back as the page reads it. */
const fixtureText = (): RoomText => roomTextOf({ room_text: fixture().roomText });
const sources = (index: RoomIndex = fixture().index, text: RoomText | null = fixtureText()): FaceSources => ({
  index,
  text,
});

/** Every region of every bound face of the fixture, with its input, and its renderer. */
function regions(index: RoomIndex = fixture().index): { face: string; renderer: Renderer; input: RegionInput }[] {
  const out: { face: string; renderer: Renderer; input: RegionInput }[] = [];
  for (const face of index.faces) {
    const inputs = regionInputs(face, sources(index));
    face.regions.forEach((r, k) => {
      const input = inputs[k];
      if (input) out.push({ face: face.id, renderer: r.renderer, input });
    });
  }
  return out;
}

/** The fixture's terminal region, as the desktop session's: the same block in its typeface. */
function desktopIndex(): RoomIndex {
  const { index } = fixture();
  return {
    ...index,
    faces: index.faces.map((f) => ({
      ...f,
      regions: f.regions.map((r) =>
        r.renderer === "terminal" ? { ...r, renderer: "desktop-session" as const, grid: { cols: 12, rows: 3 } } : r,
      ),
    })),
  };
}

const OP_KINDS = new Set(["fill", "rect", "text", "path", "badge"]);

describe("the registry (R-36)", () => {
  it("holds exactly the five renderers, each under its own name", () => {
    expect(Object.keys(REGISTRY).sort()).toEqual([...RENDERERS].sort());
    for (const name of RENDERERS) expect(REGISTRY[name].id).toBe(name);
  });

  it("gives each region's layout and display list, its text copy equal to its drawn words, in every renderer", () => {
    const found = regions();
    // The fixture binds a terminal, the neon word and both counters, a chalk block, and a sign; the desktop session is
    // the terminal's block in its own renderer.
    const all = [...found, ...regions(desktopIndex()).filter((r) => r.renderer === "desktop-session")];
    expect(new Set(all.map((r) => r.renderer))).toEqual(new Set(RENDERERS));
    for (const { face, renderer, input } of all) {
      const what = `${face} (${renderer})`;
      const layout = REGISTRY[renderer].layout(input);
      expect(layout.words.length, what).toBeGreaterThan(0);
      expect(layout.glyph, what).toBeGreaterThan(0);
      expect(layout.typingMs, what).toBeGreaterThanOrEqual(0);
      const ops = REGISTRY[renderer].draw(input);
      for (const op of ops) expect(OP_KINDS.has(op.op), `${what}: ${op.op}`).toBe(true);
      // FR-034: the text copy is the drawn words, a badge in brackets.
      expect(drawnWords(ops), what).toEqual(layout.copy);
      expect(
        layout.copy.filter((w) => !w.startsWith("[")),
        what,
      ).toEqual(layout.words);
    }
  });

  it('marks a draft "Draft", and a face its own words; a pending line is drawn nowhere', () => {
    const { index } = fixture();
    const draft = index.ui["draft.badge"];
    expect(draft).toBe("Draft");
    for (const face of index.faces) {
      const words = faceWords(face, sources());
      const regionsOfText = face.regions.filter((r) => "room_text" in r.source);
      if (regionsOfText.length > 0) expect(words, face.id).toContain(`[${draft}]`);
    }
    const everything = index.faces.flatMap((f) => faceWords(f, sources()) ?? []);
    expect(everything).toContain("fx run");
    expect(everything).toContain("Plan small");
    expect(everything).toContain("fixture sign words");
    expect(everything).not.toContain("Later idea");
  });

  it("draws text runs anchored start, middle, or end, paths for a sign, and every badge kind", () => {
    const { index } = fixture();
    const ops = index.faces.flatMap((f) => faceList(f, sources())?.ops ?? []);
    const anchors = new Set(ops.flatMap((o) => (o.op === "text" ? [o.anchor] : [])));
    expect(anchors).toEqual(new Set(["start", "middle"]));
    expect(ops.some((o) => o.op === "path")).toBe(true);
    // Each badge kind's own word: Draft for a draft, Sample for a fixture's figure, test for an amount in a drafts build.
    const chalk = regions().find((r) => r.renderer === "chalk");
    if (!chalk) throw new Error("no chalk region");
    const badged = (kind: "draft" | "sample" | "test", text: string): Op[] =>
      REGISTRY.chalk.draw({ ...chalk.input, badge: { kind, text } });
    for (const [kind, text] of [
      ["draft", "Draft"],
      ["sample", "Sample"],
      ["test", "test"],
    ] as const) {
      const badge = badged(kind, text).find((o) => o.op === "badge");
      expect(badge, kind).toMatchObject({ op: "badge", kind, text });
      expect(badge && "anchor" in badge ? badge.anchor : null).toBe("end");
    }
  });

  it("reads a sign's smallest glyph from its outline's cap height, fitted to its region", () => {
    const sign = regions().find((r) => r.renderer === "sign");
    if (!sign?.input.outline) throw new Error("no sign region");
    const { view_box, cap_height, advance } = sign.input.outline;
    const scale = Math.min(sign.input.box.w / advance, sign.input.box.h / view_box[3]);
    expect(REGISTRY.sign.layout(sign.input).glyph).toBeCloseTo(cap_height * scale, 6);
    const path = REGISTRY.sign.draw(sign.input).find((o) => o.op === "path");
    expect(path && path.op === "path" ? path.paths : []).toEqual(sign.input.outline.paths);
  });

  it("reads a text renderer's smallest glyph as its typeface's cap ratio times its grid's size", () => {
    const terminal = regions().find((r) => r.renderer === "terminal");
    if (!terminal) throw new Error("no terminal region");
    const { box, typeface } = terminal.input;
    // 12 columns of 0.6 em, 3 rows of 1.25 em: the smaller em wins.
    const em = Math.min(box.h / 3 / 1.25, box.w / (12 * 0.6));
    expect(REGISTRY.terminal.layout(terminal.input).glyph).toBeCloseTo(typeface.capRatio * em, 6);
  });
});

describe("the two backends (R-36)", () => {
  /** A recording stand-in for a 2D canvas context: what each call drew, as the canvas would. */
  function recorder(): { ctx: CanvasRenderingContext2D; texts: string[][]; rects: number; paths: string[] } {
    const texts: string[][] = [];
    const paths: string[] = [];
    let rects = 0;
    const state = { font: "", textAlign: "start", fillStyle: "", strokeStyle: "", lineWidth: 1, shadowBlur: 0 };
    const stack: (typeof state)[] = [];
    const ctx = {
      ...state,
      save() {
        stack.push({ ...state });
      },
      restore() {
        Object.assign(state, stack.pop() ?? state);
      },
      setTransform() {},
      transform() {},
      scale() {},
      clearRect() {},
      fillRect() {
        rects += 1;
      },
      fillText(text: string, x: number, y: number) {
        texts.push([text, x.toFixed(3), y.toFixed(3), (ctx as { textAlign: string }).textAlign]);
      },
      strokeText(text: string, x: number, y: number) {
        texts.push([text, x.toFixed(3), y.toFixed(3), (ctx as { textAlign: string }).textAlign]);
      },
      fill(path: { d: string }) {
        paths.push(path.d);
      },
      beginPath() {},
    };
    return {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      texts,
      get rects() {
        return rects;
      },
      paths,
    };
  }

  /** The SVG descriptor's text runs, rectangles, and path data, in the list's own units. */
  function svgParts(node: SvgNode, out = { texts: [] as string[][], rects: 0, paths: [] as string[] }) {
    if (node.tag === "text") {
      const a = node.attrs;
      const anchor = a["text-anchor"] === "middle" ? "center" : String(a["text-anchor"] ?? "start");
      out.texts.push([node.text ?? "", Number(a.x).toFixed(3), Number(a.y).toFixed(3), anchor]);
    } else if (node.tag === "rect") out.rects += 1;
    else if (node.tag === "path") out.paths.push(String(node.attrs.d));
    for (const child of node.children ?? []) svgParts(child, out);
    return out;
  }

  const sortRuns = (runs: string[][]): string[] => runs.map((r) => r.join(" | ")).sort();

  it("draw every fixture face alike: the same text runs at the same places and anchors, rectangles, and paths", () => {
    const { index } = fixture();
    const lists: DisplayList[] = index.faces.flatMap((f) => faceList(f, sources()) ?? []);
    expect(lists.length).toBe(index.faces.length);
    for (const list of lists) {
      const raster = recorder();
      rasterize(raster.ctx, list, list.size[0], list.size[1], (d) => ({ d }) as unknown as Path2D);
      const svg = svgParts(faceSvg(list));
      expect(sortRuns(raster.texts)).toEqual(sortRuns(svg.texts));
      expect(raster.rects).toBe(svg.rects);
      expect(raster.paths).toEqual(svg.paths);
    }
  });

  it("keep the SVG to its attribute allowlist: no style, link, image, or event attribute", () => {
    const { index } = fixture();
    const allowed = new Set([
      "x",
      "y",
      "width",
      "height",
      "d",
      "fill",
      "stroke",
      "stroke-width",
      "opacity",
      "font-family",
      "font-size",
      "font-weight",
      "text-anchor",
      "transform",
    ]);
    const visit = (node: SvgNode): void => {
      expect(["g", "rect", "text", "path"]).toContain(node.tag);
      for (const name of Object.keys(node.attrs)) expect(allowed.has(name), name).toBe(true);
      for (const child of node.children ?? []) visit(child);
    };
    for (const f of index.faces) {
      const list = faceList(f, sources());
      if (list) visit(faceSvg(list));
    }
  });
});

describe("typing (FR-031; R-37)", () => {
  const screens = (): { renderer: Renderer; input: RegionInput }[] => [
    ...regions().filter((r) => r.renderer === "terminal"),
    ...regions(desktopIndex()).filter((r) => r.renderer === "desktop-session"),
  ];

  it(`types once at ${TYPING_CHARS_PER_S} characters a second, ending within ${TYPING_LIMIT_S} s, then holds`, () => {
    for (const { renderer, input } of screens()) {
      const r = REGISTRY[renderer];
      const { typingMs, words } = r.layout(input);
      expect(typingMs, renderer).toBeCloseTo(typingSeconds(input.lines) * 1000, 6);
      expect(typingMs, renderer).toBeLessThanOrEqual(TYPING_LIMIT_S * 1000);
      const typed = (ms: number): string[] => drawnWords(r.draw(input, ms)).filter((w) => !w.startsWith("["));
      expect(typed(0).join(""), renderer).toBe("");
      // Halfway, part of its words; at the end, all of them, and the same ever after.
      const half = typed(typingMs / 2).join("");
      expect(half.length, renderer).toBeGreaterThan(0);
      expect(half.length, renderer).toBeLessThan(words.join("").length);
      expect(typed(typingMs), renderer).toEqual(words);
      expect(typed(typingMs * 10), renderer).toEqual(words);
      expect(typed(Infinity), renderer).toEqual(words);
    }
  });

  it("draws the desktop session as a conversation column with no logo: rectangles and text, no path", () => {
    const desktop = screens().find((s) => s.renderer === "desktop-session");
    if (!desktop) throw new Error("no desktop session");
    const ops = REGISTRY["desktop-session"].draw(desktop.input);
    expect(ops.filter((o) => o.op === "path")).toEqual([]);
    expect(ops.filter((o) => o.op === "rect").length).toBeGreaterThan(0);
    // The face's fill is its list's (words.ts's faceList), under its regions' drawings.
    expect(new Set(ops.map((o) => o.op))).toEqual(new Set(["rect", "text", "badge"]));
  });
});

describe("the faces in 3D (R-37; FR-054)", () => {
  const doc = (): Document => new JSDOM("<main></main>").window.document;

  /** The fixture's part, built with no renderer, and its faces' quads at a quality level. */
  function quads(
    options: { level?: number; animate?: boolean; text?: RoomText | null; index?: RoomIndex; dpr?: number } = {},
  ) {
    const { scene: part } = fixture();
    const index = options.index ?? fixture().index;
    const room = buildRoom(part, { avatar: "dog", label: () => new Object3D(), index });
    const clock = new FakeClock();
    const motion = { animate: options.animate ?? true };
    const faces = buildFaceQuads({
      part,
      index,
      placements: room.placements,
      doc: doc(),
      clock,
      dpr: options.dpr ?? 2,
      level: options.level ?? 0,
      motion: () => motion,
    });
    faces.setText(options.text === undefined ? fixtureText() : options.text);
    return { faces, clock, motion, index };
  }

  const shown = (list: DisplayList | undefined): string[] =>
    list ? drawnWords(list.ops).filter((w) => !w.startsWith("[")) : [];

  it("sizes each face's canvas to min(px, its largest size on screen × the capped pixel ratio × faceScale), no mipmaps", () => {
    const face = { px: [2048, 870] as [number, number], screen_css: [300, 120] as [number, number] };
    expect(faceCanvasSize(face, 3, qualitySettings(0))).toEqual([600, 255]);
    expect(faceCanvasSize(face, 1, qualitySettings(0))).toEqual([300, 127]);
    expect(faceCanvasSize(face, 3, qualitySettings(3))).toEqual([113, 48]);
    expect(faceCanvasSize({ px: [256, 64], screen_css: [300, 120] }, 2, qualitySettings(0))).toEqual([256, 64]);
    const { faces, index } = quads();
    expect([...faces.quads.keys()].sort()).toEqual(index.faces.map((f) => f.id).sort());
    for (const [id, quad] of faces.quads) {
      const face = index.faces.find((f) => f.id === id);
      const map = (quad.material as MeshBasicMaterial).map;
      if (!face || !map) throw new Error(`${id} has no canvas texture`);
      expect(map.generateMipmaps, id).toBe(false);
      const canvas = map.image as HTMLCanvasElement;
      expect([canvas.width, canvas.height], id).toEqual(faceCanvasSize(face, 2, qualitySettings(0)));
      expect((quad.material as MeshBasicMaterial).polygonOffset, id).toBe(true);
    }
  });

  it("types the screens once, then holds; their final frame at once under reduced motion or pause, and at quality 3", () => {
    const terminal = (): string => fixture().index.faces.find((f) => f.regions[0]?.renderer === "terminal")?.id ?? "";
    const words = ["fx run", "fx ok"];
    const moving = quads();
    moving.faces.frame(moving.clock.now());
    expect(shown(moving.faces.lists.get(terminal()))).toEqual([]);
    moving.clock.advance(TYPING_LIMIT_S * 1000);
    moving.faces.frame(moving.clock.now());
    expect(shown(moving.faces.lists.get(terminal()))).toEqual(words);
    // Still, by reduced motion or the pause (the motion store's animate), and at quality 3, whose typing rate is 0.
    for (const still of [quads({ animate: false }), quads({ level: 3 })]) {
      still.faces.frame(still.clock.now());
      expect(shown(still.faces.lists.get(terminal()))).toEqual(words);
    }
    // A pause mid-typing shows the final frame at once, and the screen never types again.
    const paused = quads();
    paused.clock.advance(50);
    paused.faces.frame(paused.clock.now());
    paused.motion.animate = false;
    paused.faces.frame(paused.clock.now());
    expect(shown(paused.faces.lists.get(terminal()))).toEqual(words);
    paused.motion.animate = true;
    paused.faces.frame(paused.clock.now());
    expect(shown(paused.faces.lists.get(terminal()))).toEqual(words);
  });

  it("gives a face a new texture when a level resizes its canvas, and keeps it when the size stays (the review's I1)", () => {
    // three allocates a texture's storage once, at its first size: a canvas resized under it would draw into a corner
    // of the old storage, or fail outright, so a resized face takes a new texture and the old one is released.
    const resized = quads({ dpr: 2 });
    const before = new Map([...resized.faces.quads].map(([id, q]) => [id, (q.material as MeshBasicMaterial).map]));
    const disposed = new Set<string>();
    for (const [id, map] of before) map?.addEventListener("dispose", () => disposed.add(id));
    resized.faces.setLevel(1);
    // Since spec 005 the reference stages are larger, so a face may meet its px cap at both levels: its size stays, and
    // so does its texture; every face whose size changes takes a new one, and at least one does.
    let moved = 0;
    for (const [id, quad] of resized.faces.quads) {
      const map = (quad.material as MeshBasicMaterial).map;
      const face = resized.index.faces.find((f) => f.id === id);
      if (!face) throw new Error(id);
      const [was, now] = [faceCanvasSize(face, 2, qualitySettings(0)), faceCanvasSize(face, 2, qualitySettings(1))];
      if (was[0] === now[0] && was[1] === now[1]) {
        expect(map, id).toBe(before.get(id));
        continue;
      }
      moved += 1;
      expect(map, id).not.toBe(before.get(id));
      expect(disposed.has(id), id).toBe(true);
      const canvas = map?.image as HTMLCanvasElement;
      expect([canvas.width, canvas.height], id).toEqual(now);
      expect(map?.generateMipmaps, id).toBe(false);
    }
    expect(moved).toBeGreaterThan(0);
    // At a pixel ratio of 1, levels 0 to 2 draw every face at one size: its texture stays.
    const same = quads({ dpr: 1 });
    const kept = new Map([...same.faces.quads].map(([id, q]) => [id, (q.material as MeshBasicMaterial).map]));
    const released: string[] = [];
    for (const [id, map] of kept) map?.addEventListener("dispose", () => released.push(id));
    same.faces.setLevel(1);
    same.faces.setLevel(2);
    for (const [id, quad] of same.faces.quads) expect((quad.material as MeshBasicMaterial).map, id).toBe(kept.get(id));
    expect(released).toEqual([]);
  });

  it("keeps a typing screen's place when the room text redraws it mid-typing (cab31c7)", () => {
    const terminal = fixture().index.faces.find((f) => f.regions[0]?.renderer === "terminal")?.id ?? "";
    const typing = quads();
    typing.faces.frame(typing.clock.now());
    typing.clock.advance(100);
    typing.faces.frame(typing.clock.now());
    const mid = shown(typing.faces.lists.get(terminal)).join("");
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.length).toBeLessThan("fx runfx ok".length);
    typing.faces.setText(fixtureText());
    expect(shown(typing.faces.lists.get(terminal)).join("")).toBe(mid);
  });

  it("keeps a face bound to room text plain until its words come, and an unbound screen a plain glow", () => {
    const { faces, index } = quads({ text: null });
    for (const face of index.faces) {
      const quad = faces.quads.get(face.id);
      const ui = face.regions.every((r) => !("room_text" in r.source) && !("resume_titles" in r.source));
      expect(quad?.visible, face.id).toBe(ui);
    }
    // The repository's second screen is a live face the scene binds to nothing (FR-031): no quad, its stand-in's glow
    // shows. Its ID is the data's, read from the 3D part: a placement's piece's face the index doesn't bind.
    const repo = repositoryBundle();
    const bound = new Set(repo.index.faces.map((f) => f.id));
    const unbound = repo.scene.placements.flatMap((p) =>
      Object.keys(repo.scene.pieces[p.piece]?.faces ?? {})
        .map((role) => ({ placement: p.id, id: `${p.id}.${role}` }))
        .filter((f) => !bound.has(f.id)),
    );
    expect(unbound.length).toBeGreaterThan(0);
    const room = buildRoom(repo.scene, { avatar: "dog", label: () => new Object3D(), index: repo.index });
    const built = buildFaceQuads({
      part: repo.scene,
      index: repo.index,
      placements: room.placements,
      doc: doc(),
      clock: new FakeClock(),
      dpr: 1,
      level: 0,
      motion: () => ({ animate: false }),
    });
    expect([...built.quads.keys()].sort()).toEqual(repo.index.faces.map((f) => f.id).sort());
    for (const face of unbound) {
      expect(built.quads.has(face.id), face.id).toBe(false);
      const quadsUnder: string[] = [];
      room.placements.get(face.placement)?.traverse((n) => {
        if ((n as Mesh).isMesh && n.name === `face:${face.id}`) quadsUnder.push(n.name);
      });
      expect(quadsUnder, face.id).toEqual([]);
    }
  });
});

describe("typefaces (FR-061; R-37)", () => {
  const typefaces = (): RoomIndex["typefaces"] => fixture().index.typefaces;

  function fakeFonts(): { doc: Document; arrive: () => void; loads: string[] } {
    let arrive = (): void => undefined;
    const loads: string[] = [];
    const doc = {
      fonts: {
        load(spec: string) {
          loads.push(spec);
          return new Promise<unknown[]>((resolve) => {
            const before = arrive;
            arrive = () => {
              before();
              resolve([{}]);
            };
          });
        },
      },
    } as unknown as Document;
    return { doc, arrive: () => arrive(), loads };
  }

  const flush = async (): Promise<void> => {
    for (let i = 0; i < 3; i += 1) await new Promise((r) => setImmediate(r));
  };

  it("loads each face's typeface through document.fonts, and draws in it when it arrives in time", async () => {
    const { doc, arrive, loads } = fakeFonts();
    const clock = new FakeClock();
    const loader = loadTypefaces(doc, clock, typefaces());
    const changes: number[] = [];
    loader.onChange(() => changes.push(clock.now()));
    const terminal = typefaces().find((t) => t.use === "terminal");
    if (!terminal) throw new Error("no terminal typeface");
    expect(loads.some((s) => s.includes(terminal.family))).toBe(true);
    expect(loader.family("terminal")).toBeNull();
    clock.advance(500);
    arrive();
    await flush();
    expect(loader.family("terminal")).toBe(`${terminal.family}, ${terminal.fallback}`);
    expect(changes.length).toBeGreaterThan(0);
  });

  it(`draws with the fallback after ${TYPEFACE_WAIT_MS / 1000} s, and again when the typeface arrives`, async () => {
    expect(TYPEFACE_WAIT_MS).toBe(2000);
    const { doc, arrive } = fakeFonts();
    const clock = new FakeClock();
    const loader = loadTypefaces(doc, clock, typefaces());
    const changes: number[] = [];
    loader.onChange(() => changes.push(clock.now()));
    const chalk = typefaces().find((t) => t.use === "chalk");
    if (!chalk) throw new Error("no chalk typeface");
    clock.advance(TYPEFACE_WAIT_MS - 1);
    expect(loader.family("chalk")).toBeNull();
    clock.advance(1);
    expect(loader.family("chalk")).toBe(chalk.fallback);
    expect(changes).toEqual([TYPEFACE_WAIT_MS]);
    clock.advance(3000);
    arrive();
    await flush();
    expect(loader.family("chalk")).toBe(`${chalk.family}, ${chalk.fallback}`);
    expect(changes).toHaveLength(2);
  });

  it("calls every listener when a family changes, though one of them throws (the review's nit 4)", () => {
    const clock = new FakeClock();
    const loader = loadTypefaces({} as Document, clock, typefaces());
    const called: string[] = [];
    loader.onChange(() => {
      called.push("first");
      throw new Error("a listener that throws");
    });
    loader.onChange(() => called.push("second"));
    expect(() => clock.advance(TYPEFACE_WAIT_MS)).not.toThrow();
    expect(called).toEqual(["first", "second"]);
  });

  it("counts no document.fonts as late: the fallback after 2 s, and nothing after", () => {
    const clock = new FakeClock();
    const loader = loadTypefaces({} as Document, clock, typefaces());
    const changes: number[] = [];
    loader.onChange(() => changes.push(clock.now()));
    expect(loader.family("neon")).toBeNull();
    clock.advance(TYPEFACE_WAIT_MS);
    const neon = typefaces().find((t) => t.use === "neon");
    expect(loader.family("neon")).toBe(neon?.fallback);
    clock.advance(60_000);
    expect(changes).toEqual([TYPEFACE_WAIT_MS]);
  });

  it("gives the words and their layout whatever the family, so the text copy never waits for a typeface", () => {
    const { index } = fixture();
    for (const face of index.faces) {
      const late = faceLayout(face, { ...sources(), family: () => "monospace" });
      const arrived = faceLayout(face, sources());
      expect(late?.copy, face.id).toEqual(arrived?.copy);
      expect(late?.glyph, face.id).toBe(arrived?.glyph);
    }
  });
});

describe("a switch pose's glows (contracts/room-data-files.md §5.4)", () => {
  it("set their placements' glow levels while its case shows, and restore them when another case shows", () => {
    const { scene: part, index } = repositoryBundle();
    const room = buildRoom(part, { avatar: "dog", label: () => new Object3D(), index });
    const glows = buildGlows({
      part,
      placements: room.placements,
      glow: room.cases.glow,
      motion: () => ({ animate: false }),
    });
    // The glow the plugged pose sets (the charge light), and one no pose sets, by the data's IDs.
    const set = part.switches.flatMap((sw) => Object.values(sw.poses).flatMap((pose) => pose.glows));
    const lit = set[0];
    if (!lit) throw new Error("no pose sets a glow");
    const charge = glows.cards.get(`${lit.placement}.${lit.glow}`);
    if (!charge) throw new Error("no card for the glow a pose sets");
    const own = [...glows.cards.keys()].find((k) => !set.some((g) => `${g.placement}.${g.glow}` === k));
    const screen = own === undefined ? undefined : glows.cards.get(own);
    room.cases.apply("local");
    glows.frame(0);
    expect(charge.visible).toBe(true);
    expect((charge.material as MeshBasicMaterial).opacity).toBeGreaterThan(0);
    room.cases.apply("cloud");
    glows.frame(16);
    expect(charge.visible).toBe(false);
    // A glow no pose sets keeps its piece's own level throughout.
    expect(screen?.visible).toBe(true);
    room.cases.apply("local");
    glows.frame(32);
    expect(charge.visible).toBe(true);
  });

  it("holds every glow still while the room doesn't animate, and moves flicker and breathe while it does", () => {
    const { scene: part, index } = repositoryBundle();
    const room = buildRoom(part, { avatar: "dog", label: () => new Object3D(), index });
    const motion = { animate: false };
    const glows = buildGlows({ part, placements: room.placements, glow: room.cases.glow, motion: () => motion });
    // A glow that breathes or flickers, by the data's IDs.
    const moving = part.placements.flatMap((p) =>
      Object.entries(part.pieces[p.piece]?.glows ?? {})
        .filter(([, g]) => g.motion !== "steady" && g.level > 0)
        .map(([glow]) => `${p.id}.${glow}`),
    );
    const screen = glows.cards.get(moving[0] ?? "");
    if (!screen) throw new Error("no moving glow");
    const opacity = (): number => (screen.material as MeshBasicMaterial).opacity;
    glows.frame(0);
    const still = opacity();
    glows.frame(1234);
    expect(opacity()).toBe(still);
    motion.animate = true;
    const seen = new Set<number>();
    for (const t of [0, 700, 1400, 2100, 2800]) {
      glows.frame(t);
      seen.add(Number(opacity().toFixed(4)));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

// ---- T264: the counters ----

describe("the neon sign's counters (T264; contracts/turn-cost.md §5, §6)", () => {
  /** The fixture's index with the turn route on. */
  const routed = (): RoomIndex => ({ ...fixture().index, live: { ...fixture().index.live, turn: "site" } });
  /** Each counter region of an index: its face, its place among the face's regions, and the part it reads. The
   *  fixture's neon panel holds the word and both counters in one face. */
  const counterRegions = (
    index: RoomIndex,
  ): { face: RoomIndex["faces"][number]; k: number; part: "call" | "visit" }[] =>
    index.faces.flatMap((face) =>
      face.regions.flatMap((r, k) => ("signal" in r.source ? [{ face, k, part: r.source.part }] : [])),
    );
  const state = (outcomes: TurnOutcome[], from: "turn" | "fixture" = "turn"): CostState => {
    const channel = createCostChannel({ configured: true, clock: new FakeClock() });
    for (const o of outcomes) channel.report(o, from);
    return channel.state;
  };
  const reply = (route: string, cost: number): TurnOutcome => ({ kind: "reply", route, cost_micro_usd: cost });
  const counter = (index: RoomIndex, part: "call" | "visit") => {
    const found = counterRegions(index).find((c) => c.part === part);
    if (!found) throw new Error(`no ${part} counter`);
    return found;
  };

  it("draws each reading of the channel's state, its badge beside it, its text copy equal to its drawn words", () => {
    const index = routed();
    expect(
      counterRegions(index)
        .map((c) => c.part)
        .sort(),
    ).toEqual(["call", "visit"]);
    const states = [
      state([]),
      state([reply("local", 0)]),
      state([reply("fallback", 950)]),
      state([reply("fallback", 950), { kind: "lost" }]),
      state([reply("fallback", 950)], "fixture"),
      createCostChannel({ configured: false, clock: new FakeClock() }).state,
    ];
    for (const cost of states) {
      const readings = costReadings(cost, { ui: index.ui, drafts: index.build.kind === "drafts" });
      for (const { face, k, part } of counterRegions(index)) {
        const what = `${face.id} ${part} ${JSON.stringify(cost, (_, v: unknown) => (typeof v === "bigint" ? String(v) : v))}`;
        const reading = readings[part];
        const input = regionInputs(face, { index, text: null, cost })[k];
        expect(input?.lines, what).toEqual([reading?.text]);
        expect(input?.badge ?? null, what).toEqual(reading?.badge ?? null);
        expect(input?.counter, what).toBe(true);
        const list = faceList(face, { index, text: null, cost });
        expect(list ? drawnWords(list.ops) : null, what).toEqual(faceWords(face, { index, text: null, cost }));
      }
    }
  });

  it('reads "Sample" for a fixture\'s figures and "test" for a turn\'s in a drafts build, as badges of their kinds', () => {
    const index = routed();
    expect(index.build.kind).toBe("drafts");
    const { face, k } = counter(index, "call");
    const region = face.regions[k];
    if (!region) throw new Error("no call region");
    const kinds = (cost: CostState): string[] => {
      const input = regionInputs(face, { index, text: null, cost })[k];
      return input ? REGISTRY[region.renderer].draw(input).flatMap((o) => (o.op === "badge" ? [o.kind] : [])) : [];
    };
    expect(kinds(state([reply("fallback", 950)]))).toEqual(["test"]);
    expect(kinds(state([reply("fallback", 950)], "fixture"))).toEqual(["sample"]);
    expect(kinds(state([]))).toEqual([]);
  });

  it("reads the index without a state: cost unavailable while live.turn is off, no call yet and $0 once it's on", () => {
    const off = fixture().index;
    for (const { face, k } of counterRegions(off))
      expect(regionInputs(face, { index: off, text: null })[k]?.lines, face.id).toEqual([off.ui["sign.unavailable"]]);
    const on = routed();
    const call = counter(on, "call");
    const visit = counter(on, "visit");
    expect(regionInputs(call.face, { index: on, text: null })[call.k]).toMatchObject({
      lines: [on.ui["sign.no_call_yet"]],
      badge: null,
    });
    expect(regionInputs(visit.face, { index: on, text: null })[visit.k]).toMatchObject({
      lines: ["$0"],
      badge: { kind: "test", text: on.ui["sign.test"] },
    });
  });

  it("redraws the counters in 3D at once on each new state, while the room is paused too", () => {
    const index = routed();
    const { scene: part } = fixture();
    const room = buildRoom(part, { avatar: "dog", label: () => new Object3D(), index });
    const faces = buildFaceQuads({
      part,
      index,
      placements: room.placements,
      doc: new JSDOM("<main></main>").window.document,
      clock: new FakeClock(),
      dpr: 1,
      level: 0,
      motion: () => ({ animate: false }),
    });
    const { face } = counter(index, "call");
    const words = (): string[] => {
      const list = faces.lists.get(face.id);
      return list ? drawnWords(list.ops) : [];
    };
    expect(words()).toContain(index.ui["sign.no_call_yet"]);
    faces.setCost(state([reply("fallback", 950)]));
    expect(words()).toContain("$0.000950 est.");
    expect(words()).toContain(`[${index.ui["sign.test"]}]`);
    // The call region itself was drawn again (the review of T268, nit 4).
    expect(words()).not.toContain(index.ui["sign.no_call_yet"]);
    faces.setCost(state([reply("fallback", 950), { kind: "failed" }]));
    expect(words()).toContain(index.ui["sign.unavailable"]);
    expect(words()).toContain("at least $0.000950 est.");
    expect(faces.quads.get(face.id)?.visible).toBe(true);
  });
});
