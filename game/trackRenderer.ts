import Phaser from "phaser";
import {
  GROUND_PX_PER_M,
  STRIP_HEIGHT_SCALE,
  LOGICAL_PER_METER,
  RAIL_SEGMENT_M,
  distancePostProgresses,
  propSpriteScale,
} from "./artScale";
import { groundAt, skyStripBottomY } from "./cameraFrame";
import type { Rect } from "./stage";
import { finishGoalX, presentationOnRadius, type Camera } from "./track";
import {
  chutePolyline,
  farRailRadius,
  finishCheckerQuad,
  groundUv,
  isDirt,
  nearRailRadius,
  ovalPolyline,
  projectHeight,
  propSpriteAccepted,
  propStripAccepted,
  standLineOppositeCamera,
  startLineQuad,
  unprojectCell,
  type Vec2,
} from "./trackArt";

const DEPTH = {
  sky: 10,
  turf: 30,
  dirt: 31,
  /** Distant ground fades toward the backdrop before the rails. */
  fog: 32,
  stands: 33,
  checker: 35,
  farRail: 40,
  props: 55,
  nearRail: 3500,
} as const;

const GROUND_CELL = 48;
const FOG_BANDS = 16;
const FOG_START_M = 36;
const FOG_END_M = 170;

const RAIL_IMAGE = { width: 400, height: 125, contact: 124, pxPerM: 100, periodM: RAIL_SEGMENT_M };
const STANDS_IMAGE = { width: 1200, height: 1166, contact: 1165, pxPerM: 100, periodM: 12 };

export type TrackView = {
  showStands: boolean;
  standHeightScale: number;
  showFinish: boolean;
};

export function trackViewFor(stateName: string, leadProgress: number, cornerEnd: number): TrackView {
  const home = stateName === "FINISH" || (stateName === "STRAIGHT" && leadProgress >= cornerEnd);
  return {
    showStands: stateName === "START" || stateName === "STRAIGHT" || stateName === "FINISH",
    standHeightScale: STRIP_HEIGHT_SCALE,
    showFinish: stateName === "FINISH" || home,
  };
}

type MeshSlot = {
  mesh: Phaser.GameObjects.Mesh2D;
  verts: number[];
  indices: number[];
};

type StripImage = { height: number; contact: number; pxPerM: number; periodM: number };

export function createTrackRenderer(scene: Phaser.Scene) {
  const turfTexture = scene.textures.get("ground-turf");
  turfTexture.setWrap(Phaser.Textures.WrapMode.REPEAT, Phaser.Textures.WrapMode.REPEAT);
  enableTurfMipmaps(scene);
  scene.textures.get("ground-dirt").setWrap(Phaser.Textures.WrapMode.REPEAT, Phaser.Textures.WrapMode.REPEAT);
  const skyFrame = scene.textures.get("sky").get();
  const sky = scene.add.tileSprite(0, 0, skyFrame.width, skyFrame.height, "sky").setOrigin(0, 1).setDepth(DEPTH.sky);
  const skyCap = scene.add.rectangle(0, 0, 1, 1, skyTopColor(scene, skyFrame.width)).setOrigin(0, 0).setDepth(DEPTH.sky);

  const turf = makeMesh(scene, "ground-turf", DEPTH.turf);
  const dirt = makeMesh(scene, "ground-dirt", DEPTH.dirt);
  const fog = scene.add.graphics().setDepth(DEPTH.fog);
  const farRail = makeMesh(scene, "rail-segment", DEPTH.farRail);
  const nearRail = makeMesh(scene, "rail-segment", DEPTH.nearRail);
  const stands = makeMesh(scene, "stands-strip", DEPTH.stands);
  stands.mesh.setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
  const checker = makeMesh(scene, "finish-checker", DEPTH.checker);
  const startLine = scene.add.graphics().setDepth(DEPTH.checker);

  const farLoop = ovalPolyline(farRailRadius());
  const nearLoop = ovalPolyline(nearRailRadius());
  const farChute = chutePolyline(farRailRadius());
  const nearChute = chutePolyline(nearRailRadius());
  const postProgress = distancePostProgresses();
  const posts = postProgress.map(() =>
    scene.add.image(0, 0, "prop-distance").setOrigin(0.5, 1).setDepth(DEPTH.props).setVisible(false),
  );
  const finishPost = scene.add.image(0, 0, "prop-finish").setOrigin(0.5, 1).setDepth(DEPTH.props).setVisible(false);

  function paint(camera: Camera, view: TrackView, area: Rect) {
    const skyBottom = skyStripBottomY(camera);
    sky.setPosition(area.x, skyBottom).setSize(area.width, skyFrame.height);
    sky.tilePositionX = area.x;
    const capBottom = skyBottom - skyFrame.height;
    skyCap.setVisible(capBottom > area.y);
    if (capBottom > area.y) skyCap.setPosition(area.x, area.y).setSize(area.width, capBottom - area.y);
    paintGround(camera, turf, dirt, area);
    paintFog(fog, camera, area);
    clearSlot(farRail);
    clearSlot(nearRail);
    paintVertical(farRail, farLoop, true, RAIL_IMAGE, 1, camera, null);
    paintVertical(farRail, farChute, false, RAIL_IMAGE, 1, camera, null);
    paintVertical(nearRail, nearLoop, true, RAIL_IMAGE, 1, camera, null);
    paintVertical(nearRail, nearChute, false, RAIL_IMAGE, 1, camera, null);

    clearSlot(stands);
    if (view.showStands) {
      paintVertical(stands, standLineOppositeCamera(camera), false, STANDS_IMAGE, view.standHeightScale, camera, "inward");
    }
    paintChecker(checker, camera, view.showFinish);
    paintStartLine(startLine, camera);
    paintProps(camera, view, area);
  }

  function paintProps(camera: Camera, view: TrackView, area: Rect) {
    postProgress.forEach((progress, index) => {
      const image = posts[index];
      if (!image) return;
      const point = presentationOnRadius(progress, farRailRadius());
      placeProp(image, point.x, point.y, camera, GROUND_PX_PER_M, area);
    });
    if (view.showFinish) {
      const y = farRailRadius() - 1.6 * LOGICAL_PER_METER;
      placeProp(finishPost, finishGoalX(), y, camera, GROUND_PX_PER_M, area);
    } else {
      finishPost.setVisible(false);
    }
  }

  return { paint };
}

