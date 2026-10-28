import Phaser from "phaser";
import { laneColorValue } from "./laneColors";
import { projectHeight } from "./trackArt";
import type { Camera } from "./track";
import { tintGatePlate } from "./startingGate";
import type { StartingGate } from "./startingGate";
import { gateLayout } from "./startingGate";

/** Provisional venue board. The final lettering arrives with the gate art. */
export const GATE_SIGN_TEXT = "우승할 상";

export function gatePlateKey(lane: number) {
  return `gate-plate-${lane}`;
}

/**
 * Placeholder plate textures. A real file loaded under the same key wins.
 * Mask G is the whole plate until the gate mask is painted.
 */
export function ensureGatePlateTextures(scene: Phaser.Scene, stallCount: number) {
  const width = 64;
  const height = 40;
  for (let lane = 1; lane <= stallCount; lane += 1) {
    const key = gatePlateKey(lane);
    if (scene.textures.exists(key)) {
      const existing = scene.textures.get(key);
      if (existing.key !== "__MISSING") continue;
    }
    const pixels = width * height;
    const color = new Uint8ClampedArray(pixels * 4);
    const mask = new Uint8ClampedArray(pixels * 4);
    for (let index = 0; index < pixels; index += 1) {
      const offset = index * 4;
      color[offset] = 220;
      color[offset + 1] = 220;
      color[offset + 2] = 220;
      color[offset + 3] = 255;
      mask[offset + 1] = 255;
    }
    const tinted = new Uint8ClampedArray(color.length);
    tintGatePlate(color, mask, lane, tinted);
    const canvas = scene.textures.createCanvas(key, width, height);
    if (!canvas) continue;
    const image = canvas.getContext().createImageData(width, height);
    image.data.set(tinted);
    canvas.getContext().putImageData(image, 0, 0);
    canvas.refresh();
  }
}

type GatePaint = {
  graphics: Phaser.GameObjects.Graphics;
  plates: Phaser.GameObjects.Image[];
  numbers: Phaser.GameObjects.Text[];
  sign: Phaser.GameObjects.Text;
  gate: StartingGate;
  camera: Camera;
};

/** Screen-space stall frames, doors, and plates. Art files can replace the plate keys. */
export function paintStartingGate({ graphics, plates, numbers, sign, gate, camera }: GatePaint) {
  graphics.clear();
  const parts = gateLayout(gate.config);
  let signX = 0;
  let signY = 0;
  let signCount = 0;
  for (const plate of plates) plate.setVisible(false);
  for (const number of numbers) number.setVisible(false);
  sign.setVisible(false);

  for (const part of parts) {
    const pose = projectHeight(part.x, part.y, part.z, camera);
    if (!pose.visible) continue;
    const scale = Math.max(0.2, Math.min(pose.scale, 1.35));
    if (pose.scale > 2.4) continue;
    if (part.role === "stall" || part.role === "end-left" || part.role === "end-right") {
      const postW = (part.role === "stall" ? 10 : 16) * scale;
      const postH = 78 * scale;
      graphics.fillStyle(part.role === "stall" ? 0xd7d2c8 : 0x1c4f86, 1);
      graphics.fillRect(pose.x - postW / 2, pose.y - postH, postW, postH);
      continue;
    }
    if (part.role === "door") {
      const open = gate.doors[part.index]?.amount ?? 0;
      const leafW = 18 * scale;
      const leafH = 34 * scale;
      const gap = (10 + open * 28) * scale;
      graphics.fillStyle(0xf4f0e6, 1);
      graphics.fillRect(pose.x - gap - leafW, pose.y - leafH, leafW, leafH);
      graphics.fillRect(pose.x + gap, pose.y - leafH, leafW, leafH);
      continue;
    }
    const plate = plates[part.index];
    const number = numbers[part.index];
    if (!plate || !number) continue;
    const plateW = 62 * scale;
    const plateH = 36 * scale;
    const plateDepth = pose.scale > 1.15 ? pose.y : 6000;
    plate.setVisible(true).setPosition(pose.x, pose.y).setDisplaySize(plateW, plateH).setDepth(plateDepth);
    number
      .setVisible(true)
      .setPosition(pose.x, pose.y)
      .setScale(Math.min(scale, 1))
      .setDepth(plateDepth + 1)
      .setColor("#ffffff");
    number.setTint(0xffffff);
    graphics.lineStyle(Math.max(2, 4 * scale), laneColorValue(part.index + 1), 1);
    graphics.strokeRect(pose.x - plateW / 2, pose.y - plateH / 2, plateW, plateH);
    signX += pose.x;
    signY += pose.y - plateH * 0.9;
    signCount += 1;
  }

  if (signCount > 0) {
    sign.setVisible(true).setPosition(signX / signCount, signY / signCount).setDepth(6002);
  }
}
