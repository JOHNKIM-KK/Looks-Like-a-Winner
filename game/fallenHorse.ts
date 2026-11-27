import type { Dismount, HorseFate } from "@/lib/incidents";
import { INCIDENT_TUNING } from "@/lib/incidents";

export type Heading = { x: number; y: number; tx: number; ty: number };

/** Where and how the riderless horse is drawn at a race time. Null once it is gone. */
export type BodyPlacement = {
  at: Heading;
  pose: "down" | "walk" | "graze" | "lifted";
  /** 0 on the ground, 1 fully raised by the titan. */
  lift: number;
  alpha: number;
};

export const EAT_LIFT_S = 0.8;

function smoothstep(value: number) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

export function bodyAt(
  fate: HorseFate,
  dismount: Dismount,
  time: number,
  logical: (progress: number, lane: number) => Heading,
): BodyPlacement | null {
  if (time < dismount.time) return null;
  if (fate.kind === "down") return { at: logical(fate.at.progress, fate.at.lane), pose: "down", lift: 0, alpha: 1 };
  if (fate.kind === "eaten") {
    const lift = Math.min(1, (time - fate.grabAt) / EAT_LIFT_S);
    if (lift >= 1) return null;
    return { at: logical(fate.at.progress, fate.at.lane), pose: "lifted", lift, alpha: 1 - lift };
  }
  const from = logical(fate.from.progress, fate.from.lane);
  const dx = fate.spot.x - from.x;
  const dy = fate.spot.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const k = smoothstep((time - dismount.time) / Math.max(1e-6, fate.walkUntil - dismount.time));
  const at = { x: from.x + dx * k, y: from.y + dy * k, tx: dx / length, ty: dy / length };
  return { at, pose: k >= 1 ? "graze" : "walk", lift: 0, alpha: 1 };
}

/** Seconds from the dismount before the jockey is on his feet and the stamp can change. */
export const FOOT_START_S = INCIDENT_TUNING.fallS + INCIDENT_TUNING.getUpS;

/** Stamp word over a dismounted jockey. Empty when none applies. */
export function stampWord(dismount: Dismount, since: number) {
  if (since < 0) return "";
  if (since < FOOT_START_S + 0.4) return "낙마";
  const moving = since - FOOT_START_S;
  if (dismount.mode === "super" && moving < 3) return "초인";
  if (dismount.mode === "bike" && moving < 4) return "오토바이";
  return "";
}

/** Logical px outside the track the titan starts from. */
export const TITAN_START_PX = 1100;
export const TITAN_HOLD_S = 0.6;
export const TITAN_LEAVE_S = 1.2;

/**
 * Titan ground position: runs in from outside the rail so it meets the horse at `grabAt`,
 * holds while it lifts the horse, then walks back out. Null when it is not on screen.
 */
export function titanAt(enterAt: number, grabAt: number, time: number, target: Heading): { at: Heading; moving: boolean } | null {
  const nx = -target.ty;
  const ny = target.tx;
  const place = (out: number) => ({ x: target.x + nx * out, y: target.y + ny * out, tx: -nx, ty: -ny });
  if (time < enterAt) return null;
  if (time < grabAt) {
    const p = (time - enterAt) / Math.max(1e-6, grabAt - enterAt);
    return { at: place(TITAN_START_PX * (1 - p)), moving: true };
  }
  const since = time - grabAt;
  if (since < TITAN_HOLD_S) return { at: place(0), moving: false };
  const leave = (since - TITAN_HOLD_S) / TITAN_LEAVE_S;
  if (leave >= 1) return null;
  return { at: place(TITAN_START_PX * leave * leave), moving: true };
}

export type HitStop = { time: number; shake: boolean };

/** Moments that slow the presentation clock: each collision (with a shake) and the titan grab. */
export function hitStops(horses: readonly { dismount: Dismount | null }[]): HitStop[] {
  const stops: HitStop[] = [];
  for (const horse of horses) {
    const dismount = horse.dismount;
    if (dismount?.cause === "collision") stops.push({ time: dismount.time, shake: true });
    if (dismount?.cause === "titan") stops.push({ time: dismount.time, shake: false });
  }
  return stops.sort((a, b) => a.time - b.time);
}
