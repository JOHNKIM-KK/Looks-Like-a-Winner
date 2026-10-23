import { chromium } from 'playwright';

async function captureRaceScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 2340 },
  });
  const page = await context.newPage();

  console.log('서버에 접속 중...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  
  console.log('출발 버튼 클릭...');
  await page.click('text=출발');
  
  // 레이스 시작 대기
  await page.waitForTimeout(500);
  
  console.log('스크린샷 촬영 중...');
  
  // 출발 직후 (3초)
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/opt/cursor/artifacts/race-new-start.png' });
  console.log('  출발 직후 촬영 완료');
  
  // 코너 (20초)
  await page.waitForTimeout(17000);
  await page.screenshot({ path: '/opt/cursor/artifacts/race-new-corner.png' });
  console.log('  코너 촬영 완료');
  
  // 골 직전 (37초)
  await page.waitForTimeout(17000);
  await page.screenshot({ path: '/opt/cursor/artifacts/race-new-finish.png' });
  console.log('  골 직전 촬영 완료');
  
  await browser.close();
  console.log('완료!');
}

captureRaceScreenshots().catch(console.error);
