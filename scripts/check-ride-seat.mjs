import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = path.resolve(process.env.OUT ?? "docs/stage2/captures/ride-seat.png");
const frames = (process.env.FRAMES ?? "0,3,6,9").split(",").map(Number);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const horses = read("public/horses/horses.json");
const wideHorses = read("public/horses/wide/wide.json");
const jockey = read("public/jockey/jockey.json");
const wideRide = read("public/jockey/wide/ride_wide.json");

const rows = [];
for (const set of ["straight", "corner", "wide"]) {
  const horseAngles = set === "wide" ? wideHorses.angles : horses.sets[set].angles;
  const rideAngles = set === "wide" ? wideRide.angles : jockey.actions.ride.sets[set].angles;
  const dir = set === "wide" ? "wide/" : "";
  for (const horse of horseAngles) {
    const ride = rideAngles.find((entry) => entry.index === horse.index);
    if (!ride) continue;
    rows.push({
      label: `${set} a${horse.index} yaw ${horse.yaw_deg}`,
      horse: { src: `${base}/horses/${dir}${horse.color}`, w: horse.frame_w, h: horse.frame_h },
      ride: { src: `${base}/jockey/${dir}${ride.color}`, w: ride.frame_w, h: ride.frame_h, x: ride.offset_in_horse_frame[0], y: ride.offset_in_horse_frame[1] },
    });
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
await page.goto(base, { waitUntil: "domcontentloaded" });
const png = await page.evaluate(async ({ rows, frames }) => {
  const load = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(src));
    image.src = src;
  });
  const cell = 320;
  const canvas = document.createElement("canvas");
  canvas.width = 220 + cell * frames.length;
  canvas.height = 260 * rows.length;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#c9a24e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "16px sans-serif";
  for (const [rowIndex, row] of rows.entries()) {
    const [horse, ride] = await Promise.all([load(row.horse.src), load(row.ride.src)]);
    const top = rowIndex * 260;
    ctx.fillStyle = "#111";
    ctx.fillText(row.label, 8, top + 130);
    for (const [col, frame] of frames.entries()) {
      const left = 220 + col * cell + 10;
      const y = top + 20;
      ctx.drawImage(horse, frame * row.horse.w, 0, row.horse.w, row.horse.h, left, y, row.horse.w, row.horse.h);
      ctx.drawImage(ride, frame * row.ride.w, 0, row.ride.w, row.ride.h, left + row.ride.x, y + row.ride.y, row.ride.w, row.ride.h);
      ctx.fillText(`f${frame}`, left, top + 252);
    }
  }
  return canvas.toDataURL("image/png");
}, { rows, frames });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(png.split(",")[1], "base64"));
await browser.close();
console.log(out, rows.length, "angles");
