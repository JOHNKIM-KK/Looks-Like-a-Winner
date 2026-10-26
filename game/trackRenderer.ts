import Phaser from "phaser";
import {
  GROUND_PX_PER_M,
  STRIP_HEIGHT_SCALE,
  LOGICAL_PER_METER,
  RAIL_SEGMENT_M,
  STRIP_PERIOD_M,
  distancePostProgresses,
  propSpriteScale,
} from "./artScale";
import { GAME_HEIGHT, GAME_WIDTH } from "./cameraFrame";
import { STRAIGHT, finishGoalX, presentationOnRadius, type Camera } from "./track";
import {
  cameraForward,
  chutePolyline,
  farRailRadius,
  finishCheckerQuad,
  groundUv,
  isDirt,
  nearRailRadius,
  homeOuterStandLine,
  offsetAlong,
  ovalPolyline,
  projectHeight,
  treesOffsetM,
  unprojectCell,
  type Vec2,
} from "./trackArt";

const DEPTH = {
  /** Behind the ground, so a strip cannot float over the infield. */
  stands: 20,
  trees: 22,
  cornerTree: 25,
  turf: 30,
  dirt: 31,
  checker: 35,
  farRail: 40,
  props: 55,
  nearRail: 3500,
} as const;

const RAIL_IMAGE = { width: 400, height: 125, contact: 124, pxPerM: 100, periodM: RAIL_SEGMENT_M };
const STANDS_IMAGE = { width: 600, height: 520, contact: 519, pxPerM: 50, periodM: STRIP_PERIOD_M };
const TREES_IMAGE = { width: 600, height: 460, contact: 459, pxPerM: 50, periodM: STRIP_PERIOD_M };

export type TrackView = {
  showStands: boolean;
  standHeightScale: number;
  showFinish: boolean;
  showCornerTree: boolean;
};

export function trackViewFor(stateName: string, leadProgress: number, cornerEnd: number): TrackView {
  const corner = stateName === "CORNER_IN" || stateName === "CORNER_OUT";
  const home = stateName === "FINISH" || (stateName === "STRAIGHT" && leadProgress >= cornerEnd);
  return {
    showStands: !corner,
    standHeightScale: STRIP_HEIGHT_SCALE,
    showFinish: stateName === "FINISH" || home,
    showCornerTree: corner,
  };
}

type MeshSlot = {
  mesh: Phaser.GameObjects.Mesh2D;
  verts: number[];
  indices: number[];
};

type StripImage = { height: number; contact: number; pxPerM: number; periodM: number };

