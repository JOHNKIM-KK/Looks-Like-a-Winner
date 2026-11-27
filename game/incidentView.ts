import Phaser from "phaser";
import { INCIDENT_TUNING, type Dismount, type FootMode } from "@/lib/incidents";
import { HORSE_PX_PER_M, LOGICAL_PER_METER } from "./artScale";
import { eventKey, overlayKey, pickEventAngle, clipFrame, clipSeconds, type EventAngle, type EventSheet, type EventSheets } from "./eventSheets";
import { FOOT_SCALE, FOOT_ANGLES, fallFrame, fallHeightM, footKey, pickFootAngle, runFrame, FALL_FRAMES } from "./jockeyFoot";
import type { PickedAngle } from "./horseVisual";
import { multiplyTint } from "./horseVisual";
import { FOOT_START_S, GRAB_CLOSE_S, TITAN_GRAB_S, type BodyPlacement, type TitanPhase } from "./fallenHorse";
import { addRowFrames, paintGallop } from "./spriteFrames";

export type MountLayers = {
  sprite: Phaser.GameObjects.Sprite;
  marks: Phaser.GameObjects.Sprite;
  rider: Phaser.GameObjects.Sprite;
  silks: Phaser.GameObjects.Sprite;
};

const AFTERIMAGES = 3;
const AFTER_ALPHA = [0.4, 0.24, 0.12] as const;
const AFTER_LAG_S = 0.07;
const FLASH_S = 0.16;
/** Jockey runs at this multiple of the run loop rate in super mode. */
const SUPER_ANIM = 1.6;
/** Fall frame the jockey rises back to (kneeling) before he crossfades into the run. */
const GETUP_FRAME = 5;
/** Share of the get-up window spent rising, then crossfading to the run. */
const GETUP_RISE = [0.15, 0.7] as const;
const GETUP_FADE = [0.65, 1] as const;
/** The bike replaces the jockey this long after he stands, behind a puff of smoke. */
const BIKE_SWAP_S = FOOT_START_S + INCIDENT_TUNING.bikeSummonS;
const PUFF_COUNT = 5;
const PUFF_TEXTURE = "fx-puff";
const PUFF_LEAD_S = 0.2;
const PUFF_LIFE_S = 0.8;
/** Walking horse: metres covered per walk cycle. */
const WALK_STRIDE_M = 1.7;


export function preloadFootSheets(scene: Phaser.Scene) {
  for (const action of ["run", "fall"] as const) {
    for (const set of ["straight", "corner"] as const) {
      for (const angle of FOOT_ANGLES[action][set]) scene.load.image(footKey(action, set, angle.index), `/jockey/${angle.colorFile}`);
    }
  }
}

/** Slices the foot sheets into frames. */
export function buildIncidentTextures(scene: Phaser.Scene) {
  for (const action of ["run", "fall"] as const) {
    for (const set of ["straight", "corner"] as const) {
      for (const angle of FOOT_ANGLES[action][set]) {
        addRowFrames(scene.textures.get(footKey(action, set, angle.index)), angle.frames, angle.frameW, angle.frameH);
      }
    }
  }
}

/** One soft white disc, tinted and scaled per puff. */
function buildPuffTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(PUFF_TEXTURE)) return;
  const size = 64;
  const canvas = scene.textures.createCanvas(PUFF_TEXTURE, size, size);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.6, "rgba(235,235,240,0.5)");
  gradient.addColorStop(1, "rgba(235,235,240,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
}

export type IncidentRig = {
  jockey: Phaser.GameObjects.Sprite;
  /** Fall pose fading into the run during the get-up. */
  ghost: Phaser.GameObjects.Sprite;
  afterimages: Phaser.GameObjects.Sprite[];
  ride: { base: Phaser.GameObjects.Sprite; lane: Phaser.GameObjects.Sprite };
  /** Summon smoke, pooled. Empty unless this actor summons a bike. */
  puffs: Phaser.GameObjects.Sprite[];
  /** Objects the actor container adds, back to front. */
  display: Phaser.GameObjects.Sprite[];
  /** The riderless horse. Drawn in its own container so it can stand apart from the jockey. */
  body: { container: Phaser.GameObjects.Container; layers: MountLayers };
  bodyPicked?: PickedAngle;
  runAnim: number;
};

