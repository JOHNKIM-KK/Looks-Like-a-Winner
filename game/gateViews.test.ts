import { describe, expect, test } from "vitest";
import startStalls from "../public/gate/start/stalls.json";
import { GATE_VIEWS, GATE_X, gatePlanePoint, type GateView } from "./gateViews";
import { ENGINE_PX_PER_M, laneRadius, projectWithCamera, type Camera } from "./track";

const DOOR_TOP_M = 1.749;
const VIEWS = Object.keys(GATE_VIEWS) as GateView[];

function project(x: number, y: number, z: number, camera: Camera) {
  return projectWithCamera({ x, y, z, tx: 0, ty: 0 }, camera);
}

function distance(point: { x: number; y: number }, pixel: number[]) {
  return Math.hypot(point.x - pixel[0]!, point.y - pixel[1]!);
}

describe.each(VIEWS)("%s gate camera", (view) => {
  const { camera, stalls, box, feet } = GATE_VIEWS[view];

  test("lands every stall door where the pre-rendered asset drew it", () => {
    for (const stall of stalls) {
      const y = laneRadius(stall.lane);
      expect(distance(project(GATE_X, y, 0, camera), stall.doorBottom)).toBeLessThan(1);
      expect(distance(project(GATE_X, y, DOOR_TOP_M * ENGINE_PX_PER_M, camera), stall.doorTop)).toBeLessThan(1);
    }
  });

  test("gate plane points project back onto the asset pixels they came from", () => {
    for (const [sx, sy] of [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height],
    ] as const) {
      const point = gatePlanePoint(camera, sx, sy);
      const pose = project(point.x, point.y, point.z, camera);
      expect(pose.x).toBeCloseTo(sx, 2);
      expect(pose.y).toBeCloseTo(sy, 2);
    }
  });

  test("stands each horse on its stall's horseFoot pixel", () => {
    for (const stall of stalls) {
      const foot = feet.get(stall.lane)!;
      expect(distance(project(foot.x, foot.y, 0, camera), stall.horseFoot)).toBeLessThan(1);
    }
  });
});

describe("start gate view", () => {
  test("running forward along the chute leaves each stall along its exitDir", () => {
    const { camera } = GATE_VIEWS.start;
    for (const stall of startStalls.stalls) {
      const y = laneRadius(stall.lane);
      const door = project(GATE_X, y, 0, camera);
      const ahead = project(GATE_X + ENGINE_PX_PER_M, y, 0, camera);
      const dx = ahead.x - door.x;
      const dy = ahead.y - door.y;
      const length = Math.hypot(dx, dy);
      expect((dx * stall.exitDir[0]! + dy * stall.exitDir[1]!) / length).toBeGreaterThan(0.999);
      expect(Math.abs(length - stall.exitPxPerM)).toBeLessThan(1);
    }
  });

  test("draws doors from stall 12 to stall 1 so open leaves overlap toward the camera", () => {
    for (const layers of Object.values(GATE_VIEWS.start.doors)) {
      expect(layers.map((layer) => layer.file.match(/lane(\d+)/)![1])).toEqual(
        ["12", "11", "10", "09", "08", "07", "06", "05", "04", "03", "02", "01"],
      );
    }
  });
});
