import Phaser from "phaser";
import { laneColor } from "./laneColors";
import {
  DOOR_LEAF,
  END_CAP_M,
  FRONT_END_LEFT,
  FRONT_END_RIGHT,
  FRONT_STALL_SLICE,
  GATE_PX_PER_M,
  GATE_STALL_PITCH_M,
  PLATE_CLEAR,
  PLATE_LOCAL,
  cameraOnGateExitSide,
  doorLeafQuad,
  endCapAnchor,
  endCapQuad,
  gateArtStallGround,
  gateArtView,
  plateQuad,
  stallFrameQuad,
  stallRowPose,
  topGateSheet,
  topStallAxis,
  type GateCorner,
} from "./gateArt";
import { GATE_STALLS } from "./startingGate";
import { projectHeight } from "./trackArt";
import type { Camera } from "./track";

/** In front of the horses, behind the near rail. Holes in the art stay transparent. */
const GATE_DEPTH = 2000;
const DOOR_DEPTH = 2001;
const PLATE_DEPTH = 2002;
/** The sheet's 4th stall is the module. Its posts tile cleanly. */
const TOP_MODULE_INDEX = 3;

type MeshSlot = {
  mesh: Phaser.GameObjects.Mesh2D;
  verts: number[];
  indices: number[];
};

type SliceSprite = {
  key: string;
  originX: number;
  originY: number;
};

export type GateArt = {
  paint: (camera: Camera, visible: boolean, doors: readonly number[]) => void;
};

export function createGateArt(scene: Phaser.Scene): GateArt {
  const built = buildTextures(scene);
  const frame = makeMesh(scene, built.frameKey, GATE_DEPTH);
  const capLeft = makeMesh(scene, built.capLeftKey, GATE_DEPTH);
  const capRight = makeMesh(scene, built.capRightKey, GATE_DEPTH);
  const doorLeft = makeMesh(scene, built.doorLeftKey, DOOR_DEPTH);
  const doorRight = makeMesh(scene, built.doorRightKey, DOOR_DEPTH);
  const plates = built.plateKeys.map((key) => makeMesh(scene, key, PLATE_DEPTH));
  const topStalls = built.topStalls.map((placed) => scene.add.image(0, 0, placed.key).setVisible(false).setDepth(GATE_DEPTH));
  const topLeft = scene.add.image(0, 0, built.topLeft.key).setVisible(false);
  const topRight = scene.add.image(0, 0, built.topRight.key).setVisible(false);

  function hide() {
    for (const slot of [frame, capLeft, capRight, doorLeft, doorRight, ...plates]) clearSlot(slot);
    for (const image of [...topStalls, topLeft, topRight]) image.setVisible(false);
  }

  function paint(camera: Camera, visible: boolean, doors: readonly number[]) {
    hide();
    if (!visible) return;
    const elevationDeg = (camera.pitch * 180) / Math.PI;
    if (gateArtView(elevationDeg) === "front") {
      if (!cameraOnGateExitSide(camera.groundX)) return;
      paintFront(camera, doors);
      return;
    }
    paintTop(camera);
  }

  function paintFront(camera: Camera, doors: readonly number[]) {
    for (let index = 0; index < GATE_STALLS; index += 1) {
      paintQuad(frame, camera, stallFrameQuad(index));
      paintQuad(doorLeft, camera, doorLeafQuad(index, "left", doors[index] ?? 0));
      paintQuad(doorRight, camera, doorLeafQuad(index, "right", doors[index] ?? 0));
      const plate = plates[index];
      if (plate) paintQuad(plate, camera, plateQuad(index));
    }
    paintQuad(capLeft, camera, endCapQuad("left"));
    paintQuad(capRight, camera, endCapQuad("right"));
  }

  function paintTop(camera: Camera) {
    const grounds = Array.from({ length: GATE_STALLS }, (_, index) => {
      const ground = gateArtStallGround(index);
      return projectHeight(ground.x, ground.y, ground.z, camera);
    });
    const axis = topStallAxis();
    const pose = stallRowPose(grounds, axis.dx, axis.dy);
    if (!pose) return;
    grounds.forEach((ground, index) => {
      const image = topStalls[index];
      const placed = built.topStalls[index];
      if (!image || !placed || !ground.visible) return;
      placeImage(image, placed, ground.x, ground.y, pose.scale, pose.rotation);
    });
    placeCap(topLeft, built.topLeft, "left", camera, pose.scale, pose.rotation);
    placeCap(topRight, built.topRight, "right", camera, pose.scale, pose.rotation);
  }

  return { paint };
}

function placeCap(
  image: Phaser.GameObjects.Image,
  placed: SliceSprite,
  side: "left" | "right",
  camera: Camera,
  scale: number,
  rotation: number,
) {
  const world = endCapAnchor(side);
  const pose = projectHeight(world.x, world.y, world.z, camera);
  if (!pose.visible) return;
  placeImage(image, placed, pose.x, pose.y, scale, rotation);
}

