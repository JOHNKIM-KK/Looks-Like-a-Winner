import { LANE_COUNT } from "@/game/track";

/** SPEC §8-1 zone ends, in metres along the race. */
export const CHUTE_END_M = 55;
export const FIRST_STRAIGHT_END_M = 135.3;
export const CORNER12_END_M = 179.3;
export const BACK_STRAIGHT_END_M = 259.5;
export const CORNER34_END_M = 303.5;
export const FINISH_M = 357;

export type LaneZone = "chute" | "firstStraight" | "corner12" | "backStraight" | "corner34" | "home";

export const LANE_ZONES: readonly { zone: LaneZone; end: number }[] = [
  { zone: "chute", end: CHUTE_END_M },
  { zone: "firstStraight", end: FIRST_STRAIGHT_END_M },
  { zone: "corner12", end: CORNER12_END_M },
  { zone: "backStraight", end: BACK_STRAIGHT_END_M },
  { zone: "corner34", end: CORNER34_END_M },
  { zone: "home", end: Number.POSITIVE_INFINITY },
];

export type LaneRule = {
  /** Inward drift toward the rail, lanes per second. */
  railPull: number;
  /** Outward cap while moving out to pass, lanes per second. */
  outRate: number;
  /** A blocked horse may also slip into an open rail-side gap. */
  railGap: boolean;
};

/** SPEC §8-2. */
export const LANE_RULES: Record<LaneZone, LaneRule> = {
  chute: { railPull: 0.6, outRate: 0, railGap: false },
  firstStraight: { railPull: 0.3, outRate: 0.6, railGap: false },
  corner12: { railPull: 0.3, outRate: 0.3, railGap: true },
  backStraight: { railPull: 0.3, outRate: 0.6, railGap: false },
  corner34: { railPull: 0.3, outRate: 0.3, railGap: true },
  home: { railPull: 0, outRate: 0.6, railGap: false },
};

export const MAX_LATERAL_RATE = 0.6;
/** Lanes per second squared. Turns 0 → 0.6 lanes/s over 0.4 s, so a lane change eases in and out. */
export const LATERAL_ACCEL = 1.5;
/** One length (1 마신). */
export const HORSE_LENGTH_M = 2.4;
export const BLOCK_AHEAD_LENGTHS = 1.5;
/** Two horses closer than this sideways share a path. Side-by-side horses never close below it. */
export const LATERAL_OVERLAP = 1.0;
/** SPEC §8-2 floor for any two horses alongside. */
export const MIN_LATERAL_GAP = 0.8;
export const RAIL_LANE = 1;
export const OUTER_LANE = LANE_COUNT;
/** Look this far ahead in time so a lower zone cap is met before the zone starts. */
const ZONE_LOOKAHEAD_S = MAX_LATERAL_RATE / LATERAL_ACCEL;
const EPS = 1e-6;

export function zoneAt(meters: number): LaneZone {
  for (const { zone, end } of LANE_ZONES) {
    if (meters < end) return zone;
  }
  return "home";
}

export type LaneMode = { kind: "settle" } | { kind: "pass"; rival: LaneRunner; target: number };

export type LaneRunner = {
  /** Metres along the race at the start of the step. */
  meters: number;
  /** Speed this horse would run unhindered, m/s. Replaced by the allowed speed after `stepLanes`. */
  speed: number;
  lane: number;
  /** Lanes per second, + is outward. */
  laneVel: number;
  mode: LaneMode;
  /** Finished or moved by a skill: holds its lane and is no obstacle. */
  frozen: boolean;
};

export function laneRunner(lane: number): LaneRunner {
  return { meters: 0, speed: 0, lane, laneVel: 0, mode: { kind: "settle" }, frozen: false };
}

/**
 * One simulator step. Front runners resolve first, so a follower sees the
 * lane and speed its leader actually takes this step. Mutates lane, laneVel,
 * mode and speed (natural in, allowed out).
 */
export function stepLanes(field: LaneRunner[], dt: number) {
  const order = field.filter((runner) => !runner.frozen).sort((a, b) => b.meters - a.meters);
  const advanced = new Map<LaneRunner, number>();
  for (const me of order) {
    steer(me, order, dt);
    me.speed = allowedSpeed(me, order, advanced, dt);
    advanced.set(me, me.meters + me.speed * dt);
  }
}

