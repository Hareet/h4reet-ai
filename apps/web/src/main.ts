// The room's entry (spec 002, plan §1). Phase 1 serves the first screen as static HTML: the AI disclosure, the PDF
// link, and the data-flow disclosure link, which work without this script. The screens' router (choice, room,
// resume) is src/room/app.ts (tasks.md T040–T045), which replaces that screen with the choice. Nothing here writes a
// cookie, browser storage, or the URL (FR-003).
import "./style.css";
import "./fonts.css";
// Spec 030 (FR-010; plan.md §R-B2): the active skin's custom properties, generated at build from
// content/ui-skins.yaml, before room.css (app.ts's).
import "virtual:ui-skin.css";

import { content, room } from "virtual:room-content";
import { createFrameLog } from "virtual:room-frame-log";

import { beaconEvents } from "./events";
import { asRoomResume } from "./resume";
import { startRoom } from "./room/app";
import { windowClock } from "./room/clock";
import { narrationFromRoomData, resumeView, roomDataLoader } from "./room/resume-port";
import { createTurnSender } from "./talk/turn-client";

// The interactive resume is Phase 3's view (tasks.md T029) in the room's panel, through src/room/resume-port.ts, which
// narrates a selected item at the path the visitor chose (tasks.md T053). room-data.json is fetched once for both and
// for the room's text (spec 004, T187): the room loads it at Enter, and once more 10 seconds later if that failed; the
// resume's view and the narration share that load, and load again after a failed one, on their next opening or
// selection.
// Usage events go out as beacons to the site's own /api/room/events (tasks.md T060). The room itself is the bundle's
// index, `room`, composed from apps/web/room/ at build (spec 004, T096). A drafts build gives the room its frame log,
// h4FrameLog() on the console; a release build's `createFrameLog` is null, and the room keeps none (spec 004, T246).
const roomData = roomDataLoader();
startRoom({
  win: window,
  content,
  room,
  resume: resumeView(async () => asRoomResume(await roomData()), { load: narrationFromRoomData(roomData) }),
  events: beaconEvents(window.navigator),
  roomData,
  // The twin's turns go to the site's own POST /api/room/turn (spec 007, plan §7; row V2 of the data-flow disclosure).
  sendTurn: createTurnSender({ fetch: (url, init) => window.fetch(url, init), clock: windowClock(window) }),
  ...(createFrameLog ? { frameLog: createFrameLog } : {}),
});
