// T160's own test (spec 004; FR-020, FR-043, FR-051, FR-058, FR-062; R-22; contracts/tier-signal.md §2): the tier
// switch's cases as the room draws them, which T155's fake scene stands in for.
// - The claims rule, tier.ts's caseFor: a value's own case, unless it names the pose the switch's claims give local and
//   the value isn't local, or the one they give cloud and the value isn't cloud, or a pose not drawn, or none; then the
//   shared pose. The claims are the index's, never read from the cases; claims that lack local or cloud, name a pose
//   the cases don't have, or name one pose for both read as not-live; a switch without claims draws its cases (T163).
// - In 3D, src/room/scene/cables.ts through buildRoom: each case's group holds the cable's tube along compose/cable.ts's
//   16 points and its drop, from the lead's free end where the pose puts it to the `to` anchor, at the charger's
//   stylized scale, computed here from the kernel's world transforms; one tube made per pose, kept across every change
//   of case; `apply(value)` showing exactly the case the rule gives, even from an index that maps another value to the
//   plugged or the cloud pose; and each pose's glows set while it shows, the pieces' own levels back after.
// - In 2D, src/room/flat.ts's stage: the same `apply` toggles each case group's visibility, its cable curve with it.
// Expectations come from compose() over the fixture set, whose IDs are synthetic fx- ones.
import { JSDOM } from "jsdom";
import { Object3D, Vector3 } from "three";
import type { CatmullRomCurve3, Mesh, TubeGeometry } from "three";
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { CABLE_POINTS, cableRun, restPlane } from "../../src/room/compose/cable";
import { anchorWorld, mountWorld, resolveMounts } from "../../src/room/compose/mount";
import { origin } from "../../src/room/compose/math";
import type { Mat4, Vec3 } from "../../src/room/compose/math";
import { TIER_VALUES } from "../../src/room/compose/vocabulary";
import type { TierValue } from "../../src/room/compose/vocabulary";
import { renderFlat } from "../../src/room/flat";
import { CABLE_NODE } from "../../src/room/scene/cables";
import { buildRoom } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { SHARED_ORDER, caseFor } from "../../src/room/signals/tier";
import type { SwitchRule } from "../../src/room/signals/tier";
import { goodTree } from "../helpers/room-fixtures";

let composed: ComposeResult | null = null;
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));

const label = (text: string): Object3D => Object.assign(new Object3D(), { name: `label:${text}` });
const build = (index: RoomIndex = fixture().index): Room3D =>
  buildRoom(fixture().scene, { avatar: "dog", label, index });

type Cases = Record<TierValue, string>;
const DEFAULT: Cases = {
  local: "fx-plugged",
  cloud: "fx-cloud",
  resting: "fx-resting",
  budget: "fx-resting",
  unavailable: "fx-resting",
  unknown: "fx-resting",
  paused: "fx-resting",
  "not-live": "fx-resting",
};
/** The fixture plug's claims (fx-plug.yaml). */
const CLAIMS = { local: "fx-plugged", cloud: "fx-cloud" } as const;

/** The fixture's index with the first switch's cases changed. */
function remapped(change: Partial<Cases>): RoomIndex {
  const { index } = fixture();
  return {
    ...index,
    switches: index.switches.map((s, i) => (i === 0 ? { ...s, cases: { ...s.cases, ...change } } : s)),
  };
}

/** The fixture's index with the first switch's claims replaced; undefined takes them out. */
function reclaimed(claims: unknown, change: Partial<Cases> = {}): RoomIndex {
  const index = remapped(change);
  return {
    ...index,
    switches: index.switches.map((s, i) => {
      if (i !== 0) return s;
      const rest: Partial<typeof s> = { ...s };
      delete rest.claims;
      return (claims === undefined ? rest : { ...rest, claims }) as RoomIndex["switches"][number];
    }),
  };
}

function expectClose(actual: readonly number[], expected: readonly number[], eps: number, what: string): void {
  expect(actual.length, what).toBe(expected.length);
  actual.forEach((a, i) => expect(Math.abs(a - (expected[i] ?? Number.NaN)), `${what}[${i}]`).toBeLessThan(eps));
}

