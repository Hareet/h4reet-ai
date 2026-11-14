// T001 (spec 018; FR-011, plan.md §1 P3): the HUD's frame and brush strokes are drawn from a seeded path, so the same
// seed draws the same hand, another seed another, and every point stays inside its box.
import { describe, expect, it } from "vitest";

import { brushStrokePath, roughFramePath } from "../../src/room/hud/frame";

const ALLOWED = /^[MLCQZ0-9.,\-\s]+$/;
const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe("roughFramePath", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    expect(roughFramePath(400, 300, 7)).toBe(roughFramePath(400, 300, 7));
    expect(roughFramePath(400, 300, 7)).not.toBe(roughFramePath(400, 300, 8));
  });
  it("closes the frame and uses only path commands and numbers", () => {
    const d = roughFramePath(400, 300, 3);
    expect(d.startsWith("M")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
    expect(d).toMatch(ALLOWED);
  });
  it("stays inside its box by a margin", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const d = roughFramePath(400, 300, seed);
      const n = numbers(d);
      for (let i = 0; i + 1 < n.length; i += 2) {
        expect(n[i]).toBeGreaterThanOrEqual(0);
        expect(n[i]).toBeLessThanOrEqual(400);
        expect(n[i + 1]).toBeGreaterThanOrEqual(0);
        expect(n[i + 1]).toBeLessThanOrEqual(300);
      }
      // Margin: no point on the very edge.
      expect(Math.min(...n)).toBeGreaterThan(0);
    }
  });
});

describe("brushStrokePath", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    expect(brushStrokePath(200, 5)).toBe(brushStrokePath(200, 5));
    expect(brushStrokePath(200, 5)).not.toBe(brushStrokePath(200, 6));
  });
  it("uses only path commands and numbers, inside its width", () => {
    const d = brushStrokePath(200, 11);
    expect(d.startsWith("M")).toBe(true);
    expect(d).toMatch(ALLOWED);
    const n = numbers(d);
    for (let i = 0; i < n.length; i += 2) {
      expect(n[i]).toBeGreaterThanOrEqual(0);
      expect(n[i]).toBeLessThanOrEqual(200);
    }
  });
});
