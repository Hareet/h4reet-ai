// The lexical ranking (spec 007; FR-008; plan §4, a plan choice): BM25 with k1 1.2 and b 0.75 over the pack's sections,
// built in memory at start. Tokens are lowercase, accent-folded words, without a fixed English stop list, with a light
// suffix stemmer (s, es, ed, ing). The query is the newest visitor turn, with the previous visitor turn at half weight,
// so "tell me more" keeps its subject. Sections scoring 0 never enter; ties break by pack order. It reads nothing and
// calls nothing: identical inputs give identical rankings.

const K1 = 1.2;
const B = 0.75;

/** A fixed English stop list: function words, and the words a visitor asks with. */
const STOP = new Set(
  (
    "a about above after again against all also am an and any are as at be because been before being below between " +
    "both but by can could did do does doing down during each few for from further had has have having he her here " +
    "hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off " +
    "on once only or other our ours ourselves out over own same she should so some such tell than that the their " +
    "theirs them themselves then there these they this those through to too under until up very was we were what " +
    "when where which while who whom why will with would you your yours yourself yourselves please"
  ).split(" "),
);

/** One word's stem: s, es, ed, or ing taken off, keeping at least three letters. */
function stem(word: string): string {
  for (const suffix of ["ing", "es", "ed", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length);
  }
  return word;
}

/** A text's tokens: lowercase, accent-folded words, stop words dropped, stemmed. */
export function tokenize(text: string): string[] {
  const folded = text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
  const out: string[] = [];
  for (const m of folded.matchAll(/[a-z0-9]+(?:['’][a-z]+)?/g)) {
    const word = m[0].replace(/['’][a-z]+$/, "");
    if (word.length < 2 || STOP.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}

interface Doc {
  readonly id: string;
  readonly order: number;
  readonly length: number;
  readonly tf: ReadonlyMap<string, number>;
}

export interface Ranked {
  readonly id: string;
  readonly score: number;
}

export class Ranker {
  private readonly docs: Doc[];
  private readonly df = new Map<string, number>();
  private readonly avgdl: number;

  constructor(sections: readonly { id: string; text: string }[]) {
    this.docs = sections.map((s, order) => {
      const tokens = tokenize(s.text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { id: s.id, order, length: tokens.length, tf };
    });
    const total = this.docs.reduce((n, d) => n + d.length, 0);
    this.avgdl = this.docs.length === 0 ? 0 : total / this.docs.length;
  }

  private idf(term: string): number {
    const n = this.docs.length;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /** The sections that share the query's words, best first, ties in pack order; none that score 0. */
  rank(query: string, previous?: string): Ranked[] {
    const weights = new Map<string, number>();
    for (const t of tokenize(query)) weights.set(t, Math.max(weights.get(t) ?? 0, 1));
    for (const t of tokenize(previous ?? "")) weights.set(t, Math.max(weights.get(t) ?? 0, 0.5));
    if (weights.size === 0 || this.avgdl === 0) return [];
    const scored: (Ranked & { order: number })[] = [];
    for (const d of this.docs) {
      let score = 0;
      for (const [term, weight] of weights) {
        const f = d.tf.get(term) ?? 0;
        if (f === 0) continue;
        score += weight * this.idf(term) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / this.avgdl)));
      }
      if (score > 0) scored.push({ id: d.id, score, order: d.order });
    }
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    return scored.map(({ id, score }) => ({ id, score }));
  }
}
