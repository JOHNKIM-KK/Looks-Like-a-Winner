// 목표 구간 비율: 포켓+맞은편 35%, 코너 30%, 홈 직선 35%
// 제약: GOAL_ALONG <= 0.92 (골이 홈 직선 내에 위치, 여유 공간 확보)

// 비대칭 타원 설계:
// - 맞은편: CHUTE + STRAIGHT_BACK
// - 홈 직선: STRAIGHT_HOME (STRAIGHT_BACK와 다를 수 있음)
// - 코너: π*R (한 개의 큰 코너, 반대편은 사용 안 함)

// 기준거리 = CHUTE + STRAIGHT_BACK + π*R + GOAL_ALONG*STRAIGHT_HOME

// 제약 조건:
// 1. (CHUTE + STRAIGHT_BACK) / total = 0.35
// 2. (π*R) / total = 0.30
// 3. (GOAL_ALONG * STRAIGHT_HOME) / total = 0.35
// 4. GOAL_ALONG <= 0.92

// 조건 3에서: STRAIGHT_HOME >= 0.35 * total / 0.92 = 0.38 * total

const LANE_GAP = 58;
const GOAL_ALONG_MAX = 0.92;

// total을 정규화 (INNER_RADIUS를 충분히 크게 만들기 위해)
const total = 4500;

// 구간 비율 할당
const pocketBack_ratio = 0.35; // 포켓+맞은편 35%
const corner_ratio = 0.30; // 코너 30%
const home_ratio = 0.35; // 홈 직선 (골까지) 35%

// 실제 길이
const pocketBack_length = pocketBack_ratio * total;
const corner_length = corner_ratio * total;
const home_length = home_ratio * total;

// R = corner / π
const R = corner_length / Math.PI;
const REFERENCE_RADIUS = R;
const INNER_RADIUS = REFERENCE_RADIUS - 3 * LANE_GAP;

// STRAIGHT_HOME을 GOAL_ALONG <= 0.92 제약에서 계산
// home_length = GOAL_ALONG * STRAIGHT_HOME
// STRAIGHT_HOME = home_length / GOAL_ALONG
const GOAL_ALONG = GOAL_ALONG_MAX;
const STRAIGHT_HOME = home_length / GOAL_ALONG;

// CHUTE + STRAIGHT_BACK = pocketBack_length
// CHUTE를 포켓 비율로 할당 (예: 포켓+맞은편의 10%)
const CHUTE_ratio = 0.10; // 포켓이 전체 맞은편 구간의 10%
const CHUTE = pocketBack_length * CHUTE_ratio;
const STRAIGHT_BACK = pocketBack_length - CHUTE;

console.log("=== 비대칭 타원 트랙 파라미터 ===");
console.log(`STRAIGHT_BACK = ${STRAIGHT_BACK.toFixed(2)} (맞은편 직선)`);
console.log(`STRAIGHT_HOME = ${STRAIGHT_HOME.toFixed(2)} (홈 직선)`);
console.log(`INNER_RADIUS = ${INNER_RADIUS.toFixed(2)}`);
console.log(`REFERENCE_RADIUS = ${REFERENCE_RADIUS.toFixed(2)}`);
console.log(`CHUTE = ${CHUTE.toFixed(2)}`);
console.log(`GOAL_ALONG = ${GOAL_ALONG.toFixed(6)}`);

console.log(`\n=== 검증 ===`);
const calculated_total = CHUTE + STRAIGHT_BACK + corner_length + GOAL_ALONG * STRAIGHT_HOME;
console.log(`기준거리 total = ${total.toFixed(2)}`);
console.log(`계산된 total = ${calculated_total.toFixed(2)}`);
console.log(`GOAL_ALONG * STRAIGHT_HOME = ${(GOAL_ALONG * STRAIGHT_HOME).toFixed(2)}`);
console.log(`홈 직선 전체 = ${STRAIGHT_HOME.toFixed(2)}`);
console.log(`골 이후 여유 = ${((1 - GOAL_ALONG) * STRAIGHT_HOME).toFixed(2)}`);

console.log(`\n=== 기하학적 구간 비율 ===`);
console.log(`포켓+맞은편: ${((CHUTE + STRAIGHT_BACK) / total * 100).toFixed(2)}%`);
console.log(`  - 포켓: ${(CHUTE / total * 100).toFixed(2)}%`);
console.log(`  - 맞은편 직선: ${(STRAIGHT_BACK / total * 100).toFixed(2)}%`);
console.log(`코너: ${(corner_length / total * 100).toFixed(2)}%`);
console.log(`홈 직선 (골까지): ${((GOAL_ALONG * STRAIGHT_HOME) / total * 100).toFixed(2)}%`);
console.log(`합계: ${(((CHUTE + STRAIGHT_BACK) + corner_length + (GOAL_ALONG * STRAIGHT_HOME)) / total * 100).toFixed(2)}%`);

console.log(`\n=== 트랙 폭 검증 ===`);
const track_width = 8 * LANE_GAP;
console.log(`8 레인 폭: ${track_width}`);
console.log(`INNER_RADIUS: ${INNER_RADIUS.toFixed(2)}`);
console.log(`REFERENCE_RADIUS: ${REFERENCE_RADIUS.toFixed(2)}`);
console.log(`외곽 RADIUS: ${(INNER_RADIUS + 8 * LANE_GAP).toFixed(2)}`);
console.log(`코너에서 내측/외측 비율: ${((INNER_RADIUS + 8 * LANE_GAP) / Math.max(1, INNER_RADIUS)).toFixed(2)}`);

if (INNER_RADIUS < 50) {
  console.log(`\n⚠️  경고: INNER_RADIUS가 너무 작습니다 (${INNER_RADIUS.toFixed(2)}). 코너가 급격할 수 있습니다.`);
}

if (INNER_RADIUS < 0) {
  console.log(`\n❌ INNER_RADIUS가 음수입니다. total을 늘려야 합니다.`);
  process.exit(1);
}

console.log(`\n=== 코드에 사용할 값 ===`);
console.log(`// 비대칭 타원: 홈 직선이 맞은편보다 김`);
console.log(`export const STRAIGHT = ${Math.round(STRAIGHT_HOME)}; // 홈 직선 기준`);
console.log(`const STRAIGHT_BACK = ${Math.round(STRAIGHT_BACK)}; // 맞은편 직선`);
console.log(`export const INNER_RADIUS = ${Math.round(INNER_RADIUS)};`);
console.log(`export const CHUTE = ${Math.round(CHUTE)};`);
console.log(`const GOAL_ALONG = ${GOAL_ALONG.toFixed(3)};`);
