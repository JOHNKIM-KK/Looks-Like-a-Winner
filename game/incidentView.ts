import Phaser from "phaser";
import type { Dismount, FootMode } from "@/lib/incidents";
import { HORSE_PX_PER_M } from "./artScale";
import { FOOT_SCALE, FOOT_ANGLES, fallFrame, fallHeightM, footKey, pickFootAngle, runFrame, FALL_FRAMES } from "./jockeyFoot";
import type { PickedAngle } from "./horseVisual";
import { multiplyTint } from "./horseVisual";
import { FOOT_START_S } from "./fallenHorse";
import { paintGallop } from "./spriteFrames";

export type MountLayers = {
  sprite: Phaser.GameObjects.Sprite;
  marks: Phaser.GameObjects.Sprite;
  rider: Phaser.GameObjects.Sprite;
  silks: Phaser.GameObjects.Sprite;
};

/** A sheet that replaces one placeholder: a single row of equal frames. */
export type EventSheet = {
  key: string;
  file: string;
  frameWidth: number;
  frameHeight: number;
  anchorX: number;
  anchorY: number;
  frames: number;
  /** Art pixels per metre, so the placeholder and the real sheet share one size rule. */
  pxPerM: number;
};

export type EventArtKey = "downHorse" | "grazeHorse" | "bike" | "titan";

/**
 * Art for the incident props. `null` draws the generated placeholder.
 * When a sheet lands in `public/`, put its reference here and it replaces the placeholder.
 */
export const EVENT_ART: Record<EventArtKey, EventSheet | null> = {
  downHorse: null,
  grazeHorse: null,
  bike: null,
  titan: null,
};

const PLACEHOLDER = {
  bike: { key: "event-bike", w: 112, h: 56, metres: 2.0 },
  titan: { key: "event-titan", w: 96, h: 200, metres: 7 },
} as const;

export const TITAN_HEIGHT_M = PLACEHOLDER.titan.metres;
const AFTERIMAGES = 3;
const AFTER_ALPHA = [0.4, 0.24, 0.12] as const;
const AFTER_LAG_S = 0.07;
const FLASH_S = 0.16;
/** Jockey runs at this multiple of the run loop rate in super mode. */
const SUPER_ANIM = 1.6;
const BIKE_LIFT_M = 0.42;

export function preloadFootSheets(scene: Phaser.Scene) {
  for (const action of ["run", "fall"] as const) {
    for (const set of ["straight", "corner"] as const) {
      for (const angle of FOOT_ANGLES[action][set]) scene.load.image(footKey(action, set, angle.index), `/jockey/${angle.colorFile}`);
    }
  }
  for (const art of Object.values(EVENT_ART)) if (art) scene.load.image(art.key, art.file);
}

function addRowFrames(texture: Phaser.Textures.Texture | undefined, frames: number, frameW: number, frameH: number) {
  if (!texture || texture.key === "__MISSING") return;
  for (let index = 0; index < frames; index += 1) {
    if (!texture.has(String(index))) texture.add(String(index), 0, index * frameW, 0, frameW, frameH);
  }
}

function drawCanvas(scene: Phaser.Scene, key: string, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = scene.textures.createCanvas(key, width, height);
  if (!canvas) return;
  const ctx = canvas.getContext();
  ctx.clearRect(0, 0, width, height);
  paint(ctx);
  canvas.refresh();
}

