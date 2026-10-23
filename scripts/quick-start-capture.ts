import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('text=출발');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/opt/cursor/artifacts/race-state-START-test.png' });
  
  console.log('START screenshot captured');
  
  await browser.close();
})();