/** One jockey, his ghost and afterimages, a ride, and one riderless-horse body per actor, all hidden until needed. */
export function createRig(scene: Phaser.Scene, baseKey: string, summonsBike: boolean): IncidentRig {
  const hidden = (key = baseKey) => scene.add.sprite(0, 0, key).setVisible(false);
  const afterimages = Array.from({ length: AFTERIMAGES }, () => hidden());
  const ghost = hidden();
  const ride = { base: hidden(), lane: hidden() };
  const jockey = hidden();
  if (summonsBike) buildPuffTexture(scene);
  const puffs = summonsBike ? Array.from({ length: PUFF_COUNT }, () => hidden(PUFF_TEXTURE)) : [];
  const layers: MountLayers = { sprite: hidden(), marks: hidden(), rider: hidden(), silks: hidden() };
  const container = scene.add.container(0, 0, [layers.sprite, layers.marks, layers.rider, layers.silks]).setVisible(false);
  return {
    jockey,
    ghost,
    afterimages,
    ride,
    puffs,
    display: [...afterimages, ride.base, ride.lane, jockey, ghost, ...puffs],
    body: { container, layers },
    runAnim: 0,
  };
}

export function hideRig(rig: IncidentRig) {
  for (const sprite of rig.display) sprite.setVisible(false);
  rig.body.container.setVisible(false);
}

export function footAnimRate(mode: FootMode) {
  return mode === "super" ? SUPER_ANIM : 1;
}

export type JockeyInput = {
  dismount: Dismount;
  since: number;
  number: number;
  picked: PickedAngle;
  /** Horse sprite scale at this depth. */
  drawn: number;
  laneColor: number;
  shade: number;
  /** Screen offsets from the container for trailing afterimages, newest first. Empty when none. */
  trail: readonly { x: number; y: number }[];
  /** The ride sheet, once it has loaded. */
  ride: EventSheet | undefined;
};

type Placed = { topPx: number };

function smoothstep(value: number) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

function placeFoot(
  sprite: Phaser.GameObjects.Sprite,
  input: JockeyInput,
  action: "run" | "fall",
  frame: number,
  scale: number,
) {
  const foot = pickFootAngle(input.picked);
  const angle = FOOT_ANGLES[action][foot.set].find((candidate) => candidate.index === foot.index);
  if (!angle) return null;
  const key = footKey(action, foot.set, foot.index);
  const texture = sprite.scene.textures.get(key);
  if (!texture || texture.key === "__MISSING") return null;
  const at = Math.min(frame, angle.frames - 1);
  const ground = angle.ground[at] ?? [angle.frameW / 2, angle.frameH];
  paintGallop(sprite, key, at, ground[0], ground[1], angle.frameW, angle.frameH, scale, input.picked.flip);
  return { angle, at, height: angle.frameH * scale };
}

/** True once the ride sheet is there and the bike has replaced the jockey. */
function riding(input: JockeyInput) {
  return input.dismount.mode === "bike" && input.ride != null && input.since >= BIKE_SWAP_S;
}

/**
 * Draws the jockey on foot: the fall sheet, a get-up that rises from the fall and crossfades into the run, then the run loop.
 * A bike rider swaps to the ride sheet behind a puff. Feet sit on the container origin.
 */
