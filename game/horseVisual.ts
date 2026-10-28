import sheet from "../public/horses/horses.json";
import { HORSE_PX_PER_M, SHADOW_ALPHA, SHADOW_BLUR_PX, SHADOW_SHEAR, SHADOW_SQUASH } from "./artScale";
import { laneColorValue } from "./laneColors";

export const HORSE_FPS = sheet.fps;
export const HORSE_FRAMES = sheet.frames;
export const START_FRAME_OFFSET = [0, 5, 9, 2, 7, 4, 11, 6] as const;

export const STRAIGHT_ELEVATION_DEG = sheet.sets.straight.camera_elevation_deg;
export const CORNER_ELEVATION_DEG = sheet.sets.corner.camera_elevation_deg;
const ELEVATION_SPLIT_DEG = (STRAIGHT_ELEVATION_DEG + CORNER_ELEVATION_DEG) / 2;

export type AngleSetName = "straight" | "corner";

export type PlateRect = { cx: number; cy: number; h: number };

export type HorseAngle = {
  index: number;
  yawDeg: number;
  frameW: number;
  frameH: number;
  anchorX: number;
  anchorY: number;
  plates: PlateRect[];
  colorFile: string;
  maskFile: string;
};

type RawAngle = (typeof sheet.sets.straight.angles)[number];

function readAngle(raw: RawAngle): HorseAngle {
  const anchor = raw.anchor;
  return {
    index: raw.index,
    yawDeg: raw.yaw_deg,
    frameW: raw.frame_w,
    frameH: raw.frame_h,
    anchorX: anchor[0] ?? 0,
    anchorY: anchor[1] ?? 0,
    plates: raw.plate_per_frame.map((plate) => ({ cx: plate.cx, cy: plate.cy, h: plate.h })),
    colorFile: raw.color,
    maskFile: raw.mask,
  };
}

export const HORSE_ANGLES: Record<AngleSetName, HorseAngle[]> = {
  straight: sheet.sets.straight.angles.map(readAngle),
  corner: sheet.sets.corner.angles.map(readAngle),
};

export function angleSetForElevation(elevationDeg: number): AngleSetName {
  return elevationDeg < ELEVATION_SPLIT_DEG ? "corner" : "straight";
}

/**
 * Camera-relative yaw in degrees.
 * yaw = atan2(-dot(toCam, heading), dot(toCam, rightOfHeading)).
 * Negative means the camera is in front of the horse.
 */
export function relativeYawDeg(headingX: number, headingY: number, toCamX: number, toCamY: number) {
  const length = Math.hypot(headingX, headingY) || 1;
  const hx = headingX / length;
  const hy = headingY / length;
  const rx = hy;
  const ry = -hx;
  const dotH = toCamX * hx + toCamY * hy;
  const dotR = toCamX * rx + toCamY * ry;
  return (Math.atan2(-dotH, dotR) * 180) / Math.PI;
}

export type PickedAngle = {
  set: AngleSetName;
  index: number;
  yawDeg: number;
  flip: boolean;
};

