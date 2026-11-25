import { describe, expect, it } from "vitest";
import { fieldHorses } from "@/lib/field";
import { mockHorses } from "@/lib/mockHorses";
import { simulateRace } from "@/lib/race";
import snapshot from "./finishRanking.snapshot.json";

/**
 * Locks the simulated finish order. Presentation code must not move ranks or finish times.
 * Values are the current simulator (seeds 1–20), rounded to 1e-6s.
 */
describe("simulated ranking snapshot", () => {
  it("keeps finishTime and rank for seeds 1 through 20", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const race = simulateRace(fieldHorses(mockHorses, seed), seed);
      const frozen = snapshot[String(seed) as keyof typeof snapshot];
      expect(race.ranking.map((horse) => horse.id)).toEqual(frozen.map((horse) => horse.id));
      race.ranking.forEach((horse, index) => {
        expect(horse.rank).toBe(frozen[index]?.rank);
        expect(horse.finishTime).toBeCloseTo(frozen[index]?.finishTime ?? NaN, 6);
      });
    }
  });
});
