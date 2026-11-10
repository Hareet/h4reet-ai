// The room's screens (spec 002, plan §4; T040–T045; contracts/room-scene.md; data-model.md §9): the choice, the
// hand-off, and the room, with the resume one action away. One visit per page, in this function's memory only: no
// cookie, no browser storage, no URL or history, so a reload starts a new visit at the choice (FR-002, FR-003).
//
// - The choice screen comes first. Behind it, the WebGL 2 check runs and, only if it passes, the 3D chunk (scene.ts)
//   is imported: a device without WebGL 2 never downloads Three.js.
// - "Enter" builds the room with its controls inert, mounts the 3D scene or the 2D drawing, and plays the hand-off,
//   which nothing skips; its end offers the resume now or later and opens the room.
// - The quality controller, a lost context, or the visitor's "2D view" moves the room to 2D, once, keeping the visit;
//   each studio model whose load hadn't recorded its end is skipped then (spec 004, FR-071).
// - Every selectable runs its action from the bundle's index (spec 004, FR-036 to FR-038; R-33): an unready topic
//   answers with its fixed message and calls nothing; a ready one makes the conversation's feature the selectable's ID;
//   a resume action opens the resume. The text box and the talk button answer with the fixed messages and call nothing
//   (R-14) until the twin's spec gives the sender and turns the route on. The selectables, the list, and the 2D drawing
//   are the bundle's index's (spec 004, FR-011): no ID of the room's is here.
// - Usage events go to the EventSink: the page's sends beacons (src/events.ts); by default, nothing is sent.
// - Room text (spec 004, User Story 5): room-data.json is loaded once at Enter, through the loader the resume and its
//   narration share (resume-port.ts), and once more ROOM_TEXT_RETRY_MS later if that load failed; its room text and the
//   resume's titles word the faces on the stage and in "Around the room" in the same call. Until then, and for good if
//   the retry fails too, the faces it words stay plain and their entries are left out (FR-061). The faces' typefaces
//   load through document.fonts from Enter (faces/fonts.ts).
// - The tier (spec 004, User Story 2; signals/live.ts) is reduced at Enter, on pause, resume, hide, and show, and when
//   an answer turns stale, each reduction showing the switch's case on the stage and the tier's sentence in "Around
//   the room" in the same call; "Pause the room" and the motion store (motion.ts), read throughout the visit, stop the
//   room's motion, and only the pause shows "Paused at". With live.source off, as until spec 001 serves the status,
//   nothing is asked of the network and the tier is not-live (FR-045). With it `site`, the status poller asks the
//   page's own GET /api/status from Enter, while the page is visible and the room isn't paused (spec 004, User Story
//   8; signals/status-poller.ts).
// - The neon sign's counters (spec 004, User Story 9; signals/turn-cost.ts): one cost channel per page, configured by
//   the index's live.turn, fed each sent turn's end through the talk panel's onTurnOutcome, its fallback cue reaching
//   the tier (row 7), and each of its states drawn on the stage and said in "Around the room" at once, paused or not.
//   With live.turn off, as until the twin's spec, both read "cost unavailable" and nothing reports to it. It makes no
//   request and stores nothing; a reload makes a new one.
// - A drafts build's frame log (spec 004, R-70; signals/frame-log.ts), when main.ts gives its factory: the live
//   signal's events, each frame the 3D stage draws, each new switch case, and each change of the target, with
//   h4FrameLog() on the window. A release build gives none, so the room keeps no log.
// - The target (spec 008, Phase 1; FR-007 to FR-013; plan.md R-06): one store a visit, in this function's memory
//   (walk/target.ts's reducer), so it outlives the fall to 2D. The stage's pointer reports a hover's and a press's pick
//   and the "In the room" list each button's focus, only once the hand-off and its offer are over, and only for a
//   selectable the index lists (FR-010); each change goes to the stage that draws, which shows it with the highlight.
//   A selection, on any path, clears it in the same call (FR-011); the fall to 2D resets it. A target sends nothing:
//   no event, request, or storage, and no log line outside a drafts build's frame log (FR-013).
// - Spec 009's avatars: before the hand-off the room waits for both figures' avatars, at most the scene's wait_ms from
//   the 3D stage's mount (Phase 2); the stage's note shows the stand-in line, the UI word twin.stand_in, while the
//   index's copy holds it, which in that spec is always, in 3D and 2D (its FR-013); the 3D stage reports its figures
//   (onFigure), and the room sends avatar_failed once a visit, with no identifier, on the first figure file that
//   failed after its retry, never for a skip, a missing file, the floor, or 2D (FR-032), and logs each picture's and
//   clip's change in a drafts build's frame log (FR-035).
import "./room.css";

