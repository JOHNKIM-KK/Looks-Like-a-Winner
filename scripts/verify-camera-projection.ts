#!/usr/bin/env node
/**
 * 카메라 프로젝션 검증 스크립트
 * 
 * 카메라가 레인 영역 내에서 트랙을 올바르게 보여주는지 확인합니다.
 */

function verifyCameraProjection() {
  const GAME_WIDTH = 540;
  const GAME_HEIGHT = 1170;
  const LANE_AREA_TOP = 0.15;
  const LANE_AREA_BOTTOM = 0.80;

  // track.ts의 설정값
  const INNER_RADIUS = 200;
  const LANE_GAP = 58;
  const CENTER_X = 270;
  const CENTER_Y = 555;
  const FAR_SCALE = 0.72;

  const laneAreaTopPx = GAME_HEIGHT * LANE_AREA_TOP;
  const laneAreaBottomPx = GAME_HEIGHT * LANE_AREA_BOTTOM;
  const laneAreaHeight = laneAreaBottomPx - laneAreaTopPx;

  console.log('🎥 카메라 프로젝션 검증');
  console.log('=====================================');
  console.log(`게임 해상도: ${GAME_WIDTH}x${GAME_HEIGHT}`);
  console.log(`레인 영역: ${laneAreaTopPx}px ~ ${laneAreaBottomPx}px (높이: ${laneAreaHeight}px)`);
  console.log('');

  // 트랙 경계 계산 (4레인 기준)
  const maxLanes = 4;
  const outerRadius = INNER_RADIUS + (maxLanes - 1) * LANE_GAP;

  // 프로젝션 테스트: 트랙의 최상단과 최하단 Y 좌표
  const convergeMin = 0.85;
  const convergeMax = 1.0;

  // 가장 먼 지점 (y = -outerRadius, 화면 상단에 보임)
  const farY = CENTER_Y - (-outerRadius) * 0.65;
  // 가장 가까운 지점 (y = outerRadius, 화면 하단에 보임)
  const nearY = CENTER_Y - outerRadius * 0.65;

  // 화면에서는 farY가 nearY보다 작아야 함 (Y축이 아래로 증가)
  const topY = Math.min(farY, nearY);
  const bottomY = Math.max(farY, nearY);

  console.log('프로젝션 테스트:');
  console.log(`  트랙 최상단 Y: ${topY.toFixed(1)}px`);
  console.log(`  트랙 최하단 Y: ${bottomY.toFixed(1)}px`);
  console.log(`  트랙 높이: ${(bottomY - topY).toFixed(1)}px`);
  console.log('');

  const trackInLaneArea = topY >= laneAreaTopPx && bottomY <= laneAreaBottomPx;

  if (trackInLaneArea) {
    console.log('✅ 트랙이 레인 영역(15~80%) 내에 완전히 들어갑니다.');
    console.log(`   상단 여백: ${(topY - laneAreaTopPx).toFixed(1)}px`);
    console.log(`   하단 여백: ${(laneAreaBottomPx - bottomY).toFixed(1)}px`);
  } else {
    if (topY < laneAreaTopPx) {
      console.log(`⚠️  트랙 상단이 레인 영역을 ${(laneAreaTopPx - topY).toFixed(1)}px 벗어났습니다.`);
    }
    if (bottomY > laneAreaBottomPx) {
      console.log(`⚠️  트랙 하단이 레인 영역을 ${(bottomY - laneAreaBottomPx).toFixed(1)}px 벗어났습니다.`);
    }
  }

  console.log('');
  console.log('카메라 설정:');
  console.log(`  중심 X: ${CENTER_X}px (화면 중앙: ${GAME_WIDTH / 2}px)`);
  console.log(`  중심 Y: ${CENTER_Y}px (레인 중앙: ${(laneAreaTopPx + laneAreaBottomPx) / 2}px)`);
  console.log(`  수평 컨버전스: ${convergeMin} ~ ${convergeMax}`);
  console.log(`  수직 스케일: 0.65`);
  console.log('');
  console.log('✅ 검증 완료');
}

verifyCameraProjection();
process.exit(0);
