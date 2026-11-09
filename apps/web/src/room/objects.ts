// The pointer's selection (spec 002, FR-020; contracts/room-scene.md §2): the pointer and touch handling that turns a
// tap on the scene into selectObject(id), over the selectables' IDs as strings. The selectables, their names, and their
// topics are the bundle's index's since spec 004 (T110, T112), so no list of them stands here. Three.js stays out of
// this file: the 2D drawing uses it too, and the 3D chunk (scene.ts) supplies the picker, which picks a selectable's
// ID from the bundle's pick areas (spec 004, T098). A mouse, a touch, and the "In the room" list's button all end in
// the same selectObject, so the paths can't drift.
// Spec 008 (T016; FR-008 (a) and (b), FR-009, FR-012; plan.md R-10): the same picks are its targeting inputs, which
// the room's target store takes. A hovering pointer, a mouse or a pen that hovers, names its pick on each move, the
// same pick again included, so it takes the target back from another input, and nothing when it leaves the surface; a
// touch never hovers. A press names the pick at its start until it ends: nothing once it moves beyond the tap slop, or
// is cancelled, or ends without selecting; a finger's lift names nothing too, as the pointer leaving, while a mouse or
// a pen that selected leaves its target to its next hover, so the piece it selected isn't targeted again while it
// rests there. The review of Phase 1 (finding 3): a press takes the pointer (setPointerCapture), so a drag that ends
// off the surface still ends here; and where that fails, a mouse's or a pen's move with no button down is a hover
// again, the press whose end never came dropped as a cancel drops it.
// Spec 008's walking view (T052; FR-030, FR-032): a tap that picks nothing goes to `miss`, with its point, which the 3D
// stage turns into a walk toward the floor there while walking; a tap that picks still selects, the one selection path.

/** A point in normalized device coordinates: x and y from -1 to 1, y up. */
export interface Ndc {
  x: number;
  y: number;
}

/** The selectable under a point of the scene, by its ID, if there is one. */
export type Picker = (ndc: Ndc) => string | null;

/** A press that moves farther than this before it ends is a drag (looking around), not a tap. */
export const TAP_SLOP_PX = 10;

/** Where a surface reports its targeting inputs (spec 008, FR-008 (a) and (b)): a hovering pointer's pick, and a
 *  press's, a selectable's ID or none. */
export type PointerTarget = (input: "pointer" | "press", id: string | null) => void;

export function toNdc(rect: { left: number; top: number; width: number; height: number }, x: number, y: number): Ndc {
  return { x: ((x - rect.left) / rect.width) * 2 - 1, y: -((y - rect.top) / rect.height) * 2 + 1 };
}

/**
 * Taps on the surface select the object under them: a pointer goes down and comes up within TAP_SLOP_PX, for a mouse's
 * main button, a pen, or a finger. A mouse over an object gets the class `over-object` (a pointer cursor), which is
 * only an extra: the scene's labels and the list are the cues. With `target`, the surface reports its targeting inputs
 * too (spec 008; see above). Returns a function that unbinds.
 */
export function bindPointerSelection(
  surface: HTMLElement,
  pick: Picker,
  select: (id: string) => void,
  target?: PointerTarget,
  miss?: (ndc: Ndc) => void,
): () => void {
  /** The press in progress: where it started, whether it has moved beyond the slop, and what pressed. */
  let down: { x: number; y: number; moved: boolean; pointerType: string } | null = null;
  const at = (e: PointerEvent): string | null => {
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return pick(toNdc(rect, e.clientX, e.clientY));
  };
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) {
      down = null;
      return;
    }
    down = { x: e.clientX, y: e.clientY, moved: false, pointerType: e.pointerType };
    // The press's moves and its end come here wherever the pointer goes; a page that can't capture it falls back on
    // the moves with no button down, below.
    if (typeof surface.setPointerCapture === "function") {
      try {
        surface.setPointerCapture(e.pointerId);
      } catch {
        // Not an active pointer (a synthetic event): nothing to capture.
      }
    }
    target?.("press", at(e));
  };
  const onUp = (e: PointerEvent): void => {
    const start = down;
    down = null;
    if (!start) return;
    if (start.moved || Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) {
      // A drag: it named nothing as it left the slop, or now, if no move came between.
      if (!start.moved) target?.("press", null);
      return;
    }
    const id = at(e);
    if (id) select(id);
    else if (miss) {
      const rect = surface.getBoundingClientRect();
      if (rect.width && rect.height) miss(toNdc(rect, e.clientX, e.clientY));
    }
    if (start.pointerType === "touch" || !id) target?.("press", null);
  };
  const onCancel = (): void => {
    const start = down;
    down = null;
    if (start && !start.moved) target?.("press", null);
  };
  const onMove = (e: PointerEvent): void => {
    // A mouse or a pen moving with no button down has ended any press it made, wherever that ended.
    if (down && e.pointerType !== "touch" && e.buttons === 0) onCancel();
    const hovering = down === null && e.pointerType !== "touch";
    const id = e.pointerType === "mouse" || hovering ? at(e) : null;
    if (e.pointerType === "mouse") surface.classList.toggle("over-object", id !== null);
    if (down) {
      if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP_PX) {
        down.moved = true;
        target?.("press", null);
      }
      return;
    }
    if (hovering) target?.("pointer", id);
  };
  const onLeave = (e: PointerEvent): void => {
    if (e.pointerType !== "touch") target?.("pointer", null);
  };
  surface.addEventListener("pointerdown", onDown);
  surface.addEventListener("pointerup", onUp);
  surface.addEventListener("pointercancel", onCancel);
  surface.addEventListener("pointermove", onMove);
  surface.addEventListener("pointerleave", onLeave);
  return () => {
    surface.removeEventListener("pointerdown", onDown);
    surface.removeEventListener("pointerup", onUp);
    surface.removeEventListener("pointercancel", onCancel);
    surface.removeEventListener("pointermove", onMove);
    surface.removeEventListener("pointerleave", onLeave);
  };
}