/** Slices the foot sheets into frames and paints the temporary prop textures. */
export function buildIncidentTextures(scene: Phaser.Scene) {
  for (const action of ["run", "fall"] as const) {
    for (const set of ["straight", "corner"] as const) {
      for (const angle of FOOT_ANGLES[action][set]) {
        addRowFrames(scene.textures.get(footKey(action, set, angle.index)), angle.frames, angle.frameW, angle.frameH);
      }
    }
  }
  for (const art of Object.values(EVENT_ART)) {
    if (art) addRowFrames(scene.textures.get(art.key), art.frames, art.frameWidth, art.frameHeight);
  }
  const bike = PLACEHOLDER.bike;
  drawCanvas(scene, bike.key, bike.w, bike.h, (ctx) => {
    ctx.fillStyle = "#1b1b22";
    for (const cx of [20, 92]) {
      ctx.beginPath();
      ctx.arc(cx, 38, 15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#c9c9d2";
    for (const cx of [20, 92]) {
      ctx.beginPath();
      ctx.arc(cx, 38, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#d8402e";
    ctx.beginPath();
    ctx.moveTo(18, 38);
    ctx.lineTo(44, 14);
    ctx.lineTo(80, 14);
    ctx.lineTo(94, 38);
    ctx.lineTo(70, 30);
    ctx.lineTo(40, 34);
    ctx.closePath();
    ctx.fill();
  });
  const titan = PLACEHOLDER.titan;
  drawCanvas(scene, titan.key, titan.w, titan.h, (ctx) => {
    ctx.fillStyle = "#3a2f46";
    ctx.beginPath();
    ctx.ellipse(48, 22, 17, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(26, 40, 44, 78);
    ctx.fillRect(8, 44, 18, 66);
    ctx.fillRect(70, 44, 18, 66);
    ctx.fillRect(28, 118, 16, 80);
    ctx.fillRect(52, 118, 16, 80);
    ctx.fillStyle = "#e9e1d4";
    ctx.fillRect(38, 18, 7, 7);
    ctx.fillRect(52, 18, 7, 7);
  });
}

export type IncidentRig = {
  jockey: Phaser.GameObjects.Sprite;
  afterimages: Phaser.GameObjects.Sprite[];
  bike: Phaser.GameObjects.Sprite;
  /** Objects the actor container adds, back to front. */
  display: Phaser.GameObjects.Sprite[];
  /** The riderless horse. Drawn in its own container so it can stand apart from the jockey. */
  body: { container: Phaser.GameObjects.Container; layers: MountLayers };
  bodyPicked?: PickedAngle;
  bodyAnim: number;
  runAnim: number;
};

/** One jockey, three afterimages, one bike, and one riderless-horse body per actor, all hidden until needed. */
export function createRig(scene: Phaser.Scene, baseKey: string): IncidentRig {
  const hidden = () => scene.add.sprite(0, 0, baseKey).setVisible(false);
  const afterimages = Array.from({ length: AFTERIMAGES }, hidden);
  const bike = hidden();
  const jockey = hidden();
  const layers: MountLayers = { sprite: hidden(), marks: hidden(), rider: hidden(), silks: hidden() };
  const container = scene.add.container(0, 0, [layers.sprite, layers.marks, layers.rider, layers.silks]).setVisible(false);
  return { jockey, afterimages, bike, display: [...afterimages, bike, jockey], body: { container, layers }, bodyAnim: 0, runAnim: 0 };
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
};

type Placed = { topPx: number };

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

/**
 * Draws the jockey on foot: the fall sheet, then the run loop. Feet sit on the container origin.
 * Bike and afterimages are drawn from the same frame so the set reads as one body.
 */
export function paintJockey(rig: IncidentRig, input: JockeyInput, runAnim: number, bikeBlend: number): Placed | null {
  const { dismount, since } = input;
  const scale = input.drawn * FOOT_SCALE;
  const metrePx = HORSE_PX_PER_M * input.drawn;
  const falling = since < FOOT_START_S;
  const action = falling ? "fall" : "run";
  const frame = falling ? fallFrame(since) : runFrame(runAnim, input.number);
  const placed = placeFoot(rig.jockey, input, action, frame, scale);
  if (!placed) {
    rig.jockey.setVisible(false);
    return null;
  }
  let raiseM = 0;
  if (falling) {
    const landed = placed.angle.hipsHeightM[FALL_FRAMES - 1] ?? 1;
    raiseM = fallHeightM(since, landed) - landed;
  }
  const onBike = dismount.mode === "bike" && bikeBlend > 0;
  const riseM = onBike ? BIKE_LIFT_M * Math.min(1, bikeBlend) : 0;
  rig.jockey.setPosition(0, -(raiseM + riseM) * metrePx).setVisible(true);

  const flash = dismount.mode === "super" && since - FOOT_START_S >= 0 && since - FOOT_START_S < FLASH_S;
  const tint = multiplyTint(input.laneColor, input.shade);
  const apply = (sprite: Phaser.GameObjects.Sprite, white: boolean) =>
    white ? sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL) : sprite.setTint(tint).setTintMode(Phaser.TintModes.MULTIPLY);
  apply(rig.jockey, flash);
  rig.jockey.setAlpha(1).setScale(rig.jockey.scaleX * (flash ? 1.12 : 1), rig.jockey.scaleY * (flash ? 1.12 : 1));

  const showTrail = dismount.mode === "super" && !falling;
  rig.afterimages.forEach((sprite, index) => {
    const offset = input.trail[index];
    if (!showTrail || !offset) {
      sprite.setVisible(false);
      return;
    }
    const ghost = placeFoot(sprite, input, "run", frame, scale);
    if (!ghost) {
      sprite.setVisible(false);
      return;
    }
    apply(sprite, false);
    sprite.setPosition(offset.x, offset.y).setAlpha(AFTER_ALPHA[index] ?? 0.1).setVisible(true);
  });

  paintBike(rig.bike, input, bikeBlend, metrePx);
  return { topPx: (placed.height + (raiseM + riseM) * metrePx) };
}

/** Bike under the jockey: drops in during the summon, then stays under him. Placeholder art until a sheet is registered. */
function paintBike(bike: Phaser.GameObjects.Sprite, input: JockeyInput, blend: number, metrePx: number) {
  if (input.dismount.mode !== "bike" || blend <= 0) {
    bike.setVisible(false);
    return;
  }
  const art = EVENT_ART.bike;
  const drop = (1 - Math.min(1, blend)) * 5 * metrePx;
  if (art) {
    const scale = (input.drawn * HORSE_PX_PER_M) / art.pxPerM;
    paintGallop(bike, art.key, Math.floor(blend * 24) % art.frames, art.anchorX, art.anchorY, art.frameWidth, art.frameHeight, scale, input.picked.flip);
  } else {
    const spec = PLACEHOLDER.bike;
    bike.setTexture(spec.key);
    bike.setOrigin(0.5, 0.86).setScale((spec.metres * metrePx) / spec.w).setFlipX(input.picked.flip);
  }
  bike.setPosition(0, -drop).setAlpha(Math.min(1, blend * 2)).setVisible(true);
  bike.setTint(multiplyTint(0xffffff, input.shade)).setTintMode(Phaser.TintModes.MULTIPLY);
}

export function bikeBlendAt(dismount: Dismount, since: number) {
  if (dismount.mode !== "bike") return 0;
  return Math.min(1, Math.max(0, (since - FOOT_START_S) / 1.5));
}

/** How far behind the jockey each afterimage trails, seconds. */
export function trailTimes(now: number) {
  return Array.from({ length: AFTERIMAGES }, (_, index) => now - (index + 1) * AFTER_LAG_S);
}

/** Generated stand-in for the titan, or the registered sheet when it exists. */
export function paintTitanSprite(titan: Phaser.GameObjects.Sprite, groundX: number, groundY: number, metrePx: number, runClock: number) {
  const art = EVENT_ART.titan;
  const bob = Math.abs(Math.sin(runClock * 7)) * 0.25 * metrePx;
  if (art) {
    paintGallop(titan, art.key, Math.floor(runClock * 12) % art.frames, art.anchorX, art.anchorY, art.frameWidth, art.frameHeight, metrePx / art.pxPerM, false);
  } else {
    const spec = PLACEHOLDER.titan;
    titan.setTexture(spec.key).setOrigin(0.5, 1).setScale((spec.metres * metrePx) / spec.h).setFlipX(false);
  }
  titan.setPosition(groundX, groundY - bob);
}
