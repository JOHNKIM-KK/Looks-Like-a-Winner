import type { CameraLook, CameraState, CameraStateName } from "./cameraState";

/** Default state-to-state blend. Closeup and the corner apex cut override this. */
export const CAMERA_BLEND_SEC = 0.6;
export const CLOSEUP_ENTER_SEC = 0.25;
export const CLOSEUP_RETURN_SEC = 0.4;

export type CameraBlend = {
  fromLook: CameraLook;
  fromName: CameraStateName;
  toName: CameraStateName;
  /** Presentation-clock timestamp when this blend started. */
  startedAt: number;
  duration: number;
};

export type CameraPresentation = {
  state: CameraState;
  look: CameraLook;
  blend: CameraBlend | null;
};

export function easeInOutSine(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return (1 - Math.cos(Math.PI * t)) / 2;
}

/** Signed shortest turn, in degrees, in (-180, 180]. */
export function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  let delta = (toDeg - fromDeg) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

export function lerpCameraLook(from: CameraLook, to: CameraLook, t: number): CameraLook {
  const azimuthDelta = shortestAngleDelta(from.azimuth, to.azimuth);
  return {
    targetX: from.targetX + (to.targetX - from.targetX) * t,
    targetY: from.targetY + (to.targetY - from.targetY) * t,
    distance: from.distance + (to.distance - from.distance) * t,
    azimuth: from.azimuth + azimuthDelta * t,
    elevation: from.elevation + (to.elevation - from.elevation) * t,
    focalLength: from.focalLength + (to.focalLength - from.focalLength) * t,
  };
}

/** Keep the view continuous when the canonical azimuth wraps by 360°. */
export function alignCameraLook(reference: CameraLook, look: CameraLook): CameraLook {
  return {
    ...look,
    azimuth: reference.azimuth + shortestAngleDelta(reference.azimuth, look.azimuth),
  };
}

export function isSameCameraState(a: CameraState, b: CameraState): boolean {
  return (
    a.name === b.name &&
    a.closeupHorseIndex === b.closeupHorseIndex &&
    a.closeupReturnTo === b.closeupReturnTo
  );
}

/**
 * Blend length for a state change.
 * Corner in → out (apex, 50% of the corner) is a hard cut.
 * Closeup enter / return use their own presentation-clock durations.
 */
export function cameraTransitionSeconds(from: CameraState, to: CameraState): number {
  if (isSameCameraState(from, to)) return 0;
  if (from.name === "CORNER_IN" && to.name === "CORNER_OUT") return 0;
  if (to.name === "CLOSEUP") return CLOSEUP_ENTER_SEC;
  if (from.name === "CLOSEUP") return CLOSEUP_RETURN_SEC;
  return CAMERA_BLEND_SEC;
}

export function createCameraPresentation(state: CameraState, look: CameraLook): CameraPresentation {
  return { state, look, blend: null };
}

export function cameraBlendProgress(blend: CameraBlend | null, presentationTime: number): number {
  if (!blend || blend.duration <= 0) return 1;
  const elapsed = presentationTime - blend.startedAt;
  return Math.min(1, Math.max(0, elapsed / blend.duration));
}

/**
 * Step the presented camera.
 * `presentationTime` is the only clock. Race time must not be passed here:
 * a new state supplies a new desired look, and an in-flight blend always
 * resumes from the look already on screen.
 */
export function advanceCameraPresentation(
  current: CameraPresentation,
  nextState: CameraState,
  desiredLook: CameraLook,
  presentationTime: number,
): CameraPresentation {
  if (!isSameCameraState(current.state, nextState)) {
    const duration = cameraTransitionSeconds(current.state, nextState);
    if (duration <= 0) {
      return { state: nextState, look: desiredLook, blend: null };
    }
    return {
      state: nextState,
      look: current.look,
      blend: {
        fromLook: current.look,
        fromName: current.state.name,
        toName: nextState.name,
        startedAt: presentationTime,
        duration,
      },
    };
  }

  if (!current.blend) {
    return {
      state: nextState,
      look: alignCameraLook(current.look, desiredLook),
      blend: null,
    };
  }

  const elapsed = presentationTime - current.blend.startedAt;
  // 1µs absorbs binary error at exact durations (0.6, 0.4, 0.25) without ending a frame early.
  if (elapsed >= current.blend.duration - 1e-6) {
    return {
      state: nextState,
      look: alignCameraLook(current.look, desiredLook),
      blend: null,
    };
  }

  return {
    state: nextState,
    look: lerpCameraLook(current.blend.fromLook, desiredLook, easeInOutSine(elapsed / current.blend.duration)),
    blend: current.blend,
  };
}
