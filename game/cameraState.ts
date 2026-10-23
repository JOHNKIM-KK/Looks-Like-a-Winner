import { segmentEnds } from "./track";
import type { Camera } from "./track";

export type CameraStateName =
  | "START"
  | "STRAIGHT"
  | "CORNER_IN"
  | "CORNER_OUT"
  | "FINISH"
  | "CLOSEUP";

export type CameraState = {
  name: CameraStateName;
  closeupHorseIndex?: number;
  closeupReturnTo?: CameraStateName;
};

export type RaceSnapshot = {
  raceTime: number;
  started: boolean;
  gateOpen: number;
  leadProgress: number;
  horses: Array<{
    index: number;
    progress: number;
  }>;
};

export function createInitialState(): CameraState {
  return { name: "START" };
}

export function nextCameraState(
  prev: CameraState,
  snapshot: RaceSnapshot
): CameraState {
  if (!snapshot.started) {
    return { name: "START" };
  }

  if (prev.name === "CLOSEUP") {
    return prev;
  }

  const ends = segmentEnds();
  const lead = snapshot.leadProgress;

  if (lead >= 0.9) {
    return { name: "FINISH" };
  }

  if (lead >= ends.cornerEnd) {
    return { name: "STRAIGHT" };
  }

  const cornerMid = ends.backStraightEnd + (ends.cornerEnd - ends.backStraightEnd) * 0.5;
  if (lead >= cornerMid) {
    return { name: "CORNER_OUT" };
  }

  if (lead >= ends.backStraightEnd) {
    return { name: "CORNER_IN" };
  }

  if (snapshot.gateOpen >= 0.95) {
    return { name: "STRAIGHT" };
  }

  return { name: "START" };
}

export function requestCloseup(
  current: CameraState,
  horseIndex: number,
  _durationSec: number
): CameraState {
  if (current.name === "CORNER_IN" || current.name === "CORNER_OUT") {
    return current;
  }

  return {
    name: "CLOSEUP",
    closeupHorseIndex: horseIndex,
    closeupReturnTo: current.name === "CLOSEUP" ? current.closeupReturnTo : current.name,
  };
}

export function exitCloseup(current: CameraState): CameraState {
  if (current.name !== "CLOSEUP") {
    return current;
  }

  return {
    name: current.closeupReturnTo ?? "STRAIGHT",
  };
}

export function getCameraForState(
  state: CameraState,
  snapshot: RaceSnapshot,
  packCenterX: number,
  packCenterY: number
): Camera {
  const deg = Math.PI / 180;

  switch (state.name) {
    case "START": {
      return {
        groundX: packCenterX,
        groundY: -850,
        height: 1650,
        pitch: 58 * deg,
        yaw: 0,
        focalLength: 640,
      };
    }

    case "STRAIGHT": {
      return {
        groundX: packCenterX,
        groundY: packCenterY - 1050,
        height: 1730,
        pitch: 6 * deg,
        yaw: 0,
        focalLength: 620,
      };
    }

    case "CORNER_IN": {
      const ends = segmentEnds();
      const cornerFrac = (snapshot.leadProgress - ends.backStraightEnd) / (ends.cornerEnd - ends.backStraightEnd);
      const approachFactor = Math.min(1, cornerFrac * 3);
      
      return {
        groundX: -400 + approachFactor * 200,
        groundY: -100,
        height: 1400,
        pitch: 12 * deg,
        yaw: -35 * deg,
        focalLength: 580,
      };
    }

    case "CORNER_OUT": {
      return {
        groundX: 420,
        groundY: 180,
        height: 1500,
        pitch: 18 * deg,
        yaw: 140 * deg,
        focalLength: 600,
      };
    }

    case "FINISH": {
      return {
        groundX: 0,
        groundY: 600,
        height: 1800,
        pitch: 75 * deg,
        yaw: 180 * deg,
        focalLength: 650,
      };
    }

    case "CLOSEUP": {
      const horseIndex = state.closeupHorseIndex ?? 0;
      const horse = snapshot.horses[horseIndex];
      if (!horse) {
        return getCameraForState({ name: "STRAIGHT" }, snapshot, packCenterX, packCenterY);
      }

      return {
        groundX: packCenterX,
        groundY: packCenterY - 400,
        height: 850,
        pitch: 20 * deg,
        yaw: 0,
        focalLength: 750,
      };
    }

    default:
      return {
        groundX: 0,
        groundY: -1050,
        height: 1730,
        pitch: 60 * deg,
        yaw: 0,
        focalLength: 620,
      };
  }
}
