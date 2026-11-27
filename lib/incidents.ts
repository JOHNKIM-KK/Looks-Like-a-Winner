import { ENGINE_PX_PER_M, STRAIGHT, innerRailRadius, referenceDistance, trackPoint } from "@/game/track";
import { HORSE_LENGTH_M } from "./lanes";
import { mixSeed, mulberry32 } from "./rng";

export type DismountCause = "collision" | "titan" | "graze";
export type FootMode = "run" | "super" | "bike";
export type TrackSpot = { progress: number; lane: number };

export type Dismount = {
  /** Race time the jockey leaves the saddle. */
  time: number;
  cause: DismountCause;
  mode: FootMode;
  /** Where the horse stops (collision), is eaten (titan) or leaves the track (graze). */
  horseAt: TrackSpot;
  /** Collision: the other horse. */
  partnerId?: string;
};

/** What the renderer draws for the horse body once the jockey has left. */
export type HorseFate =
  | { kind: "down"; at: TrackSpot }
  | { kind: "eaten"; at: TrackSpot; titanFrom: number; grabAt: number }
  | { kind: "graze"; from: TrackSpot; spot: { x: number; y: number }; walkUntil: number };

export type TitanPlan = { enterAt: number; targetId: string };

export type IncidentPlan = {
  dismounts: Map<string, Dismount>;
  fates: Map<string, HorseFate>;
  titan: TitanPlan | null;
};

export type ForcedIncident = { cause?: DismountCause; mode?: FootMode };

/** Every number the incident system tunes lives here. */
export const INCIDENT_TUNING = {
  /** Fall sheet length, then the get-up before the jockey moves. */
  fallS: 0.42,
  getUpS: 0.35,
  runFactor: 0.72,
  superFactor: 1.15,
  superRampS: 0.5,
  bikeSummonS: 1.5,
  bikeFrom: 0.5,
  bikeTo: 3.0,
  bikeRampS: 7,
  modeWeights: { run: 0.6, super: 0.2, bike: 0.2 } satisfies Record<FootMode, number>,
  /** No bike when less than this share of the race is left. */
  bikeMinRemaining: 0.12,
  collisionChance: 0.45,
  titanChance: 0.15,
  grazeChance: 0.15,
  /** Incident window and spacing. */
  firstAt: 4,
  minGap: 4,
  leaderCutoff: 0.85,
  collisionEarliest: [4, 20],
  collisionLaneGap: 1.05,
  titanEnter: [8, 28],
  titanRunInS: 2.5,
  grazeAt: [10, 30],
  grazeTop: [1, 3],
  grazeWalkS: 3,
  /** Spots sit this share of the inner-rail radius off the infield core line. */
  infieldDepth: 0.55,
  infieldSpreadPx: 190,
  infieldCoreHalf: 0.3,
} as const;

const T = INCIDENT_TUNING;
const RACE_LENGTH_M = referenceDistance() / ENGINE_PX_PER_M;
const FOOT_START = T.fallS + T.getUpS;

function smoothstep(value: number) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

/** On-foot speed as a share of the horse's normal `speedAt`. */
export function footSpeedFactor(mode: FootMode, sinceDismount: number) {
  const moving = sinceDismount - FOOT_START;
  if (moving <= 0) return 0;
  if (mode === "run") return T.runFactor;
  if (mode === "super") return T.superFactor * Math.min(1, moving / T.superRampS);
  const rolling = moving - T.bikeSummonS;
  if (rolling <= 0) return 0;
  return T.bikeFrom + (T.bikeTo - T.bikeFrom) * smoothstep(rolling / T.bikeRampS);
}

/** Debug URL override: `?incident=collision|titan|graze&mode=run|super|bike`. Unknown values are dropped. */
export function parseForcedIncident(search: string): ForcedIncident | null {
  const params = new URLSearchParams(search);
  const cause = params.get("incident");
  const mode = params.get("mode");
  const forced: ForcedIncident = {};
  if (cause === "collision" || cause === "titan" || cause === "graze") forced.cause = cause;
  if (mode === "run" || mode === "super" || mode === "bike") forced.mode = mode;
  return forced.cause || forced.mode ? forced : null;
}

