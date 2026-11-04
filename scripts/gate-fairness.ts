import { ENGINE_PX_PER_M, referenceDistance } from "../game/track";
import { fieldHorses } from "../lib/field";
import { LANE_ZONES, zoneAt, type LaneZone } from "../lib/lanes";
import { mockHorses } from "../lib/mockHorses";
import { simulateRace } from "../lib/race";

const SEEDS = Number(process.env.SEEDS ?? 10000);
const RACE_LENGTH_M = referenceDistance() / ENGINE_PX_PER_M;
const STRAIGHTS: LaneZone[] = ["firstStraight", "backStraight", "home"];
const CORNERS: LaneZone[] = ["corner12", "corner34"];

const wins = Array.from({ length: 12 }, () => 0);
const passes = Object.fromEntries(LANE_ZONES.map(({ zone }) => [zone, 0])) as Record<LaneZone, number>;
let winnerTime = 0;
let lastTime = 0;
const started = performance.now();

for (let seed = 1; seed <= SEEDS; seed += 1) {
  const race = simulateRace(fieldHorses(mockHorses, seed), seed);
  const horses = race.horses;
  wins[(race.ranking[0]?.number ?? 1) - 1] += 1;
  winnerTime += race.ranking[0]?.finishTime ?? 0;
  lastTime += Math.max(...horses.map((horse) => horse.finishTime));

  const count = Math.min(...horses.map((horse) => horse.samples.length));
  for (let index = 1; index < count; index += 1) {
    for (const passer of horses) {
      const now = passer.samples[index];
      if (now >= 1) continue;
      for (const passed of horses) {
        if (passed === passer || passed.samples[index] >= 1) continue;
        if (passer.samples[index - 1] < passed.samples[index - 1] && now > passed.samples[index]) {
          passes[zoneAt(now * RACE_LENGTH_M)] += 1;
        }
      }
    }
  }
}

const fmt = (value: number, digits = 2) => value.toFixed(digits);
const total = Object.values(passes).reduce((sum, value) => sum + value, 0);
const sum = (zones: LaneZone[]) => zones.reduce((acc, zone) => acc + passes[zone], 0);

console.log(`seeds ${SEEDS}, ${fmt((performance.now() - started) / 1000, 1)}s`);
console.log("| 칸 | " + wins.map((_, index) => `${index + 1}`).join(" | ") + " |");
console.log("| 1착률 | " + wins.map((count) => `${fmt((count / SEEDS) * 100)}%`).join(" | ") + " |");
console.log(`1착 평균 ${fmt(winnerTime / SEEDS)}s, 꼴찌 평균 ${fmt(lastTime / SEEDS)}s`);
console.log(
  LANE_ZONES.map(({ zone }) => `${zone} ${fmt(passes[zone] / SEEDS)} (${fmt((passes[zone] / total) * 100, 1)}%)`).join(", "),
);
console.log(`경주당 ${fmt(total / SEEDS)}회, 직선:코너 = ${fmt(sum(STRAIGHTS) / Math.max(1, sum(CORNERS)))} : 1`);
