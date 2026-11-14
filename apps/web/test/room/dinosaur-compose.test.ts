// Spec 021 (T003 to T006; FR-001 to FR-005, FR-012; SC-001, SC-002; plan.md R-01 to R-05, R-09, §4;
// contracts/dinosaur-rig.md): the compositor's rules for an avatar with a rig-table row, the dinosaur alone today.
// - The rig table, RIG_BONES: the dinosaur's row the contract's eighteen raw bone names; the woman's, the man's, and the
//   dog's null, so none of the three rules reads them.
// - RA10, a model whose raw node names lack a bone of its row, exactly or after a `:` (as scripts/studio/line.py's
//   has_bone reads it).
// - RA11, a model whose rest-pose box, scaled to AVATAR_SHAPES[id].height, is over AVATAR_SHAPES[id].width × 1.05
//   along x or z.
// - RA12, a model without a usable `idle` or `walk` clip, a clip RA1, RA2, or RA4 refuses counting as missing.
// The dinosaur's folder is made in the test (test/helpers/glb.ts's dinosaurGlb and dinosaurClip, laid out by
// room-avatars.ts's avatarFolder), never the asset (spec 009's FR-043).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readAvatars, RIG_BONES } from "../../build/room/avatars";
import type { AvatarSet } from "../../build/room/avatars";
import { compose } from "../../build/room/compose";
import type { ComposeOptions, Finding } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import type { RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import { AVATAR_SHAPES, AVATARS } from "../../src/choice/avatars";
import { clipGlb, DINOSAUR_BONES, dinosaurClip } from "../helpers/glb";
import { REPO } from "../helpers/room";
import { overlay } from "../helpers/room-fixtures";
import { avatarModel, avatarPolicy, nightFiles } from "../helpers/room-avatars";
import { dinosaurFolder } from "../helpers/room-dinosaur";
import type { DinosaurFolderOptions } from "../helpers/room-dinosaur";

const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const LENIENT: ComposeOptions = { mode: "lenient", drafts: true };
const where = (findings: readonly { rule: string; file: string; path: string }[]): string[] =>
  findings.map((f) => `${f.rule} ${f.file}:${f.path}`);
const MODEL = "assets/visitors/dinosaur/dinosaur.glb";

type DinoOptions = DinosaurFolderOptions;

/** The night's woman and man (the man the twin's stand-in) with the dinosaur's folder, or without it for null. */
const tree = (o: DinoOptions | null = {}, night: Parameters<typeof nightFiles>[0] = {}): Tree =>
  overlay({ ...nightFiles(night), ...(o === null ? {} : dinosaurFolder(o)) });

const avatarsIn = (t: Tree, policy: RoomPolicy = avatarPolicy()): AvatarSet =>
  readAvatars(t, policy, loadRoom(t).scene?.value ?? null);
const ruleFindings = (set: AvatarSet, rule: string): string[] =>
  where(set.problems.filter((p) => p.rule === rule)).sort();
const reasonsOf = (set: AvatarSet, rule: string): string[] =>
  set.problems.filter((p) => p.rule === rule).map((p) => p.reason);
const bundled = (set: AvatarSet, id: string): string[] => {
  const a = set.avatars.find((x) => x.id === id);
  return (a ? [a.model, ...a.clips] : []).filter((f) => f?.bundled).map((f) => f?.name ?? "");
};

/** The bone names of contracts/dinosaur-rig.md's "Bones" table, read from its first column, `Tail1` … `Tail4` spread. */
function contractBones(): string[] {
  const text = readFileSync(join(REPO, "specs/021-dinosaur-modeled-and-brought-in/contracts/dinosaur-rig.md"), "utf8");
  const table = text.slice(text.indexOf("| Bone |"), text.indexOf("\n\n", text.indexOf("| Bone |")));
  const names: string[] = [];
  for (const row of table.split("\n").slice(2)) {
    const cell = row.split("|")[1] ?? "";
    const ticked = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);
    const spread = /^(\D+)(\d+)$/;
    if (cell.includes("…") && ticked.length === 2) {
      const [a, b] = [spread.exec(ticked[0] as string), spread.exec(ticked[1] as string)];
      for (let i = Number(a?.[2]); i <= Number(b?.[2]); i += 1) names.push(`${a?.[1]}${i}`);
    } else names.push(...ticked);
  }
  return names;
}

