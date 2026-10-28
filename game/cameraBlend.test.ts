import { describe, expect, test } from "vitest";
import {
  cameraFromLook,
  createInitialState,
  getCameraForState,
  getCameraLookForState,
  nextCameraState,
  type CameraLook,
  type CameraState,
  type RaceSnapshot,
} from "./cameraState";
import {
  CAMERA_BLEND_SEC,
  CLOSEUP_ENTER_SEC,
  CLOSEUP_RETURN_SEC,
  START_TO_STRAIGHT_SEC,
  advanceCameraPresentation,
  cameraTransitionSeconds,
  createCameraPresentation,
  easeInOutSine,
  lerpCameraLook,
  shortestAngleDelta,
  type CameraPresentation,
} from "./cameraBlend";
import { segmentEnds } from "./track";

const DT = 1 / 60;

function snap(lead = 0): RaceSnapshot {
  return { raceTime: 0, started: true, gateOpen: 1, leadProgress: lead, horses: [{ index: 0, progress: lead }] };
}

function look(state: CameraState, packX = 0, packY = 0, lead = 0): CameraLook {
  return getCameraLookForState(state, snap(lead), packX, packY);
}

function settle(state: CameraState, packX = 0, packY = 0, lead = 0): CameraPresentation {
  return createCameraPresentation(state, look(state, packX, packY, lead));
}

describe("transition durations", () => {
  test("race-state blends are 0.6s, closeup enter 0.25s, closeup return 0.4s, corner apex is a cut", () => {
    expect(CAMERA_BLEND_SEC).toBe(0.6);
    expect(CLOSEUP_ENTER_SEC).toBe(0.25);
    expect(CLOSEUP_RETURN_SEC).toBe(0.4);

    expect(cameraTransitionSeconds({ name: "START" }, { name: "STRAIGHT" })).toBe(START_TO_STRAIGHT_SEC);
    expect(cameraTransitionSeconds({ name: "STRAIGHT" }, { name: "CORNER_IN" })).toBe(0.6);
    expect(cameraTransitionSeconds({ name: "CORNER_OUT" }, { name: "STRAIGHT" })).toBe(0.6);
    expect(cameraTransitionSeconds({ name: "STRAIGHT" }, { name: "FINISH" })).toBe(0.6);
    expect(cameraTransitionSeconds({ name: "CORNER_IN" }, { name: "CORNER_OUT" })).toBe(0);

    const closeup: CameraState = { name: "CLOSEUP", closeupHorseIndex: 2, closeupReturnTo: "STRAIGHT" };
    expect(cameraTransitionSeconds({ name: "STRAIGHT" }, closeup)).toBe(0.25);
    expect(cameraTransitionSeconds({ name: "FINISH" }, closeup)).toBe(0.25);
    expect(cameraTransitionSeconds(closeup, { name: "STRAIGHT" })).toBe(0.4);
    expect(cameraTransitionSeconds(closeup, { name: "FINISH" })).toBe(0.4);
    expect(cameraTransitionSeconds(closeup, { name: "CLOSEUP", closeupHorseIndex: 3, closeupReturnTo: "STRAIGHT" })).toBe(0.25);
  });
});

describe("lead-horse thresholds", () => {
  test("each bend cuts to corner out at 50%, and the goal camera starts at lead 90%", () => {
    const ends = segmentEnds();
    const mid12 = ends.corner12Entry + (ends.corner12Exit - ends.corner12Entry) * 0.5;
    const mid34 = ends.backEnd + (ends.corner34Exit - ends.backEnd) * 0.5;
    const leadState = (lead: number, prev: CameraState): CameraState =>
      nextCameraState(prev, {
        raceTime: 20,
        started: true,
        gateOpen: 1,
        leadProgress: lead,
        horses: [{ index: 0, progress: lead }],
      });

    expect(leadState(mid12 - 1e-6, { name: "CORNER_IN" }).name).toBe("CORNER_IN");
    expect(leadState(mid12, { name: "CORNER_IN" }).name).toBe("CORNER_OUT");
    expect(leadState(ends.corner12Exit, { name: "CORNER_OUT" }).name).toBe("STRAIGHT");
    expect(leadState(mid34 - 1e-6, { name: "CORNER_IN" }).name).toBe("CORNER_IN");
    expect(leadState(mid34, { name: "CORNER_IN" }).name).toBe("CORNER_OUT");
    expect(leadState(ends.corner34Exit, { name: "CORNER_OUT" }).name).toBe("STRAIGHT");
    expect(cameraTransitionSeconds({ name: "CORNER_IN" }, { name: "CORNER_OUT" })).toBe(0);

    expect(leadState(0.9 - 1e-6, { name: "STRAIGHT" }).name).toBe("STRAIGHT");
    expect(leadState(0.9, { name: "STRAIGHT" }).name).toBe("FINISH");
  });
});

