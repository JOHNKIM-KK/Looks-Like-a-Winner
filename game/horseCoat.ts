import Phaser from "phaser";
import {
  HORSE_ANGLES,
  HORSE_FRAMES,
  SHADOW_ALPHA,
  laneRgb,
  shadowColorRgb,
  shadowLayout,
  tintHorsePixels,
  type AngleSetName,
} from "./horseVisual";

type SheetPixels = {
  color: Uint8ClampedArray;
  mask: Uint8ClampedArray;
  width: number;
  height: number;
};

export type HorseCoatLibrary = {
  bakedKey(set: AngleSetName, angleIndex: number, lane: number): string;
  shadowKey(set: AngleSetName, angleIndex: number, frame: number, flip: boolean): string;
  shadowOrigin(set: AngleSetName, angleIndex: number): { x: number; y: number };
};

export function createHorseCoatLibrary(scene: Phaser.Scene): HorseCoatLibrary {
  const sheets = new Map<string, SheetPixels>();

  function pixelsFor(set: AngleSetName, index: number): SheetPixels | null {
    const key = `${set}-${index}`;
    const cached = sheets.get(key);
    if (cached) return cached;
    const angle = HORSE_ANGLES[set][index];
    if (!angle) return null;
    const colorTex = scene.textures.get(`horse-color-${key}`);
    const maskTex = scene.textures.get(`horse-mask-${key}`);
    if (!colorTex || !maskTex) return null;
    const width = angle.frameW * HORSE_FRAMES;
    const height = angle.frameH;
    const color = readPixels(colorTex.getSourceImage() as CanvasImageSource, width, height);
    const mask = readPixels(maskTex.getSourceImage() as CanvasImageSource, width, height);
    const stored = { color, mask, width, height };
    sheets.set(key, stored);
    return stored;
  }

  function bakedKey(set: AngleSetName, angleIndex: number, lane: number) {
    const key = `horse-baked-${set}-${angleIndex}-l${lane}`;
    if (scene.textures.exists(key)) return key;
    const angle = HORSE_ANGLES[set][angleIndex];
    const source = pixelsFor(set, angleIndex);
    if (!angle || !source) return key;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return key;
    const out = new Uint8ClampedArray(source.color.length);
    tintHorsePixels(source.color, source.mask, laneRgb(lane), out);
    context.putImageData(new ImageData(out, source.width, source.height), 0, 0);
    const texture = scene.textures.addCanvas(key, canvas);
    if (texture) {
      for (let frame = 0; frame < HORSE_FRAMES; frame += 1) {
        texture.add(frame, 0, frame * angle.frameW, 0, angle.frameW, angle.frameH);
      }
    }
    return key;
  }

  function shadowKey(set: AngleSetName, angleIndex: number, frame: number, flip: boolean) {
    const key = `horse-shadow-${set}-${angleIndex}-f${frame}-${flip ? "m" : "r"}`;
    if (scene.textures.exists(key)) return key;
    const angle = HORSE_ANGLES[set][angleIndex];
    const source = pixelsFor(set, angleIndex);
    if (!angle || !source) return key;
    const layout = shadowLayout(angle.frameW, angle.frameH, angle.anchorX, angle.anchorY);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, layout.width);
    canvas.height = Math.max(1, layout.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return key;
    const alpha = new Float32Array(canvas.width * canvas.height);
    const frameX = frame * angle.frameW;
    for (let y = 0; y < angle.frameH; y += 1) {
      for (let x = 0; x < angle.frameW; x += 1) {
        const sampleX = flip ? angle.frameW - 1 - x : x;
        const src = ((y * source.width + frameX + sampleX) * 4) + 3;
        const coverage = source.color[src] ?? 0;
        if (coverage < 8) continue;
        const squashed = (angle.anchorY - y) * layout.squash;
        const drop = Math.max(0, squashed);
        const destX = Math.round(layout.groundX + (x - angle.anchorX) + layout.shear * drop);
        const destY = Math.round(layout.groundY + drop);
        if (destX < 0 || destY < 0 || destX >= canvas.width || destY >= canvas.height) continue;
        const index = destY * canvas.width + destX;
        alpha[index] = Math.max(alpha[index] ?? 0, coverage / 255);
      }
    }
    boxBlur(alpha, canvas.width, canvas.height, layout.blur);
    const image = context.createImageData(canvas.width, canvas.height);
    const [red, green, blue] = shadowColorRgb();
    for (let index = 0; index < alpha.length; index += 1) {
      const coverage = Math.min(1, (alpha[index] ?? 0) * SHADOW_ALPHA);
      image.data[index * 4] = red;
      image.data[index * 4 + 1] = green;
      image.data[index * 4 + 2] = blue;
      image.data[index * 4 + 3] = Math.round(coverage * 255);
    }
    context.putImageData(image, 0, 0);
    scene.textures.addCanvas(key, canvas);
    return key;
  }

  function shadowOrigin(set: AngleSetName, angleIndex: number) {
    const angle = HORSE_ANGLES[set][angleIndex];
    if (!angle) return { x: 0.5, y: 1 };
    const layout = shadowLayout(angle.frameW, angle.frameH, angle.anchorX, angle.anchorY);
    return { x: layout.groundX / layout.width, y: layout.groundY / layout.height };
  }

  return { bakedKey, shadowKey, shadowOrigin };
}

function readPixels(image: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return new Uint8ClampedArray(width * height * 4);
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function boxBlur(alpha: Float32Array, width: number, height: number, radius: number) {
  if (radius <= 0) return;
  const tmp = new Float32Array(alpha.length);
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) {
      sum += alpha[y * width + clampIndex(x, width)] ?? 0;
    }
    for (let x = 0; x < width; x += 1) {
      tmp[y * width + x] = sum / window;
      sum -= alpha[y * width + clampIndex(x - radius, width)] ?? 0;
      sum += alpha[y * width + clampIndex(x + radius + 1, width)] ?? 0;
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) {
      sum += tmp[clampIndex(y, height) * width + x] ?? 0;
    }
    for (let y = 0; y < height; y += 1) {
      alpha[y * width + x] = sum / window;
      sum -= tmp[clampIndex(y - radius, height) * width + x] ?? 0;
      sum += tmp[clampIndex(y + radius + 1, height) * width + x] ?? 0;
    }
  }
}

function clampIndex(index: number, size: number) {
  if (index < 0) return 0;
  if (index >= size) return size - 1;
  return index;
}
