import { describe, expect, it } from "vitest";
import { LOGICAL_PER_METER, STANDS_BEHIND_OUTER_M, farRailRadius, nearRailRadius } from "./artScale";
import { GATE_X } from "./gateViews";
import { SCENERY, sceneryBoxes, sceneryFaces } from "./scenery";
import { mainStandLine } from "./trackArt";
import { CHUTE, STRAIGHT, bendCenterX, clothoidShiftPx } from "./track";
import type { Camera } from "./track";

type Rect = { minX: number; maxX: number; minY: number; maxY: number };

/** Open rectangle. Touching an edge is not an overlap. */
function intersects(a: Rect, b: Rect) {
  return a.maxX > b.minX && a.minX < b.maxX && a.maxY > b.minY && a.minY < b.maxY;
}

function boxFootprint(box: { center: { x: number; y: number }; along: { x: number; y: number }; outward: { x: number; y: number }; width: number; depth: number }): Rect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const along of [-1, 1]) {
    for (const outward of [-1, 1]) {
      xs.push(box.center.x + box.along.x * along * box.width / 2 + box.outward.x * outward * box.depth / 2);
      ys.push(box.center.y + box.along.y * along * box.width / 2 + box.outward.y * outward * box.depth / 2);
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const HALF = STRAIGHT / 2;

/** Ground distance outside the outermost rail; negative inside it. */
function outsideOuterRail(x: number, y: number) {
  const outer = nearRailRadius();
  const shift = clothoidShiftPx();
  const center = bendCenterX();
  if (x > HALF) return Math.hypot(x - center, y) + shift - outer;
  if (x < -HALF) return Math.hypot(x + center, y) + shift - outer;
  return Math.abs(y) - outer;
}

function cameraAt(groundX: number, groundY: number, yaw: number): Camera {
  return { groundX, groundY, height: 1200, pitch: 0.45, yaw, focalLength: 825 };
}

describe("main stand", () => {
  it("is one straight strip 15-25 m behind the home straight, spanning it and stopping short of the gate", () => {
    expect(STANDS_BEHIND_OUTER_M).toBeGreaterThanOrEqual(15);
    expect(STANDS_BEHIND_OUTER_M).toBeLessThanOrEqual(25);
    const line = mainStandLine();
    expect(line.length).toBeGreaterThan(2);
    const xs = line.map((point) => point.x);
    expect(Math.max(...xs)).toBeGreaterThan(HALF);
    expect(Math.min(...xs)).toBeLessThan(-HALF);
    expect(Math.min(...xs)).toBeGreaterThan(-HALF - CHUTE);
    for (const point of line) {
      expect(point.y - nearRailRadius()).toBeCloseTo(STANDS_BEHIND_OUTER_M * LOGICAL_PER_METER);
      expect(outsideOuterRail(point.x, point.y) / LOGICAL_PER_METER).toBeGreaterThanOrEqual(STANDS_BEHIND_OUTER_M - 1e-6);
    }
  });
});

describe("small stands and buildings", () => {
  it("stand outside the outer rail, clear of the main stand and the gate chute", () => {
    const standY = nearRailRadius() + STANDS_BEHIND_OUTER_M * LOGICAL_PER_METER;
    const gateX = -HALF - CHUTE;
    for (const box of sceneryBoxes()) {
      for (const a of [-1, 1]) {
        for (const d of [-1, 1]) {
          const x = box.center.x + (box.along.x * a * box.width) / 2 + (box.outward.x * d * box.depth) / 2;
          const y = box.center.y + (box.along.y * a * box.width) / 2 + (box.outward.y * d * box.depth) / 2;
          expect(outsideOuterRail(x, y) / LOGICAL_PER_METER).toBeGreaterThan(8);
          const stand = mainStandLine().map((point) => point.x);
          const onMainStand =
            x <= Math.max(...stand) && x >= Math.min(...stand) && Math.abs(y - standY) < 8 * LOGICAL_PER_METER;
          expect(onMainStand).toBe(false);
          const onChute = x >= gateX - 4 * LOGICAL_PER_METER && x <= -HALF && y > 0 && outsideOuterRail(x, y) < 6 * LOGICAL_PER_METER;
          expect(onChute).toBe(false);
        }
      }
    }
  });

  it("keeps every stand and building off the gate and the chute", () => {
    const gate: Rect = {
      minX: GATE_X - 4 * LOGICAL_PER_METER,
      maxX: GATE_X,
      minY: farRailRadius(),
      maxY: nearRailRadius(),
    };
    const chute: Rect = {
      minX: GATE_X,
      maxX: -HALF,
      minY: farRailRadius(),
      maxY: nearRailRadius(),
    };
    const stand = mainStandLine();
    const standBox: Rect = {
      minX: Math.min(...stand.map((point) => point.x)),
      maxX: Math.max(...stand.map((point) => point.x)),
      minY: Math.min(...stand.map((point) => point.y)),
      maxY: Math.max(...stand.map((point) => point.y)),
    };
    const objects = [...sceneryBoxes().map(boxFootprint), standBox];
    for (const footprint of objects) {
      expect(intersects(footprint, gate)).toBe(false);
      expect(intersects(footprint, chute)).toBe(false);
    }
    expect(SCENERY.some((item) => "bend" in item.at && item.at.bend === "west" && item.at.angleDeg === 174)).toBe(true);
  });

  it("a drone camera above the back straight sees them, and a camera behind a building drops it", () => {
    const drone = cameraAt(0, -2400, 0);
    expect(sceneryFaces(drone).length).toBeGreaterThan(SCENERY.length);

    const backBuilding = SCENERY.findIndex((item) => "side" in item.at && item.at.side === "back");
    const boxes = sceneryBoxes([SCENERY[backBuilding]!]);
    const behind = cameraAt(0, boxes[0]!.center.y - 30 * LOGICAL_PER_METER, 0);
    expect(sceneryFaces(behind, boxes)).toEqual([]);
  });
});
