import sheet from "../public/track/gate/gate.json";
import { LOGICAL_PER_METER } from "./artScale";
import { DOOR_AHEAD_M, GATE_STALLS, stallOrigin } from "./startingGate";

type Px = readonly [number, number];

function pair(value: readonly number[] | undefined): Px {
  return [value?.[0] ?? 0, value?.[1] ?? 0];
}

const front = sheet.views.front;
const top = sheet.views.top;

export const GATE_PX_PER_M = sheet.px_per_m;
export const GATE_STALL_PITCH_M = sheet.stall_pitch_m;
export const GATE_FRONT_ELEVATION_DEG = front.elevation_deg;
export const GATE_TOP_ELEVATION_DEG = top.elevation_deg;

const frontStallPx = front.stall_centers_px.map(pair);
const topStallPx = top.stall_centers_px.map(pair);
const topAnchorPx = pair(top.anchor_px);

/** Low elevation uses the head-on facade. High elevation uses the 65° sheet. */
export function gateArtView(elevationDeg: number): "front" | "top" {
  const mid = (GATE_FRONT_ELEVATION_DEG + GATE_TOP_ELEVATION_DEG) / 2;
  return elevationDeg >= mid ? "top" : "front";
}

/** Exit face of the gate, 1.1 m in front of the horses. */
export function gateFrontExitX() {
  return stallOrigin().x - DOOR_AHEAD_M * LOGICAL_PER_METER;
}

export function cameraOnGateExitSide(groundX: number) {
  return groundX < gateFrontExitX();
}

/**
 * Front sheet pixel → world. Image +x is art +y, which is game −Y (lane 1 on the left).
 * The ground line sits at z = 0. 100 px is one meter.
 */
export function frontImageToWorld(imageX: number, imageY: number) {
  const stall0 = frontStallPx[0] ?? [0, 0];
  const metersAcross = (imageX - stall0[0]) / GATE_PX_PER_M;
  const metersUp = (front.ground_line_px - imageY) / GATE_PX_PER_M;
  return {
    x: gateFrontExitX(),
    y: stallOrigin().y - metersAcross * LOGICAL_PER_METER,
    z: metersUp * LOGICAL_PER_METER,
  };
}

export function frontQuadCorners() {
  const width = front.size[0] ?? 0;
  const height = front.size[1] ?? 0;
  return [
    { u: 0, v: 0, world: frontImageToWorld(0, 0) },
    { u: 0, v: 1, world: frontImageToWorld(0, height) },
    { u: 1, v: 0, world: frontImageToWorld(width, 0) },
    { u: 1, v: 1, world: frontImageToWorld(width, height) },
  ];
}

/** Ground point at the gate center: mid-depth, midway across the painted stalls. */
export function gateTopAnchorWorld() {
  const count = topStallPx.length;
  const pitch = GATE_STALL_PITCH_M * LOGICAL_PER_METER;
  const y0 = stallOrigin().y;
  const y1 = y0 - (count - 1) * pitch;
  return {
    x: gateFrontExitX() + (sheet.depth_m / 2) * LOGICAL_PER_METER,
    y: (y0 + y1) / 2,
    z: 0,
  };
}

/** Lane ground under painted stall `index`, on the anchor's depth. */
export function gateArtStallGround(index: number) {
  const pitch = GATE_STALL_PITCH_M * LOGICAL_PER_METER;
  return {
    x: gateTopAnchorWorld().x,
    y: stallOrigin().y - index * pitch,
    z: 0,
  };
}

/** One stall cut from `gate_front` (the sheet's 4th stall). 155 px is one lane. */
export const FRONT_STALL_SLICE = { x: 545, y: 0, width: 155, height: 400 } as const;
/** Outer posts. 80 px is 0.8 m. Repeated outside stall 1 and stall 12. */
export const FRONT_END_LEFT = { x: 0, y: 0, width: 80, height: 400 } as const;
export const FRONT_END_RIGHT = { x: 1320, y: 0, width: 80, height: 400 } as const;
export const END_CAP_M = FRONT_END_LEFT.width / GATE_PX_PER_M;

/** Door leaves inside the stall slice. The posts on x 0–5 and 149–154 stay on the frame. */
export const DOOR_LEAF = {
  y: 212,
  height: 149,
  left: { x: 6, width: 68 },
  right: { x: 81, width: 68 },
} as const;

