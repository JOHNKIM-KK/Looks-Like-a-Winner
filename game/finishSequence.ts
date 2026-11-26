import { HORSE_LENGTH_M } from "@/lib/lanes";
import { progressAt } from "@/lib/race";
import { HORSE_PX_PER_M, LOGICAL_PER_METER, nearRailRadius } from "./artScale";
import { smoothstep } from "./droneIntro";
import { PROJECTION_CENTER, REFERENCE } from "./stage";
import {
  ENGINE_PX_PER_M,
  finishGoalX,
  presentationLogical,
  projectWithCamera,
  referenceDistance,
  type Camera,
} from "./track";

/**
 * Finish presentation v4 (SPEC §3-2).
 * Slow motion and the 2× catch-up change render time only.
 * Simulation finish times, samples, and ranks stay as simulated.
 *
 * Sim time: contest windows (0.4s before / 0.2s after), the 0.5s keep-slow gap,
 * and the 3s before 2× playback.
 * Wall time: 0.2s easings, the 1.5s slow cap, the 8s confirm, and the 0.5s board delay.
 */
export const FINISH_TIMELINE = {
  /** 3 lengths. The side camera cuts in when the leader's nose is this far out. */
  closeM: 3 * HORSE_LENGTH_M,
  groupGap: 0.15,
  photoGap: 0.03,
  slowLead: 0.4,
  slowTail: 0.2,
  /** Keep one slow when the next window starts within this many sim seconds. */
  holdGap: 0.5,
  slowScale: 0.3,
  easeSec: 0.2,
  slowMaxSec: 1.5,
  fastAfter: 3,
  fastScale: 2,
  confirmSec: 8,
  boardSec: 0.5,
  cameraBlendSec: 0.35,
} as const;

/**
 * Side-view sheets put the nose 159 sheet px ahead of the ground anchor.
 */
export const NOSE_AHEAD_M = 159 / HORSE_PX_PER_M;

const COURSE_M = referenceDistance() / ENGINE_PX_PER_M;
const FINISH_X_M = finishGoalX() / ENGINE_PX_PER_M;
const SENSOR_MM = 36;
const EPS = 1e-9;
const EASE = FINISH_TIMELINE.easeSec;
/** Ease-out starts this far into a burst so ease-in + hold + ease-out stays within 1.5s. */
const CAP_AT = FINISH_TIMELINE.slowMaxSec - FINISH_TIMELINE.easeSec;

export type BoardHorse = {
  id: string;
  name: string;
  number: number;
  rank: number;
  finishTime: number;
};

export type PhotoPair = { from: number; to: number };

export type ContestGroup = {
  horses: BoardHorse[];
  slowStart: number;
  slowEnd: number;
  photoPairs: PhotoPair[];
};

export type SlowSpan = {
  start: number;
  end: number;
  horseIds: string[];
  /** True when two groups were joined because their windows sit within `holdGap`. */
  merged: boolean;
  photoPairs: PhotoPair[];
};

export type FinishPlan = {
  ranking: BoardHorse[];
  winnerAt: number;
  lastAt: number;
  /** Sim time when the leader's nose is `closeM` from the line. */
  cameraAt: number;
  groups: ContestGroup[];
  spans: SlowSpan[];
};

export type FinishPhase =
  | { kind: "before" }
  | { kind: "line" }
  | { kind: "easeIn"; age: number; span: number }
  | { kind: "slow"; age: number; span: number }
  | { kind: "easeOut"; age: number; span: number; reason: "end" | "cap" };

export type FinishState = {
  phase: FinishPhase;
  raceTime: number;
  /** Wall seconds since the side camera started. -1 before that. */
  cameraAge: number;
  /** Wall seconds since the winner's finishTime. -1 before that. */
  sinceWinner: number;
  /** Wall seconds since the last finisher or the 8s confirm. -1 before that. */
  sinceMark: number;
  /** Wall seconds spent in the current slow burst, including both easings. */
  burstWall: number;
  /** Span currently playing, or the next span to enter. */
  spanIndex: number;
  timedOut: boolean;
};

