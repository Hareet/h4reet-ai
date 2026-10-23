// T081 and T080's generated files (spec 004; FR-014, FR-026, FR-038; Amendment B7; R-14, R-59; contracts/room-bundle.md
// §7 to §9): compose()'s `generated`, sorted by path, which `npm run room:generate` writes and commits. The events file
// in spec 002's exact shape, its objects the selectables; the topic mapping for the twin's spec; a work order per
// catalog entry, in §9.1's sections and order; and the photo guide, §9.2's fixed template with the photo-work setup and
// its checklist, and the layout checklist generated from the scene's anchors. None of them holds a path outside the
// repository, a studio folder's path, a host or user name, a time, or the bundle's digest.
import { join } from "node:path";

import { format, resolveConfig } from "prettier";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { roomTopicsFile } from "../../build/manifest";
import { REPO_ROOT } from "../../build/policy";
import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { exportRules, RULE_TEXT } from "../../src/room/glb/rules";
import { EVENT_KINDS } from "../../src/room/events";
import { goodFiles, goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy } from "../helpers/room-models";

const decoder = new TextDecoder();
const good = (): ComposeResult => compose(goodTree(), noPolicy(), { mode: "strict", drafts: true });
const file = (result: ComposeResult, path: string): string => {
  const found = result.generated.find((g) => g.path === path);
  if (!found) throw new Error(`no generated ${path}`);
  return found.text;
};
const PIECES = [
  "fx-board",
  "fx-desk",
  "fx-laptop",
  "fx-monitor",
  "fx-neon",
  "fx-plug",
  "fx-shell",
  "fx-sign",
  "fx-twin",
  "fx-visitor",
];
/** A section's body: the lines after its heading, to the next heading of its level or above. */
function section(text: string, heading: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`no ${heading}`);
  const level = heading.indexOf(" ");
  const end = lines.findIndex((l, i) => i > start && /^#+ /.test(l) && l.indexOf(" ") <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

describe("the generated files", () => {
  it("are the events file, the topic mapping, the photo guide, and a work order per catalog entry, sorted by path", () => {
    expect(good().generated.map((g) => g.path)).toEqual([
      "config/room-events.yaml",
      "config/room-topics.yaml",
      "docs/studio/photo-guide.md",
      ...PIECES.map((p) => `docs/studio/work-orders/${p}.md`),
    ]);
  });

  it("hold no path outside the repository, no studio folder's path, no host or user, no time, and no digest", () => {
    const result = good();
    for (const { path, text } of result.generated) {
      expect(text, path).not.toContain(result.digest);
      expect(text, path).not.toContain(result.digest.slice(0, 16));
      expect(text, path).not.toMatch(/(^|[\s(`])(\/home|\/tmp|\/srv|\/Users|~\/|[A-Z]:\\)/m);
      expect(text, path).not.toMatch(/\b\d{2}:\d{2}(:\d{2})?\b/);
      expect(text, path).not.toMatch(/\b[\w.-]+@[\w-]+\.[\w.-]+\b/);
      expect(text.endsWith("\n"), path).toBe(true);
      expect(text, path).not.toContain("\r");
    }
  });
});

describe("config/room-events.yaml (contracts/room-bundle.md §7)", () => {
  it("is spec 002's shape, its objects the selectables in scene order, every value quoted", () => {
    const text = file(good(), "config/room-events.yaml");
    expect(parse(text)).toEqual({
      schema: 1,
      kinds: [...EVENT_KINDS],
      objects: ["fx-workstation", "fx-board"],
      items: [],
    });
    for (const line of text.split("\n").filter((l) => l.startsWith("  - "))) expect(line).toMatch(/^ {2}- "[^"]*"$/);
    expect(
      text
        .split("\n")
        .filter((l) => l.startsWith("#"))
        .join(" "),
    ).toContain("npm run room:generate -w apps/web");
    expect(text).toContain("items: []\n");
  });

  it("takes the items from the resume's source", () => {
    const resume = "sections:\n  - title: Fixture section\n    items:\n      - { id: fx-item-one, title: One }\n";
    const result = compose(overlay({ "apps/web/content/resume.yaml": resume }), noPolicy(), {
      mode: "lenient",
      drafts: true,
    });
    expect(parse(file(result, "config/room-events.yaml")).items).toEqual(["fx-item-one"]);
  });
});

describe("config/room-topics.yaml (contracts/room-bundle.md §8)", () => {
  it("maps each talk selectable to its topic, corpus, and lead, values quoted, and holds no phrase", () => {
    const text = file(good(), "config/room-topics.yaml");
    expect(parse(text)).toEqual({
      schema: 1,
      selectables: [
        {
          id: "fx-workstation",
          topic: "fx-work",
          corpus: ["corpus/90-fx-work.md"],
          lead: "Fixture lead about the work first.",
        },
      ],
    });
    expect(text).toContain('  - id: "fx-workstation"\n    topic: "fx-work"\n');
    expect(text).toContain('    lead: "Fixture lead about the work first."\n');
    expect(text).not.toContain("fixture work");
    expect(text).not.toContain("the fixture room holds a desk");
  });

  it("writes lead: null where a selectable has none", () => {
    const scene = decoder
      .decode(goodFiles().get("apps/web/room/scene.yaml"))
      .replace(
        "{ talk: { topic: fx-work, lead: Fixture lead about the work first. } }",
        "{ talk: { topic: fx-work } }",
      );
    const text = file(
      compose(overlay({ "apps/web/room/scene.yaml": scene }), noPolicy(), { mode: "strict", drafts: true }),
      "config/room-topics.yaml",
    );
    expect(text).toContain("    lead: null\n");
  });
});

describe("the two YAML files, in a form Prettier accepts (contracts/room-bundle.md §13)", () => {
  /** What the repository's Prettier writes for `text` at `path`, with the configuration make lint's run resolves. */
  const prettier = async (path: string, text: string): Promise<string> => {
    const filepath = join(REPO_ROOT, path);
    const config = await resolveConfig(filepath, { editorconfig: true });
    return format(text, { ...config, filepath });
  };

  it("are what Prettier writes, as the known-good set composes them", async () => {
    const result = good();
    for (const path of ["config/room-events.yaml", "config/room-topics.yaml"]) {
      const text = file(result, path);
      expect(await prettier(path, text), path).toBe(text);
    }
  });

  it("stay what Prettier writes with a corpus list past the line's width, and a lead that quotes", async () => {
    const corpus = [1, 2, 3].map((n) => `corpus/9${n}-fx-a-topic-whose-corpus-file-has-a-long-name.md`);
    const leads = [
      'Fixture lead with a "quoted" word.',
      "The fixture's lead, with 'single' quotes.",
      'It\'s the "fixture" lead, both quotes.',
      'A backslash \\ and a quote after one: \\".',
      "A lead without quotes, plain.",
    ];
    const entries = leads.map((lead, i) => ({ id: `fx-select-${i}`, topic: "fx-work", corpus, lead }));
    const text = roomTopicsFile([
      ...entries,
      { id: "fx-quiet", topic: "fx-work", corpus: corpus.slice(0, 1), lead: null },
    ]);
    // the three paths in one flow list would run past Prettier's width of 120
    expect(`    corpus: [${corpus.map((c) => JSON.stringify(c)).join(", ")}]`.length).toBeGreaterThan(120);
    expect(await prettier("config/room-topics.yaml", text)).toBe(text);
    expect(parse(text)).toEqual({
      schema: 1,
      selectables: [
        ...entries.map((e) => ({ id: e.id, topic: e.topic, corpus, lead: e.lead })),
        { id: "fx-quiet", topic: "fx-work", corpus: corpus.slice(0, 1), lead: null },
      ],
    });
  });
});

describe("a work order (contracts/room-bundle.md §9.1)", () => {
  const order = (result: ComposeResult, piece: string): string => file(result, `docs/studio/work-orders/${piece}.md`);

  it("is titled with the piece's name, says it's generated, and holds §9.1's sections in order", () => {
    const text = order(good(), "fx-desk");
    const lines = text.split("\n");
    expect(lines[0]).toBe("# Work order: Fixture desk");
    expect(lines.slice(1, 4).join(" ")).toMatch(
      /npm run room:generate -w apps\/web.*apps\/web\/room\/catalog\/fx-desk\.yaml.*don't edit it/,
    );
    expect(lines.filter((l) => l.startsWith("## "))).toEqual([
      "## Method",
      "## Shots",
      "## Measurements",
      "## Size, origin, and bounds",
      "## Anchors",
      "## Live faces",
      "## States",
      "## Budget",
      "## Look",
      "## Export rules",
      "## Record",
      "## Studio notes",
    ]);
    expect(section(text, "## Method")).toContain("Fixture method for the desk");
    expect(section(text, "## Shots")).toContain(
      "- Fixture shot of the desk from the front\n- Fixture shot of the desk from the side",
    );
    expect(section(text, "## Studio notes")).toContain("Fixture studio notes for the desk");
  });

  it("adds a Measure line for each estimated field: the size, an anchor, a placement's or a pose's mount", () => {
    const measures = section(order(good(), "fx-desk"), "## Measurements")
      .split("\n")
      .filter((l) => l.startsWith("- "));
    expect(measures[0]).toBe("- Fixture measure of the desk's top");
    const marked = measures.filter((l) => l.startsWith("- Measure: "));
    expect(marked).toHaveLength(3);
    expect(marked[0]).toMatch(/the size.*1\.2 × 0\.75 × 0\.6 m/);
    expect(marked[1]).toMatch(/the anchor `corner`.*\(-0\.6, 0\.75, 0\.3\) m/);
    expect(marked[2]).toMatch(/`fx-desk`.*`fx-shell`.*`floor`.*\(0, 0, -0\.6\) m/);
    expect(section(order(good(), "fx-monitor"), "## Measurements")).not.toContain("Measure:");
  });

  it("gives the size, the stylized scale, the origin, and the expected bounds with their tolerance", () => {
    const desk = section(order(good(), "fx-desk"), "## Size, origin, and bounds");
    expect(desk).toContain("Fixture point on the floor below the desk's centre");
    expect(desk).toMatch(/from \(-0\.6, 0, -0\.3\) to \(0\.6, 0\.75, 0\.3\) m/);
    expect(desk).toMatch(/x 0\.036 m, y 0\.0225 m, z 0\.02 m/);
    // fx-sign at a stylized scale of 1.25: its bounds and size times the scale.
    const sign = section(order(good(), "fx-sign"), "## Size, origin, and bounds");
    expect(sign).toMatch(/0\.375 × 0\.15 × 0\.025 m/);
    expect(sign).toMatch(/from \(-0\.1875, 0, -0\.0125\) to \(0\.1875, 0\.15, 0\.0125\) m/);
  });

  it("lists the anchors and the live faces at the model's scale, with the faces' rule", () => {
    const desk = order(good(), "fx-desk");
    expect(section(desk, "## Anchors")).toContain("| `corner` | (-0.6, 0.75, 0.3) | (0, 0, 0) |");
    const faces = section(order(good(), "fx-sign"), "## Live faces");
    expect(faces).toContain("| `lettering` | (0, 0.075, 0.0125) | 0.35 × 0.125 | (0, 0, 1) | (0, 1, 0) |");
    expect(faces).toMatch(/one quad in one plain colour/);
    expect(faces).toMatch(/within 1 mm and 1°/);
    expect(section(desk, "## Live faces")).not.toContain("|");
  });

  it("gives a switch's piece its states: each pose, the value it claims, and where it sits", () => {
    const states = section(order(good(), "fx-plug"), "## States");
    expect(states).toMatch(/`fx-plugged`.*`local`.*`fx-laptop`.*`port`.*\(0\.03, 0, 0\) m.*\(0, 90, 0\)°/);
    expect(states).toMatch(/`fx-cloud`.*`cloud`/);
    expect(states).toMatch(/`fx-resting`.*claims nothing/);
    expect(states).toMatch(/never an animation/);
    expect(section(order(good(), "fx-desk"), "## States")).toMatch(/No switch places this piece/);
  });

  it("puts the budget beside the caps, and says where the caps came from", () => {
    const budget = section(order(good(), "fx-desk"), "## Budget");
    expect(budget).toContain("| gzip-9 bytes | 800,000 | 2,500,000 |");
    expect(budget).toContain("| Triangles | 8,000 | 40,000 |");
    expect(budget).toMatch(/FR-053's starting figures/);
    const capped = compose(goodTree(), capsPolicy({ triangles: 30000, small_props: ["fx-desk"] }), {
      mode: "strict",
      drafts: true,
    });
    const withCaps = section(order(capped, "fx-desk"), "## Budget");
    expect(withCaps).toContain("| Triangles | 8,000 | 30,000 |");
    expect(withCaps).toContain("| Largest texture side | 1,024 px | 1,024 px |");
    expect(withCaps).toMatch(/main's room caps/);
    expect(withCaps).not.toMatch(/policy-dir|[0-9a-f]{16}/);
  });

  it("gives the chosen look, the export rules and refusals from glb/rules.ts, a record template, and studio notes", () => {
    const text = order(good(), "fx-desk");
    const look = section(text, "## Look");
    expect(look).toMatch(/`fx-cel`.*inked-cel/);
    expect(look).toContain("Fixture material notes for the work orders");
    expect(look).toMatch(/no baked light, shadow, ambient occlusion, glow, or outline geometry/);
    const rules = section(text, "## Export rules");
    for (const rule of exportRules(1024)) {
      expect(rules).toContain(rule.title);
      expect(rules).toContain(rule.text);
    }
    for (const [rule, words] of Object.entries(RULE_TEXT)) expect(rules).toContain(`**${rule}** ${words}`);
    const record = section(text, "## Record");
    const json = /```json\n([\s\S]*?)\n```/.exec(record)?.[1] ?? "";
    expect(JSON.parse(json)).toMatchObject({
      file: "fx-desk.glb",
      kind: "room",
      media_license: "all-rights-reserved-2026",
    });
    expect(record).toMatch(/photo.*prompt.*asset.*design/);
    expect(record).toMatch(/D4/);
  });

  it("changes when its own piece does, and leaves every other piece's order unchanged", () => {
    const desk = decoder.decode(goodFiles().get("apps/web/room/catalog/fx-desk.yaml"));
    const changed = compose(
      overlay({ "apps/web/room/catalog/fx-desk.yaml": desk.replace("Fixture method for the desk", "Fixture way") }),
      noPolicy(),
      { mode: "strict", drafts: true },
    );
    const before = good();
    for (const piece of PIECES) {
      const same = order(changed, piece) === order(before, piece);
      expect(same, piece).toBe(piece !== "fx-desk");
    }
  });
});

describe("the photo guide (contracts/room-bundle.md §9.2)", () => {
  const guide = (): string => file(good(), "docs/studio/photo-guide.md");

  it("holds the fixed template's parts in order, then the layout checklist", () => {
    const lines = guide().split("\n");
    expect(lines[0]).toBe("# Photo guide");
    expect(lines.slice(1, 4).join(" ")).toMatch(/npm run room:generate -w apps\/web.*don't edit it/);
    expect(lines.filter((l) => l.startsWith("## "))).toEqual([
      "## Before the first shot",
      "## Where photo-derived files stay",
      "## Setting up photo work",
      "## The photo-work checklist",
      "## Tracing a sign's lettering",
      "## The layout checklist",
    ]);
  });

  it("gives FR-026's steps before the first shot, and quotes FR-025's paragraph exactly", () => {
    const text = guide();
    const first = section(text, "## Before the first shot");
    for (const step of [
      "pause camera-roll backup and gallery sync until cleanup",
      "turn location off",
      "move the photos over a USB cable straight into the studio's photos folder",
      "never send one through chat, email, a cloud drive, or an assistant",
      "delete them from the phone and its trash once the studio's copy checks out",
    ])
      expect(first.toLowerCase()).toContain(step.toLowerCase());
    expect(section(text, "## Where photo-derived files stay")).toContain(
      "Every file a photo touches SHALL stay inside the photos folder, which, with the blinding key, every Claude " +
        "session on the machine is denied, the studio's own included: ComfyUI's input, output, temp, and user folders " +
        "(its `--input-directory`, `--output-directory`, `--temp-directory`, and `--user-directory`), and any Blender " +
        "file that loads or links a photo, with its temporary files and autosaves. The studio's own Blender files, " +
        "temporary files, and autosaves SHALL sit in the workflows folder. Only what FR-024 lets the studio's agent " +
        "receive from a photo, each after the Author has reviewed it (a style frame, a mesh stripped to geometry, or a " +
        "sign's lettering outlines; FR-032), SHALL leave the photos folder, into the studio's inbox.",
    );
  });

  it("sets up photo work in five steps, with a checklist line for each", () => {
    const text = guide();
    const setup = section(text, "## Setting up photo work");
    for (const step of [
      "**Blender's Temporary Files.**",
      "**TMPDIR.**",
      "**The tracing tool's autosave.**",
      "**The tracing tool's recent files.**",
      "**ComfyUI.**",
    ])
      expect(setup).toContain(step);
    expect(setup).toContain("127.0.0.1");
    const checklist = section(text, "## The photo-work checklist")
      .split("\n")
      .filter((l) => l.startsWith("- [ ] "));
    expect(checklist).toEqual([
      "- [ ] Blender's Temporary Files folder is inside the photos folder.",
      "- [ ] TMPDIR is inside the photos folder.",
      "- [ ] The tracing tool's autosave is off.",
      "- [ ] The tracing tool's recent files are off.",
      "- [ ] ComfyUI listens on 127.0.0.1 alone, and only the Author queues it.",
    ]);
    expect(section(text, "## Tracing a sign's lettering")).toMatch(/outline_check\.py.*studio's inbox/s);
  });

  it("names no ID in its template: only the layout checklist names placements", () => {
    const text = guide();
    const template = text.slice(0, text.indexOf("## The layout checklist"));
    expect(template).not.toMatch(/fx-/);
  });

  it("measures each desk item from the desk's corner, then each piece on the shell by its anchor and offset", () => {
    const layout = section(guide(), "## The layout checklist");
    const rows = layout.split("\n").filter((l) => l.startsWith("- [ ] "));
    // A placement with a label is named by its label word. The laptop's is read from the fixture set's words: spelled
    // here, it would hold an ID the room's own data defines, which the source scan refuses (FR-007).
    const laptop = good().index.ui["label.fx-laptop"] ?? "";
    expect(laptop).toMatch(/^fixture \S/);
    expect(rows).toEqual([
      "- [ ] fixture monitor: x 0.32, y 0, z -0.5 (estimated)",
      "- [ ] `fx-neon`: x 0.32, y 0.42, z -0.5 (estimated)",
      `- [ ] ${laptop}: x 0.77, y 0, z -0.3 (estimated)`,
      "- [ ] `fx-sign`: x 0.2, y 0, z -0.15 (estimated)",
      "- [ ] fixture desk: on the anchor `floor`, offset x 0, y 0, z -0.6 (estimated)",
      "- [ ] `fx-board`: on the anchor `wall`, offset x 0, y 0.35, z 0 (measured)",
    ]);
  });

  it("marks a desk item measured once its mounts and the corner are measured", () => {
    const desk = decoder
      .decode(goodFiles().get("apps/web/room/catalog/fx-desk.yaml"))
      .replace("corner: { at: [-0.6, 0.75, 0.3], estimated: true }", "corner: { at: [-0.6, 0.75, 0.3] }");
    const text = file(
      compose(overlay({ "apps/web/room/catalog/fx-desk.yaml": desk }), noPolicy(), { mode: "strict", drafts: true }),
      "docs/studio/photo-guide.md",
    );
    expect(text).toContain("- [ ] fixture monitor: x 0.32, y 0, z -0.5 (measured)\n");
  });
});
