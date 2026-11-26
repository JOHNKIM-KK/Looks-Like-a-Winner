import { cameraConfig } from "./cameraConfig";
import { PROJECTION_CENTER } from "./stage";

/**
 * One left-handed lap. The chute is a straight extension of the home straight
 * to the left. Both oval straights share one length. Each bend is a circular
 * arc of REFERENCE_RADIUS_M with a 10 m clothoid on the way in and the way out.
 * Engine scale stays 58/1.55 (37.42 px/m). Lane spacing is 1.2 m.
 */
export const ENGINE_PX_PER_M = 58 / 1.55;
export const LANE_GAP_M = 1.2;
export const LANE_GAP = LANE_GAP_M * ENGINE_PX_PER_M;
export const LANE_COUNT = 12;
/** Authored rail cross-section origin. Lane 1 is inset so twelve lanes sit inside 15.2 m. */
export const RAIL_SECTION_ORIGIN_M = 1.2;
export const LANE1_Y_M = -0.3;
export const TRACK_CENTER_Y_M = LANE1_Y_M + ((LANE_COUNT - 1) / 2) * LANE_GAP_M;

export const CHUTE_M = 55;
/** Circular radius of the 12-lane centerline. Plan C, 1.8× the previous 14 m. */
export const REFERENCE_RADIUS_M = 25.2;
/** Clothoid length at each end of each bend. Curvature runs 0 → 1/R. */
export const CLOTHOID_M = 10;
/** Finish line, as a fraction of the home straight from its left end. */
export const FINISH_HOME_FRACTION = 2 / 3;
/** Oval straight, fixed by SPEC §8-1. */
export const STRAIGHT_M = 80.3;
/** One bend along the reference line: entry clothoid + arc + exit clothoid = πR + Ls. */
export const BEND_M = Math.PI * REFERENCE_RADIUS_M + CLOTHOID_M;
/** Exact reference-line distance from the gate to the 2/3 finish. */
export const RACE_METERS =
  CHUTE_M + STRAIGHT_M + BEND_M + STRAIGHT_M + BEND_M + FINISH_HOME_FRACTION * STRAIGHT_M;

export const CHUTE = CHUTE_M * ENGINE_PX_PER_M;
export const STRAIGHT = STRAIGHT_M * ENGINE_PX_PER_M;
/** Home and back straights are the same length. A stadium is what closes. */
export const STRAIGHT_BACK = STRAIGHT;

const CLOTHOID = CLOTHOID_M * ENGINE_PX_PER_M;

/** Fresnel C(z), S(z). z stays below 0.4 for this clothoid, so the power series is exact. */
function fresnel(z: number) {
  const halfPiSq = (Math.PI / 2) * (Math.PI / 2);
  const z4 = z * z * z * z;
  let cTerm = z;
  let sTerm = ((Math.PI / 2) * z * z * z) / 3;
  let c = cTerm;
  let s = sTerm;
  for (let n = 1; n <= 12; n += 1) {
    const k = halfPiSq * z4;
    cTerm *= ((-k) / ((2 * n - 1) * (2 * n))) * ((4 * n - 3) / (4 * n + 1));
    sTerm *= ((-k) / ((2 * n) * (2 * n + 1))) * ((4 * n - 1) / (4 * n + 3));
    c += cTerm;
    s += sTerm;
  }
  return { c, s };
}

/** Clothoid integrals from the straight, curvature increasing toward +y. Lengths in metres. */
function clothoidXY(radiusM: number, lengthM: number, distanceM: number) {
  const scale = Math.sqrt(Math.PI * radiusM * lengthM);
  const { c, s } = fresnel(distanceM / scale);
  return { x: scale * c, y: scale * s };
}

const CLOTHOID_END = clothoidXY(REFERENCE_RADIUS_M, CLOTHOID_M, CLOTHOID_M);
const CLOTHOID_TAU = CLOTHOID_M / (2 * REFERENCE_RADIUS_M);
/** How far the circular arc sits in from the straight so the clothoid can meet it. */
const SHIFT_M = CLOTHOID_END.y - REFERENCE_RADIUS_M * (1 - Math.cos(CLOTHOID_TAU));
/** The bend center sits this far beyond the straight's tangent point. */
const CENTER_SHIFT_M = CLOTHOID_END.x - REFERENCE_RADIUS_M * Math.sin(CLOTHOID_TAU);

