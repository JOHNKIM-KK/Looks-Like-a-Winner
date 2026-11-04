import { createDefaultCamera, poseOnRadius, poseAt, laneRadius, referenceDistance, INNER_RADIUS, LANE_GAP } from "../game/track";

console.log("=== 카메라 투영 검증 ===\n");

const camera = createDefaultCamera();
console.log("최적화된 카메라 파라미터:");
console.log(`  groundY: ${camera.groundY}`);
console.log(`  height: ${camera.height}`);
console.log(`  pitch: ${(camera.pitch * 180 / Math.PI).toFixed(2)}°`);
console.log(`  focalLength: ${camera.focalLength}\n`);

const MINIMUM_SPRITE_SCALE = 0.45;
const VIEW_HEIGHT = 560;
const VIEW_WIDTH = 1720;
const bounds = { x: 0, y: 0, width: VIEW_WIDTH, height: VIEW_HEIGHT };

let allTests = true;

// 테스트 1: 전체 범위 검증 (진행도 0~1, 레인 1~8)
console.log("테스트 1: 전체 범위 검증 (진행도 0~1, 레인 1~8)");
let fullRangeOk = true;
let invisibleCount = 0;
let outOfBoundsCount = 0;
let infiniteCount = 0;

for (let lane = 1; lane <= 8; lane++) {
  for (let i = 0; i <= 100; i++) {
    const progress = i / 100;
    const pose = poseAt(progress, lane);
    
    if (!pose.visible) {
      invisibleCount++;
    }
    
    if (!isFinite(pose.x) || !isFinite(pose.y) || !isFinite(pose.scale)) {
      console.log(`  ✗ 무한 값: lane ${lane}, progress ${progress.toFixed(2)}, x=${pose.x}, y=${pose.y}, scale=${pose.scale}`);
      infiniteCount++;
      fullRangeOk = false;
    }
    
    if (isFinite(pose.x) && isFinite(pose.y)) {
      if (pose.x < bounds.x || pose.x > bounds.x + bounds.width ||
          pose.y < bounds.y || pose.y > bounds.y + bounds.height) {
        outOfBoundsCount++;
      }
    }
  }
}

if (fullRangeOk) {
  console.log(`  ✓ 모든 점(${8 * 101}개)이 유한한 좌표를 가집니다.`);
  console.log(`  - 보이지 않는 점: ${invisibleCount}개`);
  console.log(`  - 캔버스 바운드 밖: ${outOfBoundsCount}개 (허용됨)\n`);
} else {
  console.log(`  ✗ ${infiniteCount}개의 무한 값 발견\n`);
  allTests = false;
}

// 테스트 2: visible 플래그 검증
console.log("테스트 2: visible 플래그 검증");
let visibleOk = true;
for (let lane = 1; lane <= 8; lane++) {
  for (let i = 0; i <= 20; i++) {
    const progress = i / 20;
    const pose = poseAt(progress, lane);
    if (typeof pose.visible !== 'boolean') {
      console.log(`  ✗ visible이 boolean이 아님: lane ${lane}, progress ${progress.toFixed(2)}`);
      visibleOk = false;
      break;
    }
  }
  if (!visibleOk) break;
}

if (visibleOk) {
  console.log("  ✓ 모든 pose에 boolean visible 플래그가 있습니다.\n");
} else {
  console.log("  ✗ visible 플래그 테스트 실패\n");
  allTests = false;
}

// 테스트 3: 깊이 단조성 (같은 레인에서 멀어질수록 scale 감소)
console.log("테스트 3: 깊이 단조성 (카메라에서 멀수록 작은 scale)");
let depthMonotonicOk = true;
for (let lane = 1; lane <= 8; lane++) {
  let prevY = -Infinity;
  let prevScale = Infinity;
  
  for (let i = 0; i <= 50; i++) {
    const progress = i / 50;
    const pose = poseAt(progress, lane);
    if (!pose.visible) continue;
    
    if (pose.y < prevY) {
      const scaleDiff = pose.scale - prevScale;
      if (scaleDiff > 0.001) {
        console.log(`  ✗ y 감소 시 scale 증가: lane ${lane}, progress ${progress.toFixed(2)}, y=${pose.y.toFixed(1)}, scale=${pose.scale.toFixed(3)}`);
        depthMonotonicOk = false;
      }
    }
    
    prevY = pose.y;
    prevScale = pose.scale;
  }
}

if (depthMonotonicOk) {
  console.log("  ✓ 카메라에서 멀수록(y 작을수록) scale이 작거나 같습니다.\n");
} else {
  console.log("  ✗ 단조성 테스트 실패\n");
  allTests = false;
}

// 테스트 4: 최소 스케일 하한 (0.45)
console.log("테스트 4: 최소 스케일 하한 (0.45)");
let scaleFloorOk = true;
for (let lane = 1; lane <= 8; lane++) {
  for (let i = 0; i <= 100; i++) {
    const progress = i / 100;
    const pose = poseAt(progress, lane);
    if (pose.scale < MINIMUM_SPRITE_SCALE - 0.001) {
      console.log(`  ✗ 최소 스케일 위반: lane ${lane}, progress ${progress.toFixed(2)}, scale=${pose.scale.toFixed(3)}`);
      scaleFloorOk = false;
    }
  }
}

if (scaleFloorOk) {
  console.log(`  ✓ 모든 위치에서 scale ≥ ${MINIMUM_SPRITE_SCALE}입니다.\n`);
} else {
  console.log(`  ✗ 최소 스케일 테스트 실패\n`);
  allTests = false;
}

