import { cameraConfig } from "./cameraConfig";

/**
 * One left-handed lap. The chute is a straight extension of the home straight
 * to the left. Both oval straights share one length so the semicircular ends close.
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

export const RACE_METERS = 222;
export const CHUTE_M = 27;
export const REFERENCE_RADIUS_M = 14;
/** Finish line, as a fraction of the home straight from its left end. */
export const FINISH_HOME_FRACTION = 2 / 3;
/** Oval straight. Chosen so chute + lap to the 2/3 finish is 222 m. */
export const STRAIGHT_M = ((RACE_METERS - CHUTE_M - 2 * Math.PI * REFERENCE_RADIUS_M) * 3) / 8;

export const CHUTE = CHUTE_M * ENGINE_PX_PER_M;
export const STRAIGHT = STRAIGHT_M * ENGINE_PX_PER_M;
/** Home and back straights are the same length. A stadium is what closes. */
export const STRAIGHT_BACK = STRAIGHT;
export const INNER_RADIUS = (REFERENCE_RADIUS_M - (TRACK_CENTER_Y_M - RAIL_SECTION_ORIGIN_M)) * ENGINE_PX_PER_M;
export const COAST_END = 1.18;
export const FAR_SCALE = 0.72;

const CENTER_X = 270;
const CENTER_Y = 555;

const MINIMUM_SPRITE_SCALE = 0.45;

export type SegmentKind = "straight" | "corner" | "final";

export type SegmentEnds = {
  /** End of the 27 m chute. */
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
  const index = Math.max(1, Math.floor(lane)) - 1;
  const artY = LANE1_Y_M + index * LANE_GAP_M;
  return INNER_RADIUS + (artY - RAIL_SECTION_ORIGIN_M) * ENGINE_PX_PER_M;
}

/** Center of the twelve lanes. Corner length in the simulator uses this radius. */
export function referenceRadius() {
  return REFERENCE_RADIUS_M * ENGINE_PX_PER_M;
}

export function referenceDistance() {
  const corner = Math.PI * referenceRadius();
  return CHUTE + STRAIGHT + corner + STRAIGHT + corner + FINISH_HOME_FRACTION * STRAIGHT;
}

export function segmentEnds(): SegmentEnds {
  const total = referenceDistance();
  const corner = Math.PI * referenceRadius();
  const chuteEnd = CHUTE / total;
  const corner12Entry = (CHUTE + STRAIGHT) / total;
  const corner12Exit = corner12Entry + corner / total;
  const backEnd = corner12Exit + STRAIGHT / total;
  const corner34Exit = backEnd + corner / total;
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

/** Closed oval, home straight first, then the right bend, the back straight, and the left bend. */
function logicalFromLoop(loop: number, radius: number): Logical {
  const half = STRAIGHT / 2;
  const corner = Math.PI * radius;
  const lap = STRAIGHT * 2 + corner * 2;
  let cursor = ((loop % lap) + lap) % lap;
  if (cursor <= STRAIGHT) {
    return { x: -half + cursor, y: radius, tx: 1, ty: 0 };
  }
  cursor -= STRAIGHT;
  if (cursor <= corner) {
    const theta = Math.PI / 2 - cursor / radius;
    return {
      x: half + Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      tx: Math.sin(theta),
      ty: -Math.cos(theta),
    };
  }
  cursor -= corner;
  if (cursor <= STRAIGHT) {
    return { x: half - cursor, y: -radius, tx: -1, ty: 0 };
  }
  cursor -= STRAIGHT;
  const phi = -Math.PI / 2 - cursor / radius;
  return {
    x: -half + Math.cos(phi) * radius,
    y: Math.sin(phi) * radius,
    tx: Math.sin(phi),
    ty: -Math.cos(phi),
  };
}

/**
 * Race path for every lane. Progress is a fraction of the reference lap, so the
 * simulator and the picture share one shape. The passed radius only sets how
 * far the lane sits from the infield.
 */
function pointOnTrack(progress: number, radius: number): Logical {
  const half = STRAIGHT / 2;
  const cornerRef = Math.PI * referenceRadius();
  let cursor = Math.max(0, progress) * referenceDistance();

  const opening = CHUTE + STRAIGHT;
  if (cursor <= opening) {
    return { x: -half - CHUTE + cursor, y: radius, tx: 1, ty: 0 };
  }
  cursor -= opening;

  if (cursor <= cornerRef) {
    const theta = Math.PI / 2 - (cursor / cornerRef) * Math.PI;
    return {
      x: half + Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      tx: Math.sin(theta),
      ty: -Math.cos(theta),
    };
  }
  cursor -= cornerRef;

  if (cursor <= STRAIGHT) {
    return { x: half - cursor, y: -radius, tx: -1, ty: 0 };
  }
  cursor -= STRAIGHT;

  if (cursor <= cornerRef) {
    const phi = -Math.PI / 2 - (cursor / cornerRef) * Math.PI;
    return {
      x: -half + Math.cos(phi) * radius,
      y: Math.sin(phi) * radius,
      tx: Math.sin(phi),
      ty: -Math.cos(phi),
    };
  }
  cursor -= cornerRef;

  const x = -half + cursor;
  if (x <= half) return { x, y: radius, tx: 1, ty: 0 };
  const theta = Math.PI / 2 - (x - half) / Math.max(radius, 1);
  return {
    x: half + Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    tx: Math.sin(theta),
    ty: -Math.cos(theta),
  };
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
  
  const screenX = CENTER_X - (camera.focalLength * localX) / safeDepth;
  const camVertical = localY * sinPitch + (pointZ - camera.height) * cosPitch;
  const screenY = CENTER_Y - (camera.focalLength * camVertical) / safeDepth;
  
  const perspectiveScale = camera.focalLength / safeDepth;
  const scale = Math.max(MINIMUM_SPRITE_SCALE, Math.min(2.5, perspectiveScale));
  
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
  
  const screenXAhead = CENTER_X - (camera.focalLength * localXAhead) / safeDepthAhead;
  const camVerticalAhead = localYAhead * sinPitch + (-camera.height) * cosPitch;
  const screenYAhead = CENTER_Y - (camera.focalLength * camVerticalAhead) / safeDepthAhead;
  
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
    x: midX + (CENTER_X - midX) * 0.72,
    y: midY + (CENTER_Y - midY) * 0.72,
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
  const total = STRAIGHT * 2 + Math.PI * radius * 2;
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

export function renderLane(lane: number, _progress: number, _seed: number): number {
  return lane;
}

type LogicalPoint = {
  x: number;
  y: number;
};

export function sampleRadiusLogical(radius: number, steps: number): LogicalPoint[] {
  const total = STRAIGHT * 2 + Math.PI * radius * 2;
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
  const total = STRAIGHT * 2 + Math.PI * radius * 2;
  const count = Math.max(3, Math.floor(steps));
  const points: TrackLogical[] = [];
  for (let index = 0; index < count; index += 1) {
    const logical = logicalFromLoop((index / count) * total, radius);
    points.push({ x: logical.x, y: logical.y, tx: logical.tx, ty: logical.ty });
  }
  return points;
}