describe("the rig table (FR-005; Q7)", () => {
  it("holds the contract's eighteen raw bone names for the dinosaur, and null for the woman, the man, and the dog", () => {
    expect(contractBones()).toHaveLength(18);
    expect([...(RIG_BONES.dinosaur ?? [])].sort()).toEqual(contractBones().sort());
    expect(RIG_BONES.woman).toBeNull();
    expect(RIG_BONES.man).toBeNull();
    expect(RIG_BONES.dog).toBeNull();
    expect(Object.keys(RIG_BONES).sort()).toEqual(AVATARS.map((a) => a.id).sort());
  });

  it("asks no Mixamo name of the dinosaur", () => {
    expect((RIG_BONES.dinosaur ?? []).filter((b) => b.startsWith("mixamorig"))).toEqual([]);
  });
});

describe("RA10: the rig's bones (FR-005)", () => {
  it("passes a full model, with no finding of any rule, strict", () => {
    const result = compose(tree(), avatarPolicy(), STRICT);
    expect(where(result.findings)).toEqual([]);
    expect(result.scene.avatars.dinosaur).toBeDefined();
  });

  it("refuses a model without Jaw, naming it, in the contract's words", () => {
    const set = avatarsIn(tree({ model: { omit: ["Jaw"] } }));
    expect(ruleFindings(set, "RA10")).toEqual([`RA10 ${MODEL}:-`]);
    expect(reasonsOf(set, "RA10")).toEqual(["the dinosaur rig lacks Jaw"]);
  });

  it("names the first three bones it lacks, then how many more", () => {
    const omit = ["Jaw", "Tail4", "Tail3", "Arm.L", "Arm.R"];
    const set = avatarsIn(tree({ model: { omit } }));
    // In the row's order, the contract's.
    const order = (RIG_BONES.dinosaur ?? []).filter((b) => omit.includes(b));
    expect(reasonsOf(set, "RA10")).toEqual([`the dinosaur rig lacks ${order.slice(0, 3).join(", ")}, and 2 more`]);
  });

  it("counts a bone named after a `:` as the bone, as line.py's has_bone reads it", () => {
    const set = avatarsIn(tree({ model: { rename: (n) => (n === "Jaw" ? "rig:Jaw" : n) } }));
    expect(ruleFindings(set, "RA10")).toEqual([]);
    // A name that only ends with the bone, without the colon, doesn't count.
    const near = avatarsIn(tree({ model: { rename: (n) => (n === "Jaw" ? "BigJaw" : n) } }));
    expect(reasonsOf(near, "RA10")).toEqual(["the dinosaur rig lacks Jaw"]);
  });

  it("leaves the model and its clips out of a lenient build, the cut-out standing, and warns", () => {
    const t = tree({ model: { omit: ["Jaw"] } });
    const result = compose(t, avatarPolicy(), LENIENT);
    expect(where(result.findings)).toEqual([`RA10 ${MODEL}:-`]);
    expect((result.findings[0] as Finding).lenient).toBe(true);
    expect(result.scene.avatars.dinosaur).toBeUndefined();
    expect(result.scene.avatars.woman).toBeDefined();
    expect(bundled(avatarsIn(t), "dinosaur")).toEqual([]);
  });

  it("reads no row for the woman and the man, whatever their nodes: their Mixamo rigs have none of the dinosaur's bones", () => {
    const set = avatarsIn(tree(null));
    expect(set.problems).toEqual([]);
    expect(bundled(set, "woman").length).toBeGreaterThan(0);
    expect(bundled(set, "man").length).toBeGreaterThan(0);
  });

  it("reports nothing where main's caps have no avatar block, as RA1 to RA4", () => {
    const set = avatarsIn(tree({ model: { omit: ["Jaw"] } }), avatarPolicy({ avatar: null }));
    expect(set.problems).toEqual([]);
  });
});

