// roomBundle() (spec 004; FR-011, FR-013, FR-066; R-08, R-10, R-11, R-43; contracts/room-bundle.md §3, §12;
// contracts/room-data-files.md §14, §15): the Vite plugin that puts the room's bundle into the site, in place of spec
// 002's roomContentModule, since the room's first data (vite.config.ts; T096).
// - buildStart reads main's policy (policy.ts's readRoomPolicy: ROOM_POLICY_DIR, else refs/heads/main, else the
//   export's own copy) and composes once, in lenient mode, over the file-system tree, with drafts from spec 002's
//   draftsOn(process.env) (ROOM_DRAFTS=1). Each finding lenient mode tolerates, RX or RK2 on one piece's model, prints
//   through this.warn prefixed `warn`, and that piece keeps its stand-in; any other fails the build through
//   this.error, every such line in it, so `make up` builds with a misfit model and with nothing else wrong.
// - resolveId and load give `virtual:room-content`, spec 002's `content` (its fixed messages, and the manifest, now
//   B7's from the compose) and the index as `room`, for the entry chunk; `virtual:room-scene`, the 3D part as its
//   default export, which only the scene module imports, so it lands in the lazy 3D chunk; and, in a drafts build
//   only, `virtual:room-fixtures` and `virtual:room-lookdev`, which also gives the lookdev page its own copy of the
//   index as `room`, so the page never imports `virtual:room-content` and the index stays in the room's entry chunk,
//   and the drafts build's room_text as `text`, for the page's faces (spec 004, T192).
//   A release build that reaches either fails: resolveId throws "fixtures and lookdev are drafts-only (FR-066)"
//   rather than ship them.
// - `virtual:room-frame-log`, which the room's entry (src/main.ts) imports in every build (spec 004, T246; R-70): in a
//   drafts build it re-exports src/room/signals/frame-log.ts's `createFrameLog`, so the log lands in the entry; in a
//   release build it is `createFrameLog = null`, so the release build holds neither the log's code nor its names.
// - generateBundle emits each set model's `a/<stem>.<hash16>.glb.gz`, each bundled avatar file's (spec 009), each set
//   card plain, and room-manifest.json, each through this.emitFile, so under dist/. The plugin writes nothing else, anywhere: the committed generated files
//   are `room:generate`'s alone (cli.ts), and room_text reaches room-data.json through roomTextPart (T186).
// Every module is the compose's output serialized as §11 has it, so two builds of one commit and policy agree.
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

import { draftsOn } from "../approvals";
import { readMessages } from "../manifest";
import { talkLimits, twinReadiness } from "./readiness";
import { compose, formatFinding } from "./compose";
import type { ComposeResult } from "./compose";
import { serialize } from "./emit";
import { readRoomPolicy } from "./policy";
import type { RoomPolicy } from "./policy";
import { fileTree, isTreePath } from "./source";
import type { Tree } from "./source";

export const ROOM_CONTENT = "virtual:room-content";
export const ROOM_SCENE = "virtual:room-scene";
export const ROOM_FIXTURES = "virtual:room-fixtures";
export const ROOM_LOOKDEV = "virtual:room-lookdev";
export const ROOM_FRAME_LOG = "virtual:room-frame-log";
/** The frame log's module, which only a drafts build's `virtual:room-frame-log` reaches. */
const FRAME_LOG_MODULE = fileURLToPath(new URL("../../src/room/signals/frame-log.ts", import.meta.url));
/** What a release build that reaches a drafts-only module fails with (R-43's second layer). */
export const DRAFTS_ONLY = "fixtures and lookdev are drafts-only (FR-066)";

const MODULES: readonly string[] = [ROOM_CONTENT, ROOM_SCENE, ROOM_FIXTURES, ROOM_LOOKDEV, ROOM_FRAME_LOG];
const DRAFTS_MODULES: readonly string[] = [ROOM_FIXTURES, ROOM_LOOKDEV];
/** A virtual module's resolved ID: `\0` keeps every other plugin off it. */
const resolved = (id: string): string => `\0${id}`;

