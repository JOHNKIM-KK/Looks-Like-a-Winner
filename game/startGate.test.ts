import { describe, expect, test } from "vitest";
import { LOGICAL_PER_METER } from "./artScale";
import { cameraConfig } from "./cameraConfig";
import { GAME_HEIGHT, GAME_WIDTH, createFrameMemory, frameHorseLook } from "./cameraFrame";
import { cameraFromLook, getCameraLookForState } from "./cameraState";
import { presentationLogical, projectWithCamera } from "./track";
import {
  DOOR_FRAME_MS,
  DOOR_OPEN_MS,
  GATE_SIGN,
  STALL_COUNT,
  cameraStandOffset,
  createStartGate,
  doorFrameAt,
  mapImageOffset,
  pickGateAngle,
  stallFront,
  stallPitchM,
} from "./startGate";

describe("start gate", () => {
  test("twelve stalls sit on the chute start, 1.2 m apart", () => {
    expect(STALL_COUNT).toBe(12);
    expect(GATE_SIGN).toBe("RACE PARK");
    for (let lane = 1; lane <= STALL_COUNT; lane += 1) {
      const stall = stallFront(lane);
      const horse = presentationLogical(0, lane);
      expect(stall.x).toBeCloseTo(horse.x);
      expect(stall.y).toBeCloseTo(horse.y);
    }
    expect(stallPitchM(1)).toBeCloseTo(1.2);
    expect(stallPitchM(11)).toBeCloseTo(1.2);
    expect(stallFront(12).y - stallFront(1).y).toBeCloseTo(11 * 1.2 * LOGICAL_PER_METER);
  });

  test("door frames run about 250 ms and settle open", () => {
    expect(DOOR_OPEN_MS).toBe(250);
    let held = 0;
    for (const ms of DOOR_FRAME_MS) held += ms;
    expect(held).toBe(DOOR_OPEN_MS);
    expect(doorFrameAt(0)).toBe(0);
    expect(doorFrameAt(1)).toBe(1);
    expect(doorFrameAt(39)).toBe(1);
    expect(doorFrameAt(40)).toBe(2);
    expect(doorFrameAt(80)).toBe(3);
    expect(doorFrameAt(125)).toBe(4);
    expect(doorFrameAt(170)).toBe(5);
    expect(doorFrameAt(250)).toBe(5);
    expect(doorFrameAt(400)).toBe(5);
  });

  test("openStall opens one stall and openAll staggers the rest", () => {
    const gate = createStartGate();
    expect(gate.frameFor(3, 0)).toBe(0);
    gate.openStall(3, 0);
    expect(gate.frameFor(3, 50)).toBe(2);
    expect(gate.frameFor(4, 50)).toBe(0);
    gate.openStall(3, 10);
    expect(gate.frameFor(3, 50)).toBe(2);

    const all = createStartGate();
    all.openAll(1000, 40);
    expect(all.frameFor(1, 1000)).toBe(0);
    expect(all.frameFor(1, 1001)).toBe(1);
    expect(all.frameFor(12, 1039)).toBe(0);
    expect(all.frameFor(12, 1041)).toBe(1);
    expect(all.frameFor(12, 1000 + 40 + 250)).toBe(5);
    all.reset();
    expect(all.frameFor(1, 2000)).toBe(0);
  });

  test("a stall step and a meter of height map onto the screen axes", () => {
    const step = mapImageOffset([36, 33], [36, 33], 60, [48, -26], [0, -40]);
    expect(step?.[0]).toBeCloseTo(48);
    expect(step?.[1]).toBeCloseTo(-26);
    const up = mapImageOffset([0, -60], [36, 33], 60, [48, -26], [0, -40]);
    expect(up?.[0]).toBeCloseTo(0);
    expect(up?.[1]).toBeCloseTo(-40);
  });

  test("the framed START camera keeps all 12 stalls on screen without a camera retune", () => {
    expect(cameraConfig.states.START.distance).toBe(520);
    expect(cameraConfig.states.START.azimuth).toBe(32);
    expect(cameraConfig.states.START.elevation).toBe(20);
    expect(cameraConfig.states.START.focalLength).toBe(1100);

    const subjects = Array.from({ length: STALL_COUNT }, (_, index) => {
      const lane = index + 1;
      return { ...stallFront(lane), tx: 1, ty: 0, id: String(lane), rank: lane };
    });
    const packX = subjects.reduce((sum, subject) => sum + subject.x, 0) / subjects.length;
    const packY = subjects.reduce((sum, subject) => sum + subject.y, 0) / subjects.length;
    const snapshot = {
      raceTime: 0,
      started: false,
      gateOpen: 0,
      leadProgress: 0,
      horses: subjects.map((subject, index) => ({ index, progress: 0 })),
    };
    const base = getCameraLookForState({ name: "START" }, snapshot, packX, packY);
    const framed = frameHorseLook(base, subjects, "START", [], createFrameMemory(base), 0, 0);
    const camera = cameraFromLook(framed.look);
    for (const subject of subjects) {
      const pose = projectWithCamera(subject, camera);
      expect(pose.visible).toBe(true);
      expect(pose.x).toBeGreaterThan(0);
      expect(pose.x).toBeLessThan(GAME_WIDTH);
      expect(pose.y).toBeGreaterThan(0);
      expect(pose.y).toBeLessThan(GAME_HEIGHT);
      const top = projectWithCamera({ ...subject, z: 4.2 * LOGICAL_PER_METER }, camera);
      expect(top.visible).toBe(true);
      expect(top.y).toBeGreaterThan(0);
      expect(top.y).toBeLessThan(pose.y);
    }
    const mid = subjects[5];
    if (!mid) return;
    expect(pickGateAngle(cameraStandOffset(camera, mid)).name).toBe("oblique60");
  });
});
