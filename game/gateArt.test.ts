import { describe, expect, it } from "vitest";
import sheet from "../public/track/gate/gate.json";
import { LOGICAL_PER_METER } from "./artScale";
import { cameraFromLook } from "./cameraState";
import { frontLook } from "./introCamera";
import {
  GATE_FRONT_ELEVATION_DEG,
  GATE_PX_PER_M,
  GATE_STALL_PITCH_M,
  GATE_TOP_ELEVATION_DEG,
  frontImageToWorld,
  gateArtStallGround,
  gateArtView,
  gateTopAnchorWorld,
  placeAnchoredStrip,
  topGateSheet,
} from "./gateArt";
import { DOOR_AHEAD_M, stallOrigin } from "./startingGate";
import { LANE_GAP, presentationLogical } from "./track";
import { projectHeight } from "./trackArt";

describe("gate art", () => {
  it("uses 100 px/m and a 1.55 m stall pitch", () => {
    expect(GATE_PX_PER_M).toBe(100);
    expect(GATE_STALL_PITCH_M).toBeCloseTo(1.55);
    expect(GATE_STALL_PITCH_M * LOGICAL_PER_METER).toBeCloseTo(LANE_GAP);
    const centers = sheet.views.front.stall_centers_px;
    const first = centers[0];
    const second = centers[1];
    expect(first && second && second[0] - first[0]).toBeCloseTo(155);
    expect(sheet.views.front.ground_line_px).toBe(399);
    expect(sheet.views.front.size).toEqual([1400, 400]);
    expect(sheet.views.top.size).toEqual([1800, 1200]);
    expect(sheet.views.top.elevation_deg).toBe(65);
  });

  it("puts each front stall pixel on that lane's ground line", () => {
    const origin = stallOrigin();
    const centers = sheet.views.front.stall_centers_px;
    centers.forEach((center, index) => {
      const world = frontImageToWorld(center[0] ?? 0, sheet.views.front.ground_line_px);
      expect(world.x).toBeCloseTo(origin.x - DOOR_AHEAD_M * LOGICAL_PER_METER);
      expect(world.y).toBeCloseTo(origin.y - index * LANE_GAP);
      expect(world.z).toBeCloseTo(0);
    });
  });

  it("uses the top anchor as the midpoint of the painted stalls", () => {
    const stalls = sheet.views.top.stall_centers_px;
    const first = stalls[0];
    const last = stalls[stalls.length - 1];
    const anchor = sheet.views.top.anchor_px;
    expect(first && last && (first[0] + last[0]) / 2).toBeCloseTo(anchor[0] ?? 0);
    expect(first && last && (first[1] + last[1]) / 2).toBeCloseTo(anchor[1] ?? 0);
    const world = gateTopAnchorWorld();
    const lane0 = gateArtStallGround(0);
    const laneN = gateArtStallGround(stalls.length - 1);
    expect(world.y).toBeCloseTo((lane0.y + laneN.y) / 2);
    expect(world.x).toBeCloseTo(lane0.x);
    expect(world.z).toBe(0);
  });

  it("picks the front sheet under the race camera and the top sheet from the drone", () => {
    expect(GATE_FRONT_ELEVATION_DEG).toBe(8);
    expect(GATE_TOP_ELEVATION_DEG).toBe(65);
    expect(gateArtView(11)).toBe("front");
    expect(gateArtView(20)).toBe("front");
    expect(gateArtView(42)).toBe("top");
    expect(gateArtView(65)).toBe("top");
  });

  it("pins the anchor and matches the stall span", () => {
    const placed = placeAnchoredStrip({
      imageWidth: 1800,
      imageHeight: 1200,
      anchorPx: [900, 600],
      stallPx: [
        [100, 100],
        [300, 100],
      ],
      anchor: { x: 50, y: 80, visible: true },
      stalls: [
        { x: 10, y: 80, visible: true },
        { x: 90, y: 80, visible: true },
      ],
    });
    expect(placed.visible).toBe(true);
    if (!placed.visible) return;
    expect(placed.scale).toBeCloseTo(0.4);
    expect(placed.rotation).toBeCloseTo(0);
    expect(placed.originX).toBeCloseTo(0.5);
    expect(placed.originY).toBeCloseTo(0.5);
    expect(placed.x).toBe(50);
    expect(placed.y).toBe(80);
  });

  it("lines front stall pixels up with the horses at the head-on camera", () => {
    const pack = { x: 0, y: 0, n: 0 };
    for (let lane = 1; lane <= 12; lane += 1) {
      const horse = presentationLogical(0, lane);
      pack.x += horse.x;
      pack.y += horse.y;
      pack.n += 1;
    }
    const look = frontLook({ packX: pack.x / pack.n, packY: pack.y / pack.n, stallCount: 12 });
    const camera = cameraFromLook(look);
    for (const [index, center] of sheet.views.front.stall_centers_px.entries()) {
      const world = frontImageToWorld(center[0] ?? 0, sheet.views.front.ground_line_px);
      const gate = projectHeight(world.x, world.y, world.z, camera);
      const horse = presentationLogical(0, index + 1);
      const feet = projectHeight(horse.x, horse.y, 0, camera);
      expect(Math.abs(feet.x - gate.x)).toBeLessThan(8);
    }
  });

  it("lays the top sheet's anchor on the projected gate center at 65°", () => {
    const look = gateTopAnchorWorld();
    const camera = cameraFromLook({
      targetX: look.x,
      targetY: look.y,
      distance: 40 * LOGICAL_PER_METER,
      azimuth: 90,
      elevation: 65,
      focalLength: 1100,
    });
    const anchor = projectHeight(look.x, look.y, look.z, camera);
    const stalls = topGateSheet().stallPx.map((_, index) => {
      const ground = gateArtStallGround(index);
      return projectHeight(ground.x, ground.y, ground.z, camera);
    });
    const placed = placeAnchoredStrip({
      ...topGateSheet(),
      imageWidth: topGateSheet().width,
      imageHeight: topGateSheet().height,
      anchor,
      stalls,
    });
    expect(placed.visible).toBe(true);
    if (!placed.visible) return;
    expect(placed.x).toBeCloseTo(anchor.x);
    expect(placed.y).toBeCloseTo(anchor.y);
    expect(placed.originX).toBeCloseTo(0.5);
    expect(placed.originY).toBeCloseTo(0.5);
    expect(placed.scale).toBeGreaterThan(0);
  });
});
