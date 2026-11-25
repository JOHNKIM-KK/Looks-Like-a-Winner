import { pathToFileURL } from "node:url";
import { ENGINE_PX_PER_M, referenceDistance } from "../game/track";
import { entrantField, fieldHorses } from "../lib/field";
import { LANE_ZONES, zoneAt, type LaneZone } from "../lib/lanes";
import { mockHorses } from "../lib/mockHorses";
import { MAX_HORSES, simulateRace } from "../lib/race";

/** SPEC §8-4 field sizes. */
export const ENTRANT_COUNTS = [4, 6, 8, 12] as const;

export type EntrantFairness = {
  count: number;
  seeds: number;
  seconds: number;
  /** Starts and wins per gate stall 1–12. Rate is wins/starts, the stall's win rate when occupied. */
  gateStarts: number[];
  gateWins: number[];
  /** Wins by roster slot 1–N. */
  rosterWins: number[];
};

export function measureEntrantFairness(count: number, seeds: number): EntrantFairness {
  const gateStarts = Array.from({ length: MAX_HORSES }, () => 0);
  const gateWins = Array.from({ length: MAX_HORSES }, () => 0);
  const rosterWins = Array.from({ length: count }, () => 0);
  const names = Array.from({ length: count }, () => "");
  const started = performance.now();
  for (let seed = 1; seed <= seeds; seed += 1) {
    const field = entrantField(names, seed);
    for (const horse of field) gateStarts[(horse.stall ?? 1) - 1] += 1;
    const race = simulateRace(field, seed);
    const roster = race.horses.findIndex((horse) => horse.rank === 1);
    const winner = race.horses[roster];
    if (!winner || roster < 0) continue;
    gateWins[winner.number - 1] += 1;
    rosterWins[roster] += 1;
  }
  return {
    count,
    seeds,
    seconds: (performance.now() - started) / 1000,
    gateStarts,
    gateWins,
    rosterWins,
  };
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

export function formatEntrantFairness(measured: EntrantFairness) {
  const target = 1 / measured.count;
  const gateRates = measured.gateWins.map((wins, index) => wins / Math.max(1, measured.gateStarts[index] ?? 0));
  const rosterRates = measured.rosterWins.map((wins) => wins / measured.seeds);
  const mark = (rate: number) => (Math.abs(rate - target) > 0.02 ? `**${pct(rate)}**` : pct(rate));
  const head = Array.from({ length: MAX_HORSES }, (_, index) => `${index + 1}`).join(" | ");
  const lines = [
    `### N=${measured.count} (${measured.seconds.toFixed(1)}s, 목표 ${pct(target)} ±2%p)`,
    "",
    `| 칸 | ${head} |`,
    `|---|${Array.from({ length: MAX_HORSES }, () => "---").join("|")}|`,
    `| 출전 | ${measured.gateStarts.join(" | ")} |`,
    `| 1착 | ${measured.gateWins.join(" | ")} |`,
    `| 칸에 말이 있을 때 1착률 | ${gateRates.map(mark).join(" | ")} |`,
    "",
    `| 명단 | ${rosterRates.map((_, index) => `${index + 1}`).join(" | ")} |`,
    `|---|${rosterRates.map(() => "---").join("|")}|`,
    `| 1착률 | ${rosterRates.map(mark).join(" | ")} |`,
  ];
  return lines.join("\n");
}

function reportLegacyField(seeds: number) {
  const length = referenceDistance() / ENGINE_PX_PER_M;
  const straights: LaneZone[] = ["firstStraight", "backStraight", "home"];
  const corners: LaneZone[] = ["corner12", "corner34"];
  const wins = Array.from({ length: MAX_HORSES }, () => 0);
  const passes = Object.fromEntries(LANE_ZONES.map(({ zone }) => [zone, 0])) as Record<LaneZone, number>;
  let winnerTime = 0;
  let lastTime = 0;
  const started = performance.now();

  for (let seed = 1; seed <= seeds; seed += 1) {
    const race = simulateRace(fieldHorses(mockHorses, seed), seed);
    const horses = race.horses;
    wins[(race.ranking[0]?.number ?? 1) - 1] += 1;
    winnerTime += race.ranking[0]?.finishTime ?? 0;
    lastTime += Math.max(...horses.map((horse) => horse.finishTime));

    const count = Math.min(...horses.map((horse) => horse.samples.length));
    for (let index = 1; index < count; index += 1) {
      for (const passer of horses) {
        const now = passer.samples[index];
        if (now === undefined || now >= 1) continue;
        for (const passed of horses) {
          const passedNow = passed.samples[index];
          const passerPrev = passer.samples[index - 1];
          const passedPrev = passed.samples[index - 1];
          if (passed === passer || passedNow === undefined || passedNow >= 1) continue;
          if (passerPrev === undefined || passedPrev === undefined) continue;
          if (passerPrev < passedPrev && now > passedNow) passes[zoneAt(now * length)] += 1;
        }
      }
    }
  }

  const fmt = (value: number, digits = 2) => value.toFixed(digits);
  const total = Object.values(passes).reduce((sum, value) => sum + value, 0);
  const sum = (zones: LaneZone[]) => zones.reduce((acc, zone) => acc + passes[zone], 0);
  console.log(`seeds ${seeds}, ${fmt((performance.now() - started) / 1000, 1)}s`);
  console.log("| 칸 | " + wins.map((_, index) => `${index + 1}`).join(" | ") + " |");
  console.log("| 1착률 | " + wins.map((count) => `${fmt((count / seeds) * 100)}%`).join(" | ") + " |");
  console.log(`1착 평균 ${fmt(winnerTime / seeds)}s, 꼴찌 평균 ${fmt(lastTime / seeds)}s`);
  console.log(
    LANE_ZONES.map(({ zone }) => `${zone} ${fmt(passes[zone] / seeds)} (${fmt((passes[zone] / total) * 100, 1)}%)`).join(", "),
  );
  console.log(`경주당 ${fmt(total / seeds)}회, 직선:코너 = ${fmt(sum(straights) / Math.max(1, sum(corners)))} : 1`);
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invoked) {
  const seeds = Number(process.env.SEEDS ?? 10000);
  reportLegacyField(seeds);
  console.log("\n## 출전 N, 12칸 중 무작위 배정");
  for (const count of ENTRANT_COUNTS) {
    console.log("");
    console.log(formatEntrantFairness(measureEntrantFairness(count, seeds)));
  }
}
