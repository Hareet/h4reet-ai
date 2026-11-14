// Spec 024 (FR-005, FR-007, FR-009 to FR-011, FR-016; plan.md §5.3): the meal ledger, pure and in memory. Per piece, its
// chunks' states and centres; a bite takes the nearest standing chunk to the mouth, ties to the lowest index, one bite
// at a time across the room, and never the last standing chunk of a piece whose set-aside part is empty (FR-005). A
// chunk is eaten when its flight lands; `eating.regrow_s` after a piece's last landing (or its last regrowth), the
// earliest eaten chunk starts to regrow, then the next that long after, until the piece is whole (FR-011). The ledger
// keeps no timer: the 3D side calls tick() each frame, and a pause stops the clock it counts by. It never stores or sends
// anything (FR-014, FR-016): there is nowhere in it for a byte to go.

export type ChunkState = "standing" | "flying" | "eaten" | "regrowing";
export type Point = readonly [number, number, number];

export interface MealPiece {
  /** Each chunk's centre, in the frame the mouth is given in. */
  readonly centres: readonly Point[];
  /** True where the piece's set-aside part has no triangle, so its last standing chunk must stay. */
  readonly asideEmpty: boolean;
}

export interface Regrowth {
  readonly piece: string;
  readonly index: number;
}

export interface Meal {
  addPiece(id: string, piece: MealPiece): void;
  has(id: string): boolean;
  /** Whether a bite on the piece would take a chunk now (FR-001's "one of its chunks stands that FR-005 lets it eat"). */
  canBite(id: string): boolean;
  /** Starts a bite: the chunk's index, now flying, or null. */
  bite(id: string, mouth: Point): number | null;
  /** A flight's end: the chunk is eaten, and the piece's regrowth timer starts again. */
  landed(id: string, index: number): void;
  /** Whether a chunk is in flight anywhere. */
  flying(): boolean;
  /** The chunks that start to regrow now; each is "regrowing" until grown(). */
  tick(): Regrowth[];
  grown(id: string, index: number): void;
  /** True once a visit per piece, the first time it's asked after the piece's first bite (FR-010's polite line). */
  firstBite(id: string): boolean;
  states(id: string): readonly ChunkState[];
  /** Every chunk standing. */
  whole(id: string): boolean;
  pause(): void;
  resume(): void;
}

interface PieceState {
  readonly centres: readonly Point[];
  readonly asideEmpty: boolean;
  readonly states: ChunkState[];
  /** Eaten chunks, earliest first. */
  readonly queue: number[];
  /** The time the next regrowth is due, in the ledger's own (pause-free) milliseconds; null with nothing eaten. */
  due: number | null;
  bitten: boolean;
  said: boolean;
}

export function createMeal(options: { readonly regrow_s: number; readonly now: () => number }): Meal {
  const regrowMs = options.regrow_s * 1000;
  const pieces = new Map<string, PieceState>();
  let inFlight: { piece: string; index: number } | null = null;
  // The ledger's time stops while paused: `offset` is the paused time so far, `pausedAt` the pause's start.
  let offset = 0;
  let pausedAt: number | null = null;
  const time = (): number => (pausedAt ?? options.now()) - offset;

  const standing = (p: PieceState): number => p.states.filter((s) => s === "standing").length;
  const biteable = (p: PieceState): boolean => standing(p) > (p.asideEmpty ? 1 : 0);

  return {
    addPiece(id, piece) {
      pieces.set(id, {
        centres: piece.centres,
        asideEmpty: piece.asideEmpty,
        states: piece.centres.map(() => "standing"),
        queue: [],
        due: null,
        bitten: false,
        said: false,
      });
    },
    has: (id) => pieces.has(id),
    canBite(id) {
      const p = pieces.get(id);
      return p !== undefined && pausedAt === null && inFlight === null && biteable(p);
    },
    bite(id, mouth) {
      const p = pieces.get(id);
      if (p === undefined || pausedAt !== null || inFlight !== null || !biteable(p)) return null;
      let best = -1;
      let bestD = Infinity;
      p.states.forEach((s, i) => {
        if (s !== "standing") return;
        const c = p.centres[i] as Point;
        const d = (c[0] - mouth[0]) ** 2 + (c[1] - mouth[1]) ** 2 + (c[2] - mouth[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best < 0) return null;
      p.states[best] = "flying";
      p.bitten = true;
      inFlight = { piece: id, index: best };
      return best;
    },
    landed(id, index) {
      const p = pieces.get(id);
      if (p === undefined || p.states[index] !== "flying") return;
      p.states[index] = "eaten";
      p.queue.push(index);
      p.due = time() + regrowMs;
      if (inFlight?.piece === id && inFlight.index === index) inFlight = null;
    },
    flying: () => inFlight !== null,
    tick() {
      if (pausedAt !== null) return [];
      const now = time();
      const out: Regrowth[] = [];
      for (const [id, p] of pieces) {
        if (p.due === null || now < p.due) continue;
        const index = p.queue.shift();
        if (index === undefined) {
          p.due = null;
          continue;
        }
        p.states[index] = "regrowing";
        out.push({ piece: id, index });
        p.due = p.queue.length > 0 ? p.due + regrowMs : null;
      }
      return out;
    },
    grown(id, index) {
      const p = pieces.get(id);
      if (p !== undefined && p.states[index] === "regrowing") p.states[index] = "standing";
    },
    firstBite(id) {
      const p = pieces.get(id);
      if (p === undefined || !p.bitten || p.said) return false;
      p.said = true;
      return true;
    },
    states: (id) => pieces.get(id)?.states ?? [],
    whole: (id) => pieces.get(id)?.states.every((s) => s === "standing") ?? false,
    pause() {
      if (pausedAt === null) pausedAt = options.now();
    },
    resume() {
      if (pausedAt === null) return;
      offset += options.now() - pausedAt;
      pausedAt = null;
    },
  };
}
