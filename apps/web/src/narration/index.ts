// The narration display (spec 002, T053): its data, its view, and its styles. main.ts wires it to the interactive
// resume once at load, with the visitor's path.
import "./narration.css";

export { asRoomNarration, NARRATION_PATHS, type NarrationPath, type RoomNarration } from "./data";
export { DRAFT_LABEL, WORD_MS, WORDS_PER_MINUTE, wireNarration } from "./view";
