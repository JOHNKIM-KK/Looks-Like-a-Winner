import { test } from '@playwright/test';

test('find FINISH state timing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  
  await page.goto('http://localhost:3000?debug=1');
  await page.waitForTimeout(500);
  
  const startButton = await page.locator('button:has-text("출발")');
  await startButton.click();
  
  // Skip to near the end
  await page.waitForTimeout(17000);
  
  // Take screenshots every 250ms for 5 seconds
  for (let i = 0; i < 20; i++) {
    await page.screenshot({
      path: `screenshots/search-${i}.png`,
      fullPage: false
    });
    console.log(`Screenshot ${i} taken`);
    await page.waitForTimeout(250);
  }
});
