import { LOGICAL_PER_METER, nearRailRadius } from "./artScale";
import { STRAIGHT, type Camera } from "./track";
import { cameraSpaceDepth, projectHeight, propSpriteAccepted, type Vec2 } from "./trackArt";

/** Where a structure stands: beside a straight (+y home, -y back) or around a bend (east +x, west -x, angle CCW from +x). */
export type SceneryAnchor = { side: "home" | "back"; alongM: number } | { bend: "east" | "west"; angleDeg: number };

export type SceneryStructure = {
  kind: "stand" | "building";
  at: SceneryAnchor;
  /** Gap from the outermost rail to the structure's front face. */
  outM: number;
  widthM: number;
  depthM: number;
  heightM: number;
};

/** Scene 01 layout: small roofed stands around the bends and the gate, flat-roofed buildings behind the back straight. */
export const SCENERY: readonly SceneryStructure[] = [
  { kind: "stand", at: { bend: "east", angleDeg: 55 }, outM: 16, widthM: 11, depthM: 5, heightM: 4.6 },
  { kind: "stand", at: { bend: "east", angleDeg: 25 }, outM: 18, widthM: 11, depthM: 5, heightM: 4.6 },
  { kind: "stand", at: { bend: "east", angleDeg: -25 }, outM: 20, widthM: 12, depthM: 5, heightM: 4.6 },
  { kind: "stand", at: { bend: "west", angleDeg: 145 }, outM: 18, widthM: 10, depthM: 5, heightM: 4.6 },
  { kind: "stand", at: { bend: "west", angleDeg: 215 }, outM: 16, widthM: 8, depthM: 5, heightM: 5.2 },
  { kind: "building", at: { side: "back", alongM: 22 }, outM: 26, widthM: 18, depthM: 11, heightM: 5.5 },
  { kind: "building", at: { side: "back", alongM: 0 }, outM: 26, widthM: 18, depthM: 11, heightM: 5.5 },
  { kind: "building", at: { side: "back", alongM: -22 }, outM: 26, widthM: 18, depthM: 11, heightM: 5.5 },
];

type Box = { center: Vec2; along: Vec2; outward: Vec2; width: number; depth: number; z0: number; z1: number; color: number };

/** `distance` is ground distance from the camera in logical units, for the haze. */
export type SceneryFace = { points: Array<{ x: number; y: number }>; color: number; depth: number; distance: number };

const ROOF = 0xe6dccb;
const WALL = 0xd6c8b1;
const SEATS = 0x9a826b;
const POST = 0xd8ccb8;
/** Sun low on the left of the sky strip, so faces turned that way catch more light. */
const SUN: Vec2 = { x: 0.8, y: 0.6 };

function placement(at: SceneryAnchor, gapLu: number): { base: Vec2; outward: Vec2 } {
  const rail = nearRailRadius();
  if ("side" in at) {
    const sign = at.side === "home" ? 1 : -1;
    return { base: { x: at.alongM * LOGICAL_PER_METER, y: sign * (rail + gapLu) }, outward: { x: 0, y: sign } };
  }
  const cx = (at.bend === "east" ? 1 : -1) * (STRAIGHT / 2);
  const angle = (at.angleDeg * Math.PI) / 180;
  const outward = { x: Math.cos(angle), y: Math.sin(angle) };
  return { base: { x: cx + outward.x * (rail + gapLu), y: outward.y * (rail + gapLu) }, outward };
}

