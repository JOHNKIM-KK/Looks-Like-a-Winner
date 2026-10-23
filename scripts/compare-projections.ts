// 이전 project() 함수와 새 카메라 투영 비교
import { laneRadius, referenceDistance, viewBounds, poseAt as newPoseAt } from "../game/track";

console.log("=== 이전 고정 원근법 vs 새 카메라 투영 비교 ===\n");

// 이전 project() 복제
const FAR_SCALE_OLD = 0.72;
const CENTER_X_OLD = 860;
const CENTER_Y_OLD = 500;
const REFERENCE_RADIUS_OLD = 256 + 3 * 58;

type LogicalOld = { x: number; y: number; tx: number; ty: number };
type TrackPoseOld = {
  x: number;
  y: number;
  flipX: boolean;
  lean: number;
  scale: number;
  tangentX: number;
  tangentY: number;
};

function projectOld(logical: LogicalOld): TrackPoseOld {
  const depth = Math.min(1, Math.max(0, (logical.y + REFERENCE_RADIUS_OLD) / (2 * REFERENCE_RADIUS_OLD)));
  const scale = 1 - (1 - FAR_SCALE_OLD) * depth;
  const converge = 0.76 + 0.24 * (1 - depth);
  const x = CENTER_X_OLD - logical.x * converge;
  const y = CENTER_Y_OLD - logical.y * 0.72;
  const tangentX = -logical.tx * converge;
  const tangentY = -logical.ty * 0.72;
  const heading = Math.atan2(tangentY, tangentX);
  const flipX = Math.cos(heading) < 0;
  let lean = heading;
  if (flipX) lean = heading > 0 ? heading - Math.PI : heading + Math.PI;
  const leanDeg = Math.max(-15, Math.min(15, (lean * 180) / Math.PI));
  const length = Math.hypot(tangentX, tangentY) || 1;
  return {
    x,
    y,
    flipX,
    lean: leanDeg,
    scale,
    tangentX: tangentX / length,
    tangentY: tangentY / length,
  };
}

// 이전 logicalAtDistance 복제
const STRAIGHT_OLD = 1712;
const STRAIGHT_BACK_OLD = 1418;
const CHUTE_OLD = 158;
const GOAL_ALONG_OLD = 0.920;

function logicalAtDistanceOld(distance: number, radius: number): LogicalOld {
  const halfBack = STRAIGHT_BACK_OLD / 2;
  const halfHome = STRAIGHT_OLD / 2;
  const corner = Math.PI * radius;
  let cursor = Math.max(0, distance);
  
  if (cursor <= CHUTE_OLD) {
    return { x: halfBack + CHUTE_OLD - cursor, y: -radius, tx: -1, ty: 0 };
  }
  cursor -= CHUTE_OLD;
  
  if (cursor <= STRAIGHT_BACK_OLD) {
    return { x: halfBack - cursor, y: -radius, tx: -1, ty: 0 };
  }
  cursor -= STRAIGHT_BACK_OLD;
  
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
  
  if (cursor <= GOAL_ALONG_OLD * STRAIGHT_OLD) {
    return { x: -halfHome + cursor, y: radius, tx: 1, ty: 0 };
  }
  
  const theta = Math.PI / 2 + (cursor - GOAL_ALONG_OLD * STRAIGHT_OLD) / radius;
  return {
    x: halfHome + Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    tx: -Math.sin(theta),
    ty: Math.cos(theta),
  };
}

function poseOnRadiusOld(progress: number, radius: number): TrackPoseOld {
  return projectOld(logicalAtDistanceOld(Math.max(0, progress) * referenceDistance(), radius));
}

function poseAtOld(progress: number, lane: number): TrackPoseOld {
  return poseOnRadiusOld(progress, laneRadius(lane));
}