export function paintJockey(rig: IncidentRig, input: JockeyInput, runAnim: number): Placed | null {
  const { dismount, since } = input;
  const scale = input.drawn * FOOT_SCALE;
  const metrePx = HORSE_PX_PER_M * input.drawn;
  const tint = multiplyTint(input.laneColor, input.shade);
  const apply = (sprite: Phaser.GameObjects.Sprite, white: boolean) =>
    white ? sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL) : sprite.setTint(tint).setTintMode(Phaser.TintModes.MULTIPLY);
  rig.ghost.setVisible(false);
  paintPuffs(rig, input, metrePx);

  if (riding(input) && input.ride) {
    rig.jockey.setVisible(false);
    for (const sprite of rig.afterimages) sprite.setVisible(false);
    return paintRide(rig, input, input.ride);
  }
  rig.ride.base.setVisible(false);
  rig.ride.lane.setVisible(false);

  const fallS = INCIDENT_TUNING.fallS;
  const falling = since < fallS;
  const gettingUp = !falling && since < FOOT_START_S;
  const progress = gettingUp ? (since - fallS) / INCIDENT_TUNING.getUpS : 0;
  const lastFall = FALL_FRAMES - 1;
  const rise = smoothstep((progress - GETUP_RISE[0]) / (GETUP_RISE[1] - GETUP_RISE[0]));
  const fallPose = falling ? fallFrame(since) : Math.round(lastFall - rise * (lastFall - GETUP_FRAME));
  // A bike jockey stands still while the bike is summoned, so the run loop holds its first frame.
  const waiting = dismount.mode === "bike" && since >= FOOT_START_S;
  const runPose = runFrame(waiting ? 0 : runAnim, input.number);
  const action = falling || gettingUp ? "fall" : "run";
  const placed = placeFoot(rig.jockey, input, action, action === "fall" ? fallPose : runPose, scale);
  if (!placed) {
    rig.jockey.setVisible(false);
    return null;
  }
  let raiseM = 0;
  if (falling) {
    const landed = placed.angle.hipsHeightM[FALL_FRAMES - 1] ?? 1;
    raiseM = fallHeightM(since, landed) - landed;
  }
  rig.jockey.setPosition(0, -raiseM * metrePx).setVisible(true);

  const flash = dismount.mode === "super" && since - FOOT_START_S >= 0 && since - FOOT_START_S < FLASH_S;
  apply(rig.jockey, flash);
  rig.jockey.setAlpha(1).setScale(rig.jockey.scaleX * (flash ? 1.12 : 1), rig.jockey.scaleY * (flash ? 1.12 : 1));

  if (gettingUp) {
    const blend = smoothstep((progress - GETUP_FADE[0]) / (GETUP_FADE[1] - GETUP_FADE[0]));
    const standing = placeFoot(rig.ghost, input, "run", runPose, scale);
    if (standing && blend > 0) {
      // The kneeling fall frame fades out under the standing run frame.
      apply(rig.ghost, false);
      rig.ghost.setPosition(0, 0).setAlpha(blend).setVisible(true);
    }
  }

  const showTrail = dismount.mode === "super" && !falling && !gettingUp;
  rig.afterimages.forEach((sprite, index) => {
    const offset = input.trail[index];
    if (!showTrail || !offset) {
      sprite.setVisible(false);
      return;
    }
    const after = placeFoot(sprite, input, "run", runPose, scale);
    if (!after) {
      sprite.setVisible(false);
      return;
    }
    apply(sprite, false);
    sprite.setPosition(offset.x, offset.y).setAlpha(AFTER_ALPHA[index] ?? 0.1).setVisible(true);
  });
  return { topPx: placed.height + raiseM * metrePx };
}

/** Motorcycle and rider as one sprite, lane color on the rider's shirt and helmet through the overlay. */
function paintRide(rig: IncidentRig, input: JockeyInput, sheet: EventSheet): Placed | null {
  const found = pickEventAngle(sheet, input.picked);
  if (!found) return null;
  const { set, angle } = found;
  const frame = clipFrame(sheet, input.since - BIKE_SWAP_S);
  const scale = input.drawn * sheet.drawScale;
  const fadeIn = Math.min(1, (input.since - BIKE_SWAP_S) / 0.12 + 0.35);
  paintGallop(rig.ride.base, eventKey(sheet.id, set, angle.index), frame, angle.anchorX, angle.anchorY, angle.frameW, angle.frameH, scale, input.picked.flip);
  rig.ride.base.setPosition(0, 0).setAlpha(fadeIn).setTint(multiplyTint(0xffffff, input.shade)).setTintMode(Phaser.TintModes.MULTIPLY).setVisible(true);
  const lane = overlayKey(sheet.id, set, angle.index);
  if (lane && rig.ride.lane.scene.textures.exists(lane)) {
    paintGallop(rig.ride.lane, lane, frame, angle.anchorX, angle.anchorY, angle.frameW, angle.frameH, scale, input.picked.flip);
    rig.ride.lane
      .setPosition(0, 0)
      .setAlpha(fadeIn)
      .setTint(multiplyTint(input.laneColor, input.shade))
      .setTintMode(Phaser.TintModes.MULTIPLY)
      .setVisible(true);
  } else {
    rig.ride.lane.setVisible(false);
  }
  return { topPx: angle.anchorY * scale };
}

