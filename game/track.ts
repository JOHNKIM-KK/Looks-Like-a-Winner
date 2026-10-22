export const STRAIGHT = 760;
export const INNER_RADIUS = 200;
export const LANE_GAP = 58;
export const FINISH_ALONG = 0.7;
export const COAST_END = 1.18;
export const FAR_SCALE = 0.72;

const CENTER_X = 860;
const CENTER_Y = 500;
const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;

export type SegmentKind = "straight" | "corner" | "final";

export type SegmentEnds = {
  startStraight: number;
  firstCorner: number;
  backStraight: number;
  secondCorner: number;
};

export type TrackPose = {
  x: number;
  y: number;
  flipX: boolean;
  lean: number;
  scale: number;
  tangentX: number;
  tangentY: number;
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

export function lapLength(lane = 1) {
  const radius = laneRadius(lane);
  return STRAIGHT * 2 + Math.PI * radius * 2;
}

export function segmentEnds(lane = 1): SegmentEnds {
  const radius = laneRadius(lane);
  const corner = Math.PI * radius;
  const total = lapLength(lane);
  const startStraight = ((1 - FINISH_ALONG) * STRAIGHT) / total;
  const firstCorner = startStraight + corner / total;
  const backStraight = firstCorner + STRAIGHT / total;
  const secondCorner = backStraight + corner / total;
  return { startStraight, firstCorner, backStraight, secondCorner };
}

const ENDS = segmentEnds(1);

export function segmentAt(progress: number): SegmentKind {
  const lap = progress - Math.floor(progress);
  if (lap < ENDS.startStraight) return "straight";
  if (lap < ENDS.firstCorner) return "corner";
  if (lap < ENDS.backStraight) return "straight";
  if (lap < ENDS.secondCorner) return "corner";
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

function project(logical: Logical): TrackPose {
  const depth = Math.min(1, Math.max(0, (logical.y + REFERENCE_RADIUS) / (2 * REFERENCE_RADIUS)));
  const scale = 1 - (1 - FAR_SCALE) * depth;
  const converge = 0.76 + 0.24 * (1 - depth);
  const x = CENTER_X + logical.x * converge;
  const y = CENTER_Y - logical.y * 0.72;
  const tangentX = logical.tx * converge;
  const tangentY = -logical.ty * 0.72;
  const heading = Math.atan2(tangentY, tangentX);
  const flipX = Math.cos(heading) < 0;
  let lean = heading;
  if (flipX) lean = heading > 0 ? heading - Math.PI : heading + Math.PI;
  const leanDeg = Math.max(-15, Math.min(15, (lean * 180) / Math.PI));
  const length = Math.hypot(tangentX, tangentY) || 1;
  return {
    x,
    y,
    flipX,
    lean: leanDeg,
    scale,
    tangentX: tangentX / length,
    tangentY: tangentY / length,
  };
}

export function poseOnRadius(progress: number, radius: number): TrackPose {
  const total = STRAIGHT * 2 + Math.PI * radius * 2;
  const traveled = FINISH_ALONG * STRAIGHT + progress * total;
  const loop = ((traveled % total) + total) % total;
  return project(logicalFromLoop(loop, radius));
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

export function viewBounds(lanes: number) {
  const poses = sampleRadius(laneRadius(Math.max(1, lanes)) + LANE_GAP * 1.6, 64);
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
