/**
 * Drone intro and the gate-front orbit.
 * Durations and keyframe poses live here. `cameraConfig` stays the race camera.
 * The orbit's last frame is the START composition, not a separate angle.
 */
export const introConfig = {
  /**
   * Opening drone, 4–5s: hold the goal and the stands, then the corner,
   * the pocket, and a descent onto the gate front.
   */
  drone: {
    goal: 1.2,
    corner: 1.15,
    pocket: 1.1,
    descend: 1.15,
  },
  /** Hold the front so every plate and horse can be read. */
  frontHoldSec: 1.5,
  /** Sideways orbit into START. No cut. */
  orbitSec: 1.8,
  goal: {
    azimuth: 155,
    elevation: 42,
    distance: 1600,
    focalLength: 1500,
  },
  corner: {
    azimuth: 60,
    elevation: 36,
    distance: 1300,
    focalLength: 1400,
  },
  pocket: {
    azimuth: 40,
    elevation: 30,
    distance: 1200,
    focalLength: 1400,
  },
  /** Head-on gate. Distance is solved so the stall row fills `fill` of the view. */
  front: {
    azimuth: 90,
    elevation: 11,
    focalLength: 1500,
    /** Doors sit just in front of the horses, toward -X. */
    targetXOffset: -70,
    targetYOffset: 0,
    fill: 0.82,
  },
} as const;
