// The room's selectable objects (spec 002, FR-020; contracts/room-scene.md §2): their IDs, names, and topics, and the
// pointer and touch handling that turns a tap on the scene into selectObject(id). Three.js stays out of this file: the
// list, the 2D drawing, and the manifest use it too, and the 3D chunk (scene.ts) supplies the picker, which picks a
// selectable's ID from the bundle's pick areas (spec 004, T098). A mouse, a touch, and the "In the room" list's button
// all end in the same selectObject, so the paths can't drift.
export const ROOM_OBJECTS = [
  { id: "snowboard", name: "Snowboard", topic: "hobbies and general life" },
  { id: "bicycle", name: "Bicycle", topic: "travel adventures" },
  { id: "laptop", name: "Laptop and screen", topic: "work projects" },
] as const;

export type RoomObject = (typeof ROOM_OBJECTS)[number];
export type ObjectId = RoomObject["id"];

export function isObjectId(value: unknown): value is ObjectId {
  return ROOM_OBJECTS.some((o) => o.id === value);
}

export function objectById(id: ObjectId): RoomObject {
  const found = ROOM_OBJECTS.find((o) => o.id === id);
  if (!found) throw new Error(`no room object ${String(id)}`);
  return found;
}

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