describe("the claims rule (tier.ts's caseFor)", () => {
  /** A switch whose piece claims fx-plugged for local and fx-cloud for cloud, as the fixture's does. */
  const claimed = (cases: Partial<Cases>, claims: unknown = CLAIMS): SwitchRule =>
    ({ cases, claims }) as unknown as SwitchRule;

  it("gives each value its own case where the claims are whole and the cases claim as the compositor requires", () => {
    for (const value of TIER_VALUES) expect(caseFor(claimed(DEFAULT), value), value).toBe(DEFAULT[value]);
    // A value with a pose of its own that claims nothing keeps it: splitting the shared pose is a data edit.
    const split = claimed({ ...DEFAULT, budget: "fx-budget" });
    expect(caseFor(split, "budget")).toBe("fx-budget");
    expect(caseFor(split, "unknown")).toBe("fx-resting");
  });

  it("shows the plugged pose only for local and the cloud pose only for cloud, whatever else maps to them", () => {
    for (const value of TIER_VALUES) {
      if (value === "local" || value === "cloud") continue;
      expect(caseFor(claimed({ ...DEFAULT, [value]: DEFAULT.local }), value), `${value} → plugged`).toBe("fx-resting");
      expect(caseFor(claimed({ ...DEFAULT, [value]: DEFAULT.cloud }), value), `${value} → cloud`).toBe("fx-resting");
    }
    expect(caseFor(claimed({ ...DEFAULT, local: DEFAULT.cloud }), "cloud")).toBe("fx-resting");
    expect(caseFor(claimed({ ...DEFAULT, cloud: DEFAULT.local }), "local")).toBe("fx-resting");
  });

  // T163: the plugged and the cloud poses come from the claims, never from the cases.
  it("takes the plugged pose from the claims: a swapped mapping never shows it for unknown", () => {
    const swapped = claimed({ ...DEFAULT, local: "fx-resting", unknown: "fx-plugged" });
    expect(caseFor(swapped, "unknown")).toBe("fx-resting");
    expect(caseFor(swapped, "local")).toBe("fx-plugged");
    expect(caseFor(swapped, "cloud")).toBe("fx-cloud");
    for (const value of TIER_VALUES)
      if (value !== "local") expect(caseFor(swapped, value), value).not.toBe("fx-plugged");
  });

  it("never leaves the switch blank where local's case names the shared pose", () => {
    // The plugged pose no case names: the claims are faulty, so every value, local too, shows the shared pose.
    const resting = claimed({ ...DEFAULT, local: "fx-resting" });
    for (const value of TIER_VALUES) expect(caseFor(resting, value), value).toBe("fx-resting");
    // The plugged pose named by another value's case: only local shows it, from the claims.
    const moved = claimed({ ...DEFAULT, local: "fx-resting", budget: "fx-plugged" });
    expect(caseFor(moved, "local")).toBe("fx-plugged");
    for (const value of TIER_VALUES)
      if (value !== "local" && value !== "cloud") expect(caseFor(moved, value), value).toBe("fx-resting");
  });

  it.each([
    ["lack local", { cloud: "fx-cloud" }],
    ["lack cloud", { local: "fx-plugged" }],
    ["name a pose the cases don't have", { local: "fx-gone", cloud: "fx-cloud" }],
    ["name one pose for both", { local: "fx-plugged", cloud: "fx-plugged" }],
    ["aren't an object", null],
  ])("reads claims that %s as not-live: the shared pose for every value, never a claimed one", (_, claims) => {
    const faulty = claimed(DEFAULT, claims);
    for (const value of TIER_VALUES) expect(caseFor(faulty, value), value).toBe("fx-resting");
  });

  // The delta review of T163, I1: claims present but not whole, crossed with mappings that swap a claimed pose into one
  // of the six shared values' cases. The shared pose is then the one RS4 would call shared, the drawn pose the claims
  // don't name that most of the six values show, ties going to the earliest of SHARED_ORDER, never the first case alone.
  const FAULTY_CLAIMS: [string, unknown][] = [
    ["null", null],
    ["empty", {}],
    ["a string", "fx-plugged"],
    ["cloud alone", { cloud: "fx-cloud" }],
    ["local alone", { local: "fx-plugged" }],
    ["a pose the cases lack", { local: "fx-gone", cloud: "fx-cloud" }],
    ["one pose for both", { local: "fx-plugged", cloud: "fx-plugged" }],
  ];
  const SWAPS: [string, Partial<Cases>][] = [
    ["as committed", {}],
    ["local and unknown swapped", { local: "fx-resting", unknown: "fx-plugged" }],
    ["cloud and unknown swapped", { cloud: "fx-resting", unknown: "fx-cloud" }],
    ["unknown on the cloud pose", { unknown: "fx-cloud" }],
    ["unknown and not-live on the plugged pose", { unknown: "fx-plugged", "not-live": "fx-plugged" }],
  ];
  it.each(FAULTY_CLAIMS.flatMap(([c, claims]) => SWAPS.map(([m, change]) => [c, m, claims, change] as const)))(
    "draws the shared pose for every value where the claims are %s and the cases %s",
    (_, __, claims, change) => {
      const faulty = claimed({ ...DEFAULT, ...change }, claims);
      for (const value of TIER_VALUES) expect(caseFor(faulty, value), value).toBe("fx-resting");
    },
  );

  it("takes the shared pose of faulty claims by count, ties going to the earliest of SHARED_ORDER", () => {
    const split: Partial<Cases> = {
      ...DEFAULT,
      unknown: "fx-a",
      "not-live": "fx-b",
      paused: "fx-a",
      resting: "fx-b",
      budget: "fx-b",
      unavailable: "fx-a",
    };
    // Three each: unknown's pose, the earliest.
    expect(caseFor(claimed(split, null), "budget")).toBe("fx-a");
    expect(caseFor(claimed({ ...split, unavailable: "fx-b" }, null), "unknown")).toBe("fx-b");
    // A pose not drawn, or one the claims name, isn't counted.
    expect(caseFor(claimed(split, null), "local", (pose) => pose !== "fx-a")).toBe("fx-b");
    expect(caseFor(claimed(split, { local: "fx-a" }), "cloud")).toBe("fx-b");
    expect(caseFor(claimed({ ...split, resting: "fx-a" }, { local: "fx-a", cloud: "fx-b" }), "paused")).toBeNull();
  });

  it("draws a switch without claims straight from its cases, since no pose is plugged", () => {
    for (const value of TIER_VALUES) expect(caseFor({ cases: DEFAULT }, value), value).toBe(DEFAULT[value]);
    const own = { cases: { ...DEFAULT, unknown: "fx-plugged", local: "fx-cloud" } };
    expect(caseFor(own, "unknown")).toBe("fx-plugged");
    expect(caseFor(own, "local")).toBe("fx-cloud");
    // A value with no case, or one not drawn, still finds the shared pose.
    const missing: Partial<Cases> = { ...DEFAULT };
    delete missing.budget;
    expect(caseFor({ cases: missing }, "budget")).toBe("fx-resting");
    expect(caseFor({ cases: DEFAULT }, "budget", (pose) => pose !== "fx-resting")).toBeNull();
  });

  it("finds the shared pose by SHARED_ORDER, past values that map to a claimed pose", () => {
    expect(SHARED_ORDER).toEqual(["unknown", "not-live", "paused", "resting", "budget", "unavailable"]);
    const faulty = claimed({ ...DEFAULT, unknown: DEFAULT.local, "not-live": DEFAULT.cloud, paused: "fx-paused" });
    expect(caseFor(faulty, "unknown")).toBe("fx-paused");
    expect(caseFor(faulty, "resting")).toBe("fx-resting");
  });

  it("falls to the shared pose for a missing case or a pose not drawn, and gives null where none is left", () => {
    const missing: Partial<Cases> = { ...DEFAULT };
    delete missing.budget;
    expect(caseFor(claimed(missing), "budget")).toBe("fx-resting");
    expect(caseFor(claimed(DEFAULT), "budget", (pose) => pose !== "fx-resting")).toBeNull();
    expect(caseFor(claimed({ ...DEFAULT, resting: "fx-gone" }), "resting", (pose) => pose !== "fx-gone")).toBe(
      "fx-resting",
    );
    expect(caseFor(claimed({}), "local")).toBeNull();
    expect(caseFor(claimed({ local: "fx-plugged", cloud: "fx-cloud" }), "unknown")).toBeNull();
  });
});

