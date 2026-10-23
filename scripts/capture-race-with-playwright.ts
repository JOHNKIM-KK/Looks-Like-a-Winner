import { chromium } from 'playwright';

async function captureRaceScreenshots() {
  console.log('🎬 레이스 스크린샷 캡처 시작');
  console.log('=====================================');
  
  const browser = await chromium.launch({ headless: true });

  try {
    const viewport = { width: 390, height: 844, name: 'iPhone13' };
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
      
      console.log('  📸 START (게이트) 캡처...');
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: `/opt/cursor/artifacts/race-state-START-${viewport.width}x${viewport.height}.png`,
      });

      console.log('  📸 STRAIGHT (출발 후) 캡처...');
      await page.waitForTimeout(3000);
      await page.screenshot({
        path: `/opt/cursor/artifacts/race-state-STRAIGHT-early-${viewport.width}x${viewport.height}.png`,
      });

      console.log('  📸 CORNER_IN 캡처...');
      await page.waitForTimeout(7000);
      await page.screenshot({
        path: `/opt/cursor/artifacts/race-state-CORNER_IN-${viewport.width}x${viewport.height}.png`,
      });

      console.log('  📸 CORNER_OUT 캡처...');
      await page.waitForTimeout(5000);
      await page.screenshot({
        path: `/opt/cursor/artifacts/race-state-CORNER_OUT-${viewport.width}x${viewport.height}.png`,
      });

      console.log('  📸 STRAIGHT (홈) 캡처...');
      await page.waitForTimeout(5000);
      await page.screenshot({
        path: `/opt/cursor/artifacts/race-state-STRAIGHT-home-${viewport.width}x${viewport.height}.png`,
      });

      console.log('  📸 FINISH 캡처...');
      await page.waitForTimeout(6000);
      await page.screenshot({
        path: `/opt/cursor/artifacts/race-state-FINISH-${viewport.width}x${viewport.height}.png`,
      });

      console.log(`✅ 모든 상태 캡처 완료`);
    } catch (error) {
      console.error(`❌ 캡처 실패:`, error);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  console.log('\n=====================================');
  console.log('✅ 스크린샷 캡처 완료');
}

captureRaceScreenshots().catch(console.error);
