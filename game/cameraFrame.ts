import { cameraConfig, type FrameFitRule, type FrameIncludePolicy } from "./cameraConfig";
import {
  CORNER_IN_ELEVATION,
  CORNER_OUT_ELEVATION,
  STRAIGHT_EARLY_ELEVATION,
  STRAIGHT_HOME_ELEVATION,
  cameraFromLook,
  type CameraLook,
  type CameraStateName,
} from "./cameraState";
import {
  STRAIGHT,
  outerRailRadius,
  projectWithCamera,
  segmentEnds,
  type Camera,
} from "./track";

export const GAME_WIDTH = cameraConfig.view.width;
export const GAME_HEIGHT = cameraConfig.view.height;
export const FRAME_LEFT = GAME_WIDTH * cameraConfig.view.marginX;
export const FRAME_RIGHT = GAME_WIDTH * (1 - cameraConfig.view.marginX);
export const HUD_TOP = cameraConfig.view.hudTop;
export const BANNER_TOP = cameraConfig.view.bannerTop;
export const FRAME_TOP = GAME_HEIGHT * HUD_TOP;
export const FRAME_BOTTOM = GAME_HEIGHT * BANNER_TOP;
export const FRAME_DAMP_SEC = cameraConfig.framing.dampSec;
export const GRASS_TARGET = cameraConfig.framing.grassTarget;
export const STRAIGHT_GRASS_MAX = cameraConfig.framing.straightGrassMax;
export const CORNER_BACKGROUND_MAX = cameraConfig.framing.cornerBackgroundMax;
export const LANE_AREA_TOP = cameraConfig.framing.laneAreaTop;
export const LANE_AREA_BOTTOM = cameraConfig.framing.laneAreaBottom;
export const CORNER_SAGITTA_MIN = cameraConfig.framing.cornerSagittaMin;

const SPRITE_W = 213;
const SPRITE_H = 211;
const HORSE_H = 96;
const CENTER_X = 270;
const CENTER_Y = 555;
const HALF = STRAIGHT / 2;

export type FrameSubject = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Stable id for `requestFrameInclude`. Omitted subjects cannot be force-included. */
  id?: string;
  /** 1-based live rank. Missing rank is outside the top-N set. */
  rank?: number;
};

/** State-camera key used by `cameraConfig.framing.rules`. STRAIGHT splits on the home straight. */
export type FramingStateKey =
  | "START"
  | "STRAIGHT_EARLY"
  | "STRAIGHT_HOME"
  | "CORNER_IN"
  | "CORNER_OUT"
  | "FINISH"
  | "CLOSEUP";

export type FrameInclude = {
  horseId: string;
  remaining: number;
};

const frameIncludes: FrameInclude[] = [];

export function framingStateKey(state: CameraStateName, leadProgress: number): FramingStateKey {
  if (state === "STRAIGHT") {
    return leadProgress >= segmentEnds().cornerEnd ? "STRAIGHT_HOME" : "STRAIGHT_EARLY";
  }
  return state;
}

export function framingRuleFor(state: CameraStateName, leadProgress: number): FrameFitRule {
  return cameraConfig.framing.rules[framingStateKey(state, leadProgress)];
}

export function resetFrameIncludes() {
  frameIncludes.length = 0;
}

/**
 * Force `horseId` into the safe rect for `durationSec` of framing time (the `dt` passed to `frameHorseLook`).
 * `includePolicy` "widen" pulls the state camera out. "cut" only records the request so a short cut can show the horse.
 * No skill calls this.
 */
export function requestFrameInclude(horseId: string, durationSec: number) {
  if (!horseId || !Number.isFinite(durationSec) || durationSec <= 0) return;
  const existing = frameIncludes.find((item) => item.horseId === horseId);
  if (existing) existing.remaining = Math.max(existing.remaining, durationSec);
  else frameIncludes.push({ horseId, remaining: durationSec });
}

export function activeFrameIncludes(): FrameInclude[] {
  return frameIncludes.filter((item) => item.remaining > 0).map((item) => ({ ...item }));
}

