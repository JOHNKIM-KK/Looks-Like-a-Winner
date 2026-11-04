import { progressAt } from "@/lib/race";
import { HORSE_PX_PER_M } from "./artScale";
import { smoothstep } from "./droneIntro";
import { PROJECTION_CENTER, REFERENCE } from "./stage";
import { ENGINE_PX_PER_M, finishGoalX, referenceDistance, segmentEnds, type Camera } from "./track";

/**
 * Last corner exit to the result board, docs/stage2/storyboard_finish/SHOTS.md (v3).
 * Distances are meters, times seconds.
 */
export const FINISH_TIMELINE = {
  cutAtM: 30,
  slowFromM: 10,
  slowOverM: 3,
  slowScale: 0.5,
  freezeSec: 1.0,
  resumeSec: 0.6,
  riseSec: 1.8,
  boardLeadSec: 0.4,
  enterBlendSec: 0.6,
} as const;

/**
 * Side-view sheets (corner_a0, straight_a2) put the nose at frame x 317–319 with the
 * ground anchor at x 160, measured on the alpha bbox of all 12 frames: 159 sheet px.
 */
export const NOSE_AHEAD_M = 159 / HORSE_PX_PER_M;

/** Finished horses gallop out at this deceleration; 7.8 m/s, the fastest sim arrival, stops 25 m past the line, still on the straight. */
export const GALLOP_OUT_DECEL = 1.2;

const COURSE_M = referenceDistance() / ENGINE_PX_PER_M;
const FINISH_X_M = finishGoalX() / ENGINE_PX_PER_M;
const SENSOR_MM = 36;

export type FinishPhase =
  | { kind: "before" }
  | { kind: "stretch"; age: number }
  | { kind: "track" }
  | { kind: "slow" }
  | { kind: "freeze"; age: number }
  | { kind: "rise"; age: number }
  | { kind: "result"; age: number };

export type FinishState = { phase: FinishPhase; raceTime: number };

export type FinishCourse = {
  exitAt: number;
  cutAt: number;
  freezeAt: number;
  leadProgressAt: (raceTime: number) => number;
};

export const FINISH_START: FinishState = { phase: { kind: "before" }, raceTime: 0 };

/** Leader's nose to the line. */
export function toGoAt(course: FinishCourse, raceTime: number) {
  return COURSE_M * (1 - course.leadProgressAt(raceTime)) - NOSE_AHEAD_M;
}

function firstTime(test: (raceTime: number) => boolean, end: number) {
  let low = 0;
  let high = end;
  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2;
    if (test(mid)) high = mid;
    else low = mid;
  }
  return high;
}

/** Race-time marks from a precomputed race. The lead is the max progress across horses, so it stays continuous through lead changes. */
export function finishCourseFrom(leadProgressAt: (raceTime: number) => number, end: number): FinishCourse {
  const toGo = (raceTime: number) => COURSE_M * (1 - leadProgressAt(raceTime)) - NOSE_AHEAD_M;
  return {
    exitAt: firstTime((t) => leadProgressAt(t) >= segmentEnds().corner34Exit, end),
    cutAt: firstTime((t) => toGo(t) <= FINISH_TIMELINE.cutAtM, end),
    freezeAt: firstTime((t) => toGo(t) <= 0, end),
    leadProgressAt,
  };
}

export function finishCourseForRace(horses: readonly { samples: number[]; finishTime: number }[]): FinishCourse {
  const end = Math.max(...horses.map((horse) => horse.finishTime));
  return finishCourseFrom((t) => Math.max(...horses.map((horse) => progressAt(horse.samples, t))), end);
}

function slowScaleAt(toGo: number) {
  const { slowFromM, slowOverM, slowScale } = FINISH_TIMELINE;
  return 1 - (1 - slowScale) * smoothstep((slowFromM - toGo) / slowOverM);
}

/** Race seconds per wall second. */
export function timeScale(state: FinishState, course: FinishCourse) {
  const { phase } = state;
  switch (phase.kind) {
    case "freeze":
      return 0;
    case "rise": {
      const { slowScale, resumeSec } = FINISH_TIMELINE;
      return slowScale + (1 - slowScale) * smoothstep(phase.age / resumeSec);
    }
    case "result":
      return 1;
    default:
      return slowScaleAt(toGoAt(course, state.raceTime));
  }
}

