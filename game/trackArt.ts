import {
  LOGICAL_PER_METER,
  STANDS_BEHIND_OUTER_M,
  TILE_M,
  TREES_BEHIND_RAIL_M,
  farRailRadius,
  nearRailRadius,
} from "./artScale";
import { GAME_HEIGHT, GAME_WIDTH, groundAt } from "./cameraFrame";
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

/**
 * Props may not fill the lens.
 * Stands sit across the infield, so they may read as a large background.
 * An outward strip (the old tree line) sits between the camera and the track,
 * so its cap stays lower. Trees are not drawn. The line remains so the cull
 * still rejects a near prop that would cover the track.
 */
export const PROP_MAX_HEIGHT_FRAC = 0.62;
export const TREE_MAX_HEIGHT_FRAC = 0.34;
/** A prop wider than the view is in front of the lens. */
export const PROP_MAX_WIDTH_FRAC = 1;
/** Same near plane as `projectWithCamera`. Points closer than this are behind the picture. */
export const PROP_NEAR_PLANE = 10;

export function propMaxScreenPx(frac = PROP_MAX_HEIGHT_FRAC) {
  return frac * GAME_HEIGHT;
}

export function cameraSpaceDepth(camera: Camera, x: number, y: number, z = 0) {
  const dx = x - camera.groundX;
  const dy = y - camera.groundY;
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const localY = -dx * sinYaw + dy * cosYaw;
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  return localY * cosPitch - (z - camera.height) * sinPitch;
}

/** Outward from the oval. Straights point ±Y; bends point away from the bend center. */
export function outwardFromTrack(point: Vec2): Vec2 {
  if (point.x < -HALF) {
    const dx = point.x + HALF;
    const dy = point.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }
  if (point.x > HALF) {
    const dx = point.x - HALF;
    const dy = point.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }
  return { x: 0, y: point.y >= 0 ? 1 : -1 };
}

/**
 * Trees face away from the oval. Stands face the oval, so the camera across
 * the infield sees the crowd and a stand that has wrapped behind the lens does not.
 */
export function segmentFacesCamera(from: Vec2, to: Vec2, camera: Camera, face: "outward" | "inward") {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const outward = outwardFromTrack(mid);
  const dot = (camera.groundX - mid.x) * outward.x + (camera.groundY - mid.y) * outward.y;
  return face === "outward" ? dot > 0 : dot < 0;
}

/** A single sprite. Rejects anything behind the near plane or taller than the cap. */
export function propSpriteAccepted(camera: Camera, x: number, y: number, heightLu: number) {
  const pose = projectHeight(x, y, 0, camera);
  if (!pose.visible) return false;
  const depth = cameraSpaceDepth(camera, x, y, 0);
  if (depth < PROP_NEAR_PLANE) return false;
  const screen = (camera.focalLength * Math.max(0, heightLu)) / Math.max(depth, 1);
  return screen <= propMaxScreenPx(PROP_MAX_HEIGHT_FRAC);
}

/**
 * One vertical strip segment. Both ends must clear the near plane and the size cap,
 * the face must point at the camera, and the projected quad must fit the view.
 */
export function propStripAccepted(
  camera: Camera,
  from: Vec2,
  to: Vec2,
  above: number,
  below: number,
  face: "outward" | "inward",
) {
  if (!segmentFacesCamera(from, to, camera, face)) return false;
  const height = above + below;
  const cap = propMaxScreenPx(face === "outward" ? TREE_MAX_HEIGHT_FRAC : PROP_MAX_HEIGHT_FRAC);
  const limit = (camera.focalLength * Math.max(0, height)) / cap;
  if (cameraSpaceDepth(camera, from.x, from.y, 0) < limit) return false;
  if (cameraSpaceDepth(camera, to.x, to.y, 0) < limit) return false;
  if (!propSpriteAccepted(camera, from.x, from.y, height)) return false;
  if (!propSpriteAccepted(camera, to.x, to.y, height)) return false;
  const corners = [
    projectHeight(from.x, from.y, above, camera),
    projectHeight(from.x, from.y, -below, camera),
    projectHeight(to.x, to.y, above, camera),
    projectHeight(to.x, to.y, -below, camera),
  ];
  if (corners.some((corner) => !corner.visible)) return false;
  const top = Math.min(...corners.map((corner) => corner.y));
  const bottom = Math.max(...corners.map((corner) => corner.y));
  const left = Math.min(...corners.map((corner) => corner.x));
  const right = Math.max(...corners.map((corner) => corner.x));
  if (bottom - top > propMaxScreenPx(face === "outward" ? TREE_MAX_HEIGHT_FRAC : PROP_MAX_HEIGHT_FRAC)) return false;
  if (right - left > GAME_WIDTH * PROP_MAX_WIDTH_FRAC) return false;
  return true;
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

export type FacingStrip = {
  points: Vec2[];
  /** Points away from the track, toward the turf outside this straight. */
  outward: Vec2;
};

function straightSegment(x0: number, x1: number, y: number): Vec2[] {
  const span = Math.abs(x1 - x0);
  const steps = Math.max(1, Math.round(span / LOGICAL_PER_METER / 12));
  const points: Vec2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    points.push({ x: x0 + ((x1 - x0) * index) / steps, y });
  }
  return points;
}

