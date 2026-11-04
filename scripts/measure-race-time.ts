import { simulateRace } from "../lib/race";
import { mockHorses } from "../lib/mockHorses";

const SEEDS = 1000;
const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);

console.log(`측정 중: ${SEEDS}개 시드로 레이스 시뮬레이션...`);

const allFinishTimes: number[] = [];
const winCounts = new Map<string, number>();

for (const seed of seeds) {
  const result = simulateRace(mockHorses, seed);
  for (const horse of result.horses) {
    allFinishTimes.push(horse.finishTime);
  }
  const winner = result.ranking[0];
  if (winner) {
    winCounts.set(winner.id, (winCounts.get(winner.id) ?? 0) + 1);
  }
}

allFinishTimes.sort((a, b) => a - b);
const mean = allFinishTimes.reduce((a, b) => a + b, 0) / allFinishTimes.length;
const variance = allFinishTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / allFinishTimes.length;
const std = Math.sqrt(variance);
const p5Index = Math.floor(allFinishTimes.length * 0.05);
const p95Index = Math.floor(allFinishTimes.length * 0.95);
const p5 = allFinishTimes[p5Index] ?? allFinishTimes[0] ?? 0;
const p95 = allFinishTimes[p95Index] ?? allFinishTimes[allFinishTimes.length - 1] ?? 0;
const min = allFinishTimes[0] ?? 0;
const max = allFinishTimes[allFinishTimes.length - 1] ?? 0;

console.log(`\n=== 레이스 시간 분포 (${SEEDS}개 시드, ${allFinishTimes.length}개 완주) ===`);
console.log(`평균: ${mean.toFixed(3)}초`);
console.log(`표준편차: ${std.toFixed(3)}초`);
console.log(`p5: ${p5.toFixed(3)}초`);
console.log(`p95: ${p95.toFixed(3)}초`);
console.log(`최소: ${min.toFixed(3)}초`);
console.log(`최대: ${max.toFixed(3)}초`);

console.log(`\n=== 말별 승리 횟수 ===`);
mockHorses.forEach((horse) => {
  const wins = winCounts.get(horse.id) ?? 0;
  const rate = ((wins / SEEDS) * 100).toFixed(1);
  console.log(`${horse.name.padEnd(12)} (${horse.id.padEnd(8)}): ${wins.toString().padStart(4)}회 (${rate.padStart(5)}%)`);
});
