// The interactive resume (spec 002, T029): its panel, its data, and its styles. The room (Phase 4) shows it in its
// resume panel through src/room/resume-port.ts.
import "./resume.css";

export { asRoomResume, type RoomResume } from "./data";
export { DRAFT_NOTICE, fetchRoomResume, LOAD_FAILED, PDF_HREF, resumePanel } from "./view";
