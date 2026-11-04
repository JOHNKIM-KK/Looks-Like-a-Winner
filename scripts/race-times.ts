import { RACE_METERS } from "../game/track";
import { fieldHorses } from "../lib/field";
import { mockHorses } from "../lib/mockHorses";
import { simulateRace } from "../lib/race";

const seeds = Number(process.argv[2] ?? 20);
const rows: string[] = [];
const winners: number[] = [];
const means: number[] = [];

for (let seed = 1; seed <= seeds; seed += 1) {
  const times = simulateRace(fieldHorses(mockHorses, seed), seed).horses.map((horse) => horse.finishTime);
  const winner = Math.min(...times);
  const last = Math.max(...times);
  const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
  winners.push(winner);
  means.push(mean);
  rows.push(`| ${seed} | ${winner.toFixed(2)} | ${mean.toFixed(2)} | ${last.toFixed(2)} |`);
}

const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
console.log(`${RACE_METERS} m, ${seeds} seeds (seed 1..${seeds}, mockHorses)\n`);
console.log("| seed | 1착 (s) | 12마리 평균 (s) | 꼴찌 (s) |\n|---|---|---|---|");
console.log(rows.join("\n"));
console.log(`| 평균 | ${avg(winners).toFixed(2)} | ${avg(means).toFixed(2)} | |`);
