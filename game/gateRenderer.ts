import Phaser from "phaser";
import { laneColorValue, laneNumberInk } from "./laneColors";
import { projectWithCamera, type Camera } from "./track";
import {
  GATE_ANGLES,
  STALL_COUNT,
  cameraStandOffset,
  pickGateAngle,
  pickGateSheet,
  stallFront,
  type GateAngle,
  type StartGate,
} from "./startGate";

const PARTS = ["endL", "endR", "partition", "stall_back", "stall_front", "stall_front_mask", "sign_text"] as const;

/** Dividers, then backs, then the horse, then the door, the front plate, and its number. */
const LAYER = {
  partition: -0.45,
  back: -0.2,
  door: 0.22,
  front: 0.48,
} as const;

type Quad = {
  mesh: Phaser.GameObjects.Mesh2D;
  verts: number[];
  key: string;
};

type StallQuads = {
  partition: Quad;
  back: Quad;
  door: Quad;
  front: Quad;
};

export function queueGateAssets(load: Phaser.Loader.LoaderPlugin) {
  for (const angle of GATE_ANGLES) {
    for (const part of PARTS) {
      load.image(assetKey(angle.name, part), `/gate/${angle.name}/${part}.webp`);
    }
    for (let frame = 0; frame < 6; frame += 1) {
      load.image(assetKey(angle.name, `door-${frame}`), `/gate/${angle.name}/door_f${frame}.webp`);
    }
  }
}

function assetKey(angle: string, part: string) {
  return `gate-${angle}-${part}`;
}

function makeQuad(scene: Phaser.Scene, key: string): Quad {
  const verts = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1];
  const indices = [0, 2, 1, 0, 2, 3, 1, 0];
  const mesh = scene.add.mesh2d(0, 0, key, verts, indices);
  mesh.setRenderAsTriangles(true);
  mesh.setScrollFactor(0);
  mesh.setVisible(false);
  return { mesh, verts, key };
}

function sourceSize(scene: Phaser.Scene, key: string) {
  const image = scene.textures.get(key).getSourceImage();
  if (!image || !("width" in image)) return null;
  return { image, width: image.width, height: image.height };
}

function bakePlates(scene: Phaser.Scene) {
  for (const angle of GATE_ANGLES) {
    const frontKey = assetKey(angle.name, "stall_front");
    const maskKey = assetKey(angle.name, "stall_front_mask");
    const front = sourceSize(scene, frontKey);
    const mask = sourceSize(scene, maskKey);
    if (!front || !mask) continue;
    const maskPixels = readPixels(mask.image, mask.width, mask.height);
    if (!maskPixels) continue;
    for (let lane = 1; lane <= STALL_COUNT; lane += 1) {
      const key = assetKey(angle.name, `plate-${lane}`);
      const texture = scene.textures.createCanvas(key, front.width, front.height);
      const context = texture?.getContext();
      if (!texture || !context) continue;
      context.clearRect(0, 0, front.width, front.height);
      context.drawImage(front.image as CanvasImageSource, 0, 0, front.width, front.height);
      tintPlate(context, maskPixels, front.width, front.height, lane);
      paintNumber(context, maskPixels, front.width, front.height, lane, angle);
      texture.refresh();
    }
  }
}

