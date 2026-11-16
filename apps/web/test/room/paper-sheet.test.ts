// T-C02 (spec 029; FR-020, FR-021; plan.md §R-C4, §R-C6): the paper the twin hands over and the visitor keeps, a drawn
// sheet with "RESUME" set diagonally across it.
// - src/room/paper.ts's layout: an off-white page, a thin rule border inset 4% of the sheet's width, and the word, the
//   UI word `paper.word`, centred and set along the sheet's diagonal from lower left to upper right, in the look's
//   `chalk` face, its ink at 3:1 or more on the page, the word's run inside the border. Its drawing on a canvas
//   context is that layout and nothing else.
// - In 3D (scene/bundle3d.ts): given a document, the sheet's two materials, the twin's and the visitor's, share one
//   canvas texture of the drawing, keep their white colour, their opacities (1 and 0, which the hand-off cross-fades),
//   and draw the sheet's front; its back is a mesh of its own, the drawing unmirrored (back-029c, Q38's recommended
//   answer, provisionally; paper-back.test.ts holds it); the drawing is made again when the chalk face's family
//   changes. Without a document, the sheet is plain, as before, white on both sides. The sheet's size and the grip's
//   are unchanged.
// - In 2D (flat.ts): each of the hand-off's three papers has its word drawn over it, through the drawing's allowlist (a
//   `text` with a matrix), centred on the paper and turned along its diagonal, shown exactly when its paper is.
import { JSDOM } from "jsdom";
import { CanvasTexture, DoubleSide, FrontSide, Object3D } from "three";
import type { Mesh, MeshBasicMaterial, Texture } from "three";
import { describe, expect, it } from "vitest";

import { contrastRatio } from "../../build/room/checks/rw";
import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { drawFlat, renderFlat } from "../../src/room/flat";
import { drawPaper, PAPER_INK, PAPER_PAGE, paperLayout } from "../../src/room/paper";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { SHEET_SIZE } from "../../src/room/scene/grip";
import { uiWord } from "../../src/room/ui-keys";
import { roomIndex } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

const W = 512;
const H = 724;

let drafts: ComposeResult | undefined;
const fixture = (): ComposeResult => (drafts ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: true }));

describe("the sheet's layout (paper.ts; FR-020)", () => {
  it("is the UI word paper.word, RESUME, in the room's words", () => {
    expect(uiWord(roomIndex().ui, "paper.word")).toBe("RESUME");
  });

  it("draws an off-white page, a thin rule border inset 4%, and the word along the diagonal, lower left to upper right", () => {
    const layout = paperLayout("RESUME", W, H);
    expect(layout.page).toBe(PAPER_PAGE);
    expect(layout.ink).toBe(PAPER_INK);
    const inset = 0.04 * W;
    expect(layout.border.x).toBeCloseTo(inset, 9);
    expect(layout.border.y).toBeCloseTo(inset, 9);
    expect(layout.border.w).toBeCloseTo(W - 2 * inset, 9);
    expect(layout.border.h).toBeCloseTo(H - 2 * inset, 9);
    expect(layout.border.width).toBeGreaterThan(0);
    expect(layout.border.width).toBeLessThanOrEqual(0.01 * W);
    // Canvas and SVG run y down, so lower left to upper right turns by minus the diagonal's angle.
    expect(layout.word.angle).toBeCloseTo(-Math.atan2(H, W), 9);
    expect([layout.word.x, layout.word.y]).toEqual([W / 2, H / 2]);
    expect(layout.word.text).toBe("RESUME");
    expect(layout.word.size).toBeGreaterThan(0);
    // The word's run, at the layout's estimate of its advance, lies inside the border along the diagonal.
    expect(layout.word.run).toBeLessThan(Math.hypot(layout.border.w, layout.border.h));
    expect(layout.word.run).toBeGreaterThan(0.5 * Math.hypot(W, H));
  });

  it("holds its ink at 3:1 or more against the page", () => {
    expect(contrastRatio(PAPER_INK, PAPER_PAGE)).toBeGreaterThanOrEqual(3);
  });

  it("draws exactly its layout on a canvas context: the page, the border, then the word turned about its centre", () => {
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_t, name: string) =>
          (...args: unknown[]) =>
            calls.push(`${name}(${args.map(String).join(", ")})`),
        set: (_t, name: string, value: unknown) => {
          calls.push(`${name}=${String(value)}`);
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    const layout = paperLayout("RESUME", W, H);
    drawPaper(ctx, layout, W, H, "Patrick Hand, cursive");
    expect(calls).toContain(`fillStyle=${PAPER_PAGE}`);
    expect(calls).toContain(`fillRect(0, 0, ${W}, ${H})`);
    expect(calls).toContain(`strokeStyle=${PAPER_INK}`);
    expect(calls.some((c) => c.startsWith("strokeRect("))).toBe(true);
    expect(calls).toContain(`translate(${W / 2}, ${H / 2})`);
    expect(calls).toContain(`rotate(${layout.word.angle})`);
    expect(calls.some((c) => c.startsWith("font=") && c.includes("Patrick Hand"))).toBe(true);
    expect(calls.some((c) => c.startsWith("fillText(RESUME, 0, "))).toBe(true);
    expect(calls.indexOf(`fillRect(0, 0, ${W}, ${H})`)).toBeLessThan(calls.findIndex((c) => c.startsWith("fillText(")));
  });
});

