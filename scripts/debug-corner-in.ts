import { projectWithCamera, laneRadius, type Camera } from "@/game/track";
import { getCameraForState, type RaceSnapshot, type CameraState } from "@/game/cameraState";

const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;
const LANE_GAP = 58;
const CHUTE = 158;
const STRAIGHT_BACK = 1418;
const INNER_RADIUS = 256;
const STRAIGHT = 1712;
const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;

function getLogicalAt(progress: number, lane: number) {
  const radius = laneRadius(lane);
  const halfBack = STRAIGHT_BACK / 2;
  const corner = Math.PI * radius;
  const GOAL_ALONG = 0.920;
  const total = CHUTE + STRAIGHT_BACK + Math.PI * REFERENCE_RADIUS + GOAL_ALONG * STRAIGHT;
  let cursor = Math.max(0, progress * total);
  
  if (cursor <= CHUTE) {
    const x = halfBack + CHUTE - cursor;
    const y = -radius;
    return { x, y, tx: -1, ty: 0 };
  }
  cursor -= CHUTE;
  
  if (cursor <= STRAIGHT_BACK) {
    const x = halfBack - cursor;
    const y = -radius;
    return { x, y, tx: -1, ty: 0 };
  }
  cursor -= STRAIGHT_BACK;
  
  if (cursor <= corner) {
    const theta = -Math.PI / 2 + cursor / radius;
    return {
      x: -halfBack + Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      tx: -Math.cos(theta),
      ty: Math.sin(theta),
    };
  }
  cursor -= corner;
  
  const halfHome = STRAIGHT / 2;
  const x = -halfHome + cursor;
  const y = radius;
  return { x, y, tx: 1, ty: 0 };
}

const cornerInSnapshot: RaceSnapshot = {
  raceTime: 10,
  started: true,
  gateOpen: 1,
  leadProgress: 0.45,
  horses: Array.from({ length: 8 }, (_, i) => ({
    index: i,
    progress: 0.43 + i * 0.003,
  })),
};

console.log("=== CORNER_IN 말 위치 분석 ===\n");

let packCenterX = 0;
let packCenterY = 0;

cornerInSnapshot.horses.forEach(h => {
  const logical = getLogicalAt(h.progress, h.index + 1);
  console.log(`말 ${h.index + 1}: progress=${h.progress.toFixed(3)} lane=${h.index + 1} logical=(${logical.x.toFixed(1)}, ${logical.y.toFixed(1)})`);
  packCenterX += logical.x;
  packCenterY += logical.y;
});

packCenterX /= 8;
packCenterY /= 8;

console.log(`\n무리 중심: (${packCenterX.toFixed(1)}, ${packCenterY.toFixed(1)})`);

const camera = getCameraForState({ name: "CORNER_IN" }, cornerInSnapshot, packCenterX, packCenterY);

console.log(`\n카메라:`);
console.log(`  ground=(${camera.groundX.toFixed(1)}, ${camera.groundY.toFixed(1)}) height=${camera.height.toFixed(1)}`);
console.log(`  pitch=${(camera.pitch * 180 / Math.PI).toFixed(1)}° yaw=${(camera.yaw * 180 / Math.PI).toFixed(1)}° focal=${camera.focalLength}`);

console.log("\n각 말의 화면 투영:");
cornerInSnapshot.horses.forEach(h => {
  const logical = getLogicalAt(h.progress, h.index + 1);
  const projected = projectWithCamera(logical, camera);
  const inBounds = projected.visible && 
                   projected.x >= 0 && projected.x <= GAME_WIDTH && 
                   projected.y >= 0 && projected.y <= GAME_HEIGHT;
  console.log(`  말 ${h.index + 1}: screen=(${projected.x.toFixed(0)}, ${projected.y.toFixed(0)}) visible=${projected.visible} inBounds=${inBounds}`);
});
