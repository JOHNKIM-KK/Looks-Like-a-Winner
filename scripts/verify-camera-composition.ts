import { simulateRace } from "@/lib/race";
import { mockHorses } from "@/lib/mockHorses";
import { createInitialState, nextCameraState, getCameraForState, type RaceSnapshot } from "@/game/cameraState";
import { laneRadius, projectWithCamera, sampleRadiusLogical, LANE_GAP } from "@/game/track";

const GAME_HEIGHT = 1170;
const LANE_AREA_TOP = GAME_HEIGHT * 0.15;
const LANE_AREA_BOTTOM = GAME_HEIGHT * 0.80;
const MIN_FACE_SIZE_PX = 24;

console.log("=== 카메라 상태별 구도 검증 ===\n");
console.log(`화면 높이: ${GAME_HEIGHT}px`);
console.log(`레인 영역: ${LANE_AREA_TOP}px (15%) ~ ${LANE_AREA_BOTTOM}px (80%)`);
console.log(`최소 얼굴 크기: ${MIN_FACE_SIZE_PX}px\n`);

const seed = 42;
const result = simulateRace(mockHorses, seed);

let started = false;
let gateOpen = 0;
let raceTime = 0;

const stateChecks: Array<{
  time: number;
  state: string;
  leadProgress: number;
  minFaceSize: number;
  maxFaceSize: number;
  minY: number;
  maxY: number;
  horsesInLaneArea: number;
}> = [];

const checkTimes = [
  { time: 1.5, name: "START" },
  { time: 4.5, name: "STRAIGHT-early" },
  { time: 13.5, name: "CORNER_IN" },
  { time: 20.0, name: "CORNER_OUT" },
  { time: 26.0, name: "STRAIGHT-home" },
  { time: 34.0, name: "FINISH" },
];

for (const check of checkTimes) {
  raceTime = check.time;
  
  if (raceTime >= 2.4 && !started) {
    started = true;
    gateOpen = 0;
  }
  
  if (started && gateOpen < 1) {
    gateOpen = Math.min(1, gateOpen + (raceTime - 2.4) / 0.28);
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
      const radius = laneRadius(horse.index + 1);
      const sample = sampleRadiusLogical(radius, 1)[0];
      if (sample) {
        packCenterX += sample.x;
        packCenterY += sample.y;
      }
    }
  }
  packCenterX /= leadCount;
  packCenterY /= leadCount;

  const camera = getCameraForState(state, snapshot, packCenterX, packCenterY);

  let minFaceSize = Infinity;
  let maxFaceSize = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let horsesInLaneArea = 0;

  for (const horse of result.horses) {
    const progress = horse.samples[Math.floor(raceTime / 0.1)] ?? horse.samples[horse.samples.length - 1] ?? 0;
    const radius = laneRadius(horse.number);
    const sample = sampleRadiusLogical(radius, 1)[0];
    if (!sample) continue;

    const pose = projectWithCamera({ x: sample.x, y: sample.y, tx: 0, ty: 0 }, camera);
    
    if (!pose.visible) continue;

    const faceSize = pose.scale * 52;
    minFaceSize = Math.min(minFaceSize, faceSize);
    maxFaceSize = Math.max(maxFaceSize, faceSize);
    minY = Math.min(minY, pose.y);
    maxY = Math.max(maxY, pose.y);

    if (pose.y >= LANE_AREA_TOP && pose.y <= LANE_AREA_BOTTOM) {
      horsesInLaneArea++;
    }
  }

  stateChecks.push({
    time: check.time,
    state: check.name,
    leadProgress,
    minFaceSize: minFaceSize === Infinity ? 0 : minFaceSize,
    maxFaceSize,
    minY: minY === Infinity ? 0 : minY,
    maxY: maxY === -Infinity ? 0 : maxY,
    horsesInLaneArea,
  });
}

console.log("시각(초)  상태              선두%    최소얼굴  최대얼굴  Y범위(px)        레인영역내");
console.log("─".repeat(90));

for (const check of stateChecks) {
  const time = check.time.toFixed(1).padStart(6);
  const state = check.state.padEnd(18);
  const prog = `${(check.leadProgress * 100).toFixed(1)}%`.padStart(6);
  const minFace = check.minFaceSize.toFixed(1).padStart(8);
  const maxFace = check.maxFaceSize.toFixed(1).padStart(8);
  const yRange = `${check.minY.toFixed(0)}-${check.maxY.toFixed(0)}`.padEnd(15);
  const inArea = `${check.horsesInLaneArea}/8`;
  
  const faceOk = check.minFaceSize >= MIN_FACE_SIZE_PX ? "✓" : "✗";
  const areaOk = check.horsesInLaneArea >= 6 ? "✓" : "◐";
  
  console.log(`${time}    ${state} ${prog}  ${minFace}px ${faceOk}  ${maxFace}px  ${yRange} ${inArea} ${areaOk}`);
}

console.log("\n=== 검증 요약 ===");
const allFacesOk = stateChecks.every(c => c.minFaceSize >= MIN_FACE_SIZE_PX);
const allAreasOk = stateChecks.every(c => c.horsesInLaneArea >= 6);

console.log(`얼굴 크기: ${allFacesOk ? "✅" : "⚠️"} ${allFacesOk ? "모든 상태에서 24px 이상" : "일부 상태에서 24px 미만"}`);
console.log(`레인 영역: ${allAreasOk ? "✅" : "⚠️"} ${allAreasOk ? "대부분의 말이 15~80% 영역 내" : "일부 말이 영역 밖"}`);
