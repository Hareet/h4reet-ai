// The room's screens (spec 002, plan §4; T040–T045; contracts/room-scene.md; data-model.md §9): the choice, the
// hand-off, and the room, with the resume one action away. One visit per page, in this function's memory only: no
// cookie, no browser storage, no URL or history, so a reload starts a new visit at the choice (FR-002, FR-003).
//
// - The choice screen comes first. Behind it, the WebGL 2 check runs and, only if it passes, the 3D chunk (scene.ts)
//   is imported: a device without WebGL 2 never downloads Three.js.
// - "Enter" builds the room with its controls inert, mounts the 3D scene or the 2D drawing, and plays the hand-off,
//   which nothing skips; its end offers the resume now or later and opens the room.
// - The quality controller, a lost context, or the visitor's "2D view" moves the room to 2D, once, keeping the visit.
// - Every selectable, the text box, and the talk button answer with the fixed messages and call nothing (R-14). The
//   selectables, the list, and the 2D drawing are the bundle's index's (spec 004, FR-011): no ID of the room's is here.
// - Usage events go to the EventSink: the page's sends beacons (src/events.ts); by default, nothing is sent.
import "./room.css";

import type { RoomContent } from "../../build/manifest";
import { renderChoice } from "../choice/choice";
import type { Choice } from "../choice/choice";
import { newVisit } from "../choice/visit";
import type { Visit } from "../choice/visit";
import { renderTalk } from "../talk/talk";
import type { TalkPanel } from "../talk/talk";
import { createAnnouncer, renderObjectList } from "./a11y";
import { windowClock } from "./clock";
import type { Clock } from "./clock";
import type { RoomIndex } from "./compose/bundle";
import { h } from "./dom";
import { noEvents } from "./events";
import type { EventSink } from "./events";
import { renderFlat } from "./flat";
import { handoffDuration, runHandoff } from "./handoff";
import type { Handoff } from "./handoff";
import { renderRoom } from "./layout";
import type { RoomLayout } from "./layout";
import { SCENE_WAIT_MS, createQualityController, hasWebGL2, targetFps, watchContext } from "./quality";
import type { FlatReason, QualityController } from "./quality";
import type { ResumeView } from "./resume-port";
import type { SceneModule, Stage, Stage3D } from "./stage";
import { renderTextCopy } from "./text-copy";
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
  /** Imports the 3D chunk; the tests give a stand-in, since jsdom has no WebGL. */
  loadScene?: () => Promise<SceneModule>;
}

export interface RoomHandle {
  readonly visit: Readonly<Visit>;
  /** Resolves when the last step the visitor started has settled (the stage built after "Enter"). */
  settled(): Promise<void>;
}

export function startRoom(deps: RoomDeps): RoomHandle {
  const { win, content, resume } = deps;
  const doc = win.document;
  const clock = deps.clock ?? windowClock(win);
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

  /** The room takes input only after the hand-off and its offer. */
  const open = (): boolean => visit.stage === "room" && !offering;
  const pdfFollowed = (): void => emit({ kind: "pdf_downloaded" });

  const app = doc.getElementById("app") ?? doc.body;
  const screen = h(doc, "div", { class: "screen" });
  const announcer = createAnnouncer(doc);
  app.replaceChildren(screen, announcer.element);
  screen.append(renderChoice(doc, { onEnter: enter, onPdf: pdfFollowed }));

  // Behind the choice: the WebGL 2 check, and only then the 3D chunk (contracts/room-scene.md §4).
  const webgl = hasWebGL2(doc);
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

  // A hidden page draws no frames; when it shows again, the quality controller starts a new window (R-04).
  doc.addEventListener("visibilitychange", () => controller?.restart());
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
    talk = renderTalk(doc, { messages: content.messages, clock, emit, enabled: open, openResume, pdfFollowed });
    // "Around the room", from the index alone, so it's whole from Enter whatever the 3D chunk does (FR-011, FR-063).
    const around = renderTextCopy(doc, deps.room);
    const layout = renderRoom(doc, {
      list,
      talk: talk.element,
      around: around.element,
      note: uiWord(deps.room.ui, "standin.note") ?? "",
    });
    room = layout;
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

    const loaded = await sceneOrLate();
    const module = loaded === "late" ? null : loaded;
    const reducedMotion = media("(prefers-reduced-motion: reduce)");
    if (module) mount3d(module, choice, reducedMotion);
    if (!module || !stage) toFlat(!webgl ? "no_webgl2" : loaded === "late" ? "load_timeout" : "load_failed");
    handoff = runHandoff({
      clock,
      durationMs: handoffDuration(visit.mode === "2d" ? "2d" : "3d", reducedMotion),
      announce: (text) => announcer.say(text),
      show: (progress) => stage?.showHandoff(progress),
      onDone: offerResume,
    });
  }

  function mount3d(module: SceneModule, choice: Choice, reducedMotion: boolean): void {
    let scene3d: Stage3D;
    try {
      scene3d = module.createScene({
        win,
        doc,
        clock,
        room: deps.room,
        avatar: choice.avatar,
        reducedMotion,
        select: selectObject,
        onFrame,
      });
    } catch {
      // The 3D chunk refused its part (not the index's, or not whole) or its renderer: the room goes to 2D.
      return;
    }
    stage = scene3d;
    visit.mode = "3d";
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
    unwatch = watchContext(scene3d.canvas, clock, () => toFlat("context_lost"));
  }

  function show(next: Stage): void {
    // The canvas and the drawing are pictures of what the list holds (FR-045).
    next.element.setAttribute("aria-hidden", "true");
    room?.view.replaceChildren(next.element);
  }

  /** Into 2D for the rest of the visit, once, by any road, keeping everything else (FR-042). */
  function toFlat(reason: FlatReason): void {
    if (visit.mode === "2d" || !room || !visit.avatar) return;
    visit.mode = "2d";
    controller?.toFlat(reason);
    unwatch?.();
    unwatch = null;
    const old = stage;
    const flat = renderFlat(doc, { room: deps.room, avatar: visit.avatar, select: selectObject });
    stage = flat;
    show(flat);
    old?.dispose();
    flat.showHandoff(handoff && !handoff.finished ? handoff.progress() : 1);
    room.markFlat();
    emit({ kind: "mode_2d" });
  }

  function offerResume(): void {
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
   * R-33): object_selected with the selectable's ID, only for one the index lists; then, while no topic is ready, the
   * fixed message naming its topic by the topic's own phrase, and no call (FR-037). Running the action is T207's.
   */
  function selectObject(id: string): void {
    const selectable = deps.room.selectables.find((s) => s.id === id);
    if (!open() || !talk || !selectable) return;
    emit({ kind: "object_selected", id: selectable.id });
    const { action } = selectable;
    if (action.kind !== "talk") return;
    const topic = deps.room.topics.find((t) => t.id === action.topic);
    if (topic) talk.objectSelected(topic);
  }

  return {
    get visit() {
      return visit;
    },
    settled: () => settled,
  };
}
