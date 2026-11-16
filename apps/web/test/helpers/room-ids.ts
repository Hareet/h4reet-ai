// The room's IDs for spec 026's tests that read the repository's own room (verify-026). Spec 004's FR-007
// (build/room/scan.ts) lets no ID that only the room's data defines stand in a test, so each is found in the
// repository's bundle by its words, as eat-scene.test.ts finds the busy sign: a placement by its label's words, a
// selectable by its name, a topic by its phrase, and the twin's figure by the scene's `figures.twin`.
import { repositoryBundle } from "./room";

function one(what: string, found: readonly string[]): string {
  if (found.length !== 1 || found[0] === undefined) throw new Error(`${found.length} ${what}`);
  return found[0];
}

/** The placement whose label's words are `words`, in the repository's bundle. */
export function placementLabelled(words: string): string {
  const { scene, index } = repositoryBundle();
  const found = scene.placements.filter((p) => p.label !== null && index.ui[p.label] === words).map((p) => p.id);
  return one(`placements labelled "${words}"`, found);
}

/** The selectable named `name`, in the repository's bundle. */
export function selectableNamed(name: string): string {
  const found = repositoryBundle()
    .index.selectables.filter((s) => s.name === name)
    .map((s) => s.id);
  return one(`selectables named "${name}"`, found);
}

/** The topic whose phrase is `phrase`, in the repository's bundle. */
export function topicPhrased(phrase: string): string {
  const found = repositoryBundle()
    .index.topics.filter((t) => t.phrase === phrase)
    .map((t) => t.id);
  return one(`topics phrased "${phrase}"`, found);
}

/** The twin's figure's placement, the scene's `figures.twin`. */
export function twinFigure(): string {
  return repositoryBundle().scene.figures.twin;
}
