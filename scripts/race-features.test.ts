import { describe, expect, test } from "vitest";
import { fieldHorses } from "../lib/field";
import { mockHorses } from "../lib/mockHorses";
import { RACE_FEATURES, simulateRace } from "../lib/race";

const SEEDS = [1, 7, 42, 1234, 99999, 123456789];

describe("race features off", () => {
  test("flags are off", () => {
    expect(RACE_FEATURES).toEqual({ horseStats: false, skills: false });
  });

  test.each(SEEDS)("seed %i runs with no skill cut-ins or hits", (seed) => {
    const race = simulateRace(fieldHorses(mockHorses, seed), seed);
    expect(race.events.filter((event) => event.cutin)).toEqual([]);
    expect(race.horses.every((horse) => !horse.skillHit)).toBe(true);
    expect(race.horses.every((horse) => horse.finishTime > 0 && horse.finishTime < 70)).toBe(true);
  });

  test.each(SEEDS)("seed %i ignores horse biases", (seed) => {
    const field = fieldHorses(mockHorses, seed);
    const shifted = field.map((horse) => ({
      ...horse,
      biases: { start: 5, accel: 5, stamina: 5, corner: 5, mental: 5, luck: 5 },
    }));
    const base = simulateRace(field, seed);
    const other = simulateRace(shifted, seed);
    expect(other.horses.map((horse) => horse.finishTime)).toEqual(base.horses.map((horse) => horse.finishTime));
    expect(other.ranking.map((horse) => horse.id)).toEqual(base.ranking.map((horse) => horse.id));
  });
});
