import { describe, expect, test } from "vitest";
import { CHUTE, INNER_RADIUS, LANE_GAP, laneRadius, referenceDistance, segmentEnds } from "../game/track";
import { mockHorses } from "../lib/mockHorses";
import { gateProgress, progressAt, simulateRace, type HorseStats } from "../lib/race";

const SEEDS = Array.from({ length: 20 }, (_, index) => index + 1);

const QUIET_STATS: HorseStats = { start: 40, accel: 40, stamina: 40, corner: 40, mental: 40, luck: 40 };
const LOUD_STATS: HorseStats = { start: 94, accel: 94, stamina: 94, corner: 94, mental: 94, luck: 94 };

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("race time", () => {
  test("mean finish time over 20 seeds stays near 40s", () => {
    const finishTimes: number[] = [];
    for (const seed of SEEDS) {
      const race = simulateRace(mockHorses, seed);
      for (const horse of race.horses) finishTimes.push(horse.finishTime);
    }

    const finishMean = mean(finishTimes);
    console.log(`20-seed mean finish ${finishMean.toFixed(3)}s over ${finishTimes.length} finishes`);
    expect(finishMean).toBeGreaterThanOrEqual(36);
    expect(finishMean).toBeLessThanOrEqual(44);
  });
});

describe("lane-independent progress", () => {
  test("shared reference progress is monotonic per horse, finishes at 1, and gateProgress is 0", () => {
    expect(gateProgress(QUIET_STATS)).toBe(0);
    expect(gateProgress(LOUD_STATS)).toBe(0);

    const distance = referenceDistance();
    const ends = segmentEnds();
    const referenceRadius = INNER_RADIUS + 3 * LANE_GAP;
    expect(laneRadius(4)).toBe(referenceRadius);
    expect(ends.pocketEnd * distance).toBeCloseTo(CHUTE, 5);
    expect((ends.cornerEnd - ends.backStraightEnd) * distance).toBeCloseTo(Math.PI * referenceRadius, 5);
    expect((ends.cornerEnd - ends.backStraightEnd) * distance).not.toBeCloseTo(Math.PI * laneRadius(1), 0);
    expect((ends.cornerEnd - ends.backStraightEnd) * distance).not.toBeCloseTo(Math.PI * laneRadius(8), 0);
    expect(ends.cornerEnd).toBeLessThan(1);

    for (const seed of SEEDS) {
      const race = simulateRace(mockHorses, seed);
      expect(race.horses).toHaveLength(8);
      for (const horse of race.horses) {
        expect(horse.samples[0], `seed ${seed} horse ${horse.number} starts at the gate`).toBe(0);
        expect(progressAt(horse.samples, horse.finishTime), `seed ${seed} horse ${horse.number} finishes at 1`).toBeCloseTo(1, 3);

        let previous = horse.samples[0] ?? 0;
        let drops = 0;
        for (let index = 1; index < horse.samples.length; index += 1) {
          const sample = horse.samples[index] ?? previous;
          if (sample + 1e-9 < previous) drops += 1;
          previous = sample;
        }
        // A position swap rewrites one horse backward a single time. Every other step stays non-decreasing.
        expect(drops, `seed ${seed} horse ${horse.number} progress drops`).toBeLessThanOrEqual(horse.swapUntil > 0 ? 1 : 0);
        expect(horse.samples.at(-1) ?? 0, `seed ${seed} horse ${horse.number} reaches the finish`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("section ratios", () => {
  test("pocket+back, corner, and home straight are 35/30/35 of track length within 1%", () => {
    const ends = segmentEnds();
    const tolerance = 0.01;
    const pocketBack = ends.backStraightEnd;
    const corner = ends.cornerEnd - ends.backStraightEnd;
    const home = 1 - ends.cornerEnd;

    console.log(
      `sections pocket+back=${(pocketBack * 100).toFixed(2)}% corner=${(corner * 100).toFixed(2)}% home=${(home * 100).toFixed(2)}%`,
    );
    expect(Math.abs(pocketBack - 0.35)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(corner - 0.3)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(home - 0.35)).toBeLessThanOrEqual(tolerance);
    expect(pocketBack + corner + home).toBeCloseTo(1, 6);
  });
});