// 주요 위치 비교
const testPoints = [
  { label: "출발(레인4)", progress: 0, lane: 4 },
  { label: "맞은편(레인4)", progress: 0.25, lane: 4 },
  { label: "코너 정점(레인4)", progress: 0.5, lane: 4 },
  { label: "홈 직선(레인4)", progress: 0.75, lane: 4 },
  { label: "골(레인4)", progress: 1.0, lane: 4 },
  { label: "출발(레인1)", progress: 0, lane: 1 },
  { label: "출발(레인8)", progress: 0, lane: 8 },
];

console.log("주요 위치 좌표 비교:");
console.log("위치".padEnd(20), "이전 X".padEnd(12), "새 X".padEnd(12), "이전 Y".padEnd(12), "새 Y".padEnd(12), "이전 Scale".padEnd(12), "새 Scale");
console.log("-".repeat(100));

for (const point of testPoints) {
  const oldPose = poseAtOld(point.progress, point.lane);
  const newPose = newPoseAt(point.progress, point.lane);
  console.log(
    point.label.padEnd(20),
    oldPose.x.toFixed(1).padEnd(12),
    newPose.x.toFixed(1).padEnd(12),
    oldPose.y.toFixed(1).padEnd(12),
    newPose.y.toFixed(1).padEnd(12),
    oldPose.scale.toFixed(3).padEnd(12),
    newPose.scale.toFixed(3)
  );
}

// 바운딩 박스 비교
console.log("\n=== 트랙 바운딩 박스 비교 ===");
const bounds = viewBounds(8);
console.log("새 바운딩 박스:", bounds);

// 이전 바운딩 박스 계산
function viewBoundsOld(lanes: number) {
  const edge = laneRadius(Math.max(1, lanes)) + 58 * 1.6;
  const poses: TrackPoseOld[] = [];
  
  // sampleRadius 복제
  const total = STRAIGHT_OLD * 2 + Math.PI * edge * 2;
  for (let index = 0; index <= 64; index += 1) {
    const loop = (index / 64) * total;
    let logical: LogicalOld;
    const corner = Math.PI * edge;
    const half = STRAIGHT_OLD / 2;
    if (loop <= STRAIGHT_OLD) {
      logical = { x: -half + loop, y: -edge, tx: 1, ty: 0 };
    } else if (loop <= STRAIGHT_OLD + corner) {
      const theta = -Math.PI / 2 + (loop - STRAIGHT_OLD) / edge;
      logical = {
        x: half + Math.cos(theta) * edge,
        y: Math.sin(theta) * edge,
        tx: -Math.sin(theta),
        ty: Math.cos(theta),
      };
    } else if (loop <= STRAIGHT_OLD * 2 + corner) {
      const along = loop - STRAIGHT_OLD - corner;
      logical = { x: half - along, y: edge, tx: -1, ty: 0 };
    } else {
      const theta = Math.PI / 2 + (loop - STRAIGHT_OLD * 2 - corner) / edge;
      logical = {
        x: -half + Math.cos(theta) * edge,
        y: Math.sin(theta) * edge,
        tx: -Math.sin(theta),
        ty: Math.cos(theta),
      };
    }
    poses.push(projectOld(logical));
  }
  
  // sampleChute
  for (let index = 0; index <= 16; index += 1) {
    poses.push(poseOnRadiusOld((index / 16) * (CHUTE_OLD / referenceDistance()), edge));
  }
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pose of poses) {
    minX = Math.min(minX, pose.x);
    minY = Math.min(minY, pose.y);
    maxX = Math.max(maxX, pose.x);
    maxY = Math.max(maxY, pose.y);
  }
  const pad = 420;
  return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
}

const oldBounds = viewBoundsOld(8);
console.log("이전 바운딩 박스:", oldBounds);
console.log("\n차이:");
console.log(`  X: ${(bounds.x - oldBounds.x).toFixed(1)}`);
console.log(`  Y: ${(bounds.y - oldBounds.y).toFixed(1)}`);
console.log(`  Width: ${(bounds.width - oldBounds.width).toFixed(1)}`);
console.log(`  Height: ${(bounds.height - oldBounds.height).toFixed(1)}`);
