import { describe, expect, it } from "vitest";
import { fieldHorses } from "@/lib/field";
import { mockHorses } from "@/lib/mockHorses";
import { simulateRace } from "@/lib/race";
import { clipFrame, parseSheet, pickEventAngle, sheetsNeeded, type EventSheet, type RawSheet } from "./eventSheets";

const race = (seed: number, force?: { cause?: "collision" | "titan" | "graze"; mode?: "run" | "super" | "bike" }) =>
  simulateRace(fieldHorses(mockHorses, seed), seed, { force });

describe("which sheets a race loads", () => {
  it("loads nothing for a race without incidents", () => {
    expect(sheetsNeeded(simulateRace(fieldHorses(mockHorses, 7), 7, { incidents: false }))).toEqual([]);
  });

  it("loads the fall and down sheets for a collision, and no others", () => {
    expect(sheetsNeeded(race(7, { cause: "collision", mode: "run" })).sort()).toEqual(["down", "fall"]);
  });

  it("loads the walk and graze sheets, plus the ride sheet in bike mode", () => {
    expect(sheetsNeeded(race(7, { cause: "graze", mode: "run" })).sort()).toEqual(["graze", "walk"]);
    expect(sheetsNeeded(race(7, { cause: "graze", mode: "bike" })).sort()).toEqual(["graze", "ride", "walk"]);
  });

  it("loads the giant's run and grab sheets for a titan", () => {
    expect(sheetsNeeded(race(7, { cause: "titan", mode: "run" })).sort()).toEqual(["titanGrab", "titanRun"]);
  });
});

const raw = (straight: number[], corner: number[]): RawSheet => {
  const angles = (indexes: number[], yaw: (index: number) => number) =>
    indexes.map((index) => ({ index, yaw_deg: yaw(index), color: `c${index}.webp`, frame_w: 10, frame_h: 10, anchor: [5, 9] }));
  return {
    px_per_m: 24,
    world_px_per_m: 97,
    scale_up: 4,
    fps: 10,
    frames: 4,
    loop: false,
    sets: { straight: { angles: angles(straight, (index) => (index - 2) * 15) }, corner: { angles: angles(corner, () => 20) } },
  };
};

describe("sheet angles", () => {
  const giant: EventSheet = parseSheet("titanGrab", raw([1, 2, 3], [1]));

  it("draws the giant at the scale its sheet asks for", () => {
    expect(giant.drawScale).toBe(4);
  });

  it("takes the exact angle when the sheet has it", () => {
    const picked = pickEventAngle(giant, { set: "straight", index: 3, yawDeg: 15, flip: false });
    expect(picked?.angle.index).toBe(3);
  });

  it("falls back to the nearest yaw when the sheet lacks the angle or the view is wide", () => {
    expect(pickEventAngle(giant, { set: "straight", index: 0, yawDeg: -30, flip: false })?.angle.index).toBe(1);
    expect(pickEventAngle(giant, { set: "wide", index: 0, yawDeg: 60, flip: true })?.angle.index).toBe(3);
    expect(pickEventAngle(giant, { set: "corner", index: 2, yawDeg: 40, flip: false })).toMatchObject({ set: "corner", angle: { index: 1 } });
  });

  it("holds the last frame of a one-shot and loops a loop", () => {
    expect(clipFrame(giant, 0.15)).toBe(1);
    expect(clipFrame(giant, 5)).toBe(3);
    expect(clipFrame({ ...giant, loop: true }, 0.45)).toBe(0);
  });

  it("reads hand and ground points only when the sheet has them", () => {
    expect(giant.sets.straight[0]?.hand).toBeNull();
    const withHand = raw([1], []);
    const angle = withHand.sets.straight.angles[0];
    if (angle) Object.assign(angle, { hand_px: [[1, 2], [3, 4]], ground_px: [[5, 6]] });
    const parsed = parseSheet("titanGrab", withHand);
    expect(parsed.sets.straight[0]?.hand).toEqual([[1, 2], [3, 4]]);
    expect(parsed.sets.straight[0]?.ground).toEqual([[5, 6]]);
  });
});
