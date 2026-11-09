// T066's switch half (spec 004; FR-020, FR-043, FR-051, FR-058; R-22; data-model.md §4.4; contracts/room-data-files.md
// §5.4, §13.4): the kernel's cable (T072), and the compositor's RS1 to RS6 on the fixtures' laptop switch (T078).
// - The run the room draws from the shown case's lead end to the `to` anchor: 16 points along the straight line
//   lowered by sag × span × 4t(1 − t), its centreline clamped a tube's radius above the `rest` plane, then the `drop`
//   behind the edge, its radius times the switch piece's stylized scale. Moving the parent, the laptop's stand, or the
//   desk needs no re-export: only the pose decides where the lead's end is.
// - The rules: a case for every tier value and no default on a piece that claims values, a default covering the rest
//   on one that claims none (RS1); the poses its claims name, one pose claiming local and one cloud, and no placement
//   of the switch's piece (RS2); only local showing the plugged pose and only cloud the cloud pose, and a piece's claims
//   naming a pose for local and one for cloud that the switch's cases show, a claimless switch left to RS1 (RS3; T163's
//   cases); the six other values on one shared pose that claims nothing (RS4); nothing but the local case sitting where
//   the plug goes in, nor two poses with different claims within 1 mm and 1° where the world places them (RS5); a cable
//   from an anchor of the switch's piece (RS6). No reason names a pose.
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import type { Finding } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { CABLE_POINTS, cableControl, cableRun, restPlane } from "../../src/room/compose/cable";
import { multiply, rotation, transformPoint, translation } from "../../src/room/compose/math";
import type { Vec3 } from "../../src/room/compose/math";
import { TIER_VALUES } from "../../src/room/compose/vocabulary";
import { goodFiles, overlay } from "../helpers/room-fixtures";

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-12, what = ""): void {
  expect(actual.length, what).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    const [a, e] = [actual[i] ?? Number.NaN, expected[i] ?? Number.NaN];
    expect(Math.abs(a - e), `${what}[${i}]: ${a} against ${e}`).toBeLessThanOrEqual(tolerance);
  }
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const span = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

