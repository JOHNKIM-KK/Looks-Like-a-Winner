import { makeGroundSampler } from "./cameraFrame";
import type { Rect } from "./stage";
import type { Camera } from "./track";
import { LOGICAL_PER_METER } from "./artScale";
import { groundUv, isDirt } from "./trackArt";

/** The part of a mesh slot the ground pass writes to. */
export type GroundSlot = { verts: number[]; indices: number[] };

/** A cell wider than this on the ground (in meters) is split so the texture does not smear. */
const MAX_SPAN_M = 8;
/** Cells this small on screen are not split any further. */
const MIN_SPLIT_PX = 4;
const MAX_SPAN_LOGICAL = MAX_SPAN_M * LOGICAL_PER_METER;

/**
 * One screen-space grid point, unprojected onto the ground. Neighbouring cells share their
 * corners, so each point is projected, classified and mapped to texture space once per frame.
 */
type Corner = {
  x: number;
  y: number;
  ok: boolean;
  /** The frame this corner was filled in. Older corners are stale. */
  stamp: number;
  /** -1 not asked yet, 0 turf, 1 dirt. */
  dirt: number;
  hasUv: boolean;
  u: number;
  v: number;
};

/**
 * Every corner sits on a grid of the smallest cell the pass will emit, so a corner is found by
 * its row and column. The objects live across frames and are only restamped.
 */
const grid: (Corner | undefined)[] = [];
let frameStamp = 0;

function isDirtCorner(corner: Corner) {
  if (corner.dirt < 0) corner.dirt = isDirt(corner.x, corner.y) ? 1 : 0;
  return corner.dirt === 1;
}

function pushVert(slot: GroundSlot, x: number, y: number, u: number, v: number) {
  slot.verts.push(x, y, u, v);
  return slot.verts.length / 4 - 1;
}

function pushTri(slot: GroundSlot, a: number, b: number, c: number) {
  slot.indices.push(a, b, c, 0);
}

/** Rebuild the turf and dirt ground meshes for `area` as seen through `camera`. */
export function paintGround(camera: Camera, turf: GroundSlot, dirt: GroundSlot, area: Rect, cell: number) {
  turf.verts.length = 0;
  turf.indices.length = 0;
  dirt.verts.length = 0;
  dirt.indices.length = 0;
  frameStamp += 1;

  let depth = 0;
  for (let size = cell; size > MIN_SPLIT_PX; size /= 2) depth += 1;
  const fine = cell / 2 ** depth;
  const perFine = 1 / fine;
  const col0 = Math.floor(area.x / cell);
  const col1 = Math.ceil((area.x + area.width) / cell);
  const row0 = Math.floor(area.y / cell);
  const row1 = Math.ceil((area.y + area.height) / cell);
  const originX = col0 * cell;
  const originY = row0 * cell;
  const gridW = (col1 - col0) * 2 ** depth + 1;
  const gridCount = gridW * ((row1 - row0) * 2 ** depth + 1);
  // Grow in one go so the array stays dense.
  while (grid.length < gridCount) grid.push(undefined);

  const sample = makeGroundSampler(camera);

  const corner = (sx: number, sy: number) => {
    const at = Math.round((sy - originY) * perFine) * gridW + Math.round((sx - originX) * perFine);
    let found = grid[at];
    if (!found) {
      found = { x: 0, y: 0, ok: false, stamp: 0, dirt: -1, hasUv: false, u: 0, v: 0 };
      grid[at] = found;
    }
    if (found.stamp !== frameStamp) {
      found.stamp = frameStamp;
      found.dirt = -1;
      found.hasUv = false;
      sample(sx, sy, found);
    }
    return found;
  };

  const emit = (sx0: number, sy0: number, sx1: number, sy1: number) => {
    const c0 = corner(sx0, sy0);
    const c1 = corner(sx1, sy0);
    const c2 = corner(sx0, sy1);
    const c3 = corner(sx1, sy1);
    const wide = sx1 - sx0 > MIN_SPLIT_PX || sy1 - sy0 > MIN_SPLIT_PX;

    if (!c0.ok || !c1.ok || !c2.ok || !c3.ok) {
      // Only a cell that touches both sky and ground is worth splitting toward the horizon.
      if (!wide) return;
      const hits = (c0.ok ? 1 : 0) + (c1.ok ? 1 : 0) + (c2.ok ? 1 : 0) + (c3.ok ? 1 : 0);
      if (hits > 0 && hits < 4) split(sx0, sy0, sx1, sy1);
      return;
    }

    if (wide) {
      const span = Math.sqrt(
        Math.max(
          sq(c0, c1),
          sq(c0, c2),
          sq(c0, c3),
          sq(c1, c2),
          sq(c1, c3),
          sq(c2, c3),
        ),
      );
      if (span > MAX_SPAN_LOGICAL) {
        split(sx0, sy0, sx1, sy1);
        return;
      }
      // A cell that holds both turf and dirt is split so the edge between them stays sharp.
      const d0 = isDirtCorner(c0);
      if (d0 !== isDirtCorner(c1) || d0 !== isDirtCorner(c2) || d0 !== isDirtCorner(c3)) {
        split(sx0, sy0, sx1, sy1);
        return;
      }
    }

    const cx = (c0.x + c1.x + c2.x + c3.x) / 4;
    const cy = (c0.y + c1.y + c2.y + c3.y) / 4;
    const slot = isDirt(cx, cy) ? dirt : turf;
    uvOf(c0);
    uvOf(c1);
    uvOf(c2);
    uvOf(c3);
    const i0 = pushVert(slot, sx0, sy0, c0.u, c0.v);
    const i1 = pushVert(slot, sx1, sy0, c1.u, c1.v);
    const i2 = pushVert(slot, sx0, sy1, c2.u, c2.v);
    const i3 = pushVert(slot, sx1, sy1, c3.u, c3.v);
    pushTri(slot, i0, i2, i1);
    pushTri(slot, i2, i3, i1);
  };

  const split = (sx0: number, sy0: number, sx1: number, sy1: number) => {
    const mx = (sx0 + sx1) / 2;
    const my = (sy0 + sy1) / 2;
    emit(sx0, sy0, mx, my);
    emit(mx, sy0, sx1, my);
    emit(sx0, my, mx, sy1);
    emit(mx, my, sx1, sy1);
  };

  for (let row = row0; row < row1; row += 1) {
    for (let col = col0; col < col1; col += 1) {
      const sx = col * cell;
      const sy = row * cell;
      emit(sx, sy, sx + cell, sy + cell);
    }
  }
}

function sq(a: Corner, b: Corner) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function uvOf(corner: Corner) {
  if (corner.hasUv) return;
  const uv = groundUv(corner.x, corner.y);
  corner.u = uv.u;
  corner.v = uv.v;
  corner.hasUv = true;
}