function splitGround(
  camera: Camera,
  turf: MeshSlot,
  dirt: MeshSlot,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  depth: number,
) {
  const mx = (sx0 + sx1) / 2;
  const my = (sy0 + sy1) / 2;
  emitGround(camera, turf, dirt, sx0, sy0, mx, my, depth + 1);
  emitGround(camera, turf, dirt, mx, sy0, sx1, my, depth + 1);
  emitGround(camera, turf, dirt, sx0, my, mx, sy1, depth + 1);
  emitGround(camera, turf, dirt, mx, my, sx1, sy1, depth + 1);
}

/** A screen cell that touches both sky and ground, so it should be split down to the horizon. */
function crossesHorizon(camera: Camera, sx0: number, sy0: number, sx1: number, sy1: number) {
  const corners = [
    groundAt(camera, sx0, sy0),
    groundAt(camera, sx1, sy0),
    groundAt(camera, sx0, sy1),
    groundAt(camera, sx1, sy1),
  ];
  const hits = corners.filter((corner) => corner.ok).length;
  return hits > 0 && hits < 4;
}

function paintFog(fog: Phaser.GameObjects.Graphics, camera: Camera, area: Rect) {
  fog.clear();
  const bandH = area.height / FOG_BANDS;
  for (let index = 0; index < FOG_BANDS; index += 1) {
    const top = area.y + bandH * index;
    const distance = rowDistance(camera, area, top + bandH / 2);
    if (distance == null) continue;
    const amount = fogAmount(distance);
    if (amount < 0.02) continue;
    fog.fillStyle(0x3f4630, amount);
    fog.fillRect(area.x, top, area.width, bandH + 0.5);
  }
}

function rowDistance(camera: Camera, area: Rect, sy: number) {
  let sum = 0;
  let count = 0;
  for (const fraction of [0.2, 0.5, 0.8]) {
    const sx = area.x + area.width * fraction;
    const ground = groundAt(camera, sx, sy);
    if (!ground.ok) continue;
    sum += Math.hypot(ground.x - camera.groundX, ground.y - camera.groundY);
    count += 1;
  }
  if (count === 0) return null;
  return sum / count;
}

