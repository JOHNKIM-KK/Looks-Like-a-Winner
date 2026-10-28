import { describe, expect, it } from "vitest";
import { LOGICAL_PER_METER } from "./artScale";
import { createFrameMemory, frameHorseLook, type FrameSubject } from "./cameraFrame";
import { cameraFromLook, getCameraLookForState, type CameraStateName, type RaceSnapshot } from "./cameraState";
import { presentationLogical, segmentEnds, type Camera } from "./track";
import {
  PROP_NEAR_PLANE,
  cameraSpaceDepth,
  TREE_MAX_HEIGHT_FRAC,
  propMaxScreenPx,
  propSpriteAccepted,
  propStripAccepted,
  standLineOppositeCamera,
  straightTreeLines,
} from "./trackArt";

const TREE_ABOVE = (459 / 50) * LOGICAL_PER_METER;
const STAND_ABOVE = (1165 / 100) * LOGICAL_PER_METER;

function packAt(progress: number) {
  const subjects: FrameSubject[] = [];
  for (let lane = 1; lane <= 12; lane += 1) {
    const point = presentationLogical(progress, lane);
    subjects.push({ ...point, id: String(lane), rank: lane });
  }
  const packX = subjects.reduce((sum, subject) => sum + subject.x, 0) / subjects.length;
  const packY = subjects.reduce((sum, subject) => sum + subject.y, 0) / subjects.length;
  return { subjects, packX, packY };
}

function framedCamera(state: CameraStateName, progress: number): Camera {
  const { subjects, packX, packY } = packAt(progress);
  const snapshot: RaceSnapshot = {
    raceTime: progress * 90,
    started: progress > 0,
    gateOpen: progress > 0 ? 1 : 0,
    leadProgress: progress,
    horses: subjects.map((subject, index) => ({ index, progress })),
  };
  const base = getCameraLookForState({ name: state }, snapshot, packX, packY);
  const framed = frameHorseLook(base, subjects, state, [], createFrameMemory(base), 0, progress);
  return cameraFromLook(framed.look);
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

describe("prop near-plane and size cull", () => {
  const ends = segmentEnds();
  const cameras: { name: string; camera: Camera }[] = [
    { name: "START", camera: framedCamera("START", 0) },
    { name: "STRAIGHT_EARLY", camera: framedCamera("STRAIGHT", ends.pocketEnd + 0.04) },
    { name: "CORNER", camera: framedCamera("CORNER_IN", ends.backStraightEnd + 0.02) },
    { name: "HOME", camera: framedCamera("STRAIGHT", ends.cornerEnd + 0.02) },
    { name: "FINISH", camera: framedCamera("FINISH", 0.98) },
  ];

  it("drops the tree in front of the START lens and keeps the far stands", () => {
    const camera = cameras[0]?.camera;
    expect(camera).toBeTruthy();
    if (!camera) return;
    const back = straightTreeLines()[1];
    expect(back).toBeTruthy();
    if (!back) return;
    const treeSegments = segments(back.points);
    let nearest = treeSegments[0];
    let nearestDepth = Number.POSITIVE_INFINITY;
    for (const segment of treeSegments) {
      const midX = (segment.from.x + segment.to.x) / 2;
      const midY = (segment.from.y + segment.to.y) / 2;
      const depth = cameraSpaceDepth(camera, midX, midY, 0);
      if (depth < nearestDepth) {
        nearest = segment;
        nearestDepth = depth;
      }
    }
    expect(nearest).toBeTruthy();
    if (!nearest) return;
    expect(propStripAccepted(camera, nearest.from, nearest.to, TREE_ABOVE, 0, "outward")).toBe(false);

    const stands = segments(standLineOppositeCamera(camera)).filter((segment) =>
      propStripAccepted(camera, segment.from, segment.to, STAND_ABOVE, 0, "inward"),
    );
    expect(stands.length).toBeGreaterThan(2);
  });

  it("keeps every accepted prop inside the near plane and the on-screen cap", () => {
    const cap = propMaxScreenPx();
    const treeCap = propMaxScreenPx(TREE_MAX_HEIGHT_FRAC);
    for (const { camera } of cameras) {
      for (const line of straightTreeLines()) {
        for (const segment of segments(line.points)) {
          if (!propStripAccepted(camera, segment.from, segment.to, TREE_ABOVE, 0, "outward")) continue;
          expect(cameraSpaceDepth(camera, segment.from.x, segment.from.y, 0)).toBeGreaterThanOrEqual(PROP_NEAR_PLANE);
          expect(cameraSpaceDepth(camera, segment.to.x, segment.to.y, 0)).toBeGreaterThanOrEqual(PROP_NEAR_PLANE);
          const screen = Math.max(
            (camera.focalLength * TREE_ABOVE) / cameraSpaceDepth(camera, segment.from.x, segment.from.y, 0),
            (camera.focalLength * TREE_ABOVE) / cameraSpaceDepth(camera, segment.to.x, segment.to.y, 0),
          );
          expect(screen).toBeLessThanOrEqual(treeCap + 0.01);
        }
      }
      for (const segment of segments(standLineOppositeCamera(camera))) {
        if (!propStripAccepted(camera, segment.from, segment.to, STAND_ABOVE, 0, "inward")) continue;
        expect(cameraSpaceDepth(camera, segment.from.x, segment.from.y, 0)).toBeGreaterThanOrEqual(PROP_NEAR_PLANE);
        const screen =
          (camera.focalLength * STAND_ABOVE) / cameraSpaceDepth(camera, segment.from.x, segment.from.y, 0);
        expect(screen).toBeLessThanOrEqual(cap + 0.01);
      }
    }
  });

  it("hides a back face and a point behind the camera", () => {
    const camera = cameras[0]?.camera;
    expect(camera).toBeTruthy();
    if (!camera) return;
    const home = straightTreeLines()[0];
    const from = home?.points[0];
    const to = home?.points[1];
    expect(from && to && propStripAccepted(camera, from, to, TREE_ABOVE, 0, "outward")).toBe(false);

    const back = 800;
    const behindX = camera.groundX + Math.sin(camera.yaw) * back;
    const behindY = camera.groundY - Math.cos(camera.yaw) * back;
    expect(cameraSpaceDepth(camera, behindX, behindY, 0)).toBeLessThan(PROP_NEAR_PLANE);
    expect(propSpriteAccepted(camera, behindX, behindY, STAND_ABOVE)).toBe(false);
  });
});