export function clothoidShiftM() {
  return SHIFT_M;
}

export function clothoidShiftPx() {
  return SHIFT_M * ENGINE_PX_PER_M;
}

/** Straight-line y of the reference centerline. The circular radius is REFERENCE_RADIUS_M. */
export function referenceStraightY() {
  return (REFERENCE_RADIUS_M + SHIFT_M) * ENGINE_PX_PER_M;
}

/** Right-bend circle center, on the x axis. The left bend is the negation. */
export function bendCenterX() {
  return STRAIGHT / 2 + CENTER_SHIFT_M * ENGINE_PX_PER_M;
}

/**
 * Outer-rail height (home straight to back straight) divided by the previous
 * 14 m track's 43.2 m. Drone 01 and the corner rigs pull back by this factor.
 */
export function ovalHeightScale() {
  const outerBeyondReferenceM = 7.6;
  const previousOuterStraightM = 21.6;
  return (REFERENCE_RADIUS_M + outerBeyondReferenceM + SHIFT_M) / previousOuterStraightM;
}

export const INNER_RADIUS =
  (REFERENCE_RADIUS_M + SHIFT_M - (TRACK_CENTER_Y_M - RAIL_SECTION_ORIGIN_M)) * ENGINE_PX_PER_M;
export const COAST_END = 1.18;
export const FAR_SCALE = 0.72;


const MINIMUM_SPRITE_SCALE = 0.45;

export type SegmentKind = "straight" | "corner" | "final";

export type SegmentEnds = {
  /** End of the 55 m chute. */
  chuteEnd: number;
  /** Entrance of corners 1–2, after the opening home straight. */
  corner12Entry: number;
  /** Exit of corners 1–2. Start of the back straight. */
  corner12Exit: number;
  /** End of the back straight. Entrance of corners 3–4. */
  backEnd: number;
  /** Exit of corners 3–4. Start of the home straight to the finish. */
  corner34Exit: number;
};

export type TrackPose = {
  x: number;
  y: number;
  flipX: boolean;
  lean: number;
  scale: number;
  tangentX: number;
  tangentY: number;
  visible: boolean;
};

export type Camera = {
  groundX: number;
  groundY: number;
  height: number;
  pitch: number;
  yaw: number;
  focalLength: number;
  /** Largest sprite scale (focal / depth). Defaults to 2.5; finish close-ups lift it. */
  maxScale?: number;
};

type Logical = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Meters above the ground plane. Omitted points stay on z = 0. */
  z?: number;
};

export function laneRadius(lane: number) {
  const index = Math.max(1, lane) - 1;
  const artY = LANE1_Y_M + index * LANE_GAP_M;
  return INNER_RADIUS + (artY - RAIL_SECTION_ORIGIN_M) * ENGINE_PX_PER_M;
}

/** Circular radius of the twelve-lane centerline. Straights sit one clothoid shift outside this. */
export function referenceRadius() {
  return REFERENCE_RADIUS_M * ENGINE_PX_PER_M;
}

function bendSpan() {
  return BEND_M * ENGINE_PX_PER_M;
}

export function referenceLoopLength() {
  return STRAIGHT * 2 + bendSpan() * 2;
}

export function referenceDistance() {
  const bend = bendSpan();
  return CHUTE + STRAIGHT + bend + STRAIGHT + bend + FINISH_HOME_FRACTION * STRAIGHT;
}

export function segmentEnds(): SegmentEnds {
  const total = referenceDistance();
  const bend = bendSpan();
  const chuteEnd = CHUTE / total;
  const corner12Entry = (CHUTE + STRAIGHT) / total;
  const corner12Exit = corner12Entry + bend / total;
  const backEnd = corner12Exit + STRAIGHT / total;
  const corner34Exit = backEnd + bend / total;
  return { chuteEnd, corner12Entry, corner12Exit, backEnd, corner34Exit };
}

const ENDS = segmentEnds();

export function segmentAt(progress: number): SegmentKind {
  const along = Math.max(0, progress);
  if (along < ENDS.corner12Entry) return "straight";
  if (along < ENDS.corner12Exit) return "corner";
  if (along < ENDS.backEnd) return "straight";
  if (along < ENDS.corner34Exit) return "corner";
  return "final";
}

