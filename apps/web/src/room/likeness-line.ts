// Spec 020 (FR-007; plan.md R-02, reworked for Q69): the likeness line of a visitor-avatar model, shown while any figure
// of the room shows that model: the visitor's figure, or a room figure (spec 025's dog). The room feeds this holder each
// figure's picture signal; it keeps each figure's latest line, drops a figure's when its next picture carries none (a
// cut-out, a failure, its model gone), and gives one line while one figure or more holds it, so the stage's note and
// "Around the room" say it once, and null otherwise. Pure: no DOM, no clock, no event.

export interface LikenessLine {
  /** A figure's picture signal: its line, or null (or "") where the picture it shows carries none. */
  picture(figure: string, line: string | null): void;
  /** Drops every figure's line, as the 3D stage goes (the 2D room shows no model). */
  clear(): void;
  /** The line to show: the earliest-held figure's that still holds one, or null. */
  readonly line: string | null;
}

export function createLikenessLine(): LikenessLine {
  const held = new Map<string, string>();
  return {
    picture(figure, line) {
      if (line === null || line === "") held.delete(figure);
      else held.set(figure, line);
    },
    clear() {
      held.clear();
    },
    get line() {
      for (const line of held.values()) return line;
      return null;
    },
  };
}