export const FINISH_START: FinishState = {
  phase: { kind: "before" },
  raceTime: 0,
  cameraAge: -1,
  sinceWinner: -1,
  sinceMark: -1,
  burstWall: 0,
  spanIndex: 0,
  timedOut: false,
};

export type FinishCourse = {
  leadProgressAt: (raceTime: number) => number;
};

/** Leader's nose to the line, metres. Negative once the nose is past the line. */
export function toGoAt(course: FinishCourse, raceTime: number) {
  return COURSE_M * (1 - course.leadProgressAt(raceTime)) - NOSE_AHEAD_M;
}

function firstTime(test: (raceTime: number) => boolean, end: number) {
  let low = 0;
  let high = Math.max(0, end);
  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2;
    if (test(mid)) high = mid;
    else low = mid;
  }
  return high;
}

export function finishCourseFrom(leadProgressAt: (raceTime: number) => number): FinishCourse {
  return { leadProgressAt };
}

export function finishCourseForRace(horses: readonly { samples: number[] }[]): FinishCourse {
  return finishCourseFrom((t) => Math.max(...horses.map((horse) => progressAt(horse.samples, t))));
}

/** Sim time when the leader's nose reaches `closeM` before the line. */
export function cameraAtFor(course: FinishCourse, end: number) {
  return firstTime((t) => toGoAt(course, t) <= FINISH_TIMELINE.closeM, end);
}

function byFinish(horses: readonly BoardHorse[]) {
  return [...horses].sort((a, b) => a.finishTime - b.finishTime || a.rank - b.rank);
}

/** Contiguous finishers whose consecutive gaps are within 0.15s. Singles are dropped. */
export function contestGroups(horses: readonly BoardHorse[]): ContestGroup[] {
  const sorted = byFinish(horses);
  const chunks: BoardHorse[][] = [];
  let current: BoardHorse[] = [];
  for (const horse of sorted) {
    const prev = current[current.length - 1];
    if (prev && horse.finishTime - prev.finishTime > FINISH_TIMELINE.groupGap + EPS) {
      if (current.length >= 2) chunks.push(current);
      current = [horse];
    } else {
      current.push(horse);
    }
  }
  if (current.length >= 2) chunks.push(current);
  return chunks.map((group) => {
    const first = group[0]?.finishTime ?? 0;
    const last = group[group.length - 1]?.finishTime ?? first;
    const photoPairs: PhotoPair[] = [];
    for (let index = 1; index < group.length; index += 1) {
      const from = group[index - 1]?.finishTime ?? 0;
      const to = group[index]?.finishTime ?? from;
      if (to - from <= FINISH_TIMELINE.photoGap + EPS) photoPairs.push({ from, to });
    }
    return {
      horses: group,
      slowStart: first - FINISH_TIMELINE.slowLead,
      slowEnd: last + FINISH_TIMELINE.slowTail,
      photoPairs,
    };
  });
}

/** Merge groups whose slow windows start within 0.5s of the previous window's end. */
export function slowSpans(groups: readonly ContestGroup[]): SlowSpan[] {
  const spans: SlowSpan[] = [];
  for (const group of groups) {
    const prev = spans[spans.length - 1];
    if (prev && group.slowStart - prev.end <= FINISH_TIMELINE.holdGap + EPS) {
      prev.end = Math.max(prev.end, group.slowEnd);
      prev.horseIds.push(...group.horses.map((horse) => horse.id));
      prev.photoPairs.push(...group.photoPairs);
      prev.merged = true;
    } else {
      spans.push({
        start: group.slowStart,
        end: group.slowEnd,
        horseIds: group.horses.map((horse) => horse.id),
        merged: false,
        photoPairs: [...group.photoPairs],
      });
    }
  }
  return spans;
}