/** Home straight after corners 3–4, through the finish. */
export function isHomeStretch(progress: number) {
  return progress >= ENDS.corner34Exit;
}

type Pose = Logical;

function withOffset(x: number, y: number, tx: number, ty: number, offset: number): Pose {
  const length = Math.hypot(tx, ty) || 1;
  const nx = tx / length;
  const ny = ty / length;
  return { x: x - ny * offset, y: y + nx * offset, tx: nx, ty: ny };
}

/** Reference clothoid, s measured in px from the straight. `entry` turns off the home straight. */
function clothoidWorld(distance: number, end: "entry" | "exit"): Pose {
  const radius = referenceRadius();
  const alongM = distance / ENGINE_PX_PER_M;
  const local = clothoidXY(REFERENCE_RADIUS_M, CLOTHOID_M, alongM);
  const theta = (alongM * alongM) / (2 * REFERENCE_RADIUS_M * CLOTHOID_M);
  const half = STRAIGHT / 2;
  const straight = referenceStraightY();
  if (end === "entry") {
    return {
      x: half + local.x * ENGINE_PX_PER_M,
      y: straight - local.y * ENGINE_PX_PER_M,
      tx: Math.cos(-theta),
      ty: Math.sin(-theta),
    };
  }
  const heading = theta - Math.PI;
  return {
    x: half + local.x * ENGINE_PX_PER_M,
    y: -straight + local.y * ENGINE_PX_PER_M,
    tx: Math.cos(heading),
    ty: Math.sin(heading),
  };
}

/** Right bend of the reference line, then a parallel offset. Positive offset is outward. */
function rightBend(distance: number, offset: number): Pose {
  const radius = referenceRadius();
  const arc = Math.PI * radius - CLOTHOID;
  let cursor = distance;
  if (cursor <= CLOTHOID) {
    const pose = clothoidWorld(cursor, "entry");
    return withOffset(pose.x, pose.y, pose.tx, pose.ty, offset);
  }
  cursor -= CLOTHOID;
  if (cursor <= arc) {
    const psi = -CLOTHOID_TAU - cursor / radius;
    const pose = {
      x: bendCenterX() + radius * -Math.sin(psi),
      y: radius * Math.cos(psi),
      tx: Math.cos(psi),
      ty: Math.sin(psi),
    };
    return withOffset(pose.x, pose.y, pose.tx, pose.ty, offset);
  }
  cursor -= arc;
  const pose = clothoidWorld(Math.max(0, CLOTHOID - cursor), "exit");
  return withOffset(pose.x, pose.y, pose.tx, pose.ty, offset);
}

function leftBend(distance: number, offset: number): Pose {
  const right = rightBend(distance, offset);
  return { x: -right.x, y: -right.y, tx: -right.tx, ty: -right.ty };
}

function straightPose(x: number, direction: 1 | -1, offset: number): Pose {
  const y = referenceStraightY();
  if (direction === 1) return withOffset(x, y, 1, 0, offset);
  return withOffset(x, -y, -1, 0, offset);
}

/** Signed outward offset from the reference centerline, in px. */
export function referenceOffset(x: number, y: number) {
  const half = STRAIGHT / 2;
  const straight = referenceStraightY();
  if (x >= -half && x <= half) return (y >= 0 ? y : -y) - straight;
  if (x < -half) return bendOffset(-x, -y);
  return bendOffset(x, y);
}

function bendOffset(x: number, y: number) {
  const radius = referenceRadius();
  const center = bendCenterX();
  const angle = Math.atan2(y, x - center);
  const limit = Math.PI / 2 - CLOTHOID_TAU;
  if (angle <= limit && angle >= -limit) return Math.hypot(x - center, y) - radius;
  return clothoidOffset(x, y, y >= 0 ? "entry" : "exit");
}

function clothoidOffset(x: number, y: number, end: "entry" | "exit") {
  let distance = CLOTHOID * 0.5;
  let pose = clothoidWorld(distance, end);
  for (let step = 0; step < 12; step += 1) {
    const miss = (x - pose.x) * pose.tx + (y - pose.y) * pose.ty;
    if (Math.abs(miss) < 1e-3) break;
    const probe = Math.min(CLOTHOID, Math.max(0, distance + 8));
    const next = clothoidWorld(probe, end);
    const nextMiss = (x - next.x) * next.tx + (y - next.y) * next.ty;
    const slope = (nextMiss - miss) / (probe - distance || 8);
    if (Math.abs(slope) < 1e-9) break;
    distance = Math.min(CLOTHOID, Math.max(0, distance - miss / slope));
    pose = clothoidWorld(distance, end);
  }
  return (x - pose.x) * -pose.ty + (y - pose.y) * pose.tx;
}

