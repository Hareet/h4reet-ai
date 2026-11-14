// The visitor's avatar's walking legs (spec 019; plan.md §2): a gait laid over the playing clip, so an avatar with no
// `walk` clip no longer slides on its feet. The math here is pure (phase from the distance walked, an amplitude that
// eases in and out, six leg-bone angles); the bones' part (findLegRig, applyGait, clearGait) follows it.

/** Tunables, each a one-line edit at the Author's look pass (SC-005). Angles in radians. */
export const CYCLE_PER_HEIGHT = 0.7;
/** The amplitude's ease, in seconds, from 0 to full and back. */
export const EASE_S = 0.15;
/** The longest frame the gait takes, in seconds: a stalled tab doesn't jump the ease. */
export const DT_MAX_S = 0.1;
/** The thigh's swing, the shin's bend, and the foot's share of the thigh's swing, held level against it. */
export const HIP_MAX = 0.45;
export const KNEE_MAX = 0.9;
export const ANKLE_GAIN = 0.3;

export interface GaitState {
  /** A turn of the left leg's cycle, 0 up to 1. */
  readonly phase: number;
  /** 0 standing, 1 a full stride. */
  readonly amp: number;
}

export interface LegAngles {
  readonly hip: number;
  readonly knee: number;
  readonly ankle: number;
}

/** One whole stride, left foot down to left foot down, in metres, for a body this tall. */
export const cycleLength = (heightM: number): number => CYCLE_PER_HEIGHT * heightM;

/**
 * One frame: the phase moves by the distance walked over the cycle (never by time: feet don't skate, FR-002), and the
 * amplitude eases toward `min(1, speedShare)` while `on`, else toward 0.
 */
export function advance(
  state: GaitState,
  distanceM: number,
  speedShare: number,
  dt: number,
  on: boolean,
  cycleM: number,
): GaitState {
  const step = Math.min(Math.max(dt, 0), DT_MAX_S) / EASE_S;
  const target = on ? Math.min(1, Math.max(0, speedShare)) : 0;
  const amp = state.amp < target ? Math.min(target, state.amp + step) : Math.max(target, state.amp - step);
  const turns = cycleM > 0 && Number.isFinite(distanceM) ? Math.max(0, distanceM) / cycleM : 0;
  const phase = (((state.phase + turns) % 1) + 1) % 1;
  return { phase, amp };
}

/** One leg's angles: the thigh swings as a sine, the shin bends only through the forward swing, the foot stays level. */
function leg(phase: number, amp: number): LegAngles {
  const turn = 2 * Math.PI * phase;
  const hip = amp * HIP_MAX * Math.sin(turn);
  return { hip, knee: amp * KNEE_MAX * Math.max(0, Math.cos(turn)), ankle: -ANKLE_GAIN * hip };
}

/** Both legs' angles, the right half a cycle behind the left. Pure and total. */
export function legOffsets(phase: number, amp: number): { left: LegAngles; right: LegAngles } {
  return { left: leg(phase, amp), right: leg(phase + 0.5, amp) };
}
