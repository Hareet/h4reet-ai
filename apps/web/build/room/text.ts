// room-data.json's room text (spec 004; FR-029, FR-030, FR-061; Amendment B9; R-11, R-57; contracts/room-bundle.md §5):
// roomTextPart, the part of spec 002's roomDataFile (approvals.ts) that writes `room_text`, beside the resume's and
// narration's parts, so the room fetches its room text with them, once, at Enter (src/room/app.ts). It composes the
// tree under main's policy as the room's bundle does (plugin.ts), from the policy directory the build reads, and takes
// compose()'s room_text (emit.ts): the room-text files main approves under the kind room-text, and in a drafts build
// the drafts too, marked `state: "draft"`; each block's non-pending lines; each outline's words and drawing; no †
// field. So a release build publishes only what main approves as room text, which is what FR-077's case 2 counts, and
// a draft's words reach no file of a release build (FR-030). approvals.ts lists the same files in `published` and
// `drafts`, by the same kind. The compose is lenient, as the bundle's: the bundle's plugin fails the build on what it
// refuses, so this part needn't say it twice.
import type { RoomData, RoomDataPart } from "../approvals";
import { compose } from "./compose";
import { policyFrom } from "./policy";
import { fileTree } from "./source";

/** room-data.json's `room_text`, from the tree under `context.root` and the policy the build read. */
export const roomTextPart: RoomDataPart = (data, context): RoomData => {
  const { files } = context.policy;
  const policy = policyFrom(
    {
      caps: files["caps.json"],
      approvals: files["content-approvals.json"],
      header: files["resume-header.json"],
    },
    "policy-dir",
  );
  const { roomText } = compose(fileTree(context.root), policy, { mode: "lenient", drafts: context.drafts });
  return { ...data, room_text: roomText };
};