/** Closed oval, home straight first, then the right bend, the back straight, and the left bend. */
function logicalFromLoop(loop: number, straightY: number): Logical {
  const half = STRAIGHT / 2;
  const bend = bendSpan();
  const lap = referenceLoopLength();
  const offset = straightY - referenceStraightY();
  let cursor = ((loop % lap) + lap) % lap;
  if (cursor <= STRAIGHT) return straightPose(-half + cursor, 1, offset);
  cursor -= STRAIGHT;
  if (cursor <= bend) return rightBend(cursor, offset);
  cursor -= bend;
  if (cursor <= STRAIGHT) return straightPose(half - cursor, -1, offset);
  cursor -= STRAIGHT;
  return leftBend(cursor, offset);
}

/**
 * Race path for every lane. Progress is a fraction of the reference lap, so the
 * simulator and the picture share one shape. The passed straight y only sets how
 * far the lane sits from the infield. Lanes are parallel offsets of one clothoid.
 */
function pointOnTrack(progress: number, straightY: number): Logical {
  const half = STRAIGHT / 2;
  const bend = bendSpan();
  const offset = straightY - referenceStraightY();
  let cursor = Math.max(0, progress) * referenceDistance();

  const opening = CHUTE + STRAIGHT;
  if (cursor <= opening) return straightPose(-half - CHUTE + cursor, 1, offset);
  cursor -= opening;

  if (cursor <= bend) return rightBend(cursor, offset);
  cursor -= bend;

  if (cursor <= STRAIGHT) return straightPose(half - cursor, -1, offset);
  cursor -= STRAIGHT;

  if (cursor <= bend) return leftBend(cursor, offset);
  cursor -= bend;

  const x = -half + cursor;
  if (x <= half) return straightPose(x, 1, offset);
  return rightBend(x - half, offset);
}

export function logicalAtDistance(distance: number, radius: number): Logical {
  return pointOnTrack(distance / referenceDistance(), radius);
}

export function createDefaultCamera(): Camera {
  return {
    groundX: 0,
    groundY: -1050,
    height: 1730,
    pitch: 60.0 * (Math.PI / 180),
    yaw: 0,
    focalLength: 620,
  };
}

export function projectWithCamera(logical: Logical, camera: Camera): TrackPose {
  const dx = logical.x - camera.groundX;
  const dy = logical.y - camera.groundY;
  
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const localX = dx * cosYaw + dy * sinYaw;
  const localY = -dx * sinYaw + dy * cosYaw;
  
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  // z = 0 keeps the previous ground-plane formula. Raised points (rails, strips) pass z.
  const pointZ = logical.z ?? 0;
  const camDepth = localY * cosPitch - (pointZ - camera.height) * sinPitch;
  
  const nearPlane = 10;
  const visible = camDepth >= nearPlane;
  const safeDepth = Math.max(nearPlane, camDepth);
  
  const screenX = PROJECTION_CENTER.x - (camera.focalLength * localX) / safeDepth;
  const camVertical = localY * sinPitch + (pointZ - camera.height) * cosPitch;
  const screenY = PROJECTION_CENTER.y - (camera.focalLength * camVertical) / safeDepth;
  
  const perspectiveScale = camera.focalLength / safeDepth;
  const scale = Math.max(MINIMUM_SPRITE_SCALE, Math.min(camera.maxScale ?? 2.5, perspectiveScale));
  
  const epsilon = 0.01;
  const logicalAhead = {
    x: logical.x + logical.tx * epsilon,
    y: logical.y + logical.ty * epsilon,
  };
  const dxAhead = logicalAhead.x - camera.groundX;
  const dyAhead = logicalAhead.y - camera.groundY;
  const localXAhead = dxAhead * cosYaw + dyAhead * sinYaw;
  const localYAhead = -dxAhead * sinYaw + dyAhead * cosYaw;
  const camDepthAhead = localYAhead * cosPitch - (-camera.height) * sinPitch;
  const safeDepthAhead = Math.max(nearPlane, camDepthAhead);
  
  const screenXAhead = PROJECTION_CENTER.x - (camera.focalLength * localXAhead) / safeDepthAhead;
  const camVerticalAhead = localYAhead * sinPitch + (-camera.height) * cosPitch;
  const screenYAhead = PROJECTION_CENTER.y - (camera.focalLength * camVerticalAhead) / safeDepthAhead;
  
  const tangentX = screenXAhead - screenX;
  const tangentY = screenYAhead - screenY;
  const length = Math.hypot(tangentX, tangentY) || 1;
  const normalizedTangentX = tangentX / length;
  const normalizedTangentY = tangentY / length;
  
  const heading = Math.atan2(normalizedTangentY, normalizedTangentX);
  const flipX = Math.cos(heading) < 0;
  let lean = heading;
  if (flipX) lean = heading > 0 ? heading - Math.PI : heading + Math.PI;
  const leanDeg = Math.max(-15, Math.min(15, (lean * 180) / Math.PI));
  
  return {
    x: screenX,
    y: screenY,
    flipX,
    lean: leanDeg,
    scale,
    tangentX: normalizedTangentX,
    tangentY: normalizedTangentY,
    visible,
  };
}

