import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

/**
 * Forces each incident with the debug URL and screenshots it around the dismount.
 * Run `next dev -p 3100`, then `node scripts/capture-incidents.mjs`.
 */
const base = process.env.BASE_URL ?? "http://localhost:3100";
const seed = process.env.SEED ?? "7";
const outDir = process.env.OUT ?? path.resolve("docs/incidents");
fs.mkdirSync(outDir, { recursive: true });

const cases = [
  { name: "collision-run", query: "incident=collision&mode=run", offsets: [-0.4, 0.1, 0.3, 0.9, 2.2, 5] },
  { name: "collision-super", query: "incident=collision&mode=super", offsets: [0.3, 1.3, 2.0, 3.0] },
  { name: "titan", query: "incident=titan&mode=run", offsets: [-2.2, -1.2, -0.3, 0.3, 0.7, 2.0] },
  { name: "graze-bike", query: "incident=graze&mode=bike", offsets: [0.3, 1.5, 3.5, 6.5, 9] },
];
const only = process.env.ONLY;

const browser = await chromium.launch({ headless: true });
for (const item of cases) {
  if (only && item.name !== only) continue;
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => console.log("pageerror:", error.message));
  page.on("console", (msg) => msg.type() === "error" && console.log("console error:", msg.text()));
  await page.goto(`${base}/?seed=${seed}&${item.query}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("button", { name: "출발" }).click();
  await page.getByRole("button", { name: "라인업 보기" }).click();
  await page.getByTestId("lineup-start").click();
  await page.waitForSelector("canvas", { timeout: 20000 });
  await page.waitForFunction(() => (window.__raceCamera?.raceTime ?? 0) > 0.2, null, { timeout: 60000 });
  await page.waitForFunction(() => (window.__raceIncidents?.length ?? 0) > 0, null, { timeout: 30000 });
  const incidents = await page.evaluate(() => window.__raceIncidents);
  console.log(item.name, JSON.stringify(incidents));
  const t0 = Math.min(...incidents.map((entry) => entry.time));
  for (const offset of item.offsets) {
    await page.waitForFunction((t) => (window.__raceCamera?.raceTime ?? 0) >= t, t0 + offset, { timeout: 90000, polling: 16 });
    const now = await page.evaluate(() => window.__raceCamera?.raceTime ?? 0);
    const file = path.join(outDir, `${item.name}_t${offset >= 0 ? "+" : ""}${offset.toFixed(1)}.png`);
    await page.screenshot({ path: file });
    console.log("  shot", path.basename(file), "raceTime", now.toFixed(2));
  }
  await page.close();
}
await browser.close();
