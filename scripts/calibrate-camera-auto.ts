// 자동 카메라 캘리브레이션 - 이전 투영을 목표로 최적화
import { laneRadius, referenceDistance, INNER_RADIUS, LANE_GAP } from "../game/track";

const STRAIGHT = 1712;
const STRAIGHT_BACK = 1418;
const CHUTE = 158;
const GOAL_ALONG = 0.920;
const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;
const FAR_SCALE = 0.72;
const CENTER_X = 860;
const CENTER_Y = 500;

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

function projectOld(logical: Logical): { x: number; y: number; scale: number } {
  const depth = Math.min(1, Math.max(0, (logical.y + REFERENCE_RADIUS) / (2 * REFERENCE_RADIUS)));
  const scale = Math.max(0.45, 1 - (1 - FAR_SCALE) * depth);
  const converge = 0.76 + 0.24 * (1 - depth);
  const x = CENTER_X - logical.x * converge;
  const y = CENTER_Y - logical.y * 0.72;
  return { x, y, scale };
}

type CameraParams = {
  groundY: number;
  height: number;
  pitch: number;
  focalLength: number;
};

function projectNew(logical: Logical, params: CameraParams): { x: number; y: number; scale: number } {
  const dx = logical.x;
  const dy = logical.y - params.groundY;
  
  const localX = dx;
  const localY = dy;
  
  const cosPitch = Math.cos(params.pitch);
  const sinPitch = Math.sin(params.pitch);
  const camDepth = localY * cosPitch - (-params.height) * sinPitch;
  
  const nearPlane = 10;
  const safeDepth = Math.max(nearPlane, camDepth);
  
  const screenX = CENTER_X - (params.focalLength * localX) / safeDepth;
  const camVertical = localY * sinPitch + (-params.height) * cosPitch;
  const screenY = CENTER_Y - (params.focalLength * camVertical) / safeDepth;
  
  const scale = Math.max(0.45, Math.min(2.5, params.focalLength / safeDepth));
  
  return { x: screenX, y: screenY, scale };
}

// 목표 점들 생성 (레인 1, 4, 8의 전 구간)
const targetPoints: Array<{ logical: Logical; target: { x: number; y: number; scale: number } }> = [];

for (const lane of [1, 4, 8]) {
  const radius = laneRadius(lane);
  for (let i = 0; i <= 20; i++) {
    const progress = i / 20;
    const logical = logicalAtDistance(progress * referenceDistance(), radius);
    const target = projectOld(logical);
    targetPoints.push({ logical, target });
  }
}

console.log(`목표 점 개수: ${targetPoints.length}`);

// 손실 함수
function computeLoss(params: CameraParams): number {
  let totalError = 0;
  for (const point of targetPoints) {
    const projected = projectNew(point.logical, params);
    const dx = projected.x - point.target.x;
    const dy = projected.y - point.target.y;
    const ds = (projected.scale - point.target.scale) * 100; // scale 차이에 가중치
    totalError += dx * dx + dy * dy + ds * ds;
  }
  return totalError / targetPoints.length;
}

// 격자 탐색
console.log("\n격자 탐색 시작...");

let bestParams: CameraParams = {
  groundY: -900,
  height: 600,
  pitch: 6 * (Math.PI / 180),
  focalLength: 400,
};
let bestLoss = computeLoss(bestParams);

const groundYRange = [-1000, -800, -600, -400];
const heightRange = [400, 500, 600, 700];
const pitchRange = [4, 5, 6, 7, 8].map(deg => deg * Math.PI / 180);
const focalLengthRange = [300, 350, 400, 450, 500];

let iterations = 0;
for (const groundY of groundYRange) {
  for (const height of heightRange) {
    for (const pitch of pitchRange) {
      for (const focalLength of focalLengthRange) {
        const params: CameraParams = { groundY, height, pitch, focalLength };
        const loss = computeLoss(params);
        iterations++;
        
        if (loss < bestLoss) {
          bestLoss = loss;
          bestParams = params;
          console.log(`개선: loss=${loss.toFixed(2)}, groundY=${groundY}, height=${height}, pitch=${(pitch * 180 / Math.PI).toFixed(1)}°, focalLength=${focalLength}`);
        }
      }
    }
  }
}

console.log(`\n총 ${iterations}회 시도`);
console.log(`\n최적 파라미터:`);
console.log(`  groundY: ${bestParams.groundY}`);
console.log(`  height: ${bestParams.height}`);
console.log(`  pitch: ${(bestParams.pitch * 180 / Math.PI).toFixed(1)}°`);
console.log(`  focalLength: ${bestParams.focalLength}`);
console.log(`  최종 손실: ${bestLoss.toFixed(2)}`);

// 검증
console.log(`\n주요 점 비교:`);
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
  const projected = projectNew(logical, bestParams);
  
  const dx = projected.x - target.x;
  const dy = projected.y - target.y;
  const error = Math.sqrt(dx * dx + dy * dy);
  totalError += error;
  
  console.log(`${point.label}:`);
  console.log(`  목표: x=${target.x.toFixed(1)}, y=${target.y.toFixed(1)}, scale=${target.scale.toFixed(3)}`);
  console.log(`  결과: x=${projected.x.toFixed(1)}, y=${projected.y.toFixed(1)}, scale=${projected.scale.toFixed(3)}`);
  console.log(`  오차: ${error.toFixed(1)}px`);
}

console.log(`\n평균 오차: ${(totalError / testPoints.length).toFixed(1)}px`);