import type { RoomContent } from "../../build/manifest";
import { assetEvent, createAssetEvents } from "../asset-events";
import type { AssetEvent } from "../asset-events";
import { renderChoice } from "../choice/choice";
import type { Choice } from "../choice/choice";
import { newVisit } from "../choice/visit";
import type { Visit } from "../choice/visit";
import { renderTalk } from "../talk/talk";
import type { SendTurn, TalkPanel } from "../talk/talk";
import { createAnnouncer, renderObjectList } from "./a11y";
import { windowClock } from "./clock";
import type { Clock } from "./clock";
import type { RoomIndex } from "./compose/bundle";
import { OPENING, fitsHud, hudBoxes, notesReserve } from "./compose/hud";
import type { HudState } from "./compose/hud";
import { h } from "./dom";
import { noEvents } from "./events";
import type { EventSink } from "./events";
import { bufferRatio } from "./fit";
import { renderFlat } from "./flat";
import { browserOwnsEscape, createFullscreen } from "./fullscreen";
import { loadTypefaces } from "./faces/fonts";
import type { TypefaceLoader } from "./faces/fonts";
import { ROOM_TEXT_RETRY_MS, roomTextOf } from "./faces/words";
import type { RoomText } from "./faces/words";
import { createMotionStore } from "./motion";
import type { MotionStore } from "./motion";
import { handoffDuration, runHandoff } from "./handoff";
import type { Handoff } from "./handoff";
import { createViewport } from "./hud/viewport";
import type { Viewport, WindowMeasures } from "./hud/viewport";
import { renderRoom } from "./layout";
import type { RoomLayout } from "./layout";
import {
  SCENE_WAIT_MS,
  SETTLE_FRAMES,
  capability,
  createQualityController,
  meetsModelFloor,
  targetFps,
  watchContext,
} from "./quality";
import type { FlatReason, QualityController } from "./quality";
import type { ResumeView } from "./resume-port";
import type { FrameLog, FrameLogOptions } from "./signals/frame-log";
import { qualitySettings } from "./scene/levels";
import { createLiveSignals } from "./signals/live";
import type { LiveSignals } from "./signals/live";
import { caseFor } from "./signals/tier";
import type { TierValue } from "./signals/tier";
import { classifyTurn, createCostChannel } from "./signals/turn-cost";
import type { CostChannel } from "./signals/turn-cost";
import type { ClearArea, FigureSignal, SceneModule, Stage, Stage3D, WalkEnd } from "./stage";
import { renderTextCopy } from "./text-copy";
import type { TextCopy } from "./text-copy";
import { uiWord } from "./ui-keys";
import { NO_TARGET, reduceTarget } from "./walk/target";
import type { TargetEvent, TargetInput, TargetState } from "./walk/target";

export interface RoomDeps {
  win: Window;
  /** The fixed messages and the manifest, bundled at build (build/room/plugin.ts). */
  content: RoomContent;
  /** The bundle's index, bundled at build beside them (spec 004; contracts/room-bundle.md §3.1). */
  room: RoomIndex;
  /** The interactive resume's view: Phase 3's, through src/room/resume-port.ts's adapter. */
  resume: ResumeView;
  /** Where usage events go (Phase 6's beacon); by default nowhere. */
  events?: EventSink;
  clock?: Clock;
  /** The wall clock, in milliseconds since the epoch: "Paused at", and an answer's wall-clock age; by default
   *  Date.now. */
  wall?: () => number;
  /** Imports the 3D chunk; the tests give a stand-in, since jsdom has no WebGL. */
  loadScene?: () => Promise<SceneModule>;
  /** room-data.json, through the loader the resume and its narration share (resume-port.ts's roomDataLoader): null
   *  for a load that failed. The room loads it at Enter for its room text (spec 004, FR-061); absent, nothing loads and
   *  every face bound to room text stays plain. */
  roomData?: () => Promise<unknown>;
  /** The twin's sender for a conversation turn (spec 004, FR-038; R-33): main.ts gives src/talk/turn-client.ts's (spec
   *  007, plan §7). Absent, every turn answers with its fixed message and goes nowhere. */
  sendTurn?: SendTurn;
  /** A drafts build's frame log (spec 004, T246; R-70): main.ts gives `virtual:room-frame-log`'s factory in a drafts
   *  build, and nothing in a release build, which then keeps no log. */
  frameLog?: (options: FrameLogOptions) => FrameLog;
  /** Spec 005 (plan.md §4.3): the window's measures and their changes, hud/viewport.ts's for the page; the tests give a
   *  stand-in. */
  viewport?: (win: Window) => Viewport;
}

export interface RoomHandle {
  readonly visit: Readonly<Visit>;
  /** The tier signal (spec 004, signals/live.ts): what the poller (T245) and the cost channel (T266) feed. */
  readonly live: LiveSignals;
  /** The motion store: "Pause the room", reduced motion, and a hidden page (spec 004, motion.ts). */
  readonly motion: MotionStore;
  /** The page's one cost channel (spec 004, signals/turn-cost.ts), which the neon sign's counters read. */
  readonly cost: CostChannel;
  /** Resolves when the last step the visitor started has settled (the stage built after "Enter"). */
  settled(): Promise<void>;
}