/** Nearest authored yaw. |yaw| > 90° mirrors the sheet (inside of the bend). */
export function pickHorseAngle(yawDeg: number, elevationDeg: number): PickedAngle {
  const set = angleSetForElevation(elevationDeg);
  let yaw = yawDeg;
  let flip = false;
  if (Math.abs(yaw) > 90) {
    flip = true;
    yaw = yaw > 0 ? yaw - 180 : yaw + 180;
  }
  const angles = HORSE_ANGLES[set];
  let best = 0;
  let bestDist = Infinity;
  for (let index = 0; index < angles.length; index += 1) {
    const dist = Math.abs(yaw - (angles[index]?.yawDeg ?? 0));
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return { set, index: best, yawDeg: angles[best]?.yawDeg ?? 0, flip };
}

/**
 * Gallop sheet frame whose legs sit most under the body (quarter view, index 4).
 * There is no authored idle, so the gate holds this pose instead of a frozen stride.
 */
export const IDLE_FRAME = 4;

export function gallopFrame(horseNumber: number, animSeconds: number, fps = HORSE_FPS) {
  const offset = START_FRAME_OFFSET[(Math.max(1, horseNumber) - 1) % START_FRAME_OFFSET.length] ?? 0;
  const tick = Math.floor(Math.max(0, animSeconds) * fps);
  return (offset + tick) % HORSE_FRAMES;
}

export function glyphHeightPx(plateH: number, spriteScale: number, viewWidth = 540) {
  const minimum = (48 * viewWidth) / 1080;
  return Math.max(minimum, 1.15 * plateH * spriteScale);
}

export function glyphFontPx(glyphHeight: number) {
  return 1.3 * glyphHeight;
}

export function glyphOutlinePx(glyphHeight: number) {
  return Math.max(3, glyphHeight * 0.12);
}

/** Plate center relative to the ground anchor, in screen pixels. Flip mirrors across the anchor. */
export function plateScreenOffset(plate: PlateRect, anchorX: number, anchorY: number, spriteScale: number, flip: boolean) {
  const dx = plate.cx - anchorX;
  const dy = plate.cy - anchorY;
  return {
    x: dx * spriteScale * (flip ? -1 : 1),
    y: dy * spriteScale,
  };
}

export function laneRgb(laneNumber: number): readonly [number, number, number] {
  const hex = laneColorValue(laneNumber);
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function clampByte(value: number) {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

/** Rec.601 luminance of a color-sheet pixel. */
export function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Jockey silks use a steeper gamma than the saddle cloth. The mask is G only. */
export const JOCKEY_TINT_GAMMA = 1.4;

/**
 * Silks (mask G): lane × (lum/185)^1.1, blended by G.
 * Number plate (mask B): lane × (lum/200), blended by B.
 * Coat (mask R, and everywhere else) stays the bay color sheet.
 */
export function tintHorsePixels(
  color: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  lane: readonly [number, number, number],
  out: Uint8ClampedArray,
) {
  const [lr, lg, lb] = lane;
  const pixels = color.length;
  for (let i = 0; i < pixels; i += 4) {
    const r = color[i] ?? 0;
    const g = color[i + 1] ?? 0;
    const b = color[i + 2] ?? 0;
    const a = color[i + 3] ?? 0;
    const maskG = (mask[i + 1] ?? 0) / 255;
    const maskB = (mask[i + 2] ?? 0) / 255;
    let or = r;
    let og = g;
    let ob = b;
    if ((maskG > 0 || maskB > 0) && a > 0) {
      const lum = luminance(r, g, b);
      if (maskG > 0) {
        const gain = (lum / 185) ** 1.1;
        or = or * (1 - maskG) + lr * gain * maskG;
        og = og * (1 - maskG) + lg * gain * maskG;
        ob = ob * (1 - maskG) + lb * gain * maskG;
      }
      if (maskB > 0) {
        const gain = lum / 200;
        or = or * (1 - maskB) + lr * gain * maskB;
        og = og * (1 - maskB) + lg * gain * maskB;
        ob = ob * (1 - maskB) + lb * gain * maskB;
      }
    }
    out[i] = clampByte(or);
    out[i + 1] = clampByte(og);
    out[i + 2] = clampByte(ob);
    out[i + 3] = a;
  }
}

/**
 * Riding jockey. Mask G only, lane × (lum/185)^1.4.
 * Mask R and B stay on the color sheet until the jockey mask is repainted.
 */
export function tintJockeyPixels(
  color: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  lane: readonly [number, number, number],
  out: Uint8ClampedArray,
) {
  const [lr, lg, lb] = lane;
  const pixels = color.length;
  for (let i = 0; i < pixels; i += 4) {
    const r = color[i] ?? 0;
    const g = color[i + 1] ?? 0;
    const b = color[i + 2] ?? 0;
    const a = color[i + 3] ?? 0;
    const maskG = (mask[i + 1] ?? 0) / 255;
    let or = r;
    let og = g;
    let ob = b;
    if (maskG > 0 && a > 0) {
      const gain = (luminance(r, g, b) / 185) ** JOCKEY_TINT_GAMMA;
      or = or * (1 - maskG) + lr * gain * maskG;
      og = og * (1 - maskG) + lg * gain * maskG;
      ob = ob * (1 - maskG) + lb * gain * maskG;
    }
    out[i] = clampByte(or);
    out[i + 1] = clampByte(og);
    out[i + 2] = clampByte(ob);
    out[i + 3] = a;
  }
}

export type ShadowLayout = {
  width: number;
  height: number;
  groundX: number;
  groundY: number;
  shear: number;
  squash: number;
  blur: number;
};

/**
 * Baked shadow bitmap. The cast is the horse squashed to 30% and sheared
 * down-screen (lower right): light stays at the upper left, so the body
 * falls below the ground contact instead of sitting under the sprite.
 */
export function shadowLayout(frameW: number, frameH: number, anchorX: number, anchorY: number): ShadowLayout {
  const squash = SHADOW_SQUASH;
  const shear = SHADOW_SHEAR;
  const blur = SHADOW_BLUR_PX;
  const maxDrop = anchorY * squash;
  const maxShear = shear * maxDrop;
  const pad = blur + 2;
  const groundX = Math.ceil(Math.max(0, anchorX) + pad);
  const groundY = pad;
  const width = Math.ceil(groundX + Math.max(0, frameW - anchorX) + maxShear + pad);
  const height = Math.ceil(groundY + maxDrop + pad);
  return { width, height, groundX, groundY, shear, squash, blur };
}

export function shadowColorRgb(): [number, number, number] {
  return [0x46, 0x20, 0x0e];
}

export { HORSE_PX_PER_M, SHADOW_ALPHA };