describe("easeInOutSine endpoints", () => {
  test("easing is 0 at the start, 1 at the end, and the camera matches those endpoints", () => {
    expect(easeInOutSine(0)).toBe(0);
    expect(easeInOutSine(1)).toBe(1);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5);
    expect(easeInOutSine(-0.2)).toBe(0);
    expect(easeInOutSine(1.4)).toBe(1);
    expect(easeInOutSine(0.02)).toBeLessThan(0.02);
    expect(easeInOutSine(0.98)).toBeGreaterThan(0.98);

    const startLook = look({ name: "START" }, 10, -20);
    const straightLook = look({ name: "STRAIGHT" }, 10, -20);
    let pres = settle({ name: "START" }, 10, -20);
    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, straightLook, 8);
    expect(pres.look).toEqual(startLook);
    expect(pres.blend?.duration).toBe(START_TO_STRAIGHT_SEC);

    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, straightLook, 8 + START_TO_STRAIGHT_SEC);
    expect(pres.blend).toBeNull();
    expect(pres.look.distance).toBe(straightLook.distance);
    expect(pres.look.elevation).toBe(straightLook.elevation);
    expect(pres.look.focalLength).toBe(straightLook.focalLength);
    expect(pres.look.targetX).toBe(straightLook.targetX);
    expect(pres.look.targetY).toBe(straightLook.targetY);
    expect(shortestAngleDelta(pres.look.azimuth, straightLook.azimuth)).toBeCloseTo(0);

    const startedAt = 8;
    const halfwayAt = startedAt + START_TO_STRAIGHT_SEC / 2;
    const halfway = advanceCameraPresentation(
      advanceCameraPresentation(settle({ name: "START" }, 10, -20), { name: "STRAIGHT" }, straightLook, startedAt),
      { name: "STRAIGHT" },
      straightLook,
      halfwayAt,
    );
    const halfwayLook = lerpCameraLook(startLook, straightLook, easeInOutSine((halfwayAt - startedAt) / START_TO_STRAIGHT_SEC));
    expect(halfway.look.distance).toBeCloseTo(halfwayLook.distance);
    expect(halfway.look.azimuth).toBeCloseTo(halfwayLook.azimuth);
    expect(halfway.look.elevation).toBeCloseTo(halfwayLook.elevation);
    expect(halfway.look.focalLength).toBeCloseTo(halfwayLook.focalLength);
    expect(halfway.look.targetX).toBeCloseTo(halfwayLook.targetX);
    expect(halfway.look.targetY).toBeCloseTo(halfwayLook.targetY);
  });
});

describe("shortest azimuth", () => {
  test("azimuth takes the short way across the 0/360 boundary", () => {
    expect(shortestAngleDelta(350, 10)).toBeCloseTo(20);
    expect(shortestAngleDelta(10, 350)).toBeCloseTo(-20);
    const from: CameraLook = {
      targetX: 1,
      targetY: 2,
      distance: 100,
      azimuth: 350,
      elevation: 10,
      focalLength: 800,
    };
    const to: CameraLook = { ...from, azimuth: 10 };
    expect(lerpCameraLook(from, to, 0).azimuth).toBeCloseTo(350);
    expect(lerpCameraLook(from, to, 0.5).azimuth).toBeCloseTo(360);
    expect(lerpCameraLook(from, to, 1).azimuth).toBeCloseTo(370);
    expect(Math.abs(shortestAngleDelta(lerpCameraLook(from, to, 0.5).azimuth, 180))).toBeGreaterThan(90);
  });

  test("corner-out to home straight turns the short way, not the long way", () => {
    const ends = segmentEnds();
    const out = look({ name: "CORNER_OUT" }, 0, 0, ends.corner34Exit);
    const home = look({ name: "STRAIGHT" }, 0, 0, ends.corner34Exit);
    expect(out.azimuth).toBe(135);
    expect(home.azimuth).toBe(180);
    expect(lerpCameraLook(out, home, 0.5).azimuth).toBeCloseTo(157.5);
  });
});

