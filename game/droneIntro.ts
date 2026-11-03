import stalls from "../public/gate/drone/stalls.json";
import { cameraFromLook, type CameraLook } from "./cameraState";
import { PROJECTION_CENTER } from "./stage";
import { CHUTE, ENGINE_PX_PER_M, STRAIGHT, laneRadius, type Camera } from "./track";

const M = ENGINE_PX_PER_M;

export const GATE_X = -STRAIGHT / 2 - CHUTE;
export const GATE_CENTER_Y = (laneRadius(1) + laneRadius(12)) / 2;

type Vec3 = { x: number; y: number; z: number };

export type IntroShot = {
  scene: "01" | "02" | "03";
  hold: readonly [start: number, end: number];
  camera: Camera;
  /** Distance along the view ray to the point the camera path pivots on. */
  aimDistance: number;
  line: string;
};

function shot(scene: IntroShot["scene"], hold: IntroShot["hold"], look: CameraLook, aimDistance: number, line: string): IntroShot {
  return { scene, hold, camera: cameraFromLook(look), aimDistance, line };
}

const DRONE_01: CameraLook = {
  targetX: GATE_X + 39.46 * M,
  targetY: GATE_CENTER_Y - 4.52 * M,
  distance: 79.7 * M,
  azimuth: -2.2,
  elevation: 25.2,
  focalLength: 825,
};

const DRONE_02: CameraLook = {
  targetX: GATE_X - 3.53 * M,
  targetY: GATE_CENTER_Y + 1.53 * M,
  distance: 30.8 * M,
  azimuth: -58.1,
  elevation: 26.7,
  focalLength: 1050,
};

/** Fitted to public/gate/drone/stalls.json: the asset is a render from exactly this camera. */
const GATE_LOOK: CameraLook = {
  targetX: GATE_X + -27.188557222992074 * M,
  targetY: GATE_CENTER_Y + 9.81952915991845 * M,
  distance: 45.050957344330044 * M,
  azimuth: -69.73335954488843,
  elevation: 4.216963349484524,
  focalLength: 1200,
};

export const INTRO_SHOTS: readonly IntroShot[] = [
  shot("01", [0, 0.7], DRONE_01, DRONE_01.distance, "오늘의 무대, RACE PARK! 12마리가 출전합니다."),
  shot("02", [2.2, 2.5], DRONE_02, DRONE_02.distance, "출발 게이트로 갑니다. 1번부터 12번까지 입장 완료."),
  // The fitted look target sits 45 m out on the ground; pivoting there swings the path wide of the gate.
  shot("03", [3.8, 4.5], GATE_LOOK, 17.35 * M, "각 말 게이트 진입 완료… 긴장감이 흐릅니다!"),
];

export const GATE_CAMERA = cameraFromLook(GATE_LOOK);
export const INTRO_SKIP_TO = 4.5;
export const INTRO_END = 5.0;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function viewDir(camera: Camera): Vec3 {
  const cosPitch = Math.cos(camera.pitch);
  return { x: -Math.sin(camera.yaw) * cosPitch, y: Math.cos(camera.yaw) * cosPitch, z: -Math.sin(camera.pitch) };
}

function poseOf({ camera, aimDistance }: IntroShot) {
  const eye = { x: camera.groundX, y: camera.groundY, z: camera.height };
  const dir = viewDir(camera);
  const aim = { x: eye.x + dir.x * aimDistance, y: eye.y + dir.y * aimDistance, z: eye.z + dir.z * aimDistance };
  return { eye, aim, focalLength: camera.focalLength };
}

