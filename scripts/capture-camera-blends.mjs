import { chromium } from "playwright";
import fs from "node:fs";

const shots = [
  {
    from: "START",
    to: "STRAIGHT",
    file: "/opt/cursor/artifacts/camera-blend-start-straight-early-mid-390x844.png",
    timeout: 20000,
  },
  {
    from: "CORNER_OUT",
    to: "STRAIGHT",
    file: "/opt/cursor/artifacts/camera-blend-corner-out-straight-home-mid-390x844.png",
    timeout: 80000,
  },
  {
    from: "STRAIGHT",
    to: "FINISH",
    file: "/opt/cursor/artifacts/camera-blend-straight-home-finish-mid-390x844.png",
    timeout: 80000,
  },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
const results = [];
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("page error:", msg.text());
});
page.on("pageerror", (error) => console.log("pageerror:", error.message));

try {
  await page.goto("http://localhost:3000/?debug=1", { waitUntil: "networkidle", timeout: 30000 });
  await page.getByRole("button", { name: "출발" }).click();
  await page.waitForSelector("canvas", { timeout: 15000 });

  for (const shot of shots) {
    await page.evaluate(({ from, to }) => {
      window.__raceCameraWant = { from, to };
      window.__cameraFreeze = false;
      window.__raceCameraFrozen = undefined;
    }, shot);

    await page.waitForFunction(
      ({ from, to }) => {
        const frozen = window.__raceCameraFrozen;
        return frozen && frozen.from === from && frozen.to === to && frozen.blend >= 0.5;
      },
      shot,
      { timeout: shot.timeout, polling: 50 },
    );
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));

    const info = await page.evaluate(() => window.__raceCameraFrozen);
    await page.screenshot({ path: shot.file });
    results.push({ file: shot.file, ...info });
    console.log(JSON.stringify({ file: shot.file, ...info }));
  }
} finally {
  fs.writeFileSync("/opt/cursor/artifacts/camera-blend-capture.json", JSON.stringify(results, null, 2));
  await browser.close();
}
