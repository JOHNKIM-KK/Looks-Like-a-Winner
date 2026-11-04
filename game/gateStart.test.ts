import { describe, expect, test } from "vitest";
import {
  BELL_AT,
  clearOfStall,
  countdownLabel,
  doorState,
  gateCamera,
  gateOffset,
  gatePlateAlpha,
  stallFoot,
} from "./gateStart";
import { INTRO_END, INTRO_SHOTS, introCamera, introGateSwap } from "./droneIntro";
import { GATE_VIEWS, GATE_X, type GateView } from "./gateViews";
import {
  ENGINE_PX_PER_M,
  createDefaultCamera,
  laneRadius,
  presentationLogical,
  projectWithCamera,
  referenceDistance,
} from "./track";

const race = createDefaultCamera();
const AFTER = 8;

function metresToProgress(metres: number) {
  return (metres * ENGINE_PX_PER_M) / referenceDistance();
}

describe("countdown", () => {
  test("counts 3, 2, 1 at 0.8 s a beat and rings the bell on the next beat", () => {
    expect([0.1, 0.9, 1.7].map(countdownLabel)).toEqual(["3", "2", "1"]);
    expect(BELL_AT).toBeCloseTo(2.4, 9);
    expect(countdownLabel(BELL_AT + 1)).toBeNull();
  });
});

describe("one camera angle from the drone landing to the break", () => {
  test("holds the start/ asset camera from the end of the drone flight until horses have run 1 s", () => {
    const land = INTRO_SHOTS[2]!.hold[0];
    for (let t = land; t <= INTRO_END + 0.5; t += 0.02) {
      expect(introCamera(t, gateCamera(0, race))).toEqual(GATE_VIEWS.start.camera);
    }
    for (let t = 0; t < BELL_AT + 1.0; t += 0.02) expect(gateCamera(t, race)).toEqual(GATE_VIEWS.start.camera);
  });

  test("never shows the top/ gate", () => {
    for (let t = 0; t < AFTER; t += 0.05) {
      for (const swap of [0, 0.5, 1]) expect(gatePlateAlpha(t, swap).top).toBe(0);
    }
  });
});

describe("gate doors", () => {
  test("stay closed until the bell", () => {
    for (let t = 0; t < BELL_AT; t += 0.05) expect(doorState(t)).toBe("closed");
  });

  test("open all the way in four 60 ms frames after the bell", () => {
    expect([0.03, 0.09, 0.15, 0.4].map((dt) => doorState(BELL_AT + dt))).toEqual([
      "opening1",
      "opening2",
      "open",
      "open",
    ]);
    expect(doorState(BELL_AT - 0.01)).toBe("closed");
  });
});

describe("camera handoff", () => {
  test("ends on the live race camera unchanged", () => {
    expect(gateCamera(AFTER, race)).toBe(race);
  });

  test("blends between shots without jumps", () => {
    let previous = gateCamera(0, race);
    for (let t = 0.01; t < AFTER; t += 0.01) {
      const camera = gateCamera(t, race);
      expect(Math.abs(camera.groundX - previous.groundX)).toBeLessThan(60);
      expect(Math.abs(camera.groundY - previous.groundY)).toBeLessThan(60);
      expect(Math.abs(camera.height - previous.height)).toBeLessThan(60);
      expect(Math.abs(camera.yaw - previous.yaw)).toBeLessThan(0.05);
      expect(Math.abs(camera.focalLength - previous.focalLength)).toBeLessThan(20);
      previous = camera;
    }
  });
});

describe("gate plates", () => {
  test("cross-fade drone to start at the end of the drone flight", () => {
    expect(gatePlateAlpha(0, 0)).toEqual({ drone: 1, top: 0, start: 0 });
    const mid = gatePlateAlpha(0, 0.5);
    expect(mid.drone + mid.start).toBeCloseTo(1, 9);
    expect(gatePlateAlpha(0, 1)).toEqual({ drone: 0, top: 0, start: 1 });
    const land = INTRO_SHOTS[2]!.hold[0];
    expect(introGateSwap(land - 0.41)).toBe(0);
    expect(introGateSwap(land)).toBe(1);
  });

  test("stay on the start/ set through the countdown and the break", () => {
    for (let t = 0; t < BELL_AT + 1.0; t += 0.05) expect(gatePlateAlpha(t, 1)).toEqual({ drone: 0, top: 0, start: 1 });
  });

  test("leave the race camera without a gate plate", () => {
    expect(gatePlateAlpha(AFTER, 1)).toEqual({ drone: 0, top: 0, start: 0 });
  });
});

describe("horses in the stalls", () => {
  const shots: [GateView, number, number][] = [
    ["drone", 0, 0],
    ["start", 0, 1],
    ["start", BELL_AT, 1],
  ];

  test.each(shots)("stand on the %s view's horseFoot pixel", (view, t, intro) => {
    const { camera, stalls } = GATE_VIEWS[view];
    for (const stall of stalls) {
      const foot = stallFoot(stall.lane, t, intro);
      const pose = projectWithCamera({ ...foot, tx: 1, ty: 0 }, camera);
      expect(Math.hypot(pose.x - stall.horseFoot[0]!, pose.y - stall.horseFoot[1]!)).toBeLessThan(1);
      expect(clearOfStall(foot.x)).toBe(false);
    }
  });

  test("leave from the stall foot and settle onto their lane within a few metres", () => {
    for (let lane = 1; lane <= 12; lane += 1) {
      const atBell = gateOffset(lane, 0, BELL_AT, 1);
      const foot = stallFoot(lane, BELL_AT, 1);
      expect(GATE_X + atBell.x).toBeCloseTo(foot.x, 6);
      expect(laneRadius(lane) + atBell.y).toBeCloseTo(foot.y, 6);
      const settled = gateOffset(lane, metresToProgress(3.5), BELL_AT + 1, 1);
      expect(settled.x).toBeCloseTo(0, 9);
      expect(settled.y).toBeCloseTo(0, 9);
      const ahead = presentationLogical(metresToProgress(1), lane);
      expect(clearOfStall(ahead.x + gateOffset(lane, metresToProgress(1), BELL_AT + 0.3, 1).x)).toBe(true);
    }
  });
});
