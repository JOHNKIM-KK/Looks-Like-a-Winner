import { test, expect } from '@playwright/test';

test.describe('Camera State Verification', () => {
  test('capture START and FINISH states', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    
    let finishStateFound = false;
    page.on('console', msg => {
      if (msg.text().includes('State: FINISH')) {
        finishStateFound = true;
      }
    });
    
    await page.goto('http://localhost:3000?debug=1');
    
    await page.waitForTimeout(500);
    
    const startButton = await page.locator('button:has-text("출발")');
    await startButton.click();
    
    await page.waitForTimeout(2000);
    
    await page.screenshot({
      path: 'screenshots/start-state.png',
      fullPage: false
    });
    
    console.log('Captured START state screenshot');
    
    // Wait for FINISH state
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      if (finishStateFound) {
        await page.waitForTimeout(200);
        break;
      }
    }
    
    await page.screenshot({
      path: 'screenshots/finish-state.png',
      fullPage: false
    });
    
    console.log('Captured FINISH state screenshot');
  });
});