/** Each structure as boxes in logical units, front face toward the track. */
export function sceneryBoxes(structures: readonly SceneryStructure[] = SCENERY): Box[] {
  const m = LOGICAL_PER_METER;
  const boxes: Box[] = [];
  for (const item of structures) {
    const { base, outward } = placement(item.at, item.outM * m);
    const along = { x: -outward.y, y: outward.x };
    const at = (forwardM: number) => ({ x: base.x + outward.x * forwardM * m, y: base.y + outward.y * forwardM * m });
    const box = (offsetM: number, widthM: number, depthM: number, z0: number, z1: number, color: number) =>
      boxes.push({ center: at(offsetM), along, outward, width: widthM * m, depth: depthM * m, z0: z0 * m, z1: z1 * m, color });
    if (item.kind === "building") {
      box(item.depthM / 2, item.widthM, item.depthM, 0, item.heightM - 0.5, WALL);
      box(item.depthM / 2, item.widthM + 1.2, item.depthM + 1.2, item.heightM - 0.5, item.heightM, ROOF);
      continue;
    }
    const roofBottom = item.heightM - 0.4;
    box(item.depthM / 2, item.widthM, item.depthM, 0, 2.4, SEATS);
    box(item.depthM / 2 - 0.6, item.widthM + 1, item.depthM + 1.6, roofBottom, item.heightM, ROOF);
    for (const side of [-1, 1]) {
      const post = at(0.2);
      boxes.push({
        center: { x: post.x + along.x * side * (item.widthM / 2 - 0.3) * m, y: post.y + along.y * side * (item.widthM / 2 - 0.3) * m },
        along,
        outward,
        width: 0.3 * m,
        depth: 0.3 * m,
        z0: 2.4 * m,
        z1: roofBottom * m,
        color: POST,
      });
    }
  }
  return boxes;
}

function shade(color: number, factor: number) {
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((color >> shift) & 0xff) * factor)));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * Visible faces of every structure, far first, in screen units.
 * A structure is skipped whole when the camera stands between it and the track
 * or when any corner fails the prop cull, so it never covers the race.
 */
export function sceneryFaces(camera: Camera, boxes: readonly Box[] = sceneryBoxes()): SceneryFace[] {
  const faces: SceneryFace[] = [];
  for (const box of boxes) {
    const toCamera = { x: camera.groundX - box.center.x, y: camera.groundY - box.center.y };
    if (toCamera.x * box.outward.x + toCamera.y * box.outward.y > 0) continue;
    const hw = box.width / 2;
    const hd = box.depth / 2;
    const ground = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ].map(([a, d]) => ({
      x: box.center.x + box.along.x * a! + box.outward.x * d!,
      y: box.center.y + box.along.y * a! + box.outward.y * d!,
    }));
    const height = box.z1;
    if (!ground.every((point) => propSpriteAccepted(camera, point.x, point.y, height))) continue;
    const low = ground.map((point) => projectHeight(point.x, point.y, box.z0, camera));
    const high = ground.map((point) => projectHeight(point.x, point.y, box.z1, camera));
    if (![...low, ...high].every((pose) => pose.visible)) continue;
    const depth = cameraSpaceDepth(camera, box.center.x, box.center.y, (box.z0 + box.z1) / 2);
    const distance = Math.hypot(toCamera.x, toCamera.y);
    for (let index = 0; index < 4; index += 1) {
      const next = (index + 1) % 4;
      const a = ground[index]!;
      const b = ground[next]!;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const normal = { x: mid.x - box.center.x, y: mid.y - box.center.y };
      const length = Math.hypot(normal.x, normal.y) || 1;
      const facing = (camera.groundX - mid.x) * normal.x + (camera.groundY - mid.y) * normal.y;
      if (facing <= 0) continue;
      const light = 0.78 + 0.22 * ((normal.x * SUN.x + normal.y * SUN.y) / length);
      faces.push({
        points: [low[index]!, low[next]!, high[next]!, high[index]!].map(({ x, y }) => ({ x, y })),
        color: shade(box.color, light),
        depth,
        distance,
      });
    }
    if (camera.height > box.z1) {
      faces.push({ points: high.map(({ x, y }) => ({ x, y })), color: shade(box.color, 1.04), depth: depth - 0.01, distance });
    }
  }
  return faces.sort((a, b) => b.depth - a.depth);
}
