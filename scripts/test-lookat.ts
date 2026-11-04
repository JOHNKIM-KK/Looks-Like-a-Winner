import { projectWithCamera, type Camera } from "@/game/track";

const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;
const SCREEN_CENTER_X = GAME_WIDTH / 2;
const SCREEN_CENTER_Y = GAME_HEIGHT * 0.474;

console.log("=== lookAt 투영 단위 테스트 ===\n");
console.log(`화면 크기: ${GAME_WIDTH}x${GAME_HEIGHT}`);
console.log(`화면 중심: (${SCREEN_CENTER_X}, ${SCREEN_CENTER_Y.toFixed(1)})\n`);

function testLookAt(name: string, camera: Camera, targetX: number, targetY: number) {
  const projected = projectWithCamera({ x: targetX, y: targetY, tx: 0, ty: 0 }, camera);
  
  const errorX = Math.abs(projected.x - SCREEN_CENTER_X);
  const errorY = Math.abs(projected.y - SCREEN_CENTER_Y);
  const passX = errorX <= 10;
  const passY = errorY <= 10;
  
  console.log(`${name}:`);
  console.log(`  타겟 logical: (${targetX}, ${targetY})`);
  console.log(`  투영 screen: (${projected.x.toFixed(1)}, ${projected.y.toFixed(1)})`);
  console.log(`  오차: (${errorX.toFixed(1)}, ${errorY.toFixed(1)})px`);
  console.log(`  결과: ${passX && passY ? "✅ PASS" : "❌ FAIL"}`);
  console.log();
  
  return { passX, passY, projected };
}

// Test 1: START
const startCamera: Camera = {
  groundX: 650,
  groundY: -1050,
  height: 450,
  pitch: 35 * Math.PI / 180,
  yaw: 0,
  focalLength: 850,
};
testLookAt("START", startCamera, 650, -700);

// Test 2: STRAIGHT
const straightCamera: Camera = {
  groundX: 0,
  groundY: -300,
  height: 280,
  pitch: 12 * Math.PI / 180,
  yaw: 0,
  focalLength: 1100,
};
testLookAt("STRAIGHT", straightCamera, 0, 0);

// Test 3: CORNER_IN
const cornerInCamera: Camera = {
  groundX: -200,
  groundY: -600,
  height: 580,
  pitch: 24 * Math.PI / 180,
  yaw: -42 * Math.PI / 180,
  focalLength: 990,
};
testLookAt("CORNER_IN", cornerInCamera, -600, -250);

console.log("=== 역계산: 화면 중심에 타겟을 투영하려면 ===\n");

// 역으로, 화면 중심으로 투영되는 카메라를 계산
function computeLookAtCamera(
  targetX: number,
  targetY: number,
  distance: number,
  azimuthDeg: number,
  elevationDeg: number,
  focalLength: number
): Camera {
  const azimuthRad = azimuthDeg * (Math.PI / 180);
  const elevationRad = elevationDeg * (Math.PI / 180);
  
  // 카메라 위치
  const groundX = targetX - distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
  const groundY = targetY - distance * Math.cos(elevationRad) * Math.cos(azimuthRad);
  const height = distance * Math.sin(elevationRad);
  
  // 타겟을 바라보는 방향
  const dx = targetX - groundX;
  const dy = targetY - groundY;
  const dz = 0 - height;
  
  const yaw = Math.atan2(dx, dy);
  const horizontalDist = Math.hypot(dx, dy);
  const pitch = Math.atan2(-dz, horizontalDist);
  
  return { groundX, groundY, height, pitch, yaw, focalLength };
}

// START 테스트
console.log("START 테스트 (타겟: 650, -700):");
const startTest = computeLookAtCamera(650, -700, 450, 0, 35, 850);
console.log(`  camera: ground=(${startTest.groundX.toFixed(1)}, ${startTest.groundY.toFixed(1)}) height=${startTest.height.toFixed(1)}`);
console.log(`  pitch=${(startTest.pitch * 180 / Math.PI).toFixed(1)}° yaw=${(startTest.yaw * 180 / Math.PI).toFixed(1)}°`);
const startProj = testLookAt("  투영 결과", startTest, 650, -700);

console.log("\n=== 검증 완료 ===");
