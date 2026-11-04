#!/usr/bin/env node
/**
 * 세로 화면 레이아웃 검증
 * 트랙이 레인 영역(15~80%) 내에 올바르게 배치되었는지 확인
 */

import { poseAt, laneRadius, createDefaultCamera, projectWithCamera, INNER_RADIUS, LANE_GAP } from "../game/track";

const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;
const LANE_AREA_TOP = 0.15;
const LANE_AREA_BOTTOM = 0.80;

const laneAreaTopPx = GAME_HEIGHT * LANE_AREA_TOP;
const laneAreaBottomPx = GAME_HEIGHT * LANE_AREA_BOTTOM;
const laneAreaHeight = laneAreaBottomPx - laneAreaTopPx;

console.log('🔍 세로 화면 레이아웃 검증');
console.log('=====================================');
console.log(`게임 해상도: ${GAME_WIDTH}x${GAME_HEIGHT}`);
console.log(`레인 영역: ${LANE_AREA_TOP * 100}% ~ ${LANE_AREA_BOTTOM * 100}%`);
console.log(`레인 영역 픽셀: ${laneAreaTopPx.toFixed(1)}px ~ ${laneAreaBottomPx.toFixed(1)}px`);
console.log(`레인 영역 높이: ${laneAreaHeight.toFixed(1)}px`);
console.log('');

// 트랙의 모든 점을 샘플링하여 바운딩 박스 계산
const camera = createDefaultCamera();
let minX = Infinity;
let maxX = -Infinity;
let minY = Infinity;
let maxY = -Infinity;

const progressSteps = 20;
const lanes = [1, 2, 3, 4, 5, 6, 7, 8];

for (const lane of lanes) {
  for (let i = 0; i <= progressSteps; i++) {
    const progress = i / progressSteps;
    const pose = poseAt(progress, lane);
    
    if (pose.visible) {
      minX = Math.min(minX, pose.x);
      maxX = Math.max(maxX, pose.x);
      minY = Math.min(minY, pose.y);
      maxY = Math.max(maxY, pose.y);
    }
  }
}

console.log('트랙 바운딩 박스:');
console.log(`  X: ${minX.toFixed(1)}px ~ ${maxX.toFixed(1)}px (너비: ${(maxX - minX).toFixed(1)}px)`);
console.log(`  Y: ${minY.toFixed(1)}px ~ ${maxY.toFixed(1)}px (높이: ${(maxY - minY).toFixed(1)}px)`);
console.log('');

// 레인 영역과 비교
const trackInLaneArea = minY >= laneAreaTopPx && maxY <= laneAreaBottomPx;

if (trackInLaneArea) {
  const topMargin = minY - laneAreaTopPx;
  const bottomMargin = laneAreaBottomPx - maxY;
  
  console.log('✅ 트랙이 레인 영역(15~80%) 내에 완전히 들어갑니다.');
  console.log(`   상단 여백: ${topMargin.toFixed(1)}px`);
  console.log(`   하단 여백: ${bottomMargin.toFixed(1)}px`);
  console.log('');
  
  // 영역 활용도 계산
  const trackHeight = maxY - minY;
  const utilization = (trackHeight / laneAreaHeight) * 100;
  console.log(`   레인 영역 활용도: ${utilization.toFixed(1)}%`);
} else {
  console.log('❌ 트랙이 레인 영역을 벗어났습니다.');
  
  if (minY < laneAreaTopPx) {
    console.log(`   ⚠️  트랙 상단이 ${(laneAreaTopPx - minY).toFixed(1)}px 위로 벗어남`);
  }
  if (maxY > laneAreaBottomPx) {
    console.log(`   ⚠️  트랙 하단이 ${(maxY - laneAreaBottomPx).toFixed(1)}px 아래로 벗어남`);
  }
  console.log('');
}

// 카메라 파라미터 출력
console.log('카메라 설정:');
console.log(`  groundY: ${camera.groundY}`);
console.log(`  height: ${camera.height}`);
console.log(`  pitch: ${(camera.pitch * 180 / Math.PI).toFixed(2)}°`);
console.log(`  focalLength: ${camera.focalLength}`);
console.log('');

console.log('영역 분할:');
console.log(`  HUD 영역:    0% ~ 15%   (0px ~ ${laneAreaTopPx.toFixed(1)}px)`);
console.log(`  레인 영역:  15% ~ 80%   (${laneAreaTopPx.toFixed(1)}px ~ ${laneAreaBottomPx.toFixed(1)}px)`);
console.log(`  배너 영역:  80% ~ 100%  (${laneAreaBottomPx.toFixed(1)}px ~ ${GAME_HEIGHT}px)`);
console.log('');

if (trackInLaneArea) {
  console.log('✅ 검증 완료: 레이아웃이 요구사항을 충족합니다.');
  process.exit(0);
} else {
  console.log('❌ 검증 실패: 레이아웃 조정이 필요합니다.');
  process.exit(1);
}
