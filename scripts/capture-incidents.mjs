import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

/**
 * Forces each incident with the debug URL, screenshots it through the event, and reports
 * which event assets were requested, fps before and during the event, and GPU bytes the sheets added.
 * Run `next dev -p 3100`, then `node scripts/capture-incidents.mjs`.
 * ONLY=<case name> runs one case. `baseline` is a seed without incidents and must request no event asset.
 */
const base = process.env.BASE_URL ?? "http://localhost:3100";
const seed = process.env.SEED ?? "7";
const outDir = process.env.OUT ?? path.resolve("docs/incidents");
fs.mkdirSync(outDir, { recursive: true });

const EVENT_ASSET = /\/(horses\/events|vehicles|titan)\//;

const cases = [
  { name: "baseline", query: "", offsets: [], baselineFor: 12 },
  { name: "collision-run", query: "incident=collision&mode=run", offsets: [-0.3, 0.1, 0.25, 0.45, 0.7, 0.9, 1.2, 2.5, 4, 6] },
  { name: "collision-super", query: "incident=collision&mode=super", offsets: [0.3, 1.0, 1.3, 2.0, 3.0] },
  { name: "titan", query: "incident=titan&mode=run", offsets: [-2.2, -1.2, -0.3, 0.2, 0.45, 0.7, 0.9, 1.3, 2.0, 3.0] },
  { name: "graze-bike", query: "incident=graze&mode=bike", offsets: [0.3, 1.5, 2.1, 2.3, 2.6, 3.5, 5, 7, 9] },
  { name: "getup", tight: true, query: "incident=collision&mode=run", offsets: Array.from({ length: 14 }, (_, index) => 0.32 + index * 0.04) },
];
const only = process.env.ONLY;

const fps = (log, from, to) => {
  const inside = log.filter(([, t]) => t >= from && t < to);
  if (inside.length < 3) return null;
  const wall = inside.at(-1)[0] - inside[0][0];
  return ((inside.length - 1) / wall) * 1000;
};

const browser = await chromium.launch({ headless: true });
for (const item of cases) {
  if (only && item.name !== only) continue;
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const requests = [];
  page.on("request", (request) => EVENT_ASSET.test(request.url()) && requests.push(new URL(request.url()).pathname));
  page.on("pageerror", (error) => console.log("pageerror:", error.message));
  page.on("console", (msg) => msg.type() === "error" && console.log("console error:", msg.text()));
  await page.addInitScript(() => {
    window.__fpsLog = [];
    const tick = (now) => {
      window.__fpsLog.push([now, window.__raceCamera?.raceTime ?? 0]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const query = [`seed=${seed}`, "perf=1", item.query].filter(Boolean).join("&");
  await page.goto(`${base}/?${query}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("button", { name: "출발" }).click();
  await page.getByRole("button", { name: "라인업 보기" }).click();
  await page.getByTestId("lineup-start").click();
  await page.waitForSelector("canvas", { timeout: 20000 });
  await page.waitForFunction(() => (window.__raceCamera?.raceTime ?? 0) > 0.2, null, { timeout: 60000 });
  if (item.baselineFor) {
    await page.waitForFunction((t) => (window.__raceCamera?.raceTime ?? 0) >= t, item.baselineFor, { timeout: 90000, polling: 50 });
    const log = await page.evaluate(() => window.__fpsLog);
    console.log(item.name, "event requests:", JSON.stringify(requests), "fps 1-12s:", fps(log, 1, 12)?.toFixed(1));
    await page.close();
    continue;
  }
  await page.waitForFunction(() => (window.__raceIncidents?.length ?? 0) > 0, null, { timeout: 30000 });
  const incidents = await page.evaluate(() => window.__raceIncidents);
  console.log(item.name, JSON.stringify(incidents));
  const t0 = Math.min(...incidents.map((entry) => entry.time));
  const slow = Number(process.env.SLOW ?? 0.1);
  const first = item.offsets[0] ?? 0;
  await page.waitForFunction((t) => (window.__raceCamera?.raceTime ?? 0) >= t, t0 + first - 0.6, { timeout: 90000, polling: 16 });
  await page.evaluate((scale) => { window.__raceTimeScale = scale; }, slow);
  for (const offset of item.offsets) {
    await page.waitForFunction((t) => (window.__raceCamera?.raceTime ?? 0) >= t, t0 + offset, { timeout: 240000, polling: 16 });
    const now = await page.evaluate(() => window.__raceCamera?.raceTime ?? 0);
    const file = path.join(outDir, `${item.name}_t${offset >= 0 ? "+" : ""}${offset.toFixed(2)}.png`);
    const focus = await page.evaluate(() => window.__raceEventFocus);
    const bodyShown = focus && focus.bodyX >= 0 && focus.bodyX < 1600 && focus.bodyY < 900;
    const cx = focus ? (bodyShown ? (focus.x + focus.bodyX) / 2 : focus.x) : 0;
    const cy = focus ? (bodyShown ? (focus.y + focus.bodyY) / 2 : focus.y) : 0;
    const clip = focus && item.tight
      ? { x: Math.max(0, Math.min(1600 - 260, focus.x - 130)), y: Math.max(0, Math.min(900 - 180, focus.y - 130)), width: 260, height: 180 }
      : focus
      ? { x: Math.max(0, Math.min(1600 - 800, cx - 400)), y: Math.max(0, Math.min(900 - 450, cy - 300)), width: 800, height: 450 }
      : undefined;
    await page.screenshot({ path: file, clip });
    if (process.env.FULL) await page.screenshot({ path: file.replace(".png", "_full.png") });
    console.log("  shot", path.basename(file), "raceTime", now.toFixed(2), focus ? `jockey ${focus.x.toFixed(0)},${focus.y.toFixed(0)} body ${focus.bodyX.toFixed(0)},${focus.bodyY.toFixed(0)}` : "");
  }
  const log = await page.evaluate(() => window.__fpsLog);
  const bytes = await page.evaluate(() => window.__eventSheetBytes ?? {});
  const total = Object.values(bytes).reduce((sum, value) => sum + value, 0);
  console.log(
    "  event requests:", requests.length, JSON.stringify([...new Set(requests.map((url) => url.split("/").slice(1, -1).join("/") + "/" + url.split("/").at(-1).split("_")[0].replace(".json", "")))].sort()),
    "| fps before:", fps(log, Math.max(1, t0 - 3), t0 - 0.3)?.toFixed(1),
    "during:", fps(log, t0, t0 + 3)?.toFixed(1),
    "| GPU bytes:", JSON.stringify(bytes), "total", total,
  );
  await page.close();
}
await browser.close();