function tickFrameIncludes(dt: number) {
  if (dt <= 0) return;
  for (let index = frameIncludes.length - 1; index >= 0; index -= 1) {
    const item = frameIncludes[index];
    if (!item) continue;
    item.remaining -= dt;
    if (item.remaining <= 0) frameIncludes.splice(index, 1);
  }
}

/** Horses the widen step must keep inside the safe rect. */
export function subjectsForFrameRule(
  subjects: readonly FrameSubject[],
  rule: FrameFitRule,
  policy: FrameIncludePolicy,
  includeIds: readonly string[] = activeFrameIncludes().map((item) => item.horseId),
  topN: number = cameraConfig.framing.topN,
): FrameSubject[] {
  const ranked =
    rule === "all"
      ? [...subjects]
      : subjects.filter((subject) => (subject.rank ?? Number.POSITIVE_INFINITY) <= topN);
  if (policy !== "widen" || includeIds.length === 0) return ranked;
  const chosen = new Set(ranked);
  const wanted = new Set(includeIds);
  const extra: FrameSubject[] = [];
  for (const subject of subjects) {
    if (subject.id && wanted.has(subject.id) && !chosen.has(subject)) extra.push(subject);
  }
  return extra.length === 0 ? ranked : ranked.concat(extra);
}

export function requiredFrameSubjects(
  subjects: readonly FrameSubject[],
  state: CameraStateName,
  leadProgress: number,
): FrameSubject[] {
  return subjectsForFrameRule(
    subjects,
    framingRuleFor(state, leadProgress),
    cameraConfig.framing.includePolicy,
  );
}

export type FrameAnchor = {
  x: number;
  y: number;
};

export type FrameMemory = {
  distance: number;
  focalLength: number;
  bias: number;
  seeded: boolean;
};

export type SpriteRect = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  height: number;
};

export function createFrameMemory(look: CameraLook): FrameMemory {
  return { distance: look.distance, focalLength: look.focalLength, bias: 0, seeded: false };
}

export function spriteRect(pose: { x: number; y: number; scale: number; lean: number }): SpriteRect {
  const scale = (HORSE_H / SPRITE_H) * pose.scale;
  const halfW = (SPRITE_W / 2) * scale;
  const top = SPRITE_H * 0.9 * scale;
  const bottom = SPRITE_H * 0.1 * scale;
  const rad = (pose.lean * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of [
    [-halfW, -top],
    [halfW, -top],
    [halfW, bottom],
    [-halfW, bottom],
  ]) {
    const x = pose.x + lx * cos - ly * sin;
    const y = pose.y + lx * sin + ly * cos;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY, height: HORSE_H * pose.scale };
}

export function horseFit(look: CameraLook, subjects: FrameSubject[]) {
  const camera = cameraFromLook(look);
  let worst = Infinity;
  const heights: number[] = [];
  for (const subject of subjects) {
    const pose = projectWithCamera(subject, camera);
    if (!pose.visible) return { ok: false, worst: -1e9, median: 0 };
    const rect = spriteRect(pose);
    heights.push(rect.height);
    worst = Math.min(worst, rect.minX - FRAME_LEFT, FRAME_RIGHT - rect.maxX, rect.minY - FRAME_TOP, FRAME_BOTTOM - rect.maxY);
  }
  heights.sort((a, b) => a - b);
  const median = heights.length === 0 ? 0 : heights[Math.floor((heights.length - 1) / 2)] ?? 0;
  return { ok: worst >= -0.4, worst, median };
}

export function shiftLook(look: CameraLook, bias: number): CameraLook {
  const az = (look.azimuth * Math.PI) / 180;
  return {
    ...look,
    targetX: look.targetX + Math.sin(az) * bias,
    targetY: look.targetY + Math.cos(az) * bias,
  };
}

function radial(x: number, y: number) {
  if (x > HALF) return Math.hypot(x - HALF, y);
  if (x < -HALF) return Math.hypot(x + HALF, y);
  return Math.abs(y);
}

