import { projectWithCamera, laneRadius, type Camera } from "@/game/track";
import { getCameraForState, type RaceSnapshot, type CameraState } from "@/game/cameraState";

const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;
const SCREEN_CENTER_X = GAME_WIDTH / 2;
const SCREEN_CENTER_Y = GAME_HEIGHT * 0.474;
const LANE_GAP = 58;
const CHUTE = 158;
const STRAIGHT_BACK = 1418;
const INNER_RADIUS = 256;
const STRAIGHT = 1712;
const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;
const GOAL_ALONG = 0.920;

function getLogicalAt(progress: number, lane: number) {
  const radius = laneRadius(lane);
  const halfBack = STRAIGHT_BACK / 2;
  const halfHome = STRAIGHT / 2;
  const corner = Math.PI * radius;
  const total = CHUTE + STRAIGHT_BACK + Math.PI * REFERENCE_RADIUS + GOAL_ALONG * STRAIGHT;
  let cursor = Math.max(0, progress * total);
  
  if (cursor <= CHUTE) {
    const x = halfBack + CHUTE - cursor;
    const y = -radius;
    return { x, y, tx: 0, ty: -1 };
  }
  cursor -= CHUTE;
  
  if (cursor <= STRAIGHT_BACK) {
    const x = halfBack - cursor;
    const y = -radius;
    return { x, y, tx: -1, ty: 0 };
  }
  cursor -= STRAIGHT_BACK;
  
  if (cursor <= corner) {
    const theta = cursor / radius;
    const x = -halfBack - radius * Math.sin(theta);
    const y = -radius * Math.cos(theta);
    return { x, y, tx: -Math.cos(theta), ty: Math.sin(theta) };
  }
  cursor -= corner;
  
  const x = -halfBack + cursor;
  const y = radius;
  return { x, y, tx: 1, ty: 0 };
}

function testCameraState(stateName: string, state: CameraState, snapshot: RaceSnapshot) {
  console.log(`\n=== ${stateName} ===`);
  
  let packCenterX = 0;
  let packCenterY = 0;
  let packMinX = Infinity;
  let packMaxX = -Infinity;
  
  snapshot.horses.forEach(h => {
    const logical = getLogicalAt(h.progress, h.index + 1);
    packCenterX += logical.x;
    packCenterY += logical.y;
    packMinX = Math.min(packMinX, logical.x);
    packMaxX = Math.max(packMaxX, logical.x);
  });
  
  packCenterX /= snapshot.horses.length;
  packCenterY /= snapshot.horses.length;
  const packWidth = packMaxX - packMinX;
  
  console.log(`무리 중심 logical: (${packCenterX.toFixed(1)}, ${packCenterY.toFixed(1)})`);
  console.log(`무리 폭: ${packWidth.toFixed(1)}px`);
  
  const camera = getCameraForState(state, snapshot, packCenterX, packCenterY);
  
  console.log(`카메라: ground=(${camera.groundX.toFixed(1)}, ${camera.groundY.toFixed(1)}) height=${camera.height.toFixed(1)}`);
  console.log(`  pitch=${(camera.pitch * 180 / Math.PI).toFixed(1)}° yaw=${(camera.yaw * 180 / Math.PI).toFixed(1)}° focal=${camera.focalLength}`);
  
  const targetProjected = projectWithCamera({ x: packCenterX, y: packCenterY, tx: 0, ty: 0 }, camera);
  const errorX = Math.abs(targetProjected.x - SCREEN_CENTER_X);
  const errorY = Math.abs(targetProjected.y - SCREEN_CENTER_Y);
  
  console.log(`타겟 투영: (${targetProjected.x.toFixed(1)}, ${targetProjected.y.toFixed(1)})`);
  console.log(`오차: (${errorX.toFixed(1)}, ${errorY.toFixed(1)})px - ${errorX <= 10 && errorY <= 10 ? "✅ PASS" : "❌ FAIL"}`);
  
  let visibleCount = 0;
  let screenMinX = Infinity;
  let screenMaxX = -Infinity;
  
  snapshot.horses.forEach(h => {
    const logical = getLogicalAt(h.progress, h.index + 1);
    const projected = projectWithCamera(logical, camera);
    
    if (projected.visible && projected.x >= 0 && projected.x <= GAME_WIDTH && projected.y >= 0 && projected.y <= GAME_HEIGHT) {
      visibleCount++;
      screenMinX = Math.min(screenMinX, projected.x);
      screenMaxX = Math.max(screenMaxX, projected.x);
    }
  });
  
  const screenWidth = screenMaxX - screenMinX;
  const widthPercent = (screenWidth / GAME_WIDTH) * 100;
  
  console.log(`화면 내 말 수: ${visibleCount}/8`);
  console.log(`화면 상 무리 폭: ${screenWidth.toFixed(1)}px (${widthPercent.toFixed(1)}% of ${GAME_WIDTH}px)`);
  console.log(`  목표: 60-85% = ${(GAME_WIDTH * 0.6).toFixed(0)}-${(GAME_WIDTH * 0.85).toFixed(0)}px`);
  
  if (visibleCount < 8 || widthPercent < 60 || widthPercent > 85) {
    console.log("⚠️  조정 필요");
  } else {
    console.log("✅ OK");
  }
}

console.log("=== 카메라 상태 검증 ===\n");
console.log(`화면: ${GAME_WIDTH}x${GAME_HEIGHT}, 중심: (${SCREEN_CENTER_X}, ${SCREEN_CENTER_Y.toFixed(1)})`);

// START
const startSnapshot: RaceSnapshot = {
  raceTime: 0,
  started: false,
  gateOpen: 0,
  leadProgress: 0,
  horses: Array.from({ length: 8 }, (_, i) => ({
    index: i,
    progress: 0,
  })),
};
testCameraState("START", { name: "START" }, startSnapshot);

// STRAIGHT (early)
const straightSnapshot: RaceSnapshot = {
  raceTime: 2,
  started: true,
  gateOpen: 1,
  leadProgress: 0.15,
  horses: Array.from({ length: 8 }, (_, i) => ({
    index: i,
    progress: 0.14 + i * 0.002,
  })),
};
testCameraState("STRAIGHT-early", { name: "STRAIGHT" }, straightSnapshot);

// CORNER_IN
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
testCameraState("CORNER_IN", { name: "CORNER_IN" }, cornerInSnapshot);

// CORNER_OUT
const cornerOutSnapshot: RaceSnapshot = {
  raceTime: 15,
  started: true,
  gateOpen: 1,
  leadProgress: 0.65,
  horses: Array.from({ length: 8 }, (_, i) => ({
    index: i,
    progress: 0.63 + i * 0.003,
  })),
};
testCameraState("CORNER_OUT", { name: "CORNER_OUT" }, cornerOutSnapshot);

// STRAIGHT (home)
const straightHomeSnapshot: RaceSnapshot = {
  raceTime: 20,
  started: true,
  gateOpen: 1,
  leadProgress: 0.8,
  horses: Array.from({ length: 8 }, (_, i) => ({
    index: i,
    progress: 0.78 + i * 0.003,
  })),
};
testCameraState("STRAIGHT-home", { name: "STRAIGHT" }, straightHomeSnapshot);

// FINISH
const finishSnapshot: RaceSnapshot = {
  raceTime: 25,
  started: true,
  gateOpen: 1,
  leadProgress: 0.95,
  horses: Array.from({ length: 8 }, (_, i) => ({
    index: i,
    progress: 0.93 + i * 0.003,
  })),
};
testCameraState("FINISH", { name: "FINISH" }, finishSnapshot);

console.log("\n=== 검증 완료 ===");
