import { describe, expect, it } from "vitest";
import { LOGICAL_PER_METER, STANDS_BEHIND_OUTER_M, TREES_BEHIND_RAIL_M, nearRailRadius } from "./artScale";
import { standLineOppositeCamera, straightTreeLines, stripFacesCamera } from "./trackArt";
import { STRAIGHT } from "./track";
import type { Camera } from "./track";

/** True when a point is outside the outermost rail, including the bends. */
function outsideOuterRail(x: number, y: number) {
  const outer = nearRailRadius();
  const half = STRAIGHT / 2;
  if (x > half) return Math.hypot(x - half, y) > outer + 1;
  if (x < -half) return Math.hypot(x + half, y) > outer + 1;
  return Math.abs(y) > outer + 1;
}

function cameraAt(groundY: number, yaw: number): Camera {
  return { groundX: 0, groundY, height: 200, pitch: 0.4, yaw, focalLength: 1200 };
}

describe("stands opposite the camera", () => {
  it("sits 15–25 m outside the far outermost rail and stays off the infield", () => {
    expect(STANDS_BEHIND_OUTER_M).toBeGreaterThanOrEqual(15);
    expect(STANDS_BEHIND_OUTER_M).toBeLessThanOrEqual(25);
    const outer = nearRailRadius();
    const gap = STANDS_BEHIND_OUTER_M * LOGICAL_PER_METER;

    const homeSide = standLineOppositeCamera(cameraAt(2000, Math.PI));
    const homeStraight = homeSide.filter((point) => Math.abs(point.x) <= STRAIGHT / 2);
    expect(homeStraight.length).toBeGreaterThan(2);
    for (const point of homeStraight) {
      expect(point.y).toBeLessThan(-outer);
      expect(-outer - point.y).toBeCloseTo(gap);
    }
    for (const point of homeSide) {
      expect(outsideOuterRail(point.x, point.y)).toBe(true);
    }

    const backSide = standLineOppositeCamera(cameraAt(-2000, 0));
    const backStraight = backSide.filter((point) => Math.abs(point.x) <= STRAIGHT / 2);
    expect(backStraight.length).toBeGreaterThan(2);
    for (const point of backStraight) {
      expect(point.y).toBeGreaterThan(outer);
      expect(point.y - outer).toBeCloseTo(gap);
    }
    for (const point of backSide) {
      expect(outsideOuterRail(point.x, point.y)).toBe(true);
    }
  });
});

describe("straight trees", () => {
  it("follows the straights 5 m outside the outer rail and hides the back face", () => {
    const lines = straightTreeLines();
    expect(lines).toHaveLength(2);
    const outer = nearRailRadius();
    const gap = TREES_BEHIND_RAIL_M * LOGICAL_PER_METER;
    for (const line of lines) {
      for (const point of line.points) {
        expect(Math.abs(Math.abs(point.y) - (outer + gap))).toBeLessThan(1e-6);
      }
    }
    const outsideHome = cameraAt(4000, Math.PI);
    const outsideBack = cameraAt(-4000, 0);
    const home = lines[0];
    const back = lines[1];
    expect(home && stripFacesCamera(home, outsideHome)).toBe(true);
    expect(back && stripFacesCamera(back, outsideHome)).toBe(false);
    expect(back && stripFacesCamera(back, outsideBack)).toBe(true);
    expect(home && stripFacesCamera(home, outsideBack)).toBe(false);
  });
});
