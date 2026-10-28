import { describe, expect, it } from "vitest";
import { LANE_GAP } from "./track";
import { laneRgb } from "./horseVisual";
import {
  DOOR_SNAP_SEC,
  STALL_COUNT_MAX,
  STALL_COUNT_MIN,
  clampStallCount,
  createGateConfig,
  createStartingGate,
  gateLayout,
  tintGatePlate,
} from "./startingGate";

describe("starting gate", () => {
  it("clamps the stall count to the lane range and spaces the row by pitch", () => {
    expect(clampStallCount(1)).toBe(STALL_COUNT_MIN);
    expect(clampStallCount(10)).toBe(STALL_COUNT_MAX);
    expect(clampStallCount(14)).toBe(STALL_COUNT_MAX);
    const config = createGateConfig(8, LANE_GAP);
    const parts = gateLayout(config);
    const stalls = parts.filter((part) => part.role === "stall");
    const doors = parts.filter((part) => part.role === "door");
    const plates = parts.filter((part) => part.role === "plate");
    const ends = parts.filter((part) => part.role === "end-left" || part.role === "end-right");
    expect(stalls).toHaveLength(8);
    expect(doors).toHaveLength(8);
    expect(plates).toHaveLength(8);
    expect(ends).toHaveLength(2);
    for (let index = 1; index < stalls.length; index += 1) {
      const prev = stalls[index - 1];
      const next = stalls[index];
      expect(prev && next && prev.y - next.y).toBeCloseTo(LANE_GAP);
    }
    for (const door of doors) {
      const stall = stalls.find((part) => part.index === door.index);
      expect(stall).toBeDefined();
      expect(door.x).toBeLessThan(stall?.x ?? 0);
      expect(door.y).toBeCloseTo(stall?.y ?? 0);
    }
    const left = parts.find((part) => part.role === "end-left");
    const right = parts.find((part) => part.role === "end-right");
    const first = stalls[0];
    const last = stalls[stalls.length - 1];
    expect(left && first && left.y - first.y).toBeCloseTo(LANE_GAP / 2);
    expect(last && right && last.y - right.y).toBeCloseTo(LANE_GAP / 2);
  });

  it("opens one stall on its own and snaps the rest together on the bell", () => {
    const gate = createStartingGate(createGateConfig(4));
    gate.openStall(1);
    gate.tick(DOOR_SNAP_SEC);
    expect(gate.doors[1]?.amount).toBe(1);
    expect(gate.doors[0]?.amount).toBe(0);
    expect(gate.doors[2]?.amount).toBe(0);
    expect(gate.doors[3]?.amount).toBe(0);

    gate.openAll();
    gate.tick(DOOR_SNAP_SEC / 2);
    expect(gate.doors[1]?.amount).toBe(1);
    const mid = gate.doors[0]?.amount ?? 0;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1.5);
    expect(gate.doors[2]?.amount).toBeCloseTo(mid);
    expect(gate.doors[3]?.amount).toBeCloseTo(mid);
    gate.tick(DOOR_SNAP_SEC);
    for (const door of gate.doors) expect(door.amount).toBe(1);
  });

  it("tints only the mask G area to the lane color", () => {
    const color = new Uint8ClampedArray([180, 180, 180, 255, 20, 40, 60, 255]);
    const mask = new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 0, 255]);
    const out = new Uint8ClampedArray(8);
    tintGatePlate(color, mask, 1, out);
    const [lr, lg, lb] = laneRgb(1);
    const lum = (0.299 * 180 + 0.587 * 180 + 0.114 * 180) / 185;
    expect(out[0]).toBe(Math.round(lr * lum));
    expect(out[1]).toBe(Math.round(lg * lum));
    expect(out[2]).toBe(Math.round(lb * lum));
    expect(out[4]).toBe(20);
    expect(out[5]).toBe(40);
    expect(out[6]).toBe(60);
  });
});
