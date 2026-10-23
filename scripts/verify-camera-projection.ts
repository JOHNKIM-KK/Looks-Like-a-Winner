import { createDefaultCamera, poseOnRadius, poseAt, laneRadius } from "../game/track";

console.log("=== 카메라 투영 검증 (강화) ===\n");

const camera = createDefaultCamera();
console.log("기본 카메라 설정:");
console.log(`  지면 위치: (${camera.groundX.toFixed(1)}, ${camera.groundY.toFixed(1)})`);
console.log(`  높이: ${camera.height.toFixed(1)}`);
console.log(`  피치(기울기): ${(camera.pitch * 180 / Math.PI).toFixed(1)}°`);
console.log(`  초점거리: ${camera.focalLength.toFixed(1)}\n`);

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

// 테스트 6: 기존 캔버스 범위 내 주요 점
console.log("테스트 6: 주요 점이 기존 캔버스 안에 있음");
let boundsOk = true;
const testPoints = [
  { progress: 0, lane: 4, label: "출발(레인4)" },
  { progress: 0.5, lane: 4, label: "코너(레인4)" },
  { progress: 1.0, lane: 4, label: "골(레인4)" },
];

for (const point of testPoints) {
  const pose = poseAt(point.progress, point.lane);
  if (pose.x < bounds.x || pose.x > bounds.x + bounds.width ||
      pose.y < bounds.y || pose.y > bounds.y + bounds.height) {
    console.log(`  ✗ 범위 밖: ${point.label}, x=${pose.x.toFixed(1)}, y=${pose.y.toFixed(1)}`);
    boundsOk = false;
  }
}

if (boundsOk) {
  console.log("  ✓ 주요 점들이 캔버스 범위 내에 있습니다.\n");
} else {
  console.log("  ✗ 범위 테스트 실패\n");
  allTests = false;
}

console.log("=== 검증 요약 ===");
if (allTests && fullRangeOk && visibleOk && depthMonotonicOk && scaleFloorOk && tangentNormOk && boundsOk) {
  console.log("✅ 모든 카메라 투영 테스트를 통과했습니다.");
  process.exit(0);
} else {
  console.log("❌ 일부 테스트가 실패했습니다.");
  process.exit(1);
}
