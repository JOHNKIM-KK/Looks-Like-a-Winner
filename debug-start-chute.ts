import { sampleChuteLogical, getCameraDepth, projectWithCamera } from "./game/track";
import { getCameraForState } from "./game/cameraState";

const chuteOuterLogical = sampleChuteLogical(laneRadius(8) + 28, 24);
const chuteInnerLogical = sampleChuteLogical(Math.max(70, laneRadius(1) - 34), 24);

function laneRadius(lane: number) {
  const INNER_RADIUS = 256;
  const LANE_GAP = 58;
  return INNER_RADIUS + (lane - 1) * LANE_GAP;
}

const startCamera = getCameraForState(
  { name: "START" },
  {
    raceTime: 0,
    started: false,
    gateOpen: 0,
    leadProgress: 0,
    horses: [],
  },
  0,
  -400
);

console.log("START Camera:", startCamera);
console.log("\nChute Outer Points:");

chuteOuterLogical.forEach((point, i) => {
  const depth = getCameraDepth(point, startCamera);
  const proj = projectWithCamera({ x: point.x, y: point.y, tx: 0, ty: 0 }, startCamera);
  console.log(
    `[${i}] logical: (${point.x.toFixed(0)}, ${point.y.toFixed(0)}) depth: ${depth.toFixed(1)} visible: ${proj.visible} screen: (${proj.x.toFixed(0)}, ${proj.y.toFixed(0)})`
  );
});

console.log("\nChute Inner Points:");
chuteInnerLogical.forEach((point, i) => {
  const depth = getCameraDepth(point, startCamera);
  const proj = projectWithCamera({ x: point.x, y: point.y, tx: 0, ty: 0 }, startCamera);
  console.log(
    `[${i}] logical: (${point.x.toFixed(0)}, ${point.y.toFixed(0)}) depth: ${depth.toFixed(1)} visible: ${proj.visible} screen: (${proj.x.toFixed(0)}, ${proj.y.toFixed(0)})`
  );
});
