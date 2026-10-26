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

export type CameraLook = {
  targetX: number;
  targetY: number;
  distance: number;
  azimuth: number;
  elevation: number;
  focalLength: number;
};

export function cameraFromLook(target: CameraLook): Camera {
  const azimuthRad = target.azimuth * (Math.PI / 180);
  const elevationRad = target.elevation * (Math.PI / 180);

  const groundX = target.targetX - target.distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
  const groundY = target.targetY - target.distance * Math.cos(elevationRad) * Math.cos(azimuthRad);
  const height = target.distance * Math.sin(elevationRad);

  const dx = target.targetX - groundX;
  const dy = target.targetY - groundY;
  const dz = 0 - height;

  const yaw = Math.atan2(-dx, dy);
  const horizontalDist = Math.hypot(dx, dy);
  const pitch = Math.atan2(-dz, horizontalDist);

  return {
    groundX,
    groundY,
    height,
    pitch,
    yaw,
    focalLength: target.focalLength,
  };
}

export function getCameraLookForState(
  state: CameraState,
  snapshot: RaceSnapshot,
  packCenterX: number,
  packCenterY: number,
): CameraLook {
  const ends = segmentEnds();

  switch (state.name) {
    case "START":
      return {
        targetX: packCenterX,
        targetY: packCenterY - 100,
        distance: 650,
        azimuth: 32,
        elevation: 15,
        focalLength: 1000,
      };

    case "STRAIGHT": {
      const isHomeStretch = snapshot.leadProgress >= ends.cornerEnd;
      if (isHomeStretch) {
        return {
          targetX: packCenterX,
          targetY: packCenterY,
          distance: 1020,
          azimuth: 180,
          elevation: 32,
          focalLength: 1900,
        };
      }
      return {
        targetX: packCenterX,
        targetY: packCenterY,
        distance: 130,
        azimuth: 0,
        elevation: 12,
        focalLength: 850,
      };
    }

    case "CORNER_IN":
      return {
        targetX: packCenterX,
        targetY: packCenterY,
        distance: 420,
        azimuth: 225,
        elevation: 26,
        focalLength: 1100,
      };

    case "CORNER_OUT":
      return {
        targetX: packCenterX,
        targetY: packCenterY,
        distance: 520,
        azimuth: 315,
        elevation: 24,
        focalLength: 1000,
      };

    case "FINISH":
      // Aim ahead of the pack, toward +x, where the home-straight goal sits.
      return {
        targetX: packCenterX + 250,
        targetY: packCenterY,
        distance: 1800,
        azimuth: 90,
        elevation: 18,
        focalLength: 2600,
      };

    case "CLOSEUP": {
      const horseIndex = state.closeupHorseIndex ?? 0;
      const horse = snapshot.horses[horseIndex];
      if (!horse) {
        return getCameraLookForState({ name: "STRAIGHT" }, snapshot, packCenterX, packCenterY);
      }
      return {
        targetX: packCenterX,
        targetY: packCenterY,
        distance: 180,
        azimuth: 0,
        elevation: 18,
        focalLength: 1400,
      };
    }

    default:
      return {
        targetX: 0,
        targetY: 0,
        distance: 1500,
        azimuth: 0,
        elevation: 55,
        focalLength: 650,
      };
  }
}

export function getCameraForState(
  state: CameraState,
  snapshot: RaceSnapshot,
  packCenterX: number,
  packCenterY: number,
): Camera {
  return cameraFromLook(getCameraLookForState(state, snapshot, packCenterX, packCenterY));
}

export function shouldScaleHorseInCorner(state: CameraState): boolean {
  return state.name === "CORNER_IN" || state.name === "CORNER_OUT";
}
