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
console.log(`포켓 끝: ${(ends.pocketEnd * 100).toFixed(2)}%`);
console.log(`맞은편 직선 끝: ${(ends.backStraightEnd * 100).toFixed(2)}%`);
console.log(`코너 끝: ${(ends.cornerEnd * 100).toFixed(2)}%`);
console.log(`\n구간 길이:`);
console.log(`  포켓: ${((ends.pocketEnd) * 100).toFixed(2)}%`);
console.log(`  맞은편 직선: ${((ends.backStraightEnd - ends.pocketEnd) * 100).toFixed(2)}%`);
console.log(`  포켓+맞은편: ${((ends.backStraightEnd) * 100).toFixed(2)}%`);
console.log(`  코너: ${((ends.cornerEnd - ends.backStraightEnd) * 100).toFixed(2)}%`);
console.log(`  홈 직선: ${((1 - ends.cornerEnd) * 100).toFixed(2)}%`);

const allFinishTimes: number[] = [];
const segmentTimes: { pocket: number[]; back: number[]; corner: number[]; home: number[] } = {
  pocket: [],
  back: [],
  corner: [],
  home: [],
};

for (const seed of seeds) {
  const result = simulateRace(mockHorses, seed);
  
  for (const horse of result.horses) {
    allFinishTimes.push(horse.finishTime);
    
    let pocketTime = 0;
    let backTime = 0;
    let cornerTime = 0;
    let homeTime = 0;
    
    for (let i = 0; i < horse.samples.length; i++) {
      const progress = horse.samples[i];
      if (progress < ends.pocketEnd) {
        pocketTime += 0.1;
      } else if (progress < ends.backStraightEnd) {
        backTime += 0.1;
      } else if (progress < ends.cornerEnd) {
        cornerTime += 0.1;
      } else if (progress < 1.0) {
        homeTime += 0.1;
      }
    }
    
    segmentTimes.pocket.push(pocketTime);
    segmentTimes.back.push(backTime);
    segmentTimes.corner.push(cornerTime);
    segmentTimes.home.push(homeTime);
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

const avgPocket = segmentTimes.pocket.reduce((a, b) => a + b, 0) / segmentTimes.pocket.length;
const avgBack = segmentTimes.back.reduce((a, b) => a + b, 0) / segmentTimes.back.length;
const avgCorner = segmentTimes.corner.reduce((a, b) => a + b, 0) / segmentTimes.corner.length;
const avgHome = segmentTimes.home.reduce((a, b) => a + b, 0) / segmentTimes.home.length;

console.log(`\n=== 구간별 평균 통과 시간 ===`);
console.log(`포켓: ${avgPocket.toFixed(2)}초 (${((avgPocket / mean) * 100).toFixed(1)}%)`);
console.log(`맞은편 직선: ${avgBack.toFixed(2)}초 (${((avgBack / mean) * 100).toFixed(1)}%)`);
console.log(`포켓+맞은편: ${(avgPocket + avgBack).toFixed(2)}초 (${(((avgPocket + avgBack) / mean) * 100).toFixed(1)}%)`);
console.log(`코너: ${avgCorner.toFixed(2)}초 (${((avgCorner / mean) * 100).toFixed(1)}%)`);
console.log(`홈 직선: ${avgHome.toFixed(2)}초 (${((avgHome / mean) * 100).toFixed(1)}%)`);

const winCounts = new Map<string, number>();
for (const seed of seeds) {
  const result = simulateRace(mockHorses, seed);
  const winner = result.ranking[0];
  if (winner) {
    winCounts.set(winner.id, (winCounts.get(winner.id) ?? 0) + 1);
  }
}

console.log(`\n=== 말별 승리 횟수 ===`);
mockHorses.forEach((horse) => {
  const wins = winCounts.get(horse.id) ?? 0;
  const rate = ((wins / SEEDS) * 100).toFixed(1);
  console.log(`${horse.name.padEnd(12)} (${horse.id.padEnd(8)}): ${wins.toString().padStart(4)}회 (${rate.padStart(5)}%)`);
});
