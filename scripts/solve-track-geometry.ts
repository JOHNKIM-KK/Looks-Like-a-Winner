// 목표 구간 비율: 포켓+맞은편 35%, 코너 30%, 홈 직선 35%
// 기준거리 = CHUTE + STRAIGHT + π*R + GOAL_ALONG*STRAIGHT

const LANE_GAP = 58;

// total을 정규화하여 더 큰 값으로 설정 (INNER_RADIUS > 0, GOAL_ALONG < 1 보장)
const total = 3000;

// 구간 비율 할당
const CHUTE_ratio = 0.05; // 포켓 5%
const STRAIGHT_ratio = 0.30; // 맞은편 직선 30% (포켓+맞은편 = 35%)
const corner_ratio = 0.30; // 코너 30%
const home_ratio = 0.35; // 홈 직선 35%

// 실제 길이 계산
const CHUTE = CHUTE_ratio * total;
const STRAIGHT = STRAIGHT_ratio * total;
const corner = corner_ratio * total;
const home = home_ratio * total;

// R = corner / π
const R = corner / Math.PI;

// GOAL_ALONG * STRAIGHT = home
const GOAL_ALONG = home / STRAIGHT;

// REFERENCE_RADIUS = R
const REFERENCE_RADIUS = R;
const INNER_RADIUS = REFERENCE_RADIUS - 3 * LANE_GAP;

console.log("=== 해석적 트랙 파라미터 ===");
console.log(`STRAIGHT = ${STRAIGHT.toFixed(2)}`);
console.log(`INNER_RADIUS = ${INNER_RADIUS.toFixed(2)}`);
console.log(`REFERENCE_RADIUS = ${REFERENCE_RADIUS.toFixed(2)}`);
console.log(`CHUTE = ${CHUTE.toFixed(2)}`);
console.log(`GOAL_ALONG = ${GOAL_ALONG.toFixed(6)}`);

console.log(`\n=== 검증 ===`);
console.log(`기준거리 total = ${total.toFixed(2)}`);
console.log(`계산된 total = ${(CHUTE + STRAIGHT + corner + GOAL_ALONG * STRAIGHT).toFixed(2)}`);
console.log(`검증 (GOAL_ALONG * STRAIGHT): ${(GOAL_ALONG * STRAIGHT).toFixed(2)} vs ${home.toFixed(2)}`);

console.log(`\n=== 기하학적 구간 비율 ===`);
console.log(`포켓: ${(CHUTE / total * 100).toFixed(2)}%`);
console.log(`맞은편 직선: ${(STRAIGHT / total * 100).toFixed(2)}%`);
console.log(`포켓+맞은편: ${((CHUTE + STRAIGHT) / total * 100).toFixed(2)}%`);
console.log(`코너: ${(corner / total * 100).toFixed(2)}%`);
console.log(`홈 직선: ${((GOAL_ALONG * STRAIGHT) / total * 100).toFixed(2)}%`);
console.log(`합계: ${(((CHUTE + STRAIGHT) + corner + (GOAL_ALONG * STRAIGHT)) / total * 100).toFixed(2)}%`);

console.log(`\n=== 코드에 사용할 값 ===`);
console.log(`export const STRAIGHT = ${Math.round(STRAIGHT)};`);
console.log(`export const INNER_RADIUS = ${Math.round(INNER_RADIUS)};`);
console.log(`export const CHUTE = ${Math.round(CHUTE)};`);
console.log(`const GOAL_ALONG = ${Math.round(GOAL_ALONG * 1000) / 1000};`);

console.log(`\n=== 화면 비율 체크 ===`);
console.log(`STRAIGHT / INNER_RADIUS 비율: ${(STRAIGHT / Math.abs(INNER_RADIUS)).toFixed(2)}`);
console.log(`corner 아크 길이: ${corner.toFixed(2)}`);
console.log(`REFERENCE_RADIUS: ${REFERENCE_RADIUS.toFixed(2)}`);

if (INNER_RADIUS < 0) {
  console.log(`\n⚠️  INNER_RADIUS가 음수입니다. total을 늘리거나 corner 비율을 높여야 합니다.`);
}
