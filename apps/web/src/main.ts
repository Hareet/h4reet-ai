// The room's entry (spec 002, plan §1). Phase 1 serves the first screen as static HTML: the AI disclosure, the PDF
// link, and the data-flow disclosure link, which work without this script. The screens' router (choice, room,
// resume) is src/room/app.ts (tasks.md T040–T045), which replaces that screen with the choice. Nothing here writes a
// cookie, browser storage, or the URL (FR-003).
import "./style.css";
import "./fonts.css";

import { content } from "virtual:room-content";

import { startRoom } from "./room/app";
import { stubResumeView } from "./room/resume-port";

// The interactive resume is Phase 3's src/resume/ (tasks.md T029); this stub stands in until the branches meet.
startRoom({ win: window, content, resume: stubResumeView() });