// T004 (FR-004; plan.md R-03): RA11, the model's rest-pose box, scaled uniformly to the avatar table's height, at most
// the table's width (the cut-out's) along x and along z, with 5% slack. The limits are read from AVATAR_SHAPES.
describe("RA11: the body's box (FR-004)", () => {
  const shape = AVATAR_SHAPES.dinosaur;
  const limit = shape.width * 1.05;
  const box = (axis: "x" | "z", extent: number): string =>
    `${axis} extent ${extent.toFixed(2)} m at ${shape.height} m high, over ${shape.width} m (+5%)`;

  it("passes the default fixture, 1.0 m long and 0.6 m wide at the table's height", () => {
    expect(ruleFindings(avatarsIn(tree({ model: { height: shape.height, length: 1.0 } })), "RA11")).toEqual([]);
  });

  it("refuses a body too long (z) or too wide (x) for its height, naming the axis and the extent", () => {
    const long = avatarsIn(tree({ model: { height: shape.height, length: 1.3 } }));
    expect(ruleFindings(long, "RA11")).toEqual([`RA11 ${MODEL}:-`]);
    expect(reasonsOf(long, "RA11")).toEqual([box("z", 1.3)]);
    const wide = avatarsIn(tree({ model: { height: shape.height, width: 1.3 } }));
    expect(reasonsOf(wide, "RA11")).toEqual([box("x", 1.3)]);
    const both = avatarsIn(tree({ model: { height: shape.height, width: 1.3, length: 1.4 } }));
    expect(reasonsOf(both, "RA11")).toEqual([`${box("x", 1.3)}; ${box("z", 1.4)}`]);
  });

  it("holds the limit at the table's width with 5% slack, either side of it", () => {
    const at = (length: number): string[] =>
      ruleFindings(avatarsIn(tree({ model: { height: shape.height, length } })), "RA11");
    expect(at(limit - 0.005)).toEqual([]);
    expect(at(limit + 0.005)).toEqual([`RA11 ${MODEL}:-`]);
  });

  it("measures after scaling to the table's height: a model in centimetres, or of another height, by its own", () => {
    const cm = (length: number): AvatarSet =>
      avatarsIn(
        tree({
          model: { unit: 100, height: shape.height, length },
          clips: {
            idle: dinosaurClip("idle", { unit: 100 }).bytes,
            walk: dinosaurClip("walk", { unit: 100 }).bytes,
            take: dinosaurClip("take", { unit: 100 }).bytes,
          },
        }),
      );
    expect(ruleFindings(cm(1.0), "RA11")).toEqual([]);
    expect(reasonsOf(cm(1.3), "RA11")).toEqual([box("z", 1.3)]);
    // Half the height, the length, and the width: the same body, scaled up to the table's height, passes; half the
    // height and width with the same length is twice as long once scaled, and fails on z alone.
    const half = (length: number): AvatarSet =>
      avatarsIn(tree({ model: { height: shape.height / 2, width: 0.3, length } }));
    expect(ruleFindings(half(0.5), "RA11")).toEqual([]);
    expect(reasonsOf(half(1.0), "RA11")).toEqual([box("z", 2.0)]);
  });

  it("leaves the model and its clips out of a lenient build, and the dinosaur off the 3D part", () => {
    const t = tree({ model: { length: 1.3 } });
    const result = compose(t, avatarPolicy(), LENIENT);
    expect(where(result.findings)).toEqual([`RA11 ${MODEL}:-`]);
    expect(result.scene.avatars.dinosaur).toBeUndefined();
    expect(bundled(avatarsIn(t), "dinosaur")).toEqual([]);
  });

  it("measures no woman or man, with no walk clip and any extent", () => {
    // A 0.2 m model is scaled ×7.9 to the woman's height and ×8.7 to the man's: 3.9 m and 4.4 m wide, far over
    // their cut-outs' widths, and no RA11, since their rows are null.
    const small = { model: avatarModel({ height: 0.2 }).bytes };
    const set = avatarsIn(tree(null, { woman: small, man: small }));
    expect(ruleFindings(set, "RA11")).toEqual([]);
    expect(set.problems).toEqual([]);
  });
});

