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
  closeupStartTime?: number;
  closeupDuration?: number;
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
    if (prev.closeupStartTime !== undefined && prev.closeupDuration !== undefined) {
      if (snapshot.raceTime >= prev.closeupStartTime + prev.closeupDuration) {
        const returnTo = prev.closeupReturnTo ?? "STRAIGHT";
        return nextCameraState({ name: returnTo }, snapshot);
      }
    }
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
  snapshot: RaceSnapshot,
  horseIndex: number,
  durationSec: number
): CameraState {
  if (current.name === "CORNER_IN" || current.name === "CORNER_OUT") {
    return current;
  }

  return {
    name: "CLOSEUP",
    closeupHorseIndex: horseIndex,
    closeupReturnTo: current.name === "CLOSEUP" ? current.closeupReturnTo : current.name,
    closeupStartTime: snapshot.raceTime,
    closeupDuration: durationSec,
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
        height: 580,
        pitch: 42 * deg,
        yaw: 0,
        focalLength: 820,
      };
    }

    case "STRAIGHT": {
      return {
        groundX: packCenterX,
        groundY: packCenterY - 180,
        height: 320,
        pitch: 8 * deg,
        yaw: 0,
        focalLength: 1050,
      };
    }

    case "CORNER_IN": {
      const ends = segmentEnds();
      const cornerFrac = (snapshot.leadProgress - ends.backStraightEnd) / (ends.cornerEnd - ends.backStraightEnd);
      const approachFactor = Math.min(1, cornerFrac * 3);
      
      return {
        groundX: -650 + approachFactor * 150,
        groundY: -350,
        height: 480,
        pitch: 28 * deg,
        yaw: -48 * deg,
        focalLength: 920,
      };
    }

    case "CORNER_OUT": {
      return {
        groundX: 650,
        groundY: 380,
        height: 550,
        pitch: 32 * deg,
        yaw: 130 * deg,
        focalLength: 950,
      };
    }

    case "FINISH": {
      return {
        groundX: 0,
        groundY: 950,
        height: 680,
        pitch: 75 * deg,
        yaw: 180 * deg,
        focalLength: 1050,
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
        groundY: packCenterY - 100,
        height: 220,
        pitch: 15 * deg,
        yaw: 0,
        focalLength: 1350,
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
