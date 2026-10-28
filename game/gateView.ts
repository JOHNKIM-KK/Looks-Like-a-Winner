import Phaser from "phaser";
import {
  cameraOnGateExitSide,
  frontQuadCorners,
  gateArtStallGround,
  gateArtView,
  gateTopAnchorWorld,
  placeAnchoredStrip,
  topGateSheet,
} from "./gateArt";
import { projectHeight } from "./trackArt";
import type { Camera } from "./track";

/** In front of the horses, behind the near rail. Holes in the art stay transparent. */
const GATE_DEPTH = 2000;

type MeshSlot = {
  mesh: Phaser.GameObjects.Mesh2D;
  verts: number[];
  indices: number[];
};

export type GateArt = {
  paint: (camera: Camera, visible: boolean) => void;
};

export function createGateArt(scene: Phaser.Scene): GateArt {
  const front = makeMesh(scene, "gate-front", GATE_DEPTH);
  const top = scene.add.image(0, 0, "gate-top").setDepth(GATE_DEPTH).setVisible(false);
  const sheet = topGateSheet();

  function paint(camera: Camera, visible: boolean) {
    clearSlot(front);
    top.setVisible(false);
    if (!visible) return;
    const elevationDeg = (camera.pitch * 180) / Math.PI;
    if (gateArtView(elevationDeg) === "front") {
      if (!cameraOnGateExitSide(camera.groundX)) return;
      paintFront(front, camera);
      return;
    }
    const anchorWorld = gateTopAnchorWorld();
    const anchor = projectHeight(anchorWorld.x, anchorWorld.y, anchorWorld.z, camera);
    const stalls = sheet.stallPx.map((_, index) => {
      const ground = gateArtStallGround(index);
      return projectHeight(ground.x, ground.y, ground.z, camera);
    });
    const placed = placeAnchoredStrip({
      imageWidth: sheet.width,
      imageHeight: sheet.height,
      anchorPx: sheet.anchorPx,
      stallPx: sheet.stallPx,
      anchor,
      stalls,
    });
    if (!placed.visible) return;
    top
      .setVisible(true)
      .setOrigin(placed.originX, placed.originY)
      .setPosition(placed.x, placed.y)
      .setScale(placed.scale)
      .setRotation(placed.rotation)
      .setDepth(GATE_DEPTH);
  }

  return { paint };
}

function paintFront(slot: MeshSlot, camera: Camera) {
  const projected = frontQuadCorners().map((corner) => ({
    ...corner,
    pose: projectHeight(corner.world.x, corner.world.y, corner.world.z, camera),
  }));
  if (projected.some((corner) => !corner.pose.visible)) return;
  const tl = projected[0];
  const bl = projected[1];
  const tr = projected[2];
  const br = projected[3];
  if (!tl || !bl || !tr || !br) return;
  const i0 = pushVert(slot, tl.pose.x, tl.pose.y, tl.u, tl.v);
  const i1 = pushVert(slot, bl.pose.x, bl.pose.y, bl.u, bl.v);
  const i2 = pushVert(slot, tr.pose.x, tr.pose.y, tr.u, tr.v);
  const i3 = pushVert(slot, br.pose.x, br.pose.y, br.u, br.v);
  pushTri(slot, i0, i1, i2);
  pushTri(slot, i1, i3, i2);
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
