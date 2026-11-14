// Spec 021 (T003 to T006; FR-001 to FR-005, FR-012; SC-001, SC-002; plan.md R-01 to R-05, R-09, §4;
// contracts/dinosaur-rig.md): the compositor's rules for an avatar with a rig-table row, the dinosaur alone today.
// - The rig table, RIG_BONES: the dinosaur's row the contract's eighteen raw bone names; the woman's, the man's, and the
//   dog's null, so none of the three rules reads them.
// - RA10, a model whose raw node names lack a bone of its row, exactly or after a `:` (as scripts/studio/line.py's
//   has_bone reads it).
// - RA11, a model whose rest-pose box, scaled to AVATAR_SHAPES[id].height, is over AVATAR_SHAPES[id].width × 1.05
//   along x or z.
// The dinosaur's folder is made in the test (test/helpers/glb.ts's dinosaurGlb and dinosaurClip, laid out by
// room-avatars.ts's avatarFolder), never the asset (spec 009's FR-043).
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
import { dinosaurClip } from "../helpers/glb";
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
