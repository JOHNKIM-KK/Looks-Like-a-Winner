import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const seed = process.env.SEED ?? "7";
const outDir = path.resolve("docs/stage2/captures/task6");
const board = path.resolve("docs/stage2/storyboard");
fs.mkdirSync(outDir, { recursive: true });

const scenes = [
  { lead: 40 / 222, name: "06_early_straight", board: "06_early_straight.webp" },
  { lead: 200 / 222, name: "09_home_sprint", board: "09_home_sprint.webp" },
];

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

try {
  await page.goto(`${base}/?seed=${seed}`, { waitUntil: "networkidle", timeout: 60000 });
  const lobbyHasSkillName = await page.getByText("스타트 대시").count();
  await page.getByRole("button", { name: "출발" }).click();
  await page.waitForSelector("canvas", { timeout: 15000 });

  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "t6-"));
  for (const scene of scenes) {
    await page.waitForFunction((t) => (window.__raceCamera?.leadProgress ?? 0) >= t, scene.lead, { timeout: 90000, polling: 16 });
    const file = path.join(tmp, `${scene.name}.png`);
    await page.screenshot({ path: file });
    const lead = await page.evaluate(() => window.__raceCamera?.leadProgress ?? 0);
    await sideBySide(file, path.join(board, scene.board), path.join(outDir, `${scene.name}_vs_storyboard.jpg`), `seed ${seed}, lead ${(lead * 222).toFixed(0)}/222m`);
  }

  await page.getByRole("button", { name: "다시 하기" }).waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
  const resultFile = path.join(tmp, "10_finish_results.png");
  await page.screenshot({ path: resultFile });
  await sideBySide(resultFile, path.join(board, "10_finish_results.webp"), path.join(outDir, "10_finish_results_vs_storyboard.jpg"), `seed ${seed}, result`);

  console.log(JSON.stringify({ seed, lobbyHasSkillName, out: outDir }, null, 1));
} finally {
  await browser.close();
}
