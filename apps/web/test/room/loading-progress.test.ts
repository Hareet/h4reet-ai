// T004 (spec 012; FR-010 to FR-014; SC-001; contracts/loading-progress.md §1, §2): src/room/loading/progress.ts, the
// loader's progress model, pure and in Node. Four parts: the 3D code, the room's text, and the typefaces are steps of
// 10, 2, and 3; the figures' files and the set models share 85 by their bytes as served, each counting once its load
// has ended (loaded, failed, or skipped), never on a retry or for an asset not expected. Every end heard is kept, those
// before the 3D stage's list of files among them, and counts once the list arrives (PD-22). The value is the ended
// shares' sum rounded down, never lower than before, at most 99 until every part has ended and 100 once it has; the
// stage line's stage follows the parts. Over 200 seeded random orders and the adversarial ones, of a room with the
// repository's set models' sizes, two avatars' files, and the three steps, with some ends heard before the list.
import { describe, expect, it } from "vitest";

import { SHARES, createProgress } from "../../src/room/loading/progress";
import type { ExpectedFile, Progress, ProgressState } from "../../src/room/loading/progress";
import { modelEntries } from "../../src/room/scene/loader";
import { repositoryBundle } from "../helpers/room";

const STEPS = ["code", "text", "typefaces"] as const;
type Step = (typeof STEPS)[number];

/** The value the shares give: the ended steps' shares and, once the list has arrived, the files' share in proportion
 *  to the ended bytes, as one exact fraction rounded down; the whole share once every file has ended. */
function expectedValue(
  steps: ReadonlySet<Step>,
  files: { listed: boolean; ended: number; total: number; whole: boolean },
): number {
  const stepSum = [...steps].reduce((n, s) => n + SHARES[s], 0);
  if (!files.listed) return stepSum;
  if (files.whole || files.total === 0) return stepSum + SHARES.files;
  return Math.floor((stepSum * files.total + SHARES.files * files.ended) / files.total);
}

/** A seeded generator (mulberry32), so each order is the same on every run. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The repository's set models, as the 3D stage lists them, and two avatars' files: a model and three clips each. */
function roomFiles(): ExpectedFile[] {
  const models = modelEntries(repositoryBundle().scene).map((e) => ({ asset: e.asset, bytes: e.bytes }));
  const avatar = (id: string, model: number): ExpectedFile[] => [
    { asset: `${id}-model`, bytes: model },
    ...["idle", "idle-holding", "take"].map((role, i) => ({ asset: `${id}-${role}`, bytes: 90_000 + i * 7_000 })),
  ];
  return [...avatar("fx-stand-in", 2_400_000), ...avatar("fx-chosen", 1_800_000), ...models];
}

const outcomes = ["loaded", "failed", "skipped"] as const;

describe("the parts and their shares (PD-3)", () => {
  it("are code 10, text 2, typefaces 3, and files 85, summing to 100", () => {
    expect(SHARES).toEqual({ code: 10, text: 2, typefaces: 3, files: 85 });
    expect(Object.values(SHARES).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.isFrozen(SHARES)).toBe(true);
  });

  it("starts at 0, the stage the code's", () => {
    const p = createProgress();
    expect(p.state).toEqual({ value: 0, stage: "code", done: 0, total: 0, complete: false });
  });

  it("counts each step once, whatever repeats", () => {
    const p = createProgress();
    p.ended("code");
    p.ended("code");
    expect(p.state.value).toBe(10);
    p.ended("text");
    p.ended("typefaces");
    expect(p.state.value).toBe(15);
  });
});

