export const STRAIGHT = 1712;
const STRAIGHT_BACK = 1418;
export const INNER_RADIUS = 256;
export const LANE_GAP = 58;
export const CHUTE = 158;
export const COAST_END = 1.18;
export const FAR_SCALE = 0.72;

const GOAL_ALONG = 0.920;
const CENTER_X = 270;
const CENTER_Y = 555;
const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;

const MINIMUM_SPRITE_SCALE = 0.45;

export type SegmentKind = "straight" | "corner" | "final";

export type SegmentEnds = {
  pocketEnd: number;
  backStraightEnd: number;
  cornerEnd: number;
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
};

export function laneRadius(lane: number) {
  return INNER_RADIUS + (lane - 1) * LANE_GAP;
}

export function referenceDistance() {
  return CHUTE + STRAIGHT_BACK + Math.PI * REFERENCE_RADIUS + GOAL_ALONG * STRAIGHT;
}

export function segmentEnds(): SegmentEnds {
  const total = referenceDistance();
  return {
    pocketEnd: CHUTE / total,
    backStraightEnd: (CHUTE + STRAIGHT_BACK) / total,
    cornerEnd: (CHUTE + STRAIGHT_BACK + Math.PI * REFERENCE_RADIUS) / total,
  };
}

const ENDS = segmentEnds();

export function segmentAt(progress: number): SegmentKind {
  const along = Math.max(0, progress);
  if (along < ENDS.pocketEnd) return "straight";
  if (along < ENDS.backStraightEnd) return "straight";
  if (along < ENDS.cornerEnd) return "corner";
  return "final";
}

function logicalFromLoop(loop: number, radius: number): Logical {
  const corner = Math.PI * radius;
  const half = STRAIGHT / 2;
  if (loop <= STRAIGHT) {
    return { x: -half + loop, y: -radius, tx: 1, ty: 0 };
  }
  if (loop <= STRAIGHT + corner) {
    const theta = -Math.PI / 2 + (loop - STRAIGHT) / radius;
    return {
      x: half + Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      tx: -Math.sin(theta),
      ty: Math.cos(theta),
    };
  }
  if (loop <= STRAIGHT * 2 + corner) {
    const along = loop - STRAIGHT - corner;
    return { x: half - along, y: radius, tx: -1, ty: 0 };
  }
  const theta = Math.PI / 2 + (loop - STRAIGHT * 2 - corner) / radius;
  return {
    x: -half + Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    tx: -Math.sin(theta),
    ty: Math.cos(theta),
  };
}

function logicalAtDistance(distance: number, radius: number): Logical {
  const halfBack = STRAIGHT_BACK / 2;
  const halfHome = STRAIGHT / 2;
  const corner = Math.PI * radius;
  let cursor = Math.max(0, distance);
  
  if (cursor <= CHUTE) {
    return { x: halfBack + CHUTE - cursor, y: -radius, tx: -1, ty: 0 };
  }
  cursor -= CHUTE;
  
  if (cursor <= STRAIGHT_BACK) {
    return { x: halfBack - cursor, y: -radius, tx: -1, ty: 0 };
  }
  cursor -= STRAIGHT_BACK;
  
  if (cursor <= corner) {
    const theta = -Math.PI / 2 + cursor / radius;
    return {
      x: -halfHome + Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      tx: -Math.sin(theta),
      ty: Math.cos(theta),
    };
  }
  cursor -= corner;
  
  if (cursor <= GOAL_ALONG * STRAIGHT) {
    return { x: -halfHome + cursor, y: radius, tx: 1, ty: 0 };
  }
  
  const theta = Math.PI / 2 + (cursor - GOAL_ALONG * STRAIGHT) / radius;
  return {
    x: halfHome + Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    tx: -Math.sin(theta),
    ty: Math.cos(theta),
  };
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
  const camDepth = localY * cosPitch - (-camera.height) * sinPitch;
  
  const nearPlane = 10;
  const visible = camDepth >= nearPlane;
  const safeDepth = Math.max(nearPlane, camDepth);
  
  const screenX = CENTER_X - (camera.focalLength * localX) / safeDepth;
  const camVertical = localY * sinPitch + (-camera.height) * cosPitch;
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

export function renderLane(lane: number, progress: number, seed: number): number {
  const ends = segmentEnds();
  if (progress < ends.pocketEnd || progress >= 1) return lane;
  
  const driftEnd = 0.15;
  if (progress >= driftEnd) return lane;
  
  const blend = (progress - ends.pocketEnd) / (driftEnd - ends.pocketEnd);
  const eased = blend * blend * (3 - 2 * blend);
  
  const hash = ((seed * 9301 + lane * 49297) % 233280) / 233280;
  const targetLane = Math.max(1, Math.min(lane, 1 + Math.floor(hash * 3)));
  
  return lane + (targetLane - lane) * eased;
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

export function goalLineLogical(lane: number): LogicalPoint {
  const radius = laneRadius(lane);
  const halfBack = STRAIGHT_BACK / 2;
  const halfHome = STRAIGHT / 2;
  const corner = Math.PI * radius;
  const cursor = referenceDistance() - CHUTE - STRAIGHT_BACK - corner;
  return { x: -halfHome + cursor, y: radius };
}