describe("the cases in 3D (scene/cables.ts)", () => {
  it("draws each case's cable as a tube along compose/cable.ts's run, from the lead's end at its pose, at the switch piece's scale", () => {
    const { scene: part } = fixture();
    const room = build();
    room.scene.updateMatrixWorld(true);
    const { world } = resolveMounts(part.placements, part.pieces);
    const anchor = (placement: string, name: string): Mat4 => {
      const p = part.placements.find((x) => x.id === placement);
      const own = p && part.pieces[p.piece];
      const at = own?.anchors[name];
      const w = world.get(placement);
      if (!p || !own || !at || !w) throw new Error(`${placement}.${name} doesn't resolve`);
      return anchorWorld(w, own.scale, at);
    };
    let tubes = 0;
    for (const sw of part.switches) {
      const c = sw.cable;
      if (!c) continue;
      const own = part.pieces[sw.piece];
      if (!own) throw new Error("no switch piece");
      for (const [name, pose] of Object.entries(sw.poses)) {
        const on = part.placements.find((p) => p.id === pose.mount.on);
        const parent = on && part.pieces[on.piece];
        const at = parent?.anchors[pose.mount.anchor];
        const w = on && world.get(on.id);
        if (!on || !parent || !at || !w) throw new Error(`${name} doesn't resolve`);
        const poseWorld = mountWorld(w, parent.scale, at, pose.mount.offset, pose.mount.turn);
        const lead = own.anchors[c.from];
        if (!lead) throw new Error("no lead anchor");
        const run = cableRun({
          from: origin(anchorWorld(poseWorld, own.scale, lead)),
          to: origin(anchor(c.to.placement, c.to.anchor)),
          sag: c.sag,
          radius: c.radius,
          scale: own.scale,
          drop: c.drop,
          rest: c.rest ? restPlane(anchor(c.rest.placement, c.rest.anchor)) : null,
        });
        const group = room.switches.get(sw.id)?.get(name);
        const tube = group?.children.find((x) => x.name === CABLE_NODE) as Mesh | undefined;
        expect(tube, name).toBeDefined();
        expect(room.cases.tubes.get(sw.id)?.get(name)).toBe(tube);
        const geometry = tube?.geometry as TubeGeometry;
        const path = geometry.parameters.path as CatmullRomCurve3;
        const expected: Vec3[] = run.drop ? [...run.points, run.drop] : [...run.points];
        expect(path.points, name).toHaveLength(CABLE_POINTS + (run.drop ? 1 : 0));
        path.points.forEach((p, i) => {
          if (!tube) throw new Error(`${name} has no tube`);
          const inWorld = new Vector3().copy(p).applyMatrix4(tube.matrixWorld);
          expectClose(inWorld.toArray(), expected[i] ?? [], 1e-9, `${name} point ${i}`);
        });
        // The binding's radius times the charger's stylized scale (FR-051).
        expect(geometry.parameters.radius, name).toBeCloseTo(c.radius * own.scale, 12);
        expect(run.radius).toBeCloseTo(c.radius * own.scale, 12);
        tubes += 1;
      }
    }
    expect(tubes).toBeGreaterThan(2);
  });

  it("makes one tube per pose, once, and keeps it across every change of case", () => {
    const room = build();
    const meshes = (): Object3D[] => {
      const out: Object3D[] = [];
      room.scene.traverse((node) => out.push(node));
      return out;
    };
    const before = meshes();
    const tubes = [...room.cases.tubes.values()].flatMap((m) => [...m.values()]);
    const geometries = tubes.map((t) => t.geometry);
    for (const value of [...TIER_VALUES, ...TIER_VALUES]) room.cases.apply(value);
    expect(meshes()).toEqual(before);
    expect([...room.cases.tubes.values()].flatMap((m) => [...m.values()])).toEqual(tubes);
    expect(tubes.map((t) => t.geometry)).toEqual(geometries);
  });

  it("shows exactly the case the claims rule gives for each value, the tube with its case", () => {
    const { index } = fixture();
    const room = build();
    const [sw] = index.switches;
    if (!sw) throw new Error("the fixture has no switch");
    const cases = room.switches.get(sw.id);
    for (const value of TIER_VALUES) {
      room.cases.apply(value);
      const visible = [...(cases?.entries() ?? [])].filter(([, g]) => g.visible).map(([name]) => name);
      expect(visible, value).toEqual([caseFor(sw, value)]);
      expect(room.cases.shown(sw.id), value).toBe(caseFor(sw, value));
      const group = cases?.get(visible[0] ?? "");
      expect(group?.children.find((x) => x.name === CABLE_NODE)?.visible, value).toBe(true);
    }
    expect(room.cases.shown("fx-no-such-switch")).toBeNull();
  });

  it("never shows the plugged or the cloud case for another value, from an index that maps it there", () => {
    const { index } = fixture();
    const [sw] = index.switches;
    if (!sw) throw new Error("the fixture has no switch");
    for (const value of TIER_VALUES) {
      if (value === "local" || value === "cloud") continue;
      for (const claimed of [sw.cases.local, sw.cases.cloud]) {
        const room = build(remapped({ [value]: claimed }));
        room.cases.apply(value);
        const visible = [...(room.switches.get(sw.id)?.entries() ?? [])].filter(([, g]) => g.visible);
        expect(
          visible.map(([name]) => name),
          `${value} → ${claimed}`,
        ).toEqual([sw.cases.unknown]);
      }
    }
    // The room starts on not-live's case by the same rule.
    const room = build(remapped({ "not-live": sw.cases.local }));
    const visible = [...(room.switches.get(sw.id)?.entries() ?? [])].filter(([, g]) => g.visible);
    expect(visible.map(([name]) => name)).toEqual([sw.cases.unknown]);
  });

  // T163 (contracts/room-bundle.md §3.1): the index's claims, never its cases, name the plugged and the cloud poses.
  it("takes the plugged and the cloud poses from the index's claims, faulty claims read as not-live", () => {
    const { index } = fixture();
    const [sw] = index.switches;
    if (!sw) throw new Error("the fixture has no switch");
    expect(sw.claims).toEqual(CLAIMS);
    const shown = (room: Room3D, value: TierValue): string | null => {
      room.cases.apply(value);
      return room.cases.shown(sw.id);
    };
    const swapped = build(remapped({ local: "fx-resting", unknown: "fx-plugged" }));
    expect(shown(swapped, "unknown")).toBe("fx-resting");
    expect(shown(swapped, "local")).toBe("fx-plugged");
    expect(shown(swapped, "cloud")).toBe("fx-cloud");
    for (const claims of [{ cloud: "fx-cloud" }, { local: "fx-plugged", cloud: "fx-plugged" }, { local: "fx-gone" }]) {
      const faulty = build(reclaimed(claims));
      for (const value of TIER_VALUES)
        expect(shown(faulty, value), `${JSON.stringify(claims)} ${value}`).toBe("fx-resting");
    }
    // A switch without claims draws its cases as they are.
    const claimless = build(reclaimed(undefined, { unknown: "fx-plugged" }));
    expect(shown(claimless, "unknown")).toBe("fx-plugged");
  });

  it("sets a pose's glows while it shows, and puts the pieces' own levels back when another case shows", () => {
    const { scene: part, index } = fixture();
    const [sw] = part.switches;
    const cases = index.switches[0]?.cases;
    if (!sw || !cases) throw new Error("the fixture has no switch");
    const glows = sw.poses[cases.local]?.glows ?? [];
    expect(glows.length).toBeGreaterThan(0);
    const room = build();
    const own = (placement: string, glow: string): number => {
      const p = part.placements.find((x) => x.id === placement);
      return (p && part.pieces[p.piece]?.glows[glow]?.level) ?? Number.NaN;
    };
    for (const g of glows) expect(room.cases.glow(g.placement, g.glow)).toBe(own(g.placement, g.glow));
    room.cases.apply("local");
    for (const g of glows) expect(room.cases.glow(g.placement, g.glow)).toBe(g.level);
    expect(glows.some((g) => g.level !== own(g.placement, g.glow))).toBe(true);
    room.cases.apply("cloud");
    for (const g of glows) expect(room.cases.glow(g.placement, g.glow)).toBe(own(g.placement, g.glow));
    // A glow nobody holds reads 0.
    expect(room.cases.glow("fx-nowhere", "fx-none")).toBe(0);
  });
});

