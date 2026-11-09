// The load order (spec 004; FR-056; R-28; data-model.md §10.2; contracts/room-bundle.md §3.2): the order the room
// fetches studio models in, which the compositor writes into the 3D part's `load_order` after the twin and the chosen
// avatar: the framed members of selectables first, in the selectables' scene order, the shown pose first; then the
// other framed placements; then the rest. Only what shows a set model is listed, and a model several placements or
// poses share is fetched once, where it first comes.

export interface LoadEntry {
  /** What the room loads the model under: a placement's ID, or a switch's pose. */
  readonly id: string;
  /** The set model it shows (its piece's file), or null while it shows its stand-in. */
  readonly model: string | null;
  readonly framed: boolean;
  /** The scene-order index of the selectable it belongs to, or null. */
  readonly selectable: number | null;
  /** False for a switch's pose that the shown case doesn't place. */
  readonly shown: boolean;
}

const tier = (e: LoadEntry): number => (e.framed && e.selectable !== null ? 0 : e.framed ? 1 : 2);

/** The IDs to load under, in order; entries arrive in the scene's order. */
export function loadOrder(entries: readonly LoadEntry[]): string[] {
  const ranked = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.model !== null)
    .sort(
      (a, b) =>
        tier(a.entry) - tier(b.entry) ||
        (tier(a.entry) === 0 ? (a.entry.selectable ?? 0) - (b.entry.selectable ?? 0) : 0) ||
        Number(b.entry.shown) - Number(a.entry.shown) ||
        a.index - b.index,
    );
  const fetched = new Set<string>();
  const order: string[] = [];
  for (const { entry } of ranked) {
    if (entry.model === null || fetched.has(entry.model)) continue;
    fetched.add(entry.model);
    order.push(entry.id);
  }
  return order;
}
