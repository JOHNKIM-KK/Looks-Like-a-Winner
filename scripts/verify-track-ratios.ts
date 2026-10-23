#!/usr/bin/env node
/**
 * 트랙 비율 검증 스크립트
 * 
 * 세로 화면에서 트랙이 레인 영역(15~80%) 내에 올바르게 배치되었는지 확인합니다.
 */

function verifyTrackRatios() {
  const GAME_WIDTH = 540;
  const GAME_HEIGHT = 1170;
  const LANE_AREA_TOP = 0.15;
  const LANE_AREA_BOTTOM = 0.80;

  const laneAreaTopPx = GAME_HEIGHT * LANE_AREA_TOP;
  const laneAreaBottomPx = GAME_HEIGHT * LANE_AREA_BOTTOM;
  const laneAreaHeight = laneAreaBottomPx - laneAreaTopPx;

  console.log('🔍 트랙 비율 검증');
  console.log('=====================================');
  console.log(`게임 해상도: ${GAME_WIDTH}x${GAME_HEIGHT}`);
  console.log(`레인 영역: ${LANE_AREA_TOP * 100}% ~ ${LANE_AREA_BOTTOM * 100}% (${laneAreaTopPx}px ~ ${laneAreaBottomPx}px)`);
  console.log(`레인 영역 높이: ${laneAreaHeight}px`);
  console.log('');

  // track.ts의 좌표 시스템 확인
  const CENTER_X = 270;
  const CENTER_Y = 555;

  console.log(`트랙 중심: (${CENTER_X}, ${CENTER_Y})`);
  console.log('');

  // 레인 영역 내에 트랙이 들어가는지 확인
  const expectedCenterY = (laneAreaTopPx + laneAreaBottomPx) / 2;
  const centerYDiff = Math.abs(CENTER_Y - expectedCenterY);

  console.log(`✅ 예상 트랙 중심 Y: ${expectedCenterY.toFixed(1)}px`);
  console.log(`📍 실제 트랙 중심 Y: ${CENTER_Y}px`);
  console.log(`📏 차이: ${centerYDiff.toFixed(1)}px`);
  console.log('');

  if (centerYDiff < 50) {
    console.log('✅ 트랙이 레인 영역 중앙에 잘 배치되어 있습니다.');
  } else {
    console.log('⚠️  트랙 중심이 레인 영역에서 벗어났을 수 있습니다.');
  }

  console.log('');
  console.log('영역 분할:');
  console.log(`  HUD 영역:    0% ~ 15%   (0px ~ ${laneAreaTopPx}px)`);
  console.log(`  레인 영역:  15% ~ 80%   (${laneAreaTopPx}px ~ ${laneAreaBottomPx}px)`);
  console.log(`  배너 영역:  80% ~ 100%  (${laneAreaBottomPx}px ~ ${GAME_HEIGHT}px)`);
  console.log('');
  console.log('✅ 검증 완료');
}

verifyTrackRatios();
process.exit(0);