/** Baked plates say "4" on every copy. They are cleared and drawn per stall. */
export const PLATE_CLEAR = [
  { x: 36, y: 44, width: 84, height: 28 },
  { x: 36, y: 104, width: 84, height: 52 },
] as const;

export const PLATE_LOCAL = { x: 77.5, y: 128.7, width: 78, height: 42 } as const;

/** How far a leaf slides sideways, in meters, when `amount` is 1. */
export const DOOR_SLIDE_M = 0.45 * GATE_STALL_PITCH_M;
/** Leaves kick toward the camera as they open, meters. */
export const DOOR_KICK_M = 0.08;

export type GateCorner = { x: number; y: number; z: number; u: number; v: number };

/** Stall center on the exit face. Index 0 is lane 1. All read `stallOrigin()` / `GATE_ANCHOR`. */
export function moduleStallCenter(index: number) {
  const pitch = GATE_STALL_PITCH_M * LOGICAL_PER_METER;
  return {
    x: gateFrontExitX(),
    y: stallOrigin().y - index * pitch,
  };
}

/**
 * Stall-slice pixel → world. localX 0 is the image-left post (game +Y).
 * `shiftX` / `shiftY` are logical units added after the facade placement.
 */
export function stallLocalToWorld(index: number, localX: number, localY: number, shiftX = 0, shiftY = 0) {
  const center = moduleStallCenter(index);
  const metersFromCenter = (localX - FRONT_STALL_SLICE.width / 2) / GATE_PX_PER_M;
  return {
    x: center.x + shiftX,
    y: center.y - metersFromCenter * LOGICAL_PER_METER + shiftY,
    z: ((front.ground_line_px - localY) / GATE_PX_PER_M) * LOGICAL_PER_METER,
  };
}

/** End-cap pixel. localX 0 is the outer edge on the left cap and the inner edge on the right cap. */
export function endCapWorld(side: "left" | "right", localX: number, localY: number) {
  const z = ((front.ground_line_px - localY) / GATE_PX_PER_M) * LOGICAL_PER_METER;
  const x = gateFrontExitX();
  const halfStall = (FRONT_STALL_SLICE.width / 2 / GATE_PX_PER_M) * LOGICAL_PER_METER;
  if (side === "left") {
    const innerY = moduleStallCenter(0).y + halfStall;
    const metersOut = ((FRONT_END_LEFT.width - localX) / GATE_PX_PER_M) * LOGICAL_PER_METER;
    return { x, y: innerY + metersOut, z };
  }
  const innerY = moduleStallCenter(GATE_STALLS - 1).y - halfStall;
  const metersOut = (localX / GATE_PX_PER_M) * LOGICAL_PER_METER;
  return { x, y: innerY - metersOut, z };
}

function quad(
  tl: { x: number; y: number; z: number },
  bl: { x: number; y: number; z: number },
  tr: { x: number; y: number; z: number },
  br: { x: number; y: number; z: number },
): GateCorner[] {
  return [
    { ...tl, u: 0, v: 0 },
    { ...bl, u: 0, v: 1 },
    { ...tr, u: 1, v: 0 },
    { ...br, u: 1, v: 1 },
  ];
}

export function stallFrameQuad(index: number) {
  const width = FRONT_STALL_SLICE.width;
  const height = FRONT_STALL_SLICE.height;
  return quad(
    stallLocalToWorld(index, 0, 0),
    stallLocalToWorld(index, 0, height),
    stallLocalToWorld(index, width, 0),
    stallLocalToWorld(index, width, height),
  );
}

export function endCapQuad(side: "left" | "right") {
  const width = side === "left" ? FRONT_END_LEFT.width : FRONT_END_RIGHT.width;
  const height = FRONT_END_LEFT.height;
  return quad(
    endCapWorld(side, 0, 0),
    endCapWorld(side, 0, height),
    endCapWorld(side, width, 0),
    endCapWorld(side, width, height),
  );
}

export function doorLeafQuad(index: number, side: "left" | "right", amount: number) {
  const leaf = side === "left" ? DOOR_LEAF.left : DOOR_LEAF.right;
  const open = Math.max(0, amount);
  const shiftX = -DOOR_KICK_M * open * LOGICAL_PER_METER;
  const shiftY = (side === "left" ? 1 : -1) * DOOR_SLIDE_M * open * LOGICAL_PER_METER;
  const x0 = leaf.x;
  const x1 = leaf.x + leaf.width;
  const y0 = DOOR_LEAF.y;
  const y1 = DOOR_LEAF.y + DOOR_LEAF.height;
  return quad(
    stallLocalToWorld(index, x0, y0, shiftX, shiftY),
    stallLocalToWorld(index, x0, y1, shiftX, shiftY),
    stallLocalToWorld(index, x1, y0, shiftX, shiftY),
    stallLocalToWorld(index, x1, y1, shiftX, shiftY),
  );
}