function steer(me: LaneRunner, field: LaneRunner[], dt: number) {
  const rule = LANE_RULES[zoneAt(me.meters)];
  const next = LANE_RULES[zoneAt(me.meters + me.speed * ZONE_LOOKAHEAD_S)];
  const outCap = Math.min(MAX_LATERAL_RATE, rule.outRate, next.outRate);
  const inCap = Math.min(MAX_LATERAL_RATE, rule.railPull, next.railPull);

  me.mode = nextMode(me, field, rule);
  const target = me.mode.kind === "pass" ? me.mode.target : RAIL_LANE;
  const gap = target - me.lane;
  const want = Math.sign(gap) * Math.min(gap > 0 ? outCap : inCap, stoppable(Math.abs(gap), dt));

  const step = LATERAL_ACCEL * dt;
  let vel = me.laneVel + Math.max(-step, Math.min(step, want - me.laneVel));
  vel = Math.max(-inCap, Math.min(outCap, vel));
  if (vel * gap > 0) vel = Math.sign(vel) * Math.min(Math.abs(vel), Math.abs(gap) / dt);
  const side = Math.sign(vel);
  if (side !== 0) {
    const room = sideRoom(me, field, side);
    vel = side * Math.min(Math.abs(vel), stoppable(room, dt));
  }
  me.lane += vel * dt;
  me.laneVel = vel;
}

/** Fastest lateral speed that can still brake to rest within `distance` lanes, stepping at `dt`. */
function stoppable(distance: number, dt: number) {
  const half = (LATERAL_ACCEL * dt) / 2;
  return Math.min(distance / dt, Math.sqrt(2 * LATERAL_ACCEL * distance + half * half) - half);
}

function nextMode(me: LaneRunner, field: LaneRunner[], rule: LaneRule): LaneMode {
  const mode = me.mode;
  if (mode.kind === "pass") {
    const rival = mode.rival;
    const gap = rival.meters - me.meters;
    const cleared = gap <= -HORSE_LENGTH_M;
    const lost = gap > 2 * BLOCK_AHEAD_LENGTHS * HORSE_LENGTH_M || (gap > 0 && me.speed <= rival.speed);
    const outward = mode.target > me.lane;
    if (rival.frozen || cleared || lost || (outward && rule.outRate === 0)) return { kind: "settle" };
    return mode;
  }
  const front = blocker(me, field);
  if (!front || me.speed <= front.speed + EPS) return mode;
  const inside = front.lane - LATERAL_OVERLAP;
  if (rule.railGap && inside >= RAIL_LANE && sideRoom(me, field, -1) >= me.lane - inside - EPS) {
    return { kind: "pass", rival: front, target: inside };
  }
  const outside = front.lane + LATERAL_OVERLAP;
  if (rule.outRate > 0 && outside <= OUTER_LANE && sideRoom(me, field, 1) >= outside - me.lane - EPS) {
    return { kind: "pass", rival: front, target: outside };
  }
  return mode;
}

/** Nearest horse ahead within 1.5 lengths sharing my path. */
function blocker(me: LaneRunner, field: LaneRunner[]) {
  let best: LaneRunner | undefined;
  for (const other of field) {
    const ahead = other.meters - me.meters;
    if (other === me || ahead <= 0 || ahead > BLOCK_AHEAD_LENGTHS * HORSE_LENGTH_M) continue;
    if (Math.abs(other.lane - me.lane) >= LATERAL_OVERLAP) continue;
    if (!best || ahead < best.meters - me.meters) best = other;
  }
  return best;
}

/**
 * Lanes I may still move toward `side` (+1 out, −1 in). Horses alongside or
 * up to 1.5 lengths ahead on that side keep me one lane off. Zero means the
 * change is forbidden.
 */
function sideRoom(me: LaneRunner, field: LaneRunner[], side: number) {
  let room = side > 0 ? OUTER_LANE - me.lane : me.lane - RAIL_LANE;
  for (const other of field) {
    if (other === me) continue;
    const across = (other.lane - me.lane) * side;
    if (across <= 0) continue;
    const ahead = other.meters - me.meters;
    if (ahead <= EPS - HORSE_LENGTH_M || ahead > BLOCK_AHEAD_LENGTHS * HORSE_LENGTH_M) continue;
    room = Math.min(room, across - LATERAL_OVERLAP);
  }
  return Math.max(0, room);
}

function allowedSpeed(me: LaneRunner, field: LaneRunner[], advanced: Map<LaneRunner, number>, dt: number) {
  let speed = me.speed;
  const front = blocker(me, field);
  if (front && advanced.has(front)) speed = Math.min(speed, front.speed);
  for (const [other, reached] of advanced) {
    if (Math.abs(other.lane - me.lane) >= LATERAL_OVERLAP) continue;
    speed = Math.min(speed, (reached - HORSE_LENGTH_M - me.meters) / dt);
  }
  return Math.max(0, speed);
}
