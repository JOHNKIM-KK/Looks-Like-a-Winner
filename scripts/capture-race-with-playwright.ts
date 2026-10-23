import { chromium } from 'playwright';

const VIEWPORTS = [
  { width: 390, height: 844, name: 'iPhone13' },
  { width: 360, height: 800, name: 'Android' },
  { width: 430, height: 932, name: 'iPhone14Pro' },
];

async function captureRaceScreenshots() {
  console.log('🎬 레이스 스크린샷 캡처 시작');
  console.log('=====================================');
  
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
        await page.goto('http://localhost:3000', { 
          waitUntil: 'networkidle',
          timeout: 15000,
        });

        await page.click('text=출발');
        await page.waitForTimeout(3000);

        // 1. 출발 직후
        console.log('  📸 출발 직후 캡처...');
        await page.screenshot({
          path: `/opt/cursor/artifacts/race-start-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        });

        // 2. 코너 (약 13초 후)
        await page.waitForTimeout(10000);
        console.log('  📸 코너 구간 캡처...');
        await page.screenshot({
          path: `/opt/cursor/artifacts/race-corner-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        });

        // 3. 골 직전 (약 24초 더, 총 37초)
        await page.waitForTimeout(24000);
        console.log('  📸 골 직전 캡처...');
        await page.screenshot({
          path: `/opt/cursor/artifacts/race-finish-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        });

        console.log(`✅ ${viewport.name} 캡처 완료`);
      } catch (error) {
        console.error(`❌ ${viewport.name} 캡처 실패:`, error);
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\n=====================================');
  console.log('✅ 모든 스크린샷 캡처 완료');
}

captureRaceScreenshots().catch(console.error);
