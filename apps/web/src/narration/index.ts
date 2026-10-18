// The narration display (spec 002, T053): its data, its view, and its styles. src/room/resume-port.ts drives it from
// the room's resume panel, with the visitor's chosen path.
import "./narration.css";

export { asRoomNarration, NARRATION_PATHS, type NarrationPath, type RoomNarration } from "./data";
export {
  createNarrator,
  DRAFT_LABEL,
  NARRATION_AI_LINE,
  type NarrationSource,
  type Narrator,
  WORD_MS,
  WORDS_PER_MINUTE,
} from "./view";
