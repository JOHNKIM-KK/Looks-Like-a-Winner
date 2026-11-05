import sheet from "../public/horses/horses.json";
import wideSheet from "../public/horses/wide/wide.json";
import { HORSE_PX_PER_M, SHADOW_ALPHA, SHADOW_BLUR_PX, SHADOW_SHEAR, SHADOW_SQUASH } from "./artScale";
import { REFERENCE } from "./stage";

export const HORSE_FPS = sheet.fps;
export const HORSE_FRAMES = sheet.frames;
export const START_FRAME_OFFSET = [0, 5, 9, 2, 7, 4, 11, 6] as const;

export type AngleSetName = "straight" | "corner" | "wide";

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

type RawAngle = Pick<
  (typeof sheet.sets.straight.angles)[number],
  "index" | "yaw_deg" | "frame_w" | "frame_h" | "anchor" | "plate_per_frame" | "color" | "mask"
>;

function readAngle(raw: RawAngle, dir = ""): HorseAngle {
  const anchor = raw.anchor;
  return {
    index: raw.index,
    yawDeg: raw.yaw_deg,
    frameW: raw.frame_w,
    frameH: raw.frame_h,
    anchorX: anchor[0] ?? 0,
    anchorY: anchor[1] ?? 0,
    plates: raw.plate_per_frame.map((plate) => ({ cx: plate.cx, cy: plate.cy, h: plate.h })),
    colorFile: `${dir}${raw.color}`,
    maskFile: `${dir}${raw.mask}`,
  };
}

export const HORSE_ANGLES: Record<AngleSetName, HorseAngle[]> = {
  straight: sheet.sets.straight.angles.map((raw) => readAngle(raw)),
  corner: sheet.sets.corner.angles.map((raw) => readAngle(raw)),
  wide: wideSheet.angles.map((raw) => readAngle(raw, "wide/")),
};

export type HeadingView = {
  /** -90..90. Negative shows the front 3/4, positive the rear 3/4. */
  sheetYaw: number;
  /** Sheets face +screen x; true when the camera sees the horse's other flank. */
  flip: boolean;
  /** |dot(toCam, right)| / |toCam|. Near 0 the camera is dead ahead or behind. */
  side: number;
};

export function headingView(tx: number, ty: number, toCamX: number, toCamY: number): HeadingView {
  const length = Math.hypot(tx, ty) || 1;
  const hx = tx / length;
  const hy = ty / length;
  const dotH = toCamX * hx + toCamY * hy;
  const dotR = toCamX * hy - toCamY * hx;
  return {
    sheetYaw: (Math.atan2(-dotH, Math.abs(dotR)) * 180) / Math.PI,
    flip: dotR > 0,
    side: Math.abs(dotR) / (Math.hypot(toCamX, toCamY) || 1),
  };
}

export function cameraElevationDeg(cameraHeight: number, toCamX: number, toCamY: number) {
  return (Math.atan2(cameraHeight, Math.hypot(toCamX, toCamY)) * 180) / Math.PI;
}

type Bucket = { set: AngleSetName; index: number; yawDeg: number };

export type PickedAngle = Bucket & { flip: boolean };

function bucketsOf(set: AngleSetName, angles: HorseAngle[]): Bucket[] {
  return angles.map((angle) => ({ set, index: angle.index, yawDeg: angle.yawDeg }));
}

/** Base (24°) views ordered by yaw: wide front, straight, wide rear. */
const BASE_BUCKETS: Bucket[] = [
  ...bucketsOf("wide", HORSE_ANGLES.wide.filter((angle) => angle.yawDeg < 0)),
  ...bucketsOf("straight", HORSE_ANGLES.straight),
  ...bucketsOf("wide", HORSE_ANGLES.wide.filter((angle) => angle.yawDeg > 0)),
];
const CORNER_BUCKETS = bucketsOf("corner", HORSE_ANGLES.corner);

const YAW_HOLD_DEG = 7.5 + 3;
const CORNER_ENTER_DEG = 15;
const CORNER_EXIT_DEG = 18;
const CORNER_REACH_DEG = 10;
const CORNER_HOLD_DEG = CORNER_REACH_DEG + 3;
const FLIP_HOLD_SIDE = 0.05;

/** Half-open ranges split at midpoints between centers; the ends clamp. */
function baseBucket(yaw: number): Bucket {
  let picked = BASE_BUCKETS[0] as Bucket;
  for (const bucket of BASE_BUCKETS.slice(1)) {
    if (yaw < (picked.yawDeg + bucket.yawDeg) / 2) break;
    picked = bucket;
  }
  return picked;
}

function cornerBucket(yaw: number, prev: PickedAngle | undefined): Bucket | null {
  if (prev?.set === "corner" && Math.abs(yaw - prev.yawDeg) <= CORNER_HOLD_DEG) return prev;
  let best: Bucket | null = null;
  for (const bucket of CORNER_BUCKETS) {
    const dist = Math.abs(yaw - bucket.yawDeg);
    if (dist <= CORNER_REACH_DEG && (!best || dist < Math.abs(yaw - best.yawDeg))) best = bucket;
  }
  return best;
}

