// The room's entry (spec 002, plan §1). Phase 1 serves the first screen as static HTML: the AI disclosure, the PDF
// link, and the data-flow disclosure link, which work without this script. The screens' router (choice, room,
// resume) is src/room/app.ts (tasks.md T040–T045), which replaces that screen with the choice. Nothing here writes a
// cookie, browser storage, or the URL (FR-003).
import "./style.css";
import "./fonts.css";

import { content } from "virtual:room-content";

import { asRoomNarration } from "./narration";
import { asRoomResume } from "./resume";
import { startRoom } from "./room/app";
import { resumeView, roomDataLoader } from "./room/resume-port";

// The interactive resume is Phase 3's view (tasks.md T029) in the room's panel, through src/room/resume-port.ts, which
// narrates a selected item at the path the visitor chose (tasks.md T053). room-data.json is fetched once for both.
const roomData = roomDataLoader();
startRoom({
  win: window,
  content,
  resume: resumeView(async () => asRoomResume(await roomData()), {
    load: async () => asRoomNarration(await roomData()),
  }),
});