function project(logical: Logical): TrackPose {
  const defaultCamera = createDefaultCamera();
  return projectWithCamera(logical, defaultCamera);
}

export function poseOnRadius(progress: number, radius: number): TrackPose {
  return project(logicalAtDistance(Math.max(0, progress) * referenceDistance(), radius));
}

export function poseAt(progress: number, lane: number) {
  return poseOnRadius(progress, laneRadius(lane));
}

function cutControl(from: TrackPose, to: TrackPose) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  return {
    x: midX + (PROJECTION_CENTER.x - midX) * 0.72,
    y: midY + (PROJECTION_CENTER.y - midY) * 0.72,
  };
}

export function cutPose(fromProgress: number, toProgress: number, lane: number, t: number): TrackPose {
  const from = poseAt(fromProgress, lane);
  const to = poseAt(toProgress, lane);
  const control = cutControl(from, to);
  const blend = Math.min(1, Math.max(0, t));
  const stay = 1 - blend;
  const x = stay * stay * from.x + 2 * stay * blend * control.x + blend * blend * to.x;
  const y = stay * stay * from.y + 2 * stay * blend * control.y + blend * blend * to.y;
  const dx = 2 * stay * (control.x - from.x) + 2 * blend * (to.x - control.x);
  const dy = 2 * stay * (control.y - from.y) + 2 * blend * (to.y - control.y);
  const length = Math.hypot(dx, dy) || 1;
  const tangentX = dx / length;
  const tangentY = dy / length;
  const heading = Math.atan2(tangentY, tangentX);
  const flipX = Math.cos(heading) < 0;
  let lean = heading;
  if (flipX) lean = heading > 0 ? heading - Math.PI : heading + Math.PI;
  return {
    x,
    y,
    flipX,
    lean: Math.max(-15, Math.min(15, (lean * 180) / Math.PI)),
    scale: from.scale + (to.scale - from.scale) * blend,
    tangentX,
    tangentY,
    visible: from.visible && to.visible,
  };
}

export function cutLength(fromProgress: number, toProgress: number, lane: number) {
  let length = 0;
  let previous = cutPose(fromProgress, toProgress, lane, 0);
  for (let step = 1; step <= 8; step += 1) {
    const next = cutPose(fromProgress, toProgress, lane, step / 8);
    length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  return length;
}

export function sampleRadius(radius: number, steps: number) {
  const total = referenceLoopLength();
  const poses: TrackPose[] = [];
  for (let index = 0; index <= steps; index += 1) {
    poses.push(project(logicalFromLoop((index / steps) * total, radius)));
  }
  return poses;
}

export function sampleChute(radius: number, steps: number) {
  const poses: TrackPose[] = [];
  for (let index = 0; index <= steps; index += 1) {
    poses.push(project(logicalAtDistance((index / steps) * CHUTE, radius)));
  }
  return poses;
}

export function viewBounds(lanes: number) {
  const edge = laneRadius(Math.max(1, lanes)) + LANE_GAP * 1.6;
  const poses = [...sampleRadius(edge, 64), ...sampleChute(edge, 16)];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pose of poses) {
    minX = Math.min(minX, pose.x);
    minY = Math.min(minY, pose.y);
    maxX = Math.max(maxX, pose.x);
    maxY = Math.max(maxY, pose.y);
  }
  const pad = 420;
  return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
}

