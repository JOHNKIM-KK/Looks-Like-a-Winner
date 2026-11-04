import { describe, expect, test } from "vitest";
import { farRailRadius, nearRailRadius } from "./artScale";
import { chuteMergeX, railLines, railSegmentInFront } from "./trackArt";
import {
  CHUTE,
  CHUTE_M,
  ENGINE_PX_PER_M,
  FINISH_HOME_FRACTION,
  LANE_COUNT,
  RACE_METERS,
  STRAIGHT,
  finishGoalX,
  logicalAtDistance,
  presentationLogical,
  presentationOnRadius,
  referenceDistance,
  renderLane,
  segmentAt,
  segmentEnds,
  laneRadius,
} from "./track";

const HALF = STRAIGHT / 2;

describe("closed lap", () => {
  test("the chute, the 2/3 finish, and both bends are one continuous 357 m lap", () => {
    const meters = referenceDistance() / ENGINE_PX_PER_M;
    expect(meters).toBeCloseTo(55 + (8 / 3) * 80.3 + 28 * Math.PI, 3);
    expect(Math.round(meters)).toBe(RACE_METERS);
    expect(CHUTE / ENGINE_PX_PER_M).toBeCloseTo(CHUTE_M, 3);
    expect(finishGoalX()).toBeCloseTo(-HALF + FINISH_HOME_FRACTION * STRAIGHT, 5);

    const ends = segmentEnds();
    const sectionStartsM = [ends.chuteEnd, ends.corner12Entry, ends.corner12Exit, ends.backEnd, ends.corner34Exit].map(
      (end) => end * meters,
    );
    [55, 135.3, 179.28, 259.58, 303.56].forEach((expected, index) => expect(sectionStartsM[index]).toBeCloseTo(expected, 2));

    const marks = [0, ends.chuteEnd, ends.corner12Entry, ends.corner12Exit, ends.backEnd, ends.corner34Exit, 1, 1.1];
    for (let lane = 1; lane <= LANE_COUNT; lane += 1) {
      const radius = laneRadius(lane);
      for (const progress of marks) {
        const shown = presentationOnRadius(progress, radius);
        const simulated = logicalAtDistance(progress * referenceDistance(), radius);
        expect(shown.x, `lane ${lane} progress ${progress}`).toBeCloseTo(simulated.x, 4);
        expect(shown.y).toBeCloseTo(simulated.y, 4);
        expect(shown.tx).toBeCloseTo(simulated.tx, 4);
        expect(shown.ty).toBeCloseTo(simulated.ty, 4);
      }
      for (let index = 1; index < marks.length; index += 1) {
        const mark = marks[index] ?? 0;
        const before = presentationLogical(mark - 1e-4, lane);
        const at = presentationLogical(mark, lane);
        expect(Math.hypot(before.x - at.x, before.y - at.y), `lane ${lane} join ${mark}`).toBeLessThan(2);
      }
      expect(renderLane(lane, 0.4, lane * 17)).toBe(lane);
    }

    const gateNear = presentationLogical(0, 1);
    const gateFar = presentationLogical(0, LANE_COUNT);
    expect(gateNear.x).toBeCloseTo(-HALF - CHUTE, 3);
    expect(gateFar.x).toBeCloseTo(-HALF - CHUTE, 3);
    expect(gateNear.tx).toBeCloseTo(1, 5);
    expect(gateFar.tx).toBeCloseTo(1, 5);
    for (const gate of [gateNear, gateFar]) {
      expect(gate.y).toBeGreaterThan(farRailRadius());
      expect(gate.y).toBeLessThan(nearRailRadius());
    }
    expect(gateFar.y - gateNear.y).toBeGreaterThan((LANE_COUNT - 1) * (nearRailRadius() - farRailRadius()) / 16);

    expect(segmentAt(0)).toBe("straight");
    expect(segmentAt(ends.chuteEnd)).toBe("straight");
    expect(segmentAt(ends.corner12Entry - 1e-6)).toBe("straight");
    expect(segmentAt(ends.corner12Entry)).toBe("corner");
    expect(segmentAt(ends.corner12Exit - 1e-6)).toBe("corner");
    expect(segmentAt(ends.corner12Exit)).toBe("straight");
    expect(segmentAt(ends.backEnd - 1e-6)).toBe("straight");
    expect(segmentAt(ends.backEnd)).toBe("corner");
    expect(segmentAt(ends.corner34Exit - 1e-6)).toBe("corner");
    expect(segmentAt(ends.corner34Exit)).toBe("final");

    const back = presentationLogical((ends.corner12Exit + ends.backEnd) / 2, 6);
    expect(back.y).toBeLessThan(0);
    expect(back.tx).toBeCloseTo(-1, 5);
    const home = presentationLogical(1, 6);
    expect(home.y).toBeGreaterThan(0);
    expect(home.x).toBeCloseTo(finishGoalX(), 3);
    expect(home.tx).toBeCloseTo(1, 5);
  });
});

