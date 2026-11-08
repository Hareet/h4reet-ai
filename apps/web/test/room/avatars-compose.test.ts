// T010 (spec 009; FR-009, FR-011, FR-012, FR-014, FR-024, FR-037, FR-038, FR-040; plan.md §3.1, §3.2, §3.5, R-12, R-19;
// SC-003, SC-008 to SC-010): the room's avatars through compose(), on the fixture set with each avatar's folder made
// when the test runs (test/helpers/room-avatars.ts), since spec 003's rule A1 refuses a committed model.
// - The scene's optional `figures` block: its defaults, its ranges (RD2, RD3), and RI8's stand-in outside the table.
// - The bundle: the 3D part's `figures` resolved and `avatars`, each bundled file with its a/ URL, SHA-256, served bytes,
//   and a model's texture memory at texture_px; the copies the plugin writes; the copy's stand-in line first.
// - The RA family: RA1 to RA4 refuse in a strict build and leave the file out in a lenient one, its figure on its
//   fallback; RA5 is reported, never refused; RK3 counts the twin's figure as the larger of its own models and the
//   stand-in's files, each avatar at its decoded size; RK5 holds the first visit with both figures' files to phase 3.
// - The report's lines; no read under assets/twin/ for the stand-in; two composes alike; the data-only proof set on the
//   repository's own data (the stand-in to woman, texture_px to 512, wait_ms to 0); and a tree with no avatar file.
// Kept in a file of its own beside schema.test.ts, compose.test.ts, budgets.test.ts, report.test.ts, and
// data-only.test.ts, which spec 008 also extends, so the stack's move meets no conflict here (plan.md §10).
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { createContext } from "../../build/room/checks/family";
import { sceneTextureMemory } from "../../build/room/checks/rk";
import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeOptions, ComposeResult, Finding } from "../../build/room/compose";
import { loadRoom, SCENE_FILE } from "../../build/room/load";
import { noPolicy, readRoomPolicy } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import { fileTree, overlayTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { AVATAR_SHAPES } from "../../src/choice/avatars";
import { gzipBytes } from "../../src/room/glb/gzip";
import { textureMemory } from "../../src/room/glb/fit";
import { clipGlb, pngHeader } from "../helpers/glb";
import { REPO } from "../helpers/room";
import { goodTree, overlay } from "../helpers/room-fixtures";
import { avatarFolder, avatarModel, avatarPolicy, nightFiles, SCENE, sceneWith } from "../helpers/room-avatars";

const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const LENIENT: ComposeOptions = { mode: "lenient", drafts: true };
const encoder = new TextEncoder();
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const where = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.rule} ${f.file}:${f.path}`);
const ofFamily = (findings: readonly Finding[], ...rules: string[]): Finding[] =>
  findings.filter((f) => rules.some((r) => f.rule === r || f.rule.startsWith(r)));

/** The night's set: the woman's and the man's folders, the scene naming the man as the stand-in. */
const night = (o: Parameters<typeof nightFiles>[0] = {}): Tree => overlay(nightFiles(o));
const composed = (tree: Tree, policy: RoomPolicy = avatarPolicy(), options = STRICT): ComposeResult =>
  compose(tree, policy, options);

describe("the scene's figures block (FR-037; plan.md §3.1)", () => {
  it("is optional: without it, no stand-in, texture_px 1,024, and wait_ms 1,500, and the figures' placements", () => {
    const result = composed(goodTree(), noPolicy());
    expect(result.findings).toEqual([]);
    expect(result.scene.figures).toEqual({
      twin: "fx-twin",
      visitor: "fx-visitor",
      stand_in: null,
      texture_px: 1024,
      wait_ms: 1500,
    });
    expect(result.scene.avatars).toEqual({});
  });

  it("takes its values, each a data edit", () => {
    const tree = overlay({ [SCENE]: sceneWith({ twin_stand_in: "woman", texture_px: 512, wait_ms: 0 }) });
    const result = composed(tree, noPolicy());
    expect(where(result.findings)).toEqual([]);
    expect(result.scene.figures).toMatchObject({ stand_in: "woman", texture_px: 512, wait_ms: 0 });
  });

  it.each([
    ["texture_px", 128],
    ["texture_px", 8192],
    ["texture_px", 1000],
    ["texture_px", 1024.5],
    ["wait_ms", -1],
    ["wait_ms", 3001],
    ["wait_ms", 1.5],
  ])("refuses %s %s with RD3", (key, value) => {
    const tree = overlay({ [SCENE]: sceneWith({ twin_stand_in: "man", [key]: value }) });
    expect(where(composed(tree, noPolicy()).findings)).toEqual([`RD3 ${SCENE}:figures.${key}`]);
  });

  it("refuses a key the block doesn't define with RD2", () => {
    const tree = overlay({ [SCENE]: sceneWith({ twin_stand_in: "man", hand: "right" }) });
    expect(where(composed(tree, noPolicy()).findings)).toEqual([`RD2 ${SCENE}:figures.hand`]);
  });

  it("refuses a stand-in that isn't an avatar of the table with RI8, in every build", () => {
    for (const options of [STRICT, LENIENT]) {
      const tree = overlay({ [SCENE]: sceneWith({ twin_stand_in: "fx-robot" }) });
      const findings = composed(tree, noPolicy(), options).findings;
      expect(where(findings)).toEqual([`RI8 ${SCENE}:figures.twin_stand_in`]);
      expect(findings[0]?.lenient).toBe(false);
      expect(findings[0]?.reason).not.toContain("fx-robot");
    }
  });
});

describe("the avatars in the bundle (FR-009, FR-023, FR-024; plan.md §3.2, R-01, R-02, R-12)", () => {
  it("bundles each avatar's recorded model and clips, by convention, with its URL, SHA-256, bytes, and memory", () => {
    const woman = avatarFolder("woman", { modelOptions: { images: [pngHeader(2048, 1024)] } });
    const result = composed(overlay({ ...nightFiles(), ...woman }));
    expect(where(result.findings)).toEqual([]);
    expect(Object.keys(result.scene.avatars)).toEqual(["man", "woman"]);
    for (const id of ["man", "woman"] as const) {
      const avatar = result.scene.avatars[id];
      const model = (id === "woman" ? woman : nightFiles())[`assets/visitors/${id}/${id}.glb`] as Uint8Array;
      expect(avatar?.model.url).toBe(`a/${id}.${sha256(model).slice(0, 16)}.glb`);
      expect(avatar?.model.sha256).toBe(sha256(model));
      expect(avatar?.model.bytes).toBe(gzipBytes(model));
      expect(Object.keys(avatar?.clips ?? {})).toEqual(["idle", "idle-holding", "take"]);
      for (const [role, clip] of Object.entries(avatar?.clips ?? {})) {
        expect(clip?.url).toMatch(new RegExp(`^a/${id}-${role}\\.[0-9a-f]{16}\\.glb$`));
        expect(clip?.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
    // The woman's 2,048 × 1,024 image decodes at most 1,024 a side, keeping its aspect (FR-024, D5).
    expect(result.scene.avatars.woman?.model.texture_bytes).toBe(textureMemory(1024, 512));
    expect(result.scene.avatars.man?.model.texture_bytes).toBe(0);
    // Each bundled file's gzip-9 copy, for the plugin's dist/a/.
    const urls = Object.values(result.scene.avatars).flatMap((a) => [
      a?.model.url,
      ...Object.values(a?.clips ?? {}).map((c) => c?.url),
    ]);
    expect(result.avatars.map((a) => a.url).sort()).toEqual([...urls].sort());
    for (const a of result.avatars)
      expect(a.gz.length).toBe(
        gzipBytes(nightFiles({ woman: { modelOptions: { images: [pngHeader(2048, 1024)] } } })[a.path] as Uint8Array),
      );
  });

  it("resolves the 3D part's figures: the stand-in the scene names, the texture cap, and the wait", () => {
    const result = composed(night({ figures: { texture_px: 512, wait_ms: 250 } }));
    expect(result.scene.figures).toEqual({
      twin: "fx-twin",
      visitor: "fx-visitor",
      stand_in: "man",
      texture_px: 512,
      wait_ms: 250,
    });
  });

  it("keeps the stand-in named while its files are missing: the twin shows its capsule, and the build passes", () => {
    const tree = overlay({ [SCENE]: sceneWith({ twin_stand_in: "man" }), ...avatarFolder("woman") });
    const result = composed(tree);
    expect(where(result.findings)).toEqual([]);
    expect(result.scene.figures.stand_in).toBe("man");
    expect(Object.keys(result.scene.avatars)).toEqual(["woman"]);
  });

  it("bundles nothing while main's caps hold no avatar block, as a room model is set only under main's room caps", () => {
    const result = composed(night(), avatarPolicy({ avatar: null, animation: null }));
    expect(where(result.findings)).toEqual([]);
    expect(result.scene.avatars).toEqual({});
    expect(result.avatars).toEqual([]);
    // A clip needs per_asset.animation: the model alone.
    const models = composed(night(), avatarPolicy({ animation: null }));
    expect(Object.values(models.scene.avatars).map((a) => Object.keys(a?.clips ?? {}))).toEqual([[], []]);
  });

  it("leaves out a clip whose model isn't in the folder, with no finding", () => {
    const tree = overlay({ ...nightFiles(), ...avatarFolder("dog", { model: null }) });
    const result = composed(tree);
    expect(where(result.findings)).toEqual([]);
    expect(result.scene.avatars.dog).toBeUndefined();
  });

  it("puts the stand-in line first in the index's copy, in every build: the twin never shows its own avatar here", () => {
    for (const tree of [goodTree(), night()])
      for (const options of [STRICT, { ...STRICT, drafts: false }])
        expect(composed(tree, avatarPolicy(), options).index.copy[0]).toEqual({ line: "twin.stand_in" });
  });

  it("writes the same bundle twice from one tree", () => {
    const [a, b] = [composed(night()), composed(night())];
    expect(b.digest).toBe(a.digest);
    expect(JSON.stringify(b.scene)).toBe(JSON.stringify(a.scene));
    expect(b.avatars.map((x) => [x.url, sha256(x.gz)])).toEqual(a.avatars.map((x) => [x.url, sha256(x.gz)]));
  });

  it("reads nothing under assets/twin/ to bundle the stand-in", () => {
    const reads = (figures: Record<string, unknown> | null): string[] => {
      const tree = overlay({ ...nightFiles(), [SCENE]: sceneWith(figures) });
      composed(tree);
      return tree.log.filter((path) => path === "assets/twin" || path.startsWith("assets/twin/"));
    };
    // RK3 reads assets/twin/ for the twin's own models whatever the scene says; the stand-in adds no read there.
    expect(reads({ twin_stand_in: "man" })).toEqual(reads(null));
  });
});

describe("the RA family (FR-038; plan.md §3.5)", () => {
  /** The finding a strict build refuses with, and the lenient build's bundle without the file. */
  function both(tree: Tree, policy: RoomPolicy = avatarPolicy()): { strict: Finding[]; lenient: ComposeResult } {
    return { strict: composed(tree, policy, STRICT).findings, lenient: composed(tree, policy, LENIENT) };
  }

  it("RA1: a model the folder's records.json doesn't record, records with another kind, or another SHA-256", () => {
    for (const change of [
      (e: { file: string; kind: string; sha256: string }[]) =>
        e.splice(
          e.findIndex((x) => x.file === "woman.glb"),
          1,
        ),
      (e: { file: string; kind: string; sha256: string }[]) => {
        (e.find((x) => x.file === "woman.glb") as { kind: string }).kind = "animation";
      },
      (e: { file: string; kind: string; sha256: string }[]) => {
        (e.find((x) => x.file === "woman.glb") as { sha256: string }).sha256 = sha256(encoder.encode("fx-other"));
      },
    ]) {
      const { strict, lenient } = both(night({ woman: { records: change } }));
      expect(where(strict)).toEqual(["RA1 assets/visitors/woman/woman.glb:-"]);
      expect(strict[0]?.lenient).toBe(true);
      expect(where(lenient.findings)).toEqual(["RA1 assets/visitors/woman/woman.glb:-"]);
      expect(formatFinding(lenient.findings[0] as Finding, "lenient")).toMatch(/^warn RA1 /);
      // Left out: the woman's figure keeps its flat shape; the man stays.
      expect(Object.keys(lenient.scene.avatars)).toEqual(["man"]);
    }
    // A folder without records.json: every file is RA1's.
    const none = both(night({ woman: { records: () => false } })).strict;
    expect(where(none)).toEqual([
      "RA1 assets/visitors/woman/woman-idle-holding.glb:-",
      "RA1 assets/visitors/woman/woman-idle.glb:-",
      "RA1 assets/visitors/woman/woman-take.glb:-",
      "RA1 assets/visitors/woman/woman.glb:-",
    ]);
  });

  it("RA1 on a clip leaves the avatar bundled without that clip", () => {
    const records = (e: { file: string; kind: string }[]): void => {
      (e.find((x) => x.file === "woman-take.glb") as { kind: string }).kind = "avatar";
    };
    const { strict, lenient } = both(night({ woman: { records } }));
    expect(where(strict)).toEqual(["RA1 assets/visitors/woman/woman-take.glb:-"]);
    expect(Object.keys(lenient.scene.avatars.woman?.clips ?? {})).toEqual(["idle", "idle-holding"]);
  });

  it("RA2: a model the reader can't read, a clip with no animation, and a clip moving a node its model lacks", () => {
    const unreadable = avatarModel().bytes.subarray(0, 40);
    const read = both(night({ woman: { model: unreadable } }));
    expect(ofFamily(read.strict, "RA").map((f) => `${f.rule} ${f.file}`)).toEqual([
      "RA2 assets/visitors/woman/woman.glb",
    ]);
    expect(Object.keys(read.lenient.scene.avatars)).toEqual(["man"]);

    const still = both(night({ woman: { clips: { idle: clipGlb("idle").bytes } } }));
    expect(where(still.strict)).toEqual(["RA2 assets/visitors/woman/woman-idle.glb:-"]);
    expect(still.strict[0]?.reason).toContain("no animation");
    expect(Object.keys(still.lenient.scene.avatars.woman?.clips ?? {})).toEqual(["idle-holding", "take"]);

    const tail = clipGlb("take", {
      tracks: [
        {
          bone: "mixamorig:Tail",
          path: "translation",
          values: [
            [0, 0, 0],
            [0, 0.1, 0],
          ],
        },
      ],
    }).bytes;
    const stray = both(night({ woman: { clips: { take: tail } } }));
    expect(where(stray.strict)).toEqual([
      "RA2 assets/visitors/woman/woman-take.glb:animations[0].channels[0].target.node",
    ]);
    expect(stray.strict[0]?.reason).not.toContain("Tail");
    expect(Object.keys(stray.lenient.scene.avatars.woman?.clips ?? {})).toEqual(["idle", "idle-holding"]);
  });

  it("RA3: the stand-in's model recorded as a likeness, or from a photo; the twin keeps its capsule in a lenient build", () => {
    for (const change of [
      (e: { file: string; likeness: boolean }[]) => {
        (e.find((x) => x.file === "man.glb") as { likeness: boolean }).likeness = true;
      },
      (e: { file: string; source: { type: string } }[]) => {
        (e.find((x) => x.file === "man.glb") as { source: { type: string } }).source.type = "photo";
      },
    ]) {
      const { strict, lenient } = both(night({ man: { records: change as never } }));
      expect(where(strict)).toEqual(["RA3 assets/visitors/man/man.glb:-"]);
      expect(lenient.scene.figures.stand_in).toBeNull();
    }
    // A likeness the visitor may choose, which spec 003's arrival check holds to the Author's approval, isn't RA3's.
    const woman = (e: { file: string; likeness: boolean }[]): void => {
      (e.find((x) => x.file === "woman.glb") as { likeness: boolean }).likeness = true;
    };
    expect(where(composed(night({ woman: { records: woman as never } })).findings)).toEqual([]);
  });

  it("RA4: a model over main's per_asset.avatar, or a clip over per_asset.animation, as spec 003's F2 measures", () => {
    const model = both(
      night(),
      avatarPolicy({ avatar: { bytes: 1000, triangles: 90_000, texture_bytes: 33_554_432 } }),
    );
    expect(where(model.strict)).toEqual(["RA4 assets/visitors/man/man.glb:-", "RA4 assets/visitors/woman/woman.glb:-"]);
    expect(model.strict[0]?.reason).toMatch(/bytes/);
    expect(model.lenient.scene.avatars).toEqual({});

    const triangles = both(
      night(),
      avatarPolicy({ avatar: { bytes: 6_000_000, triangles: 11, texture_bytes: 33_554_432 } }),
    );
    expect(where(triangles.strict)).toContain("RA4 assets/visitors/woman/woman.glb:-");

    const images = { modelOptions: { images: [pngHeader(4096, 4096)] } };
    const memory = both(night({ woman: images }));
    // 4,096 × 4,096 is 89,478,485 bytes at its own size, over 33,554,432, though it decodes at 1,024.
    expect(where(memory.strict)).toEqual(["RA4 assets/visitors/woman/woman.glb:-"]);

    const clip = both(night(), avatarPolicy({ animation: { bytes: 100 } }));
    expect(where(clip.strict)).toContain("RA4 assets/visitors/woman/woman-take.glb:-");
    expect(Object.keys(clip.lenient.scene.avatars.woman?.clips ?? {})).toEqual([]);
  });

  it("RA5: a file with no role is reported, never refused, never bundled", () => {
    const tree = night({ woman: { extra: { "woman-roar.glb": clipGlb("roar").bytes } } });
    const result = composed(tree);
    expect(where(result.findings)).toEqual([]);
    expect(result.avatars.map((a) => a.url).some((u) => u.includes("roar"))).toBe(false);
    expect(result.report.markdown).toContain("`assets/visitors/woman/woman-roar.glb`");
    expect(result.report.markdown).toMatch(/RA5/);
  });

  it("RK3: the twin's figure as the larger of its own models and the stand-in's files, each avatar at its decoded size", () => {
    const big = { modelOptions: { images: [pngHeader(2048, 2048)] } };
    const ctx = (tree: Tree, policy = avatarPolicy()) =>
      sceneTextureMemory(createContext(loadRoom(tree), policy, STRICT, tree).ctx);
    const cap = textureMemory(1024, 1024);
    // The man stands in: the twin's figure counts his files at 1,024 a side; the visitor's, the largest folder.
    const both = ctx(night({ man: big }));
    expect([both.twin, both.visitor, both.stand_in, both.twin_own]).toEqual([cap, cap, cap, null]);
    // At texture_px 512, a quarter of that.
    const smaller = ctx(night({ man: big, figures: { texture_px: 512 } }));
    expect([smaller.twin, smaller.visitor]).toEqual([textureMemory(512, 512), textureMemory(512, 512)]);
    // The twin's own models, larger than the stand-in's files, count instead.
    const own = ctx(
      overlay({ ...nightFiles(), "assets/twin/fx-twin.glb": avatarModel({ images: [pngHeader(2048, 2048)] }).bytes }),
    );
    expect([own.twin_own, own.stand_in, own.twin]).toEqual([textureMemory(2048, 2048), 0, textureMemory(2048, 2048)]);
    // Without a stand-in, today's count.
    const plain = ctx(overlay({ ...nightFiles({ man: big }), [SCENE]: sceneWith(null) }));
    expect([plain.twin, plain.stand_in, plain.visitor]).toEqual([null, null, cap]);
  });

  it("RK3 refuses the total over the scene's cap in every build, the stand-in counted", () => {
    const big = { modelOptions: { images: [pngHeader(2048, 2048)] } };
    const tree = night({ man: big });
    const total = sceneTextureMemory(createContext(loadRoom(tree), avatarPolicy(), STRICT, tree).ctx).total;
    for (const options of [STRICT, LENIENT]) {
      expect(where(composed(tree, avatarPolicy({ room: { scene_texture_bytes: total } }), options).findings)).toEqual(
        [],
      );
      const over = composed(tree, avatarPolicy({ room: { scene_texture_bytes: total - 1 } }), options).findings;
      expect(where(over)).toEqual([`RK3 ${SCENE}:-`]);
    }
  });

  it("RK5: the first visit with both figures' files over main's phase-3 budget, refused strict and warned lenient", () => {
    const tree = night();
    const files = nightFiles();
    const gz = (path: string): number => gzipBytes(files[path] as Uint8Array);
    const man = ["man.glb", "man-idle.glb", "man-idle-holding.glb", "man-take.glb"].map((f) =>
      gz(`assets/visitors/man/${f}`),
    );
    const woman = ["woman.glb", "woman-idle.glb", "woman-idle-holding.glb", "woman-take.glb"].map((f) =>
      gz(`assets/visitors/woman/${f}`),
    );
    // The fixture set sets no room model, so the first visit is the stand-in's files and the largest other avatar's.
    const visit = man.reduce((a, b) => a + b, 0) + woman.reduce((a, b) => a + b, 0);
    expect(where(composed(tree, avatarPolicy({ phase3: visit })).findings)).toEqual([]);
    const strict = composed(tree, avatarPolicy({ phase3: visit - 1 }), STRICT).findings;
    expect(where(strict)).toEqual([`RK5 ${SCENE}:-`]);
    expect(strict[0]?.lenient).toBe(true);
    const lenient = composed(tree, avatarPolicy({ phase3: visit - 1 }), LENIENT);
    expect(where(lenient.findings)).toEqual([`RK5 ${SCENE}:-`]);
    expect(Object.keys(lenient.scene.avatars)).toEqual(["man", "woman"]);
  });
});

describe("the report's avatars (FR-040)", () => {
  it("gives each file's bytes, gzip-9 bytes, triangles, and memory, the clips by role, the scale, and the stand-in", () => {
    const woman = { modelOptions: { images: [pngHeader(2048, 1024)], height: 1.5 } };
    const result = composed(night({ woman }));
    const md = result.report.markdown;
    expect(md).toContain("### Avatars");
    expect(md).toContain("`assets/visitors/woman/woman.glb`");
    expect(md).toContain("`assets/visitors/man/man-take.glb`");
    // The woman's texture memory at its own size and at the cap, and the scale her reader's bounds imply for 1.58 m.
    expect(md).toContain(textureMemory(2048, 1024).toLocaleString("en-US"));
    expect(md).toContain(textureMemory(1024, 512).toLocaleString("en-US"));
    expect(md).toContain(`${Math.round((AVATAR_SHAPES.woman.height / 1.5) * 1000) / 1000}×`);
    expect(md).toMatch(/The twin shows `man`, a stand-in/);
    expect(md).toMatch(/First visit with both figures' files/);
    expect(md).toContain("F3");
  });

  it("says the twin shows its capsule while the stand-in has no files, or the scene names none", () => {
    expect(composed(overlay({ [SCENE]: sceneWith({ twin_stand_in: "man" }) })).report.markdown).toMatch(
      /The twin shows its capsule: `man` has no bundled model/,
    );
    expect(composed(goodTree(), noPolicy()).report.markdown).toMatch(
      /The twin shows its capsule: the scene names no stand-in/,
    );
  });
});

describe("the data-only proof set on the repository's own data (FR-037, SC-008)", () => {
  /** Where contracts/room-data-files.md §1 lets the compositor read, as data-only.test.ts holds it. */
  const READABLE = [
    /^apps\/web\/room(\/|$)/,
    /^apps\/web\/content\/room(\/|$)/,
    /^assets\/(room|twin|visitors)(\/|$)/,
    /^apps\/web\/fonts(\/|$)/,
    /^apps\/web\/content\/resume\.yaml$/,
    /^corpus(\/[^/]+\.md|\/facts(\/[^/]+\.yaml)?|\/intake\/private\/denylist\.txt)?$/,
    /^docs\/data-flow-disclosure\.md$/,
    /^intent(\/[^/]+\.md)?$/,
    /^specs(\/[^/]+(\/intent\.md)?)?$/,
  ];
  const policy = readRoomPolicy({ env: process.env, root: REPO });
  const committed = parse(new TextDecoder().decode(fileTree(REPO).read(SCENE_FILE) ?? new Uint8Array())) as Record<
    string,
    Record<string, unknown>
  >;

  it("names the man as the stand-in in the committed scene, with the defaults written out", () => {
    expect(committed.figures).toEqual({ twin_stand_in: "man", texture_px: 1024, wait_ms: 1500 });
  });

  it.each([
    ["the stand-in to woman", { twin_stand_in: "woman" }, { stand_in: "woman" }],
    ["texture_px to 512", { texture_px: 512 }, { texture_px: 512 }],
    ["wait_ms to 0", { wait_ms: 0 }, { wait_ms: 0 }],
  ])("%s: no finding, only the scene changed, only §1's paths read", (_, edit, expected) => {
    const scene = { ...committed, figures: { ...committed.figures, ...edit } };
    const tree = overlayTree(
      fileTree(REPO),
      new Map([[SCENE_FILE, encoder.encode(stringify(scene, { aliasDuplicateObjects: false, lineWidth: 0 }))]]),
    );
    const result = compose(tree, policy, STRICT);
    expect(result.findings.map((f) => formatFinding(f))).toEqual([]);
    expect(result.scene.figures).toMatchObject(expected);
    expect(tree.log.filter((path) => !READABLE.some((re) => re.test(path)))).toEqual([]);
  });
});