function racePhase(previous: FinishPhase, raceTime: number, course: FinishCourse, wallDt: number): FinishPhase {
  if (raceTime < course.exitAt) return { kind: "before" };
  if (raceTime < course.cutAt) return { kind: "stretch", age: previous.kind === "stretch" ? previous.age + wallDt : 0 };
  return toGoAt(course, raceTime) > FINISH_TIMELINE.slowFromM ? { kind: "track" } : { kind: "slow" };
}

export function advanceFinish(state: FinishState, wallDt: number, course: FinishCourse): FinishState {
  const { phase, raceTime } = state;
  const { freezeSec, riseSec } = FINISH_TIMELINE;
  switch (phase.kind) {
    case "freeze": {
      const age = phase.age + wallDt;
      if (age < freezeSec) return { phase: { kind: "freeze", age }, raceTime };
      return advanceFinish({ phase: { kind: "rise", age: 0 }, raceTime }, age - freezeSec, course);
    }
    case "rise": {
      const next = raceTime + wallDt * timeScale(state, course);
      const age = phase.age + wallDt;
      if (age < riseSec) return { phase: { kind: "rise", age }, raceTime: next };
      return { phase: { kind: "result", age: age - riseSec }, raceTime: next };
    }
    case "result":
      return { phase: { kind: "result", age: phase.age + wallDt }, raceTime: raceTime + wallDt };
    default: {
      const scale = timeScale(state, course);
      const next = raceTime + wallDt * scale;
      if (next < course.freezeAt) return { phase: racePhase(phase, next, course, wallDt), raceTime: next };
      const leftover = wallDt - (course.freezeAt - raceTime) / scale;
      return advanceFinish({ phase: { kind: "freeze", age: 0 }, raceTime: course.freezeAt }, leftover, course);
    }
  }
}

/** The result board slides in this long before the rise ends. */
export function boardDue(state: FinishState) {
  const { phase } = state;
  if (phase.kind === "result") return true;
  return phase.kind === "rise" && phase.age >= FINISH_TIMELINE.riseSec - FINISH_TIMELINE.boardLeadSec;
}

export type CaptionCue = "stretch" | "track" | "slow" | "freeze" | "rise" | "result";

export function captionCue(state: FinishState): CaptionCue | null {
  const { kind } = state.phase;
  if (kind === "before") return null;
  if (kind === "rise" || kind === "result") return boardDue(state) ? "result" : "rise";
  return kind;
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
    case "stretch":
      return `마지막 직선 진입! ${josa(a, "이/가")} 선두, ${josa(b, "이/가")} 바짝 쫓습니다!`;
    case "track":
      return `${josa(a, "과/와")} ${b}, ${c}까지 세 마리의 접전!`;
    case "slow":
      return `결승선이 다가옵니다! ${josa(a, "이/가")} 앞섭니다!`;
    case "freeze":
      return "사진 판정할 것 같습니다!";
    case "rise":
      return `${first}! ${josa(first, "이/가")} 해냈습니다!`;
    case "result":
      return `${first} 1착! ${second} 2착, ${third} 3착!`;
  }
}

type Vec3 = { x: number; y: number; z: number };
type Shot = { cam: Vec3; target: Vec3; mm: number };

/** f01, static, outside and ahead of the turn exit. Engine x is Blender x mirrored. */
const F01: Shot = { cam: { x: -20.14, y: 23.05, z: 4.2 }, target: { x: -40.14, y: 14.25, z: 0.8 }, mm: 34 };

/** Tracking rig on the outer rail line (f02, f02b, f04). Only x moves. */
const RIG = { camY: 22.7, camZ: 1.35, targetY: 8.6, targetZ: 1.05, mm: 45 } as const;

/**
 * SHOTS distances on the run-in are to the Blender horse origin (body center): f02 and f02b put the
 * camera 1.03 m behind it. Here that is the ground anchor. By the freeze the camera sits on the
 * line, where the nose is.
 */
const RIG_BEHIND_ANCHOR_M = 1.03;
const RIG_SETTLE_M = 10;

/**
 * Rise keyframes relative to the winner's ground anchor, from SHOTS f04to05 (winner origin
 * finish + 3.5 m) and f05 (finish + 6.0 m), lane 2 (y 8.6).
 */
const RISE_F04TO05: Shot = { cam: { x: -2.1, y: 9.05, z: 3.58 }, target: { x: 0.75, y: 0, z: 0.97 }, mm: 40 };
const RISE_F05: Shot = { cam: { x: -4.2, y: 4.0, z: 3.4 }, target: { x: 1.5, y: 0, z: 0.9 }, mm: 36 };

