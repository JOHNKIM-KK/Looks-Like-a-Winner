import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = "http://127.0.0.1:3456";
const out = new URL("../docs/stage3/captures/ui-v3/", import.meta.url);

const five = ["명준", "시게루", "코마", "민서", "하준"];
const twelve = [...five, "지수", "태윤", "소연", "현우", "지우", "서준", "하은"];

await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

await page.route("**/*", async (route) => {
  const url = route.request().url();
  if (/\.(png|webp)(?:$|\?)/.test(url) && !url.includes("logo_winning_post")) {
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await route.continue();
});

await page.addInitScript(() => {
  localStorage.setItem(
    "gemi.recentEntrants",
    JSON.stringify({ names: ["명준", "시게루", "코마", "민서", "하준"] }),
  );
});

await page.goto(`${base}/?seed=4`, { waitUntil: "domcontentloaded" });
let loadingShot = false;
for (let i = 0; i < 120 && !loadingShot; i += 1) {
  const value = await page.evaluate(() => {
    const bar = document.querySelector('[role="progressbar"]');
    return bar ? Number(bar.getAttribute("aria-valuenow")) : null;
  });
  if (value !== null && value >= 30 && value <= 85) {
    await page.screenshot({ path: new URL("loading.png", out).pathname });
    loadingShot = true;
    break;
  }
  await page.waitForTimeout(25);
}
if (!loadingShot) {
  await page.locator("img.logo").waitFor({ timeout: 15000 });
  await page.screenshot({ path: new URL("loading.png", out).pathname });
}

const titleStart = page.getByRole("button", { name: "출발" });
await titleStart.waitFor({ timeout: 20000 });
await titleStart.click();
await page.getByTestId("setup-screen").waitFor();
await page.getByTestId("setup-minus").isDisabled();
if (!(await page.getByTestId("setup-plus").isEnabled())) throw new Error("plus should be enabled at 2");
await page.screenshot({ path: new URL("setup_empty.png", out).pathname });

async function fillCount(names) {
  const current = await page.locator('[data-testid^="entrant-name-"]').count();
  for (let i = current; i < names.length; i += 1) await page.getByTestId("setup-plus").click();
  for (let i = 0; i < names.length; i += 1) {
    await page.getByTestId(`entrant-name-${i}`).fill(names[i]);
  }
}

await fillCount(five);
await page.getByTestId("entrant-name-4").click();
if (await page.getByTestId("setup-minus").isDisabled()) throw new Error("minus should work at 5");
await page.screenshot({ path: new URL("setup_5.png", out).pathname });

await page.getByTestId("setup-load").click();
await page.getByRole("dialog", { name: "최근 참가자" }).waitFor();
await page.screenshot({ path: new URL("setup_sheet.png", out).pathname });
await page.getByRole("button", { name: "닫기" }).click();
await page.getByRole("dialog").waitFor({ state: "hidden" });

await page.getByTestId("setup-load").click();
const handle = page.locator(".handle");
const box = await handle.boundingBox();
if (!box) throw new Error("sheet handle missing");
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + 180, { steps: 8 });
await page.mouse.up();
await page.getByRole("dialog").waitFor({ state: "hidden" });

await page.getByTestId("setup-load").click();
await page.getByTestId("recent-row").click();
await page.getByRole("dialog").waitFor({ state: "hidden" });
if ((await page.locator('[data-testid^="entrant-name-"]').count()) !== 5) throw new Error("recent roster did not apply");

await fillCount(twelve);
if (!(await page.getByTestId("setup-plus").isDisabled())) throw new Error("plus should be disabled at 12");
if (await page.getByTestId("setup-add").count()) throw new Error("add row should hide at 12");
await page.screenshot({ path: new URL("setup_12.png", out).pathname });

async function shootLineup(names, file) {
  await page.goto(`${base}/?seed=4`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "출발" }).click();
  await page.getByTestId("setup-screen").waitFor();
  await fillCount(names);
  await page.getByTestId("setup-start").click();
  await page.getByTestId("lineup-screen").waitFor();
  const gates = await page.locator('[data-testid^="lineup-gate-"]').evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("data-testid")?.replace("lineup-gate-", ""))),
  );
  const sorted = [...gates].sort((a, b) => a - b);
  if (gates.join() !== sorted.join()) throw new Error(`lineup not sorted: ${gates.join()}`);
  if (gates.length !== names.length) throw new Error(`expected ${names.length} rows, got ${gates.length}`);
  if (await page.getByText("다시 섞기").count()) throw new Error("shuffle button returned");
  await page.screenshot({ path: new URL(file, out).pathname });
}

await shootLineup(["명준", "코마"], "lineup_2.png");
await shootLineup(five, "lineup_5.png");
await shootLineup(twelve, "lineup_12.png");

await page.getByTestId("lineup-start").click();
await page.getByTestId("lineup-screen").waitFor({ state: "detached" });

await browser.close();
console.log("captured");
