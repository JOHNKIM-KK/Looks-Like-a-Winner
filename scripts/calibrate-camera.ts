// 카메라 파라미터 캘리브레이션
import { laneRadius, referenceDistance, INNER_RADIUS, LANE_GAP } from "../game/track";

const STRAIGHT = 1712;
const STRAIGHT_BACK = 1418;
const CHUTE = 158;
const GOAL_ALONG = 0.920;
const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;

type Logical = { x: number; y: number; tx: number; ty: number };

function logicalAtDistance(distance: number, radius: number): Logical {
  const halfBack = STRAIGHT_BACK / 2;
  const halfHome = STRAIGHT / 2;
  const corner = Math.PI * radius;
  let cursor = Math.max(0, distance);
  
  if (cursor <= CHUTE) {
    return { x: halfBack + CHUTE - cursor, y: -radius, tx: -1, ty: 0 };
  }
  cursor -= CHUTE;
  
  if (cursor <= STRAIGHT_BACK) {
    return { x: halfBack - cursor, y: -radius, tx: -1, ty: 0 };
  }
  cursor -= STRAIGHT_BACK;
  
  if (cursor <= corner) {
    const theta = -Math.PI / 2 + cursor / radius;
    return {
      x: -halfHome + Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      tx: -Math.sin(theta),
      ty: Math.cos(theta),
    };
  }
  cursor -= corner;
  
  if (cursor <= GOAL_ALONG * STRAIGHT) {
    return { x: -halfHome + cursor, y: radius, tx: 1, ty: 0 };
  }
  
  const theta = Math.PI / 2 + (cursor - GOAL_ALONG * STRAIGHT) / radius;
  return {
    x: halfHome + Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    tx: -Math.sin(theta),
    ty: Math.cos(theta),
  };
}

console.log("=== 트랙 범위 분석 ===\n");

// 모든 레인의 y 범위 찾기
let minY = Infinity;
let maxY = -Infinity;

for (let lane = 1; lane <= 8; lane++) {
  const radius = laneRadius(lane);
  for (let i = 0; i <= 100; i++) {
    const progress = i / 100;
    const logical = logicalAtDistance(progress * referenceDistance(), radius);
    minY = Math.min(minY, logical.y);
    maxY = Math.max(maxY, logical.y);
  }
}

console.log(`트랙 Y 범위: ${minY.toFixed(1)} ~ ${maxY.toFixed(1)}`);
console.log(`범위 크기: ${(maxY - minY).toFixed(1)}`);

// 가장 바깥 레인
const outerLaneRadius = laneRadius(8);
console.log(`\n가장 바깥 레인(8번) 반지름: ${outerLaneRadius.toFixed(1)}`);
console.log(`권장 카메라 groundY (바깥 + 여유): ${(outerLaneRadius + 250).toFixed(1)}`);

// 카메라가 바깥에 있을 때 모든 점이 앞에 오는지 확인
const testGroundY = outerLaneRadius + 250;
console.log(`\n테스트: groundY = ${testGroundY.toFixed(1)}`);

let allInFront = true;
for (let lane = 1; lane <= 8; lane++) {
  const radius = laneRadius(lane);
  for (let i = 0; i <= 100; i++) {
    const progress = i / 100;
    const logical = logicalAtDistance(progress * referenceDistance(), radius);
    const localY = logical.y - testGroundY;
    if (localY >= 0) {
      console.log(`  ✗ 점이 카메라 뒤에: lane ${lane}, progress ${progress.toFixed(2)}, y=${logical.y.toFixed(1)}`);
      allInFront = false;
    }
  }
}

if (allInFront) {
  console.log("  ✓ 모든 점이 카메라 앞에 있습니다.");
}

// 이전 렌더링의 스케일 분포 분석
console.log("\n=== 이전 렌더링 스케일 분포 ===");
const FAR_SCALE = 0.72;
for (const progress of [0, 0.25, 0.5, 0.75, 1.0]) {
  const logical = logicalAtDistance(progress * referenceDistance(), laneRadius(4));
  const depth = Math.min(1, Math.max(0, (logical.y + REFERENCE_RADIUS) / (2 * REFERENCE_RADIUS)));
  const scale = 1 - (1 - FAR_SCALE) * depth;
  console.log(`  progress ${progress.toFixed(2)}: y=${logical.y.toFixed(1)}, depth=${depth.toFixed(3)}, scale=${scale.toFixed(3)}`);
}