describe("the cable's run (compose/cable.ts)", () => {
  const from: Vec3 = [-0.3, 0.95, -1.3];
  const to: Vec3 = [0.2, 0.75, -1.79];

  it("samples 16 points from the cable's free end to the anchor, lowered by sag × span × 4t(1 − t)", () => {
    expect(CABLE_POINTS).toBe(16);
    const run = cableRun({ from, to, sag: 0.2, radius: 0.004, scale: 1, drop: 0, rest: null });
    expect(run.points).toHaveLength(16);
    expectClose(run.points[0] ?? [], from);
    expectClose(run.points[15] ?? [], to);
    const s = span(from, to);
    run.points.forEach((p, i) => {
      const t = i / 15;
      const straight = lerp(from, to, t);
      expectClose(p, [straight[0], straight[1] - 0.2 * s * 4 * t * (1 - t), straight[2]], 1e-12, `point ${i}`);
    });
    // No sag: the straight line.
    const taut = cableRun({ from, to, sag: 0, radius: 0.004, scale: 1, drop: 0, rest: null });
    taut.points.forEach((p, i) => expectClose(p, lerp(from, to, i / 15), 1e-12, `taut ${i}`));
  });

  it("takes its radius times the switch piece's stylized scale, and falls by the drop behind the anchor", () => {
    const run = cableRun({ from, to, sag: 0.1, radius: 0.004, scale: 2.5, drop: 0.1, rest: null });
    expect(run.radius).toBeCloseTo(0.01, 15);
    expectClose(run.drop ?? [], [to[0], to[1] - 0.1, to[2]]);
    expect(cableRun({ from, to, sag: 0.1, radius: 0.004, scale: 1, drop: 0, rest: null }).drop).toBeNull();
  });

  it("never dips below the rest plane, so a cable lying on a surface lies on it", () => {
    const surface = restPlane(translation([0, 0.75, -1.5]));
    expectClose(surface.point, [0, 0.75, -1.5]);
    expectClose(surface.normal, [0, 1, 0]);
    // Both ends on the surface: the whole tube lies on it, its centreline the tube's radius above it (0.004 m × 1).
    const flat = cableRun({
      from: [-0.3, 0.75, -1.3],
      to,
      sag: 0.3,
      radius: 0.004,
      scale: 1,
      drop: 0.12,
      rest: surface,
    });
    for (const p of flat.points) expect(p[1]).toBeCloseTo(0.754, 15);
    // The drop still falls behind the edge, below the surface.
    expect(flat.drop?.[1]).toBeCloseTo(0.63, 15);
    // From above it: the sag reaches the surface and goes no lower; the points above it keep their sag.
    const high = cableRun({ from, to, sag: 0.5, radius: 0.004, scale: 1, drop: 0, rest: surface });
    const free = cableRun({ from, to, sag: 0.5, radius: 0.004, scale: 1, drop: 0, rest: null });
    let clamped = 0;
    high.points.forEach((p, i) => {
      const f = free.points[i] ?? [0, 0, 0];
      if (f[1] < 0.754) {
        clamped += 1;
        expectClose(p, [f[0], 0.754, f[2]], 1e-12, `clamped ${i}`);
      } else expectClose(p, f, 0, `free ${i}`);
    });
    expect(clamped).toBeGreaterThan(0);
  });

  it("holds the centreline a tube's radius off the rest plane, the binding's times the piece's scale (words-6)", () => {
    // Lying on a level surface: 0.004 m × 2.5 above it, so the tube rests on it rather than sinking half into it.
    const surface = restPlane(translation([0, 0.75, -1.5]));
    const lying = cableRun({
      from: [-0.3, 0.75, -1.3],
      to,
      sag: 0.3,
      radius: 0.004,
      scale: 2.5,
      drop: 0,
      rest: surface,
    });
    for (const p of lying.points) expect(p[1]).toBeCloseTo(0.76, 15);
    // Along a tilted plane's normal: never under the radius, and resting on the plane where the sag reaches it.
    const tilted = restPlane(multiply(translation([0, 0.8, -1.5]), rotation({ x: 20, y: 0, z: 0 })));
    const n = tilted.normal;
    const run = cableRun({
      from: [-0.4, 1.2, -1.2],
      to: [0.4, 0.9, -1.8],
      sag: 0.5,
      radius: 0.004,
      scale: 2.5,
      drop: 0,
      rest: tilted,
    });
    const heights = run.points.map(
      (p) => (p[0] - tilted.point[0]) * n[0] + (p[1] - tilted.point[1]) * n[1] + (p[2] - tilted.point[2]) * n[2],
    );
    for (const d of heights) expect(d).toBeGreaterThanOrEqual(0.01 - 1e-12);
    expect(Math.min(...heights)).toBeCloseTo(0.01, 12);
  });

  it("clamps along a tilted rest plane's normal", () => {
    const tilted = restPlane(multiply(translation([0, 0.8, -1.5]), rotation({ x: 20, y: 0, z: 0 })));
    const n = tilted.normal;
    expect(Math.hypot(...n)).toBeCloseTo(1, 15);
    const run = cableRun({
      from: [-0.4, 1.2, -1.2],
      to: [0.4, 0.9, -1.8],
      sag: 0.5,
      radius: 0.004,
      scale: 1,
      drop: 0,
      rest: tilted,
    });
    for (const p of run.points) {
      const d = (p[0] - tilted.point[0]) * n[0] + (p[1] - tilted.point[1]) * n[1] + (p[2] - tilted.point[2]) * n[2];
      expect(d).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it("gives the quadratic curve the unclamped run is, for the 2D drawing's {from, control, to}", () => {
    const control = cableControl(from, to, 0.2);
    const run = cableRun({ from, to, sag: 0.2, radius: 0.004, scale: 1, drop: 0, rest: null });
    run.points.forEach((p, i) => {
      const t = i / 15;
      const q: Vec3 = [0, 1, 2].map(
        (k) => (1 - t) ** 2 * (from[k] ?? 0) + 2 * t * (1 - t) * (control[k] ?? 0) + t ** 2 * (to[k] ?? 0),
      ) as unknown as Vec3;
      expectClose(p, q, 1e-12, `Bézier ${i}`);
    });
  });
});

const SCENE = "apps/web/room/scene.yaml";
const PLUG = "apps/web/room/catalog/fx-plug.yaml";
const decoder = new TextDecoder();

type Doc = Record<string, unknown>;
const at = (doc: Doc, ...keys: (string | number)[]): Doc => {
  let node: unknown = doc;
  for (const k of keys) node = (node as Record<string, unknown>)[String(k)];
  return node as Doc;
};
/** The fixtures' one switch, `switches[0]`, in a scene document. */
const power = (scene: Doc): Doc => at(scene, "switches", 0);

/** The known-good set with the scene and the plug's catalog entry changed as values, composed strictly: its RS
 *  findings, and each as `<rule> <file>:<path>`. */
function rs(change: { scene?: (d: Doc) => void; plug?: (d: Doc) => void }): { seen: string[]; found: Finding[] } {
  const edited: Record<string, string> = {};
  for (const [file, edit] of [
    [SCENE, change.scene],
    [PLUG, change.plug],
  ] as const) {
    if (!edit) continue;
    const doc = parse(decoder.decode(goodFiles().get(file))) as Doc;
    edit(doc);
    edited[file] = stringify(doc);
  }
  const found = compose(overlay(edited), noPolicy(), { mode: "strict", drafts: true }).findings.filter((f) =>
    f.rule.startsWith("RS"),
  );
  return { seen: found.map((f) => `${f.rule} ${f.file}:${f.path}`), found };
}

/** The six values FR-043 gives one shared pose (Q2), unknown first. */
const SHARED = ["unknown", "paused", "not-live", "resting", "budget", "unavailable"] as const;

describe("the switches' rules on the fixtures (RS1 to RS6)", () => {
  it("accept the known-good switch: a case for each tier value, the claims' poses, the plug alone in the port", () => {
    expect(rs({}).seen).toEqual([]);
  });

  describe("RS1: the cases cover the tier's values", () => {
    it("refuses a case for a value the tier doesn't have", () => {
      expect(rs({ scene: (d) => (at(power(d), "cases").asleep = "fx-resting") }).seen).toEqual([
        `RS1 ${SCENE}:switches[0].cases.asleep`,
      ]);
    });

    it("refuses, for a piece that claims values, a value without a case, and a default", () => {
      const missing = rs({
        scene: (d) => {
          delete at(power(d), "cases").budget;
          delete at(power(d), "cases").unknown;
        },
      });
      expect(missing.seen).toEqual([`RS1 ${SCENE}:switches[0].cases`, `RS1 ${SCENE}:switches[0].cases`]);
      expect(missing.found.map((f) => f.reason).sort()).toEqual([
        "no case for the tier value budget",
        "no case for the tier value unknown",
      ]);
      expect(rs({ scene: (d) => (power(d).default = "fx-resting") }).seen).toEqual([
        `RS1 ${SCENE}:switches[0].default`,
      ]);
    });

    it("lets a default cover the values a piece that claims nothing has no case for, and refuses one left bare", () => {
      const unclaimed =
        (keepDefault: boolean) =>
        (d: Doc): void => {
          for (const value of SHARED) delete at(power(d), "cases")[value];
          if (keepDefault) power(d).default = "fx-resting";
        };
      const noClaims = (d: Doc): void => {
        delete d.claims;
      };
      expect(rs({ scene: unclaimed(true), plug: noClaims }).seen).toEqual([]);
      const bare = rs({ scene: unclaimed(false), plug: noClaims });
      expect(bare.seen).toEqual(SHARED.map(() => `RS1 ${SCENE}:switches[0].cases`));
      expect(bare.found.map((f) => f.reason).sort()).toEqual(
        [...SHARED].sort().map((value) => `neither a case nor the default covers the tier value ${value}`),
      );
    });

    it("refuses a switch on turn-cost as the scene is read", () => {
      expect(rs({ scene: (d) => (power(d).signal = "turn-cost") }).seen).toEqual([`RS1 ${SCENE}:switches[0].signal`]);
    });
  });

  describe("RS2: the poses are the claims' own, and the switch alone places its piece", () => {
    it("refuses a pose the claims don't name, and a pose the claims name that the switch lacks", () => {
      const renamed = rs({
        scene: (d) => {
          const poses = at(power(d), "poses");
          poses["fx-away"] = poses["fx-cloud"];
          delete poses["fx-cloud"];
          at(power(d), "cases").cloud = "fx-away";
        },
      });
      expect(renamed.seen).toEqual([
        `RS2 ${SCENE}:switches[0].poses.fx-away`,
        `RS2 ${SCENE}:switches[0].poses.fx-cloud`,
      ]);
    });

    it("refuses a placement of the switch's piece", () => {
      const placed = rs({
        scene: (d) => {
          (d.placements as Doc[]).push({
            id: "fx-spare-plug",
            piece: "fx-plug",
            mount: { on: "fx-desk", anchor: "top" },
          });
        },
      });
      expect(placed.seen).toEqual([`RS2 ${SCENE}:placements[9].piece`]);
    });

    it("refuses two poses claiming one value, in the catalog", () => {
      const twice = rs({ plug: (d) => (at(d, "claims", "poses")["fx-resting"] = "local") });
      expect(twice.seen).toContain(`RS2 ${PLUG}:claims.poses.fx-resting`);
    });

    it("refuses claims that give no pose local, or none cloud, so the plugged and the cloud poses are named (words-2)", () => {
      // The edit that would silence RS4 with the plug in the port: the plugged pose claims nothing, and the six values
      // that share a pose show it.
      const unplugged = rs({
        plug: (d) => (at(d, "claims", "poses")["fx-plugged"] = null),
        scene: (d) => {
          for (const value of SHARED) at(power(d), "cases")[value] = "fx-plugged";
        },
      });
      // RS3 refuses the switch too, since its piece's claims name no pose for local (T163; RS3's own case below).
      expect(unplugged.seen).toEqual([`RS2 ${PLUG}:claims.poses`, `RS3 ${SCENE}:switches[0].cases`]);
      expect(unplugged.found[0]?.reason).toBe("no pose claims local, so none is known as the plugged pose");
      const clouded = rs({ plug: (d) => (at(d, "claims", "poses")["fx-cloud"] = null) });
      expect(clouded.seen).toEqual([`RS2 ${PLUG}:claims.poses`, `RS3 ${SCENE}:switches[0].cases`]);
      expect(clouded.found[0]?.reason).toBe("no pose claims cloud, so none is known as the cloud pose");
      const neither = rs({
        plug: (d) => (at(d, "claims").poses = { "fx-plugged": null, "fx-cloud": null, "fx-resting": null }),
      });
      expect(neither.seen).toEqual([
        `RS2 ${PLUG}:claims.poses`,
        `RS2 ${PLUG}:claims.poses`,
        `RS3 ${SCENE}:switches[0].cases`,
        `RS3 ${SCENE}:switches[0].cases`,
      ]);
      // Claims of the committed charger's shape, one pose local, one cloud, and one nothing, are the known-good set's.
      expect(rs({}).seen).toEqual([]);
    });
  });

  describe("RS3: only local shows the plugged pose, and only cloud the cloud pose", () => {
    it.each(TIER_VALUES.filter((v) => v !== "local"))("refuses %s on the plugged pose", (value) => {
      const shown = rs({ scene: (d) => (at(power(d), "cases")[value] = "fx-plugged") });
      expect(shown.seen).toContain(`RS3 ${SCENE}:switches[0].cases.${value}`);
      expect(shown.found.find((f) => f.rule === "RS3")?.reason).toBe("shows a pose that claims local");
    });

    it.each(TIER_VALUES.filter((v) => v !== "cloud"))("refuses %s on the cloud pose", (value) => {
      expect(rs({ scene: (d) => (at(power(d), "cases")[value] = "fx-cloud") }).seen).toContain(
        `RS3 ${SCENE}:switches[0].cases.${value}`,
      );
    });

    it("leaves a case showing a pose the switch lacks to RI4 and RS2", () => {
      const lacking = rs({
        scene: (d) => {
          delete at(power(d), "poses")["fx-cloud"];
          at(power(d), "cases").budget = "fx-cloud";
        },
      });
      expect(lacking.seen.filter((s) => s.startsWith("RS3"))).toEqual([]);
      expect(lacking.seen).toContain(`RS2 ${SCENE}:switches[0].poses.fx-cloud`);
    });

    it("refuses a case that passes over the pose claiming its value", () => {
      const passed = rs({ scene: (d) => (at(power(d), "cases").cloud = "fx-resting") });
      expect(passed.seen).toEqual([`RS3 ${SCENE}:switches[0].cases.cloud`]);
      expect(passed.found[0]?.reason).toBe("shows another pose than the one that claims cloud");
    });

    // T163 (contracts/room-data-files.md §13.4, contracts/room-bundle.md §3.1): a tier switch whose piece declares
    // claims carries them whole into the bundle, a pose for local and one for cloud, two different poses its cases
    // name, so the runtime knows the plugged and the cloud poses from them. One pose for both can't be written: the
    // catalog's claims map each pose to one value, so the claims rule's runtime case (cables.test.ts) holds that one.
    it.each([
      ["local", "fx-plugged"],
      ["cloud", "fx-cloud"],
    ] as const)("refuses a switch whose piece's claims name no pose for %s", (value, pose) => {
      const half = rs({ plug: (d) => (at(d, "claims", "poses")[pose] = null) });
      expect(half.seen).toContain(`RS3 ${SCENE}:switches[0].cases`);
      expect(half.found.filter((f) => f.rule === "RS3").map((f) => f.reason)).toEqual([
        `its piece's claims name no pose for ${value}`,
      ]);
    });

    // The delta review of T163, N-c: the index of a switch whose piece's claims lack local writes it as "", a pose no
    // case names, so the runtime reads the claims as not-live, beside RS3's finding.
    it("writes a missing claim as an empty pose in the index, beside RS3's finding", () => {
      const doc = parse(decoder.decode(goodFiles().get(PLUG))) as Doc;
      at(doc, "claims", "poses")["fx-plugged"] = null;
      const result = compose(overlay({ [PLUG]: stringify(doc) }), noPolicy(), { mode: "strict", drafts: true });
      expect(result.findings.filter((f) => f.rule === "RS3").map((f) => `${f.file}:${f.path}`)).toEqual([
        `${SCENE}:switches[0].cases`,
      ]);
      expect(result.index.switches[0]?.claims?.local).toBe("");
      expect(result.index.switches[0]?.claims?.cloud).toBe("fx-cloud");
    });

    it.each([
      ["local", "fx-plugged"],
      ["cloud", "fx-cloud"],
    ] as const)("refuses a switch whose piece's claims name a pose for %s that no case shows", (value, pose) => {
      const unshown = rs({
        scene: (d) => {
          delete at(power(d), "cases")[value];
        },
      });
      expect(unshown.seen).toEqual([`RS1 ${SCENE}:switches[0].cases`, `RS3 ${SCENE}:switches[0].cases`]);
      expect(unshown.found.find((f) => f.rule === "RS3")?.reason).toBe(
        `no case shows the pose its piece's claims name for ${value}`,
      );
      // Where another case shows the claimed pose, that case's own finding stands for it.
      const elsewhere = rs({
        scene: (d) => {
          delete at(power(d), "cases")[value];
          at(power(d), "cases").budget = pose;
        },
      });
      expect(elsewhere.found.filter((f) => f.rule === "RS3").map((f) => f.path)).toEqual(["switches[0].cases.budget"]);
    });

    it("still accepts a claimless tier switch with a default, RS1's path, whatever pose its local case shows", () => {
      const claimless = (d: Doc): void => {
        delete d.claims;
      };
      const defaulted = (d: Doc): void => {
        for (const value of SHARED) delete at(power(d), "cases")[value];
        power(d).default = "fx-resting";
      };
      expect(rs({ plug: claimless, scene: defaulted }).seen).toEqual([]);
      // Without claims no pose is plugged, so nothing holds local's case to one pose.
      const swapped = (d: Doc): void => {
        defaulted(d);
        at(power(d), "cases").local = "fx-cloud";
        at(power(d), "cases").cloud = "fx-plugged";
      };
      expect(rs({ plug: claimless, scene: swapped }).found.filter((f) => f.rule === "RS3")).toEqual([]);
    });
  });

  describe("RS4: the six other values share one pose, which claims nothing", () => {
    it.each(SHARED)("refuses %s on a pose of its own, where the others share one", (value) => {
      const split = rs({
        plug: (d) => (at(d, "claims", "poses")["fx-napping"] = null),
        scene: (d) => {
          at(power(d), "poses")["fx-napping"] = { mount: { on: "fx-desk", anchor: "top", offset: [0.3, 0, 0.2] } };
          at(power(d), "cases")[value] = "fx-napping";
        },
      });
      expect(split.seen).toEqual([`RS4 ${SCENE}:switches[0].cases.${value}`]);
    });

    it("refuses a shared pose that claims a value", () => {
      const claimed = rs({ plug: (d) => (at(d, "claims", "poses")["fx-resting"] = "unknown") });
      expect(claimed.seen).toContain(`RS4 ${SCENE}:switches[0].cases.unknown`);
    });

    it("leaves a shared pose the switch lacks to RI4 and RS2, its claim unjudged", () => {
      const lacking = rs({
        plug: (d) => (at(d, "claims", "poses")["fx-resting"] = "unknown"),
        scene: (d) => {
          delete at(power(d), "poses")["fx-resting"];
        },
      });
      expect(lacking.found.filter((f) => f.rule === "RS4")).toEqual([]);
    });

    it("holds a piece that claims nothing to one shared pose too, its default among the six", () => {
      const split = rs({
        plug: (d) => {
          delete d.claims;
        },
        scene: (d) => {
          delete at(power(d), "cases").paused;
          power(d).default = "fx-cloud";
        },
      });
      expect(split.seen).toEqual([`RS4 ${SCENE}:switches[0].default`]);
      expect(split.found[0]?.reason).toMatch(/^gives paused another pose than /);
    });
  });

  describe("RS5: nothing but the local case puts the plug in the port", () => {
    it.each(["fx-cloud", "fx-resting"])("refuses %s on the plugged pose's placement and anchor", (pose) => {
      const moved = rs({
        scene: (d) => (at(power(d), "poses", pose).mount = { on: "fx-laptop", anchor: "port", offset: [0.2, 0, 0] }),
      });
      expect(moved.seen).toContain(`RS5 ${SCENE}:switches[0].poses.${pose}.mount`);
    });

    /** The resting pose at the cloud pose's place, its offset moved along X and Y and its turn about Y. */
    const near = (dx: number, dy: number, turn = 0): string[] =>
      rs({
        scene: (d) =>
          (at(power(d), "poses", "fx-resting").mount = {
            on: "fx-desk",
            anchor: "back-edge",
            offset: [0.4 + dx, dy, 0.05],
            turn: { y: turn },
          }),
      }).seen;

    it("refuses two poses with different claims within 1 mm and 1°, and accepts them further apart", () => {
      const refused = [`RS5 ${SCENE}:switches[0].poses.fx-resting.mount`];
      expect(near(0, 0)).toEqual(refused);
      expect(near(0.0009, 0, 0.9)).toEqual(refused);
      // 0.8 mm along each of two axes is 1.13 mm away.
      expect(near(0.0008, 0.0008)).toEqual([]);
      expect(near(0.0006, 0.0006)).toEqual(refused);
      expect(near(0.0011, 0)).toEqual([]);
      expect(near(0, 0, 1.1)).toEqual([]);
      // A whole turn is no turn.
      expect(near(0, 0, 360)).toEqual(refused);
    });

    it("refuses a pose on another placement and anchor that the world places where the plugged pose sits (words-8)", () => {
      // The plugged pose from the desk's top: the laptop's offset (0.17, 0, 0) and turn of −10° about Y, then the port
      // (0.16, 0.01, 0) and the pose's own offset (0.03, 0, 0) and turn of 90°.
      const [x, y, z] = transformPoint(rotation({ x: 0, y: -10, z: 0 }), [0.19, 0.01, 0]);
      const landed = (dx: number, turn = 80): string[] =>
        rs({
          scene: (d) =>
            (at(power(d), "poses", "fx-resting").mount = {
              on: "fx-desk",
              anchor: "top",
              offset: [0.17 + x + dx, y, z],
              turn: { y: turn },
            }),
        }).seen;
      const refused = [`RS5 ${SCENE}:switches[0].poses.fx-resting.mount`];
      expect(landed(0)).toEqual(refused);
      expect(landed(0.0009, 80.9)).toEqual(refused);
      expect(landed(0.0011)).toEqual([]);
      expect(landed(0, 81.1)).toEqual([]);
    });
  });

  describe("RS6: the cable runs from the switch's piece", () => {
    it("refuses a cable from an anchor the piece lacks", () => {
      expect(rs({ scene: (d) => (at(power(d), "cable").from = "fx-nowhere") }).seen).toEqual([
        `RS6 ${SCENE}:switches[0].cable.from`,
      ]);
    });

    it.each([
      ["sag", 0.51],
      ["sag", -0.01],
      ["radius", 0],
      ["drop", -0.1],
    ] as const)("refuses a %s of %d as the scene is read", (key, value) => {
      expect(rs({ scene: (d) => (at(power(d), "cable")[key] = value) }).seen).toEqual([
        `RS6 ${SCENE}:switches[0].cable.${key}`,
      ]);
    });
  });

  it("names no pose and no value from the data in a reason", () => {
    const all = rs({
      scene: (d) => {
        at(power(d), "cases").cloud = "fx-plugged";
        at(power(d), "cases").paused = "fx-cloud";
        at(power(d), "cable").from = "fx-nowhere";
        at(power(d), "poses", "fx-resting").mount = { on: "fx-laptop", anchor: "port" };
      },
    });
    expect(all.found.length).toBeGreaterThan(3);
    for (const f of all.found) expect(f.reason).not.toMatch(/fx-/);
  });
});
