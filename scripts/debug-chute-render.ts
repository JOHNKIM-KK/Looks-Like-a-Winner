import { projectWithCamera, laneRadius, sampleChuteLogical, type Camera } from "@/game/track";

const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;

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

const outerLane = 8;
const chuteOuterLogical = sampleChuteLogical(laneRadius(outerLane) + 28, 24);
const chuteInnerLogical = sampleChuteLogical(Math.max(70, laneRadius(1) - 34), 24);

console.log(`Total chute points sampled:`);
console.log(`  Outer: ${chuteOuterLogical.length}`);
console.log(`  Inner: ${chuteInnerLogical.length}`);

const chuteOuter = chuteOuterLogical.map(p => projectWithCamera({ x: p.x, y: p.y, tx: 0, ty: 0 }, camera));
const chuteInner = chuteInnerLogical.map(p => projectWithCamera({ x: p.x, y: p.y, tx: 0, ty: 0 }, camera));

const chuteOuterVisible = chuteOuter.filter(p => p.visible);
const chuteInnerVisible = chuteInner.filter(p => p.visible);

console.log(`\nAfter projection:`);
console.log(`  Outer total: ${chuteOuter.length}, visible: ${chuteOuterVisible.length}`);
console.log(`  Inner total: ${chuteInner.length}, visible: ${chuteInnerVisible.length}`);

console.log(`\nRendering condition check:`);
console.log(`  chuteOuterVisible.length > 1: ${chuteOuterVisible.length > 1}`);
console.log(`  chuteInnerVisible.length > 1: ${chuteInnerVisible.length > 1}`);
console.log(`  Both conditions met: ${chuteOuterVisible.length > 1 && chuteInnerVisible.length > 1}`);

if (chuteOuterVisible.length > 1 && chuteInnerVisible.length > 1) {
  console.log(`\n✅ Chute should render (${chuteOuterVisible.length} outer + ${chuteInnerVisible.length} inner visible points)`);
} else {
  console.log(`\n❌ Chute won't render - not enough visible points`);
}
