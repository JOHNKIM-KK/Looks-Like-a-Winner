import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const seed = process.env.SEED ?? "7";
const outDir = path.resolve(process.env.OUT ?? "docs/stage2/captures/scenes");
const only = process.env.SCENES?.split(",");
const board = path.resolve("docs/stage2/storyboard");
fs.mkdirSync(outDir, { recursive: true });

const RACE_M = 357;
const scenes = [
  { name: "01_drone_park", line: "오늘의 무대", afterMs: 300 },
  { name: "02_drone_descend", line: "출발 게이트로 갑니다", afterMs: 150 },
  { name: "03_gate_front", line: "게이트 진입 완료", afterMs: 500 },
  { name: "04_countdown", wall: 0.4 },
  { name: "05_gates_open", wall: 3.1 },
  { name: "A1_chute_run", lead: 40 / RACE_M, board: "06_early_straight" },
  { name: "B1_chute_end_rail", lead: 55 / RACE_M, board: "06_early_straight" },
  { name: "06_early_straight", lead: 68 / RACE_M },
  { name: "B2_corner_inside", lead: 160 / RACE_M, board: "07_corner" },
  { name: "07_corner", lead: 164 / RACE_M },
  { name: "B3_back_outside_pass", lead: 229 / RACE_M, board: "08_back_final_corner" },
  { name: "08_back_final_corner", lead: 259 / RACE_M, settled: true },
  { name: "A2_home_entry", lead: 303.5 / RACE_M, board: "09_home_sprint" },
  { name: "09_home_sprint", lead: 309 / RACE_M },
  { name: "B4_home_spread", lead: 345 / RACE_M, board: "09_home_sprint" },
  { name: "A3_finish_line", lead: 0.999, board: "10_finish_results" },
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

  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "scenes-"));
  for (const scene of scenes) {
    if (scene.line !== undefined) {
      await page.getByText(scene.line).first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(scene.afterMs);
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
    const caption = `seed ${seed}, ${cam.state ?? "intro"}, lead ${((cam.leadProgress ?? 0) * RACE_M).toFixed(1)}/${RACE_M}m`;
    await sideBySide(file, path.join(board, `${scene.board ?? scene.name}.webp`), path.join(outDir, `${scene.name}_vs_storyboard.jpg`), caption);
    console.log(scene.name, caption);
  }
} finally {
  await browser.close();
}