describe("continuity", () => {
  test("camera params stay continuous frame to frame except the two corner-in to corner-out cuts", () => {
    const ends = segmentEnds();
    const mid12 = ends.corner12Entry + (ends.corner12Exit - ends.corner12Entry) * 0.5;
    const mid34 = ends.backEnd + (ends.corner34Exit - ends.backEnd) * 0.5;
    const pack = { x: 140, y: -360 };
    let presentation = 0;
    let raceTime = 0;
    let started = false;
    let gateOpen = 0;
    let pres = settle({ name: "START" }, pack.x, pack.y);
    const frames: Array<{ look: CameraLook; cut: boolean; lead: number }> = [];
    const transitions: Array<{ from: string; to: string; duration: number; lead: number }> = [];

    for (let i = 0; i < 46 / DT; i += 1) {
      presentation += DT;
      if (!started && presentation >= 2.4) started = true;
      if (started) {
        if (gateOpen < 1) gateOpen = Math.min(1, gateOpen + DT / 0.28);
        raceTime += DT;
      } else {
        raceTime = 0;
      }
      const lead = started && gateOpen >= 1 ? Math.min(0.97, Math.max(0, raceTime - 0.28) / 34) : 0;
      const snapshot: RaceSnapshot = {
        raceTime,
        started,
        gateOpen,
        leadProgress: lead,
        horses: [],
      };
      const next = nextCameraState(pres.state, snapshot);
      const desired = getCameraLookForState(next, snapshot, pack.x, pack.y);
      const prevName = pres.state.name;
      const prevLook = { ...pres.look };
      pres = advanceCameraPresentation(pres, next, desired, presentation);
      const cut = prevName === "CORNER_IN" && next.name === "CORNER_OUT";
      if (prevName !== next.name) {
        transitions.push({
          from: prevName,
          to: next.name,
          duration: cut ? 0 : (pres.blend?.duration ?? -1),
          lead,
        });
        if (cut) {
          expect(pres.blend).toBeNull();
          expect(pres.look.distance).toBe(desired.distance);
          expect(Math.abs(pres.look.distance - prevLook.distance)).toBeGreaterThan(80);
        } else {
          expect(pres.look).toEqual(prevLook);
          const duration = prevName === "START" && next.name === "STRAIGHT" ? START_TO_STRAIGHT_SEC : CAMERA_BLEND_SEC;
          expect(pres.blend?.duration).toBe(duration);
          expect(pres.blend?.fromLook).toEqual(prevLook);
        }
      }
      frames.push({ look: pres.look, cut, lead });
    }

    expect(transitions.map(({ from, to, duration }) => ({ from, to, duration }))).toEqual([
      { from: "START", to: "STRAIGHT", duration: START_TO_STRAIGHT_SEC },
      { from: "STRAIGHT", to: "CORNER_IN", duration: 0.6 },
      { from: "CORNER_IN", to: "CORNER_OUT", duration: 0 },
      { from: "CORNER_OUT", to: "STRAIGHT", duration: 0.6 },
      { from: "STRAIGHT", to: "CORNER_IN", duration: 0.6 },
      { from: "CORNER_IN", to: "CORNER_OUT", duration: 0 },
      { from: "CORNER_OUT", to: "STRAIGHT", duration: 0.6 },
      { from: "STRAIGHT", to: "FINISH", duration: 0.6 },
    ]);
    expect(transitions[0]?.lead).toBe(0);
    expect(transitions[1]?.lead).toBeGreaterThanOrEqual(ends.corner12Entry);
    expect(transitions[1]?.lead).toBeLessThan(mid12);
    expect(transitions[2]?.lead).toBeGreaterThanOrEqual(mid12);
    expect(transitions[2]?.lead).toBeLessThan(ends.corner12Exit);
    expect(transitions[3]?.lead).toBeGreaterThanOrEqual(ends.corner12Exit);
    expect(transitions[3]?.lead).toBeLessThan(ends.backEnd);
    expect(transitions[4]?.lead).toBeGreaterThanOrEqual(ends.backEnd);
    expect(transitions[4]?.lead).toBeLessThan(mid34);
    expect(transitions[5]?.lead).toBeGreaterThanOrEqual(mid34);
    expect(transitions[5]?.lead).toBeLessThan(ends.corner34Exit);
    expect(transitions[6]?.lead).toBeGreaterThanOrEqual(ends.corner34Exit);
    expect(transitions[6]?.lead).toBeLessThan(0.9);
    expect(transitions[7]?.lead).toBeGreaterThanOrEqual(0.9);

    const cuts = frames.filter((frame) => frame.cut);
    expect(cuts).toHaveLength(2);

    for (let i = 1; i < frames.length; i += 1) {
      const prev = frames[i - 1]?.look;
      const curr = frames[i]?.look;
      if (!prev || !curr) continue;
      const azimuthStep = Math.abs(shortestAngleDelta(prev.azimuth, curr.azimuth));
      const distanceStep = Math.abs(curr.distance - prev.distance);
      if (frames[i]?.cut) {
        expect(azimuthStep).toBeGreaterThan(45);
        expect(distanceStep).toBeGreaterThan(80);
        continue;
      }
      expect(azimuthStep).toBeLessThan(8);
      expect(distanceStep).toBeLessThan(45);
      expect(Math.abs(curr.elevation - prev.elevation)).toBeLessThan(2);
      expect(Math.abs(curr.focalLength - prev.focalLength)).toBeLessThan(50);
      expect(Math.abs(curr.targetX - prev.targetX)).toBeLessThan(20);
      expect(Math.abs(curr.targetY - prev.targetY)).toBeLessThan(20);
    }
  });

  test("projected camera stays continuous across an azimuth wrap", () => {
    const from: CameraLook = {
      targetX: 0,
      targetY: 0,
      distance: 400,
      azimuth: 350,
      elevation: 20,
      focalLength: 1000,
    };
    const to: CameraLook = { ...from, azimuth: 10, distance: 280 };
    let pres = createCameraPresentation({ name: "START" }, from);
    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, to, 0);
    let previous = cameraFromLook(pres.look);
    const steps = Math.round(START_TO_STRAIGHT_SEC / DT);
    for (let i = 1; i <= steps; i += 1) {
      pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, to, i * DT);
      const projected = cameraFromLook(pres.look);
      expect(Math.hypot(projected.groundX - previous.groundX, projected.groundY - previous.groundY)).toBeLessThan(30);
      expect(Math.abs(projected.height - previous.height)).toBeLessThan(20);
      previous = projected;
    }
    expect(shortestAngleDelta(pres.look.azimuth, to.azimuth)).toBeCloseTo(0);
    expect(pres.look.distance).toBeCloseTo(to.distance);
  });
});

