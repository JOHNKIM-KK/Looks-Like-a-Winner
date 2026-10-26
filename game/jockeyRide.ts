import sheet from "../public/jockey/jockey.json";
import type { AngleSetName } from "./horseVisual";

/**
 * Riding jockey only. run / fall / jump sheets stay on disk for phase 3
 * and are not referenced here.
 * `horse_attach` is the hips in horse-sheet pixels. The ride sheet's
 * top-left sits at `offset_in_horse_frame`, so the hips land inside that sheet.
 */
export type RideAngle = {
  index: number;
  frameW: number;
  frameH: number;
  offsetX: number;
  offsetY: number;
  colorFile: string;
  maskFile: string;
};

type RawRide = {
  index: number;
  color: string;
  mask: string;
  frame_w: number;
  frame_h: number;
  offset_in_horse_frame: number[];
};

function readRide(raw: RawRide): RideAngle {
  return {
    index: raw.index,
    frameW: raw.frame_w,
    frameH: raw.frame_h,
    offsetX: raw.offset_in_horse_frame[0] ?? 0,
    offsetY: raw.offset_in_horse_frame[1] ?? 0,
    colorFile: raw.color,
    maskFile: raw.mask,
  };
}

export const RIDE_ANGLES: Record<AngleSetName, RideAngle[]> = {
  straight: sheet.actions.ride.sets.straight.angles.map(readRide),
  corner: sheet.actions.ride.sets.corner.angles.map(readRide),
};

export const RIDE_PX_PER_M = 96.9697;

type Pair = readonly [number, number];

/** Hips inside the horse sheet, in frame pixels, for this angle and gallop frame. */
export function horseAttach(set: AngleSetName, angleIndex: number, frame: number): Pair {
  const rows = sheet.horse_attach.sets[set] as unknown as number[][][];
  const frames = rows[angleIndex] ?? [];
  const point = frames[frame] ?? frames[0] ?? [0, 0];
  return [point[0] ?? 0, point[1] ?? 0];
}

export type RidePose = {
  originX: number;
  originY: number;
  frameW: number;
  frameH: number;
  /** Offset from the horse ground anchor, in screen pixels. */
  x: number;
  y: number;
};

/** Place the ride sheet so its hips sit on `horse_attach` for this frame. */
export function ridePose(
  set: AngleSetName,
  angleIndex: number,
  frame: number,
  horseAnchorX: number,
  horseAnchorY: number,
  scale: number,
  flip: boolean,
): RidePose | null {
  const angle = RIDE_ANGLES[set][angleIndex];
  if (!angle || angle.frameW < 1 || angle.frameH < 1) return null;
  const [hipsX, hipsY] = horseAttach(set, angleIndex, frame);
  const localX = hipsX - angle.offsetX;
  const localY = hipsY - angle.offsetY;
  return {
    originX: localX / angle.frameW,
    originY: localY / angle.frameH,
    frameW: angle.frameW,
    frameH: angle.frameH,
    x: (hipsX - horseAnchorX) * scale * (flip ? -1 : 1),
    y: (hipsY - horseAnchorY) * scale,
  };
}
