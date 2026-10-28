import { introConfig } from "./introConfig";
import { cameraConfig } from "./cameraConfig";
import { createFrameMemory, frameHorseLook, type FrameSubject } from "./cameraFrame";
import { getCameraLookForState, type CameraLook } from "./cameraState";
import { CHUTE, LANE_GAP, STRAIGHT, STRAIGHT_BACK, finishGoalX, laneRadius } from "./track";
import { easeInOutSine, lerpCameraLook } from "./cameraBlend";

export type IntroBeat = "goal" | "corner" | "pocket" | "descend" | "front" | "orbit";

export type IntroPhase = IntroBeat | "countdown";

export type IntroSample = {
  phase: IntroPhase;
  look: CameraLook;
  /** Always 0 until the countdown. The race clock stays put through the intro. */
  raceTime: 0;
};

export type IntroAnchors = {
  packX: number;
  packY: number;
  stallCount: number;
};

type Segment = {
  id: IntroBeat;
  duration: number;
  pose: CameraLook;
  hold: boolean;
};

const VIEW_WIDTH = cameraConfig.view.width;

export function introSequence() {
  return [
    { id: "goal" as const, duration: introConfig.drone.goal },
    { id: "corner" as const, duration: introConfig.drone.corner },
    { id: "pocket" as const, duration: introConfig.drone.pocket },
    { id: "descend" as const, duration: introConfig.drone.descend },
    { id: "front" as const, duration: introConfig.frontHoldSec },
    { id: "orbit" as const, duration: introConfig.orbitSec },
  ];
}

/** Seconds from the first frame until the countdown may start. */
export function introCountdownAt() {
  return introSequence().reduce((sum, segment) => sum + segment.duration, 0);
}

export function droneDuration() {
  const drone = introConfig.drone;
  return drone.goal + drone.corner + drone.pocket + drone.descend;
}

/**
 * The START composition the orbit has to land on.
 * Azimuth and elevation stay on `cameraConfig`. Framing may widen distance and focal length.
 */
export function introStartLook(subjects: readonly FrameSubject[], packX: number, packY: number): CameraLook {
  const base = getCameraLookForState(
    { name: "START" },
    { raceTime: 0, started: false, gateOpen: 0, leadProgress: 0, horses: [] },
    packX,
    packY,
  );
  return frameHorseLook(base, subjects, "START", [], createFrameMemory(base), 0, 0).look;
}

/** Distance that fits the stall row, including both end caps, across the front view. */
export function frontDistance(stallCount: number) {
  const stalls = Math.max(2, Math.min(10, stallCount));
  const span = (stalls + 1) * LANE_GAP;
  const screen = VIEW_WIDTH * introConfig.front.fill;
  const depth = (introConfig.front.focalLength * span) / screen;
  const elevation = (introConfig.front.elevation * Math.PI) / 180;
  return depth / Math.cos(elevation);
}

export function frontLook(anchors: IntroAnchors): CameraLook {
  const front = introConfig.front;
  return {
    targetX: anchors.packX + front.targetXOffset,
    targetY: anchors.packY + front.targetYOffset,
    distance: frontDistance(anchors.stallCount),
    azimuth: front.azimuth,
    elevation: front.elevation,
    focalLength: front.focalLength,
  };
}

function lookAt(x: number, y: number, pose: { azimuth: number; elevation: number; distance: number; focalLength: number }): CameraLook {
  return {
    targetX: x,
    targetY: y,
    distance: pose.distance,
    azimuth: pose.azimuth,
    elevation: pose.elevation,
    focalLength: pose.focalLength,
  };
}

function segments(anchors: IntroAnchors, startLook: CameraLook): Segment[] {
  const goal = finishGoalX();
  const homeY = laneRadius(4);
  const cornerX = -STRAIGHT / 2;
  const pocketX = STRAIGHT_BACK / 2 + CHUTE;
  const front = frontLook(anchors);
  return [
    { id: "goal", duration: introConfig.drone.goal, pose: lookAt(goal, homeY, introConfig.goal), hold: true },
    { id: "corner", duration: introConfig.drone.corner, pose: lookAt(cornerX, 0, introConfig.corner), hold: false },
    { id: "pocket", duration: introConfig.drone.pocket, pose: lookAt(pocketX, anchors.packY, introConfig.pocket), hold: false },
    { id: "descend", duration: introConfig.drone.descend, pose: front, hold: false },
    { id: "front", duration: introConfig.frontHoldSec, pose: front, hold: true },
    { id: "orbit", duration: introConfig.orbitSec, pose: startLook, hold: false },
  ];
}

/** Presentation clock → intro pose. `time` past the orbit is the countdown, still at race time 0. */
export function sampleIntro(time: number, startLook: CameraLook, anchors: IntroAnchors): IntroSample {
  const path = segments(anchors, startLook);
  let cursor = 0;
  let previous = path[0]?.pose ?? startLook;
  for (const segment of path) {
    const end = cursor + segment.duration;
    if (time < end) {
      const u = segment.duration <= 0 ? 1 : (time - cursor) / segment.duration;
      const look = segment.hold ? segment.pose : lerpCameraLook(previous, segment.pose, easeInOutSine(Math.max(0, u)));
      return { phase: segment.id, look, raceTime: 0 };
    }
    previous = segment.pose;
    cursor = end;
  }
  return { phase: "countdown", look: startLook, raceTime: 0 };
}

/** Tap skip. The camera is the START composition and the countdown may begin. */
export function skipIntro(startLook: CameraLook): IntroSample {
  return { phase: "countdown", look: startLook, raceTime: 0 };
}
