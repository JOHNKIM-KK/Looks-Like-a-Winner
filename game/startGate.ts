import { LOGICAL_PER_METER } from "./artScale";
import { CHUTE, STRAIGHT, laneRadius, type Camera } from "./track";

/** Twelve stalls, one per lane. Pitch matches the lane spacing. */
export const STALL_COUNT = 12;
export const STALL_PITCH_M = 1.2;

/**
 * Hold time of each door frame, in ms. The sum is the 250 ms open.
 * Frame 0 is the closed pose; its hold is 0, so the bell leaves it at once
 * and the five opening frames run for the remaining 250 ms.
 */
export const DOOR_FRAME_MS = [0, 40, 40, 45, 45, 80] as const;
export const DOOR_OPEN_MS = 250;
export const GATE_SIGN = "RACE PARK";

export type GateAngleName = "front" | "start" | "oblique30" | "oblique60" | "drone";

export type GateAngle = {
  name: GateAngleName;
  /** Authored pixels per meter at this camera. */
  pxPerM: number;
  /** Unit vector from the gate toward the camera. +Z is up. */
  viewDir: readonly [number, number, number];
  stallStep: readonly [number, number];
  /** Front-ground contact of stall 2, in frame pixels (origin top-left, y down). */
  ground: readonly [number, number];
  plateCenter: readonly [number, number];
};

export const GATE_ANGLES: readonly GateAngle[] = [
  {
    name: "front",
    pxPerM: 60,
    viewDir: [-0.9903, 0, 0.1392],
    stallStep: [72, 0],
    ground: [153.5, 286.9],
    plateCenter: [153.5, 93.4],
  },
  {
    name: "start",
    pxPerM: 80,
    viewDir: [0, -0.537, 0.8436],
    stallStep: [0, 80.8],
    ground: [63.8, 354.5],
    plateCenter: [54.2, 214.2],
  },
  {
    name: "oblique30",
    pxPerM: 60,
    viewDir: [-0.8325, -0.4806, 0.2756],
    stallStep: [62.3, 9.9],
    ground: [152.5, 296.1],
    plateCenter: [148.9, 109.1],
  },
  {
    name: "oblique60",
    pxPerM: 60,
    viewDir: [-0.424, -0.7344, 0.5299],
    stallStep: [36, 33],
    ground: [113.9, 304.8],
    plateCenter: [107.7, 140.2],
  },
  {
    name: "drone",
    pxPerM: 40,
    viewDir: [-0.3428, -0.7747, 0.5313],
    stallStep: [19.4, 23.3],
    ground: [68.1, 205.2],
    plateCenter: [63.7, 95.3],
  },
];

/** Chute start, the same x the field stands on at progress 0. */
export function chuteStartX() {
  return -STRAIGHT / 2 - CHUTE;
}

/** Front-ground contact of stall `lane` (1–12), on the lane center. */
export function stallFront(lane: number) {
  const index = Math.min(STALL_COUNT, Math.max(1, Math.floor(lane)));
  return { x: chuteStartX(), y: laneRadius(index) };
}

/** Meters between neighboring stall fronts. Lane 1 is the inside lane. */
export function stallPitchM(lane = 1) {
  const a = stallFront(lane);
  const b = stallFront(lane + 1);
  return Math.hypot(b.x - a.x, b.y - a.y) / LOGICAL_PER_METER;
}

export function doorFrameAt(elapsedMs: number) {
  if (elapsedMs <= 0) return 0;
  let cursor = 0;
  for (let frame = 0; frame < DOOR_FRAME_MS.length; frame += 1) {
    cursor += DOOR_FRAME_MS[frame] ?? 0;
    if (elapsedMs < cursor) return frame;
  }
  return DOOR_FRAME_MS.length - 1;
}

export type StartGate = {
  openStall(lane: number, nowMs: number): void;
  openAll(nowMs: number, jitterMs?: number): void;
  reset(): void;
  frameFor(lane: number, nowMs: number): number;
};

export function createStartGate(): StartGate {
  const openedAt: Array<number | null> = Array.from({ length: STALL_COUNT }, () => null);

  function openStall(lane: number, nowMs: number) {
    const index = lane - 1;
    if (index < 0 || index >= STALL_COUNT) return;
    if (openedAt[index] != null) return;
    openedAt[index] = nowMs;
  }

  return {
    openStall,
    openAll(nowMs: number, jitterMs = 40) {
      const span = Math.max(0, jitterMs);
      for (let lane = 1; lane <= STALL_COUNT; lane += 1) {
        const delay = span === 0 ? 0 : ((lane - 1) * span) / (STALL_COUNT - 1);
        openStall(lane, nowMs + delay);
      }
    },
    reset() {
      openedAt.fill(null);
    },
    frameFor(lane: number, nowMs: number) {
      const start = openedAt[lane - 1];
      if (start == null || nowMs < start) return 0;
      return doorFrameAt(nowMs - start);
    },
  };
}

/** Unit offset from a stall toward the camera. +Z is up. */
export function cameraStandOffset(camera: Camera, at: { x: number; y: number }): [number, number, number] {
  const dx = camera.groundX - at.x;
  const dy = camera.groundY - at.y;
  const dz = camera.height;
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
}

/** Sheet whose stall axis best matches the on-screen lane step, either direction. */
export function pickGateSheet(screenStep: readonly [number, number]) {
  const screen = Math.atan2(screenStep[1], screenStep[0]);
  let best = GATE_ANGLES[0] as GateAngle;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const angle of GATE_ANGLES) {
    const authored = Math.atan2(angle.stallStep[1], angle.stallStep[0]);
    const delta = Math.atan2(Math.sin(screen - authored), Math.cos(screen - authored));
    const reverse = Math.atan2(Math.sin(screen - authored + Math.PI), Math.cos(screen - authored + Math.PI));
    const score = Math.min(Math.abs(delta), Math.abs(reverse));
    if (score < bestDelta) {
      best = angle;
      bestDelta = score;
    }
  }
  return best;
}

export function pickGateAngle(offset: readonly [number, number, number]) {
  let best = GATE_ANGLES[0] as GateAngle;
  let bestDot = Number.NEGATIVE_INFINITY;
  for (const angle of GATE_ANGLES) {
    const dot = offset[0] * angle.viewDir[0] + offset[1] * angle.viewDir[1] + offset[2] * angle.viewDir[2];
    if (dot > bestDot) {
      best = angle;
      bestDot = dot;
    }
  }
  return best;
}

/**
 * Express an image-pixel offset (y down) in the screen basis
 * (one authored stall step → `screenStep`, one authored meter of up → `screenUp`).
 * Returns null when the two image axes are parallel.
 */
export function mapImageOffset(
  offset: readonly [number, number],
  stallStep: readonly [number, number],
  pxPerM: number,
  screenStep: readonly [number, number],
  screenUp: readonly [number, number],
): [number, number] | null {
  const axisA: [number, number] = [stallStep[0], stallStep[1]];
  const axisB: [number, number] = [0, -pxPerM];
  const det = axisA[0] * axisB[1] - axisA[1] * axisB[0];
  if (Math.abs(det) < 1e-3) return null;
  const alpha = (offset[0] * axisB[1] - offset[1] * axisB[0]) / det;
  const beta = (axisA[0] * offset[1] - axisA[1] * offset[0]) / det;
  return [alpha * screenStep[0] + beta * screenUp[0], alpha * screenStep[1] + beta * screenUp[1]];
}
