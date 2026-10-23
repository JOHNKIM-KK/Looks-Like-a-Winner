import { referenceDistance, segmentEnds } from "../game/track";

const TOLERANCE = 0.01; // ±1%

const ends = segmentEnds();
const total = referenceDistance();

const pocketBackRatio = ends.backStraightEnd;
const cornerRatio = ends.cornerEnd - ends.backStraightEnd;
const homeRatio = 1 - ends.cornerEnd;

console.log("=== 기하학적 구간 비율 검증 ===");
console.log(`포켓+맞은편: ${(pocketBackRatio * 100).toFixed(2)}% (목표: 35% ±1%)`);
console.log(`코너: ${(cornerRatio * 100).toFixed(2)}% (목표: 30% ±1%)`);
console.log(`홈 직선: ${(homeRatio * 100).toFixed(2)}% (목표: 35% ±1%)`);

const pocketBackOk = Math.abs(pocketBackRatio - 0.35) <= TOLERANCE;
const cornerOk = Math.abs(cornerRatio - 0.30) <= TOLERANCE;
const homeOk = Math.abs(homeRatio - 0.35) <= TOLERANCE;

console.log(`\n=== 검증 결과 ===`);
console.log(`포켓+맞은편: ${pocketBackOk ? '✓' : '✗'} (차이: ${((pocketBackRatio - 0.35) * 100).toFixed(2)}%)`);
console.log(`코너: ${cornerOk ? '✓' : '✗'} (차이: ${((cornerRatio - 0.30) * 100).toFixed(2)}%)`);
console.log(`홈 직선: ${homeOk ? '✓' : '✗'} (차이: ${((homeRatio - 0.35) * 100).toFixed(2)}%)`);

if (pocketBackOk && cornerOk && homeOk) {
  console.log(`\n✅ 모든 구간 비율이 허용 오차(±1%) 내에 있습니다.`);
  process.exit(0);
} else {
  console.log(`\n❌ 일부 구간 비율이 허용 오차를 벗어났습니다.`);
  process.exit(1);
}