// 테스트 5: 접선 벡터 정규화
console.log("테스트 5: 접선 벡터 정규화");
let tangentNormOk = true;
for (let lane = 1; lane <= 8; lane++) {
  for (let i = 0; i <= 20; i++) {
    const progress = i / 20;
    const pose = poseAt(progress, lane);
    const length = Math.hypot(pose.tangentX, pose.tangentY);
    if (Math.abs(length - 1.0) > 0.01) {
      console.log(`  ✗ 접선 길이 비정규화: lane ${lane}, progress ${progress.toFixed(2)}, length=${length.toFixed(3)}`);
      tangentNormOk = false;
    }
  }
}

if (tangentNormOk) {
  console.log("  ✓ 모든 접선 벡터가 정규화되었습니다.\n");
} else {
  console.log("  ✗ 접선 벡터 테스트 실패\n");
  allTests = false;
}

// 테스트 6: 좌표가 합리적 범위 내
console.log("테스트 6: 좌표가 합리적 범위 내");
let boundsOk = true;
const reasonableMinX = -500;
const reasonableMaxX = 2000;
const reasonableMinY = 0;
const reasonableMaxY = 1200;

for (let lane = 1; lane <= 8; lane++) {
  for (let i = 0; i <= 20; i++) {
    const pose = poseAt(i / 20, lane);
    if (pose.x < reasonableMinX || pose.x > reasonableMaxX ||
        pose.y < reasonableMinY || pose.y > reasonableMaxY) {
      boundsOk = false;
      break;
    }
  }
  if (!boundsOk) break;
}

if (boundsOk) {
  console.log("  ✓ 모든 점이 합리적 범위(-500~2000, 0~1200) 내에 있습니다.\n");
} else {
  console.log("  ✗ 범위 테스트 실패\n");
  allTests = false;
}

// 이전 투영과 비교
console.log("\n=== 이전 투영과 비교 ===");

const STRAIGHT = 1712;
const STRAIGHT_BACK = 1418;
const CHUTE = 158;
const GOAL_ALONG = 0.920;
const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;
const FAR_SCALE = 0.72;
const CENTER_X = 860;
const CENTER_Y = 500;

type Logical = { x: number; y: number };

function logicalAtDistance(distance: number, radius: number): Logical {
  const halfBack = STRAIGHT_BACK / 2;
  const halfHome = STRAIGHT / 2;
  const corner = Math.PI * radius;
  let cursor = Math.max(0, distance);
  
  if (cursor <= CHUTE) return { x: halfBack + CHUTE - cursor, y: -radius };
  cursor -= CHUTE;
  if (cursor <= STRAIGHT_BACK) return { x: halfBack - cursor, y: -radius };
  cursor -= STRAIGHT_BACK;
  if (cursor <= corner) {
    const theta = -Math.PI / 2 + cursor / radius;
    return { x: -halfHome + Math.cos(theta) * radius, y: Math.sin(theta) * radius };
  }
  cursor -= corner;
  if (cursor <= GOAL_ALONG * STRAIGHT) return { x: -halfHome + cursor, y: radius };
  const theta = Math.PI / 2 + (cursor - GOAL_ALONG * STRAIGHT) / radius;
  return { x: halfHome + Math.cos(theta) * radius, y: Math.sin(theta) * radius };
}

function projectOld(logical: Logical): { x: number; y: number; scale: number } {
  const depth = Math.min(1, Math.max(0, (logical.y + REFERENCE_RADIUS) / (2 * REFERENCE_RADIUS)));
  const scale = Math.max(0.45, 1 - (1 - FAR_SCALE) * depth);
  const converge = 0.76 + 0.24 * (1 - depth);
  return { x: CENTER_X - logical.x * converge, y: CENTER_Y - logical.y * 0.72, scale };
}

const comparePoints = [
  { label: "출발(레인4)", progress: 0, lane: 4 },
  { label: "맞은편(레인4)", progress: 0.25, lane: 4 },
  { label: "코너(레인4)", progress: 0.5, lane: 4 },
  { label: "홈 직선(레인4)", progress: 0.75, lane: 4 },
  { label: "골(레인4)", progress: 1.0, lane: 4 },
];

console.log("위치".padEnd(18) + "이전 X".padEnd(10) + "새 X".padEnd(10) + "이전 Y".padEnd(10) + "새 Y".padEnd(10) + "이전 Scale".padEnd(12) + "새 Scale".padEnd(11) + "오차");
console.log("-".repeat(90));

let totalError = 0;
for (const point of comparePoints) {
  const logical = logicalAtDistance(point.progress * referenceDistance(), laneRadius(point.lane));
  const old = projectOld(logical);
  const pose = poseAt(point.progress, point.lane);
  const error = Math.sqrt((pose.x - old.x) ** 2 + (pose.y - old.y) ** 2);
  totalError += error;
  
  console.log(
    point.label.padEnd(18) +
    old.x.toFixed(1).padEnd(10) +
    pose.x.toFixed(1).padEnd(10) +
    old.y.toFixed(1).padEnd(10) +
    pose.y.toFixed(1).padEnd(10) +
    old.scale.toFixed(3).padEnd(12) +
    pose.scale.toFixed(3).padEnd(11) +
    error.toFixed(1) + "px"
  );
}

console.log(`\n평균 오차: ${(totalError / comparePoints.length).toFixed(1)}px`);

console.log("\n=== 검증 요약 ===");
if (allTests && fullRangeOk && visibleOk && depthMonotonicOk && scaleFloorOk && tangentNormOk && boundsOk) {
  console.log("✅ 모든 카메라 투영 테스트를 통과했습니다.");
  process.exit(0);
} else {
  console.log("❌ 일부 테스트가 실패했습니다.");
  process.exit(1);
}
