import { simulateRace } from "../lib/race";
import { mockHorses } from "../lib/mockHorses";
import { segmentEnds, referenceDistance } from "../game/track";

const SEEDS = 1000;
const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);

console.log(`측정 중: ${SEEDS}개 시드로 구간 비율 분석...`);

const ends = segmentEnds();
const total = referenceDistance();

console.log(`\n=== 트랙 구간 정의 ===`);
console.log(`기준거리: ${total.toFixed(2)}`);
console.log(`슈트 끝: ${(ends.chuteEnd * 100).toFixed(2)}%`);
console.log(`1·2코너 입구: ${(ends.corner12Entry * 100).toFixed(2)}%`);
console.log(`1·2코너 출구: ${(ends.corner12Exit * 100).toFixed(2)}%`);
console.log(`맞은편 끝: ${(ends.backEnd * 100).toFixed(2)}%`);
console.log(`3·4코너 출구: ${(ends.corner34Exit * 100).toFixed(2)}%`);
console.log(`\n구간 길이:`);
console.log(`  초반: ${(ends.corner12Exit * 100).toFixed(2)}%`);
console.log(`  중반: ${((ends.corner34Exit - ends.corner12Exit) * 100).toFixed(2)}%`);
console.log(`  막판: ${((1 - ends.corner34Exit) * 100).toFixed(2)}%`);

const allFinishTimes: number[] = [];
const segmentTimes: { early: number[]; mid: number[]; late: number[] } = {
  early: [],
  mid: [],
  late: [],
};

for (const seed of seeds) {
  const result = simulateRace(mockHorses, seed);
  
  for (const horse of result.horses) {
    allFinishTimes.push(horse.finishTime);
    
    let earlyTime = 0;
    let midTime = 0;
    let lateTime = 0;

    for (let i = 0; i < horse.samples.length; i++) {
      const progress = horse.samples[i] ?? 0;
      if (progress < ends.corner12Exit) {
        earlyTime += 0.1;
      } else if (progress < ends.corner34Exit) {
        midTime += 0.1;
      } else if (progress < 1.0) {
        lateTime += 0.1;
      }
    }

    segmentTimes.early.push(earlyTime);
    segmentTimes.mid.push(midTime);
    segmentTimes.late.push(lateTime);
  }
}

allFinishTimes.sort((a, b) => a - b);
const mean = allFinishTimes.reduce((a, b) => a + b, 0) / allFinishTimes.length;
const p5Index = Math.floor(allFinishTimes.length * 0.05);
const p95Index = Math.floor(allFinishTimes.length * 0.95);
const p5 = allFinishTimes[p5Index] ?? 0;
const p95 = allFinishTimes[p95Index] ?? 0;

console.log(`\n=== 레이스 시간 분포 ===`);
console.log(`평균: ${mean.toFixed(3)}초`);
console.log(`p5: ${p5.toFixed(3)}초`);
console.log(`p95: ${p95.toFixed(3)}초`);

const avgEarly = segmentTimes.early.reduce((a, b) => a + b, 0) / segmentTimes.early.length;
const avgMid = segmentTimes.mid.reduce((a, b) => a + b, 0) / segmentTimes.mid.length;
const avgLate = segmentTimes.late.reduce((a, b) => a + b, 0) / segmentTimes.late.length;

console.log(`\n=== 구간별 평균 통과 시간 ===`);
console.log(`초반: ${avgEarly.toFixed(2)}초 (${((avgEarly / mean) * 100).toFixed(1)}%)`);
console.log(`중반: ${avgMid.toFixed(2)}초 (${((avgMid / mean) * 100).toFixed(1)}%)`);
console.log(`막판: ${avgLate.toFixed(2)}초 (${((avgLate / mean) * 100).toFixed(1)}%)`);

const winCounts = new Map<string, number>();
for (const seed of seeds) {
  const result = simulateRace(mockHorses, seed);
  const winner = result.ranking[0];
  if (winner) {
    winCounts.set(winner.id, (winCounts.get(winner.id) ?? 0) + 1);
  }
}

// 승률 보고 제외 (사용자 요청)
