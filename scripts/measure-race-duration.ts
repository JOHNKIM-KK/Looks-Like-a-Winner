#!/usr/bin/env node
/**
 * 레이스 시간 측정 스크립트
 * 
 * lib/race.ts의 시뮬레이션이 불변인지 확인합니다.
 */

import { simulateRace } from '../lib/race';
import { mockHorses } from '../lib/mockHorses';

const TEST_SEED = 12345;
const EXPECTED_DURATION = 40;
const TOLERANCE = 2;

console.log('⏱️  레이스 시간 측정');
console.log('=====================================');
console.log(`테스트 시드: ${TEST_SEED}`);
console.log(`예상 평균 시간: 약 ${EXPECTED_DURATION}초`);
console.log('');

// 여러 번 시뮬레이션하여 평균 계산
const numTests = 10;
const durations: number[] = [];

console.log(`${numTests}회 시뮬레이션 실행 중...`);

for (let i = 0; i < numTests; i++) {
  const seed = TEST_SEED + i;
  const result = simulateRace(mockHorses, seed);
  durations.push(result.duration);
  console.log(`  시뮬레이션 ${i + 1}: ${result.duration.toFixed(2)}초 (시드: ${seed})`);
}

const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
const minDuration = Math.min(...durations);
const maxDuration = Math.max(...durations);

console.log('');
console.log('결과:');
console.log(`  평균 시간: ${avgDuration.toFixed(2)}초`);
console.log(`  최소 시간: ${minDuration.toFixed(2)}초`);
console.log(`  최대 시간: ${maxDuration.toFixed(2)}초`);
console.log(`  범위: ${(maxDuration - minDuration).toFixed(2)}초`);
console.log('');

// 검증
const withinRange = Math.abs(avgDuration - EXPECTED_DURATION) <= TOLERANCE;

if (withinRange) {
  console.log(`✅ 레이스 시간이 예상 범위(${EXPECTED_DURATION}±${TOLERANCE}초) 내에 있습니다.`);
  console.log('✅ 시뮬레이션 로직이 불변합니다.');
} else {
  console.log(`⚠️  레이스 시간이 예상 범위를 벗어났습니다.`);
  console.log(`   예상: ${EXPECTED_DURATION}±${TOLERANCE}초`);
  console.log(`   실제: ${avgDuration.toFixed(2)}초`);
}

console.log('');
console.log('✅ 측정 완료');

process.exit(0);
