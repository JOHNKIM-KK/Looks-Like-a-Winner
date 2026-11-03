import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const seed = process.env.SEED ?? "7";
const outDir = path.resolve(process.env.OUT ?? "docs/stage2/captures/scenes");
const only = process.env.SCENES?.split(",");
const board = path.resolve("docs/stage2/storyboard");
fs.mkdirSync(outDir, { recursive: true });

const scenes = [
  { name: "01_drone_park", introSec: 0.4 },
  { name: "02_drone_descend", introSec: 2.6 },
  { name: "03_gate_front", introSec: 4.75 },
  { name: "04_countdown", wall: 0.4 },
  { name: "05_gates_open", wall: 3.1 },
  { name: "06_early_straight", lead: 40 / 222 },
  { name: "07_corner", lead: 96 / 222 },
  { name: "08_back_final_corner", lead: 150 / 222, settled: true },
  { name: "09_home_sprint", lead: 200 / 222 },
  { name: "10_finish_results", result: true },
].filter((scene) => !only || only.some((prefix) => scene.name.startsWith(prefix)));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (error) => console.log("pageerror:", error.message));

const dataUrl = (file) => `data:image/${path.extname(file).slice(1)};base64,${fs.readFileSync(file).toString("base64")}`;

async function sideBySide(game, reference, out, caption) {
  const sheet = await browser.newPage({ viewport: { width: 3200, height: 960 } });
  await sheet.setContent(`<body style="margin:0;background:#111;color:#eee;font:22px sans-serif">
    <div style="display:flex"><img src="${dataUrl(game)}" width="1600" height="900"><img src="${dataUrl(reference)}" width="1600" height="900" style="object-fit:contain;background:#000"></div>
    <div style="display:flex;height:60px;align-items:center"><div style="width:1600px;padding-left:16px">게임 (1600x900, debug off) ${caption}</div><div style="padding-left:16px">storyboard ${path.basename(reference)}</div></div></body>`);
  await sheet.screenshot({ path: out, type: "jpeg", quality: 82 });
  await sheet.close();
}

const camera = () => page.evaluate(() => window.__raceCamera ?? {});

try {
  await page.goto(`${base}/?seed=${seed}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("button", { name: "출발" }).click();
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForFunction(() => window.__raceCamera !== undefined, null, { timeout: 15000, polling: 16 });
  const introStart = Date.now();

  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "scenes-"));
  for (const scene of scenes) {
    if (scene.introSec !== undefined) {
      await page.waitForTimeout(Math.max(0, introStart + scene.introSec * 1000 - Date.now()));
    } else if (scene.wall !== undefined) {
      await page.waitForFunction((t) => (window.__raceCamera?.wallClock ?? 0) >= t, scene.wall, { timeout: 30000, polling: 16 });
    } else if (scene.lead !== undefined) {
      await page.waitForFunction((t) => (window.__raceCamera?.leadProgress ?? 0) >= t, scene.lead, { timeout: 90000, polling: 16 });
      if (scene.settled) await page.waitForFunction(() => window.__raceCamera?.settled, null, { timeout: 30000, polling: 16 });
    } else {
      await page.getByRole("button", { name: "다시 하기" }).waitFor({ timeout: 90000 });
      await page.waitForTimeout(1500);
    }
    const file = path.join(tmp, `${scene.name}.png`);
    await page.screenshot({ path: file });
    const cam = await camera();
    const caption = `seed ${seed}, ${cam.state ?? "intro"}, lead ${((cam.leadProgress ?? 0) * 222).toFixed(0)}/222m`;
    await sideBySide(file, path.join(board, `${scene.name}.webp`), path.join(outDir, `${scene.name}_vs_storyboard.jpg`), caption);
    console.log(scene.name, caption);
  }
} finally {
  await browser.close();
}