export function createTrackRenderer(scene: Phaser.Scene) {
  scene.textures.get("ground-turf").setWrap(Phaser.Textures.WrapMode.REPEAT, Phaser.Textures.WrapMode.REPEAT);
  scene.textures.get("ground-dirt").setWrap(Phaser.Textures.WrapMode.REPEAT, Phaser.Textures.WrapMode.REPEAT);

  const turf = makeMesh(scene, "ground-turf", DEPTH.turf);
  const dirt = makeMesh(scene, "ground-dirt", DEPTH.dirt);
  const farRail = makeMesh(scene, "rail-segment", DEPTH.farRail);
  const nearRail = makeMesh(scene, "rail-segment", DEPTH.nearRail);
  const stands = makeMesh(scene, "stands-strip", DEPTH.stands);
  stands.mesh.setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
  const standLine = homeOuterStandLine();
  const trees = makeMesh(scene, "trees-strip", DEPTH.trees);
  const checker = makeMesh(scene, "finish-checker", DEPTH.checker);

  const farLoop = ovalPolyline(farRailRadius());
  const nearLoop = ovalPolyline(nearRailRadius());
  const farChute = chutePolyline(farRailRadius());
  const nearChute = chutePolyline(nearRailRadius());
  const postProgress = distancePostProgresses();
  const posts = postProgress.map(() =>
    scene.add.image(0, 0, "prop-distance").setOrigin(0.5, 1).setDepth(DEPTH.props).setVisible(false),
  );
  const finishPost = scene.add.image(0, 0, "prop-finish").setOrigin(0.5, 1).setDepth(DEPTH.props).setVisible(false);
  const cornerTree = scene.add.image(0, 0, "prop-tree").setOrigin(0.5, 1).setDepth(DEPTH.cornerTree).setVisible(false);

  function paint(camera: Camera, view: TrackView) {
    paintGround(camera, turf, dirt);
    clearSlot(farRail);
    clearSlot(nearRail);
    paintVertical(farRail, farLoop, true, RAIL_IMAGE, 1, camera);
    paintVertical(farRail, farChute, false, RAIL_IMAGE, 1, camera);
    paintVertical(nearRail, nearLoop, true, RAIL_IMAGE, 1, camera);
    paintVertical(nearRail, nearChute, false, RAIL_IMAGE, 1, camera);

    const forward = cameraForward(camera);
    clearSlot(trees);
    clearSlot(stands);
    paintVertical(trees, offsetAlong(farLoop, forward, treesOffsetM()), true, TREES_IMAGE, STRIP_HEIGHT_SCALE, camera);
    if (view.showStands) {
      paintVertical(stands, standLine, false, STANDS_IMAGE, view.standHeightScale, camera);
    }
    paintChecker(checker, camera, view.showFinish);
    paintProps(camera, view);
  }

  function paintProps(camera: Camera, view: TrackView) {
    postProgress.forEach((progress, index) => {
      const image = posts[index];
      if (!image) return;
      const point = presentationOnRadius(progress, farRailRadius());
      placeProp(image, point.x, point.y, camera, GROUND_PX_PER_M);
    });
    if (view.showFinish) {
      const y = farRailRadius() - 1.6 * LOGICAL_PER_METER;
      placeProp(finishPost, finishGoalX(), y, camera, GROUND_PX_PER_M);
    } else {
      finishPost.setVisible(false);
    }
    if (view.showCornerTree) {
      const far = farRailRadius();
      placeProp(cornerTree, -STRAIGHT / 2 - far * 0.55, 0, camera, GROUND_PX_PER_M);
    } else {
      cornerTree.setVisible(false);
    }
  }

  return { paint };
}

function paintGround(camera: Camera, turf: MeshSlot, dirt: MeshSlot) {
  clearSlot(turf);
  clearSlot(dirt);
  const cols = 18;
  const rows = 24;
  const cellW = GAME_WIDTH / cols;
  const cellH = GAME_HEIGHT / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      emitGround(camera, turf, dirt, col * cellW, row * cellH, (col + 1) * cellW, (row + 1) * cellH, 0);
    }
  }
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
  if (!cell) return;
  const straddles = cell.corners.some((corner) => isDirt(corner.x, corner.y)) && cell.corners.some((corner) => !isDirt(corner.x, corner.y));
  if ((cell.spanM > 8 || straddles) && depth < 3 && sx1 - sx0 > 4) {
    const mx = (sx0 + sx1) / 2;
    const my = (sy0 + sy1) / 2;
    emitGround(camera, turf, dirt, sx0, sy0, mx, my, depth + 1);
    emitGround(camera, turf, dirt, mx, sy0, sx1, my, depth + 1);
    emitGround(camera, turf, dirt, sx0, my, mx, sy1, depth + 1);
    emitGround(camera, turf, dirt, mx, my, sx1, sy1, depth + 1);
    return;
  }
  if (cell.spanM > 48) return;
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

function paintVertical(slot: MeshSlot, points: Vec2[], closed: boolean, image: StripImage, zScale: number, camera: Camera) {
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
    emitVertical(slot, camera, from, to, traveled / image.periodM, (traveled + lengthM) / image.periodM, above, below);
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
) {
  if (u1 > u0 + 1e-4 && Math.floor(u0 + 1e-4) !== Math.floor(Math.max(u0, u1 - 1e-4))) {
    const boundary = Math.floor(u0) + 1;
    const span = u1 - u0;
    const t = span === 0 ? 1 : (boundary - u0) / span;
    if (t > 0.002 && t < 0.998) {
      const mid = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      emitVertical(slot, camera, from, mid, u0, boundary, above, below);
      emitVertical(slot, camera, mid, to, boundary, u1, above, below);
      return;
    }
  }
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

function placeProp(image: Phaser.GameObjects.Image, x: number, y: number, camera: Camera, pxPerM: number) {
  const pose = projectHeight(x, y, 0, camera);
  const onScreen = pose.visible && pose.x > -240 && pose.x < GAME_WIDTH + 240 && pose.y > -420 && pose.y < GAME_HEIGHT + 80;
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
