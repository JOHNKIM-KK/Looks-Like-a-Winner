import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const seed = process.env.SEED ?? "7";
const outDir = path.resolve(process.env.OUT ?? "docs/stage2/captures/task9b-finish");
const board = path.resolve("docs/stage2/storyboard_finish");
const timingOnly = process.env.TIMING_ONLY === "1";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  { name: "f01_stretch_entry", when: "c.finishPhase === 'stretch' && c.finishAge >= 0.6" },
  { name: "f02_sprint", when: "c.toGo <= 16.7" },
  { name: "f02b_sprint_mid", when: "c.toGo <= 10" },
  { name: "f04_photo_finish", when: "c.finishPhase === 'freeze' && c.finishAge >= 0.5" },
  { name: "f04to05_rise_swing", when: "c.finishPhase === 'rise' && c.finishAge >= 0.9" },
  { name: "f05_result", when: "c.finishPhase === 'result' && c.finishAge >= 0.6" },
];

const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const dataUrl = (file) => `data:image/${path.extname(file).slice(1)};base64,${fs.readFileSync(file).toString("base64")}`;

async function sideBySide(game, reference, out, caption) {
  const sheet = await browser.newPage({ viewport: { width: 3200, height: 960 } });
  await sheet.setContent(`<body style="margin:0;background:#111;color:#eee;font:22px sans-serif">
    <div style="display:flex"><img src="${dataUrl(game)}" width="1600" height="900"><img src="${dataUrl(reference)}" width="1600" height="900" style="object-fit:contain;background:#000"></div>
    <div style="display:flex;height:60px;align-items:center"><div style="width:1600px;padding-left:16px">게임 (1600x900, debug off) ${caption}</div><div style="padding-left:16px">storyboard_finish ${path.basename(reference)}</div></div></body>`);
  await sheet.screenshot({ path: out, type: "jpeg", quality: 82 });
  await sheet.close();
}

async function openRace(debug) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => console.log("pageerror:", error.message));
  await page.goto(`${base}/?seed=${seed}${debug ? "&debug=1" : ""}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => {
    window.__raceDebugVisible = false;
  });
  await page.getByRole("button", { name: "출발" }).click();
  await page.waitForFunction(() => window.__raceCamera !== undefined, null, { timeout: 15000, polling: 16 });
  return page;
}

async function measureTiming() {
  const page = await openRace(false);
  await page.waitForFunction(() => window.__raceCamera?.finishPhase === "result" && window.__raceCamera.finishAge >= 0.5, null, {
    timeout: 150000,
    polling: 50,
  });
  const log = await page.evaluate(() => window.__finishLog ?? []);
  const wall = Object.fromEntries(log.map((entry) => [entry.kind, entry.at / 1000]));
  const game = Object.fromEntries(log.map((entry) => [entry.kind, entry.clock]));
  const rows = [
    ["corner exit → cut", "stretch", "track", 3.51],
    ["cut → freeze start", "track", "freeze", 5.71],
    ["freeze", "freeze", "rise", 1.0],
    ["rise", "rise", "result", 1.8],
    ["tracking screen (cut → freeze end)", "track", "rise", 6.71],
  ];
  console.log(`seed ${seed}: wall = performance.now(), game = frame clock (40 ms cap per frame), SHOTS in brackets`);
  for (const [label, from, to, shots] of rows) {
    console.log(`  ${label}: wall ${(wall[to] - wall[from]).toFixed(2)} s, game ${(game[to] - game[from]).toFixed(2)} s [${shots}]`);
  }
  await page.close();
}

async function captureShots() {
  const page = await openRace(true);
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "finish-"));
  for (const shot of shots) {
    await page.waitForFunction(
      (when) => {
        const c = window.__raceCamera;
        if (!c || !new Function("c", `return ${when}`)(c)) return false;
        window.__cameraFreeze = true;
        return true;
      },
      shot.when,
      { timeout: 150000, polling: 16 },
    );
    const file = path.join(tmp, `${shot.name}.png`);
    await page.screenshot({ path: file });
    const c = await page.evaluate(() => window.__raceCamera);
    const widths = [...c.horseWidths].sort((a, b) => b - a);
    const pct = (px) => `${((px / 1600) * 100).toFixed(1)}%`;
    const caption = `seed ${seed}, ${c.finishPhase} ${c.finishAge.toFixed(2)}s, to go ${c.toGo.toFixed(1)} m`;
    console.log(
      shot.name,
      caption,
      `| winner frame ${pct(c.winnerWidth)}, max ${pct(widths[0] ?? 0)}, median ${pct(widths[Math.floor(widths.length / 2)] ?? 0)}, winner sheet ${c.winnerSheet}`,
    );
    await sideBySide(file, path.join(board, `${shot.name}.webp`), path.join(outDir, `${shot.name}_vs_storyboard.jpg`), caption);
    await page.evaluate(() => {
      window.__cameraFreeze = false;
    });
  }
  await page.close();
}

try {
  await measureTiming();
  if (!timingOnly) await captureShots();
} finally {
  await browser.close();
}