describe("a file's share (FR-011)", () => {
  const files: ExpectedFile[] = [
    { asset: "fx-a", bytes: 300 },
    { asset: "fx-b", bytes: 100 },
    { asset: "fx-c", bytes: 600 },
  ];

  it.each(outcomes)("counts its served bytes as a share of the expected total on %s, once", (outcome) => {
    const p = createProgress();
    p.expected(files);
    p.asset("fx-a", outcome);
    expect(p.state.value).toBe(Math.floor((85 * 300) / 1000));
    expect([p.state.done, p.state.total]).toEqual([1, 3]);
    p.asset("fx-a", outcome);
    p.asset("fx-a", "loaded");
    expect(p.state.value).toBe(Math.floor((85 * 300) / 1000));
    expect(p.state.done).toBe(1);
  });

  it("counts nothing on retried, or for an asset not expected", () => {
    const p = createProgress();
    p.expected(files);
    p.asset("fx-a", "retried");
    p.asset("fx-zz", "loaded");
    expect(p.state.value).toBe(0);
    expect(p.state.done).toBe(0);
  });

  it("counts 0 before the list arrives, and ends at once on an empty list or a total of 0", () => {
    const before = createProgress();
    before.ended("code");
    before.asset("fx-a", "loaded");
    expect(before.state.value).toBe(10);
    const empty = createProgress();
    empty.ended("code");
    empty.expected([]);
    expect(empty.state.value).toBe(95);
    expect(empty.state.stage).toBe("finishing");
    const zero = createProgress();
    zero.ended("code");
    zero.expected([{ asset: "fx-a", bytes: 0 }]);
    expect(zero.state.value).toBe(95);
  });

  it("takes the list once: a second is ignored; a duplicate asset counts once, at its largest bytes", () => {
    const p = createProgress();
    p.expected([
      { asset: "fx-a", bytes: 100 },
      { asset: "fx-a", bytes: 300 },
      { asset: "fx-b", bytes: 100 },
    ]);
    p.expected([{ asset: "fx-z", bytes: 1 }]);
    expect(p.state.total).toBe(2);
    p.asset("fx-a", "loaded");
    expect(p.state.value).toBe(Math.floor((85 * 300) / 400));
    p.asset("fx-z", "loaded");
    expect(p.state.done).toBe(1);
  });
});

describe("ends heard before the list (FR-014; PD-22)", () => {
  it("counts every skip heard before the list in full the moment it arrives, the files' part then ended", () => {
    const p = createProgress();
    const files = roomFiles();
    p.ended("code");
    for (const f of files) p.asset(f.asset, "skipped");
    expect(p.state.value).toBe(10);
    p.expected(files);
    expect(p.state.value).toBe(95);
    expect([p.state.done, p.state.total]).toEqual([files.length, files.length]);
    expect(p.state.stage).toBe("finishing");
    p.ended("text");
    p.ended("typefaces");
    expect(p.state).toEqual({ value: 100, stage: "done", done: files.length, total: files.length, complete: true });
  });

  it("counts a mix of ends before and after the list, each once", () => {
    const p = createProgress();
    p.asset("fx-a", "skipped");
    p.asset("fx-b", "failed");
    p.expected([
      { asset: "fx-a", bytes: 100 },
      { asset: "fx-b", bytes: 100 },
      { asset: "fx-c", bytes: 200 },
    ]);
    expect(p.state.value).toBe(Math.floor((85 * 200) / 400));
    p.asset("fx-b", "loaded");
    p.asset("fx-c", "loaded");
    expect(p.state.value).toBe(85);
    expect(p.state.done).toBe(3);
  });
});

