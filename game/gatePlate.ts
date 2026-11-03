import type Phaser from "phaser";
import { GATE_VIEWS, gatePlanePoint } from "./gateViews";
import { projectHeight } from "./trackArt";
import { clearSlot, makeMesh, pushTri, pushVert } from "./trackRenderer";
import type { Camera } from "./track";

const PLATE_KEY = "gate-drone-plate";
const COLUMNS = 24;
const ROWS = 8;
/** Above the horses (depth = screen y) and the track, below the near rail at 3500. */
const DEPTH = 3000;
const DRONE = GATE_VIEWS.drone;
const GATE_LAYERS = [DRONE.back, ...DRONE.doors.closed, DRONE.front, DRONE.sign];

export function preloadGatePlate(scene: Phaser.Scene) {
  for (const layer of GATE_LAYERS) scene.load.image(layer.key, `/gate/drone/${layer.file}`);
}

export function createGatePlate(scene: Phaser.Scene) {
  const box = DRONE.box;
  const canvas = scene.textures.createCanvas(PLATE_KEY, box.width, box.height);
  if (canvas) {
    const context = canvas.getContext();
    for (const layer of GATE_LAYERS) {
      const source = scene.textures.get(layer.key).getSourceImage() as CanvasImageSource;
      context.drawImage(source, layer.x - box.x, layer.y - box.y, layer.w, layer.h);
    }
    // Image textures reach Mesh2D top row first; a flipped canvas upload would turn the gate upside down.
    canvas.source[0]?.setFlipY(false);
    canvas.refresh();
  }

  const slot = makeMesh(scene, PLATE_KEY, DEPTH);
  const grid: { x: number; y: number; z: number; u: number; v: number }[] = [];
  for (let row = 0; row <= ROWS; row += 1) {
    for (let column = 0; column <= COLUMNS; column += 1) {
      const u = column / COLUMNS;
      const v = row / ROWS;
      grid.push({ ...gatePlanePoint(DRONE.camera, box.x + u * box.width, box.y + v * box.height), u, v });
    }
  }

  function paint(camera: Camera, alpha: number) {
    clearSlot(slot);
    slot.mesh.setVisible(alpha > 0).setAlpha(alpha);
    if (alpha <= 0) return;
    const projected = grid.map((point) => projectHeight(point.x, point.y, point.z, camera));
    for (const [index, point] of grid.entries()) {
      const pose = projected[index]!;
      pushVert(slot, pose.x, pose.y, point.u, point.v);
    }
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        const tl = row * (COLUMNS + 1) + column;
        const tr = tl + 1;
        const bl = tl + COLUMNS + 1;
        const br = bl + 1;
        if (![tl, tr, bl, br].every((index) => projected[index]!.visible)) continue;
        pushTri(slot, tl, bl, tr);
        pushTri(slot, bl, br, tr);
      }
    }
  }

  return { paint };
}
