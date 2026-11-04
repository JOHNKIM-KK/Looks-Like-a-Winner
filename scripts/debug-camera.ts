import { simulateRace } from "@/lib/race";
import { mockHorses } from "@/lib/mockHorses";
import { createInitialState, nextCameraState, getCameraForState, type RaceSnapshot } from "@/game/cameraState";
import { laneRadius, projectWithCamera, LANE_GAP } from "@/game/track";

const GAME_HEIGHT = 1170;
const LANE_AREA_TOP = GAME_HEIGHT * 0.15;
const LANE_AREA_BOTTOM = GAME_HEIGHT * 0.80;
const MIN_FACE_SIZE_PX = 24;

console.log("=== 카메라 구도 디버깅 ===\n");

const seed = 42;
const result = simulateRace(mockHorses, seed);

function getLogicalAt(progress: number, lane: number) {
  const STRAIGHT = 1712;
  const INNER_RADIUS = 256;
  const LANE_GAP = 58;
  const CHUTE = 158;
  const STRAIGHT_BACK = 1418;
  const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;
  const GOAL_ALONG = 0.920;
  
  const radius = INNER_RADIUS + (lane - 1) * LANE_GAP;
  const halfBack = STRAIGHT_BACK / 2;
  const halfHome = STRAIGHT / 2;
  const corner = Math.PI * radius;
  const total = CHUTE + STRAIGHT_BACK + Math.PI * REFERENCE_RADIUS + GOAL_ALONG * STRAIGHT;
  let cursor = Math.max(0, progress * total);
  
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

const checkTimes = [
  { time: 1.5, name: "START" },
  { time: 4.5, name: "STRAIGHT-early" },
  { time: 13.5, name: "CORNER_IN" },
  { time: 20.0, name: "CORNER_OUT" },
  { time: 26.0, name: "STRAIGHT-home" },
  { time: 34.0, name: "FINISH" },
];

for (const check of checkTimes) {
  const raceTime = check.time;
  
  let started = false;
  let gateOpen = 0;
  
  if (raceTime >= 2.4) {
    started = true;
    gateOpen = Math.min(1, (raceTime - 2.4) / 0.28);
  }

  const leadHorse = result.horses
    .map(h => ({
      horse: h,
      progress: h.samples[Math.floor(raceTime / 0.1)] ?? h.samples[h.samples.length - 1] ?? 0,
    }))
    .sort((a, b) => b.progress - a.progress)[0];

  const leadProgress = leadHorse ? leadHorse.progress : 0;

  const snapshot: RaceSnapshot = {
    raceTime,
    started,
    gateOpen,
    leadProgress: started && gateOpen >= 1 ? leadProgress : 0,
    horses: result.horses.map((h, index) => {
      const progress = h.samples[Math.floor(raceTime / 0.1)] ?? h.samples[h.samples.length - 1] ?? 0;
      return { index, progress };
    }),
  };

  const state = nextCameraState(createInitialState(), snapshot);

  const sortedHorses = result.horses
    .map((h, index) => ({
      index,
      progress: h.samples[Math.floor(raceTime / 0.1)] ?? h.samples[h.samples.length - 1] ?? 0,
    }))
    .sort((a, b) => b.progress - a.progress);

  let packCenterX = 0;
  let packCenterY = 0;
  const leadCount = Math.min(4, sortedHorses.length);
  
  for (let i = 0; i < leadCount; i += 1) {
    const horse = sortedHorses[i];
    if (horse) {
      const logical = getLogicalAt(horse.progress, horse.index + 1);
      packCenterX += logical.x;
      packCenterY += logical.y;
    }
  }
  packCenterX /= leadCount;
  packCenterY /= leadCount;

  const camera = getCameraForState(state, snapshot, packCenterX, packCenterY);

  console.log(`\n${check.name} (${raceTime}초):`);
  console.log(`  상태: ${state.name}`);
  console.log(`  선두 진행도: ${(leadProgress * 100).toFixed(1)}%`);
  console.log(`  무리 중심 logical: (${packCenterX.toFixed(1)}, ${packCenterY.toFixed(1)})`);
  console.log(`  카메라:`);
  console.log(`    ground: (${camera.groundX.toFixed(1)}, ${camera.groundY.toFixed(1)})`);
  console.log(`    height: ${camera.height.toFixed(1)}`);
  console.log(`    pitch: ${(camera.pitch * 180 / Math.PI).toFixed(1)}°`);
  console.log(`    yaw: ${(camera.yaw * 180 / Math.PI).toFixed(1)}°`);
  console.log(`    focal: ${camera.focalLength.toFixed(1)}`);

  let visibleCount = 0;
  let minFaceSize = Infinity;
  let maxFaceSize = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const horse of result.horses) {
    const progress = horse.samples[Math.floor(raceTime / 0.1)] ?? horse.samples[horse.samples.length - 1] ?? 0;
    const logical = getLogicalAt(progress, horse.number);
    const pose = projectWithCamera(logical, camera);
    
    if (pose.visible) {
      visibleCount++;
      const faceSize = pose.scale * 52;
      minFaceSize = Math.min(minFaceSize, faceSize);
      maxFaceSize = Math.max(maxFaceSize, faceSize);
      minY = Math.min(minY, pose.y);
      maxY = Math.max(maxY, pose.y);
      
      if (horse.number === 1) {
        console.log(`  말 #1: screen (${pose.x.toFixed(1)}, ${pose.y.toFixed(1)}) scale ${pose.scale.toFixed(2)} face ${faceSize.toFixed(1)}px`);
      }
    } else {
      if (horse.number === 1) {
        console.log(`  말 #1: INVISIBLE`);
      }
    }
  }

  console.log(`  화면 내: ${visibleCount}/8 마리`);
  if (visibleCount > 0) {
    console.log(`  얼굴: ${minFaceSize.toFixed(1)}~${maxFaceSize.toFixed(1)}px`);
    console.log(`  Y 범위: ${minY.toFixed(0)}~${maxY.toFixed(0)}px (레인: ${LANE_AREA_TOP.toFixed(0)}~${LANE_AREA_BOTTOM.toFixed(0)})`);
  }
}

console.log("\n=== 검증 완료 ===");
