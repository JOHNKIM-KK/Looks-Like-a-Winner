import type { RaceResult } from "@/lib/race";
import { clothOverlayPixels, silksOverlayPixels, type OverlayPaint, type PickedAngle } from "./horseVisual";

/**
 * Sheets that only some races use. The race result is known before the start,
 * so a race loads exactly the sheets its incidents draw and nothing else.
 */
export type EventSheetId = "fall" | "down" | "walk" | "graze" | "ride" | "titanRun" | "titanGrab";

export type SheetSpec = { dir: string; name: string; overlay: OverlayPaint | null };

export const SPECS: Record<EventSheetId, SheetSpec> = {
  fall: { dir: "/horses/events", name: "fall", overlay: clothOverlayPixels },
  down: { dir: "/horses/events", name: "down", overlay: clothOverlayPixels },
  walk: { dir: "/horses/events", name: "walk", overlay: clothOverlayPixels },
  graze: { dir: "/horses/events", name: "graze", overlay: clothOverlayPixels },
  ride: { dir: "/vehicles", name: "ride", overlay: silksOverlayPixels },
  titanRun: { dir: "/titan", name: "run", overlay: null },
  titanGrab: { dir: "/titan", name: "grab", overlay: null },
};

type SetName = "straight" | "corner";
type Point = readonly [number, number];

export type EventAngle = {
  index: number;
  yawDeg: number;
  frameW: number;
  frameH: number;
  anchorX: number;
  anchorY: number;
  /** Feet per frame, sheet pixels. Absent in older sheets. */
  ground: readonly Point[] | null;
  /** Grabbing hand per frame, sheet pixels. Only the titan grab sheet has it. */
  hand: readonly Point[] | null;
  colorFile: string;
  maskFile: string | null;
};

export type EventSheet = {
  id: EventSheetId;
  fps: number;
  frames: number;
  loop: boolean;
  /** Draw scale relative to the horse sprites: the horse sheets are 1, the giant is rendered small and drawn at 4. */
  drawScale: number;
  sets: Record<SetName, EventAngle[]>;
};

export type EventSheets = Partial<Record<EventSheetId, EventSheet>>;

type RawAngle = {
  index: number;
  yaw_deg: number;
  color: string;
  mask?: string;
  frame_w: number;
  frame_h: number;
  anchor: number[];
  ground_px?: number[][];
  hand_px?: number[][];
};
export type RawSheet = {
  px_per_m: number;
  world_px_per_m: number;
  scale_up?: number;
  fps: number;
  frames: number;
  loop: boolean;
  sets: Record<SetName, { angles: RawAngle[] }>;
};

const points = (raw: number[][] | undefined): readonly Point[] | null =>
  raw && raw.length > 0 ? raw.map((point) => [point[0] ?? 0, point[1] ?? 0] as const) : null;

export function parseSheet(id: EventSheetId, raw: RawSheet): EventSheet {
  const readSet = (set: SetName): EventAngle[] =>
    (raw.sets[set]?.angles ?? []).map((angle) => ({
      index: angle.index,
      yawDeg: angle.yaw_deg,
      frameW: angle.frame_w,
      frameH: angle.frame_h,
      anchorX: angle.anchor[0] ?? 0,
      anchorY: angle.anchor[1] ?? 0,
      ground: points(angle.ground_px),
      hand: points(angle.hand_px),
      colorFile: angle.color,
      maskFile: angle.mask ?? null,
    }));
  return {
    id,
    fps: raw.fps,
    frames: raw.frames,
    loop: raw.loop,
    drawScale: raw.scale_up ?? 1,
    sets: { straight: readSet("straight"), corner: readSet("corner") },
  };
}

/** Which sheets this race draws. Empty for a race without incidents. */
export function sheetsNeeded(race: Pick<RaceResult, "horses" | "titan">): EventSheetId[] {
  const ids = new Set<EventSheetId>();
  for (const horse of race.horses) {
    if (horse.fate?.kind === "down") ids.add("fall").add("down");
    if (horse.fate?.kind === "graze") ids.add("walk").add("graze");
    if (horse.dismount?.mode === "bike") ids.add("ride");
  }
  if (race.titan) ids.add("titanRun").add("titanGrab");
  return [...ids];
}

export function eventKey(id: EventSheetId, set: SetName, index: number) {
  return `ev-${id}-${set}-${index}`;
}

/** Lane-tintable overlay: saddle cloth and plate for horses, shirt and helmet for the rider. Null for sheets with no mask. */
export function overlayKey(id: EventSheetId, set: SetName, index: number) {
  return SPECS[id].overlay ? `ev-${id}-lane-${set}-${index}` : null;
}

export function maskKey(id: EventSheetId, set: SetName, index: number) {
  return `ev-${id}-mask-${set}-${index}`;
}

export function jsonKey(id: EventSheetId) {
  return `ev-json-${id}`;
}

/**
 * The sheet angle closest to the horse's picked view. Wide views and angles a sheet lacks
 * (the giant has three straight angles and one corner angle) take the nearest yaw.
 */
export function pickEventAngle(sheet: EventSheet, picked: PickedAngle): { set: SetName; angle: EventAngle } | null {
  const preferred: SetName = picked.set === "corner" && sheet.sets.corner.length > 0 ? "corner" : "straight";
  const set = sheet.sets[preferred].length > 0 ? preferred : preferred === "corner" ? "straight" : "corner";
  const angles = sheet.sets[set];
  let best: EventAngle | undefined;
  for (const angle of angles) {
    if (picked.set === set && angle.index === picked.index) return { set, angle };
    if (!best || Math.abs(angle.yawDeg - picked.yawDeg) < Math.abs(best.yawDeg - picked.yawDeg)) best = angle;
  }
  return best ? { set, angle: best } : null;
}

/** Frame of a clip `since` seconds in, looping or holding the last frame. */
export function clipFrame(sheet: EventSheet, since: number) {
  const tick = Math.floor(Math.max(0, since) * sheet.fps);
  return sheet.loop ? tick % sheet.frames : Math.min(sheet.frames - 1, tick);
}

export function clipSeconds(sheet: EventSheet) {
  return sheet.frames / sheet.fps;
}