export function rollMode(random: () => number, progress: number, forced?: FootMode): FootMode {
  if (forced) return forced;
  const weights = { ...T.modeWeights };
  if (1 - progress < T.bikeMinRemaining) weights.bike = 0;
  const total = weights.run + weights.super + weights.bike;
  let pick = random() * total;
  for (const mode of ["run", "super", "bike"] as const) {
    pick -= weights[mode];
    if (pick < 0) return mode;
  }
  return "run";
}

/** One entrant as the director sees it at a step. */
export type FieldEntry = {
  id: string;
  progress: number;
  lane: number;
  /** Still in the saddle. */
  mounted: boolean;
  /** Not finished and not moved by a skill. */
  racing: boolean;
};

type BigPlan = { kind: "titan" | "graze"; at: number; count: number };

export type IncidentSchedule = {
  collisionEarliest: number | null;
  big: BigPlan | null;
  forced: ForcedIncident | null;
};

function between(random: () => number, range: readonly [number, number]) {
  return range[0] + random() * (range[1] - range[0]);
}

function round1(value: number) {
  return Number(value.toFixed(1));
}

/** Decides up front which incidents this race may have and when they may start. */
export function planIncidents(seed: number, forced: ForcedIncident | null = null): IncidentSchedule {
  const random = mulberry32(mixSeed(seed, 7000));
  const collisionRoll = random();
  const collisionAt = round1(between(random, T.collisionEarliest));
  const bigRoll = random();
  const titanAt = round1(between(random, T.titanEnter));
  const grazeAt = round1(between(random, T.grazeAt));
  const grazeCount = Math.floor(between(random, [T.grazeTop[0], T.grazeTop[1] + 1]));

  let collisionEarliest = collisionRoll < T.collisionChance ? collisionAt : null;
  let big: BigPlan | null = null;
  if (bigRoll < T.titanChance) big = { kind: "titan", at: titanAt, count: 1 };
  else if (bigRoll < T.titanChance + T.grazeChance) big = { kind: "graze", at: grazeAt, count: grazeCount };

  if (forced?.cause) {
    collisionEarliest = null;
    big = null;
    if (forced.cause === "collision") collisionEarliest = T.firstAt + 1;
    if (forced.cause === "titan") big = { kind: "titan", at: 7 + (titanAt % 1), count: 1 };
    if (forced.cause === "graze") big = { kind: "graze", at: 8 + (grazeAt % 1), count: grazeCount };
  }
  return { collisionEarliest, big, forced };
}

/** Planned dismount time of the big event. A titan lands its grab after the run-in. */
function bigDismountAt(big: BigPlan) {
  return big.kind === "titan" ? big.at + T.titanRunInS : big.at;
}

export type IncidentDirector = {
  /** Call once per sim step, before speeds. Returns the dismounts created at `time`. */
  step(time: number, field: readonly FieldEntry[]): { id: string; dismount: Dismount }[];
  plan(): IncidentPlan;
};

/** Infield spot well inside the inner rail, on the same side of the oval as the horse. */
export function infieldSpot(from: TrackSpot, index: number, random: () => number) {
  const at = trackPoint(from.progress, from.lane);
  const core = Math.min(Math.max(at.x, -STRAIGHT * T.infieldCoreHalf), STRAIGHT * T.infieldCoreHalf);
  const dx = at.x - core;
  const dy = at.y;
  const length = Math.hypot(dx, dy) || 1;
  const depth = Math.min(length, innerRailRadius() * T.infieldDepth) * (0.9 + random() * 0.2);
  const side = (index - 1) * T.infieldSpreadPx;
  const x = core + (dx / length) * depth + side;
  return {
    x: Math.min(Math.max(x, -STRAIGHT * 0.4), STRAIGHT * 0.4),
    y: (dy / length) * depth,
  };
}