// T005 (FR-003; plan.md R-04): RA12, an avatar with a rig-table row needs a usable `idle` and `walk`; a clip that RA1,
// RA2, or RA4 refuses counts as missing. `take` is optional (spec 009's FR-003: the idle in its place).
describe("RA12: the required clips (FR-003)", () => {
  it("refuses a model with no walk clip strictly, on the model, and leaves it and its clips out leniently", () => {
    const t = tree({ clips: { walk: null } });
    const strict = compose(t, avatarPolicy(), STRICT);
    expect(where(strict.findings)).toEqual([`RA12 ${MODEL}:-`]);
    expect(strict.findings[0]?.reason).toBe("no usable walk clip");
    const lenient = compose(t, avatarPolicy(), LENIENT);
    expect(where(lenient.findings)).toEqual([`RA12 ${MODEL}:-`]);
    expect(lenient.scene.avatars.dinosaur).toBeUndefined();
    expect(bundled(avatarsIn(t), "dinosaur")).toEqual([]);
  });

  it("refuses a model with no idle clip, and names both where both are missing", () => {
    expect(reasonsOf(avatarsIn(tree({ clips: { idle: null } })), "RA12")).toEqual(["no usable idle clip"]);
    expect(reasonsOf(avatarsIn(tree({ clips: { idle: null, walk: null } })), "RA12")).toEqual([
      "no usable idle clip; no usable walk clip",
    ]);
  });

  it("asks nothing of take: a model with idle and walk alone is bundled with both", () => {
    const set = avatarsIn(tree({ clips: { take: null } }));
    expect(set.problems).toEqual([]);
    expect(bundled(set, "dinosaur")).toEqual(["dinosaur.glb", "dinosaur-idle.glb", "dinosaur-walk.glb"]);
  });

  it("counts a walk clip RA2 refuses (no animation) as missing", () => {
    const empty = clipGlb("walk", { bones: DINOSAUR_BONES }).bytes;
    const set = avatarsIn(tree({ clips: { walk: empty } }));
    expect(where(set.problems).sort()).toEqual([
      "RA12 assets/visitors/dinosaur/dinosaur.glb:-",
      "RA2 assets/visitors/dinosaur/dinosaur-walk.glb:-",
    ]);
    expect(reasonsOf(set, "RA12")).toEqual(["no usable walk clip"]);
  });

  it("counts an idle clip RA1 refuses (not recorded) or RA4 refuses (over main's animation cap) as missing", () => {
    const unrecorded = avatarsIn(
      tree({
        folder: {
          records: (e) =>
            void e.splice(
              e.findIndex((x) => x.file === "dinosaur-idle.glb"),
              1,
            ),
        },
      }),
    );
    expect(ruleFindings(unrecorded, "RA1")).toEqual(["RA1 assets/visitors/dinosaur/dinosaur-idle.glb:-"]);
    expect(reasonsOf(unrecorded, "RA12")).toEqual(["no usable idle clip"]);
    const idle = dinosaurClip("idle").bytes.length;
    const capped = avatarsIn(tree(), avatarPolicy({ animation: { bytes: idle - 1 } }));
    expect(reasonsOf(capped, "RA12")).toEqual(
      dinosaurClip("walk").bytes.length > idle - 1
        ? ["no usable idle clip; no usable walk clip"]
        : ["no usable idle clip"],
    );
  });

  it("asks no clip of the woman and the man: neither has a walk clip, and no RA12", () => {
    const set = avatarsIn(tree(null));
    expect(ruleFindings(set, "RA12")).toEqual([]);
    expect(set.avatars.find((a) => a.id === "woman")?.clips.some((c) => c.role === "walk")).toBe(false);
  });
});

