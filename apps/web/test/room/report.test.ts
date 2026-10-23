// T081's report (spec 004; FR-073, FR-052, FR-053, SC-006, SC-010; R-24; contracts/room-bundle.md §10;
// contracts/plain-model-fit.md §8.3): compose()'s `report`, the Markdown `npm run room:report` prints and every
// merge-request note that changes the room pastes whole. Its parts, in §10's form: the header (the digest, the build,
// the caps); a row per piece; the totals; the first visit; the legibility of every bound face on both reference stages;
// the switches, their cases and every two poses' separation (RG8); and the findings. Bytes are integers with thousands
// separators, glyph heights to 0.1 px, and nothing is a time, a path outside the repository, or a data string.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createContext } from "../../build/room/checks/family";
import { sceneTextureMemory } from "../../build/room/checks/rk";
import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { emit } from "../../build/room/emit";
import { loadRoom } from "../../build/room/load";
import { noPolicy } from "../../build/room/policy";
import { textureMemory } from "../../src/room/glb/fit";
import { gzipBytes } from "../../src/room/glb/gzip";
import { desk, png, sign } from "../helpers/glb";
import { goodFiles, goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";

const decoder = new TextDecoder();
const good = (): ComposeResult => compose(goodTree(), noPolicy(), { mode: "strict", drafts: true });
const lines = (r: ComposeResult): string[] => r.report.markdown.split("\n");
const thousands = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const PIECE_HEADER =
  "| Piece | Placements | Source | Bytes | gzip-9 bytes | Triangles | Texture memory | Budget (gzip-9 · triangles · texture) |";
const FACE_HEADER = "| Face | Readable | Desktop | Phone | Floor | Margin | Status |";
const PAIR_HEADER = "| Switch | Poses | Desktop | Phone | Status |";

/** The changes that set `card` as fx-sign's image card, recorded with the kind room and its SHA-256 (RI7). */
function cardChanges(card: Uint8Array): Record<string, string | Uint8Array> {
  const entry = decoder.decode(goodFiles().get("apps/web/room/catalog/fx-sign.yaml"));
  const record = {
    schema: 1,
    directory: "assets/room",
    license: "all-rights-reserved-2026",
    entries: [{ file: "fx-sign.png", sha256: sha256(card), kind: "room" }],
  };
  return {
    "apps/web/room/catalog/fx-sign.yaml": `${entry}model: { card: fx-sign.png }\n`,
    "assets/room/fx-sign.png": card,
    "assets/room/records.json": `${JSON.stringify(record, null, 2)}\n`,
  };
}

describe("the report's header and per-piece rows", () => {
  it("opens with the bundle's digest, the build's kind, and FR-053's starting figures while main has no room caps", () => {
    const result = good();
    expect(lines(result).slice(0, 3)).toEqual([
      "## Room report",
      "",
      `Bundle ${result.digest.slice(0, 16)} · drafts build · caps: FR-053's starting figures: main has no room caps; every model stays a stand-in`,
    ]);
    const release = compose(goodTree(), noPolicy(), { mode: "strict", drafts: false });
    expect(lines(release)[2]).toMatch(/· release build ·/);
  });

  it("names the caps' source and the first 16 hex of their SHA-256 when main has them", () => {
    const policy = capsPolicy();
    const result = compose(goodTree(), policy, { mode: "strict", drafts: false });
    expect(lines(result)[2]).toBe(
      `Bundle ${result.digest.slice(0, 16)} · release build · caps: policy-dir, assets/policy/caps.json ${policy.caps_sha256?.slice(0, 16)}`,
    );
  });

  it("gives every piece a row: its placements and poses, its source, and its budget, a stand-in's measures dashes", () => {
    const md = good().report.markdown;
    const rows = md.split("\n");
    const at = rows.indexOf(PIECE_HEADER);
    expect(at).toBeGreaterThan(0);
    expect(rows[at + 1]).toBe("|---|---:|---|---:|---:|---:|---:|---|");
    expect(rows.slice(at + 2, at + 12)).toEqual([
      "| `fx-board` | 1 | stand-in (no-model) | – | – | – | – | 300,000 · 2,000 · 5,592,405 |",
      "| `fx-desk` | 1 | stand-in (no-model) | – | – | – | – | 800,000 · 8,000 · 5,592,405 |",
      "| `fx-laptop` | 1 | stand-in (no-model) | – | – | – | – | 500,000 · 5,000 · 1,398,101 |",
      "| `fx-monitor` | 1 | stand-in (no-model) | – | – | – | – | 600,000 · 6,000 · 5,592,405 |",
      "| `fx-neon` | 1 | stand-in (no-model) | – | – | – | – | 200,000 · 3,000 · 349,525 |",
      "| `fx-plug` at 2× | 3 | stand-in (no-model) | – | – | – | – | 100,000 · 1,000 · 87,381 |",
      "| `fx-shell` | 1 | stand-in (no-model) | – | – | – | – | 400,000 · 2,000 · 1,398,101 |",
      "| `fx-sign` at 1.25× | 1 | stand-in (no-model) | – | – | – | – | 150,000 · 1,500 · 349,525 |",
      "| `fx-twin` | 1 | avatar | – | – | – | – | 100,000 · 1,000 · 349,525 |",
      "| `fx-visitor` | 1 | avatar | – | – | – | – | 100,000 · 1,000 · 349,525 |",
    ]);
  });

  it("gives a set model's file, plain and gzip-9 bytes, triangles, and texture memory, and the largest against the caps", () => {
    const SET = ["fx-board", "fx-desk", "fx-plug"];
    const files = modelChanges(SET);
    const result = compose(overlay(files), capsPolicy(), { mode: "strict", drafts: true });
    const md = result.report.markdown;
    const desk = files["assets/room/fx-desk.glb"] as Uint8Array;
    expect(md).toContain(
      `| \`fx-desk\` | 1 | studio, \`fx-desk.glb\` | ${thousands(desk.length)} | ${thousands(gzipBytes(desk))} | 12 | 0 | 800,000 · 8,000 · 5,592,405 |`,
    );
    const largest = Math.max(...SET.map((p) => gzipBytes(files[`assets/room/${p}.glb`] as Uint8Array)));
    expect(md).toContain(
      `Per piece, the largest against the caps: ${thousands(largest)} of 2,500,000 gzip-9 bytes; 14 of 40,000 triangles.`,
    );
    const share = SET.reduce((n, p) => n + gzipBytes(files[`assets/room/${p}.glb`] as Uint8Array), 0);
    const f3 = Object.entries(files)
      .filter(([path]) => path.startsWith("assets/room/"))
      .reduce((n, [, data]) => n + gzipBytes(data), 0);
    expect(md).toContain(
      `First visit, the room's share: ${thousands(share)} gzip-9 bytes of placed models and cards, beside the design's ` +
        `estimate of 12,000,000; the enforced limit is spec 003's phase-3 first visit, 25,000,000. Spec 003's F3 view, ` +
        `every file under assets/room/: ${thousands(f3)}.`,
    );
    expect(sha256(desk)).toBe(result.models.find((m) => m.piece === "fx-desk")?.sha256);
  });

  it("gives a set image card's bytes as served, its file as stored, never a gzip-9 length", () => {
    // A stored PNG of 64 × 32: its gzip-9 copy is far shorter, and only its plain length is served or checked (RK2).
    const card = png({ width: 64, height: 32, level: 0 });
    expect(gzipBytes(card)).toBeLessThan(card.length);
    const result = compose(overlay(cardChanges(card)), capsPolicy(), { mode: "strict", drafts: true });
    expect(result.findings).toEqual([]);
    expect(result.report.markdown).toContain(
      `| \`fx-sign\` at 1.25× | 1 | studio, \`fx-sign.png\` | ${thousands(card.length)} | ` +
        `${thousands(card.length)} as stored | – | ${thousands(textureMemory(64, 32))} | 150,000 · 1,500 · 349,525 |`,
    );
  });

  it("says why a piece with a model stays a stand-in, naming the findings' rules and never their data", () => {
    const tree = overlay(modelChanges(["fx-desk"]));
    const out = emit(
      loadRoom(tree),
      capsPolicy(),
      { mode: "lenient", drafts: false },
      [
        { rule: "RK2", file: "assets/room/fx-desk.glb", path: "-", reason: "over its budget", lenient: true },
        { rule: "RX7", file: "assets/room/fx-desk.glb", path: "-", reason: "bounds off", lenient: true },
      ],
      { tree, printable: () => true },
    );
    expect(out.report.markdown).toContain("| `fx-desk` | 1 | stand-in (findings: RX7, RK2) |");
    expect(out.report.markdown).toContain("```text\nwarn RK2 assets/room/fx-desk.glb:-: over its budget\n");
    const none = compose(overlay(modelChanges(["fx-desk"])), noPolicy(), { mode: "strict", drafts: true });
    expect(none.report.markdown).toContain("| `fx-desk` | 1 | stand-in (no-caps) |");
  });
});

describe("the report's totals", () => {
  it("sums the scene's texture memory by class, as RK3 sums it, noting the figures' missing files", () => {
    const result = good();
    const placed = ["fx-board", "fx-desk", "fx-laptop", "fx-monitor", "fx-neon", "fx-plug", "fx-shell", "fx-sign"];
    const budgets = placed.reduce((n, p) => {
      const text = decoder.decode(goodFiles().get(`apps/web/room/catalog/${p}.yaml`));
      return n + Number(/texture_bytes: (\d+)/.exec(text)?.[1]);
    }, 0);
    const canvases = result.index.faces.reduce((n, f) => {
      const w = Math.min(f.px[0], Math.floor(f.screen_css[0] * 2.8125));
      const h = Math.min(f.px[1], Math.floor(f.screen_css[1] * 2.8125));
      return n + Math.floor((16 * w * h) / 3);
    }, 0);
    expect(result.report.markdown).toContain(
      `Scene texture memory: ${thousands(budgets + canvases)} of 96,000,000 bytes (models ${thousands(budgets)} · ` +
        `image cards 0 · avatars 0 · live-face canvases ${thousands(canvases)}).`,
    );
    expect(result.report.markdown).toMatch(/The twin's and the visitors' avatars have no file under assets\/ yet/);
    expect(result.report.markdown).toContain(
      "Per piece, the largest against the caps: 0 of 2,500,000 gzip-9 bytes; 0 of 40,000 triangles.",
    );
  });

  it("prints RK3's own total and classes, through RK3's function: the figures' models measured, a set card a card", () => {
    const deskMemory = textureMemory(8, 8) + textureMemory(16, 8) + textureMemory(4, 4);
    const signMemory = textureMemory(4, 4) + textureMemory(8, 8);
    const tree = overlay({
      ...cardChanges(png({ width: 8, height: 8 })),
      // The twin in two models, and three avatars: two models, one, and one that can't be read.
      "assets/twin/fx-twin.glb": desk().bytes,
      "assets/twin/fx-hands/fx-hands.glb": sign().bytes,
      "assets/visitors/fx-dog/fx-dog.glb": desk().bytes,
      "assets/visitors/fx-dog/fx-collar.glb": sign().bytes,
      "assets/visitors/fx-cat/fx-cat.glb": desk().bytes,
      "assets/visitors/fx-owl/fx-owl.glb": desk().bytes.subarray(0, 40),
    });
    const policy = capsPolicy();
    const options = { mode: "strict", drafts: true } as const;
    const result = compose(tree, policy, options);
    expect(result.findings).toEqual([]);
    const rk3 = sceneTextureMemory(createContext(loadRoom(tree), policy, options, tree).ctx);
    expect([rk3.figures, rk3.unread]).toEqual([2 * (deskMemory + signMemory), { twin: 0, visitor: 1 }]);
    expect(rk3.cards).toBe(349_525);
    expect(rk3.models + rk3.cards).toBe(rk3.pieces);
    expect(rk3.total).toBe(rk3.pieces + rk3.figures + rk3.canvases);
    const md = result.report.markdown;
    expect(md).toContain(
      `Scene texture memory: ${thousands(rk3.total)} of 96,000,000 bytes (models ${thousands(rk3.models)} · ` +
        `image cards ${thousands(rk3.cards)} · avatars ${thousands(rk3.figures)} · ` +
        `live-face canvases ${thousands(rk3.canvases)}).`,
    );
    expect(md).toContain("1 model under assets/visitors/ can't be read, so it counts 0.");
    expect(md).not.toMatch(/have no file under assets/);
  });

  it("notes a small prop the caps name that the catalog doesn't have, by its index", () => {
    const result = compose(goodTree(), capsPolicy({ small_props: ["fx-sign", "fx-gone"] }), {
      mode: "strict",
      drafts: true,
    });
    expect(result.report.markdown).toMatch(/small_props\[1\] names no piece of the catalog/);
    expect(result.report.markdown).not.toContain("fx-gone");
  });
});

describe("the report's legibility and switches", () => {
  it("gives every bound face's smallest cap height on both reference stages, the floor, the margin, and its status", () => {
    const rows = lines(good());
    const at = rows.indexOf(FACE_HEADER);
    expect(rows[at + 1]).toBe("|---|---|---:|---:|---:|---:|---|");
    const faces = rows.slice(at + 2, at + 6);
    expect(faces.map((r) => r.split(" | ")[0])).toEqual([
      "| `fx-monitor.screen`",
      "| `fx-neon.panel`",
      "| `fx-board.slate`",
      "| `fx-sign.lettering`",
    ]);
    for (const row of faces) {
      const m =
        /^\| `[^`]+` \| (yes|no) \| (\d+\.\d) px \| (\d+\.\d) px \| 9 \| (-?\d+\.\d) px \| (readable|under) \|$/.exec(
          row,
        );
      expect(m, row).not.toBeNull();
      const [desktop, phone, margin] = [m?.[2], m?.[3], m?.[4]].map(Number);
      const smallest = Math.min(desktop ?? 0, phone ?? 0);
      expect(Math.abs((margin ?? 0) - (smallest - 9))).toBeLessThanOrEqual(0.11);
      expect(m?.[5]).toBe(smallest >= 9 ? "readable" : "under");
    }
  });

  it("marks an atmosphere face with its content cap", () => {
    const scene = decoder
      .decode(goodFiles().get("apps/web/room/scene.yaml"))
      .replace(
        "    label: label.fx-laptop\n",
        [
          "    label: label.fx-laptop",
          "    faces:",
          "      lid:",
          "        label: label.fx-lid",
          "        atmosphere: true",
          "        max_chars: 24",
          "        regions:",
          "          - { rect: [0, 0, 1, 1], renderer: terminal, grid: { cols: 12, rows: 3 }, text: fx-script }",
          "",
        ].join("\n"),
      );
    const words = `${decoder.decode(goodFiles().get("apps/web/room/ui-words.yaml"))}  label.fx-lid: fixture lid\n`;
    const result = compose(
      overlay({ "apps/web/room/scene.yaml": scene, "apps/web/room/ui-words.yaml": words }),
      noPolicy(),
      { mode: "lenient", drafts: true },
    );
    expect(result.report.markdown).toMatch(/^\| `fx-laptop\.lid` \| no \| .* \| atmosphere \(max 24\) \|$/m);
  });

  it("gives each switch's cases, and every two poses' largest on-screen separation on both stages", () => {
    const rows = lines(good());
    expect(rows).toContain(
      "| `fx-power` | `fx-plugged` | `fx-cloud` | `fx-resting` | `fx-resting` | `fx-resting` | `fx-resting` | `fx-resting` | `fx-resting` |",
    );
    const at = rows.indexOf(PAIR_HEADER);
    expect(rows[at + 1]).toBe("|---|---|---:|---:|---|");
    const pairs = rows.slice(at + 2, at + 5);
    expect(pairs.map((r) => r.split(" | ")[1])).toEqual([
      "`fx-plugged` / `fx-cloud`",
      "`fx-plugged` / `fx-resting`",
      "`fx-cloud` / `fx-resting`",
    ]);
    for (const row of pairs) {
      const m = /\| (\d+\.\d) px \| (\d+\.\d) px \| (apart|under the floor) \|$/.exec(row);
      expect(m, row).not.toBeNull();
      expect(m?.[3]).toBe(Math.min(Number(m?.[1]), Number(m?.[2])) >= 9 ? "apart" : "under the floor");
    }
  });
});

describe("the report's findings, and what it never holds", () => {
  it("ends with Findings: none, or every finding's line, a lenient one marked warn in a lenient build", () => {
    expect(good().report.markdown.endsWith("\nFindings: none.\n")).toBe(true);
    const result = compose(
      overlay({
        "apps/web/room/lookdev.yaml": "version: 1\nvignette: { show: [fx-gone] }\nclose_up: { frame: [fx-desk] }\n",
      }),
      noPolicy(),
      { mode: "strict", drafts: true },
    );
    expect(result.report.markdown).toMatch(
      /\nFindings: 1\.\n\n```text\nRI10 apps\/web\/room\/lookdev\.yaml:vignette\.show\[0\]: [^\n]+\n```\n$/,
    );
  });

  it("holds no data string, no time, and no path outside the repository", () => {
    const md = good().report.markdown;
    for (const value of [
      "Fixture desk",
      "fixture desk",
      "Fixture workstation",
      "fixture work",
      "Plan small",
      "Glowword",
      "Fixture point",
      "Fixture lead",
    ])
      expect(md, value).not.toContain(value);
    expect(md).not.toMatch(/\b\d{2}:\d{2}\b/);
    expect(md).not.toMatch(/(^|[\s(`])(\/home|\/tmp|\/srv|\/Users|[A-Z]:\\)/m);
  });

  it("names an element by its path where RT2 refused its ID, and a piece, which has none, by the refusal", () => {
    const tree = goodTree();
    const refused = new Set(["fx-desk", "fx-monitor", "fx-power", "fx-cloud"]);
    const out = emit(loadRoom(tree), noPolicy(), { mode: "strict", drafts: true }, [], {
      tree,
      printable: (v) => !refused.has(v),
    });
    const md = out.report.markdown;
    expect(md).not.toMatch(/fx-desk|fx-monitor|fx-power|fx-cloud/);
    expect(md).toContain("| (an ID RT2 refused) | 1 | stand-in (no-model) |");
    expect(md).toContain("| placements[2].faces.screen | yes |");
    expect(md).toContain("| switches[0] | `fx-plugged` | switches[0].poses | `fx-resting` |");
    expect(md).toContain("| switches[0] | `fx-plugged` / switches[0].poses |");
  });
});