export function createDirector(seed: number, schedule: IncidentSchedule): IncidentDirector {
  const random = mulberry32(mixSeed(seed, 7100));
  const plan: IncidentPlan = { dismounts: new Map(), fates: new Map(), titan: null };
  const forcedMode = schedule.forced?.mode;
  const forcedCause = schedule.forced?.cause;
  const bigAt = schedule.big ? bigDismountAt(schedule.big) : null;
  let collisionDone = false;
  let bigDone = false;
  let titanGrabAt: number | null = null;
  let lastIncident = -Infinity;

  function leave(entry: FieldEntry, time: number, cause: DismountCause, partnerId?: string): Dismount {
    const horseAt = { progress: entry.progress, lane: entry.lane };
    const dismount: Dismount = {
      time,
      cause,
      mode: rollMode(random, entry.progress, forcedMode),
      horseAt,
      ...(partnerId ? { partnerId } : {}),
    };
    plan.dismounts.set(entry.id, dismount);
    lastIncident = time;
    return dismount;
  }

  function nearPair(field: readonly FieldEntry[], relaxed: boolean) {
    let best: { a: FieldEntry; b: FieldEntry; cost: number } | null = null;
    for (let i = 0; i < field.length; i += 1) {
      for (let j = i + 1; j < field.length; j += 1) {
        const a = field[i] as FieldEntry;
        const b = field[j] as FieldEntry;
        const lanes = Math.abs(a.lane - b.lane);
        const gapM = Math.abs(a.progress - b.progress) * RACE_LENGTH_M;
        const touching = lanes < T.collisionLaneGap && gapM < HORSE_LENGTH_M;
        if (!relaxed && !touching) continue;
        const cost = lanes + gapM / HORSE_LENGTH_M;
        if (!best || cost < best.cost) best = { a, b, cost };
      }
    }
    return best;
  }

  return {
    step(time, field) {
      const born: { id: string; dismount: Dismount }[] = [];
      const mounted = field.filter((entry) => entry.mounted && entry.racing && entry.progress < 1);
      const leader = field.reduce((best, entry) => Math.max(best, entry.progress), 0);
      const open = leader <= T.leaderCutoff && time >= T.firstAt && time - lastIncident >= T.minGap;

      const big = schedule.big;
      if (big && !bigDone) {
        if (big.kind === "titan") {
          if (titanGrabAt === null && time >= big.at) {
            const pool = field.filter((entry) => entry.mounted && entry.racing && entry.progress < 1);
            const target = pool.length > 0 && leader <= T.leaderCutoff ? pool[Math.floor(random() * pool.length)] : undefined;
            if (target) {
              plan.titan = { enterAt: time, targetId: target.id };
              titanGrabAt = time + T.titanRunInS;
            } else {
              bigDone = true;
            }
          }
          if (titanGrabAt !== null && time + 1e-6 >= titanGrabAt && plan.titan) {
            const target = field.find((entry) => entry.id === plan.titan?.targetId);
            if (target && target.mounted && target.racing) {
              const dismount = leave(target, time, "titan");
              plan.fates.set(target.id, { kind: "eaten", at: dismount.horseAt, titanFrom: plan.titan.enterAt, grabAt: time });
              born.push({ id: target.id, dismount });
            }
            bigDone = true;
          }
        } else if (open && time >= big.at) {
          const top = [...mounted].sort((a, b) => b.progress - a.progress).slice(0, big.count);
          top.forEach((entry, index) => {
            const dismount = leave(entry, time, "graze");
            const spot = infieldSpot(dismount.horseAt, index, random);
            plan.fates.set(entry.id, { kind: "graze", from: dismount.horseAt, spot, walkUntil: time + T.grazeWalkS });
            born.push({ id: entry.id, dismount });
          });
          bigDone = true;
        }
      }

      const nearBig = bigAt !== null && !bigDone && Math.abs(time - bigAt) < T.minGap;
      const wantsCollision = schedule.collisionEarliest !== null && !collisionDone && time >= schedule.collisionEarliest;
      if (wantsCollision && open && !nearBig && born.length === 0) {
        const pair = nearPair(mounted, forcedCause === "collision");
        if (pair) {
          const aFalls = random() < 0.5;
          const [faller, partner] = aFalls ? [pair.a, pair.b] : [pair.b, pair.a];
          const dismount = leave(faller, time, "collision", partner.id);
          plan.fates.set(faller.id, { kind: "down", at: dismount.horseAt });
          born.push({ id: faller.id, dismount });
          collisionDone = true;
        }
      }
      return born;
    },
    plan: () => plan,
  };
}
