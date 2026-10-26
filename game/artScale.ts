import { INNER_RADIUS, LANE_GAP } from "./track";

/**
 * The race camera stays in logical units (lane gap = LANE_GAP).
 * Phase 2 art is authored in meters. One lane (1.55 m in the straight layout)
 * maps onto one logical lane so the tiles, rails, and horses share the camera
 * the framing code already uses.
 */
export const LANE_WIDTH_M = 1.55;
export const LOGICAL_PER_METER = LANE_GAP / LANE_WIDTH_M;

export const LANE0_Y_M = 1.2;
export const RAIL_FAR_Y_M = -1.3;
export const RAIL_NEAR_Y_M = 13.9;
/** Authored infield distances. The home camera is only ~9.8 m high, so a 10.4 m stand at 100 m sits above the frame. */
export const TREES_Y_M = -48.66;
export const STANDS_Y_M = -100.7;
/**
 * Drawn distances behind the far rail. The authored 48 m / 100 m offsets put the
 * home-straight grandstand above this camera, so the strips sit closer to the
 * rail. Full height still reaches past the top of the frame; the seats stay in view.
 */
export const TREES_BEHIND_RAIL_M = 5;
export const STANDS_BEHIND_RAIL_M = 9;
export const STRIP_HEIGHT_SCALE = 1;

export const TILE_M = 5.12;
export const GROUND_PX_PER_M = 100;
export const HORSE_PX_PER_M = 96.9697;
export const RACE_LENGTH_M = 1600;
export const DISTANCE_POST_EVERY_M = 200;

export const RAIL_SEGMENT_M = 4;
export const RAIL_POST_SPACING_M = 2;
export const STRIP_PERIOD_M = 12;

export const BACKDROP = "#3F4630";
export const SHADOW_COLOR = "#46200E";
export const SHADOW_SHEAR = 2.5;
export const SHADOW_SQUASH = 0.3;
export const SHADOW_ALPHA = 0.75;
export const SHADOW_BLUR_PX = 3;

export const HOME_STAND_HEIGHT_SCALE = STRIP_HEIGHT_SCALE;

export function radiusForArtY(artY: number) {
  return INNER_RADIUS + (artY - LANE0_Y_M) * LOGICAL_PER_METER;
}

export function farRailRadius() {
  return radiusForArtY(RAIL_FAR_Y_M);
}

export function nearRailRadius() {
  return radiusForArtY(RAIL_NEAR_Y_M);
}

/** Horse sheet pixels to screen pixels. `pixelsPerLogical` is the camera scale (focal / depth). */
export function horseSpriteScale(pixelsPerLogical: number) {
  return pixelsPerLogical * LOGICAL_PER_METER / HORSE_PX_PER_M;
}

/** Prop / rail sheet pixels to screen pixels. */
export function propSpriteScale(pixelsPerLogical: number, pxPerM = GROUND_PX_PER_M) {
  return pixelsPerLogical * LOGICAL_PER_METER / pxPerM;
}

/** Progress values (0–1) where a distance post stands. 200 m, 400 m, … before the finish. */
export function distancePostProgresses(raceMeters = RACE_LENGTH_M, every = DISTANCE_POST_EVERY_M) {
  const posts: number[] = [];
  for (let meters = every; meters < raceMeters - 1e-6; meters += every) {
    posts.push(meters / raceMeters);
  }
  return posts;
}
