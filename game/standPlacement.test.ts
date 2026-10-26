import { describe, expect, it } from "vitest";
import { LOGICAL_PER_METER, farRailRadius, nearRailRadius } from "./artScale";
import { homeOuterStandLine, standsOutsideHomeRailM } from "./trackArt";
import { STRAIGHT } from "./track";

describe("home stands", () => {
  it("keeps the strip outside the home-straight outer rail", () => {
    const line = homeOuterStandLine();
    const outer = nearRailRadius();
    const first = line[0];
    expect(line.length).toBeGreaterThan(2);
    expect(first).toBeDefined();
    if (!first) return;
    expect(standsOutsideHomeRailM()).toBeGreaterThan(50);
    expect(first.y - outer).toBeCloseTo(standsOutsideHomeRailM() * LOGICAL_PER_METER);
    expect(first.y).toBeGreaterThan(farRailRadius());
    for (const point of line) {
      expect(point.y).toBeCloseTo(first.y);
      expect(point.y).toBeGreaterThan(outer);
      expect(Math.abs(point.x)).toBeLessThanOrEqual(STRAIGHT / 2 + 1e-6);
    }
  });
});