export function finishPlanFrom(ranking: readonly BoardHorse[], cameraAt: number): FinishPlan {
  const sorted = byFinish(ranking);
  const groups = contestGroups(sorted);
  return {
    ranking: sorted,
    winnerAt: sorted[0]?.finishTime ?? 0,
    lastAt: sorted[sorted.length - 1]?.finishTime ?? 0,
    cameraAt,
    groups,
    spans: slowSpans(groups),
  };
}

export function finishPlanForRace(
  horses: readonly {
    id: string;
    name: string;
    number: number;
    rank: number;
    finishTime: number;
    samples: number[];
  }[],
): FinishPlan {
  const end = Math.max(0, ...horses.map((horse) => horse.finishTime));
  const ranking = horses.map((horse) => ({
    id: horse.id,
    name: horse.name,
    number: horse.number,
    rank: horse.rank,
    finishTime: horse.finishTime,
  }));
  return finishPlanFrom(ranking, cameraAtFor(finishCourseForRace(horses), end));
}

function cruiseScale(raceTime: number, plan: FinishPlan) {
  return raceTime + EPS >= plan.winnerAt + FINISH_TIMELINE.fastAfter ? FINISH_TIMELINE.fastScale : 1;
}

/** Race seconds per wall second. Never zero: the field does not freeze on the line. */
export function timeScale(state: FinishState, plan: FinishPlan) {
  const base = cruiseScale(state.raceTime, plan);
  const { phase } = state;
  if (phase.kind === "slow") return FINISH_TIMELINE.slowScale;
  if (phase.kind === "easeIn") {
    return base + (FINISH_TIMELINE.slowScale - base) * smoothstep(phase.age / EASE);
  }
  if (phase.kind === "easeOut") {
    return FINISH_TIMELINE.slowScale + (base - FINISH_TIMELINE.slowScale) * smoothstep(phase.age / EASE);
  }
  return base;
}

function burstSpan(state: FinishState) {
  const { phase } = state;
  if (phase.kind === "easeIn" || phase.kind === "slow" || phase.kind === "easeOut") return phase.span;
  return null;
}

type EventName =
  | "winner"
  | "last"
  | "camera"
  | "span-end"
  | "cap"
  | "ease-done"
  | "ease-out-done"
  | "skip-span"
  | "enter-span"
  | "timeout"
  | "fast";

const EVENT_PRIORITY: Record<EventName, number> = {
  winner: 0,
  last: 1,
  camera: 2,
  "span-end": 3,
  cap: 4,
  "ease-done": 5,
  "ease-out-done": 6,
  "skip-span": 7,
  "enter-span": 8,
  timeout: 9,
  fast: 10,
};

