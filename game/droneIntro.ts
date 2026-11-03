import { cameraFromLook, type CameraLook } from "./cameraState";
import { GATE_CENTER_Y, GATE_VIEWS, GATE_X } from "./gateViews";
import { ENGINE_PX_PER_M, type Camera } from "./track";

const M = ENGINE_PX_PER_M;

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

export const INTRO_SHOTS: readonly IntroShot[] = [
  shot("01", [0, 0.7], DRONE_01, DRONE_01.distance, "오늘의 무대, RACE PARK! 12마리가 출전합니다."),
  shot("02", [2.2, 2.5], DRONE_02, DRONE_02.distance, "출발 게이트로 갑니다. 1번부터 12번까지 입장 완료."),
  // The fitted look target sits 45 m out on the ground; pivoting there swings the path wide of the gate.
  shot("03", [3.8, 4.5], GATE_VIEWS.drone.look, 17.35 * M, "각 말 게이트 진입 완료… 긴장감이 흐릅니다!"),
];

export const INTRO_SKIP_TO = 4.5;
export const INTRO_END = 5.0;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function smoothstep(value: number) {
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

export function blendCamera(from: Camera, to: Camera, t: number): Camera {
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

/** The stands strip stands opposite the camera; from the low 02/03 cameras it walls off the storyboard's sky. */
export function introShowsStands(t: number) {
  const hideFrom = (INTRO_SHOTS[0]!.hold[1] + INTRO_SHOTS[1]!.hold[0]) / 2;
  return t < hideFrom || t >= INTRO_SKIP_TO;
}

export function introLine(t: number) {
  let line = INTRO_SHOTS[0]!.line;
  for (const shot of INTRO_SHOTS) {
    if (t >= shot.hold[0]) line = shot.line;
  }
  return line;
}
