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
//   nothing is asked of the network and the tier is not-live (FR-045).
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
import { h } from "./dom";
import { noEvents } from "./events";
import type { EventSink } from "./events";
import { renderFlat } from "./flat";
import { loadTypefaces } from "./faces/fonts";
import type { TypefaceLoader } from "./faces/fonts";
import { ROOM_TEXT_RETRY_MS, roomTextOf } from "./faces/words";
import type { RoomText } from "./faces/words";
import { createMotionStore } from "./motion";
import type { MotionStore } from "./motion";
import { handoffDuration, runHandoff } from "./handoff";
import type { Handoff } from "./handoff";
import { renderRoom } from "./layout";
import type { RoomLayout } from "./layout";
import {
  SCENE_WAIT_MS,
  capability,
  createQualityController,
  meetsModelFloor,
  targetFps,
  watchContext,
} from "./quality";
import type { FlatReason, QualityController } from "./quality";
import type { ResumeView } from "./resume-port";
import { createLiveSignals } from "./signals/live";
import type { LiveSignals } from "./signals/live";
import type { SceneModule, Stage, Stage3D } from "./stage";
import { renderTextCopy } from "./text-copy";
import type { TextCopy } from "./text-copy";
import { uiWord } from "./ui-keys";

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
  /** The twin's sender for a conversation turn, which the twin's spec gives (spec 004, FR-038; R-33): absent, as until
   *  then, every turn answers with its fixed message and goes nowhere. */
  sendTurn?: SendTurn;
}

export interface RoomHandle {
  readonly visit: Readonly<Visit>;
  /** The tier signal (spec 004, signals/live.ts): what the poller (T245) and the cost channel (T266) feed. */
  readonly live: LiveSignals;
  /** The motion store: "Pause the room", reduced motion, and a hidden page (spec 004, motion.ts). */
  readonly motion: MotionStore;
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

  /** The room takes input only after the hand-off and its offer. */
  const open = (): boolean => visit.stage === "room" && !offering;
  const pdfFollowed = (): void => emit({ kind: "pdf_downloaded" });

  // The motion store, read throughout the visit by whichever stage the room draws (3D or 2D), and the tier signal, which
  // shows each reading on the stage and in the text copy at once (spec 004, FR-042, FR-059, FR-060).
  const motion = createMotionStore({ win, wall });
  const live = createLiveSignals({
    live: deps.room.live,
    clock,
    wall,
    motion,
    apply: (reading) => {
      stage?.apply(reading.tier);
      copy?.setTier(reading.tier);
    },
  });
  motion.subscribe((state) => {
    room?.setPaused(state.paused);
    copy?.setPausedAt(state.paused ? state.pausedAt : null);
  });

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
    const list = renderObjectList(doc, deps.room, selectObject);
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
    });
    // "Around the room", from the index alone, so it's whole from Enter whatever the 3D chunk does (FR-011, FR-063).
    const around = renderTextCopy(doc, deps.room);
    copy = around;
    const layout = renderRoom(doc, {
      list,
      talk: talk.element,
      around: around.element,
      note: uiWord(deps.room.ui, "standin.note") ?? "",
      pause: uiWord(deps.room.ui, "pause.button") ?? "",
    });
    room = layout;
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
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeResume();
    });
    screen.replaceChildren(layout.element);
    doc.body.classList.add("in-room");
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
    handoff = runHandoff({
      clock,
      durationMs: handoffDuration(visit.mode === "2d" ? "2d" : "3d", motion.reducedMotion),
      announce: (text) => announcer.say(text),
      show: (progress) => stage?.showHandoff(progress),
      onDone: offerResume,
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
        onFrame,
        floor: meetsModelFloor(device),
        handoff: handoffDone,
        hold: holdQuality,
        level: () => controller?.quality ?? 0,
        mode: () => visit.mode,
        assets: recordAsset,
        ...(typefaces ? { typefaces } : {}),
        text,
      });
    } catch {
      // The 3D chunk refused its part (not the index's, or not whole) or its renderer: the room goes to 2D.
      return;
    }
    stage = scene3d;
    visit.mode = "3d";
    scene3d.apply(live.tier.tier);
    show(scene3d);
    controller = createQualityController({
      target: targetFps(media("(pointer: coarse)")),
      onQuality: (level) => {
        visit.quality = level;
        visit.mode = "reduced";
        scene3d.setQuality(level);
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
  }

  /** Into 2D for the rest of the visit, once, by any road, keeping everything else (FR-042). If the 2D drawing refuses
   *  the index's (flat.ts throws on anything off its allowlist), the view shows the UI word flat-failed in place of a
   *  picture, as text a screen reader reads too, and the room goes on: the list, "Around the room", and the
   *  conversation carry it, and the hand-off still ends in the room (FR-062, FR-081). */
  function toFlat(reason: FlatReason): void {
    if (visit.mode === "2d" || !room || !visit.avatar) return;
    visit.mode = "2d";
    controller?.toFlat(reason);
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
        ...(typefaces ? { typefaces } : {}),
      });
      flat.apply(live.tier.tier);
    } catch {
      flat = null;
    }
    stage = flat;
    if (flat) show(flat);
    else {
      const words = uiWord(deps.room.ui, "flat-failed") ?? "";
      room.view.replaceChildren(h(doc, "p", { class: "room-flat-failed" }, words));
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
   * one makes the conversation's feature the selectable's ID (FR-038). The lead stays in config/room-topics.yaml for
   * the twin's spec, so nothing here sends it. `resume`: the resume opens.
   */
  function selectObject(id: string): void {
    const selectable = deps.room.selectables.find((s) => s.id === id);
    if (!open() || !talk || !selectable) return;
    emit({ kind: "object_selected", id: selectable.id });
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
    settled: () => settled,
  };
}
