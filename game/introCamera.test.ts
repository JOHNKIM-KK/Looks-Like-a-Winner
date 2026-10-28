import { describe, expect, it } from "vitest";
import { cameraConfig } from "./cameraConfig";
import { introConfig } from "./introConfig";
import {
  droneDuration,
  frontLook,
  introCountdownAt,
  introSequence,
  introStartLook,
  sampleIntro,
  skipIntro,
  type IntroAnchors,
} from "./introCamera";
import { presentationLogical } from "./track";
import type { FrameSubject } from "./cameraFrame";

function fieldAtStart(stallCount = 8): { subjects: FrameSubject[]; anchors: IntroAnchors } {
  const subjects: FrameSubject[] = [];
  for (let lane = 1; lane <= stallCount; lane += 1) {
    const point = presentationLogical(0, lane);
    subjects.push({ ...point, id: String(lane), rank: lane });
  }
  const packX = subjects.reduce((sum, subject) => sum + subject.x, 0) / subjects.length;
  const packY = subjects.reduce((sum, subject) => sum + subject.y, 0) / subjects.length;
  return { subjects, anchors: { packX, packY, stallCount } };
}

describe("gate intro", () => {
  const { subjects, anchors } = fieldAtStart();
  const start = introStartLook(subjects, anchors.packX, anchors.packY);

  it("visits goal, corner, pocket, the descent, the front hold, then the orbit", () => {
    let time = 0;
    const phases = introSequence().map((segment) => {
      const phase = sampleIntro(time + 0.01, start, anchors).phase;
      time += segment.duration;
      return phase;
    });
    expect(phases).toEqual(["goal", "corner", "pocket", "descend", "front", "orbit"]);
  });

  it("keeps the drone inside 4–5s and the orbit inside 1.5–2s", () => {
    expect(droneDuration()).toBeGreaterThanOrEqual(4);
    expect(droneDuration()).toBeLessThanOrEqual(5);
    expect(introConfig.orbitSec).toBeGreaterThanOrEqual(1.5);
    expect(introConfig.orbitSec).toBeLessThanOrEqual(2);
    const orbit = introSequence().find((segment) => segment.id === "orbit");
    expect(orbit?.duration).toBe(introConfig.orbitSec);
  });

  it("ends the orbit on the START composition with no cut", () => {
    expect(start.azimuth).toBe(cameraConfig.states.START.azimuth);
    expect(start.elevation).toBe(cameraConfig.states.START.elevation);
    const begin = introCountdownAt() - introConfig.orbitSec;
    const front = frontLook(anchors);
    const opened = sampleIntro(begin, start, anchors);
    expect(opened.phase).toBe("orbit");
    expect(opened.look.azimuth).toBeCloseTo(front.azimuth, 4);
    expect(opened.look.distance).toBeCloseTo(front.distance, 4);

    const steps = Math.round(introConfig.orbitSec * 60);
    let previous = opened.look.azimuth;
    for (let step = 1; step <= steps; step += 1) {
      const sample = sampleIntro(begin + introConfig.orbitSec * (step / steps), start, anchors);
      const turn = Math.abs(sample.look.azimuth - previous);
      expect(turn).toBeLessThan(8);
      previous = sample.look.azimuth;
    }

    const landed = sampleIntro(introCountdownAt(), start, anchors);
    expect(landed.phase).toBe("countdown");
    expect(landed.look.azimuth).toBeCloseTo(start.azimuth, 5);
    expect(landed.look.elevation).toBeCloseTo(start.elevation, 5);
    expect(landed.look.distance).toBeCloseTo(start.distance, 5);
    expect(landed.look.focalLength).toBeCloseTo(start.focalLength, 5);
    expect(landed.look.targetX).toBeCloseTo(start.targetX, 4);
    expect(landed.look.targetY).toBeCloseTo(start.targetY, 4);
  });

  it("does not advance the race clock before the countdown", () => {
    const marks = [0, droneDuration() * 0.5, introCountdownAt() - 0.05, introCountdownAt()];
    for (const time of marks) {
      expect(sampleIntro(time, start, anchors).raceTime).toBe(0);
    }
    expect(sampleIntro(introCountdownAt() - 0.05, start, anchors).phase).not.toBe("countdown");
    expect(skipIntro(start).raceTime).toBe(0);
  });

  it("skips to the START composition", () => {
    const skipped = skipIntro(start);
    expect(skipped.phase).toBe("countdown");
    expect(skipped.look).toEqual(start);
  });
});