function nextEvent(state: FinishState, plan: FinishPlan, scale: number): { wall: number; event: EventName } | null {
  const found: { wall: number; event: EventName }[] = [];
  const add = (wall: number, event: EventName) => {
    if (!Number.isFinite(wall)) return;
    found.push({ wall: Math.max(0, wall), event });
  };
  const safe = Math.max(scale, 1e-6);
  const { phase } = state;

  if (phase.kind === "easeIn") add(EASE - phase.age, "ease-done");
  if (phase.kind === "easeOut") add(EASE - phase.age, "ease-out-done");
  if ((phase.kind === "easeIn" || phase.kind === "slow") && state.burstWall < CAP_AT) {
    add(CAP_AT - state.burstWall, "cap");
  }

  const active = burstSpan(state);
  if (active !== null && (phase.kind === "easeIn" || phase.kind === "slow")) {
    const span = plan.spans[active];
    if (span) add(state.raceTime >= span.end - EPS ? 0 : (span.end - state.raceTime) / safe, "span-end");
  }

  if (active === null && state.spanIndex < plan.spans.length) {
    const span = plan.spans[state.spanIndex];
    if (span) {
      if (state.raceTime >= span.end - EPS) add(0, "skip-span");
      else if (state.raceTime >= span.start - EPS) add(0, "enter-span");
      else add((span.start - state.raceTime) / safe, "enter-span");
    }
  }

  if (state.cameraAge < 0) {
    add(state.raceTime >= plan.cameraAt - EPS ? 0 : (plan.cameraAt - state.raceTime) / safe, "camera");
  }
  if (state.sinceWinner < 0) {
    add(state.raceTime >= plan.winnerAt - EPS ? 0 : (plan.winnerAt - state.raceTime) / safe, "winner");
  }
  if (state.sinceMark < 0 && !state.timedOut) {
    add(state.raceTime >= plan.lastAt - EPS ? 0 : (plan.lastAt - state.raceTime) / safe, "last");
  }
  if (!state.timedOut && state.sinceWinner >= 0 && state.raceTime < plan.lastAt - EPS) {
    add(
      state.sinceWinner >= FINISH_TIMELINE.confirmSec - 1e-12 ? 0 : FINISH_TIMELINE.confirmSec - state.sinceWinner,
      "timeout",
    );
  }
  if (phase.kind !== "slow" && state.raceTime < plan.winnerAt + FINISH_TIMELINE.fastAfter - 1e-12) {
    add((plan.winnerAt + FINISH_TIMELINE.fastAfter - state.raceTime) / safe, "fast");
  }

  found.sort((a, b) => a.wall - b.wall || EVENT_PRIORITY[a.event] - EVENT_PRIORITY[b.event]);
  return found[0] ?? null;
}

function integrate(state: FinishState, slice: number, scale: number): FinishState {
  const { phase } = state;
  const aged =
    phase.kind === "easeIn" || phase.kind === "slow" || phase.kind === "easeOut"
      ? { ...phase, age: phase.age + slice }
      : phase;
  return {
    ...state,
    phase: aged,
    raceTime: state.raceTime + slice * scale,
    cameraAge: state.cameraAge < 0 ? -1 : state.cameraAge + slice,
    sinceWinner: state.sinceWinner < 0 ? -1 : state.sinceWinner + slice,
    sinceMark: state.sinceMark < 0 ? -1 : state.sinceMark + slice,
    burstWall: burstSpan(state) !== null ? state.burstWall + slice : state.burstWall,
  };
}

function applyEvent(state: FinishState, event: EventName, plan: FinishPlan): FinishState {
  switch (event) {
    case "camera":
      return {
        ...state,
        cameraAge: Math.max(0, state.cameraAge),
        phase: state.phase.kind === "before" ? { kind: "line" } : state.phase,
      };
    case "winner":
      return { ...state, sinceWinner: 0 };
    case "last":
      return { ...state, sinceMark: 0 };
    case "timeout":
      return { ...state, timedOut: true, sinceMark: state.sinceMark < 0 ? 0 : state.sinceMark };
    case "fast": {
      const at = plan.winnerAt + FINISH_TIMELINE.fastAfter;
      return state.raceTime < at ? { ...state, raceTime: at } : state;
    }
    case "enter-span":
      return { ...state, phase: { kind: "easeIn", age: 0, span: state.spanIndex }, burstWall: 0 };
    case "skip-span":
      return { ...state, spanIndex: state.spanIndex + 1, burstWall: 0 };
    case "ease-done":
      return state.phase.kind === "easeIn"
        ? { ...state, phase: { kind: "slow", age: 0, span: state.phase.span } }
        : state;
    case "cap":
    case "span-end": {
      if (state.phase.kind !== "easeIn" && state.phase.kind !== "slow") return state;
      return {
        ...state,
        phase: { kind: "easeOut", age: 0, span: state.phase.span, reason: event === "cap" ? "cap" : "end" },
      };
    }
    case "ease-out-done": {
      if (state.phase.kind !== "easeOut") return state;
      const span = plan.spans[state.phase.span];
      const restart = state.phase.reason === "cap" && !!span && state.raceTime < span.end - 1e-8;
      if (restart) {
        return { ...state, phase: { kind: "easeIn", age: 0, span: state.phase.span }, burstWall: 0 };
      }
      return {
        ...state,
        spanIndex: state.phase.span + 1,
        burstWall: 0,
        phase: state.cameraAge >= 0 ? { kind: "line" } : { kind: "before" },
      };
    }
    default:
      return state;
  }
}