describe("the cases in 2D (flat.ts's apply)", () => {
  const page = (): Document => new JSDOM("<main></main>").window.document as unknown as Document;

  function visibleCases(index: RoomIndex, stage: ReturnType<typeof renderFlat>, id: string): string[] {
    return [...(stage.drawing.switches.get(id)?.entries() ?? [])]
      .filter(([, g]) => g.getAttribute("visibility") === "visible")
      .map(([name]) => name);
  }

  it("toggles each case group's visibility, its cable curve with it, by the claims rule", () => {
    const { index } = fixture();
    const [sw] = index.switches;
    if (!sw) throw new Error("the fixture has no switch");
    const stage = renderFlat(page(), { room: index, avatar: "dog", select: () => undefined });
    expect(visibleCases(index, stage, sw.id)).toEqual([caseFor(sw, "not-live")]);
    for (const value of TIER_VALUES) {
      stage.apply(value);
      const shown = visibleCases(index, stage, sw.id);
      expect(shown, value).toEqual([caseFor(sw, value)]);
      const group = stage.drawing.switches.get(sw.id)?.get(shown[0] ?? "");
      expect(group?.querySelector("path[fill='none']"), value).not.toBeNull();
    }
    stage.dispose();
  });

  it("never shows the plugged or the cloud case for another value, from an index that maps it there", () => {
    const { index } = fixture();
    const [sw] = index.switches;
    if (!sw) throw new Error("the fixture has no switch");
    for (const value of ["unknown", "paused", "resting"] as const)
      for (const claimed of [sw.cases.local, sw.cases.cloud]) {
        const faulty = remapped({ [value]: claimed });
        const stage = renderFlat(page(), { room: faulty, avatar: "dog", select: () => undefined });
        stage.apply("local");
        stage.apply(value);
        expect(visibleCases(faulty, stage, sw.id), `${value} → ${claimed}`).toEqual([sw.cases["not-live"]]);
        stage.dispose();
      }
  });

  it("takes the plugged pose from the index's claims, faulty claims read as not-live, a claimless switch as it is", () => {
    const { index } = fixture();
    const [sw] = index.switches;
    if (!sw) throw new Error("the fixture has no switch");
    const shownIn = (room: RoomIndex, value: TierValue): string[] => {
      const stage = renderFlat(page(), { room, avatar: "dog", select: () => undefined });
      stage.apply(value);
      const shown = visibleCases(room, stage, sw.id);
      stage.dispose();
      return shown;
    };
    const swapped = remapped({ local: "fx-resting", unknown: "fx-plugged" });
    expect(shownIn(swapped, "unknown")).toEqual(["fx-resting"]);
    expect(shownIn(swapped, "local")).toEqual(["fx-plugged"]);
    const faulty = reclaimed({ local: "fx-plugged" });
    for (const value of TIER_VALUES) expect(shownIn(faulty, value), value).toEqual(["fx-resting"]);
    expect(shownIn(reclaimed(undefined, { unknown: "fx-plugged" }), "unknown")).toEqual(["fx-plugged"]);
  });
});
