import { projectWithCamera, type Camera } from "@/game/track";

const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;
const SCREEN_CENTER_X = GAME_WIDTH / 2;
const SCREEN_CENTER_Y = GAME_HEIGHT * 0.474;

console.log("=== projectWithCamera 역계산 ===\n");
console.log("목표: 타겟 (tx, ty)가 화면 중심 (270, 554.6)에 투영되도록 카메라 설정\n");

console.log("projectWithCamera 수식:");
console.log("  dx = logical.x - camera.groundX");
console.log("  dy = logical.y - camera.groundY");
console.log("  localX = dx * cos(yaw) + dy * sin(yaw)");
console.log("  localY = -dx * sin(yaw) + dy * cos(yaw)");
console.log("  camDepth = localY * cos(pitch) - (-height) * sin(pitch)");
console.log("  screenX = CENTER_X - (focalLength * localX) / camDepth");
console.log("  camVertical = localY * sin(pitch) + (-height) * cos(pitch)");
console.log("  screenY = CENTER_Y - (focalLength * camVertical) / camDepth\n");

console.log("screenX = CENTER_X가 되려면:");
console.log("  localX = 0");
console.log("  dx * cos(yaw) + dy * sin(yaw) = 0");
console.log("  tan(yaw) = -dx / dy");
console.log("  yaw = atan2(-dx, dy)\n");

console.log("screenY = CENTER_Y가 되려면:");
console.log("  camVertical = 0");
console.log("  localY * sin(pitch) + (-height) * cos(pitch) = 0");
console.log("  localY * sin(pitch) = height * cos(pitch)");
console.log("  tan(pitch) = height / localY\n");

console.log("=== 테스트 1: azimuth=0° (카메라가 타겟 남쪽) ===\n");

const targetX = 0;
const targetY = 0;
const distance = 300;
const azimuthRad = 0;
const elevationRad = 20 * Math.PI / 180;

const groundX = targetX - distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
const groundY = targetY - distance * Math.cos(elevationRad) * Math.cos(azimuthRad);
const height = distance * Math.sin(elevationRad);

console.log(`타겟: (${targetX}, ${targetY})`);
console.log(`카메라 ground: (${groundX.toFixed(1)}, ${groundY.toFixed(1)})`);
console.log(`카메라 height: ${height.toFixed(1)}`);

const dx = targetX - groundX;
const dy = targetY - groundY;

console.log(`dx = ${dx.toFixed(1)}, dy = ${dy.toFixed(1)}`);

const yawCorrect = Math.atan2(-dx, dy);
console.log(`yaw (올바른) = atan2(-dx, dy) = ${(yawCorrect * 180 / Math.PI).toFixed(1)}°`);

const horizontalDist = Math.hypot(dx, dy);
console.log(`horizontalDist = ${horizontalDist.toFixed(1)}`);

const cosYaw = Math.cos(yawCorrect);
const sinYaw = Math.sin(yawCorrect);
const localX = dx * cosYaw + dy * sinYaw;
const localY = -dx * sinYaw + dy * cosYaw;

console.log(`localX = ${localX.toFixed(3)} (should be 0)`);
console.log(`localY = ${localY.toFixed(1)} (should be ${horizontalDist.toFixed(1)})`);

const pitchCorrect = Math.atan2(height, localY);
console.log(`pitch (올바른) = atan2(height, localY) = ${(pitchCorrect * 180 / Math.PI).toFixed(1)}°`);

const cosPitch = Math.cos(pitchCorrect);
const sinPitch = Math.sin(pitchCorrect);
const camDepth = localY * cosPitch - (-height) * sinPitch;
const camVertical = localY * sinPitch + (-height) * cosPitch;

console.log(`camDepth = ${camDepth.toFixed(1)}`);
console.log(`camVertical = ${camVertical.toFixed(3)} (should be 0)`);

const focalLength = 1000;
const screenX = SCREEN_CENTER_X - (focalLength * localX) / camDepth;
const screenY = SCREEN_CENTER_Y - (focalLength * camVertical) / camDepth;

console.log(`\n투영: (${screenX.toFixed(1)}, ${screenY.toFixed(1)})`);
console.log(`오차: (${Math.abs(screenX - SCREEN_CENTER_X).toFixed(1)}, ${Math.abs(screenY - SCREEN_CENTER_Y).toFixed(1)})px`);

console.log("\n=== 테스트 2: azimuth=90° (카메라가 타겟 서쪽) ===\n");

const azimuthRad2 = 90 * Math.PI / 180;
const groundX2 = targetX - distance * Math.cos(elevationRad) * Math.sin(azimuthRad2);
const groundY2 = targetY - distance * Math.cos(elevationRad) * Math.cos(azimuthRad2);
const height2 = distance * Math.sin(elevationRad);

console.log(`타겟: (${targetX}, ${targetY})`);
console.log(`카메라 ground: (${groundX2.toFixed(1)}, ${groundY2.toFixed(1)})`);
console.log(`카메라 height: ${height2.toFixed(1)}`);

const dx2 = targetX - groundX2;
const dy2 = targetY - groundY2;

console.log(`dx = ${dx2.toFixed(1)}, dy = ${dy2.toFixed(1)}`);

const yawCorrect2 = Math.atan2(-dx2, dy2);
console.log(`yaw (올바른) = atan2(-dx, dy) = ${(yawCorrect2 * 180 / Math.PI).toFixed(1)}°`);

const horizontalDist2 = Math.hypot(dx2, dy2);
const localX2 = dx2 * Math.cos(yawCorrect2) + dy2 * Math.sin(yawCorrect2);
const localY2 = -dx2 * Math.sin(yawCorrect2) + dy2 * Math.cos(yawCorrect2);

console.log(`localX = ${localX2.toFixed(3)} (should be 0)`);
console.log(`localY = ${localY2.toFixed(1)} (should be ${horizontalDist2.toFixed(1)})`);

const pitchCorrect2 = Math.atan2(height2, localY2);
console.log(`pitch = atan2(height, localY) = ${(pitchCorrect2 * 180 / Math.PI).toFixed(1)}°`);

const camDepth2 = localY2 * Math.cos(pitchCorrect2) - (-height2) * Math.sin(pitchCorrect2);
const camVertical2 = localY2 * Math.sin(pitchCorrect2) + (-height2) * Math.cos(pitchCorrect2);

console.log(`camDepth = ${camDepth2.toFixed(1)}`);
console.log(`camVertical = ${camVertical2.toFixed(3)} (should be 0)`);

const screenX2 = SCREEN_CENTER_X - (focalLength * localX2) / camDepth2;
const screenY2 = SCREEN_CENTER_Y - (focalLength * camVertical2) / camDepth2;

console.log(`\n투영: (${screenX2.toFixed(1)}, ${screenY2.toFixed(1)})`);
console.log(`오차: (${Math.abs(screenX2 - SCREEN_CENTER_X).toFixed(1)}, ${Math.abs(screenY2 - SCREEN_CENTER_Y).toFixed(1)})px`);

console.log("\n=== 완료 ===");