/** HEADING_RULE §4: per-horse hysteresis on yaw bucket, sheet set, and near-axis flip. */
export function pickHorseAngle(view: HeadingView, elevationDeg: number, prev?: PickedAngle): PickedAngle {
  const flip = view.side < FLIP_HOLD_SIDE && prev ? prev.flip : view.flip;
  const yaw = view.sheetYaw;
  const useCorner = elevationDeg < (prev?.set === "corner" ? CORNER_EXIT_DEG : CORNER_ENTER_DEG);
  const corner = useCorner ? cornerBucket(yaw, prev) : null;
  const held = prev && prev.set !== "corner" && Math.abs(yaw - prev.yawDeg) <= YAW_HOLD_DEG ? prev : null;
  const bucket = corner ?? held ?? baseBucket(yaw);
  return { set: bucket.set, index: bucket.index, yawDeg: bucket.yawDeg, flip };
}

/**
 * Gallop sheet frame whose legs sit most under the body (quarter view, index 4).
 * There is no authored idle, so the gate holds this pose instead of a frozen stride.
 */
export const IDLE_FRAME = 4;

export function gallopFrame(horseNumber: number, animSeconds: number, fps = HORSE_FPS) {
  // Lanes 9–12 share the eight horse and jockey sheets. The offset wraps with them.
  const offset = START_FRAME_OFFSET[(Math.max(1, horseNumber) - 1) % START_FRAME_OFFSET.length] ?? 0;
  const tick = Math.floor(Math.max(0, animSeconds) * fps);
  return (offset + tick) % HORSE_FRAMES;
}

export function glyphHeightPx(plateH: number, spriteScale: number, viewShortSide: number = REFERENCE.height) {
  const minimum = (48 * viewShortSide) / 1080;
  return Math.max(minimum, 1.15 * plateH * spriteScale);
}

const GLYPH_FONT_RATIO = 1.3;

export function glyphFontPx(glyphHeight: number) {
  return GLYPH_FONT_RATIO * glyphHeight;
}

export function glyphOutlinePx(glyphHeight: number) {
  return Math.max(3, glyphHeight * 0.12);
}

const GLYPH_RASTER_PX = [32, 64, 128, 256, 512] as const;

/**
 * Font size a plate number is rasterized at; the text scale covers the rest.
 * Every font or stroke change redraws and re-uploads the text canvas, and close cameras ask for 3000px glyphs.
 */
export function glyphRaster(fontPx: number) {
  const font = GLYPH_RASTER_PX.find((px) => px >= fontPx) ?? GLYPH_RASTER_PX[GLYPH_RASTER_PX.length - 1];
  return { font, outline: glyphOutlinePx(font / GLYPH_FONT_RATIO), scale: fontPx / font };
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

/** Channel-wise product of two 0xRRGGBB tints. */
export function multiplyTint(a: number, b: number) {
  const channel = (shift: number) => Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Rec.601 luminance of a color-sheet pixel. */
export function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Jockey silks use a steeper gamma than the saddle cloth. The mask is G only. */
export const JOCKEY_TINT_GAMMA = 1.4;

function gainByte(gain: number) {
  return Math.round(255 * Math.min(1, Math.max(0, gain)));
}

/**
 * One overlay per angle, shared by every lane: RGB is the shading gain, alpha the mask coverage.
 * Drawn over the bay color sheet with a lane-color tint, it gives coat × (1 − m) + lane × gain × m.
 * Silks (mask G): gain (lum/185)^1.1. Number plate (mask B): gain lum/200.
 */
export function clothOverlayPixels(color: Uint8ClampedArray, mask: Uint8ClampedArray, out: Uint8ClampedArray) {
  for (let i = 0; i < color.length; i += 4) {
    const a = color[i + 3] ?? 0;
    const maskG = (mask[i + 1] ?? 0) / 255;
    const maskB = (mask[i + 2] ?? 0) / 255;
    const cover = maskG + maskB;
    let gain = 0;
    if (cover > 0 && a > 0) {
      const lum = luminance(color[i] ?? 0, color[i + 1] ?? 0, color[i + 2] ?? 0);
      gain = (((lum / 185) ** 1.1) * maskG + (lum / 200) * maskB) / cover;
    }
    const value = gainByte(gain);
    out[i] = value;
    out[i + 1] = value;
    out[i + 2] = value;
    out[i + 3] = gain > 0 ? Math.round(a * Math.min(1, cover)) : 0;
  }
}

/** Jockey counterpart of `clothOverlayPixels`: silks only (mask G), gamma `JOCKEY_TINT_GAMMA`. */
export function silksOverlayPixels(color: Uint8ClampedArray, mask: Uint8ClampedArray, out: Uint8ClampedArray) {
  for (let i = 0; i < color.length; i += 4) {
    const a = color[i + 3] ?? 0;
    const maskG = (mask[i + 1] ?? 0) / 255;
    let gain = 0;
    if (maskG > 0 && a > 0) {
      gain = (luminance(color[i] ?? 0, color[i + 1] ?? 0, color[i + 2] ?? 0) / 185) ** JOCKEY_TINT_GAMMA;
    }
    const value = gainByte(gain);
    out[i] = value;
    out[i + 1] = value;
    out[i + 2] = value;
    out[i + 3] = gain > 0 ? Math.round(a * maskG) : 0;
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
