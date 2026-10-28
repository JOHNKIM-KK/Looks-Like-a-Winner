import { LOGICAL_PER_METER } from "./artScale";
import { laneRgb } from "./horseVisual";
import { CHUTE, LANE_GAP, STRAIGHT_BACK, laneRadius } from "./track";

/** The gate is always this many stalls. Every stall is filled before the race. */
export const GATE_STALLS = 12;
/** Bell: every closed door snaps open together. */
export const DOOR_SNAP_SEC = 0.18;
/** Doors sit this far in front of the stall, toward the horses' faces (-X). */
export const DOOR_AHEAD_M = 1.1;

export type GateConfig = {
  stallCount: number;
  /** Logical units between stall centers. One lane by default. */
  stallPitch: number;
};

export type GateRole = "end-left" | "end-right" | "stall" | "door" | "plate";

export type GatePart = {
  role: GateRole;
  /** Stall index, or -1 for an end cap. */
  index: number;
  x: number;
  y: number;
  /** Height above the ground, logical units. Plates sit on the beam. */
  z: number;
};

type Door = {
  /** 0 closed, 1 open. May pass 1 during the snap's recoil. */
  amount: number;
  age: number;
  moving: boolean;
};

export type StartingGate = {
  config: GateConfig;
  doors: Door[];
  openStall: (index: number) => void;
  openAll: () => void;
  tick: (dt: number) => void;
};

export function createGateConfig(stallPitch = LANE_GAP): GateConfig {
  return { stallCount: GATE_STALLS, stallPitch };
}

/** World position of stall 0. The row runs toward -Y, one pitch per lane. */
export function stallOrigin() {
  return { x: STRAIGHT_BACK / 2 + CHUTE, y: -laneRadius(1) };
}

export function gateLayout(config: GateConfig): GatePart[] {
  const count = GATE_STALLS;
  const pitch = config.stallPitch;
  const origin = stallOrigin();
  const ahead = DOOR_AHEAD_M * LOGICAL_PER_METER;
  const plateZ = 2.35 * LOGICAL_PER_METER;
  const parts: GatePart[] = [
    { role: "end-left", index: -1, x: origin.x, y: origin.y + pitch / 2, z: 0 },
  ];
  for (let index = 0; index < count; index += 1) {
    const y = origin.y - index * pitch;
    parts.push({ role: "stall", index, x: origin.x, y, z: 0 });
    parts.push({ role: "door", index, x: origin.x - ahead, y, z: 0 });
    parts.push({ role: "plate", index, x: origin.x, y, z: plateZ });
  }
  parts.push({
    role: "end-right",
    index: -1,
    x: origin.x,
    y: origin.y - (count - 1) * pitch - pitch / 2,
    z: 0,
  });
  return parts;
}

function easeOutBack(t: number) {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

export function createStartingGate(config: GateConfig): StartingGate {
  const count = GATE_STALLS;
  const doors: Door[] = Array.from({ length: count }, () => ({ amount: 0, age: 0, moving: false }));

  function openStall(index: number) {
    const door = doors[index];
    if (!door) return;
    if (door.amount >= 1 && !door.moving) return;
    door.moving = true;
    door.age = 0;
  }

  return {
    config: { ...config, stallCount: count },
    doors,
    openStall,
    openAll() {
      for (let index = 0; index < doors.length; index += 1) openStall(index);
    },
    tick(dt: number) {
      for (const door of doors) {
        if (!door.moving) continue;
        door.age += dt;
        const t = Math.min(1, door.age / DOOR_SNAP_SEC);
        door.amount = t >= 1 ? 1 : easeOutBack(t);
        if (t >= 1) door.moving = false;
      }
    },
  };
}

/**
 * Plate pixels. Mask G marks the lane-color area. R and B stay on the color image
 * until the real gate mask arrives.
 */
export function tintGatePlate(
  color: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  lane: number,
  out: Uint8ClampedArray,
) {
  const [lr, lg, lb] = laneRgb(lane);
  for (let i = 0; i < color.length; i += 4) {
    const r = color[i] ?? 0;
    const g = color[i + 1] ?? 0;
    const b = color[i + 2] ?? 0;
    const a = color[i + 3] ?? 0;
    const maskG = (mask[i + 1] ?? 0) / 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 185;
    out[i] = clampByte(r * (1 - maskG) + lr * lum * maskG);
    out[i + 1] = clampByte(g * (1 - maskG) + lg * lum * maskG);
    out[i + 2] = clampByte(b * (1 - maskG) + lb * lum * maskG);
    out[i + 3] = a;
  }
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