function placeImage(
  image: Phaser.GameObjects.Image,
  placed: SliceSprite,
  x: number,
  y: number,
  scale: number,
  rotation: number,
) {
  image
    .setVisible(true)
    .setOrigin(placed.originX, placed.originY)
    .setPosition(x, y)
    .setScale(scale)
    .setRotation(rotation)
    .setDepth(GATE_DEPTH);
}

function paintQuad(slot: MeshSlot, camera: Camera, corners: GateCorner[]) {
  const posed = corners.map((corner) => ({
    ...corner,
    pose: projectHeight(corner.x, corner.y, corner.z, camera),
  }));
  if (posed.some((corner) => !corner.pose.visible)) return;
  const tl = posed[0];
  const bl = posed[1];
  const tr = posed[2];
  const br = posed[3];
  if (!tl || !bl || !tr || !br) return;
  const i0 = pushVert(slot, tl.pose.x, tl.pose.y, tl.u, tl.v);
  const i1 = pushVert(slot, bl.pose.x, bl.pose.y, bl.u, bl.v);
  const i2 = pushVert(slot, tr.pose.x, tr.pose.y, tr.u, tr.v);
  const i3 = pushVert(slot, br.pose.x, br.pose.y, br.u, br.v);
  pushTri(slot, i0, i1, i2);
  pushTri(slot, i1, i3, i2);
}

type BuiltTextures = {
  frameKey: string;
  capLeftKey: string;
  capRightKey: string;
  doorLeftKey: string;
  doorRightKey: string;
  plateKeys: string[];
  topStalls: SliceSprite[];
  topLeft: SliceSprite;
  topRight: SliceSprite;
};

