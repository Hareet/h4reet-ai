// The compositor's outputs (spec 004; FR-010 to FR-014, FR-073, FR-079; R-11, R-12; contracts/room-bundle.md §3 to
// §10): a typed stub that returns each output empty; T080 writes it. compose() calls `emit` once, after every family,
// with the loaded room, the policy, the options, and the sorted findings, whose lenient ones (RX and RK2) decide which
// pieces keep their stand-ins with the reason `findings`; a finding lenient mode doesn't tolerate means the outputs
// aren't used. What T080 writes, each field by field in its schema's order, numbers quantized, nothing from the
// machine (§11): the index (§3.1), the 3D part (§3.2), the drafts modules (§3.3), the models' .gz copies (§3.4), the
// digest (§4), `room_text` (§5), the manifest (§6), the generated files (§7 to §9, sorted by path), and the report
// (§10).
import type { Look, RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import type { TierValue, TypefaceUse } from "../../src/room/compose/vocabulary";
import type { FitInput } from "../../src/room/glb/fit";
import type { ComposeOptions, Finding } from "./checks/family";
import type { LoadedRoom } from "./load";
import type { CapsSource, RoomCaps, RoomPolicy } from "./policy";
import type { TurnOutcome } from "./schema";
import type { Tree } from "./source";

/** A fixture, typed by the signals: `virtual:room-fixtures` (§3.3). */
export interface RoomFixture {
  readonly id: string;
  readonly tier: TierValue;
  readonly turns: readonly TurnOutcome[];
}

/** The lookdev page's inputs: `virtual:room-lookdev` (§3.3). */
export interface RoomLookdev {
  readonly vignette: { readonly show: readonly string[] };
  readonly close_up: { readonly frame: readonly string[] };
  readonly looks: readonly Look[];
  /** Each piece's fit inputs: its expected bounds and live faces at the stylized scale, its budget, whether the caps
   *  list it as a small prop. */
  readonly pieces: Readonly<
    Record<
      string,
      {
        readonly fit: FitInput;
        readonly budget: {
          readonly gzip_bytes: number;
          readonly triangles: number;
          readonly texture_px: number;
          readonly texture_bytes: number;
        };
        readonly small_prop: boolean;
      }
    >
  >;
  /** The caps the compose read, or FR-053's starting figures. */
  readonly caps: RoomCaps;
  readonly caps_source: CapsSource;
}

/** `room-data.json`'s `room_text` (§5): published blocks and outlines, sorted by ID. */
export interface RoomText {
  readonly blocks: readonly {
    readonly id: string;
    readonly source: string;
    readonly sha256: string;
    readonly state: "approved" | "draft";
    readonly lines: readonly { readonly text: string }[];
    readonly outline?: {
      readonly view_box: readonly [number, number, number, number];
      readonly cap_height: number;
      readonly advance: number;
      readonly paths: readonly string[];
    };
  }[];
}

/** `room-manifest.json` (§6): spec 002's manifest with Amendment B7's fields. */
export interface RoomManifest {
  readonly objects: readonly {
    readonly id: string;
    readonly action: "talk" | "resume";
    readonly topic: string | null;
    readonly ready: boolean | null;
  }[];
  readonly free_talk: { readonly ready: boolean };
  readonly items: readonly string[];
  readonly avatars: readonly string[];
  readonly placeholders: boolean;
  readonly standins: readonly { readonly placement: string; readonly reason: "no-model" | "no-caps" | "findings" }[];
  readonly live_source: "off" | "site";
  readonly build_kind: "release" | "drafts";
  readonly caps: { readonly source: CapsSource; readonly sha256: string | null };
  readonly event_kinds: readonly string[];
}

/** FR-073's report (§10), as Markdown. */
export interface RoomReport {
  readonly markdown: string;
}

/** contracts/room-bundle.md §1's ComposeResult, but its findings, and with the set image cards beside the models. */
export interface RoomOutputs {
  readonly digest: string;
  readonly index: RoomIndex;
  readonly scene: RoomScene;
  /** Null unless the options say drafts. */
  readonly drafts: { readonly fixtures: readonly RoomFixture[]; readonly lookdev: RoomLookdev } | null;
  readonly models: readonly {
    readonly piece: string;
    readonly url: string;
    readonly gz: Uint8Array;
    readonly sha256: string;
  }[];
  /** Each set image card, emitted plain at `dist/<url>` (§3.4). */
  readonly cards: readonly {
    readonly piece: string;
    readonly url: string;
    readonly bytes: Uint8Array;
    readonly sha256: string;
  }[];
  readonly roomText: RoomText;
  readonly manifest: RoomManifest;
  readonly generated: readonly { readonly path: string; readonly text: string }[];
  readonly report: RoomReport;
}

/** What emit reads beside the loaded room: the tree, for the models, the fonts, the resume, and the room text's bytes,
 *  and whether RT2 passed a string, so the report never prints one it refused. compose() passes its family context. */
export interface EmitReader {
  readonly tree: Tree;
  printable(value: string): boolean;
}

/** The outputs of one compose: the room as loaded, the policy as read, the options, the findings, sorted, and the
 *  reader. */
export type Emit = (
  room: LoadedRoom,
  policy: RoomPolicy,
  options: ComposeOptions,
  findings: readonly Finding[],
  reader: EmitReader,
) => RoomOutputs;

/** §11's serialization: JSON with no whitespace, each object's fields in the order emit wrote them. */
export function serialize(value: unknown): string {
  void value;
  return "";
}

const NO_FACE = { family: "", weight: 400 } as const;
const NO_LOOK: Look = {
  version: 1,
  id: "",
  method: "flat",
  palette: {},
  lights: {
    ambient: { sky: "#000000", ground: "#000000", intensity: 0 },
    key: { color: "#000000", intensity: 0, from: [0, 1, 0], shadows: false },
  },
  shading: { steps: 2 },
  outlines: { color: "#000000", width: 0 },
  glow_tones: {},
  typefaces: Object.fromEntries(
    (["terminal", "desktop-session", "chalk", "neon", "counters"] as const).map((use) => [use, { ...NO_FACE }]),
  ) as Record<TypefaceUse, { family: string; weight: number }>,
};

/** The stub: every output empty, as its type allows; the build's kind and the caps' source as the inputs give them. */
export const emit: Emit = (room, policy, options) => {
  const kind = options.drafts ? "drafts" : "release";
  const live = room.scene?.value.live;
  const lookdev: RoomLookdev = {
    vignette: { show: [] },
    close_up: { frame: [] },
    looks: [],
    pieces: {},
    caps: policy.caps ?? {
      gzip_bytes: 0,
      triangles: 0,
      small_props: [],
      small_prop_texture_px: 0,
      scene_texture_bytes: 0,
      legibility_floor_css_px: 0,
    },
    caps_source: policy.caps_source,
  };
  return {
    digest: "",
    index: {
      schema: 1,
      digest: "",
      build: { kind, placeholders: true },
      live: {
        source: live?.source ?? "off",
        turn: live?.turn ?? "off",
        asset_events: live?.asset_events ?? "off",
        poll_ms: 0,
        freshness_ms: 0,
      },
      ui: {},
      selectables: [],
      topics: [],
      faces: [],
      switches: [],
      flat: {
        view_box: [0, 0, 320, 200],
        items: [],
        poses: [],
        faces: [],
        hits: [],
        labels: [],
        papers: [
          [0, 0],
          [0, 0],
          [0, 0],
        ],
        visitor: { x: 0, baseline: 0, scale: 1 },
      },
      copy: [],
      typefaces: [],
    },
    scene: {
      schema: 1,
      digest: "",
      pieces: {},
      placements: [],
      switches: [],
      look: NO_LOOK,
      figures: { twin: "", visitor: "" },
      handoff: { from: { placement: "", anchor: "" }, to: { placement: "", anchor: "" } },
      load_order: [],
    },
    drafts: options.drafts ? { fixtures: [], lookdev } : null,
    models: [],
    cards: [],
    roomText: { blocks: [] },
    manifest: {
      objects: [],
      free_talk: { ready: false },
      items: [],
      avatars: [],
      placeholders: true,
      standins: [],
      live_source: live?.source ?? "off",
      build_kind: kind,
      caps: { source: policy.caps_source, sha256: policy.caps_sha256 },
      event_kinds: [],
    },
    generated: [],
    report: { markdown: "" },
  };
};