// T006 (FR-001, FR-012; SC-001; US1 scenario 1, US2 scenario 1): the dinosaur's folder, made in the test, bundled into
// the 3D part's avatars and dist/a/, and listed in the report with its bytes, triangles, and texture memory; without
// the folder, no dinosaur anywhere and no new measure in the output. Spec 009's code already bundles and reports any
// avatar of the table, so these are expected to pass unchanged (pins).
describe("the dinosaur's folder in the bundle and the report (FR-001, FR-012, SC-001)", () => {
  const files = dinosaurFolder();
  const sha = (path: string): string =>
    createHash("sha256")
      .update(files[path] as Uint8Array)
      .digest("hex");
  const dir = "assets/visitors/dinosaur";
  const NAMES = ["dinosaur.glb", "dinosaur-idle.glb", "dinosaur-walk.glb", "dinosaur-take.glb"] as const;

  it("bundles its model and three clips into the 3D part and dist/a/, with no finding", () => {
    const result = compose(tree(), avatarPolicy(), STRICT);
    expect(result.findings).toEqual([]);
    const dino = result.scene.avatars.dinosaur;
    expect(dino?.model.url).toBe(`a/dinosaur.${sha(`${dir}/dinosaur.glb`).slice(0, 16)}.glb`);
    for (const role of ["idle", "walk", "take"] as const)
      expect(dino?.clips[role]?.url).toBe(`a/dinosaur-${role}.${sha(`${dir}/dinosaur-${role}.glb`).slice(0, 16)}.glb`);
    const urls = result.avatars.map((a) => a.url);
    for (const name of NAMES)
      expect(urls).toContain(`a/${name.slice(0, -4)}.${sha(`${dir}/${name}`).slice(0, 16)}.glb`);
  });

  it("lists each of its files in the report with its bytes, triangles, and texture memory, bundled, and its scale", () => {
    const report = compose(tree(), avatarPolicy(), STRICT).report.markdown.split("\n");
    for (const name of NAMES) {
      const row = report.find((l) => l.startsWith(`| \`${dir}/${name}\``));
      expect(row, name).toBeDefined();
      const cells = (row ?? "").split("|").map((c) => c.trim());
      // File, role, bytes, gzip-9 bytes, triangles, texture memory, at the texture side, bundled.
      expect(cells[3]?.replace(/\D/g, "")).toBe(String((files[`${dir}/${name}`] as Uint8Array).length));
      expect(cells[5]).toBe(name === "dinosaur.glb" ? "12" : "0");
      expect(cells[6]).toBe("0");
      expect(cells[8]).toBe("yes");
    }
    expect(report).toContain(
      `Scale its reader's bounds imply for \`dinosaur\`: 1.000× for the visitor's ${AVATAR_SHAPES.dinosaur.height} m.`,
    );
  });

  it("without the folder, names no dinosaur and carries no new measure in the 3D part, dist/a/, or the report", () => {
    const result = compose(tree(null), avatarPolicy(), STRICT);
    expect(result.findings).toEqual([]);
    expect(result.scene.avatars.dinosaur).toBeUndefined();
    expect(result.avatars.some((a) => a.url.includes("dinosaur"))).toBe(false);
    expect(result.report.markdown).not.toMatch(/dinosaur|extent/);
    expect(JSON.stringify(result.scene)).not.toMatch(/extent_[xz]/);
  });
});