function readPixels(image: CanvasImageSource | Phaser.GameObjects.RenderTexture, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image as CanvasImageSource, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function tintPlate(context: CanvasRenderingContext2D, mask: Uint8ClampedArray, width: number, height: number, lane: number) {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const hex = laneColorValue(lane);
  const lr = (hex >> 16) & 255;
  const lg = (hex >> 8) & 255;
  const lb = hex & 255;
  for (let i = 0; i < pixels.length; i += 4) {
    const cover = (mask[i + 1] ?? 0) / 255;
    const alpha = pixels[i + 3] ?? 0;
    if (cover < 0.04 || alpha < 8) continue;
    const shade = Math.max(0.42, ((pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0)) / (3 * 255));
    const mix = Math.min(1, cover);
    pixels[i] = Math.round((pixels[i] ?? 0) * (1 - mix) + lr * shade * mix);
    pixels[i + 1] = Math.round((pixels[i + 1] ?? 0) * (1 - mix) + lg * shade * mix);
    pixels[i + 2] = Math.round((pixels[i + 2] ?? 0) * (1 - mix) + lb * shade * mix);
  }
  context.putImageData(image, 0, 0);
}

function paintNumber(
  context: CanvasRenderingContext2D,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  lane: number,
  angle: GateAngle,
) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((mask[(y * width + x) * 4 + 1] ?? 0) < 40) continue;
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const boxW = found ? maxX - minX + 1 : 24;
  const boxH = found ? maxY - minY + 1 : 24;
  const cx = found ? (minX + maxX) / 2 : angle.plateCenter[0];
  const cy = found ? (minY + maxY) / 2 : angle.plateCenter[1];
  const ink = laneNumberInk(lane);
  const digits = lane >= 10 ? 2 : 1;
  const fontPx = Math.max(8, Math.floor(Math.min(boxW / (digits * 0.62), boxH * 0.72)));
  context.font = `700 ${fontPx}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = Math.max(1, fontPx * 0.14);
  context.strokeStyle = ink.stroke;
  context.fillStyle = ink.color;
  const label = String(lane);
  context.strokeText(label, cx, cy);
  context.fillText(label, cx, cy);
}

function hide(quad: Quad) {
  quad.mesh.setVisible(false);
}

function showQuad(
  quad: Quad,
  key: string,
  anchorX: number,
  anchorY: number,
  depth: number,
  map: (ix: number, iy: number) => [number, number] | null,
  ground: readonly [number, number],
  width: number,
  height: number,
) {
  const corners: Array<readonly [number, number, number, number]> = [
    [0, 0, 0, 0],
    [width, 0, 1, 0],
    [0, height, 0, 1],
    [width, height, 1, 1],
  ];
  for (let index = 0; index < corners.length; index += 1) {
    const corner = corners[index];
    if (!corner) return hide(quad);
    const mapped = map(corner[0] - ground[0], corner[1] - ground[1]);
    if (!mapped) return hide(quad);
    const offset = index * 4;
    quad.verts[offset] = anchorX + mapped[0];
    quad.verts[offset + 1] = anchorY + mapped[1];
    quad.verts[offset + 2] = corner[2];
    quad.verts[offset + 3] = corner[3];
  }
  if (quad.key !== key) {
    quad.mesh.setTexture(key);
    quad.key = key;
  }
  quad.mesh.setDepth(depth);
  quad.mesh.setVisible(true);
}

export function createGateRenderer(scene: Phaser.Scene, gate: StartGate) {
  bakePlates(scene);
  const stalls: StallQuads[] = [];
  for (let lane = 1; lane <= STALL_COUNT; lane += 1) {
    const angle = "oblique60";
    stalls.push({
      partition: makeQuad(scene, assetKey(angle, "partition")),
      back: makeQuad(scene, assetKey(angle, "stall_back")),
      door: makeQuad(scene, assetKey(angle, "door-0")),
      front: makeQuad(scene, assetKey(angle, `plate-${lane}`)),
    });
  }
  const ends = {
    endL: makeQuad(scene, assetKey("oblique60", "endL")),
    endR: makeQuad(scene, assetKey("oblique60", "endR")),
    sign: makeQuad(scene, assetKey("oblique60", "sign_text")),
  };

  function paint(camera: Camera, nowMs: number) {
    const mid = stallFront(6);
    const from = projectWithCamera({ ...stallFront(6), tx: 1, ty: 0 }, camera);
    const to = projectWithCamera({ ...stallFront(7), tx: 1, ty: 0 }, camera);
    const angle =
      from.visible && to.visible
        ? pickGateSheet([to.x - from.x, to.y - from.y])
        : pickGateAngle(cameraStandOffset(camera, mid));
    const sample = sourceSize(scene, assetKey(angle.name, "partition"));
    if (!sample) return;
    const screenY: number[] = [];
    for (let lane = 1; lane <= STALL_COUNT; lane += 1) {
      const placed = placeStall(camera, angle, lane);
      const quads = stalls[lane - 1];
      if (!placed || !quads) {
        if (quads) {
          hide(quads.partition);
          hide(quads.back);
          hide(quads.door);
          hide(quads.front);
        }
        screenY.push(Number.NaN);
        continue;
      }
      screenY.push(placed.anchorY);
      const frame = gate.frameFor(lane, nowMs);
      showQuad(quads.partition, assetKey(angle.name, "partition"), placed.anchorX, placed.anchorY, placed.anchorY + LAYER.partition, placed.map, angle.ground, sample.width, sample.height);
      showQuad(quads.back, assetKey(angle.name, "stall_back"), placed.anchorX, placed.anchorY, placed.anchorY + LAYER.back, placed.map, angle.ground, sample.width, sample.height);
      showQuad(quads.door, assetKey(angle.name, `door-${frame}`), placed.anchorX, placed.anchorY, placed.anchorY + LAYER.door, placed.map, angle.ground, sample.width, sample.height);
      showQuad(quads.front, assetKey(angle.name, `plate-${lane}`), placed.anchorX, placed.anchorY, placed.anchorY + LAYER.front, placed.map, angle.ground, sample.width, sample.height);
    }
    paintCap(ends.endL, assetKey(angle.name, "endL"), camera, angle, 2, sample.width, sample.height, screenY, 1);
    paintCap(ends.endR, assetKey(angle.name, "endR"), camera, angle, 11, sample.width, sample.height, screenY, 12);
    paintSign(ends.sign, assetKey(angle.name, "sign_text"), camera, angle, sample.width, sample.height, screenY);
  }

  return { paint };
}

function placeStall(camera: Camera, angle: GateAngle, lane: number) {
  const here = projectWithCamera({ ...stallFront(lane), tx: 1, ty: 0 }, camera);
  const stepFrom = Math.min(lane, STALL_COUNT - 1);
  const from = projectWithCamera({ ...stallFront(stepFrom), tx: 1, ty: 0 }, camera);
  const to = projectWithCamera({ ...stallFront(stepFrom + 1), tx: 1, ty: 0 }, camera);
  if (!here.visible || !from.visible || !to.visible) return null;
  const screenStep: [number, number] = [to.x - from.x, to.y - from.y];
  const authored = Math.hypot(angle.stallStep[0], angle.stallStep[1]) || 1;
  const scale = (Math.hypot(screenStep[0], screenStep[1]) || 1) / authored;
  const map = (ix: number, iy: number): [number, number] => [ix * scale, iy * scale];
  return { anchorX: here.x, anchorY: here.y, map };
}

function paintCap(
  quad: Quad,
  key: string,
  camera: Camera,
  angle: GateAngle,
  lane: number,
  width: number,
  height: number,
  screenY: number[],
  depthLane: number,
) {
  const placed = placeStall(camera, angle, lane);
  const depthAt = screenY[depthLane - 1];
  if (!placed || depthAt == null || Number.isNaN(depthAt)) return hide(quad);
  showQuad(quad, key, placed.anchorX, placed.anchorY, Math.max(placed.anchorY, depthAt) + 0.6, placed.map, angle.ground, width, height);
}

function paintSign(
  quad: Quad,
  key: string,
  camera: Camera,
  angle: GateAngle,
  width: number,
  height: number,
  screenY: number[],
) {
  const left = projectWithCamera({ ...stallFront(6), tx: 1, ty: 0 }, camera);
  const right = projectWithCamera({ ...stallFront(7), tx: 1, ty: 0 }, camera);
  const placed = placeStall(camera, angle, 6);
  if (!placed || !left.visible || !right.visible) return hide(quad);
  const ys = screenY.filter((value) => Number.isFinite(value));
  const front = ys.length > 0 ? Math.max(...ys) : placed.anchorY;
  showQuad(quad, key, (left.x + right.x) / 2, (left.y + right.y) / 2, front + 1, placed.map, angle.ground, width, height);
}
