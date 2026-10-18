// The interactive resume (spec 002, T029): its panel, its data, and its styles. The room's screens (Phase 4) mark
// their "Resume" and "Read the resume now" controls data-resume-open; main.ts wires them once at load.
import "./resume.css";

export { asRoomResume, type RoomResume } from "./data";
export { DRAFT_NOTICE, fetchRoomResume, PDF_HREF, resumePanel, wireResumeOpeners } from "./view";
