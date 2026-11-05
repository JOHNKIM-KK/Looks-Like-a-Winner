import { describe, expect, test } from "vitest";
import { groundAt, makeGroundSampler } from "./cameraFrame";
import { paintGround, type GroundSlot } from "./groundMesh";
import { nearRailRadius } from "./artScale";
import { REFERENCE } from "./stage";
import type { Camera } from "./track";
import { groundUv, isDirt, unprojectCell } from "./trackArt";

const CELL = 48;

/** The ground pass as it was before the shared-corner rewrite: four `groundAt` calls per cell. */
function referenceGround(camera: Camera, turf: GroundSlot, dirt: GroundSlot, area: { x: number; y: number; width: number; height: number }) {
  const push = (slot: GroundSlot, x: number, y: number, u: number, v: number) => {
    slot.verts.push(x, y, u, v);
    return slot.verts.length / 4 - 1;
  };
  const tri = (slot: GroundSlot, a: number, b: number, c: number) => slot.indices.push(a, b, c, 0);
  const emit = (sx0: number, sy0: number, sx1: number, sy1: number): void => {
    const split = () => {
      const mx = (sx0 + sx1) / 2;
      const my = (sy0 + sy1) / 2;
      emit(sx0, sy0, mx, my);
      emit(mx, sy0, sx1, my);
      emit(sx0, my, mx, sy1);
      emit(mx, my, sx1, sy1);
    };
    const cell = unprojectCell(camera, sx0, sy0, sx1, sy1);
    const wide = sx1 - sx0 > 4 || sy1 - sy0 > 4;
    if (!cell) {
      const hits = [
        groundAt(camera, sx0, sy0),
        groundAt(camera, sx1, sy0),
        groundAt(camera, sx0, sy1),
        groundAt(camera, sx1, sy1),
      ].filter((corner) => corner.ok).length;
      if (wide && hits > 0 && hits < 4) split();
      return;
    }
    const straddles = cell.corners.some((c) => isDirt(c.x, c.y)) && cell.corners.some((c) => !isDirt(c.x, c.y));
    if ((cell.spanM > 8 || straddles) && wide) {
      split();
      return;
    }
    const [c0, c1, c2, c3] = cell.corners as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    const slot = isDirt((c0.x + c1.x + c2.x + c3.x) / 4, (c0.y + c1.y + c2.y + c3.y) / 4) ? dirt : turf;
    const uv = [c0, c1, c2, c3].map((c) => groundUv(c.x, c.y));
    const i0 = push(slot, sx0, sy0, uv[0]!.u, uv[0]!.v);
    const i1 = push(slot, sx1, sy0, uv[1]!.u, uv[1]!.v);
    const i2 = push(slot, sx0, sy1, uv[2]!.u, uv[2]!.v);
    const i3 = push(slot, sx1, sy1, uv[3]!.u, uv[3]!.v);
    tri(slot, i0, i2, i1);
    tri(slot, i2, i3, i1);
  };
  for (let row = Math.floor(area.y / CELL); row < Math.ceil((area.y + area.height) / CELL); row += 1) {
    for (let col = Math.floor(area.x / CELL); col < Math.ceil((area.x + area.width) / CELL); col += 1) {
      emit(col * CELL, row * CELL, col * CELL + CELL, row * CELL + CELL);
    }
  }
}

const slot = (): GroundSlot => ({ verts: [], indices: [] });
const area = { x: -80, y: -60, width: REFERENCE.width + 160, height: REFERENCE.height + 120 };

const cameras: Camera[] = [
  { groundX: 0, groundY: nearRailRadius() - 300, height: 400, pitch: 0.2, yaw: 0, focalLength: 1000 },
  { groundX: -3000, groundY: 0, height: 1200, pitch: 0.45, yaw: 0.7, focalLength: 825 },
  { groundX: 9000, groundY: 2500, height: 900, pitch: 0.3, yaw: 2.4, focalLength: 1100 },
  { groundX: -6000, groundY: -4000, height: 3500, pitch: 1.1, yaw: -1.2, focalLength: 700 },
  { groundX: 1200, groundY: 800, height: 250, pitch: 0.05, yaw: 3.0, focalLength: 1500 },
  { groundX: 0, groundY: 0, height: 500, pitch: 0.2, yaw: 0, focalLength: 1500 },
];

describe("ground mesh", () => {
  test.each(cameras.map((camera, index) => [index, camera] as const))("camera %i builds the same mesh as the per-cell version", (_index, camera) => {
    const now = { turf: slot(), dirt: slot() };
    const was = { turf: slot(), dirt: slot() };
    paintGround(camera, now.turf, now.dirt, area, CELL);
    referenceGround(camera, was.turf, was.dirt, area);

    for (const kind of ["turf", "dirt"] as const) {
      expect(now[kind].indices).toEqual(was[kind].indices);
      expect(now[kind].verts).toEqual(was[kind].verts);
    }
    expect(now.turf.indices.length + now.dirt.indices.length).toBeGreaterThan(0);
  });

  test("a second frame does not keep anything from the first", () => {
    const turf = slot();
    const dirt = slot();
    paintGround(cameras[1]!, turf, dirt, area, CELL);
    paintGround(cameras[0]!, turf, dirt, area, CELL);
    const fresh = { turf: slot(), dirt: slot() };
    paintGround(cameras[0]!, fresh.turf, fresh.dirt, area, CELL);
    expect(turf).toEqual(fresh.turf);
    expect(dirt).toEqual(fresh.dirt);
  });
});

describe("ground sampler", () => {
  test("matches groundAt", () => {
    for (const camera of cameras) {
      const sample = makeGroundSampler(camera);
      const out = { x: 0, y: 0, ok: false };
      for (let sy = -40; sy <= REFERENCE.height + 40; sy += 37) {
        for (let sx = -40; sx <= REFERENCE.width + 40; sx += 91) {
          sample(sx, sy, out);
          const expected = groundAt(camera, sx, sy);
          expect(out.ok).toBe(expected.ok);
          if (expected.ok) {
            expect(out.x).toBe(expected.x);
            expect(out.y).toBe(expected.y);
          }
        }
      }
    }
  });
});
