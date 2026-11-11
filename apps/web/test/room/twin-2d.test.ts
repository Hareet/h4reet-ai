// T048 (spec 016; FR-034, FR-035, FR-014; plan.md R-11; contracts/twin-states.md §6; SC-010): the twin's still in the 2D
// room, src/room/flat.ts's renderFlat, on a jsdom page whose fetch the test answers.
// - Fetched once, same-origin with its integrity, when the 2D room shows; drawn as an SVG image whose href is a data:
//   URL of the verified bytes, at the still's rectangle in the view box, `xMidYMin slice`, under a clipPath of the twin
//   figure's projected box; the twin's drawing hidden while it shows; its picture signalled `still`.
// - On a failure after one retry, the drawing again, signalled `drawing`, which the line slot reads as the stand-in line.
// - The hit areas and the figures' boxes unchanged.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { renderFlat } from "../../src/room/flat";
import type { FigureSignal } from "../../src/room/stage";
import { REPO, flush, repositoryBundle } from "../helpers/room";

const { index } = repositoryBundle({ drafts: false, policy: "empty", readiness: "tree" });
const STILL = new Uint8Array(readFileSync(join(REPO, "assets/twin/still.png")));
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
const integrityOf = (data: Uint8Array): string => `sha256-${createHash("sha256").update(data).digest("base64")}`;

interface Fetched {
  url: string;
  init: RequestInit;
}

function stage(answer: (n: number) => { status: number; body: Uint8Array } | Error) {
  const doc = new JSDOM("<main></main>", { url: "http://127.0.0.1:18105/" }).window.document;
  const fetched: Fetched[] = [];
  const signals: FigureSignal[] = [];
  const flat = renderFlat(doc, {
    room: index,
    avatar: "woman",
    select: () => undefined,
    fetch: (url, init) => {
      fetched.push({ url, init });
      const a = answer(fetched.length);
      if (a instanceof Error) return Promise.reject(a);
      return Promise.resolve({
        status: a.status,
        arrayBuffer: () => Promise.resolve(a.body.slice().buffer),
      } as Response);
    },
    onFigure: (s) => signals.push(s),
  });
  doc.body.append(flat.element);
  return { doc, flat, fetched, signals };
}

describe("the twin's still in the 2D room (FR-034, FR-035; SC-010)", () => {
  it("is bundled with its view-box rectangle and the twin's placement", () => {
    expect(index.twin?.still).toMatchObject({ bytes: STILL.length });
    expect(index.twin?.still?.view).toHaveLength(4);
    expect(typeof index.twin?.still?.placement).toBe("string");
  });

  it("is fetched once, same-origin with its integrity, and drawn as a data: image, clipped, the drawing hidden", async () => {
    const s = stage(() => ({ status: 200, body: STILL }));
    for (let i = 0; i < 40 && s.signals.length === 0; i += 1) await flush();
    expect(s.fetched.map((f) => f.url)).toEqual([index.twin?.still?.url]);
    expect(s.fetched[0]?.init).toMatchObject({ mode: "same-origin", redirect: "error", integrity: integrityOf(STILL) });
    const image = s.flat.element.querySelector("image");
    expect(image?.getAttribute("href")).toBe(`data:image/png;base64,${b64(STILL)}`);
    expect(image?.getAttribute("preserveAspectRatio")).toBe("xMidYMin slice");
    const [x, y, w, h] = index.twin?.still?.view ?? [];
    expect([
      image?.getAttribute("x"),
      image?.getAttribute("y"),
      image?.getAttribute("width"),
      image?.getAttribute("height"),
    ]).toEqual([x, y, w, h].map(String));
    const clip = s.flat.element.querySelector("clipPath rect");
    const [fx, fy, fw, fh] = index.flat.figures[0] ?? [];
    expect([
      clip?.getAttribute("x"),
      clip?.getAttribute("y"),
      clip?.getAttribute("width"),
      clip?.getAttribute("height"),
    ]).toEqual([fx, fy, fw, fh].map(String));
    expect(image?.parentElement?.getAttribute("clip-path")).toBe(`url(#${clip?.parentElement?.id})`);
    expect(s.signals).toContainEqual({ kind: "picture", figure: "twin", shows: "still", why: null });
    expect(s.flat.drawing.twinDrawing?.getAttribute("visibility")).toBe("hidden");
  });

  it("falls back to the drawing after one retry, signalled as the drawing, the hit areas unchanged", async () => {
    const s = stage(() => ({ status: 404, body: new Uint8Array() }));
    for (let i = 0; i < 40 && s.signals.length === 0; i += 1) await flush();
    expect(s.fetched).toHaveLength(2);
    expect(s.flat.element.querySelector("image")).toBeNull();
    expect(s.signals).toContainEqual({ kind: "picture", figure: "twin", shows: "drawing", why: "failed" });
    expect(s.flat.drawing.twinDrawing?.getAttribute("visibility")).not.toBe("hidden");
  });

  it("refuses bytes that fail their integrity: the drawing, never the image", async () => {
    const s = stage(() => ({ status: 200, body: new Uint8Array([1, 2, 3]) }));
    // Two tries, each through the digest, which settles over several ticks.
    for (let i = 0; i < 40 && s.signals.length === 0; i += 1) await flush();
    expect(s.flat.element.querySelector("image")).toBeNull();
    expect(s.signals.at(-1)).toEqual({ kind: "picture", figure: "twin", shows: "drawing", why: "failed" });
  });

  it("fetches nothing without a still in the index, or without a fetch", async () => {
    const doc = new JSDOM("<main></main>").window.document;
    const flat = renderFlat(doc, { room: { ...index, twin: null }, avatar: "woman", select: () => undefined });
    await flush();
    expect(flat.element.querySelector("image")).toBeNull();
  });
});
