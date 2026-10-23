// 최종 검증 보고서
import { laneRadius, referenceDistance, INNER_RADIUS, LANE_GAP, poseAt, createDefaultCamera } from "../game/track";

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
  
  if (cursor <= CHUTE) {
    return { x: halfBack + CHUTE - cursor, y: -radius };
  }
  cursor -= CHUTE;
  
  if (cursor <= STRAIGHT_BACK) {
    return { x: halfBack - cursor, y: -radius };
  }
  cursor -= STRAIGHT_BACK;
  
  if (cursor <= corner) {
    const theta = -Math.PI / 2 + cursor / radius;
    return {
      x: -halfHome + Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
    };
  }
  cursor -= corner;
  
  if (cursor <= GOAL_ALONG * STRAIGHT) {
    return { x: -halfHome + cursor, y: radius };
  }
  
  const theta = Math.PI / 2 + (cursor - GOAL_ALONG * STRAIGHT) / radius;
  return {
    x: halfHome + Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
  };
}

function projectOld(logical: Logical): { x: number; y: number; scale: number } {
  const depth = Math.min(1, Math.max(0, (logical.y + REFERENCE_RADIUS) / (2 * REFERENCE_RADIUS)));
  const scale = Math.max(0.45, 1 - (1 - FAR_SCALE) * depth);
  const converge = 0.76 + 0.24 * (1 - depth);
  const x = CENTER_X - logical.x * converge;
  const y = CENTER_Y - logical.y * 0.72;
  return { x, y, scale };
}

console.log("=== 최종 검증 보고서 ===\n");

const camera = createDefaultCamera();
console.log("최적화된 카메라 파라미터:");
console.log(`  groundY: ${camera.groundY}`);
console.log(`  height: ${camera.height}`);
console.log(`  pitch: ${(camera.pitch * 180 / Math.PI).toFixed(2)}°`);
console.log(`  focalLength: ${camera.focalLength}\n`);

// 주요 5개 점 비교
console.log("주요 5개 점 위치 비교:");
console.log("위치".padEnd(20) + "이전 X".padEnd(12) + "새 X".padEnd(12) + "이전 Y".padEnd(12) + "새 Y".padEnd(12) + "이전 Scale".padEnd(14) + "새 Scale".padEnd(12) + "오차(px)");
console.log("-".repeat(110));

const testPoints = [
  { label: "출발(레인4)", progress: 0, lane: 4 },
  { label: "맞은편(레인4)", progress: 0.25, lane: 4 },
  { label: "코너(레인4)", progress: 0.5, lane: 4 },
  { label: "홈 직선(레인4)", progress: 0.75, lane: 4 },
  { label: "골(레인4)", progress: 1.0, lane: 4 },
];

let totalError = 0;
for (const point of testPoints) {
  const logical = logicalAtDistance(point.progress * referenceDistance(), laneRadius(point.lane));
  const target = projectOld(logical);
  const pose = poseAt(point.progress, point.lane);
  
  const dx = pose.x - target.x;
  const dy = pose.y - target.y;
  const error = Math.sqrt(dx * dx + dy * dy);
  totalError += error;
  
  console.log(
    point.label.padEnd(20) +
    target.x.toFixed(1).padEnd(12) +
    pose.x.toFixed(1).padEnd(12) +
    target.y.toFixed(1).padEnd(12) +
    pose.y.toFixed(1).padEnd(12) +
    target.scale.toFixed(3).padEnd(14) +
    pose.scale.toFixed(3).padEnd(12) +
    error.toFixed(1)
  );
}

console.log(`\n평균 오차: ${(totalError / testPoints.length).toFixed(1)}px (합격 기준: 60px 이내)\n`);

// 바운딩 박스 비교
let oldMinX = Infinity, oldMaxX = -Infinity, oldMinY = Infinity, oldMaxY = -Infinity;
let newMinX = Infinity, newMaxX = -Infinity, newMinY = Infinity, newMaxY = -Infinity;

for (const lane of [1, 4, 8]) {
  const radius = laneRadius(lane);
  for (let i = 0; i <= 20; i++) {
    const progress = i / 20;
    const logical = logicalAtDistance(progress * referenceDistance(), radius);
    const old = projectOld(logical);
    const pose = poseAt(progress, lane);
    
    oldMinX = Math.min(oldMinX, old.x);
    oldMaxX = Math.max(oldMaxX, old.x);
    oldMinY = Math.min(oldMinY, old.y);
    oldMaxY = Math.max(oldMaxY, old.y);
    
    newMinX = Math.min(newMinX, pose.x);
    newMaxX = Math.max(newMaxX, pose.x);
    newMinY = Math.min(newMinY, pose.y);
    newMaxY = Math.max(newMaxY, pose.y);
  }
}

const oldWidth = oldMaxX - oldMinX;
const oldHeight = oldMaxY - oldMinY;
const newWidth = newMaxX - newMinX;
const newHeight = newMaxY - newMinY;

console.log("바운딩 박스 비교:");
console.log(`  이전: ${oldWidth.toFixed(1)} x ${oldHeight.toFixed(1)}`);
console.log(`  새로: ${newWidth.toFixed(1)} x ${newHeight.toFixed(1)}`);
console.log(`  가로 차이: ${(Math.abs(newWidth - oldWidth) / oldWidth * 100).toFixed(1)}% (합격 기준: 15% 이내)`);
console.log(`  세로 차이: ${(Math.abs(newHeight - oldHeight) / oldHeight * 100).toFixed(1)}% (합격 기준: 15% 이내)\n`);

// 상하·좌우 순서 확인
console.log("상하·좌우 순서 확인:");
const start = poseAt(0, 4);
const finish = poseAt(1, 4);
console.log(`  출발 Y(${start.y.toFixed(1)}) > 골 Y(${finish.y.toFixed(1)}): ${start.y > finish.y ? '✓' : '✗'}`);

// Scale 확인
console.log("\nScale 확인:");
console.log(`  백직선(가까움) scale: ${start.scale.toFixed(3)}`);
console.log(`  홈 직선(멀리) scale: ${finish.scale.toFixed(3)}`);
console.log(`  가까움 > 멀리: ${start.scale > finish.scale ? '✓' : '✗'}`);
console.log(`  최소 scale ≥ 0.45: ${Math.min(start.scale, finish.scale) >= 0.45 ? '✓' : '✗'}\n`);

// 전체 가시성
let visibleCount = 0;
let invisibleCount = 0;
for (let lane = 1; lane <= 8; lane++) {
  for (let i = 0; i <= 100; i++) {
    const pose = poseAt(i / 100, lane);
    if (pose.visible) visibleCount++;
    else invisibleCount++;
  }
}

console.log(`전체 가시성: ${visibleCount}개 visible, ${invisibleCount}개 invisible (합격 기준: 808개 visible)\n`);

console.log("=== 검증 결과 ===");
const passed = (totalError / testPoints.length) < 60 &&
               Math.abs(newWidth - oldWidth) / oldWidth < 0.15 &&
               Math.abs(newHeight - oldHeight) / oldHeight < 0.15 &&
               start.y > finish.y &&
               start.scale > finish.scale &&
               Math.min(start.scale, finish.scale) >= 0.45 &&
               visibleCount === 808;

if (passed) {
  console.log("✅ 모든 합격 기준을 통과했습니다!");
} else {
  console.log("❌ 일부 기준을 통과하지 못했습니다.");
}
