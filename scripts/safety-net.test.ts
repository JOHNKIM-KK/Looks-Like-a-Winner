import { describe, expect, test } from "vitest";
import {
  CHUTE,
  CHUTE_M,
  ENGINE_PX_PER_M,
  FINISH_HOME_FRACTION,
  RACE_METERS,
  REFERENCE_RADIUS_M,
  STRAIGHT_M,
  laneRadius,
  referenceDistance,
  referenceRadius,
  segmentEnds,
} from "../game/track";
import { fieldHorses } from "../lib/field";
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
      const race = simulateRace(fieldHorses(mockHorses, seed), seed);
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
    const center = referenceRadius();
    expect(ends.chuteEnd * distance).toBeCloseTo(CHUTE, 5);
    expect((ends.corner12Exit - ends.corner12Entry) * distance).toBeCloseTo(Math.PI * center, 4);
    expect((ends.corner34Exit - ends.backEnd) * distance).toBeCloseTo(Math.PI * center, 4);
    expect((ends.corner12Exit - ends.corner12Entry) * distance).not.toBeCloseTo(Math.PI * laneRadius(1), 0);
    expect((ends.corner12Exit - ends.corner12Entry) * distance).not.toBeCloseTo(Math.PI * laneRadius(12), 0);
    expect(ends.corner34Exit).toBeLessThan(1);
    expect(distance / ENGINE_PX_PER_M).toBeCloseTo(RACE_METERS, 3);

    for (const seed of SEEDS) {
      const race = simulateRace(fieldHorses(mockHorses, seed), seed);
      expect(race.horses).toHaveLength(12);
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
  test("early, mid, and late follow the closed lap, and the lengths add to 222 m", () => {
    const ends = segmentEnds();
    const early = ends.corner12Exit;
    const mid = ends.corner34Exit - ends.corner12Exit;
    const late = 1 - ends.corner34Exit;
    const earlyM = (CHUTE_M + STRAIGHT_M + Math.PI * REFERENCE_RADIUS_M) / RACE_METERS;
    const midM = (STRAIGHT_M + Math.PI * REFERENCE_RADIUS_M) / RACE_METERS;
    const lateM = (FINISH_HOME_FRACTION * STRAIGHT_M) / RACE_METERS;

    console.log(
      `sections early=${(early * 100).toFixed(2)}% mid=${(mid * 100).toFixed(2)}% late=${(late * 100).toFixed(2)}% straight=${STRAIGHT_M.toFixed(2)}m`,
    );
    expect(early).toBeCloseTo(earlyM, 4);
    expect(mid).toBeCloseTo(midM, 4);
    expect(late).toBeCloseTo(lateM, 4);
    expect(early + mid + late).toBeCloseTo(1, 6);
  });
});