function fogAmount(distanceLu: number) {
  const meters = distanceLu / LOGICAL_PER_METER;
  const t = (meters - FOG_START_M) / (FOG_END_M - FOG_START_M);
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Turf is 512². Minification uses mipmaps so the far ground does not shimmer. */
function enableTurfMipmaps(scene: Phaser.Scene) {
  const source = scene.textures.get("ground-turf").source[0];
  const glTexture = source?.glTexture;
  const renderer = scene.game.renderer;
  if (!glTexture || !("gl" in renderer) || !renderer.gl) return;
  const gl = renderer.gl;
  glTexture.update(
    glTexture.pixels ?? undefined,
    glTexture.width,
    glTexture.height,
    glTexture.flipY,
    glTexture.wrapS,
    glTexture.wrapT,
    gl.LINEAR_MIPMAP_LINEAR,
    gl.LINEAR,
    glTexture.format,
  );
}

function paintGround(camera: Camera, turf: MeshSlot, dirt: MeshSlot, area: Rect) {
  clearSlot(turf);
  clearSlot(dirt);
  const col0 = Math.floor(area.x / GROUND_CELL);
  const col1 = Math.ceil((area.x + area.width) / GROUND_CELL);
  const row0 = Math.floor(area.y / GROUND_CELL);
  const row1 = Math.ceil((area.y + area.height) / GROUND_CELL);
  for (let row = row0; row < row1; row += 1) {
    for (let col = col0; col < col1; col += 1) {
      const sx = col * GROUND_CELL;
      const sy = row * GROUND_CELL;
      emitGround(camera, turf, dirt, sx, sy, sx + GROUND_CELL, sy + GROUND_CELL, 0);
    }
  }
}

function skyTopColor(scene: Phaser.Scene, width: number) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let x = 0; x < width; x += 20) {
    const pixel = scene.textures.getPixel(x, 0, "sky");
    if (!pixel) continue;
    r += pixel.red;
    g += pixel.green;
    b += pixel.blue;
    count += 1;
  }
  if (count === 0) return 0x3f4630;
  return Phaser.Display.Color.GetColor(Math.round(r / count), Math.round(g / count), Math.round(b / count));
}

function emitGround(
  camera: Camera,
  turf: MeshSlot,
  dirt: MeshSlot,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  depth: number,
) {
  const cell = unprojectCell(camera, sx0, sy0, sx1, sy1);
  const wide = sx1 - sx0 > 4 || sy1 - sy0 > 4;
  if (!cell) {
    if (wide && crossesHorizon(camera, sx0, sy0, sx1, sy1)) {
      splitGround(camera, turf, dirt, sx0, sy0, sx1, sy1, depth);
    }
    return;
  }
  const straddles = cell.corners.some((corner) => isDirt(corner.x, corner.y)) && cell.corners.some((corner) => !isDirt(corner.x, corner.y));
  if ((cell.spanM > 8 || straddles) && wide) {
    splitGround(camera, turf, dirt, sx0, sy0, sx1, sy1, depth);
    return;
  }
  const [c0, c1, c2, c3] = cell.corners;
  if (!c0 || !c1 || !c2 || !c3) return;
  const cx = (c0.x + c1.x + c2.x + c3.x) / 4;
  const cy = (c0.y + c1.y + c2.y + c3.y) / 4;
  const slot = isDirt(cx, cy) ? dirt : turf;
  const uv0 = groundUv(c0.x, c0.y);
  const uv1 = groundUv(c1.x, c1.y);
  const uv2 = groundUv(c2.x, c2.y);
  const uv3 = groundUv(c3.x, c3.y);
  const i0 = pushVert(slot, sx0, sy0, uv0.u, uv0.v);
  const i1 = pushVert(slot, sx1, sy0, uv1.u, uv1.v);
  const i2 = pushVert(slot, sx0, sy1, uv2.u, uv2.v);
  const i3 = pushVert(slot, sx1, sy1, uv3.u, uv3.v);
  pushTri(slot, i0, i2, i1);
  pushTri(slot, i2, i3, i1);
}

function paintVertical(
  slot: MeshSlot,
  points: Vec2[],
  closed: boolean,
  image: StripImage,
  zScale: number,
  camera: Camera,
  face: "outward" | "inward" | null,
) {
  const above = (image.contact / image.pxPerM) * zScale * LOGICAL_PER_METER;
  const below = ((image.height - image.contact) / image.pxPerM) * zScale * LOGICAL_PER_METER;
  const count = points.length;
  const segments = closed ? count : Math.max(0, count - 1);
  let traveled = 0;
  for (let index = 0; index < segments; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % count];
    if (!from || !to) continue;
    const lengthM = Math.hypot(to.x - from.x, to.y - from.y) / LOGICAL_PER_METER;
    emitVertical(slot, camera, from, to, traveled / image.periodM, (traveled + lengthM) / image.periodM, above, below, face);
    traveled += lengthM;
  }
}

function emitVertical(
  slot: MeshSlot,
  camera: Camera,
  from: Vec2,
  to: Vec2,
  u0: number,
  u1: number,
  above: number,
  below: number,
  face: "outward" | "inward" | null,
) {
  if (u1 > u0 + 1e-4 && Math.floor(u0 + 1e-4) !== Math.floor(Math.max(u0, u1 - 1e-4))) {
    const boundary = Math.floor(u0) + 1;
    const span = u1 - u0;
    const t = span === 0 ? 1 : (boundary - u0) / span;
    if (t > 0.002 && t < 0.998) {
      const mid = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      emitVertical(slot, camera, from, mid, u0, boundary, above, below, face);
      emitVertical(slot, camera, mid, to, boundary, u1, above, below, face);
      return;
    }
  }
  if (face && !propStripAccepted(camera, from, to, above, below, face)) return;
  const base = Math.floor(u0);
  const bl = projectHeight(from.x, from.y, -below, camera);
  const tl = projectHeight(from.x, from.y, above, camera);
  const br = projectHeight(to.x, to.y, -below, camera);
  const tr = projectHeight(to.x, to.y, above, camera);
  if (!bl.visible || !tl.visible || !br.visible || !tr.visible) return;
  const i0 = pushVert(slot, tl.x, tl.y, u0 - base, 0);
  const i1 = pushVert(slot, bl.x, bl.y, u0 - base, 1);
  const i2 = pushVert(slot, tr.x, tr.y, u1 - base, 0);
  const i3 = pushVert(slot, br.x, br.y, u1 - base, 1);
  pushTri(slot, i0, i1, i2);
  pushTri(slot, i1, i3, i2);
}