type LogicalPoint = {
  x: number;
  y: number;
};

export function sampleRadiusLogical(radius: number, steps: number): LogicalPoint[] {
  const total = referenceLoopLength();
  const points: LogicalPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const logical = logicalFromLoop((index / steps) * total, radius);
    points.push({ x: logical.x, y: logical.y });
  }
  return points;
}

export function sampleChuteLogical(radius: number, steps: number): LogicalPoint[] {
  const points: LogicalPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const logical = logicalAtDistance((index / steps) * CHUTE, radius);
    points.push({ x: logical.x, y: logical.y });
  }
  return points;
}

export function projectLogicalPoints(points: LogicalPoint[], camera: Camera): TrackPose[] {
  return points.map(p => projectWithCamera({ x: p.x, y: p.y, tx: 0, ty: 0 }, camera));
}

export function getCameraDepth(logical: LogicalPoint, camera: Camera): number {
  const dx = logical.x - camera.groundX;
  const dy = logical.y - camera.groundY;
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const localY = -dx * sinYaw + dy * cosYaw;
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  return localY * cosPitch - (-camera.height) * sinPitch;
}

export function trackPoint(progress: number, lane: number): LogicalPoint {
  const logical = logicalAtDistance(Math.max(0, progress) * referenceDistance(), laneRadius(lane));
  return { x: logical.x, y: logical.y };
}

export function goalLineLogical(lane: number): LogicalPoint {
  return { x: finishGoalX(), y: laneRadius(lane) };
}

/** Drawn inner rail sits this far inside lane 1. */
export const INNER_RAIL_INSET = cameraConfig.track.innerRailInset;
/** Drawn outer rail sits this far outside the last lane. */
export const OUTER_RAIL_OUTSET = cameraConfig.track.outerRailOutset;
/** Finish post sits this far into the infield, past the inner rail. */
export const FINISH_POST_INFIELD_GAP = cameraConfig.track.finishPostInfieldGap;

export function innerRailRadius() {
  return Math.max(70, laneRadius(1) - INNER_RAIL_INSET);
}

export function outerRailRadius(lanes = LANE_COUNT) {
  return laneRadius(Math.max(1, lanes)) + OUTER_RAIL_OUTSET;
}

/** Finish x on the home straight, two thirds of the way from the left tangent. */
export function finishGoalX() {
  return -STRAIGHT / 2 + FINISH_HOME_FRACTION * STRAIGHT;
}

/** Post just outside the inner rail, on the infield, not on the dirt. */
export function finishPostLogical(): LogicalPoint {
  return { x: finishGoalX(), y: innerRailRadius() - FINISH_POST_INFIELD_GAP };
}

/** Outer end of the finish line, on the outer rail. */
export function finishOuterLogical(lanes = LANE_COUNT): LogicalPoint {
  return { x: finishGoalX(), y: outerRailRadius(lanes) };
}

export type TrackLogical = {
  x: number;
  y: number;
  tx: number;
  ty: number;
};

/** On-screen path. Same shape as `logicalAtDistance`. */
export function presentationLogical(progress: number, lane: number): TrackLogical {
  return presentationOnRadius(progress, laneRadius(lane));
}

/** Same path as `presentationLogical`, on an explicit radius instead of a lane. */
export function presentationOnRadius(progress: number, radius: number): TrackLogical {
  return pointOnTrack(progress, radius);
}

/** Closed oval samples, evenly spaced. The first point is not repeated at the end. */
export function sampleLoopLogical(radius: number, steps: number): TrackLogical[] {
  const total = referenceLoopLength();
  const count = Math.max(3, Math.floor(steps));
  const points: TrackLogical[] = [];
  for (let index = 0; index < count; index += 1) {
    const logical = logicalFromLoop((index / count) * total, radius);
    points.push({ x: logical.x, y: logical.y, tx: logical.tx, ty: logical.ty });
  }
  return points;
}
