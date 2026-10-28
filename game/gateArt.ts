import sheet from "../public/track/gate/gate.json";
import { LOGICAL_PER_METER } from "./artScale";
import { DOOR_AHEAD_M, stallOrigin } from "./startingGate";

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
