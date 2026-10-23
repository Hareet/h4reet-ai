// The hand-off (spec 002, FR-007, FR-008; contracts/room-scene.md §3; research.md R-13): the twin hands the visitor's
// avatar a paper, the resume. It lasts 4.5 s in 3D, never more than 5; 1 s under reduced motion, a crossfade; and in
// 2D, three still frames of 1.5 s. Nothing skips it: this timeline has no way to end early. Its line goes to the
// polite live region when it starts, and the room offers "Read the resume now" when it ends. The paper ends in the
// avatar's own hand, placed from its size, as code (spec 004, FR-008): the room's data gives one anchor, where the
// first avatar holds it, and handOffset moves it to the chosen avatar's hand.
import { AVATARS, AVATAR_SHAPES } from "../choice/avatars";
import type { AvatarId } from "../choice/avatars";
import type { Clock } from "./clock";

export const HANDOFF_LINE = "The twin hands you a paper: the Author's resume.";
export const HANDOFF_MS = 4500;
export const REDUCED_HANDOFF_MS = 1000;
export const FLAT_FRAME_MS = 1500;
export const FLAT_FRAMES = 3;

export function handoffDuration(mode: "3d" | "2d", reducedMotion: boolean): number {
  if (mode === "2d") return FLAT_FRAME_MS * FLAT_FRAMES;
  return reducedMotion ? REDUCED_HANDOFF_MS : HANDOFF_MS;
}

/** Where an avatar's flat cut-out holds the paper, from its feet, in metres (spec 002's hand-off): left of its centre
 *  by 35% of its width, and up 60% of its height, never above 0.95 m. */
function avatarHand(avatar: AvatarId): readonly [number, number, number] {
  const { width, height } = AVATAR_SHAPES[avatar];
  return [-width * 0.35, Math.min(0.95, height * 0.6), 0];
}

/** How far the chosen avatar's hand is from the first avatar's, which the scene's hand-off anchor is: in the visitor's
 *  own frame, in metres. */
export function handOffset(avatar: AvatarId): readonly [number, number, number] {
  const [own, first] = [avatarHand(avatar), avatarHand(AVATARS[0].id)];
  return [own[0] - first[0], own[1] - first[1], own[2] - first[2]];
}

/** The still frame a progress falls in, 0 to FLAT_FRAMES - 1. */
export function flatFrame(progress: number): number {
  return Math.min(FLAT_FRAMES - 1, Math.max(0, Math.floor(progress * FLAT_FRAMES + 1e-9)));
}

export interface Handoff {
  /** How far it has gone, 0 to 1. */
  progress(): number;
  readonly finished: boolean;
}

/**
 * Plays the hand-off on the clock: `show` gets the progress on every frame, at each third exactly (the 2D frames'
 * boundaries), and 1 at the end, when `onDone` runs. The length is fixed when it starts, whatever the stage becomes.
 */
export function runHandoff(options: {
  clock: Clock;
  durationMs: number;
  announce(text: string): void;
  show(progress: number): void;
  onDone(): void;
}): Handoff {
  const { clock, durationMs } = options;
  const start = clock.now();
  let finished = false;
  let frame = 0;
  const progress = (): number => (finished ? 1 : Math.min(1, Math.max(0, (clock.now() - start) / durationMs)));
  const tick = (): void => {
    if (finished) return;
    options.show(progress());
    frame = clock.requestFrame(tick);
  };

  options.announce(HANDOFF_LINE);
  options.show(0);
  frame = clock.requestFrame(tick);
  for (let i = 1; i < FLAT_FRAMES; i += 1) {
    clock.setTimeout(
      () => {
        if (!finished) options.show(i / FLAT_FRAMES);
      },
      (durationMs * i) / FLAT_FRAMES,
    );
  }
  clock.setTimeout(() => {
    finished = true;
    clock.cancelFrame(frame);
    options.show(1);
    options.onDone();
  }, durationMs);

  return {
    progress,
    get finished() {
      return finished;
    },
  };
}
