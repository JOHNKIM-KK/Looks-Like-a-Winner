/**
 * Retune the race camera here. State looks, the safe-frame margins, damping,
 * and the background targets all live in this object.
 * "all" states only widen a state look. "topN" states pick a distance and focal
 * length so the leaders' box fills the safe width, and never zoom in past
 * `framing.maxZoom`.
 */

export type FrameFitRule = "all" | "topN";

/**
 * How `requestFrameInclude` pulls one horse into view.
 * "widen" pulls the state camera out until that horse fits.
 * "cut" records the request and leaves the pack frame alone, so a short cut can show them.
 */
export type FrameIncludePolicy = "widen" | "cut";

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
    /** Seconds to ease a zoom / widen. A hard clip still snaps wide enough to fit. */
    dampSec: 0.3,
    /**
     * Closest a topN fit may pull the state camera, as a multiple of its distance
     * and focal length. 2.5 allows 0.4× the distance and 2.5× the focal length.
     * The fit may dolly farther than the state camera, and it stops once the
     * leaders fill the safe width.
     */
    maxZoom: 2.5,
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
    /**
     * Leaders that must stay inside the safe rect when a state's rule is "topN".
     * Horses ranked below this may leave the frame.
     */
    topN: 5,
    /** See FrameIncludePolicy. Skills are not wired to this. */
    includePolicy: "widen" as FrameIncludePolicy,
    /** "all" fits every horse. "topN" fits only the current top `topN`. */
    rules: {
      START: "all",
      STRAIGHT_EARLY: "all",
      STRAIGHT_HOME: "topN",
      CORNER_IN: "topN",
      CORNER_OUT: "topN",
      FINISH: "topN",
      CLOSEUP: "all",
    } satisfies Record<string, FrameFitRule>,
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