describe("interrupted transitions", () => {
  test("a new transition starts from the current interpolated camera", () => {
    const startLook = look({ name: "START" }, 5, 6);
    const straightLook = look({ name: "STRAIGHT" }, 5, 6);
    const closeup: CameraState = { name: "CLOSEUP", closeupHorseIndex: 0, closeupReturnTo: "STRAIGHT" };
    const closeLook = look(closeup, 5, 6);
    let pres = settle({ name: "START" }, 5, 6);
    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, straightLook, 1);
    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, straightLook, 1.2);
    const mid = { ...pres.look };
    expect(mid.distance).toBeCloseTo(lerpCameraLook(startLook, straightLook, easeInOutSine(0.2 / START_TO_STRAIGHT_SEC)).distance);
    expect(mid.distance).not.toBeCloseTo(straightLook.distance);

    pres = advanceCameraPresentation(pres, closeup, closeLook, 1.2);
    expect(pres.look).toEqual(mid);
    expect(pres.blend?.fromLook).toEqual(mid);
    expect(pres.blend?.duration).toBe(CLOSEUP_ENTER_SEC);
    expect(pres.blend?.startedAt).toBe(1.2);

    pres = advanceCameraPresentation(pres, closeup, closeLook, 1.2 + DT);
    const enterStep = Math.abs(pres.look.distance - mid.distance);
    const enterGap = Math.abs(closeLook.distance - mid.distance);
    expect(enterStep).toBeGreaterThan(0);
    expect(enterStep).toBeLessThan(enterGap * 0.2);

    pres = advanceCameraPresentation(pres, closeup, closeLook, 1.2 + CLOSEUP_ENTER_SEC);
    expect(pres.blend).toBeNull();
    expect(pres.look.distance).toBeCloseTo(closeLook.distance);
    expect(shortestAngleDelta(pres.look.azimuth, closeLook.azimuth)).toBeCloseTo(0);

    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, straightLook, 3);
    expect(pres.look.distance).toBeCloseTo(closeLook.distance);
    expect(pres.blend?.duration).toBe(CLOSEUP_RETURN_SEC);
    expect(pres.blend?.fromLook.distance).toBeCloseTo(closeLook.distance);

    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, straightLook, 3 + CLOSEUP_RETURN_SEC);
    expect(pres.blend).toBeNull();
    expect(pres.look.distance).toBe(straightLook.distance);
    expect(pres.look.focalLength).toBe(straightLook.focalLength);
    expect(shortestAngleDelta(pres.look.azimuth, straightLook.azimuth)).toBeCloseTo(0);
  });

  test("corner in to corner out cuts immediately even if asked in the same step", () => {
    const inn = look({ name: "CORNER_IN" }, 10, 20);
    const out = look({ name: "CORNER_OUT" }, 10, 20);
    const pres = advanceCameraPresentation(settle({ name: "CORNER_IN" }, 10, 20), { name: "CORNER_OUT" }, out, 4);
    expect(pres.blend).toBeNull();
    expect(pres.look).toEqual(out);
    expect(Math.abs(inn.distance - out.distance)).toBe(140);
    expect(Math.abs(shortestAngleDelta(inn.azimuth, out.azimuth))).toBe(90);
  });
});