function paintStartLine(graphics: Phaser.GameObjects.Graphics, camera: Camera) {
  graphics.clear();
  const box = startLineQuad();
  const nearL = projectHeight(box.x0, box.y0, 0, camera);
  const nearR = projectHeight(box.x1, box.y0, 0, camera);
  const farR = projectHeight(box.x1, box.y1, 0, camera);
  const farL = projectHeight(box.x0, box.y1, 0, camera);
  if (!nearL.visible || !nearR.visible || !farR.visible || !farL.visible) return;
  graphics.fillStyle(0xfff6d0, 0.95);
  graphics.fillTriangle(nearL.x, nearL.y, nearR.x, nearR.y, farR.x, farR.y);
  graphics.fillTriangle(nearL.x, nearL.y, farR.x, farR.y, farL.x, farL.y);
}

function paintChecker(slot: MeshSlot, camera: Camera, show: boolean) {
  clearSlot(slot);
  if (!show) return;
  const box = finishCheckerQuad();
  const rows = 10;
  for (let index = 0; index < rows; index += 1) {
    const y0 = box.y0 + ((box.y1 - box.y0) * index) / rows;
    const y1 = box.y0 + ((box.y1 - box.y0) * (index + 1)) / rows;
    const v0 = (y0 - box.y0) / LOGICAL_PER_METER / 0.9;
    const v1 = (y1 - box.y0) / LOGICAL_PER_METER / 0.9;
    emitCheckerRow(slot, camera, box.x0, box.x1, y0, y1, v0, v1);
  }
}

function emitCheckerRow(
  slot: MeshSlot,
  camera: Camera,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  v0: number,
  v1: number,
) {
  if (v1 > v0 + 1e-4 && Math.floor(v0 + 1e-4) !== Math.floor(Math.max(v0, v1 - 1e-4))) {
    const boundary = Math.floor(v0) + 1;
    const t = (boundary - v0) / (v1 - v0);
    if (t > 0.002 && t < 0.998) {
      const mid = y0 + (y1 - y0) * t;
      emitCheckerRow(slot, camera, x0, x1, y0, mid, v0, boundary);
      emitCheckerRow(slot, camera, x0, x1, mid, y1, boundary, v1);
      return;
    }
  }
  const bl = projectHeight(x0, y0, 0, camera);
  const br = projectHeight(x1, y0, 0, camera);
  const tl = projectHeight(x0, y1, 0, camera);
  const tr = projectHeight(x1, y1, 0, camera);
  if (!bl.visible || !br.visible || !tl.visible || !tr.visible) return;
  const base = Math.floor(v0);
  const i0 = pushVert(slot, tl.x, tl.y, 0, v1 - base);
  const i1 = pushVert(slot, bl.x, bl.y, 0, v0 - base);
  const i2 = pushVert(slot, tr.x, tr.y, 1, v1 - base);
  const i3 = pushVert(slot, br.x, br.y, 1, v0 - base);
  pushTri(slot, i0, i1, i2);
  pushTri(slot, i1, i3, i2);
}

function placeProp(image: Phaser.GameObjects.Image, x: number, y: number, camera: Camera, pxPerM: number, area: Rect) {
  const heightLu = (image.height / pxPerM) * LOGICAL_PER_METER;
  const pose = projectHeight(x, y, 0, camera);
  const onScreen =
    propSpriteAccepted(camera, x, y, heightLu) &&
    pose.x > area.x - 240 &&
    pose.x < area.x + area.width + 240 &&
    pose.y > area.y - 420 &&
    pose.y < area.y + area.height + 80;
  image.setVisible(onScreen);
  if (!onScreen) return;
  image.setPosition(pose.x, pose.y);
  image.setScale(propSpriteScale(pose.scale, pxPerM));
}

function makeMesh(scene: Phaser.Scene, key: string, depth: number): MeshSlot {
  const verts: number[] = [];
  const indices: number[] = [];
  const mesh = scene.add.mesh2d(0, 0, key, verts, indices);
  mesh.setRenderAsTriangles(true);
  mesh.setDepth(depth);
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
