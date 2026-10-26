import { cameraConfig, type CameraConfigState } from "./cameraConfig";
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

/** Straights sit above the corner viewpoints. Corners stay lower and outside the bend. */
export const STRAIGHT_EARLY_ELEVATION = cameraConfig.states.STRAIGHT_EARLY.elevation;
export const STRAIGHT_HOME_ELEVATION = cameraConfig.states.STRAIGHT_HOME.elevation;
export const CORNER_IN_ELEVATION = cameraConfig.states.CORNER_IN.elevation;
export const CORNER_OUT_ELEVATION = cameraConfig.states.CORNER_OUT.elevation;
/** Look inward from outside the entry of the left-hand bend. */
export const CORNER_IN_AZIMUTH = cameraConfig.states.CORNER_IN.azimuth;
/** Look inward from outside the exit of the left-hand bend. */
export const CORNER_OUT_AZIMUTH = cameraConfig.states.CORNER_OUT.azimuth;

function lookAtPack(name: CameraConfigState, packCenterX: number, packCenterY: number): CameraLook {
  const spec = cameraConfig.states[name];
  return {
    targetX: packCenterX + spec.targetXOffset,
    targetY: packCenterY + spec.targetYOffset,
    distance: spec.distance,
    azimuth: spec.azimuth,
    elevation: spec.elevation,
    focalLength: spec.focalLength,
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
      return lookAtPack("START", packCenterX, packCenterY);

    case "STRAIGHT": {
      const isHomeStretch = snapshot.leadProgress >= ends.cornerEnd;
      return lookAtPack(isHomeStretch ? "STRAIGHT_HOME" : "STRAIGHT_EARLY", packCenterX, packCenterY);
    }

    case "CORNER_IN":
      // Outside the left-hand bend, lower than either straight.
      return lookAtPack("CORNER_IN", packCenterX, packCenterY);

    case "CORNER_OUT":
      return lookAtPack("CORNER_OUT", packCenterX, packCenterY);

    case "FINISH":
      // Aim ahead of the pack, toward +x, where the home-straight goal sits.
      return lookAtPack("FINISH", packCenterX, packCenterY);

    case "CLOSEUP": {
      const horseIndex = state.closeupHorseIndex ?? 0;
      const horse = snapshot.horses[horseIndex];
      if (!horse) {
        return getCameraLookForState({ name: "STRAIGHT" }, snapshot, packCenterX, packCenterY);
      }
      return lookAtPack("CLOSEUP", packCenterX, packCenterY);
    }

    default:
      return lookAtPack("STRAIGHT_EARLY", packCenterX, packCenterY);
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
