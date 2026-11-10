// T004 (spec 014; FR-010, FR-016; contracts/frame-area.md §2, §5; plan.md §2.2, PD-2): a composed scene for the frame
// area's protector (test/room/protect.test.ts), in the protector's input form and in world metres, shaped as the
// room's own: a shell about 2.13 m wide and tall whose open front is z = 0, a desk at the back wall, a selectable hung
// on each side wall, one on the desk's right, and the two figures where the scene places them, the visitor front left
// and the twin front right. Every box is framed, as RG4 holds a selectable's members and the twin's placement. Plain
// data, so it builds without the module it is the input of.

/** A box in world metres, as `compose/framing.ts`'s Box. */
export interface FixtureBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

const box = (min: [number, number, number], max: [number, number, number]): FixtureBox => ({ min, max });

const SHELL = box([-1.065, 0, -1.22], [1.065, 2.13, 0]);
const DESK = box([-0.6, 0, -1.2], [0.6, 0.75, -0.62]);
const BOARD = box([-1.065, 1.0, -0.95], [-1.035, 1.6, -0.35]);
const BIKE = box([0.98, 0.9, -1.05], [1.065, 1.7, -0.25]);
const LAPTOP = box([0.32, 0.75, -0.95], [0.58, 0.97, -0.7]);
const VISITOR = box([-0.85, 0, -0.32], [-0.5, 1.7, -0.08]);
const TWIN = box([0.5, 0, -0.32], [0.85, 1.8, -0.08]);

/** The protector's input: the framing's boxes, the selectables in scene order with their members' boxes and whether
 *  each hangs on a side wall, and the two figures' framed boxes. */
export const PROTECT_SCENE = {
  framed: [SHELL, DESK, BOARD, BIKE, LAPTOP, VISITOR, TWIN],
  selectables: [
    { id: "board", boxes: [BOARD], sideWall: true },
    { id: "bike", boxes: [BIKE], sideWall: true },
    { id: "laptop", boxes: [LAPTOP], sideWall: false },
  ],
  figures: [VISITOR, TWIN],
} as const;

/** The selectables by ID, and the figures by name, for the tests' messages. */
export const PROTECT_IDS = { selectables: ["board", "bike", "laptop"], figures: ["visitor", "twin"] } as const;