describe("presentation clock", () => {
  test("blend weight follows presentation time and ignores a moved race target", () => {
    const startLook = look({ name: "START" }, 0, 0);
    const early = look({ name: "STRAIGHT" }, 0, 0, 0.05);
    const moved = look({ name: "STRAIGHT" }, 80, -40, 0.2);
    let pres = settle({ name: "START" });
    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, early, 100);
    expect(pres.look).toEqual(startLook);

    const half = START_TO_STRAIGHT_SEC / 2;
    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, early, 100 + half);
    expect(pres.blend).not.toBeNull();
    const u = easeInOutSine(0.5);
    expect(pres.look.distance).toBeCloseTo(startLook.distance + (early.distance - startLook.distance) * u);

    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, moved, 100 + half);
    expect(pres.blend?.startedAt).toBe(100);
    expect(pres.blend?.duration).toBe(START_TO_STRAIGHT_SEC);
    expect(pres.look.distance).toBeCloseTo(startLook.distance + (moved.distance - startLook.distance) * u);
    expect(pres.look.targetX).toBeCloseTo(startLook.targetX + (moved.targetX - startLook.targetX) * u);
    expect(Math.abs(pres.look.targetX - moved.targetX)).toBeGreaterThan(10);
    expect(pres.look.distance).not.toBeCloseTo(moved.distance);

    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, moved, 100 + START_TO_STRAIGHT_SEC);
    expect(pres.blend).toBeNull();
    expect(pres.look.targetX).toBeCloseTo(moved.targetX);
    expect(pres.look.distance).toBe(moved.distance);
  });

  test("live pack motion is what the blend approaches, not the pack at the transition start", () => {
    const startLook = look({ name: "START" }, 0, 0);
    const frozen = look({ name: "STRAIGHT" }, 0, 0);
    const live = look({ name: "STRAIGHT" }, 90, 15);
    let pres = settle({ name: "START" });
    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, frozen, 0);
    pres = advanceCameraPresentation(pres, { name: "STRAIGHT" }, live, START_TO_STRAIGHT_SEC / 2);
    expect(pres.look).toEqual(lerpCameraLook(startLook, live, easeInOutSine(0.5)));
    expect(pres.look.targetX).not.toBeCloseTo(lerpCameraLook(startLook, frozen, 0.5).targetX);
  });
});

describe("look projection", () => {
  test("getCameraForState stays the instantaneous state camera", () => {
    const states: CameraState[] = [
      { name: "START" },
      { name: "STRAIGHT" },
      { name: "CORNER_IN" },
      { name: "CORNER_OUT" },
      { name: "FINISH" },
      { name: "CLOSEUP", closeupHorseIndex: 0 },
    ];
    for (const state of states) {
      const projected = getCameraForState(state, snap(0.95), 12, -4);
      const viaLook = cameraFromLook(getCameraLookForState(state, snap(0.95), 12, -4));
      expect(viaLook).toEqual(projected);
    }
    expect(createInitialState()).toEqual({ name: "START" });
  });
});
