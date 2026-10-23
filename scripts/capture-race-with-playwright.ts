#!/usr/bin/env node
/**
 * Playwright를 사용한 레이스 스크린샷 캡처
 * 
 * 다양한 뷰포트에서 레이스 화면을 캡처하여 검증합니다.
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const VIEWPORTS = [
  { width: 390, height: 844, name: 'iPhone13' },
  { width: 360, height: 800, name: 'Android' },
  { width: 430, height: 932, name: 'iPhone14Pro' },
];

const ARTIFACTS_DIR = '/opt/cursor/artifacts';
const PORT = 3000;

async function main() {
  console.log('🎬 레이스 스크린샷 캡처 시작');
  console.log('=====================================');
  
  // artifacts 디렉토리 생성
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  // Next.js 서버 시작
  console.log('📦 Next.js 서버 시작 중...');
  const server = spawn('npm', ['run', 'start'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  // 서버가 준비될 때까지 대기
  await new Promise((resolve) => {
    server.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Ready') || output.includes('started')) {
        console.log('✅ Next.js 서버 준비 완료');
        resolve(null);
      }
    });
    // 타임아웃 설정
    setTimeout(resolve, 8000);
  });

  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n📱 ${viewport.name} (${viewport.width}x${viewport.height}) 캡처 중...`);
      
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
      });

      const page = await context.newPage();
      
      try {
        // 페이지 로드
        await page.goto(`http://localhost:${PORT}`, { 
          waitUntil: 'networkidle',
          timeout: 15000,
        });

        // 출발 버튼 클릭
        const startButton = page.locator('button:has-text("출발")');
        await startButton.waitFor({ state: 'visible', timeout: 5000 });
        await startButton.click();

        // 레이스 시작 대기
        await page.waitForTimeout(4000);

        // 1. 출발 직후
        console.log('  📸 출발 직후 캡처...');
        await page.screenshot({
          path: path.join(ARTIFACTS_DIR, `race-start-${viewport.name}-${viewport.width}x${viewport.height}.png`),
        });

        // 코너 구간까지 대기 (약 10초)
        await page.waitForTimeout(10000);

        // 2. 코너
        console.log('  📸 코너 구간 캡처...');
        await page.screenshot({
          path: path.join(ARTIFACTS_DIR, `race-corner-${viewport.name}-${viewport.width}x${viewport.height}.png`),
        });

        // 골 직전까지 대기 (약 25초 더)
        await page.waitForTimeout(25000);

        // 3. 골 직전
        console.log('  📸 골 직전 캡처...');
        await page.screenshot({
          path: path.join(ARTIFACTS_DIR, `race-finish-${viewport.name}-${viewport.width}x${viewport.height}.png`),
        });

        console.log(`✅ ${viewport.name} 캡처 완료`);
      } catch (error) {
        console.error(`❌ ${viewport.name} 캡처 실패:`, error);
      }

      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n=====================================');
  console.log('✅ 모든 스크린샷 캡처 완료');
  console.log(`📁 저장 경로: ${ARTIFACTS_DIR}`);
  
  // 생성된 파일 목록 출력
  const files = fs.readdirSync(ARTIFACTS_DIR).filter(f => f.startsWith('race-'));
  console.log(`\n생성된 파일 (${files.length}개):`);
  files.forEach(file => {
    const stat = fs.statSync(path.join(ARTIFACTS_DIR, file));
    console.log(`  - ${file} (${(stat.size / 1024).toFixed(1)} KB)`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ 에러 발생:', error);
    process.exit(1);
  });
