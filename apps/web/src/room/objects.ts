// The pointer's selection (spec 002, FR-020; contracts/room-scene.md §2): the pointer and touch handling that turns a
// tap on the scene into selectObject(id), over the selectables' IDs as strings. The selectables, their names, and their
// topics are the bundle's index's since spec 004 (T110, T112), so no list of them stands here. Three.js stays out of
// this file: the 2D drawing uses it too, and the 3D chunk (scene.ts) supplies the picker, which picks a selectable's
// ID from the bundle's pick areas (spec 004, T098). A mouse, a touch, and the "In the room" list's button all end in
// the same selectObject, so the paths can't drift.

/** A point in normalized device coordinates: x and y from -1 to 1, y up. */
export interface Ndc {
  x: number;
  y: number;
}

/** The selectable under a point of the scene, by its ID, if there is one. */
export type Picker = (ndc: Ndc) => string | null;

/** A press that moves farther than this before it ends is a drag (looking around), not a tap. */
export const TAP_SLOP_PX = 10;

export function toNdc(rect: { left: number; top: number; width: number; height: number }, x: number, y: number): Ndc {
  return { x: ((x - rect.left) / rect.width) * 2 - 1, y: -((y - rect.top) / rect.height) * 2 + 1 };
}

/**
 * Taps on the surface select the object under them: a pointer goes down and comes up within TAP_SLOP_PX, for a mouse's
 * main button, a pen, or a finger. A mouse over an object gets the class `over-object` (a pointer cursor), which is
 * only an extra: the scene's labels and the list are the cues. Returns a function that unbinds.
 */
export function bindPointerSelection(surface: HTMLElement, pick: Picker, select: (id: string) => void): () => void {
  let down: { x: number; y: number } | null = null;
  const at = (e: PointerEvent): string | null => {
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return pick(toNdc(rect, e.clientX, e.clientY));
  };
  const onDown = (e: PointerEvent): void => {
    down = e.pointerType === "mouse" && e.button !== 0 ? null : { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent): void => {
    const start = down;
    down = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
    const id = at(e);
    if (id) select(id);
  };
  const onCancel = (): void => {
    down = null;
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") surface.classList.toggle("over-object", at(e) !== null);
  };
  surface.addEventListener("pointerdown", onDown);
  surface.addEventListener("pointerup", onUp);
  surface.addEventListener("pointercancel", onCancel);
  surface.addEventListener("pointermove", onMove);
  return () => {
    surface.removeEventListener("pointerdown", onDown);
    surface.removeEventListener("pointerup", onUp);
    surface.removeEventListener("pointercancel", onCancel);
    surface.removeEventListener("pointermove", onMove);
  };
}
