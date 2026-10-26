/**
 * Retune the race camera here. State looks, the safe-frame margins, damping,
 * and the background targets all live in this object.
 * Framing only widens a state look (never zooms in past it).
 */
export const cameraConfig = {
  view: {
    width: 540,
    height: 1170,
    /** Horizontal inset of the safe rect, as a fraction of view width. 5% → x 27..513. */
    marginX: 0.05,
    /** Horses stay below this fraction of the screen (under the top HUD). */
    hudTop: 0.14,
    /** Horses stay above this fraction of the screen (above the bottom banner). */
    bannerTop: 0.8,
  },
  framing: {
    /** Seconds to ease a widen / recover. A hard clip still snaps wide enough to fit. */
    dampSec: 0.3,
    /** Soft grass target for later retuning. Not a pass/fail gate. */
    grassTarget: 0.08,
    /** Straights may show grass under the rail up to this fraction of screen height. */
    straightGrassMax: 0.166,
    /** Corners may fill up to this fraction of the lane band with stands, trees, or grass. */
    cornerBackgroundMax: 0.35,
    laneAreaTop: 0.15,
    laneAreaBottom: 0.8,
    /** Soft screen-space bow of the corner rail, in pixels. Reported, not enforced. */
    cornerSagittaMin: 56,
    /** Slides the look target along the view direction. 0 keeps the pack centered. */
    lookBias: {
      START: 0,
      STRAIGHT: 0,
      CORNER_IN: 0,
      CORNER_OUT: 0,
      FINISH: 0,
      CLOSEUP: 0,
    },
  },
  track: {
    innerRailInset: 34,
    outerRailOutset: 28,
    finishPostInfieldGap: 22,
  },
  states: {
    START: { distance: 520, azimuth: 32, elevation: 20, focalLength: 1100, targetXOffset: 0, targetYOffset: -100 },
    STRAIGHT_EARLY: { distance: 360, azimuth: 0, elevation: 22, focalLength: 1100, targetXOffset: 0, targetYOffset: 0 },
    STRAIGHT_HOME: { distance: 900, azimuth: 180, elevation: 24, focalLength: 1700, targetXOffset: 0, targetYOffset: 0 },
    CORNER_IN: { distance: 520, azimuth: 45, elevation: 14, focalLength: 1200, targetXOffset: 0, targetYOffset: 0 },
    CORNER_OUT: { distance: 660, azimuth: 135, elevation: 13, focalLength: 1300, targetXOffset: 0, targetYOffset: 0 },
    FINISH: { distance: 1800, azimuth: 90, elevation: 18, focalLength: 2600, targetXOffset: 250, targetYOffset: 0 },
    CLOSEUP: { distance: 180, azimuth: 0, elevation: 18, focalLength: 1400, targetXOffset: 0, targetYOffset: 0 },
  },
} as const;

export type CameraConfigState = keyof typeof cameraConfig.states;