/** Smoke around the spot where the bike appears. Pooled sprites, scaled and faded from the clock. */
function paintPuffs(rig: IncidentRig, input: JockeyInput, metrePx: number) {
  const age = input.since - (BIKE_SWAP_S - PUFF_LEAD_S);
  rig.puffs.forEach((puff, index) => {
    if (age < 0 || age > PUFF_LIFE_S) {
      puff.setVisible(false);
      return;
    }
    const life = age / PUFF_LIFE_S;
    const around = (index / PUFF_COUNT) * Math.PI * 2 + 0.7;
    const spread = (0.4 + 0.7 * life) * metrePx;
    puff
      .setPosition(Math.cos(around) * spread * 1.3, -0.6 * metrePx - Math.sin(around) * spread * 0.5 - life * 0.5 * metrePx)
      .setScale(((0.9 + life * 1.8) * metrePx) / 64)
      .setAlpha((1 - life) * Math.min(1, age / PUFF_LEAD_S) * 0.85)
      .setTint(multiplyTint(0xffffff, input.shade))
      .setTintMode(Phaser.TintModes.MULTIPLY)
      .setVisible(true);
  });
}

/** How far behind the jockey each afterimage trails, seconds. */
export function trailTimes(now: number) {
  return Array.from({ length: AFTERIMAGES }, (_, index) => now - (index + 1) * AFTER_LAG_S);
}

/**
 * Paints the riderless horse's clip: the fall into the down loop, the walk along the ground, or the graze loop.
 * Returns false while the sheet is not ready.
 */
export function paintBodyClip(layers: MountLayers, sheets: EventSheets, placement: BodyPlacement, picked: PickedAngle, drawn: number): boolean {
  let sheet: EventSheet | undefined;
  let frame = 0;
  if (placement.pose === "down") {
    const fall = sheets.fall;
    if (fall && placement.since < clipSeconds(fall)) {
      sheet = fall;
      frame = clipFrame(fall, placement.since);
    } else {
      sheet = sheets.down;
      frame = sheet && fall ? clipFrame(sheet, placement.since - clipSeconds(fall)) : 0;
    }
  } else if (placement.pose === "walk") {
    sheet = sheets.walk;
    if (sheet) {
      const cycles = placement.travel / LOGICAL_PER_METER / WALK_STRIDE_M;
      frame = Math.floor((cycles % 1) * sheet.frames);
    }
  } else if (placement.pose === "graze") {
    sheet = sheets.graze;
    frame = sheet ? clipFrame(sheet, placement.since) : 0;
  }
  if (!sheet) return false;
  const found = pickEventAngle(sheet, picked);
  if (!found) return false;
  const { set, angle } = found;
  const scale = drawn * sheet.drawScale;
  paintGallop(layers.sprite, eventKey(sheet.id, set, angle.index), frame, angle.anchorX, angle.anchorY, angle.frameW, angle.frameH, scale, picked.flip);
  layers.sprite.setPosition(0, 0).setVisible(true);
  const lane = overlayKey(sheet.id, set, angle.index);
  if (lane && layers.marks.scene.textures.exists(lane)) {
    paintGallop(layers.marks, lane, frame, angle.anchorX, angle.anchorY, angle.frameW, angle.frameH, scale, picked.flip);
    layers.marks.setPosition(0, 0).setVisible(true);
  } else {
    layers.marks.setVisible(false);
  }
  layers.rider.setVisible(false);
  layers.silks.setVisible(false);
  return true;
}

type Point = readonly [number, number];