function stamp(state: FinishState) {
  const { phase } = state;
  const span = "span" in phase ? phase.span : -1;
  const reason = phase.kind === "easeOut" ? phase.reason : "";
  return `${phase.kind}|${span}|${reason}|${state.spanIndex}|${state.cameraAge >= 0}|${state.timedOut}|${state.sinceWinner >= 0}|${state.sinceMark >= 0}|${state.raceTime.toFixed(7)}`;
}

export function advanceFinish(state: FinishState, wallDt: number, plan: FinishPlan): FinishState {
  let left = Math.max(0, wallDt);
  let guard = 0;
  while (left > 1e-9 && guard < 64) {
    guard += 1;
    const scale = timeScale(state, plan);
    const next = nextEvent(state, plan, scale);
    if (next && next.wall <= 1e-8) {
      const before = stamp(state);
      state = applyEvent(state, next.event, plan);
      if (stamp(state) === before) {
        const nudge = Math.min(left, 1e-4);
        state = integrate(state, nudge, scale);
        left -= nudge;
      }
      continue;
    }
    const easing = state.phase.kind === "easeIn" || state.phase.kind === "easeOut";
    const slice = Math.min(left, next?.wall ?? left, easing ? 1 / 120 : Number.POSITIVE_INFINITY);
    if (!(slice > 1e-12)) break;
    state = integrate(state, slice, scale);
    left -= slice;
    if (next && next.wall - slice <= 1e-8) state = applyEvent(state, next.event, plan);
  }
  return state;
}

/**
 * Horses in a slow span stay off the board until that span's ease-out finishes.
 * The 8s confirm (and the 8.5s cap) publishes the simulated order immediately.
 */
export function revealedRows(state: FinishState, plan: FinishPlan): BoardHorse[] {
  const forced =
    state.timedOut || state.sinceWinner >= FINISH_TIMELINE.confirmSec + FINISH_TIMELINE.boardSec - 1e-6;
  if (forced) return plan.ranking;
  const hidden = new Set<string>();
  plan.spans.forEach((span, index) => {
    if (state.spanIndex <= index) for (const id of span.horseIds) hidden.add(id);
  });
  const rows: BoardHorse[] = [];
  for (const horse of plan.ranking) {
    if (hidden.has(horse.id)) break;
    if (state.raceTime + EPS < horse.finishTime) break;
    rows.push(horse);
  }
  return rows;
}

/**
 * Full results open 0.5s after the last horse (or the 8s confirm).
 * A slow that still covers unpublished horses holds the screen until the slow ends,
 * so the group is not shown while the slow is playing. The wait never passes 8.5s
 * after the winner.
 */
export function boardDue(state: FinishState, plan: FinishPlan) {
  if (state.sinceWinner >= FINISH_TIMELINE.confirmSec + FINISH_TIMELINE.boardSec - 1e-6) return true;
  if (state.sinceMark < FINISH_TIMELINE.boardSec - 1e-6) return false;
  if (state.timedOut) return true;
  return revealedRows(state, plan).length === plan.ranking.length;
}

export type PresentationBoard = {
  rows: BoardHorse[];
  complete: boolean;
  winnerName: string | null;
};