export interface RoomBundleOptions {
  /** The repository's root: the tree the compose reads, and where readRoomPolicy finds main. */
  readonly root: string;
  /** Spec 002's fixed messages, content/messages.yaml, which `content` carries as spec 002's plugin did. */
  readonly messages: string;
  /** The tree to compose: the file system under `root` unless a test gives another. */
  readonly tree?: () => Tree;
  /** Main's policy: readRoomPolicy's from the environment and `root` unless a test gives one. */
  readonly policy?: () => RoomPolicy;
}

/** The Vite plugin: the room's bundle, composed once a build. */
export function roomBundle(options: RoomBundleOptions): Plugin {
  let composed: ComposeResult | null = null;
  let limits: ReturnType<typeof talkLimits> | null = null;
  const result = (): ComposeResult => {
    if (composed === null) throw new Error("roomBundle: the room is composed at buildStart, which hasn't run");
    return composed;
  };
  return {
    name: "h4-room-bundle",
    buildStart() {
      const tree = options.tree?.() ?? fileTree(options.root);
      const policy = options.policy?.() ?? readRoomPolicy({ env: process.env, root: options.root });
      // The twin's readiness and limits, from the same tree (spec 007, FR-037, FR-041).
      composed = compose(tree, policy, {
        mode: "lenient",
        drafts: draftsOn(process.env),
        readiness: twinReadiness(tree),
      });
      limits = talkLimits(tree);
      const refused: string[] = [];
      for (const f of composed.findings) {
        if (f.lenient) this.warn(formatFinding(f, "lenient"));
        else refused.push(formatFinding(f, "lenient"));
      }
      if (refused.length > 0) this.error(refused.join("\n"));
    },
    resolveId(id) {
      if (!MODULES.includes(id)) return null;
      if (DRAFTS_MODULES.includes(id) && result().drafts === null) throw new Error(DRAFTS_ONLY);
      return resolved(id);
    },
    load(id) {
      switch (id) {
        case resolved(ROOM_CONTENT): {
          this.addWatchFile(options.messages);
          const { index, manifest } = result();
          const content = {
            messages: readMessages(options.messages),
            manifest,
            ...(limits === null ? {} : { twin: { limits } }),
          };
          return `export const content = ${serialize(content)};\nexport const room = ${serialize(index)};\n`;
        }
        case resolved(ROOM_SCENE):
          return `export default ${serialize(result().scene)};\n`;
        case resolved(ROOM_FRAME_LOG):
          return result().drafts === null
            ? "export const createFrameLog = null;\n"
            : `export { createFrameLog } from ${JSON.stringify(FRAME_LOG_MODULE)};\n`;
        case resolved(ROOM_FIXTURES):
        case resolved(ROOM_LOOKDEV): {
          const { drafts, index } = result();
          if (drafts === null) throw new Error(DRAFTS_ONLY);
          if (id === resolved(ROOM_FIXTURES)) return `export default ${serialize(drafts.fixtures)};\n`;
          // The page's own copy of the index: importing virtual:room-content would take it out of the room's entry. And
          // the build's room_text, so the page, and the phone copy that makes no request, draw the faces' words (T192).
          return (
            `export default ${serialize(drafts.lookdev)};\nexport const room = ${serialize(index)};\n` +
            `export const text = ${serialize(result().roomText)};\n`
          );
        }
        default:
          return null;
      }
    },
    generateBundle() {
      const { models, cards, avatars, manifest } = result();
      const emit = (fileName: string, source: string | Uint8Array): void => {
        // Each name is a/<stem>.<hash16>.<ext> or the manifest's: a path under dist/, never out of it.
        if (!isTreePath(fileName) || fileName === "") throw new Error("roomBundle: a file name outside dist/");
        this.emitFile({ type: "asset", fileName, source });
      };
      for (const m of models) emit(`${m.url}.gz`, m.gz);
      for (const c of cards) emit(c.url, c.bytes);
      // Spec 009's avatars (its FR-023; plan.md R-15): each bundled file's copy, with the room's pako call, beside the
      // models, and never a plain .glb.
      for (const a of avatars) emit(`${a.url}.gz`, a.gz);
      emit("room-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}