/**
 * Where the tree strip used to stand, 5 m outside the outer rail.
 * Nothing paints this. Prop-cull tests use it as the near occluder.
 */
export function straightTreeLines(): FacingStrip[] {
  const y = nearRailRadius() + TREES_BEHIND_RAIL_M * LOGICAL_PER_METER;
  const chuteEnd = STRAIGHT_BACK / 2 + CHUTE;
  return [
    { points: straightSegment(-HALF, HALF, y), outward: { x: 0, y: 1 } },
    { points: straightSegment(-HALF, Math.max(HALF, chuteEnd), -y), outward: { x: 0, y: -1 } },
  ];
}

/** True when the camera is on the outside of this strip, so the face points toward it. */
export function stripFacesCamera(strip: FacingStrip, camera: Camera) {
  const mid = strip.points[Math.floor(strip.points.length / 2)] ?? strip.points[0];
  if (!mid) return false;
  const vx = camera.groundX - mid.x;
  const vy = camera.groundY - mid.y;
  return vx * strip.outward.x + vy * strip.outward.y > 0;
}

function standRadius() {
  return nearRailRadius() + STANDS_BEHIND_OUTER_M * LOGICAL_PER_METER;
}

/** Arc outside a bend. Angles are radians around the bend center, CCW from +X. */
function bendArc(cx: number, radius: number, a0: number, a1: number): Vec2[] {
  const span = Math.abs(a1 - a0) * radius;
  const steps = Math.max(1, Math.round(span / LOGICAL_PER_METER / 12));
  const points: Vec2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = a0 + ((a1 - a0) * index) / steps;
    points.push({ x: cx + Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return points;
}

function joinStrips(parts: Vec2[][]): Vec2[] {
  const points: Vec2[] = [];
  for (const part of parts) {
    for (const point of part) {
      const prev = points[points.length - 1];
      if (prev && Math.hypot(prev.x - point.x, prev.y - point.y) < 1) continue;
      points.push(point);
    }
  }
  return points;
}

/**
 * Stands 20 m outside the outermost rail, on the side opposite the camera.
 * The straight in front of the camera wins. A side-on camera (finish) takes the farther rail.
 * Each side includes the bends, so a camera looking down the chute still sees the far curve.
 */
export function standLineOppositeCamera(camera: Camera): Vec2[] {
  const outside = standRadius();
  const forward = cameraForward(camera);
  const homeMark = { x: 0, y: outside };
  const backMark = { x: 0, y: -outside };
  const ahead = (point: Vec2) => (point.x - camera.groundX) * forward.x + (point.y - camera.groundY) * forward.y;
  const homeAhead = ahead(homeMark);
  const backAhead = ahead(backMark);
  let useHome = homeAhead > backAhead;
  if (Math.abs(homeAhead - backAhead) <= LOGICAL_PER_METER) {
    const homeDist = Math.hypot(homeMark.x - camera.groundX, homeMark.y - camera.groundY);
    const backDist = Math.hypot(backMark.x - camera.groundX, backMark.y - camera.groundY);
    useHome = homeDist > backDist;
  }
  if (useHome) {
    return joinStrips([
      bendArc(HALF, outside, 0, Math.PI / 2),
      straightSegment(HALF, -HALF, outside),
      bendArc(-HALF, outside, Math.PI / 2, Math.PI),
    ]);
  }
  const chuteEnd = Math.max(HALF, STRAIGHT_BACK / 2 + CHUTE);
  return joinStrips([
    bendArc(-HALF, outside, Math.PI, Math.PI * 1.5),
    straightSegment(-HALF, chuteEnd, -outside),
    bendArc(HALF, outside, -Math.PI / 2, 0),
  ]);
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
