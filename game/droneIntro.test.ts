import { describe, expect, test } from "vitest";
import { INTRO_END, INTRO_SHOTS, INTRO_SKIP_TO, introCamera, introShowsStands } from "./droneIntro";
import { GATE_CENTER_Y, GATE_X } from "./gateViews";
import { REFERENCE } from "./stage";
import { createDefaultCamera, projectWithCamera, type Camera } from "./track";

function project(x: number, y: number, z: number, camera: Camera) {
  return projectWithCamera({ x, y, z, tx: 0, ty: 0 }, camera);
}

describe("drone intro timeline", () => {
  const countdown = createDefaultCamera();

  test("holds each storyboard shot exactly", () => {
    for (const shot of INTRO_SHOTS) {
      expect(introCamera((shot.hold[0] + shot.hold[1]) / 2, countdown)).toEqual(shot.camera);
    }
  });

  test("lasts about five seconds and the skip lands before the handoff ends", () => {
    expect(INTRO_END).toBeGreaterThanOrEqual(4);
    expect(INTRO_END).toBeLessThanOrEqual(5.5);
    expect(INTRO_SKIP_TO).toBeLessThan(INTRO_END);
  });

  test("hands over to the countdown camera unchanged", () => {
    expect(introCamera(INTRO_END, countdown)).toBe(countdown);
    expect(introCamera(INTRO_END + 3, countdown)).toBe(countdown);
  });

  test("keeps the gate in frame at every held shot", () => {
    for (const shot of INTRO_SHOTS) {
      const gate = project(GATE_X, GATE_CENTER_Y, 0, introCamera((shot.hold[0] + shot.hold[1]) / 2, countdown));
      expect(gate.visible).toBe(true);
      expect(gate.x).toBeGreaterThan(0);
      expect(gate.x).toBeLessThan(REFERENCE.width);
      expect(gate.y).toBeGreaterThan(0);
      expect(gate.y).toBeLessThan(REFERENCE.height);
    }
  });

  test("moves without jumps between shots", () => {
    let previous = introCamera(0, countdown);
    for (let t = 0.01; t < INTRO_SKIP_TO; t += 0.01) {
      const camera = introCamera(t, countdown);
      expect(Math.abs(camera.groundX - previous.groundX)).toBeLessThan(40);
      expect(Math.abs(camera.groundY - previous.groundY)).toBeLessThan(40);
      expect(Math.abs(camera.height - previous.height)).toBeLessThan(40);
      previous = camera;
    }
  });
});

describe("intro stands", () => {
  test("show over the park, step aside for the low gate shots, and return for the countdown", () => {
    const mid = (shot: (typeof INTRO_SHOTS)[number]) => (shot.hold[0] + shot.hold[1]) / 2;
    expect(introShowsStands(mid(INTRO_SHOTS[0]!))).toBe(true);
    expect(introShowsStands(mid(INTRO_SHOTS[1]!))).toBe(false);
    expect(introShowsStands(mid(INTRO_SHOTS[2]!))).toBe(false);
    expect(introShowsStands(INTRO_SKIP_TO)).toBe(true);
    expect(introShowsStands(INTRO_END + 1)).toBe(true);
  });
});
