import { describe, expect, test } from "vitest";
import { farRailRadius, nearRailRadius } from "./artScale";
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
  test("the chute, the 2/3 finish, and both bends are one continuous 222 m lap", () => {
    const meters = referenceDistance() / ENGINE_PX_PER_M;
    expect(meters).toBeCloseTo(RACE_METERS, 3);
    expect(CHUTE / ENGINE_PX_PER_M).toBeCloseTo(CHUTE_M, 3);
    expect(finishGoalX()).toBeCloseTo(-HALF + FINISH_HOME_FRACTION * STRAIGHT, 5);

    const ends = segmentEnds();
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
