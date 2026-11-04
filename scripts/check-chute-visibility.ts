import { projectWithCamera, laneRadius, sampleChuteLogical, type Camera } from "@/game/track";

const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;
const CENTER_X = GAME_WIDTH / 2;
const CENTER_Y = GAME_HEIGHT * 0.474;

function cameraLookAt(
  targetX: number,
  targetY: number,
  distance: number,
  azimuth: number,
  elevation: number,
  focalLength: number
): Camera {
  const azimuthRad = azimuth * (Math.PI / 180);
  const elevationRad = elevation * (Math.PI / 180);
  
  const groundX = targetX - distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
  const groundY = targetY - distance * Math.cos(elevationRad) * Math.cos(azimuthRad);
  const height = distance * Math.sin(elevationRad);
  
  const dx = targetX - groundX;
  const dy = targetY - groundY;
  const dz = 0 - height;
  
  const yaw = Math.atan2(-dx, dy);
  const horizontalDist = Math.hypot(dx, dy);
  const pitch = Math.atan2(-dz, horizontalDist);
  
  return { groundX, groundY, height, pitch, yaw, focalLength };
}

console.log("=== Checking chute visibility for START camera ===\n");

const azimuth = 32;
const elevation = 15;
const distance = 650;
const focalLength = 1000;
const packCenterX = 867.0;
const packCenterY = -459.0;
const targetYOffset = -100;

const camera = cameraLookAt(
  packCenterX,
  packCenterY + targetYOffset,
  distance,
  azimuth,
  elevation,
  focalLength
);

console.log(`Camera: azimuth=${azimuth}°, elevation=${elevation}°, distance=${distance}`);
console.log(`Target: (${packCenterX}, ${(packCenterY + targetYOffset).toFixed(1)})`);
console.log(`Camera position: (${camera.groundX.toFixed(1)}, ${camera.groundY.toFixed(1)}, ${camera.height.toFixed(1)})`);
console.log();

// Check chute outer and inner
const outerLane = 8;
const chuteOuterLogical = sampleChuteLogical(laneRadius(outerLane) + 28, 24);
const chuteInnerLogical = sampleChuteLogical(Math.max(70, laneRadius(1) - 34), 24);

console.log("Chute outer sample points:");
let chuteOuterVisible = 0;
for (let i = 0; i < chuteOuterLogical.length; i += 6) {
  const point = chuteOuterLogical[i];
  if (point) {
    const projected = projectWithCamera({ x: point.x, y: point.y, tx: 0, ty: 0 }, camera);
    const inside = projected.visible && 
      projected.x >= 0 && projected.x <= GAME_WIDTH && 
      projected.y >= 0 && projected.y <= GAME_HEIGHT;
    if (inside) chuteOuterVisible++;
    console.log(`  [${i}] logical: (${point.x.toFixed(0)}, ${point.y.toFixed(0)}) -> screen: (${projected.x.toFixed(0)}, ${projected.y.toFixed(0)}) ${inside ? '✓' : '✗'}`);
  }
}

console.log("\nChute inner sample points:");
let chuteInnerVisible = 0;
for (let i = 0; i < chuteInnerLogical.length; i += 6) {
  const point = chuteInnerLogical[i];
  if (point) {
    const projected = projectWithCamera({ x: point.x, y: point.y, tx: 0, ty: 0 }, camera);
    const inside = projected.visible && 
      projected.x >= 0 && projected.x <= GAME_WIDTH && 
      projected.y >= 0 && projected.y <= GAME_HEIGHT;
    if (inside) chuteInnerVisible++;
    console.log(`  [${i}] logical: (${point.x.toFixed(0)}, ${point.y.toFixed(0)}) -> screen: (${projected.x.toFixed(0)}, ${projected.y.toFixed(0)}) ${inside ? '✓' : '✗'}`);
  }
}

console.log(`\nSummary:`);
console.log(`  Chute outer visible: ${chuteOuterVisible}/${Math.ceil(chuteOuterLogical.length / 6)}`);
console.log(`  Chute inner visible: ${chuteInnerVisible}/${Math.ceil(chuteInnerLogical.length / 6)}`);

if (chuteOuterVisible === 0 && chuteInnerVisible === 0) {
  console.log(`\n❌ No chute points are visible on screen - track surface won't render at START`);
} else {
  console.log(`\n✅ Some chute points are visible - track surface should render`);
}