export function startRoom(deps: RoomDeps): RoomHandle {
  const { win, content, resume } = deps;
  const doc = win.document;
  const clock = deps.clock ?? windowClock(win);
  const wall = deps.wall ?? ((): number => Date.now());
  const emit = deps.events ?? noEvents;
  const media = (query: string): boolean => typeof win.matchMedia === "function" && win.matchMedia(query).matches;
  const visit = newVisit();
  let settled: Promise<void> = Promise.resolve();

  let room: RoomLayout | null = null;
  let talk: TalkPanel | null = null;
  let stage: Stage | null = null;
  let controller: QualityController | null = null;
  let unwatch: (() => void) | null = null;
  let handoff: Handoff | null = null;
  let offering = false;
  let resumeOpen = false;
  let copy: TextCopy | null = null;
  /** The room text, once room-data.json has loaded at Enter; null before, and for good if it failed twice. */
  let text: RoomText | null = null;
  let typefaces: TypefaceLoader | null = null;
  /** The room's target (spec 008): the selectable the stage shows with the highlight, and what set it. */
  let targeting: TargetState = NO_TARGET;

  /** The room takes input only after the hand-off and its offer. */
  const open = (): boolean => visit.stage === "room" && !offering;

  /** The HUD's docked panels' states (spec 005): every panel starts open (FR-020). */
  let hudState: HudState = OPENING;
  /** The glass's blur, at quality levels 0 and 1 alone (spec 005, FR-025; PD-17). */
  const blurAt = (level: number): boolean => level <= 1;
  /** A docked or collapsible panel's change, in a drafts build's frame log (FR-063). */
  const panel = (part: string, state: string): void => log?.record("panel", { part, state });
  /** The window, measured, from Enter (spec 005; hud/viewport.ts). */
  let viewport: Viewport | null = null;
  /** The clear area the 3D stage frames the room into, in the canvas's CSS pixels, with the window it was computed for;
   *  null in the stacked layout, where the canvas is its own stage. */
  let clear: ClearArea | null = null;
  /** The quality controller's hold while the window changes: released SETTLE_FRAMES frames after the last re-fit, so a
   *  drag never steps the quality down (FR-013; PD-15). */
  let settling: { release: () => void; frames: number } | null = null;

  /**
   * Re-fits the room to the window (spec 005, FR-012; plan.md §4.3): the layout and its boxes from compose/hud.ts, or
   * the stacked layout where the HUD can't fit (FR-007), applied to the page's root; the clear area to the stage, which
   * frames into it on its next frame; the quality controller held; and the re-fit in a drafts build's frame log. The
   * keyboard's inset alone ("keyboard") lifts the HUD's foot and re-frames nothing.
   */
  function refit(what: "refit" | "keyboard" = "refit"): void {
    const layout = room;
    if (!layout || !viewport) return;
    const m: WindowMeasures = viewport.read();
    const metrics = { rem: m.rem, safe: m.safe, strip: m.strip };
    const screen = { w: m.w, h: m.h };
    const boxes = hudBoxes(screen, hudState, metrics);
    const fits = fitsHud(screen, hudState, metrics);
    layout.applyHud({
      layout: fits ? boxes.layout : "stacked",
      state: hudState,
      metrics,
      strip: boxes.strip.h,
      bar: boxes.bar.h,
      column: boxes.column?.w ?? 0,
      dock: boxes.dock?.h ?? 0,
      clear: boxes.clear,
      notes: notesReserve(boxes.clear, m.rem),
      keyboard: m.keyboard,
    });
    layout.setBlur(blurAt(visit.quality));
    // The conversation's log is a sheet above the dock in the dock layout (spec 005; the review's finding 1).
    talk?.setDocked(fits && boxes.layout === "dock");
    if (what === "keyboard") return;
    clear = fits ? { area: boxes.clear, window: screen } : null;
    if (controller) {
      if (settling) settling.frames = SETTLE_FRAMES;
      else settling = { release: controller.hold(), frames: SETTLE_FRAMES };
    }
    if (log) {
      // The drawing buffer the 3D stage sizes on its next frame (scene.ts's resize; FR-063, plan.md §12.4): the canvas,
      // the window in the HUD and the stage's view in the stacked layout, at the buffer's ratio, which the level's
      // ratio and pixel cap bound. None in 2D, which draws no buffer.
      const canvas = fits ? screen : { w: layout.view.clientWidth, h: layout.view.clientHeight };
      const ratio = bufferRatio(m.dpr, qualitySettings(visit.quality), canvas.w, canvas.h);
      const drawn = visit.mode !== "2d" && canvas.w > 0 && canvas.h > 0;
      log.record("refit", {
        w: m.w,
        h: m.h,
        layout: fits ? boxes.layout : "stacked",
        clear: `${boxes.clear.x},${boxes.clear.y},${boxes.clear.w},${boxes.clear.h}`,
        buffer: drawn ? `${Math.floor(canvas.w * ratio)}x${Math.floor(canvas.h * ratio)}` : "none",
        ratio: drawn ? ratio : null,
      });
    }
  }

  /** A targeting event through the store: a change of target goes to the stage that draws, and to a drafts build's
   *  frame log with the input that made it (spec 008, FR-007, FR-054). */
  function retarget(event: TargetEvent): void {
    const before = targeting.target;
    targeting = reduceTarget(targeting, event);
    const after = targeting.target;
    if (after === before) return;
    try {
      stage?.setTarget(after);
    } catch {
      // The stage keeps what it drew; the selection and the list go on.
    }
    log?.record("target", { id: after, input: event.kind === "name" ? event.input : event.kind });
  }

  /** A targeting input's name: taken only while the room takes input, and only for a selectable the index lists, or
   *  none (spec 008, FR-008, FR-010). */
  function targetInput(input: TargetInput, id: string | null): void {
    if (!open()) return;
    if (id !== null && !deps.room.selectables.some((s) => s.id === id)) return;
    retarget({ kind: "name", input, id });
  }
  const pdfFollowed = (): void => emit({ kind: "pdf_downloaded" });

  /** Whether this visit has walked: walk_started goes once a visit (FR-051). */
  let walked = false;
  /** Whether this visit has entered spec 005's full screen: fullscreen_entered goes once a visit (FR-060). */
  let fullscreenEntered = false;
  /** The stage, where it's the 3D one, which walks. */
  const walker = (s: Stage | null): Stage3D | null => (s?.mode === "3d" && "walk" in s ? (s as Stage3D) : null);
  /** Into the walking view: focus on it, walk_started the first time, and the frame log's entry (FR-022, FR-054). */
  function enterWalking(scene3d: Stage3D): void {
    const layout = room;
    if (!layout) return;
    scene3d.walk.enter(layout.view);
    if (!scene3d.walk.walking) return;
    layout.setWalking(true);
    layout.view.focus();
    // Spec 008's FR-043 entry announcement, which spec 005's FR-039 words for full screen, where Escape is the browser's.
    const said = uiWord(deps.room.ui, browserOwnsEscape(doc) ? "walk.entered_fullscreen" : "walk.entered");
    if (said) announcer.say(said);
    if (!walked) {
      walked = true;
      emit({ kind: "walk_started" });
    }
    log?.record("walk", { state: "entered" });
  }
  /** Out of it, by the control, Escape, a failed step, or the fall to 2D: focus back on the control (FR-022). */
  function leaveWalking(why: "control" | WalkEnd | "flat"): void {
    const layout = room;
    if (why === "control") walker(stage)?.walk.leave();
    if (!layout) return;
    layout.setWalking(false);
    if (why !== "flat") layout.walkButton.focus();
    log?.record("walk", { state: "left", why });
  }

  // The motion store, read throughout the visit by whichever stage the room draws (3D or 2D), and the tier signal, which
  // shows each reading on the stage and in the text copy at once (spec 004, FR-042, FR-059, FR-060).
  const motion = createMotionStore({ win, wall });
  // A drafts build's frame log, in page memory, with h4FrameLog() for the console (R-70).
  const log = deps.frameLog?.({ clock, wall, origin: win.location.origin }) ?? null;
  log?.expose(win);
  const live = createLiveSignals({
    live: deps.room.live,
    clock,
    wall,
    motion,
    apply: (reading) => {
      if (stage) showTier(stage, reading.tier);
      copy?.setTier(reading.tier);
    },
    // The poller, only while the live source is on (FR-045): the page's own fetch, which spies see in the tests.
    ...(deps.room.live.source === "site"
      ? { status: { fetch: (url: string, init: RequestInit) => win.fetch(url, init), pollMs: deps.room.live.poll_ms } }
      : {}),
    ...(log ? { log } : {}),
  });

  // The cost channel (spec 004, FR-047, FR-048): one per page, configured while the index's live.turn is `site`. Its
  // fallback cue is row 7's (FR-041); each state reaches the stage and the text copy at once, the motion store's pause
  // stopping only the glow's motion (FR-060).
  const cost = createCostChannel({ configured: deps.room.live.turn === "site", clock });
  cost.onFallbackReply(() => live.fallbackReply());
  cost.subscribe((state) => {
    stage?.setCost?.(state);
    copy?.setCost(state);
  });

  /** A tier on a stage, and in the frame log each switch's case as the claims rule gives it: in 3D drawn on the next
   *  frame, in 2D now. */
  function showTier(target: Stage, value: TierValue): void {
    target.apply(value);
    if (!log) return;
    for (const sw of deps.room.switches) {
      const pose = caseFor(sw, value);
      if (pose !== null) log.applied(sw.id, pose, pose === sw.claims?.local, target.mode);
    }
  }
  motion.subscribe((state) => {
    room?.setPaused(state.paused);
    copy?.setPausedAt(state.paused ? state.pausedAt : null);
  });

  /** Spec 009's figures as the 3D stage reports them: avatar_failed once a visit (FR-032), and the frame log (FR-035). */
  let avatarFailed = false;
  function figureSignal(signal: FigureSignal): void {
    if (signal.kind === "failed") {
      if (avatarFailed) return;
      avatarFailed = true;
      emit({ kind: "avatar_failed" });
      return;
    }
    if (!log) return;
    if (signal.kind === "picture")
      log.record("figure", { figure: signal.figure, shows: signal.shows, why: signal.why });
    else log.record("clip", { figure: signal.figure, role: signal.role });
  }

  const app = doc.getElementById("app") ?? doc.body;
  const screen = h(doc, "div", { class: "screen" });
  const announcer = createAnnouncer(doc);
  app.replaceChildren(screen, announcer.element);
  screen.append(renderChoice(doc, { onEnter: enter, onPdf: pdfFollowed }));

  // Behind the choice: the WebGL 2 check, and only then the 3D chunk (contracts/room-scene.md §4). The check also reads
  // what ADR 0010's floor for studio models asks of the device (spec 004, R-28 step 1), once, here, so the 3D stage
  // asks nothing during the hand-off.
  const device = capability(win);
  const webgl = device.webgl2;
  const loadScene = deps.loadScene ?? ((): Promise<SceneModule> => import("./scene"));
  const scene: Promise<SceneModule | null> = webgl ? loadScene().catch(() => null) : Promise.resolve(null);

  /** The 3D chunk, or "late" once SCENE_WAIT_MS have passed since "Enter" without it (null: no WebGL 2, or it failed). */
  function sceneOrLate(): Promise<SceneModule | null | "late"> {
    return new Promise((resolve) => {
      const timer = clock.setTimeout(() => resolve("late"), SCENE_WAIT_MS);
      void scene.then((module) => {
        clock.clearTimeout(timer);
        resolve(module);
      });
    });
  }

  // Spec 003's asset events from the 3D stage's loader, and the room's own when it goes to 2D (spec 004, T134; R-60):
  // queued in page memory, and sent only while the index's live.asset_events is `site`, which spec 001's route turns on.
  const assets = createAssetEvents({
    live: deps.room.live.asset_events,
    clock,
    fetch: (url, init) => win.fetch(url, init),
    nav: win.navigator,
  });
  /** The set models whose load has recorded its end, loaded, failed, or skipped: each event goes through here. */
  const ended = new Set<string>();
  const recordAsset = (event: AssetEvent): void => {
    if (event.outcome !== "retried") ended.add(event.asset);
    assets.record(event);
  };
  // The hand-off's end, after which the 3D stage parses and swaps studio models (R-28).
  let handoffEnded = (): void => undefined;
  const handoffDone = new Promise<void>((resolve) => (handoffEnded = resolve));
  const holdQuality = (): (() => void) => controller?.hold() ?? (() => undefined);

  // A hidden page draws no frames; when it shows again, the quality controller starts a new window (R-04). Hidden, the
  // asset events' beacon goes, once, while they're sent at all.
  doc.addEventListener("visibilitychange", () => {
    controller?.restart();
    if (doc.visibilityState === "hidden") assets.hide();
    else assets.show();
  });
  const onFrame = (time: number): void => {
    log?.frame(time);
    // A re-fit's hold ends SETTLE_FRAMES frames after the last one (spec 005, FR-013).
    if (settling) {
      settling.frames -= 1;
      if (settling.frames <= 0) {
        settling.release();
        settling = null;
      }
    }
    if (doc.visibilityState === "hidden") controller?.restart();
    else controller?.frame(time);
  };

  function enter(choice: Choice): void {
    if (visit.stage !== "choosing") return;
    visit.path = choice.path;
    visit.avatar = choice.avatar;
    visit.stage = "handoff";
    settled = arrive(choice);
  }

  async function arrive(choice: Choice): Promise<void> {
    // The list's header button collapses it; in the dock layout the room re-frames into what it frees (spec 005).
    const list = renderObjectList(
      doc,
      deps.room,
      selectObject,
      (id) => targetInput("focus", id),
      (collapsed) => {
        hudState = { list: collapsed ? "collapsed" : "open" };
        refit();
        panel("list", hudState.list);
      },
    );
    talk = renderTalk(doc, {
      messages: content.messages,
      clock,
      emit,
      enabled: open,
      openResume,
      pdfFollowed,
      path: () => visit.path,
      turns: visit.turns,
      freeTalkReady: content.manifest.free_talk.ready,
      turnRoute: deps.room.live.turn === "site",
      ...(deps.sendTurn ? { sendTurn: deps.sendTurn } : {}),
      onTurnOutcome: (result) => cost.report(classifyTurn(result), "turn"),
      // The twin's per-turn limits, from the build (spec 007, FR-027, FR-041); FR-027's defaults without them.
      ...(content.twin ? { limits: content.twin.limits } : {}),
      // Spec 005's header words for the log and its larger view (FR-023, FR-028, FR-065).
      words: {
        logToggle: uiWord(deps.room.ui, "hud.log_toggle") ?? "Conversation",
        larger: uiWord(deps.room.ui, "talk.larger") ?? "Larger conversation",
        smaller: uiWord(deps.room.ui, "talk.smaller") ?? "Smaller conversation",
      },
      onPanel: (part, state) => panel(part, state),
    });
    // Spec 005's full screen of the page's root (FR-036 to FR-042), its support read as the room is built.
    const fullscreen = createFullscreen(doc);
    // "Around the room", from the index alone, so it's whole from Enter whatever the 3D chunk does (FR-011, FR-063).
    const around = renderTextCopy(doc, deps.room);
    around.setCost(cost.state);
    copy = around;
    const layout = renderRoom(doc, {
      list,
      talk: talk.element,
      around: around.element,
      note: uiWord(deps.room.ui, "standin.note") ?? "",
      pause: uiWord(deps.room.ui, "pause.button") ?? "",
      walk: {
        enter: uiWord(deps.room.ui, "walk.enter") ?? "",
        leave: uiWord(deps.room.ui, "walk.leave") ?? "",
        region: uiWord(deps.room.ui, "walk.region") ?? "",
        help: uiWord(deps.room.ui, "walk.help") ?? "",
        helpFullscreen: uiWord(deps.room.ui, "walk.help_fullscreen") ?? "",
      },
      // Spec 005's full-screen control, where the browser offers full screen (Q4, provisional).
      ...(fullscreen.supported
        ? {
            fullscreen: {
              enter: uiWord(deps.room.ui, "fullscreen.enter") ?? "Full screen",
              leave: uiWord(deps.room.ui, "fullscreen.leave") ?? "Leave full screen",
            },
          }
        : {}),
      // Spec 009's stand-in line, while the index's copy holds it (its FR-013; plan.md R-13).
      standIn: deps.room.copy.some((e) => "line" in e && e.line === "twin.stand_in")
        ? (uiWord(deps.room.ui, "twin.stand_in") ?? "")
        : "",
    });
    room = layout;
    // Spec 005 (FR-034; plan.md §7): a press on the scene while walking gives the walking view focus, so walking's keys
    // go there and not to a panel the visitor typed in.
    layout.view.addEventListener("pointerdown", () => {
      if (walker(stage)?.walk.walking && doc.activeElement !== layout.view) layout.view.focus({ preventScroll: true });
    });
    // Spec 008's walking control (FR-020 to FR-022, FR-051): it enters and leaves the 3D stage's walking view.
    layout.walkButton.addEventListener("click", () => {
      const scene3d = walker(stage);
      if (!open() || !scene3d) return;
      if (scene3d.walk.walking) leaveWalking("control");
      else enterWalking(scene3d);
    });
    layout.setPaused(motion.paused);
    around.setPausedAt(motion.paused ? motion.pausedAt : null);
    layout.pauseButton.addEventListener("click", () => {
      if (!open()) return;
      motion.setPaused(!motion.paused);
    });
    layout.setPlaceholders(deps.room.build.placeholders);
    layout.setInteractive(false);
    layout.resumeButton.addEventListener("click", openResume);
    layout.flatButton.addEventListener("click", () => {
      if (!open()) return;
      toFlat("visitor");
      layout.flatButton.focus();
    });
    layout.resumePanel.addEventListener("keydown", (event) => {
      // In full screen the browser takes Escape to leave it, and the resume stays open (spec 005, FR-039).
      if (event.key !== "Escape" || browserOwnsEscape(doc)) return;
      event.preventDefault();
      closeResume();
    });
    // Spec 005's full screen (FR-036 to FR-042; plan.md §8): the control, Alt+Enter from anywhere in the room, a
    // refusal said once, every change re-fitting the room and wording the control, and the event once a visit.
    layout.fullscreenButton?.addEventListener("click", () => {
      if (open()) fullscreen.toggle();
    });
    doc.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter" || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (!open() || !fullscreen.supported) return;
        event.preventDefault();
        event.stopPropagation();
        fullscreen.toggle();
      },
      true,
    );
    fullscreen.onRefused(() => {
      announcer.say(uiWord(deps.room.ui, "fullscreen.refused") ?? "");
      log?.record("fullscreen", { state: "refused" });
    });
    fullscreen.onChange((on) => {
      layout.setFullscreen(on);
      refit();
      log?.record("fullscreen", { state: on ? "entered" : "left" });
      if (on && !fullscreenEntered) {
        fullscreenEntered = true;
        emit({ kind: "fullscreen_entered" });
      }
    });
    viewport = (deps.viewport ?? ((w: Window): Viewport => createViewport(w)))(win);
    viewport.subscribe((what) => refit(what));
    refit();
    screen.replaceChildren(layout.element);
    doc.body.classList.add("in-room");
    // The AI disclosure's header is the HUD's strip in the room: dark glass, blurred where the glass is (spec 005).
    doc.querySelector("header.disclosure")?.classList.add("hud-glass");
    layout.heading.focus();
    // Enter (contracts/tier-signal.md §5.4): the tier reduced, and shown in the text copy, before the stage is drawn.
    live.enter();
    // The faces' typefaces, and the room text, from Enter, whatever the 3D chunk does (spec 004, FR-061; R-11, R-37).
    typefaces = loadTypefaces(doc, clock, deps.room.typefaces);
    loadText(1);

    const loaded = await sceneOrLate();
    const module = loaded === "late" ? null : loaded;
    if (module) mount3d(module, choice);
    if (!module || !stage) toFlat(!webgl ? "no_webgl2" : loaded === "late" ? "load_timeout" : "load_failed");
    const wait = figuresWait();
    if (wait === null) startHandoff();
    else void wait.then(startHandoff);
  }

  function startHandoff(): void {
    handoff = runHandoff({
      clock,
      durationMs: handoffDuration(visit.mode === "2d" ? "2d" : "3d", motion.reducedMotion),
      announce: (text) => announcer.say(text),
      show: (progress) => stage?.showHandoff(progress),
      onDone: offerResume,
    });
  }

  /**
   * Spec 009's wait (FR-019 (a); plan.md R-10): the hand-off starts once both figures show their avatars or keep their
   * fallbacks for good, or the scene's wait_ms after the 3D stage's mount, whichever comes first. Null where there's
   * nothing to wait for (the 2D room, or a stage that gives no promise), so the hand-off starts at once, as before.
   */
  function figuresWait(): Promise<void> | null {
    const current = stage;
    if (current?.mode !== "3d") return null;
    const { figures, waitMs } = current as Stage3D;
    if (!figures) return null;
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clock.clearTimeout(timer);
        resolve();
      };
      const timer = clock.setTimeout(finish, Math.max(0, waitMs ?? 0));
      void figures.then(finish, finish);
    });
  }

  /** room-data.json for the room text: once at Enter, and once more ROOM_TEXT_RETRY_MS after a load that failed. Its
   *  words reach the stage and the text copy in one call; a second failure leaves the faces plain (FR-061). */
  function loadText(attempt: 1 | 2): void {
    const load = deps.roomData;
    if (!load) return;
    void load()
      .catch(() => null)
      .then((json) => {
        if (json === null || json === undefined) {
          if (attempt === 1) clock.setTimeout(() => loadText(2), ROOM_TEXT_RETRY_MS);
          return;
        }
        text = roomTextOf(json);
        // The text copy first, and each guarded, so a stage that can't take the words leaves the copy worded (the
        // review of T194, nit 4); the faces it would draw then stay plain on the stage.
        try {
          copy?.setText(text);
        } catch {
          // The text copy keeps what it had.
        }
        try {
          stage?.setText?.(text);
        } catch {
          // The stage keeps its faces as they were.
        }
      })
      .catch(() => undefined);
  }

  function mount3d(module: SceneModule, choice: Choice): void {
    let scene3d: Stage3D;
    try {
      scene3d = module.createScene({
        win,
        doc,
        clock,
        room: deps.room,
        avatar: choice.avatar,
        get reducedMotion() {
          return motion.reducedMotion;
        },
        motion,
        select: selectObject,
        target: targetInput,
        walkEnded: (why) => leaveWalking(why),
        onFrame,
        floor: meetsModelFloor(device),
        handoff: handoffDone,
        hold: holdQuality,
        level: () => controller?.quality ?? 0,
        mode: () => visit.mode,
        assets: recordAsset,
        ...(typefaces ? { typefaces } : {}),
        text,
        cost: cost.state,
        onFigure: figureSignal,
        clear: () => clear,
      });
    } catch {
      // The 3D chunk refused its part (not the index's, or not whole) or its renderer: the room goes to 2D.
      return;
    }
    stage = scene3d;
    visit.mode = "3d";
    showTier(scene3d, live.tier.tier);
    show(scene3d);
    controller = createQualityController({
      target: targetFps(media("(pointer: coarse)")),
      onQuality: (level) => {
        visit.quality = level;
        visit.mode = "reduced";
        scene3d.setQuality(level);
        room?.setBlur(blurAt(level));
      },
      onFlat: toFlat,
    });
    // A lost context holds the controller until two frames after its restore (R-35).
    unwatch = watchContext(scene3d.canvas, clock, () => toFlat("context_lost"), { hold: holdQuality });
  }

  function show(next: Stage): void {
    // The canvas and the drawing are pictures of what the list holds (FR-045).
    next.element.setAttribute("aria-hidden", "true");
    room?.view.replaceChildren(next.element);
    room?.setStage(next.mode);
  }

  /** Into 2D for the rest of the visit, once, by any road, keeping everything else (FR-042). If the 2D drawing refuses
   *  the index's (flat.ts throws on anything off its allowlist), the view shows the UI word flat-failed in place of a
   *  picture, as text a screen reader reads too, and the room goes on: the list, "Around the room", and the
   *  conversation carry it, and the hand-off still ends in the room (FR-062, FR-081). */
  function toFlat(reason: FlatReason): void {
    if (visit.mode === "2d" || !room || !visit.avatar) return;
    visit.mode = "2d";
    // Spec 008: the target clears with the 3D stage, and the 2D room starts with none (plan.md R-06).
    retarget({ kind: "reset" });
    controller?.toFlat(reason);
    // The walk ends with the 3D stage (FR-003).
    if (walker(stage)?.walk.walking) leaveWalking("flat");
    room.setWalkOffered(false);
    unwatch?.();
    unwatch = null;
    const old = stage;
    let flat: Stage | null;
    try {
      flat = renderFlat(doc, {
        room: deps.room,
        avatar: visit.avatar,
        select: selectObject,
        motion,
        text,
        cost: cost.state,
        target: targetInput,
        ...(typefaces ? { typefaces } : {}),
      });
      showTier(flat, live.tier.tier);
    } catch {
      flat = null;
    }
    stage = flat;
    if (flat) show(flat);
    else {
      const words = uiWord(deps.room.ui, "flat-failed") ?? "";
      room.view.replaceChildren(h(doc, "p", { class: "room-flat-failed" }, words));
      room.setStage("2d");
    }
    // The 3D stage's loader skips what it had on its way; every other set model whose load hadn't recorded its end is
    // skipped here, the room in 2D (data-model.md §11.4): one the room started in 2D without, or one its 3D stage's
    // loader hadn't reached. The entry has no 3D part, so the index names them (FR-071).
    old?.dispose();
    for (const asset of deps.room.models)
      if (!ended.has(asset)) recordAsset(assetEvent({ asset, outcome: "skipped", ms: 0, bytes: 0, mode: "2d" }));
    flat?.showHandoff(handoff && !handoff.finished ? handoff.progress() : 1);
    room.markFlat();
    emit({ kind: "mode_2d" });
  }

  function offerResume(): void {
    handoffEnded();
    const layout = room;
    if (!layout) return;
    visit.stage = "room";
    offering = true;
    const settle = (): void => {
      offering = false;
      removeOffer();
      layout.setInteractive(true);
      layout.setWalkOffered(walker(stage) !== null);
    };
    const removeOffer = layout.offer(
      () => {
        if (!offering) return;
        settle();
        openResume();
      },
      () => {
        if (!offering) return;
        settle();
        visit.resumeKept = true;
        emit({ kind: "resume_kept" });
        layout.resumeButton.focus();
      },
    );
  }

  function openResume(): void {
    if (!open() || !room || !visit.path) return;
    if (!resumeOpen) {
      resumeOpen = true;
      room.resumePanel.hidden = false;
      resume.mount(room.resumeBody, { doc, path: visit.path, close: closeResume, pdfFollowed, itemSelected });
      emit({ kind: "resume_opened" });
    }
    room.resumeHeading.focus();
  }

  function closeResume(): void {
    if (!resumeOpen || !room) return;
    resumeOpen = false;
    resume.unmount();
    room.resumePanel.hidden = true;
    room.resumeButton.focus();
  }

  /** A resume item selected in the view: item_selected, for an ID the manifest lists (contracts/room-events.md §1). */
  function itemSelected(id: string): void {
    if (content.manifest.items.includes(id)) emit({ kind: "item_selected", id });
  }

  /**
   * A selectable picked in 3D or 2D, or pressed in the list, the one path for every input (spec 004, FR-004, FR-071;
   * R-33): object_selected with the selectable's ID, only for one the index lists; then its action, from the index.
   * `talk`: an unready topic shows the fixed message naming it by its own phrase and calls nothing (FR-037); a ready
   * one opens its conversation through the talk panel, which sends the opening (spec 007, FR-032). The lead stays in
   * config/room-topics.yaml, which the gateway's pack carries, so nothing here sends it. `resume`: the resume opens.
   */
  function selectObject(id: string): void {
    const selectable = deps.room.selectables.find((s) => s.id === id);
    if (!open() || !talk || !selectable) return;
    emit({ kind: "object_selected", id: selectable.id });
    // Spec 008: the highlight clears in the same call, and the piece isn't targeted again until an input names another
    // or none (FR-011, FR-012).
    retarget({ kind: "select", id: selectable.id });
    const { action } = selectable;
    if (action.kind === "resume") {
      openResume();
      return;
    }
    const topic = deps.room.topics.find((t) => t.id === action.topic);
    if (topic) talk.topicSelected(selectable.id, topic);
  }

  return {
    get visit() {
      return visit;
    },
    live,
    motion,
    cost,
    settled: () => settled,
  };
}
