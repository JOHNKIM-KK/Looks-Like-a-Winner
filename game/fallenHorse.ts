import type { Dismount, HorseFate } from "@/lib/incidents";
import { INCIDENT_TUNING } from "@/lib/incidents";

export type Heading = { x: number; y: number; tx: number; ty: number };

/** Where and how the riderless horse is drawn at a race time. Null once it is gone. */
export type BodyPlacement = {
  at: Heading;
  pose: "down" | "walk" | "graze" | "lifted";
  /** Seconds since the jockey left the saddle (since the grab for a lifted horse). */
  since: number;
  /** Logical px walked so far. Drives the walk loop, so the feet follow the ground. */
  travel: number;
  /** Lifted horse only: 0 while the hand closes on it, 1 when the hand is at the mouth. */
  lift: number;
  alpha: number;
};

/** The giant's grab sheet is 10 frames at 10 fps: the hand closes at frame 4, lifts to the mouth by frame 8, and bites. */
export const TITAN_GRAB_S = 1.0;
export const GRAB_CLOSE_S = 0.4;
export const GRAB_BITE_S = 0.8;

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
  const since = time - dismount.time;
  if (fate.kind === "down") return { at: logical(fate.at.progress, fate.at.lane), pose: "down", since, travel: 0, lift: 0, alpha: 1 };
  if (fate.kind === "eaten") {
    const grab = time - fate.grabAt;
    if (grab >= TITAN_GRAB_S) return null;
    const lift = smoothstep((grab - GRAB_CLOSE_S) / (GRAB_BITE_S - GRAB_CLOSE_S));
    const alpha = grab < GRAB_BITE_S ? 1 : 1 - (grab - GRAB_BITE_S) / (TITAN_GRAB_S - GRAB_BITE_S);
    return { at: logical(fate.at.progress, fate.at.lane), pose: "lifted", since: grab, travel: 0, lift, alpha };
  }
  const from = logical(fate.from.progress, fate.from.lane);
  const dx = fate.spot.x - from.x;
  const dy = fate.spot.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const k = smoothstep(since / Math.max(1e-6, fate.walkUntil - dismount.time));
  const at = { x: from.x + dx * k, y: from.y + dy * k, tx: dx / length, ty: dy / length };
  const grazing = since >= fate.walkUntil - dismount.time;
  return { at, pose: grazing ? "graze" : "walk", since: grazing ? since - (fate.walkUntil - dismount.time) : since, travel: length * k, lift: 0, alpha: 1 };
}

/** Seconds from the dismount before the jockey is on his feet and the stamp can change. */
export const FOOT_START_S = INCIDENT_TUNING.fallS + INCIDENT_TUNING.getUpS;

/** The stamp that would sit under the giant while it grabs stays hidden until the giant has left. */
const TITAN_CLEAR_S = TITAN_GRAB_S + 1.2;

/** Stamp word over a dismounted jockey. Empty when none applies. */
export function stampWord(dismount: Dismount, since: number) {
  if (since < 0) return "";
  if (dismount.cause === "titan" && since < TITAN_CLEAR_S) return "";
  if (since < FOOT_START_S + 0.4) return "낙마";
  const moving = since - FOOT_START_S;
  if (dismount.mode === "super" && moving < 3) return "초인";
  if (dismount.mode === "bike" && moving < 4) return "오토바이";
  return "";
}

/** Logical px outside the track the titan starts from. */
export const TITAN_START_PX = 1100;
export const TITAN_LEAVE_S = 1.2;

export type TitanPhase = "run" | "grab" | "leave";

/**
 * Titan ground position: runs in from outside the rail so it meets the horse at `grabAt`,
 * stands through the grab, then walks back out facing away. Null when it is not on screen.
 * `since` counts seconds into the phase.
 */
export function titanAt(enterAt: number, grabAt: number, time: number, target: Heading): { at: Heading; phase: TitanPhase; since: number } | null {
  const nx = -target.ty;
  const ny = target.tx;
  const place = (out: number, face: number) => ({ x: target.x + nx * out, y: target.y + ny * out, tx: nx * face, ty: ny * face });
  if (time < enterAt) return null;
  if (time < grabAt) {
    const p = (time - enterAt) / Math.max(1e-6, grabAt - enterAt);
    return { at: place(TITAN_START_PX * (1 - p), -1), phase: "run", since: time - enterAt };
  }
  const since = time - grabAt;
  if (since < TITAN_GRAB_S) return { at: place(0, -1), phase: "grab", since };
  const leave = (since - TITAN_GRAB_S) / TITAN_LEAVE_S;
  if (leave >= 1) return null;
  return { at: place(TITAN_START_PX * leave * leave, 1), phase: "leave", since: since - TITAN_GRAB_S };
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