function lookCamera({ cam, target, mm }: Shot): Camera {
  const dx = target.x - cam.x;
  const dy = target.y - cam.y;
  const focalLength = (mm / SENSOR_MM) * REFERENCE.width;
  // Blender keeps the target at the frame center; the engine's optical center sits higher.
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

function rigShot(course: FinishCourse, raceTime: number): Shot {
  const anchorX = FINISH_X_M - COURSE_M * (1 - course.leadProgressAt(raceTime));
  const settle = 1 - smoothstep(toGoAt(course, raceTime) / RIG_SETTLE_M);
  const x = anchorX - RIG_BEHIND_ANCHOR_M + (RIG_BEHIND_ANCHOR_M + NOSE_AHEAD_M) * settle;
  return { cam: { x, y: RIG.camY, z: RIG.camZ }, target: { x, y: RIG.targetY, z: RIG.targetZ }, mm: RIG.mm };
}

function relativeTo(shot: Shot, anchor: { x: number; y: number }): Shot {
  const move = (point: Vec3) => ({ x: point.x + anchor.x, y: point.y + anchor.y, z: point.z });
  return { cam: move(shot.cam), target: move(shot.target), mm: shot.mm };
}

function hermite(p0: number, p1: number, m0: number, m1: number, s: number) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

/** Catmull-Rom through three keys, the middle one at u = 0.5. */
function spline3(p0: number, p1: number, p2: number, u: number) {
  const mid = (p2 - p0) / 2;
  if (u <= 0.5) return hermite(p0, p1, p1 - p0, mid, u * 2);
  return hermite(p1, p2, mid, p2 - p1, u * 2 - 1);
}

function splineShot(a: Shot, b: Shot, c: Shot, u: number): Shot {
  const vec = (p: Vec3, q: Vec3, r: Vec3) => ({ x: spline3(p.x, q.x, r.x, u), y: spline3(p.y, q.y, r.y, u), z: spline3(p.z, q.z, r.z, u) });
  return { cam: vec(a.cam, b.cam, c.cam), target: vec(a.target, b.target, c.target), mm: spline3(a.mm, b.mm, c.mm, u) };
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
  course: FinishCourse;
  /** Winner's ground anchor now, engine px. */
  winner: { x: number; y: number };
  /** Race camera when the stretch began. */
  enteredFrom: Camera;
};

/** Where the rise is at `age`, 0 = the frozen rig camera, 1 = the f05 offsets. */
function riseShotAt(age: number, course: FinishCourse, winnerM: { x: number; y: number }): Shot {
  const u = smoothstep(age / FINISH_TIMELINE.riseSec);
  return splineShot(rigShot(course, course.freezeAt), relativeTo(RISE_F04TO05, winnerM), relativeTo(RISE_F05, winnerM), u);
}

export function finishCamera(state: FinishState, frame: FinishFrame): Camera | null {
  const { phase } = state;
  const winnerM = { x: frame.winner.x / ENGINE_PX_PER_M, y: frame.winner.y / ENGINE_PX_PER_M };
  switch (phase.kind) {
    case "before":
      return null;
    case "stretch":
      return blendCamera(frame.enteredFrom, lookCamera(F01), smoothstep(phase.age / FINISH_TIMELINE.enterBlendSec));
    case "track":
    case "slow":
    case "freeze":
      return lookCamera(rigShot(frame.course, state.raceTime));
    case "rise":
      return lookCamera(riseShotAt(phase.age, frame.course, winnerM));
    case "result":
      return lookCamera(relativeTo(RISE_F05, winnerM));
  }
}

/** Photo-finish line and label, freeze only. */
export function showsPhotoFinish(state: FinishState) {
  return state.phase.kind === "freeze";
}

function arrivalSpeed(samples: number[], finishTime: number) {
  const window = Math.min(0.3, finishTime);
  return ((1 - progressAt(samples, finishTime - window)) * COURSE_M) / window;
}

/**
 * Progress a horse is drawn at. Up to the line it is the simulation. Past it the horse gallops
 * out from its arrival speed, so gaps stay arrival speed × finish-time difference instead of the
 * sim's 7 m brake piling the field onto the winner.
 */
export function shownProgressAt(samples: number[], finishTime: number, raceTime: number) {
  if (finishTime <= 0 || raceTime <= finishTime) return progressAt(samples, raceTime);
  const speed = arrivalSpeed(samples, finishTime);
  const run = Math.min(raceTime - finishTime, speed / GALLOP_OUT_DECEL);
  return 1 + (speed * run - (GALLOP_OUT_DECEL * run * run) / 2) / COURSE_M;
}
