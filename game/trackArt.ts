import {
  LOGICAL_PER_METER,
  RAIL_FAR_Y_M,
  STANDS_Y_M,
  TILE_M,
  TREES_BEHIND_RAIL_M,
  farRailRadius,
  nearRailRadius,
} from "./artScale";
import { groundAt } from "./cameraFrame";
import {
  CHUTE,
  STRAIGHT,
  STRAIGHT_BACK,
  finishGoalX,
  projectWithCamera,
  sampleLoopLogical,
  type Camera,
  type TrackPose,
} from "./track";

export type Vec2 = { x: number; y: number };

const HALF = STRAIGHT / 2;

export function cameraForward(camera: Camera): Vec2 {
  return { x: -Math.sin(camera.yaw), y: Math.cos(camera.yaw) };
}

export function isDirt(x: number, y: number) {
  const far = farRailRadius();
  const near = nearRailRadius();
  const chuteEnd = STRAIGHT_BACK / 2 + CHUTE;
  if (x >= HALF && x <= chuteEnd + 1 && y <= -far && y >= -near) return true;
  if (x < -HALF) {
    const dist = Math.hypot(x + HALF, y);
    return dist >= far && dist <= near;
  }
  if (x > HALF) {
    const dist = Math.hypot(x - HALF, y);
    return dist >= far && dist <= near;
  }
  const across = Math.abs(y);
  return across >= far && across <= near;
}

export function groundUv(x: number, y: number) {
  const metersX = x / LOGICAL_PER_METER;
  const metersY = y / LOGICAL_PER_METER;
  return { u: metersX / TILE_M, v: metersY / TILE_M };
}

export function projectHeight(x: number, y: number, z: number, camera: Camera): TrackPose {
  return projectWithCamera({ x, y, z, tx: 0, ty: 0 }, camera);
}

/** Closed oval, about one sample per meter. The first point is not repeated. */
export function ovalPolyline(radius: number): Vec2[] {
  const loopLength = STRAIGHT * 2 + Math.PI * radius * 2;
  const steps = Math.max(24, Math.round(loopLength / LOGICAL_PER_METER));
  return sampleLoopLogical(radius, steps).map((point) => ({ x: point.x, y: point.y }));
}

/** Open chute sticking past the right end of the oval, on the back-straight side. */
export function chutePolyline(radius: number): Vec2[] {
  const chuteEnd = STRAIGHT_BACK / 2 + CHUTE;
  const points: Vec2[] = [{ x: HALF, y: -radius }];
  if (chuteEnd <= HALF) return points;
  const extra = Math.max(1, Math.ceil((chuteEnd - HALF) / LOGICAL_PER_METER));
  for (let index = 1; index <= extra; index += 1) {
    points.push({ x: HALF + ((chuteEnd - HALF) * index) / extra, y: -radius });
  }
  return points;
}

export function offsetAlong(points: readonly Vec2[], direction: Vec2, meters: number): Vec2[] {
  const distance = meters * LOGICAL_PER_METER;
  return points.map((point) => ({
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
  }));
}

export function treesOffsetM() {
  return TREES_BEHIND_RAIL_M;
}

/**
 * Meters outside the home-straight outer rail.
 * The art sheet sits this far past its far rail. On this oval that far rail is
 * the inner rail, so the same gap is measured outward from the outer rail.
 */
export function standsOutsideHomeRailM() {
  return RAIL_FAR_Y_M - STANDS_Y_M;
}

/** Home straight only. Every point is on the turf outside the outer rail. */
export function homeOuterStandLine(): Vec2[] {
  const y = nearRailRadius() + standsOutsideHomeRailM() * LOGICAL_PER_METER;
  const half = STRAIGHT / 2;
  const steps = Math.max(2, Math.round(STRAIGHT / LOGICAL_PER_METER));
  const points: Vec2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    points.push({ x: -half + (STRAIGHT * index) / steps, y });
  }
  return points;
}

export function finishCheckerQuad() {
  const depth = 0.9 * LOGICAL_PER_METER;
  const x = finishGoalX();
  const far = farRailRadius();
  const near = nearRailRadius();
  return {
    x0: x - depth / 2,
    x1: x + depth / 2,
    y0: far,
    y1: near,
  };
}

/** Unproject a screen cell. Returns null when a corner misses the ground or the cell spans too far. */
export function unprojectCell(camera: Camera, sx0: number, sy0: number, sx1: number, sy1: number) {
  const corners = [
    groundAt(camera, sx0, sy0),
    groundAt(camera, sx1, sy0),
    groundAt(camera, sx0, sy1),
    groundAt(camera, sx1, sy1),
  ];
  if (corners.some((corner) => !corner.ok)) return null;
  let maxSpan = 0;
  for (let i = 0; i < corners.length; i += 1) {
    for (let j = i + 1; j < corners.length; j += 1) {
      const a = corners[i];
      const b = corners[j];
      if (!a || !b) continue;
      maxSpan = Math.max(maxSpan, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return {
    corners: corners.map((corner) => ({ x: corner.x, y: corner.y })),
    spanM: maxSpan / LOGICAL_PER_METER,
  };
}

export { farRailRadius, nearRailRadius };
