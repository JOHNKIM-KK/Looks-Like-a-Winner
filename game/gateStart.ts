import { blendCamera, smoothstep } from "./droneIntro";
import { DOOR_STATES, GATE_VIEWS, GATE_X, type DoorState, type GateView } from "./gateViews";
import { ENGINE_PX_PER_M, laneRadius, referenceDistance, type Camera } from "./track";

const COUNT_STEP = 0.8;
/** Off since 2026-11-03 feedback: one camera angle from the drone landing through the break. On counts on top/ and cuts to start/. */
export const TOP_COUNTDOWN_CUT = false;
const COUNTDOWN_VIEW: GateView = TOP_COUNTDOWN_CUT ? "top" : "start";
const CUT_SEC = TOP_COUNTDOWN_CUT ? 0.4 : 0;

/** Seconds on the clock that starts when the drone intro ends. */
const BEATS = {
  cut: COUNT_STEP * 3,
  bell: COUNT_STEP * 3 + CUT_SEC,
  doorFrame: 0.06,
  handoff: COUNT_STEP * 3 + CUT_SEC + 1.0,
  settled: COUNT_STEP * 3 + CUT_SEC + 1.0 + 1.0,
};

export const BELL_AT = BEATS.bell;
const EXIT_EASE_M = 3;
const CLEAR_OF_STALL_M = 0.3;

function cut(t: number) {
  if (!TOP_COUNTDOWN_CUT) return 1;
  return smoothstep((t - BEATS.cut) / (BEATS.bell - BEATS.cut));
}

function handoff(t: number) {
  return smoothstep((t - BEATS.handoff) / (BEATS.settled - BEATS.handoff));
}

export function countdownLabel(t: number) {
  if (t >= BEATS.cut) return null;
  return ["3", "2", "1"][Math.floor(Math.max(0, t) / COUNT_STEP)] ?? null;
}

export function doorState(t: number): DoorState {
  if (t < BEATS.bell) return "closed";
  const frame = 1 + Math.floor((t - BEATS.bell) / BEATS.doorFrame);
  return DOOR_STATES[Math.min(DOOR_STATES.length - 1, frame)]!;
}

export function gateCamera(t: number, race: Camera): Camera {
  const { start } = GATE_VIEWS;
  if (t < BEATS.cut) return GATE_VIEWS[COUNTDOWN_VIEW].camera;
  if (t < BEATS.bell) return blendCamera(GATE_VIEWS[COUNTDOWN_VIEW].camera, start.camera, cut(t));
  if (t < BEATS.handoff) return start.camera;
  if (t < BEATS.settled) return blendCamera(start.camera, race, handoff(t));
  return race;
}

/** How much each view's camera owns the shot; `intro` is introGateSwap, 0 on the drone flight and 1 once it lands. */
function viewWeights(t: number, intro: number): Record<GateView, number> {
  const toStart = cut(t);
  const weights: Record<GateView, number> = { drone: 1 - intro, top: 0, start: intro * toStart };
  weights[COUNTDOWN_VIEW] += intro * (1 - toStart);
  return weights;
}

export function gatePlateAlpha(t: number, intro: number): Record<GateView, number> {
  const weights = viewWeights(t, intro);
  return { ...weights, start: weights.start * (1 - handoff(t)) };
}

/** World ground point a horse stands on in its stall, matching the horseFoot of whichever view owns the shot. */
export function stallFoot(lane: number, t: number, intro: number) {
  const weights = viewWeights(t, intro);
  let x = 0;
  let y = 0;
  for (const view of Object.keys(weights) as GateView[]) {
    const foot = GATE_VIEWS[view].feet.get(lane)!;
    x += foot.x * weights[view];
    y += foot.y * weights[view];
  }
  return { x, y };
}

/** Shift from the race path (progress 0 sits on the door line) to the stall foot, eased out over the first metres. */
export function gateOffset(lane: number, progress: number, t: number, intro: number) {
  const foot = stallFoot(lane, t, intro);
  const run = (Math.max(0, progress) * referenceDistance()) / ENGINE_PX_PER_M;
  const hold = 1 - smoothstep(run / EXIT_EASE_M);
  return { x: (foot.x - GATE_X) * hold, y: (foot.y - laneRadius(lane)) * hold };
}

export function clearOfStall(worldX: number) {
  return worldX > GATE_X + CLEAR_OF_STALL_M * ENGINE_PX_PER_M;
}