export function groundAt(camera: Camera, sx: number, sy: number) {
  const fx = (CENTER_X - sx) / camera.focalLength;
  const fy = (CENTER_Y - sy) / camera.focalLength;
  const cosP = Math.cos(camera.pitch);
  const sinP = Math.sin(camera.pitch);
  const denom = sinP - fy * cosP;
  if (Math.abs(denom) < 1e-6) return { x: 0, y: 0, ok: false };
  const localY = (camera.height * (fy * sinP + cosP)) / denom;
  const depth = localY * cosP + camera.height * sinP;
  if (depth < 10) return { x: 0, y: 0, ok: false };
  const localX = fx * depth;
  const cosY = Math.cos(camera.yaw);
  const sinY = Math.sin(camera.yaw);
  return {
    x: camera.groundX + localX * cosY - localY * sinY,
    y: camera.groundY + localX * sinY + localY * cosY,
    ok: true,
  };
}

/** Worst column of empty grass under the near outer rail, as a fraction of screen height. */
export function grassBelowRailFraction(camera: Camera, lanes = 8) {
  const outer = outerRailRadius(lanes);
  let worst = 0;
  const cols = 18;
  for (let i = 1; i < cols; i += 1) {
    const sx = (i / cols) * GAME_WIDTH;
    const bottom = groundAt(camera, sx, GAME_HEIGHT - 2);
    if (!bottom.ok || radial(bottom.x, bottom.y) <= outer) continue;
    let lo = 2;
    let hi = GAME_HEIGHT - 2;
    for (let step = 0; step < 10; step += 1) {
      const mid = (lo + hi) / 2;
      const sample = groundAt(camera, sx, mid);
      if (sample.ok && radial(sample.x, sample.y) > outer) hi = mid;
      else lo = mid;
    }
    worst = Math.max(worst, (GAME_HEIGHT - hi) / GAME_HEIGHT);
  }
  return worst;
}

const LANE_CENTER_Y = (GAME_HEIGHT * (LANE_AREA_TOP + LANE_AREA_BOTTOM)) / 2;

/** Screen-space bow of the left-hand outer rail that actually falls inside the view. */
export function cornerRailSagitta(camera: Camera, lanes = 8) {
  const radius = outerRailRadius(lanes);
  const points: Array<{ x: number; y: number }> = [];
  const steps = 72;
  for (let i = 0; i <= steps; i += 1) {
    const angle = Math.PI / 2 + (i / steps) * Math.PI;
    const pose = projectWithCamera(
      { x: -HALF + Math.cos(angle) * radius, y: Math.sin(angle) * radius, tx: 0, ty: 0 },
      camera,
    );
    if (pose.visible && pose.x >= 8 && pose.x <= GAME_WIDTH - 8 && pose.y >= 8 && pose.y <= GAME_HEIGHT - 8) {
      points.push(pose);
    }
  }
  if (points.length < 8) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy) || 1;
  if (length < 80) return 0;
  let max = 0;
  for (const point of points) {
    max = Math.max(max, Math.abs((point.x - first.x) * dy - (point.y - first.y) * dx) / length);
  }
  return max;
}

export function anchorVisible(look: CameraLook, anchor: FrameAnchor) {
  const pose = projectWithCamera({ x: anchor.x, y: anchor.y, tx: 0, ty: 0 }, cameraFromLook(look));
  return pose.visible && pose.x >= 0 && pose.x <= GAME_WIDTH && pose.y >= 0 && pose.y <= GAME_HEIGHT;
}

function widened(look: CameraLook, factor: number): CameraLook {
  return {
    ...look,
    distance: look.distance * factor,
    focalLength: look.focalLength / factor,
  };
}

function packSpriteCenterY(look: CameraLook, subjects: FrameSubject[]) {
  const camera = cameraFromLook(look);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const subject of subjects) {
    const pose = projectWithCamera(subject, camera);
    if (!pose.visible) return null;
    const rect = spriteRect(pose);
    minY = Math.min(minY, rect.minY);
    maxY = Math.max(maxY, rect.maxY);
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return null;
  return (minY + maxY) / 2;
}

/**
 * After the fit widen, slide the look target along the view until the pack's
 * sprite box sits on the lane-band center. Stops if another step would clip.
 */
