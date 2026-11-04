import type Phaser from "phaser";
import { GATE_VIEWS, gatePlanePoint, type DoorState, type GateLayer, type GateView, type GateViewSpec } from "./gateViews";
import { projectHeight } from "./trackArt";
import { clearSlot, makeMesh, pushTri, pushVert, type MeshSlot } from "./trackRenderer";
import type { Camera } from "./track";

const COLUMNS = 24;
const ROWS = 8;
/** Above the props (55), below the horses standing in the stalls (depth = screen y). */
const BACK_DEPTH = 60;
/** Above stalled horses and the track, below horses clear of the stall (3001+) and the near rail at 3500. */
const FRONT_DEPTH = 3000;

export function preloadGatePlates(scene: Phaser.Scene) {
  for (const view of Object.keys(GATE_VIEWS) as GateView[]) {
    const { back, doors, front, sign, doorStates } = GATE_VIEWS[view];
    for (const layer of [back, ...doorStates.flatMap((state) => doors[state]), front, sign]) {
      scene.load.image(layer.key, `/gate/${view}/${layer.file}`);
    }
  }
}

function compose(scene: Phaser.Scene, key: string, layers: readonly GateLayer[], box: GateViewSpec["box"], depth: number) {
  const canvas = scene.textures.createCanvas(key, box.width, box.height);
  if (canvas) {
    const context = canvas.getContext();
    for (const layer of layers) {
      const source = scene.textures.get(layer.key).getSourceImage() as CanvasImageSource;
      context.drawImage(source, layer.x - box.x, layer.y - box.y, layer.w, layer.h);
    }
    // Image textures reach Mesh2D top row first; a flipped canvas upload would turn the gate upside down.
    canvas.source[0]?.setFlipY(false);
    canvas.refresh();
  }
  return makeMesh(scene, key, depth);
}

/** One view's gate drawn on the plane x = GATE_X: back under the horses, doors + front + sign over them. */
export function createGatePlate(scene: Phaser.Scene, view: GateView) {
  const spec = GATE_VIEWS[view];
  const { box } = spec;
  const back = compose(scene, `gate-${view}-plate-back`, [spec.back], box, BACK_DEPTH);
  const fronts = new Map<DoorState, MeshSlot>(
    spec.doorStates.map((state) => [
      state,
      compose(scene, `gate-${view}-plate-${state}`, [...spec.doors[state], spec.front, spec.sign], box, FRONT_DEPTH),
    ]),
  );
  const closed = fronts.get("closed")!;

  const grid: { x: number; y: number; z: number; u: number; v: number }[] = [];
  for (let row = 0; row <= ROWS; row += 1) {
    for (let column = 0; column <= COLUMNS; column += 1) {
      const u = column / COLUMNS;
      const v = row / ROWS;
      grid.push({ ...gatePlanePoint(spec.camera, box.x + u * box.width, box.y + v * box.height), u, v });
    }
  }

  /** Views rendered without open-door frames keep their doors shut. */
  function paint(camera: Camera, alpha: number, door: DoorState) {
    const shown = alpha > 0 ? [back, fronts.get(door) ?? closed] : [];
    for (const slot of [back, ...fronts.values()]) {
      clearSlot(slot);
      slot.mesh.setVisible(shown.includes(slot)).setAlpha(alpha);
    }
    if (shown.length === 0) return;
    const projected = grid.map((point) => projectHeight(point.x, point.y, point.z, camera));
    for (const slot of shown) {
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
  }

  return { paint };
}
