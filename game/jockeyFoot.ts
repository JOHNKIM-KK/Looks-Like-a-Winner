import sheet from "../public/jockey/jockey.json";
import { HORSE_PX_PER_M } from "./artScale";
import type { PickedAngle } from "./horseVisual";

/**
 * Jockey on foot: the `run` loop and the `fall` one-shot. Both sheets are authored
 * at 0.7 of the horse scale and have no `wide` set, so a wide pick maps to the
 * straight angle with the nearest yaw.
 */
export type FootAction = "run" | "fall";
export type FootSet = "straight" | "corner";

export type FootAngle = {
  index: number;
  yawDeg: number;
  frameW: number;
  frameH: number;
  frames: number;
  colorFile: string;
  /** Feet anchor per frame, sheet pixels. */
  ground: readonly (readonly [number, number])[];
  hipsHeightM: readonly number[];
};

type RawAngle = {
  index: number;
  yaw_deg: number;
  color: string;
  frame_w: number;
  frame_h: number;
  per_frame: { ground_px: number[]; hips_height_m: number }[];
};

const FOOT_FPS = sheet.fps;
export const FOOT_PX_PER_M = sheet.px_per_m;
/** Foot sprite scale as a multiple of the horse sprite scale at the same depth. */
export const FOOT_SCALE = HORSE_PX_PER_M / FOOT_PX_PER_M;
export const FALL_FRAMES = sheet.actions.fall.frames;
export const RUN_FRAMES = sheet.actions.run.frames;
/** Saddle hip height the fall starts from, metres. */
export const SADDLE_HIPS_M = 1.45;

function read(action: FootAction, set: FootSet): FootAngle[] {
  const raws = sheet.actions[action].sets[set].angles as unknown as RawAngle[];
  return raws.map((raw) => ({
    index: raw.index,
    yawDeg: raw.yaw_deg,
    frameW: raw.frame_w,
    frameH: raw.frame_h,
    frames: raw.per_frame.length,
    colorFile: raw.color,
    ground: raw.per_frame.map((frame) => [frame.ground_px[0] ?? 0, frame.ground_px[1] ?? 0] as const),
    hipsHeightM: raw.per_frame.map((frame) => frame.hips_height_m),
  }));
}

export const FOOT_ANGLES: Record<FootAction, Record<FootSet, FootAngle[]>> = {
  run: { straight: read("run", "straight"), corner: read("run", "corner") },
  fall: { straight: read("fall", "straight"), corner: read("fall", "corner") },
};

export function footKey(action: FootAction, set: FootSet, index: number) {
  return `foot-${action}-${set}-${index}`;
}

/** Same angle the horse would draw. Wide has no foot sheet, so it falls back to the nearest straight yaw. */
export function pickFootAngle(picked: PickedAngle): { set: FootSet; index: number } {
  if (picked.set === "corner") return { set: "corner", index: picked.index };
  if (picked.set === "straight") return { set: "straight", index: picked.index };
  let best = FOOT_ANGLES.run.straight[0];
  for (const angle of FOOT_ANGLES.run.straight) {
    if (!best || Math.abs(angle.yawDeg - picked.yawDeg) < Math.abs(best.yawDeg - picked.yawDeg)) best = angle;
  }
  return { set: "straight", index: best?.index ?? 2 };
}

export function fallFrame(sinceDismount: number) {
  return Math.min(FALL_FRAMES - 1, Math.max(0, Math.floor(sinceDismount * FOOT_FPS)));
}

export function runFrame(animSeconds: number, offset: number) {
  return (Math.floor(animSeconds * FOOT_FPS) + offset) % RUN_FRAMES;
}

/** Metres the hips sit above the ground during the fall. Starts at saddle height and lands on the hip height. */
export function fallHeightM(sinceDismount: number, landedHipsM: number) {
  const t = Math.min(1, Math.max(0, sinceDismount / ((FALL_FRAMES - 1) / FOOT_FPS)));
  return SADDLE_HIPS_M * (1 - t * t) + landedHipsM * t * t;
}