function recenterPack(look: CameraLook, subjects: FrameSubject[]) {
  if (subjects.length === 0) return look;
  let lo = -480;
  let hi = 480;
  let best = look;
  const initial = packSpriteCenterY(look, subjects);
  if (initial === null) return look;
  let bestError = Math.abs(initial - LANE_CENTER_Y);
  for (let step = 0; step < 8; step += 1) {
    const mid = (lo + hi) / 2;
    const candidate = shiftLook(look, mid);
    if (!horseFit(candidate, subjects).ok) {
      if (mid > 0) hi = mid;
      else lo = mid;
      continue;
    }
    const centerY = packSpriteCenterY(candidate, subjects);
    if (centerY === null) return best;
    const error = Math.abs(centerY - LANE_CENTER_Y);
    if (error < bestError) {
      best = candidate;
      bestError = error;
    }
    if (centerY < LANE_CENTER_Y) lo = mid;
    else hi = mid;
  }
  return best;
}

/** Smallest uniform widen that keeps the supplied sprites inside the safe rect. */
function widenToFit(look: CameraLook, subjects: FrameSubject[]) {
  if (subjects.length === 0 || horseFit(look, subjects).ok) return look;
  let lo = 1;
  let hi = 2;
  while (!horseFit(widened(look, hi), subjects).ok && hi < 24) hi *= 2;
  for (let step = 0; step < 10; step += 1) {
    const mid = (lo + hi) / 2;
    if (horseFit(widened(look, mid), subjects).ok) hi = mid;
    else lo = mid;
  }
  return widened(look, hi);
}

function damp(current: number, target: number, dt: number) {
  if (dt <= 0) return target;
  const alpha = 1 - Math.exp(-dt / FRAME_DAMP_SEC);
  return current + (target - current) * alpha;
}

function fitLook(base: CameraLook, subjects: FrameSubject[], state: CameraStateName) {
  const bias = cameraConfig.framing.lookBias[state] ?? 0;
  const shifted = shiftLook(base, bias);
  const fitted = widenToFit(shifted, subjects);
  return { look: recenterPack(fitted, subjects), bias };
}

/**
 * Pull the blended state camera out just enough that the horses selected by
 * the state's framing rule stay inside the safe rect. Distance only increases
 * and focal only drops. A state whose rule is "topN" ignores horses ranked below N
 * unless `requestFrameInclude` is widening for them.
 */
export function solveFramedLook(
  base: CameraLook,
  subjects: FrameSubject[],
  state: CameraStateName,
  anchors: FrameAnchor[],
  leadProgress = 0,
): { look: CameraLook; bias: number } {
  void anchors;
  return fitLook(base, requiredFrameSubjects(subjects, state, leadProgress), state);
}

export function frameHorseLook(
  base: CameraLook,
  subjects: FrameSubject[],
  state: CameraStateName,
  anchors: FrameAnchor[],
  memory: FrameMemory,
  dt: number,
  leadProgress = 0,
): { look: CameraLook; memory: FrameMemory } {
  tickFrameIncludes(dt);
  const required = requiredFrameSubjects(subjects, state, leadProgress);
  const solved = fitLook(base, required, state);
  void anchors;
  if (!memory.seeded || dt <= 0) {
    return {
      look: solved.look,
      memory: { distance: solved.look.distance, focalLength: solved.look.focalLength, bias: solved.bias, seeded: true },
    };
  }
  const distance = Math.max(base.distance, damp(memory.distance, solved.look.distance, dt));
  const focalLength = Math.min(base.focalLength, damp(memory.focalLength, solved.look.focalLength, dt));
  const bias = damp(memory.bias, solved.bias, dt);
  const look = recenterPack(widenToFit(shiftLook({ ...base, distance, focalLength }, bias), required), required);
  return {
    look,
    memory: { distance: look.distance, focalLength: look.focalLength, bias, seeded: true },
  };
}

export function cornerLowerThanStraights() {
  return (
    CORNER_IN_ELEVATION < STRAIGHT_EARLY_ELEVATION &&
    CORNER_IN_ELEVATION < STRAIGHT_HOME_ELEVATION &&
    CORNER_OUT_ELEVATION < STRAIGHT_EARLY_ELEVATION &&
    CORNER_OUT_ELEVATION < STRAIGHT_HOME_ELEVATION
  );
}
