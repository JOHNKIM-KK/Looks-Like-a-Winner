import { simulateRace } from "../lib/race";
import { mockHorses } from "../lib/mockHorses";

const SEEDS = 100;
const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);

console.log(`측정 중: ${SEEDS}개 시드로 레이스 시뮬레이션...`);

const results = seeds.map((seed) => {
  const result = simulateRace(mockHorses, seed);
  const finishTimes = result.ranking.map((h) => h.finishTime);
  return {
    seed,
    avgFinish: finishTimes.reduce((a, b) => a + b, 0) / finishTimes.length,
    minFinish: Math.min(...finishTimes),
    maxFinish: Math.max(...finishTimes),
  };
});

const avgFinishAll = results.reduce((sum, r) => sum + r.avgFinish, 0) / results.length;
const minFinishAll = Math.min(...results.map((r) => r.minFinish));
const maxFinishAll = Math.max(...results.map((r) => r.maxFinish));

console.log(`\n=== 결과 (${SEEDS}개 시드) ===`);
console.log(`평균 완주 시간: ${avgFinishAll.toFixed(3)}초`);
console.log(`최소 완주 시간: ${minFinishAll.toFixed(3)}초`);
console.log(`최대 완주 시간: ${maxFinishAll.toFixed(3)}초`);
console.log(`표준편차: ${Math.sqrt(results.reduce((sum, r) => sum + Math.pow(r.avgFinish - avgFinishAll, 2), 0) / results.length).toFixed(3)}초`);
