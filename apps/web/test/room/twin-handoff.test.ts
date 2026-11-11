// T044 (spec 016; FR-031 to FR-033; plan.md R-10; contracts/twin-states.md §5; SC-006): the paper appearing with the
// visitor while the twin shows its own picture, in src/room/scene/avatars.ts and bundle3d.ts, and in the 2D room.
// - With the twin's own model shown at the hand-off's start: no frame shows the twin's sheet, the visitor's sheet's
//   opacity is the progress, the visitor plays "idle-holding" from the start and never "take", and the twin arrives.
// - Under reduced motion the same fade, with no turns.
// - With the stand-in at the start, spec 009's hand-off stands (avatar-handoff.test.ts holds it unchanged).
// - In 2D, while the still shows, the paper is in the visitor's hands in every frame.
import { Object3D } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { createAvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { renderFlat } from "../../src/room/flat";
import type { FigureSignal } from "../../src/room/stage";
import { avatarClips, avatarGlb } from "../helpers/glb";
import { flush } from "../helpers/room";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, SCENE, sceneWith } from "../helpers/room-avatars";
import { TWIN_ROLES, twinDefaults, twinFolder, twinPolicy } from "../helpers/room-twin";

let result: ComposeResult;
beforeAll(() => {
  result = compose(
    overlay({
      [SCENE]: sceneWith({ twin_stand_in: "man" }),
      ...avatarFolder("man"),
      ...avatarFolder("woman"),
      ...twinFolder(),
    }),
    twinPolicy(),
    { mode: "lenient", drafts: false },
  );
});

const loader = new GLTFLoader();
const parsed = async (bytes: Uint8Array): Promise<Object3D> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).scene;
const clipsOf = async (bytes: Uint8Array): Promise<AnimationClip[]> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).animations;

async function setup(o: { twinOwn: boolean }) {
  const part = result.scene;
  const room = buildRoom(part, { avatar: "woman", label: () => new Object3D(), index: result.index });
  const signals: FigureSignal[] = [];
  let now = 0;
  const figures = createAvatarFigures(room, part, {
    chosen: "woman",
    signal: (s) => signals.push(s),
    clock: () => now,
  });
  if (o.twinOwn) {
    expect(figures.model("twin", await parsed(twinDefaults().model))).toBe(true);
    for (const role of TWIN_ROLES) figures.clip("twin", role, await clipsOf(twinDefaults().clips[role] as Uint8Array));
  } else {
    figures.missed("twin", null, "failed");
    expect(figures.model("man", await parsed(avatarGlb().bytes))).toBe(true);
    figures.clip("man", "idle", await clipsOf(avatarClips().idle.bytes));
  }
  expect(figures.model("woman", await parsed(avatarGlb().bytes))).toBe(true);
  for (const role of ["idle", "idle-holding", "take"] as const)
    figures.clip("woman", role, await clipsOf(avatarClips()[role].bytes));
  return { room, figures, signals, at: (ms: number) => (now = ms) };
}

describe("the paper appearing with the visitor (FR-031; SC-006)", () => {
  it.each([false, true])(
    "never shows the twin's sheet, and fades the visitor's in with the progress (reduced motion %s)",
    async (reduced) => {
      const s = await setup({ twinOwn: true });
      s.figures.update(16, !reduced, 0);
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        s.at(p * 4500);
        s.figures.showHandoff(p, reduced, reduced ? 1000 : 4500);
        s.figures.update(16, !reduced, 0);
        expect(s.room.paper.atTwin.opacity, `at ${p}`).toBe(0);
        expect(s.room.paper.atVisitor.opacity, `at ${p}`).toBeCloseTo(p, 6);
        expect(s.figures.playing("visitor"), `at ${p}`).toBe("idle-holding");
      }
      if (reduced) expect([s.room.twin.rotation.y, s.room.visitor.rotation.y]).toEqual([0, 0]);
      expect(s.signals.some((x) => x.kind === "clip" && x.figure === "visitor" && x.role === "take")).toBe(false);
      // The twin arrives, its greeting at the hand-off's start.
      expect(s.signals).toContainEqual({ kind: "twin-state", state: "arriving", role: "greeting" });
      s.figures.handoffEnded();
      expect(s.figures.playing("visitor")).toBe("idle-holding");
    },
  );

  it("keeps spec 009's hand-off with the stand-in in the twin's figure: the sheet travels from the twin", async () => {
    const s = await setup({ twinOwn: false });
    s.figures.update(16, true, 0);
    s.figures.showHandoff(0.5, false);
    expect(s.room.paper.atTwin.opacity).toBe(1);
    expect(s.room.paper.atVisitor.opacity).toBe(0);
  });
});

describe("the paper appearing in the 2D room (FR-031; contracts/twin-states.md §6)", () => {
  it("is in the visitor's hands in every frame while the still shows, and travels with the drawing", async () => {
    const index = result.index;
    const still = index.twin?.still;
    if (!still) throw new Error("no still");
    const bytes = twinDefaults().still;
    const doc = new JSDOM("<main></main>").window.document;
    const flat = renderFlat(doc, {
      room: index,
      avatar: "woman",
      select: () => undefined,
      fetch: () =>
        Promise.resolve({ status: 200, arrayBuffer: () => Promise.resolve(bytes.slice().buffer) } as Response),
    });
    const papers = (): string[] => flat.drawing.papers.map((p) => p.getAttribute("visibility") ?? "");
    flat.showHandoff(0);
    expect(papers()[0]).toBe("visible");
    for (let i = 0; i < 4; i += 1) await flush();
    for (const p of [0, 0.5, 1]) {
      flat.showHandoff(p);
      expect(papers().at(-1), `at ${p}`).toBe("visible");
      expect(
        papers()
          .slice(0, -1)
          .every((v) => v === "hidden"),
        `at ${p}`,
      ).toBe(true);
    }
  });
});