export function plateQuad(index: number) {
  const x0 = PLATE_LOCAL.x - PLATE_LOCAL.width / 2;
  const y0 = PLATE_LOCAL.y - PLATE_LOCAL.height / 2;
  const kick = -0.02 * LOGICAL_PER_METER;
  return quad(
    stallLocalToWorld(index, x0, y0, kick, 0),
    stallLocalToWorld(index, x0, y0 + PLATE_LOCAL.height, kick, 0),
    stallLocalToWorld(index, x0 + PLATE_LOCAL.width, y0, kick, 0),
    stallLocalToWorld(index, x0 + PLATE_LOCAL.width, y0 + PLATE_LOCAL.height, kick, 0),
  );
}

/** Mid-depth point of an end cap, for the overhead sheet. Lane position still comes from the anchor. */
export function endCapAnchor(side: "left" | "right") {
  const stall = gateArtStallGround(side === "left" ? 0 : GATE_STALLS - 1);
  const reach = (GATE_STALL_PITCH_M / 2 + END_CAP_M / 2) * LOGICAL_PER_METER;
  const sign = side === "left" ? 1 : -1;
  return { x: stall.x, y: stall.y + sign * reach, z: stall.z };
}

export function topStallAxis() {
  const first = topStallPx[0] ?? [0, 0];
  const next = topStallPx[1] ?? [0, 0];
  return { dx: next[0] - first[0], dy: next[1] - first[1] };
}

/** Shared scale and rotation for one sliced stall repeated across the projected lanes. */
export function stallRowPose(stalls: readonly ScreenPoint[], axisDx: number, axisDy: number) {
  const first = stalls[0];
  const last = stalls[stalls.length - 1];
  if (stalls.length < 2 || !first?.visible || !last?.visible) return null;
  const imageSpan = Math.hypot(axisDx, axisDy) * (stalls.length - 1);
  const screenSpan = Math.hypot(last.x - first.x, last.y - first.y);
  if (imageSpan < 1 || screenSpan < 1) return null;
  return {
    scale: screenSpan / imageSpan,
    rotation: Math.atan2(last.y - first.y, last.x - first.x) - Math.atan2(axisDy, axisDx),
  };
}

export function topGateSheet() {
  return {
    width: top.size[0] ?? 0,
    height: top.size[1] ?? 0,
    anchorPx: topAnchorPx,
    stallPx: topStallPx,
  };
}

export type ScreenPoint = { x: number; y: number; visible: boolean };

export type AnchoredStrip = {
  visible: true;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  originX: number;
  originY: number;
};

/**
 * Pin `anchorPx` to the projected gate center and rotate/scale so the stall
 * pixel span matches the projected lane span.
 */
export function placeAnchoredStrip(input: {
  imageWidth: number;
  imageHeight: number;
  anchorPx: Px;
  stallPx: readonly Px[];
  anchor: ScreenPoint;
  stalls: readonly ScreenPoint[];
}): AnchoredStrip | { visible: false } {
  const count = Math.min(input.stallPx.length, input.stalls.length);
  const firstPx = input.stallPx[0];
  const lastPx = input.stallPx[count - 1];
  const first = input.stalls[0];
  const last = input.stalls[count - 1];
  if (count < 2 || !input.anchor.visible || !firstPx || !lastPx || !first || !last) return { visible: false };
  if (!first.visible || !last.visible) return { visible: false };
  const imageSpan = Math.hypot(lastPx[0] - firstPx[0], lastPx[1] - firstPx[1]);
  const screenSpan = Math.hypot(last.x - first.x, last.y - first.y);
  if (imageSpan < 1 || screenSpan < 1) return { visible: false };
  const scale = screenSpan / imageSpan;
  const rotation =
    Math.atan2(last.y - first.y, last.x - first.x) - Math.atan2(lastPx[1] - firstPx[1], lastPx[0] - firstPx[0]);
  return {
    visible: true,
    x: input.anchor.x,
    y: input.anchor.y,
    scale,
    rotation,
    originX: input.anchorPx[0] / input.imageWidth,
    originY: input.anchorPx[1] / input.imageHeight,
  };
}
