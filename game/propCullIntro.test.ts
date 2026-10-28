import { describe, expect, it } from "vitest";
import { LOGICAL_PER_METER } from "./artScale";
import { cameraFromLook } from "./cameraState";
import { introCountdownAt, introSequence, introStartLook, sampleIntro, type IntroAnchors } from "./introCamera";
import { presentationLogical, type Camera } from "./track";
import type { FrameSubject } from "./cameraFrame";
import {
  PROP_NEAR_PLANE,
  cameraSpaceDepth,
  propMaxScreenPx,
  propStripAccepted,
  standLineOppositeCamera,
  straightTreeLines,
} from "./trackArt";

const TREE_ABOVE = (459 / 50) * LOGICAL_PER_METER;
const STAND_ABOVE = (1165 / 100) * LOGICAL_PER_METER;

function fieldAtStart(): { subjects: FrameSubject[]; anchors: IntroAnchors } {
  const subjects: FrameSubject[] = [];
  for (let lane = 1; lane <= 12; lane += 1) {
    const point = presentationLogical(0, lane);
    subjects.push({ ...point, id: String(lane), rank: lane });
  }
  const packX = subjects.reduce((sum, subject) => sum + subject.x, 0) / subjects.length;
  const packY = subjects.reduce((sum, subject) => sum + subject.y, 0) / subjects.length;
  return { subjects, anchors: { packX, packY, stallCount: 12 } };
}

function segments(points: { x: number; y: number }[]) {
  const pairs: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from && to) pairs.push({ from, to });
  }
  return pairs;
}

describe("props stay out of the lens through the intro", () => {
  const { subjects, anchors } = fieldAtStart();
  const start = introStartLook(subjects, anchors.packX, anchors.packY);
  const times = [0.05];
  let cursor = 0;
  for (const segment of introSequence()) {
    times.push(cursor + segment.duration * 0.5);
    cursor += segment.duration;
  }
  times.push(introCountdownAt() + 0.2);

  const cameras: Camera[] = times.map((time) => cameraFromLook(sampleIntro(time, start, anchors).look));

  it("rejects the tree in front of the countdown lens", () => {
    const camera = cameras[cameras.length - 1];
    expect(camera).toBeTruthy();
    if (!camera) return;
    const back = straightTreeLines()[1];
    expect(back).toBeTruthy();
    if (!back) return;
    let nearest = segments(back.points)[0];
    let nearestDepth = Number.POSITIVE_INFINITY;
    for (const segment of segments(back.points)) {
      const depth = cameraSpaceDepth(camera, (segment.from.x + segment.to.x) / 2, (segment.from.y + segment.to.y) / 2, 0);
      if (depth < nearestDepth) {
        nearest = segment;
        nearestDepth = depth;
      }
    }
    expect(nearest && propStripAccepted(camera, nearest.from, nearest.to, TREE_ABOVE, 0, "outward")).toBe(false);
  });

  it("keeps every accepted prop behind the near plane and under the size cap", () => {
    const cap = propMaxScreenPx();
    for (const camera of cameras) {
      let stands = 0;
      for (const segment of segments(standLineOppositeCamera(camera))) {
        if (!propStripAccepted(camera, segment.from, segment.to, STAND_ABOVE, 0, "inward")) continue;
        stands += 1;
        const depth = cameraSpaceDepth(camera, segment.from.x, segment.from.y, 0);
        expect(depth).toBeGreaterThanOrEqual(PROP_NEAR_PLANE);
        expect((camera.focalLength * STAND_ABOVE) / depth).toBeLessThanOrEqual(cap + 0.01);
      }
      expect(stands).toBeGreaterThan(0);
      for (const line of straightTreeLines()) {
        for (const segment of segments(line.points)) {
          if (!propStripAccepted(camera, segment.from, segment.to, TREE_ABOVE, 0, "outward")) continue;
          const depth = cameraSpaceDepth(camera, segment.from.x, segment.from.y, 0);
          expect(depth).toBeGreaterThanOrEqual(PROP_NEAR_PLANE);
          expect((camera.focalLength * TREE_ABOVE) / depth).toBeLessThanOrEqual(cap + 0.01);
        }
      }
    }
  });
});