type Point = { x: number; y: number };

function crosses(a: Point, b: Point, c: Point, d: Point) {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function railSegments() {
  return railLines().flatMap((rail) => {
    const count = rail.closed ? rail.points.length : rail.points.length - 1;
    return Array.from({ length: count }, (_, index) => ({
      kind: rail.kind,
      from: rail.points[index]!,
      to: rail.points[(index + 1) % rail.points.length]!,
    }));
  });
}

describe("rails", () => {
  test("no lane crosses a rail from the gate, through the chute junction, to the finish", () => {
    const segments = railSegments();
    for (const lane of [1, 6, LANE_COUNT]) {
      let previous = presentationLogical(0, lane);
      for (let step = 1; step <= 600; step += 1) {
        const next = presentationLogical(step / 600, lane);
        const hit = segments.find((segment) => crosses(previous, next, segment.from, segment.to));
        expect(hit, `lane ${lane} at progress ${(step / 600).toFixed(3)}`).toBeUndefined();
        previous = next;
      }
    }
  });

  test("the chute opens onto the course where the west bend's outer rail meets the chute's inner rail", () => {
    const mergeX = chuteMergeX();
    expect(Math.hypot(mergeX + HALF, farRailRadius())).toBeCloseTo(nearRailRadius(), 6);
    for (const { from } of railSegments()) {
      const insideChute = from.x < -HALF && from.y > farRailRadius() + 1 && from.y < nearRailRadius() - 1;
      expect(insideChute, `rail point (${from.x.toFixed(0)}, ${from.y.toFixed(0)}) inside the chute`).toBe(false);
    }
  });

  test("a rail draws over the horses only when it stands between them and the camera", () => {
    const camera = (groundY: number) => ({ groundX: 0, groundY, height: 400, pitch: 0.2, yaw: 0, focalLength: 1000 });
    const homeOuter = { from: { x: -10, y: nearRailRadius() }, to: { x: 10, y: nearRailRadius() } };
    const homeInner = { from: { x: -10, y: farRailRadius() }, to: { x: 10, y: farRailRadius() } };
    const backOuter = { from: { x: 10, y: -nearRailRadius() }, to: { x: -10, y: -nearRailRadius() } };
    const chuteOuter = { from: { x: -HALF - 10, y: nearRailRadius() }, to: { x: -HALF - 30, y: nearRailRadius() } };
    const chuteInner = { from: { x: -HALF - 10, y: farRailRadius() }, to: { x: -HALF - 30, y: farRailRadius() } };
    const inFront = (kind: "inner" | "outer", rail: { from: Point; to: Point }, at: number) =>
      railSegmentInFront(kind, rail.from, rail.to, camera(at));

    const outsideHome = nearRailRadius() * 2;
    expect(inFront("outer", homeOuter, outsideHome)).toBe(true);
    expect(inFront("inner", homeInner, outsideHome)).toBe(false);
    expect(inFront("outer", backOuter, outsideHome)).toBe(false);
    expect(inFront("outer", chuteOuter, outsideHome)).toBe(true);

    expect(inFront("outer", homeOuter, 0)).toBe(false);
    expect(inFront("inner", homeInner, 0)).toBe(true);
    expect(inFront("outer", chuteOuter, 0)).toBe(false);
    expect(inFront("inner", chuteInner, 0)).toBe(true);

    const behindBack = -nearRailRadius() * 2;
    expect(inFront("outer", backOuter, behindBack)).toBe(true);
    expect(inFront("inner", homeInner, behindBack)).toBe(false);
    expect(inFront("inner", chuteInner, behindBack)).toBe(false);
  });
});
