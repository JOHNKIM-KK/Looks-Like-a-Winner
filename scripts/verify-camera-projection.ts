import { createDefaultCamera, poseOnRadius, laneRadius } from "../game/track";

console.log("=== 카메라 투영 검증 ===\n");

const camera = createDefaultCamera();
console.log("기본 카메라 설정:");
console.log(`  지면 위치: (${camera.groundX.toFixed(1)}, ${camera.groundY.toFixed(1)})`);
console.log(`  높이: ${camera.height.toFixed(1)}`);
console.log(`  피치(기울기): ${(camera.pitch * 180 / Math.PI).toFixed(1)}°`);
console.log(`  초점거리: ${camera.focalLength.toFixed(1)}\n`);

const MINIMUM_SPRITE_SCALE = 0.45;

// 테스트 1: 깊이 단조성 (직선 구간에서 앞에서 뒤로 갈수록 카메라에서 멀어짐)
console.log("테스트 1: 깊이 단조성 (직선 구간)");
let depthMonotonicOk = true;
const straightProgressSamples = [0, 0.05, 0.10, 0.15, 0.20, 0.25];
const lane = 4;
const radius = laneRadius(lane);
let prevDepth = -Infinity;

for (const progress of straightProgressSamples) {
  const pose = poseOnRadius(progress, radius);
  const currentDepth = pose.y;
  if (currentDepth < prevDepth) {
    console.log(`  ✗ 직선 구간 단조성 위반: progress ${progress.toFixed(2)}, y=${pose.y.toFixed(1)}`);
    depthMonotonicOk = false;
  }
  prevDepth = currentDepth;
}

if (depthMonotonicOk) {
  console.log("  ✓ 직선 구간에서 진행도에 따라 깊이가 증가합니다.\n");
} else {
  console.log("  ✗ 단조성 테스트 실패\n");
}

// 테스트 2: 수평선 존재 (먼 거리에서 스케일이 작아지지만 하한 존재)
console.log("테스트 2: 수평선 및 최소 스케일");
let horizonOk = true;
const farProgress = 1.0;
for (let testLane = 1; testLane <= 8; testLane++) {
  const farPose = poseOnRadius(farProgress, laneRadius(testLane));
  if (farPose.scale < 0.1 || farPose.scale > 3) {
    console.log(`  ✗ 비정상 스케일: lane ${testLane}, progress ${farProgress}, scale=${farPose.scale.toFixed(3)}`);
    horizonOk = false;
  }
}

if (horizonOk) {
  console.log("  ✓ 모든 레이어에서 스케일이 합리적 범위 내에 있습니다.\n");
} else {
  console.log("  ✗ 수평선 테스트 실패\n");
}

// 테스트 3: 최소 스케일 하한 (가까운 말에 대한 스케일 플로어)
console.log("테스트 3: 최소 스케일 하한 (0.45)");
let scaleFloorOk = true;
const nearProgress = 0.95;
for (let testLane = 1; testLane <= 8; testLane++) {
  const nearPose = poseOnRadius(nearProgress, laneRadius(testLane));
  if (nearPose.scale < MINIMUM_SPRITE_SCALE - 0.001) {
    console.log(`  ✗ 최소 스케일 위반: lane ${testLane}, scale=${nearPose.scale.toFixed(3)} < ${MINIMUM_SPRITE_SCALE}`);
    scaleFloorOk = false;
  }
}

if (scaleFloorOk) {
  console.log(`  ✓ 모든 근접 위치에서 scale ≥ ${MINIMUM_SPRITE_SCALE}입니다.\n`);
} else {
  console.log(`  ✗ 최소 스케일 테스트 실패\n`);
}

// 테스트 4: 접선 벡터 정규화
console.log("테스트 4: 접선 벡터 정규화");
let tangentNormOk = true;
for (const progress of [0, 0.25, 0.5, 0.75, 1.0]) {
  const pose = poseOnRadius(progress, laneRadius(4));
  const length = Math.hypot(pose.tangentX, pose.tangentY);
  if (Math.abs(length - 1.0) > 0.01) {
    console.log(`  ✗ 접선 길이 비정규화: progress ${progress.toFixed(2)}, length=${length.toFixed(3)}`);
    tangentNormOk = false;
  }
}

if (tangentNormOk) {
  console.log("  ✓ 모든 접선 벡터가 정규화되었습니다.\n");
} else {
  console.log("  ✗ 접선 벡터 테스트 실패\n");
}

console.log("=== 검증 요약 ===");
const allOk = depthMonotonicOk && horizonOk && scaleFloorOk && tangentNormOk;
if (allOk) {
  console.log("✅ 모든 카메라 투영 테스트를 통과했습니다.");
  process.exit(0);
} else {
  console.log("❌ 일부 테스트가 실패했습니다.");
  process.exit(1);
}
