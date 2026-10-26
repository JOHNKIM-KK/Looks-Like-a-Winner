import { describe, expect, test } from "vitest";
import { simulateRace, progressAt } from "../lib/race";
import { mockHorses } from "../lib/mockHorses";
import { getCameraForState } from "../game/cameraState";
import { goalLineLogical, projectWithCamera, renderLane, trackPoint } from "../game/track";

const GAME_W = 540;
const GAME_H = 1170;
const HORSE_H = 96;
const SEEDS = [1, 7, 42, 99, 256, 512, 777, 2024];

function inside(point: { x: number; y: number; visible: boolean }) {
  return point.visible && point.x >= 0 && point.x <= GAME_W && point.y >= 0 && point.y <= GAME_H;
}

describe("finish goal", () => {
  test("FINISH goal line at t=36 has an endpoint inside the 540x1170 view", () => {
    for (const seed of SEEDS) {
      const race = simulateRace(mockHorses, seed);
      const points = race.horses.map((horse) => {
        const progress = progressAt(horse.samples, 36);
        return trackPoint(progress, renderLane(horse.number, progress, race.seed));
      });
      const packCenterX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const packCenterY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const camera = getCameraForState(
        { name: "FINISH" },
        { raceTime: 36, started: true, gateOpen: 1, leadProgress: 0.95, horses: [] },
        packCenterX,
        packCenterY,
      );
      expect(camera.pitch, `elevation ${camera.pitch} exceeds 25 degrees`).toBeLessThanOrEqual((25 * Math.PI) / 180 + 1e-6);

      const inner = projectWithCamera({ ...goalLineLogical(1), tx: 0, ty: 0 }, camera);
      const outer = projectWithCamera({ ...goalLineLogical(race.horses.length), tx: 0, ty: 0 }, camera);
      const heights = points
        .map((point) => projectWithCamera({ ...point, tx: 0, ty: 0 }, camera))
        .filter((pose) => pose.visible && pose.x >= 0 && pose.x <= GAME_W && pose.y >= 0 && pose.y <= GAME_H)
        .map((pose) => HORSE_H * pose.scale)
        .sort((a, b) => a - b);
      const median = heights.length === 0 ? 0 : heights[Math.floor((heights.length - 1) / 2)];

      console.log(
        `seed ${seed} inner (${inner.x.toFixed(1)}, ${inner.y.toFixed(1)} vis=${inner.visible}) outer (${outer.x.toFixed(1)}, ${outer.y.toFixed(1)} vis=${outer.visible}) median=${median.toFixed(1)} n=${heights.length}`,
      );
      expect(
        inside(inner) || inside(outer),
        `seed ${seed} goal outside view: inner (${inner.x.toFixed(1)}, ${inner.y.toFixed(1)}) outer (${outer.x.toFixed(1)}, ${outer.y.toFixed(1)})`,
      ).toBe(true);
      expect(median, `seed ${seed} median horse height ${median.toFixed(1)}px`).toBeGreaterThanOrEqual(110);
    }
  });
});
