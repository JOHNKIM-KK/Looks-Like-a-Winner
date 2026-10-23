import { sampleChuteLogical, getCameraDepth, projectWithCamera } from "./game/track";
import { getCameraForState } from "./game/cameraState";

function laneRadius(lane: number) {
  const INNER_RADIUS = 256;
  const LANE_GAP = 58;
  return INNER_RADIUS + (lane - 1) * LANE_GAP;
}

const chuteOuterLogical = sampleChuteLogical(laneRadius(8) + 28, 24);
const chuteInnerLogical = sampleChuteLogical(Math.max(70, laneRadius(1) - 34), 24);

const packCenterX = 867;
const packCenterY = -459;

const startCamera = getCameraForState(
  { name: "START" },
  {
    raceTime: 0,
    started: false,
    gateOpen: 0,
    leadProgress: 0,
    horses: [],
  },
  packCenterX,
  packCenterY
);

console.log("START Camera with correct pack center:");
console.log(`  groundX: ${startCamera.groundX.toFixed(1)}, groundY: ${startCamera.groundY.toFixed(1)}`);
console.log(`  height: ${startCamera.height.toFixed(1)}`);
console.log(`  pitch: ${(startCamera.pitch * 180 / Math.PI).toFixed(1)}°, yaw: ${(startCamera.yaw * 180 / Math.PI).toFixed(1)}°`);

console.log("\nChute Outer sample points:");
for (let i = 0; i < 5; i++) {
  const point = chuteOuterLogical[i];
  if (point) {
    const depth = getCameraDepth(point, startCamera);
    const proj = projectWithCamera({ x: point.x, y: point.y, tx: 0, ty: 0 }, startCamera);
    console.log(
      `  [${i}] screen: (${proj.x.toFixed(0)}, ${proj.y.toFixed(0)}) visible: ${proj.visible}`
    );
  }
}

console.log("\nChute Inner sample points:");
for (let i = 0; i < 5; i++) {
  const point = chuteInnerLogical[i];
  if (point) {
    const depth = getCameraDepth(point, startCamera);
    const proj = projectWithCamera({ x: point.x, y: point.y, tx: 0, ty: 0 }, startCamera);
    console.log(
      `  [${i}] screen: (${proj.x.toFixed(0)}, ${proj.y.toFixed(0)}) visible: ${proj.visible}`
    );
  }
}