describe("the sheet in 3D (scene/bundle3d.ts; FR-020)", () => {
  const build = (paper?: Parameters<typeof buildRoom>[1]["paper"]) => {
    const { scene: part, index } = fixture();
    return buildRoom(part, { avatar: "dog", label: () => new Object3D(), index, ...(paper ? { paper } : {}) });
  };

  it("gives both materials one canvas texture of the drawing, keeping their colour and opacities, on the front", () => {
    const doc = new JSDOM("<main></main>").window.document;
    const { paper } = build({ doc });
    const twin = paper.atTwin as MeshBasicMaterial;
    const visitor = paper.atVisitor as MeshBasicMaterial;
    expect(twin.map).toBeInstanceOf(CanvasTexture);
    expect(visitor.map).toBe(twin.map);
    const canvas = twin.map?.image as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([W, H]);
    for (const [m, opacity] of [
      [twin, 1],
      [visitor, 0],
    ] as const) {
      expect(m.color.getHexString()).toBe("ffffff");
      expect(m.opacity).toBe(opacity);
      expect(m.transparent).toBe(true);
      // The front only: the back is drawn by a mesh of its own, unmirrored (paper-back.test.ts).
      expect(m.side).toBe(FrontSide);
    }
    // The sheet's size is the grip's, unchanged.
    const params = (paper.sheet.geometry as unknown as { parameters: { width: number; height: number } }).parameters;
    expect([params.width, params.height]).toEqual([...SHEET_SIZE]);
    expect(W / H).toBeCloseTo(SHEET_SIZE[0] / SHEET_SIZE[1], 2);
  });

  it("is plain without a document, as before", () => {
    const { paper } = build();
    expect((paper.atTwin as MeshBasicMaterial).map).toBeNull();
    expect((paper.atVisitor as MeshBasicMaterial).map).toBeNull();
    // White on both sides, one mesh each, as before.
    for (const m of [paper.atTwin, paper.atVisitor]) expect(m.side).toBe(DoubleSide);
    expect([paper.sheet.children, paper.kept.children]).toEqual([[], []]);
  });

  it("draws the word in the chalk face's family, and again when that family changes", () => {
    const dom = new JSDOM("<main></main>");
    const fonts: string[] = [];
    const fillTexts: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_t, name: string) =>
          (...args: unknown[]) => {
            if (name === "fillText") fillTexts.push(String(args[0]));
          },
        set: (_t, name: string, value: unknown) => {
          if (name === "font") fonts.push(String(value));
          return true;
        },
      },
    );
    dom.window.HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
    let family: string | null = null;
    const listeners: (() => void)[] = [];
    const typefaces = {
      family: (use: string) => (use === "chalk" ? family : null),
      onChange: (fn: () => void) => {
        listeners.push(fn);
        return () => undefined;
      },
    };
    const { paper } = build({ doc: dom.window.document, typefaces });
    expect(fillTexts).toEqual(["RESUME"]);
    family = "Patrick Hand, cursive";
    // Every map the sheets draw with, the backs' too (back-029c), is uploaded again.
    const maps = new Set<Texture>();
    for (const root of [paper.sheet, paper.kept])
      root.traverse((node) => {
        const map = ((node as Partial<Mesh>).material as MeshBasicMaterial | undefined)?.map;
        if (map) maps.add(map);
      });
    expect(maps.size).toBeGreaterThan(1);
    const versions = new Map([...maps].map((map) => [map, map.version]));
    for (const fn of listeners) fn();
    expect(fillTexts).toEqual(["RESUME", "RESUME"]);
    expect(fonts.at(-1)).toContain("Patrick Hand");
    for (const [map, version] of versions) expect(map.version).toBeGreaterThan(version);
  });
});

describe("the sheet in 2D (flat.ts; FR-020)", () => {
  const doc = (): Document => new JSDOM("<main></main>").window.document;

  it("draws the word over each of the three papers, centred and turned along its diagonal, through the allowlist", () => {
    const { index } = fixture();
    const drawing = drawFlat(doc(), index, "dog");
    expect(drawing.paperFaces).toHaveLength(3);
    drawing.paperFaces.forEach((face, k) => {
      const paper = drawing.papers[k];
      const num = (name: string): number => Number(paper?.getAttribute(name));
      const [cx, cy] = [num("x") + num("width") / 2, num("y") + num("height") / 2];
      const text = face.querySelector("text");
      expect(text?.textContent).toBe("RESUME");
      expect(text?.getAttribute("text-anchor")).toBe("middle");
      expect(text?.getAttribute("fill")).toBe(PAPER_INK);
      const m = /^matrix\((\S+) (\S+) (\S+) (\S+) (\S+) (\S+)\)$/.exec(text?.getAttribute("transform") ?? "");
      const [a, b, c, d, e, f] = (m?.slice(1) ?? []).map(Number);
      const angle = -Math.atan2(num("height"), num("width"));
      expect(a).toBeCloseTo(Math.cos(angle), 9);
      expect(b).toBeCloseTo(Math.sin(angle), 9);
      expect(c).toBeCloseTo(-Math.sin(angle), 9);
      expect(d).toBeCloseTo(Math.cos(angle), 9);
      expect(e).toBeCloseTo(cx, 9);
      expect(f).toBeCloseTo(cy, 9);
      // Drawn over its paper: after it in the drawing's order.
      expect(paper && paper.compareDocumentPosition(face) & 4).toBe(4);
    });
  });

  it("shows each paper's word exactly when its paper shows", () => {
    const d = new JSDOM("<main></main>").window.document;
    const stage = renderFlat(d, { room: fixture().index, avatar: "dinosaur", select: () => undefined });
    const same = (): boolean =>
      stage.drawing.papers.every(
        (p, k) => p.getAttribute("visibility") === stage.drawing.paperFaces[k]?.getAttribute("visibility"),
      );
    expect(same()).toBe(true);
    for (const at of [0, 0.4, 0.9, 1]) {
      stage.showHandoff(at);
      expect(same()).toBe(true);
    }
  });
});
