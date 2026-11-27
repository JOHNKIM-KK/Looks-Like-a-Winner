import { describe, expect, test } from "vitest";
import { fieldHorses } from "../lib/field";
import { mockHorses } from "../lib/mockHorses";
import { simulateRace } from "../lib/race";
import { ENTRANT_COUNTS, formatEntrantFairness, measureEntrantFairness } from "./gate-fairness";

/** SPEC §8-4: seeds 1..10000. */
const SEEDS = 10000;

describe("stall fairness", () => {
  test(
    "each of 12 stalls wins about 8.33% over many seeds",
    () => {
      const wins = Array.from({ length: 12 }, () => 0);
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const race = simulateRace(fieldHorses(mockHorses, seed), seed, { incidents: false });
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
    120_000,
  );

  test(
    "N=4, 6, 8, 12 stay within 2 points of 1/N for occupied stalls and roster order",
    () => {
      const measured = ENTRANT_COUNTS.map((count) => measureEntrantFairness(count, SEEDS));
      console.log(measured.map(formatEntrantFairness).join("\n\n"));
      for (const result of measured) {
        const target = 1 / result.count;
        for (let stall = 0; stall < result.gateWins.length; stall += 1) {
          const starts = result.gateStarts[stall] ?? 0;
          const rate = (result.gateWins[stall] ?? 0) / starts;
          expect(rate, `N=${result.count} stall ${stall + 1}`).toBeGreaterThanOrEqual(target - 0.02);
          expect(rate, `N=${result.count} stall ${stall + 1}`).toBeLessThanOrEqual(target + 0.02);
        }
        for (let roster = 0; roster < result.count; roster += 1) {
          const rate = (result.rosterWins[roster] ?? 0) / result.seeds;
          expect(rate, `N=${result.count} roster ${roster + 1}`).toBeGreaterThanOrEqual(target - 0.02);
          expect(rate, `N=${result.count} roster ${roster + 1}`).toBeLessThanOrEqual(target + 0.02);
        }
      }
    },
    600_000,
  );
});