describe("the value over every order (SC-001)", () => {
  type End = { kind: "step"; step: Step } | { kind: "file"; asset: string; outcome: (typeof outcomes)[number] };

  /** Plays one order of ends, some before the list (the first `early` files'), checking the value after each. */
  function play(order: readonly End[], files: readonly ExpectedFile[], listAfter: number, label: string): void {
    const p: Progress = createProgress();
    const bytes = new Map(files.map((f) => [f.asset, f.bytes]));
    const total = files.reduce((n, f) => n + f.bytes, 0);
    const steps = new Set<Step>();
    const endedFiles = new Set<string>();
    let listed = false;
    let last = 0;
    const check = (where: string): void => {
      const ended = [...endedFiles].reduce((n, a) => n + (bytes.get(a) ?? 0), 0);
      const filesDone = listed && endedFiles.size === files.length;
      const sum = expectedValue(steps, { listed, ended, total, whole: filesDone });
      const complete = steps.size === 3 && filesDone;
      const state: ProgressState = p.state;
      expect(state.complete, `${label} ${where}`).toBe(complete);
      // The sum rounded down, but never above 99 until every part has ended.
      const want = complete ? 100 : Math.min(99, Math.max(last, sum));
      expect(state.value, `${label} ${where}`).toBe(want);
      expect(state.value, `${label} ${where}: never down`).toBeGreaterThanOrEqual(last);
      if (!complete) expect(state.value, `${label} ${where}`).toBeLessThanOrEqual(99);
      last = state.value;
    };
    order.forEach((end, i) => {
      if (i === listAfter) {
        p.expected(files);
        listed = true;
        check("at the list");
      }
      if (end.kind === "step") {
        p.ended(end.step);
        steps.add(end.step);
      } else {
        p.asset(end.asset, end.outcome);
        endedFiles.add(end.asset);
      }
      check(`after end ${i}`);
    });
    if (!listed) {
      p.expected(files);
      listed = true;
      check("at the list, last");
    }
    expect(p.state.value, label).toBe(100);
    expect(p.state.complete, label).toBe(true);
  }

  const files = roomFiles();
  const ends = (next: () => number): End[] => [
    ...STEPS.map((step): End => ({ kind: "step", step })),
    ...files.map((f): End => ({ kind: "file", asset: f.asset, outcome: outcomes[Math.floor(next() * 3)] ?? "loaded" })),
  ];

  it("has the repository's set models and two avatars' files to count", () => {
    expect(files.length).toBeGreaterThan(8);
    expect(new Set(files.map((f) => f.asset)).size).toBe(files.length);
  });

  it("equals the ended shares' sum rounded down after every end, over 200 seeded random orders", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const next = random(seed);
      const order = shuffle(ends(next), next);
      // Some ends before the list: up to a third of the order, as below ADR 0010's floor.
      const listAfter = Math.floor(next() * (order.length / 3));
      play(order, files, listAfter, `seed ${seed}`);
    }
  });

  it("holds over the adversarial orders: the largest file last, the smallest last, and the three steps last", () => {
    const next = random(7);
    const all = ends(next);
    const sized = (e: End): number => (e.kind === "file" ? (files.find((f) => f.asset === e.asset)?.bytes ?? 0) : -1);
    const fileEnds = all.filter((e) => e.kind === "file");
    const stepEnds = all.filter((e) => e.kind === "step");
    const ascending = [...fileEnds].sort((a, b) => sized(a) - sized(b));
    const descending = [...ascending].reverse();
    play([...stepEnds, ...ascending], files, 0, "the largest file last");
    play([...stepEnds, ...descending], files, 0, "the smallest file last");
    play([...ascending, ...stepEnds], files, 0, "the steps last");
    play([...ascending, ...stepEnds], files, ascending.length, "the steps last, every file heard before the list");
  });
});

describe("the stage line's stage (FR-016)", () => {
  it("is code, then pieces with done and total, then finishing, then done", () => {
    const p = createProgress();
    expect(p.state.stage).toBe("code");
    p.ended("code");
    // The 3D code has arrived, but not the list of what the stage will load: still the room's code.
    expect(p.state.stage).toBe("code");
    p.expected([
      { asset: "fx-a", bytes: 10 },
      { asset: "fx-b", bytes: 10 },
    ]);
    expect(p.state).toMatchObject({ stage: "pieces", done: 0, total: 2 });
    p.asset("fx-a", "loaded");
    expect(p.state).toMatchObject({ stage: "pieces", done: 1, total: 2 });
    p.asset("fx-b", "failed");
    expect(p.state).toMatchObject({ stage: "finishing", done: 2, total: 2 });
    p.ended("text");
    expect(p.state.stage).toBe("finishing");
    p.ended("typefaces");
    expect(p.state).toMatchObject({ stage: "done", complete: true, value: 100 });
  });
});

describe("a total model (contract §2)", () => {
  it("never throws on an unknown part, asset, or outcome, and ignores them", () => {
    const p = createProgress();
    const loose = p as unknown as {
      ended(part: string): void;
      asset(asset: unknown, outcome: string): void;
      expected(files: unknown): void;
    };
    expect(() => loose.ended("files")).not.toThrow();
    expect(() => loose.ended("nonsense")).not.toThrow();
    expect(() => loose.asset("fx-a", "exploded")).not.toThrow();
    expect(() => loose.asset(undefined, "loaded")).not.toThrow();
    expect(p.state.value).toBe(0);
    expect(() => loose.expected([{ asset: "fx-a", bytes: -5 }, null, { bytes: 3 }])).not.toThrow();
    expect(p.state.value).toBeLessThanOrEqual(99);
  });
});