function buildTextures(scene: Phaser.Scene): BuiltTextures {
  const front = sourceOf(scene, "gate-front");
  const top = sourceOf(scene, "gate-top");
  const frame = makeCanvas(scene, "gate-stall-frame", FRONT_STALL_SLICE.width, FRONT_STALL_SLICE.height);
  frame.context.drawImage(
    front,
    FRONT_STALL_SLICE.x,
    FRONT_STALL_SLICE.y,
    FRONT_STALL_SLICE.width,
    FRONT_STALL_SLICE.height,
    0,
    0,
    FRONT_STALL_SLICE.width,
    FRONT_STALL_SLICE.height,
  );
  frame.context.clearRect(DOOR_LEAF.left.x, DOOR_LEAF.y, DOOR_LEAF.left.width, DOOR_LEAF.height);
  frame.context.clearRect(DOOR_LEAF.right.x, DOOR_LEAF.y, DOOR_LEAF.right.width, DOOR_LEAF.height);
  for (const plate of PLATE_CLEAR) frame.context.clearRect(plate.x, plate.y, plate.width, plate.height);
  frame.refresh();

  const doorLeft = makeCanvas(scene, "gate-door-left", DOOR_LEAF.left.width, DOOR_LEAF.height);
  doorLeft.context.drawImage(
    front,
    FRONT_STALL_SLICE.x + DOOR_LEAF.left.x,
    DOOR_LEAF.y,
    DOOR_LEAF.left.width,
    DOOR_LEAF.height,
    0,
    0,
    DOOR_LEAF.left.width,
    DOOR_LEAF.height,
  );
  doorLeft.refresh();

  const doorRight = makeCanvas(scene, "gate-door-right", DOOR_LEAF.right.width, DOOR_LEAF.height);
  doorRight.context.drawImage(
    front,
    FRONT_STALL_SLICE.x + DOOR_LEAF.right.x,
    DOOR_LEAF.y,
    DOOR_LEAF.right.width,
    DOOR_LEAF.height,
    0,
    0,
    DOOR_LEAF.right.width,
    DOOR_LEAF.height,
  );
  doorRight.refresh();

  const capLeft = makeCanvas(scene, "gate-cap-left", FRONT_END_LEFT.width, FRONT_END_LEFT.height);
  capLeft.context.drawImage(
    front,
    FRONT_END_LEFT.x,
    FRONT_END_LEFT.y,
    FRONT_END_LEFT.width,
    FRONT_END_LEFT.height,
    0,
    0,
    FRONT_END_LEFT.width,
    FRONT_END_LEFT.height,
  );
  capLeft.refresh();

  const capRight = makeCanvas(scene, "gate-cap-right", FRONT_END_RIGHT.width, FRONT_END_RIGHT.height);
  capRight.context.drawImage(
    front,
    FRONT_END_RIGHT.x,
    FRONT_END_RIGHT.y,
    FRONT_END_RIGHT.width,
    FRONT_END_RIGHT.height,
    0,
    0,
    FRONT_END_RIGHT.width,
    FRONT_END_RIGHT.height,
  );
  capRight.refresh();

  const plateKeys = Array.from({ length: GATE_STALLS }, (_, index) => {
    const key = `gate-plate-${index + 1}`;
    const plate = makeCanvas(scene, key, PLATE_LOCAL.width, PLATE_LOCAL.height);
    paintPlate(plate.context, index + 1, PLATE_LOCAL.width, PLATE_LOCAL.height);
    plate.refresh();
    return key;
  });

  const sliced = sliceTop(top, topGateSheet().width, topGateSheet().height);
  const topStalls = Array.from({ length: GATE_STALLS }, (_, index) => {
    const copy = cloneCanvas(sliced.stall.canvas);
    const spot = sliced.stall.plate;
    if (spot) paintPlate(copy.getContext("2d"), index + 1, spot.w, spot.h, spot.x, spot.y);
    const key = `gate-top-stall-${index + 1}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, copy);
    return { key, originX: sliced.stall.originX, originY: sliced.stall.originY };
  });

  const topLeft = registerSlice(scene, "gate-top-cap-left", sliced.left);
  const topRight = registerSlice(scene, "gate-top-cap-right", sliced.right);

  return {
    frameKey: "gate-stall-frame",
    capLeftKey: "gate-cap-left",
    capRightKey: "gate-cap-right",
    doorLeftKey: "gate-door-left",
    doorRightKey: "gate-door-right",
    plateKeys,
    topStalls,
    topLeft,
    topRight,
  };
}

function registerSlice(scene: Phaser.Scene, key: string, crop: { canvas: HTMLCanvasElement; originX: number; originY: number }): SliceSprite {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, crop.canvas);
  return { key, originX: crop.originX, originY: crop.originY };
}

function paintPlate(
  context: CanvasRenderingContext2D | null,
  lane: number,
  width: number,
  height: number,
  centerX = width / 2,
  centerY = height / 2,
) {
  if (!context) return;
  const color = laneColor(lane);
  context.clearRect(centerX - width / 2, centerY - height / 2, width, height);
  context.fillStyle = color;
  context.fillRect(centerX - width / 2, centerY - height / 2, width, height);
  context.fillStyle = plateInk(color);
  context.font = `900 ${Math.max(12, Math.round(height * 0.62))}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(lane), centerX, centerY + 1);
}

function plateInk(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const lum = 0.299 * red + 0.587 * green + 0.114 * blue;
  return lum > 150 ? "#14181F" : "#FFFFFF";
}

type Crop = {
  canvas: HTMLCanvasElement;
  originX: number;
  originY: number;
  plate: { x: number; y: number; w: number; h: number } | null;
};

function sliceTop(image: CanvasImageSource, width: number, height: number) {
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext("2d");
  if (!ctx) return emptySlice();
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const centers = topGateSheet().stallPx;
  const axis = topStallAxis();
  const length = Math.hypot(axis.dx, axis.dy) || 1;
  const ux = axis.dx / length;
  const uy = axis.dy / length;
  const half = length / 2;
  const cap = (END_CAP_M / GATE_STALL_PITCH_M) * length + 8;
  const perpLimit = length * 2.4;
  const module = centers[TOP_MODULE_INDEX];
  const first = centers[0];
  const last = centers[centers.length - 1];
  if (!module || !first || !last) return emptySlice();

  const along = (x: number, y: number, cx: number, cy: number) => (x - cx) * ux + (y - cy) * uy;
  const perp = (x: number, y: number, cx: number, cy: number) => (x - cx) * -uy + (y - cy) * ux;
  const nearest = (x: number, y: number) => {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < centers.length; index += 1) {
      const center = centers[index];
      if (!center) continue;
      const distance = (x - center[0]) ** 2 + (y - center[1]) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  };

  const stall = new Uint8Array(width * height);
  const left = new Uint8Array(width * height);
  const right = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels.data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha < 16) continue;
      if (Math.abs(perp(x, y, module[0], module[1])) > perpLimit) continue;
      if (nearest(x, y) === TOP_MODULE_INDEX && Math.abs(along(x, y, module[0], module[1])) <= half + 1) {
        stall[y * width + x] = 1;
      }
      const fromFirst = along(x, y, first[0], first[1]);
      if (fromFirst < -half + 1 && fromFirst > -half - cap && Math.abs(perp(x, y, first[0], first[1])) < perpLimit) {
        left[y * width + x] = 1;
      }
      const fromLast = along(x, y, last[0], last[1]);
      if (fromLast > half - 1 && fromLast < half + cap && Math.abs(perp(x, y, last[0], last[1])) < perpLimit) {
        right[y * width + x] = 1;
      }
    }
  }

  const reach = ((GATE_STALL_PITCH_M / 2 + END_CAP_M / 2) / GATE_STALL_PITCH_M) * length;
  const stallCrop = cropMasked(pixels, stall, width, height, module[0], module[1], true);
  return {
    stall: stallCrop,
    left: cropMasked(pixels, left, width, height, first[0] - ux * reach, first[1] - uy * reach, false),
    right: cropMasked(pixels, right, width, height, last[0] + ux * reach, last[1] + uy * reach, false),
  };
}

