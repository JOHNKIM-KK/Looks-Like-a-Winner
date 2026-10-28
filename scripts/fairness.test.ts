import { describe, expect, test } from "vitest";
import { fieldHorses } from "../lib/field";
import { mockHorses } from "../lib/mockHorses";
import { simulateRace } from "../lib/race";

/** Enough seeds that a fair 1/12 rate stays inside ±2 percentage points. */
const SEEDS = 4000;

describe("stall fairness", () => {
  test(
    "each of 12 stalls wins about 8.33% over many seeds",
    () => {
      const wins = Array.from({ length: 12 }, () => 0);
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const race = simulateRace(fieldHorses(mockHorses, seed), seed);
        const winner = race.horses.find((horse) => horse.rank === 1);
        const stall = (winner?.number ?? 0) - 1;
        if (stall >= 0 && stall < wins.length) wins[stall] = (wins[stall] ?? 0) + 1;
      }
      const rates = wins.map((count) => count / SEEDS);
      const lines = rates.map((rate, index) => {
        const pct = (rate * 100).toFixed(2);
        return `stall ${index + 1}: ${pct}% (${wins[index]}/${SEEDS})`;
      });
      console.log(lines.join("\n"));
      for (const [index, rate] of rates.entries()) {
        expect(rate, lines[index]).toBeGreaterThanOrEqual(0.0833 - 0.02);
        expect(rate, lines[index]).toBeLessThanOrEqual(0.0833 + 0.02);
      }
    },
    60_000,
  );
});