function handAt(angle: EventAngle, frames: number, frame: number): Point {
  const last = frames - 1;
  const at = Math.min(last, Math.max(0, frame));
  if (angle.hand) {
    const a = angle.hand[Math.floor(at)] ?? angle.hand[0] ?? [angle.anchorX, angle.anchorY];
    const b = angle.hand[Math.min(last, Math.floor(at) + 1)] ?? a;
    const t = at - Math.floor(at);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  // No hand data: a hand-ish point that reaches out near the ground, then rises to the head.
  const reach: Point = [angle.anchorX + 0.6 * (angle.frameW - angle.anchorX), angle.anchorY - 0.03 * angle.frameH];
  const head: Point = [angle.anchorX + 0.3 * (angle.frameW - angle.anchorX), angle.anchorY - 0.7 * angle.anchorY];
  const mix = (from: Point, to: Point, t: number): Point => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  const k = at / Math.max(1, last);
  const closeAt = GRAB_CLOSE_S / TITAN_GRAB_S;
  return k <= closeAt ? mix(head, reach, k / Math.max(1e-6, closeAt)) : mix(reach, head, (k - closeAt) / Math.max(1e-6, 1 - closeAt));
}

function groundOf(angle: EventAngle, frame: number): Point {
  const at = angle.ground?.[Math.min(angle.ground.length - 1, Math.max(0, Math.floor(frame)))];
  return at ?? [angle.anchorX, angle.anchorY];
}

export type TitanDraw = {
  phase: TitanPhase;
  since: number;
  /** Projected ground point of the giant's path, screen px. */
  x: number;
  y: number;
  drawn: number;
  picked: PickedAngle;
  shade: number;
  /** Sort depth for a ground y, so the giant sorts with the actors by its feet. */
  depthAt: (groundY: number) => number;
};

/** Where the hand sits against the feet when it closes, screen px. The giant stands so this point is the horse. */
function grabGeometry(grab: EventSheet, picked: PickedAngle, drawn: number) {
  const found = pickEventAngle(grab, picked);
  if (!found) return null;
  const { angle } = found;
  const scale = drawn * grab.drawScale;
  const sign = picked.flip ? -1 : 1;
  const frame = Math.round(GRAB_CLOSE_S * grab.fps);
  const hand = handAt(angle, grab.frames, frame);
  const ground = groundOf(angle, frame);
  return { found, scale, sign, hand, ground, frame };
}

/** Screen offset of the giant's hand at `since` from where it closed on the horse. */
export function grabHandDelta(sheets: EventSheets, picked: PickedAngle, drawn: number, since: number) {
  const grab = sheets.titanGrab;
  const geometry = grab ? grabGeometry(grab, picked, drawn) : null;
  if (!grab || !geometry) return null;
  const now = handAt(geometry.found.angle, grab.frames, Math.min(grab.frames - 1, since * grab.fps));
  return { x: (now[0] - geometry.hand[0]) * geometry.scale * geometry.sign, y: (now[1] - geometry.hand[1]) * geometry.scale };
}

/** Paints the giant and returns its ground point on screen, or null while its sheets are not ready. */
export function paintTitan(sprite: Phaser.GameObjects.Sprite, sheets: EventSheets, input: TitanDraw): { x: number; y: number } | null {
  const grab = sheets.titanGrab;
  const run = sheets.titanRun;
  const geometry = grab ? grabGeometry(grab, input.picked, input.drawn) : null;
  const sheet = input.phase === "grab" ? grab : run;
  if (!grab || !run || !sheet || !geometry) {
    sprite.setVisible(false);
    return null;
  }
  const found = pickEventAngle(sheet, input.picked);
  if (!found) {
    sprite.setVisible(false);
    return null;
  }
  const { set, angle } = found;
  const frame = clipFrame(sheet, input.since);
  const [groundX, groundY] = groundOf(angle, frame);
  const scale = input.drawn * sheet.drawScale;
  paintGallop(sprite, eventKey(sheet.id, set, angle.index), frame, groundX, groundY, angle.frameW, angle.frameH, scale, input.picked.flip);
  // Stand back so the closing hand lands on the horse. The offset fades once the giant turns away.
  const weight = input.phase === "leave" ? 1 - smoothstep(input.since / 0.4) : 1;
  const x = input.x + (geometry.ground[0] - geometry.hand[0]) * geometry.scale * geometry.sign * weight;
  const y = input.y + (geometry.ground[1] - geometry.hand[1]) * geometry.scale * weight;
  sprite
    .setPosition(x, y)
    .setTint(multiplyTint(0xffffff, input.shade))
    .setTintMode(Phaser.TintModes.MULTIPLY)
    .setDepth(input.depthAt(y))
    .setVisible(true);
  return { x, y };
}