function cameraAlong(from: IntroShot, to: IntroShot, t: number): Camera {
  const a = poseOf(from);
  const b = poseOf(to);
  const eye = { x: lerp(a.eye.x, b.eye.x, t), y: lerp(a.eye.y, b.eye.y, t), z: lerp(a.eye.z, b.eye.z, t) };
  const dx = lerp(a.aim.x, b.aim.x, t) - eye.x;
  const dy = lerp(a.aim.y, b.aim.y, t) - eye.y;
  const dz = lerp(a.aim.z, b.aim.z, t) - eye.z;
  return {
    groundX: eye.x,
    groundY: eye.y,
    height: eye.z,
    yaw: Math.atan2(-dx, dy),
    pitch: Math.atan2(-dz, Math.hypot(dx, dy)),
    focalLength: lerp(a.focalLength, b.focalLength, t),
  };
}

function blendCamera(from: Camera, to: Camera, t: number): Camera {
  const turn = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
  return {
    groundX: lerp(from.groundX, to.groundX, t),
    groundY: lerp(from.groundY, to.groundY, t),
    height: lerp(from.height, to.height, t),
    pitch: lerp(from.pitch, to.pitch, t),
    yaw: from.yaw + turn * t,
    focalLength: lerp(from.focalLength, to.focalLength, t),
  };
}

export function introCamera(t: number, countdown: Camera): Camera {
  if (t >= INTRO_END) return countdown;
  const last = INTRO_SHOTS[INTRO_SHOTS.length - 1]!;
  if (t >= INTRO_SKIP_TO) return blendCamera(last.camera, countdown, introFade(t));
  for (let index = 0; index < INTRO_SHOTS.length; index += 1) {
    const current = INTRO_SHOTS[index]!;
    if (t <= current.hold[1]) return current.camera;
    const next = INTRO_SHOTS[index + 1];
    if (next && t < next.hold[0]) {
      return cameraAlong(current, next, smoothstep((t - current.hold[1]) / (next.hold[0] - current.hold[1])));
    }
  }
  return last.camera;
}

export function introFade(t: number) {
  return smoothstep((t - INTRO_SKIP_TO) / (INTRO_END - INTRO_SKIP_TO));
}

export function introLine(t: number) {
  let line = INTRO_SHOTS[0]!.line;
  for (const shot of INTRO_SHOTS) {
    if (t >= shot.hold[0]) line = shot.line;
  }
  return line;
}

export type GateLayer = { key: string; file: string; x: number; y: number; w: number; h: number };

/** Draw order per stalls.json zorder, without horses: back, doors, front, sign. */
export const GATE_LAYERS: readonly GateLayer[] = [
  { key: "gate-drone-back", file: "back.png", ...stalls.layers["back.png"] },
  ...stalls.stalls.map(({ lane, doors: { closed } }) => ({
    key: `gate-drone-door-${lane}`,
    file: closed.file,
    x: closed.x,
    y: closed.y,
    w: closed.w,
    h: closed.h,
  })),
  { key: "gate-drone-front", file: "front.png", ...stalls.layers["front.png"] },
  { key: "gate-drone-sign", file: "sign.png", ...stalls.layers["sign.png"] },
];

export const GATE_PLATE_BOX = (() => {
  const x0 = Math.min(...GATE_LAYERS.map((layer) => layer.x));
  const y0 = Math.min(...GATE_LAYERS.map((layer) => layer.y));
  const x1 = Math.max(...GATE_LAYERS.map((layer) => layer.x + layer.w));
  const y1 = Math.max(...GATE_LAYERS.map((layer) => layer.y + layer.h));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
})();

/** Inverse of projectWithCamera under GATE_CAMERA, onto the vertical gate plane x = GATE_X. */
export function gatePlanePoint(sx: number, sy: number): Vec3 {
  const { groundX, groundY, height, yaw, pitch, focalLength } = GATE_CAMERA;
  const a = (PROJECTION_CENTER.x - sx) / focalLength;
  const b = (PROJECTION_CENTER.y - sy) / focalLength;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const forward = cosPitch + b * sinPitch;
  const depth = (GATE_X - groundX) / (a * cosYaw - forward * sinYaw);
  return {
    x: GATE_X,
    y: groundY + depth * (a * sinYaw + forward * cosYaw),
    z: height + depth * (b * cosPitch - sinPitch),
  };
}
