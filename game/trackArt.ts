import {
  LOGICAL_PER_METER,
  STANDS_BEHIND_OUTER_M,
  STRIP_PERIOD_M,
  TILE_M,
  TREES_BEHIND_RAIL_M,
  farRailRadius,
  nearRailRadius,
} from "./artScale";
import { groundAt } from "./cameraFrame";
import { REFERENCE } from "./stage";
import {
  CHUTE,
  STRAIGHT,
  finishGoalX,
  projectWithCamera,
  sampleLoopLogical,
  type Camera,
  type TrackPose,
} from "./track";

export type Vec2 = { x: number; y: number };

const HALF = STRAIGHT / 2;

export function isDirt(x: number, y: number) {
  const far = farRailRadius();
  const near = nearRailRadius();
  const gateX = -HALF - CHUTE;
  if (x >= gateX - 1 && x <= -HALF && y >= far && y <= near) return true;
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
  return frac * REFERENCE.height;
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
  if (right - left > REFERENCE.width * PROP_MAX_WIDTH_FRAC) return false;
  return true;
}

/** Closed oval, about one sample per meter. The first point is not repeated. */
function ovalPolyline(radius: number): Vec2[] {
  const loopLength = STRAIGHT * 2 + Math.PI * radius * 2;
  const steps = Math.max(24, Math.round(loopLength / LOGICAL_PER_METER));
  return sampleLoopLogical(radius, steps).map((point) => ({ x: point.x, y: point.y }));
}

/** Straight rail along the chute, from `fromX` out to the gate. */
function chuteLine(fromX: number, y: number): Vec2[] {
  const gateX = -HALF - CHUTE;
  const steps = Math.max(1, Math.ceil((fromX - gateX) / LOGICAL_PER_METER));
  return Array.from({ length: steps + 1 }, (_, index) => ({ x: fromX + ((gateX - fromX) * index) / steps, y }));
}

export type RailKind = "inner" | "outer";
export type RailLine = { kind: RailKind; points: Vec2[]; closed: boolean };

/** Where the west bend's outer rail meets the chute's inner rail. Between here and the bend, the chute opens onto the course. */
export function chuteMergeX() {
  const inner = farRailRadius();
  const outer = nearRailRadius();
  return -HALF - Math.sqrt(outer * outer - inner * inner);
}

/**
 * Every rail on the course. The outer oval rail stops where it would cross the chute, and the
 * chute's inner rail starts at that same point, so the chute joins the home straight with no rail across it.
 */
export function railLines(): RailLine[] {
  const inner = farRailRadius();
  const outer = nearRailRadius();
  const mergeX = chuteMergeX();
  const outerLoop = ovalPolyline(outer).filter((point) => !(point.x < -HALF && point.y > inner));
  return [
    { kind: "inner", points: ovalPolyline(inner), closed: true },
    { kind: "outer", points: [...outerLoop, { x: mergeX, y: inner }], closed: false },
    { kind: "inner", points: chuteLine(mergeX, inner), closed: false },
    { kind: "outer", points: chuteLine(-HALF, outer), closed: false },
  ];
}

function cameraInInfield(camera: Camera) {
  const inner = farRailRadius();
  const alongSpine = Math.max(-HALF, Math.min(HALF, camera.groundX));
  if (Math.hypot(camera.groundX - alongSpine, camera.groundY) < inner) return true;
  return camera.groundX < -HALF && Math.abs(camera.groundY) < inner;
}

/** True when this rail segment stands between the camera and the horses, so it draws over them. */
export function railSegmentInFront(kind: RailKind, from: Vec2, to: Vec2, camera: Camera) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const spineX = Math.max(-HALF, Math.min(HALF, mid.x));
  let normal = { x: (to.y - from.y) / length, y: -(to.x - from.x) / length };
  if (normal.x * (mid.x - spineX) + normal.y * mid.y < 0) normal = { x: -normal.x, y: -normal.y };
  const cameraOutside = (camera.groundX - mid.x) * normal.x + (camera.groundY - mid.y) * normal.y > 0;
  return kind === "outer" ? cameraOutside : !cameraOutside && cameraInInfield(camera);
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
  const gateX = -HALF - CHUTE;
  return [
    { points: straightSegment(gateX, HALF, y), outward: { x: 0, y: 1 } },
    { points: straightSegment(-HALF, HALF, -y), outward: { x: 0, y: -1 } },
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

/**
 * The one main stand, 20 m outside the outermost rail behind the home straight (scene 01).
 * It runs one 12 m tile past the east bend, clear of the bend stands, and stops halfway along the chute, short of the gate.
 */
export function mainStandLine(): Vec2[] {
  return straightSegment(HALF + STRIP_PERIOD_M * LOGICAL_PER_METER, -HALF - CHUTE * 0.5, standRadius());
}

/** Thin placeholder across the gate. The real gate arrives in a later pass. */
export function startLineQuad() {
  const depth = 0.35 * LOGICAL_PER_METER;
  const x = -HALF - CHUTE;
  return {
    x0: x - depth / 2,
    x1: x + depth / 2,
    y0: farRailRadius(),
    y1: nearRailRadius(),
  };
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