export function presentationBoard(state: FinishState, plan: FinishPlan): PresentationBoard {
  return {
    rows: revealedRows(state, plan),
    complete: boardDue(state, plan),
    winnerName: state.sinceWinner >= 0 ? (plan.ranking[0]?.name ?? null) : null,
  };
}

export function showsPhotoFinish(state: FinishState, plan: FinishPlan) {
  return plan.spans.some((span) =>
    span.photoPairs.some((pair) => state.raceTime >= pair.from - EPS && state.raceTime <= pair.to + EPS),
  );
}

export type CaptionCue = "line" | "contest" | "photo" | "winner" | "result";

export function captionCue(state: FinishState, plan: FinishPlan): CaptionCue | null {
  if (boardDue(state, plan)) return "result";
  if (showsPhotoFinish(state, plan)) return "photo";
  if (burstSpan(state) !== null) return "contest";
  if (state.sinceWinner >= 0) return "winner";
  if (state.cameraAge >= 0) return "line";
  return null;
}

function hasFinalConsonant(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

/** Subject 이/가 and conjunction 과/와 picked by the word's final consonant. */
export function josa(word: string, pair: "이/가" | "과/와") {
  const [withFinal, withoutFinal] = pair.split("/");
  return word + (hasFinalConsonant(word) ? withFinal : withoutFinal);
}

/** `live` is the on-screen order when the cue starts; `podium` is the race result. */
export function captionText(cue: CaptionCue, live: readonly string[], podium: readonly string[]) {
  const [a = "", b = "", c = ""] = live;
  const [first = "", second = "", third = ""] = podium;
  switch (cue) {
    case "line":
      return `결승선이 다가옵니다! ${josa(a, "이/가")} 앞섭니다!`;
    case "contest":
      if (b && c) return `${josa(a, "과/와")} ${b}, ${c}까지 접전입니다!`;
      if (b) return `${josa(a, "과/와")} ${b}의 접전입니다!`;
      return `${josa(a, "이/가")} 앞서 나갑니다!`;
    case "photo":
      return "사진 판정할 것 같습니다!";
    case "winner":
      return `${first}! ${josa(first, "이/가")} 해냈습니다!`;
    case "result":
      return `${first} 1착! ${second} 2착, ${third} 3착!`;
  }
}

type Vec3 = { x: number; y: number; z: number };
type Shot = { cam: Vec3; target: Vec3; mm: number };

/**
 * Tracking rig on the outer rail (v3 f02/f04). v4 parks it on the finish line and leaves x alone.
 * y is a gap from the drawn outer rail, not a world constant. On the 14 m oval that rail sat at
 * 21.90 m, so the storyboard's 22.7 / 8.6 is 0.80 m outside the rail, looking 13.30 m in across
 * the lanes. Plan C moved the rail out to ~33 m and left these y values behind, so the rig stood
 * on the dirt and the 45 mm lens filled the frame with the inner rail.
 */
const OUTER_RAIL_M = nearRailRadius() / ENGINE_PX_PER_M;
const CAM_BEYOND_RAIL_M = 0.8;
const TARGET_INSIDE_RAIL_M = 13.3;
const RIG = {
  camY: OUTER_RAIL_M + CAM_BEYOND_RAIL_M,
  camZ: 1.35,
  targetY: OUTER_RAIL_M - TARGET_INSIDE_RAIL_M,
  targetZ: 1.05,
  mm: 45,
} as const;

const LINE_SHOT: Shot = {
  cam: { x: FINISH_X_M, y: RIG.camY, z: RIG.camZ },
  target: { x: FINISH_X_M, y: RIG.targetY, z: RIG.targetZ },
  mm: RIG.mm,
};

function lookCamera({ cam, target, mm }: Shot): Camera {
  const dx = target.x - cam.x;
  const dy = target.y - cam.y;
  const focalLength = (mm / SENSOR_MM) * REFERENCE.width;
  const centerDrop = Math.atan((REFERENCE.height / 2 - PROJECTION_CENTER.y) / focalLength);
  return {
    groundX: cam.x * ENGINE_PX_PER_M,
    groundY: cam.y * ENGINE_PX_PER_M,
    height: cam.z * ENGINE_PX_PER_M,
    yaw: Math.atan2(-dx, dy),
    pitch: Math.atan2(cam.z - target.z, Math.hypot(dx, dy)) - centerDrop,
    focalLength,
    maxScale: Number.POSITIVE_INFINITY,
  };
}

function lerpAngle(from: number, to: number, t: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

function blendCamera(from: Camera, to: Camera, t: number): Camera {
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    groundX: lerp(from.groundX, to.groundX),
    groundY: lerp(from.groundY, to.groundY),
    height: lerp(from.height, to.height),
    pitch: lerp(from.pitch, to.pitch),
    yaw: lerpAngle(from.yaw, to.yaw, t),
    focalLength: lerp(from.focalLength, to.focalLength),
    maxScale: to.maxScale,
  };
}

export type FinishFrame = {
  /** Race camera on the frame the side angle takes over. */
  enteredFrom: Camera;
};

/** Side camera fixed on the finish line. Null until the leader's nose is within 3 lengths. */
export function finishCamera(state: FinishState, frame: FinishFrame): Camera | null {
  if (state.cameraAge < 0) return null;
  const fixed = lookCamera(LINE_SHOT);
  const blend = FINISH_TIMELINE.cameraBlendSec;
  if (state.cameraAge < blend) return blendCamera(frame.enteredFrom, fixed, smoothstep(state.cameraAge / blend));
  return fixed;
}

/** The rig sits outside the outer rail, so that rail would cover the lower frame. */
export function showsOuterRail(state: FinishState) {
  return state.cameraAge < 0;
}

function arrivalSpeed(samples: number[], finishTime: number) {
  const window = Math.min(0.3, finishTime);
  return ((1 - progressAt(samples, finishTime - window)) * COURSE_M) / window;
}

type Finisher = { samples: number[]; finishTime: number };

/**
 * Progress each horse is drawn at, by finishing order. Up to the line it is the simulation. Past
 * it a horse keeps its arrival speed instead of the sim's brake, which would stop the field on
 * the finish camera. It never closes on the horse that finished ahead of it past the gap the two
 * had at the line, so the finishing order stays readable while they run off the side of the frame.
 */
export function gallopOut(ranking: readonly Finisher[]) {
  const speeds = ranking.map((horse) => arrivalSpeed(horse.samples, horse.finishTime));
  const gaps: number[] = [];
  const pastLine = (index: number, raceTime: number): number => {
    const speed = speeds[index] ?? 0;
    const run = Math.max(0, raceTime - (ranking[index]?.finishTime ?? 0));
    const own = speed * run;
    return index === 0 ? own : Math.min(own, pastLine(index - 1, raceTime) - (gaps[index] ?? 0));
  };
  ranking.forEach((horse, index) => gaps.push(index === 0 ? 0 : Math.max(0, pastLine(index - 1, horse.finishTime))));
  return (index: number, raceTime: number) => {
    const horse = ranking[index];
    if (!horse) return 0;
    if (horse.finishTime <= 0 || raceTime <= horse.finishTime) return progressAt(horse.samples, raceTime);
    return 1 + pastLine(index, raceTime) / COURSE_M;
  };
}

/**
 * The whole horse is outside the fixed finish side frame.
 * One length of padding covers the sprite around the ground anchor.
 */
export function clearOfLineCamera(progress: number, lane: number) {
  if (!(progress >= 1)) return false;
  const pose = projectWithCamera(presentationLogical(progress, lane), lookCamera(LINE_SHOT));
  if (!pose.visible) return true;
  const pad = HORSE_LENGTH_M * pose.scale * LOGICAL_PER_METER;
  return pose.x - pad > REFERENCE.width || pose.x + pad < 0;
}
