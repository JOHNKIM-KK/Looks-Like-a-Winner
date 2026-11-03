import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const seed = process.env.SEED ?? "7";
const outDir = path.resolve("docs/stage2/captures/task5");
const board = path.resolve("docs/stage2/storyboard");
fs.mkdirSync(outDir, { recursive: true });

const scenes = [
  { lead: 96 / 222, name: "07_corner", board: "07_corner.webp" },
  { lead: 150 / 222, name: "08_back_final_corner", board: "08_back_final_corner.webp" },
];
const strip = { from: 0.31, count: 8, everyMs: 150, name: "corner_strip" };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const warnings = [];
page.on("console", (msg) => {
  if (msg.text().includes("heading flip mismatch")) {
    page
      .evaluate(() => window.__raceCamera)
      .then((cam) => warnings.push({ text: msg.text(), state: cam?.state, lead: cam?.leadProgress, raceTime: cam?.raceTime }))
      .catch(() => warnings.push({ text: msg.text() }));
  }
  if (msg.type() === "error") console.log("page error:", msg.text());
});
page.on("pageerror", (error) => console.log("pageerror:", error.message));

const leadAt = () => page.evaluate(() => window.__raceCamera?.leadProgress ?? 0);
async function waitLead(target) {
  await page.waitForFunction((t) => (window.__raceCamera?.leadProgress ?? 0) >= t, target, { timeout: 90000, polling: 16 });
}

const dataUrl = (file) => `data:image/${path.extname(file).slice(1)};base64,${fs.readFileSync(file).toString("base64")}`;

async function sideBySide(game, reference, out, caption) {
  const sheet = await browser.newPage({ viewport: { width: 3200, height: 960 } });
  await sheet.setContent(`<body style="margin:0;background:#111;color:#eee;font:22px sans-serif">
    <div style="display:flex"><img src="${dataUrl(game)}" width="1600" height="900"><img src="${dataUrl(reference)}" width="1600" height="900" style="object-fit:contain;background:#000"></div>
    <div style="display:flex;height:60px;align-items:center"><div style="width:1600px;padding-left:16px">게임 (1600x900, debug off) ${caption}</div><div style="padding-left:16px">storyboard ${path.basename(reference)}</div></div></body>`);
  await sheet.screenshot({ path: out, type: "jpeg", quality: 82 });
  await sheet.close();
}

async function grid(files, out) {
  const sheet = await browser.newPage({ viewport: { width: 3200, height: 900 } });
  const cells = files.map((f, i) => `<div style="position:relative"><img src="${dataUrl(f)}" width="800" height="450"><span style="position:absolute;left:8px;top:8px;background:#000a;padding:2px 6px">+${i * strip.everyMs}ms</span></div>`).join("");
  await sheet.setContent(`<body style="margin:0;background:#111;color:#fff;font:20px sans-serif"><div style="display:grid;grid-template-columns:repeat(4,800px)">${cells}</div></body>`);
  await sheet.screenshot({ path: out, type: "jpeg", quality: 80 });
  await sheet.close();
}

try {
  await page.goto(`${base}/?seed=${seed}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("button", { name: "출발" }).click();
  await page.waitForSelector("canvas", { timeout: 15000 });

  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "t5-"));
  await waitLead(strip.from);
  const frames = [];
  for (let i = 0; i < strip.count; i += 1) {
    const file = path.join(tmp, `strip_${i}.png`);
    await page.screenshot({ path: file });
    frames.push(file);
    await page.waitForTimeout(strip.everyMs);
  }
  await grid(frames, path.join(outDir, `${strip.name}.jpg`));

  for (const scene of scenes) {
    await waitLead(scene.lead);
    const file = path.join(tmp, `${scene.name}.png`);
    await page.screenshot({ path: file });
    const lead = await leadAt();
    await sideBySide(file, path.join(board, scene.board), path.join(outDir, `${scene.name}_vs_storyboard.jpg`), `lead ${(lead * 222).toFixed(0)}/222m`);
  }

  await page.waitForFunction(() => window.__raceCamera?.state?.startsWith("FINISH") || (window.__raceCamera?.leadProgress ?? 0) >= 1, null, { timeout: 90000 });
  const mismatches = await page.evaluate(() => window.__headingFlipMismatch ?? null);
  console.log(JSON.stringify({ seed, mismatches, warnings, out: outDir }, null, 1));
} finally {
  await browser.close();
}
