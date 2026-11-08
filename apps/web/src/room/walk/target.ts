// The room's target (spec 008; FR-007 to FR-013; plan.md R-06): at most one selectable at a time, the one the latest
// targeting input named, which the stage that draws shows with the highlight until it's selected. A pure reducer, in
// the entry chunk, with no DOM, no renderer, no clock, no request, and no storage, so targeting sends nothing
// (FR-013); src/room/app.ts holds its state for the visit and hands each change to the stage.
// - name(input, id): the input names a selectable, which becomes the target, its input the one that set it, unless the
//   ID is the one a selection consumed, which no input targets again until some input names another ID or none
//   (FR-012). A name of another ID, or of none, from any input, ends what the selection consumed.
// - name(input, null): the input names nothing: the target clears only if that same input set it (FR-007), so a
//   pointer leaving the stage leaves a target keyboard focus set.
// - select(id): a selection clears the target in the same call and consumes the ID (FR-011, FR-012).
// - reset: everything clears, at the hand-off and at the fall to 2D.

/** The targeting inputs (FR-008): a hovering pointer, a press, keyboard focus on the "In the room" list, and, in the
 *  walking view, reach. */
export type TargetInput = "pointer" | "press" | "focus" | "reach";

export interface TargetState {
  /** The selectable shown with the highlight, or none. */
  readonly target: string | null;
  /** The input that set the target; null without one. */
  readonly input: TargetInput | null;
  /** The ID the last selection consumed, which no input targets until another ID, or none, is named. */
  readonly consumed: string | null;
}

export type TargetEvent =
  | { readonly kind: "name"; readonly input: TargetInput; readonly id: string | null }
  | { readonly kind: "select"; readonly id: string }
  | { readonly kind: "reset" };

export const NO_TARGET: TargetState = Object.freeze({ target: null, input: null, consumed: null });

export function reduceTarget(state: TargetState, event: TargetEvent): TargetState {
  switch (event.kind) {
    case "reset":
      return NO_TARGET;
    case "select":
      return { target: null, input: null, consumed: event.id };
    case "name": {
      const { input, id } = event;
      if (id === null) {
        const own = state.input === input;
        return { target: own ? null : state.target, input: own ? null : state.input, consumed: null };
      }
      if (id === state.consumed) return state;
      return { target: id, input, consumed: null };
    }
  }
}