function cropMasked(
  pixels: ImageData,
  mask: Uint8Array,
  width: number,
  height: number,
  anchorX: number,
  anchorY: number,
  punchPlate: boolean,
): Crop {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (count < 8) {
    const blank = document.createElement("canvas");
    blank.width = 4;
    blank.height = 4;
    return { canvas: blank, originX: 0.5, originY: 0.5, plate: null };
  }
  minX = Math.max(0, Math.min(minX, Math.floor(anchorX)));
  minY = Math.max(0, Math.min(minY, Math.floor(anchorY)));
  maxX = Math.min(width - 1, Math.max(maxX, Math.ceil(anchorX)));
  maxY = Math.min(height - 1, Math.max(maxY, Math.ceil(anchorY)));
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, originX: 0.5, originY: 0.5, plate: null };
  const image = ctx.createImageData(cropW, cropH);
  let plateCount = 0;
  let plateX = 0;
  let plateY = 0;
  let plateMinX = cropW;
  let plateMinY = cropH;
  let plateMaxX = 0;
  let plateMaxY = 0;
  for (let y = 0; y < cropH; y += 1) {
    for (let x = 0; x < cropW; x += 1) {
      const srcX = minX + x;
      const srcY = minY + y;
      if (!mask[srcY * width + srcX]) continue;
      const from = (srcY * width + srcX) * 4;
      const to = (y * cropW + x) * 4;
      const red = pixels.data[from] ?? 0;
      const green = pixels.data[from + 1] ?? 0;
      const blue = pixels.data[from + 2] ?? 0;
      const alpha = pixels.data[from + 3] ?? 0;
      const numbered = punchPlate && alpha > 200 && green > 140 && green > red + 30 && green > blue + 20;
      if (numbered) {
        plateCount += 1;
        plateX += x;
        plateY += y;
        if (x < plateMinX) plateMinX = x;
        if (y < plateMinY) plateMinY = y;
        if (x > plateMaxX) plateMaxX = x;
        if (y > plateMaxY) plateMaxY = y;
        continue;
      }
      image.data[to] = red;
      image.data[to + 1] = green;
      image.data[to + 2] = blue;
      image.data[to + 3] = alpha;
    }
  }
  ctx.putImageData(image, 0, 0);
  const plate =
    plateCount > 12
      ? {
          x: plateX / plateCount,
          y: plateY / plateCount,
          w: Math.max(8, plateMaxX - plateMinX + 1),
          h: Math.max(8, plateMaxY - plateMinY + 1),
        }
      : null;
  return {
    canvas,
    originX: (anchorX - minX) / cropW,
    originY: (anchorY - minY) / cropH,
    plate,
  };
}

function emptySlice() {
  const blank = document.createElement("canvas");
  blank.width = 4;
  blank.height = 4;
  const crop = { canvas: blank, originX: 0.5, originY: 0.5, plate: null };
  return { stall: crop, left: crop, right: crop };
}

function cloneCanvas(source: HTMLCanvasElement) {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d")?.drawImage(source, 0, 0);
  return copy;
}

function sourceOf(scene: Phaser.Scene, key: string): CanvasImageSource {
  const image = scene.textures.get(key).getSourceImage();
  if (image instanceof HTMLImageElement || image instanceof HTMLCanvasElement) return image;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  return canvas;
}

function makeCanvas(scene: Phaser.Scene, key: string, width: number, height: number) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) throw new Error(`canvas texture ${key} was not created`);
  texture.context.clearRect(0, 0, width, height);
  return texture;
}

function makeMesh(scene: Phaser.Scene, key: string, depth: number): MeshSlot {
  const verts: number[] = [];
  const indices: number[] = [];
  const mesh = scene.add.mesh2d(0, 0, key, verts, indices);
  mesh.setRenderAsTriangles(true);
  mesh.setDepth(depth);
  mesh.setAlpha(1);
  return { mesh, verts, indices };
}

function clearSlot(slot: MeshSlot) {
  slot.verts.length = 0;
  slot.indices.length = 0;
}

function pushVert(slot: MeshSlot, x: number, y: number, u: number, v: number) {
  slot.verts.push(x, y, u, v);
  return slot.verts.length / 4 - 1;
}

function pushTri(slot: MeshSlot, a: number, b: number, c: number) {
  slot.indices.push(a, b, c, 0);
}
