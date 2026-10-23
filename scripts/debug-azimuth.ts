import { projectWithCamera, type Camera } from "@/game/track";

const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;
const SCREEN_CENTER_X = GAME_WIDTH / 2;
const SCREEN_CENTER_Y = GAME_HEIGHT * 0.474;

function testLookAt(name: string, targetX: number, targetY: number, distance: number, azimuthDeg: number, elevationDeg: number, focalLength: number) {
  const azimuthRad = azimuthDeg * (Math.PI / 180);
  const elevationRad = elevationDeg * (Math.PI / 180);
  
  const groundX = targetX - distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
  const groundY = targetY - distance * Math.cos(elevationRad) * Math.cos(azimuthRad);
  const height = distance * Math.sin(elevationRad);
  
  const dx = targetX - groundX;
  const dy = targetY - groundY;
  const dz = 0 - height;
  
  const yaw = Math.atan2(dx, dy);
  const horizontalDist = Math.hypot(dx, dy);
  const pitch = Math.atan2(-dz, horizontalDist);
  
  const camera: Camera = { groundX, groundY, height, pitch, yaw, focalLength };
  
  console.log(`\n${name}:`);
  console.log(`  타겟: (${targetX}, ${targetY})`);
  console.log(`  파라미터: distance=${distance} azimuth=${azimuthDeg}° elevation=${elevationDeg}° focal=${focalLength}`);
  console.log(`  계산된 camera:`);
  console.log(`    ground=(${groundX.toFixed(1)}, ${groundY.toFixed(1)}) height=${height.toFixed(1)}`);
  console.log(`    pitch=${(pitch * 180 / Math.PI).toFixed(1)}° yaw=${(yaw * 180 / Math.PI).toFixed(1)}°`);
  
  const projected = projectWithCamera({ x: targetX, y: targetY, tx: 0, ty: 0 }, camera);
  const errorX = Math.abs(projected.x - SCREEN_CENTER_X);
  const errorY = Math.abs(projected.y - SCREEN_CENTER_Y);
  
  console.log(`  투영: (${projected.x.toFixed(1)}, ${projected.y.toFixed(1)})`);
  console.log(`  오차: (${errorX.toFixed(1)}, ${errorY.toFixed(1)})px - ${errorX <= 10 && errorY <= 10 ? "✅ PASS" : "❌ FAIL"}`);
  
  return { camera, projected, errorX, errorY };
}

console.log("=== lookAt 함수 디버깅 ===\n");
console.log(`화면: ${GAME_WIDTH}x${GAME_HEIGHT}, 중심: (${SCREEN_CENTER_X}, ${SCREEN_CENTER_Y.toFixed(1)})`);

testLookAt("정면 (azimuth=0)", 0, 0, 300, 0, 20, 1000);
testLookAt("측면 (azimuth=90)", 0, 0, 300, 90, 20, 1000);
testLookAt("대각 (azimuth=45)", 867, -459, 500, 45, 32, 850);
testLookAt("대각 (azimuth=-45)", -1057, -285, 350, -45, 28, 990);

console.log("\n=== 방위각 범위 테스트 ===\n");
for (let az = 0; az <= 360; az += 45) {
  testLookAt(`azimuth=${az}°`, 0, 0, 300, az, 20, 1000);
}

console.log("\n=== 완료 ===");
