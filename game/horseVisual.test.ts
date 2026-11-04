import { describe, expect, test } from "vitest";
import { assignHorseSheet, assignRiderSheet, createMountedSlots, disableRideLayer, transferRideLayer } from "./mountedPair";
import { RIDE_ANGLES, horseAttach, ridePose } from "./jockeyRide";
import { rankSlotModeFromSearch } from "./rankDisplay";
import {
  HORSE_ANGLES,
  START_FRAME_OFFSET,
  gallopFrame,
  IDLE_FRAME,
  glyphFontPx,
  glyphHeightPx,
  glyphOutlinePx,
  luminance,
  cameraElevationDeg,
  headingView,
  pickHorseAngle,
  plateScreenOffset,
  JOCKEY_TINT_GAMMA,
  type PickedAngle,
  tintHorsePixels,
  tintJockeyPixels,
} from "./horseVisual";
import { distancePostProgresses } from "./artScale";
import { cameraFromLook } from "./cameraState";
import { createDefaultCamera, laneRadius, presentationLogical, projectWithCamera, segmentEnds } from "./track";
import { isDirt } from "./trackArt";

describe("horse heading", () => {
  // HEADING_RULE §7: [scene, camera (x, y, height), horse (x, y), tangent, sheetYaw, sheet, flip]
  const storyboard = [
    ["01 lane 1", [-4, -66, 34], [-48.42, 7.4], [1, 0], -31.2, "straight_0", true],
    ["01 lane 12", [-4, -66, 34], [-48.42, 20.6], [1, 0], -27.2, "straight_0", true],
    ["02 lane 1", [-25.07, 0, 15], [-48.42, 7.4], [1, 0], -72.4, "wide_1", true],
    ["02 lane 12", [-25.07, 0, 15], [-48.42, 20.6], [1, 0], -48.6, "wide_3", true],
    ["03 lane 2", [-32.07, 8.25, 3.6], [-48.42, 8.6], [1, 0], -88.8, "wide_0", true],
    ["03 lane 12", [-32.07, 8.25, 3.6], [-48.42, 20.6], [1, 0], -52.9, "wide_2", true],
    ["04 lane 12", [-44.07, 31.85, 15], [-48.42, 20.6], [1, 0], -21.1, "straight_1", false],
    ["04 lane 1", [-44.07, 31.85, 15], [-48.42, 7.4], [1, 0], -10.1, "straight_1", false],
    ["05 lane 1", [-35.07, -0.35, 5], [-45.09, 7.4], [1, 0], -52.3, "wide_3", true],
    ["05 lane 12", [-35.07, -0.35, 5], [-44.14, 20.6], [1, 0], -23.4, "straight_0", true],
    ["06 lane 6", [-2.07, -2.35, 4.2], [-21.01, 12.2], [1, 0], -52.5, "wide_3", true],
    ["06 lane 3", [-2.07, -2.35, 4.2], [-3.07, 9.8], [1, 0], -4.7, "straight_2", true],
    ["07 lane 6", [50.92, -4, 6.5], [23.11, 8.05], [0.936, -0.353], -87.3, "wide_0", true],
    ["07 lane 3", [50.92, -4, 6.5], [26.6, -3.49], [-0.471, -0.882], 26.9, "corner_1", false],
    ["08 lane 9", [12, 2, 15], [7.03, -13.4], [-1, 0], 17.9, "straight_3", true],
    ["08 lane 1", [12, 2, 15], [-14.47, -7.4], [-1, 0], 70.5, "wide_6", true],
    ["09 lane 2", [3.69, 0.65, 3], [-20.37, 7.39], [0.999, 0.041], -72.0, "wide_1", true],
    ["09 lane 9", [3.69, 0.65, 3], [-26.79, 10.18], [0.835, 0.551], -39.2, "wide_3", true],
    ["10 lane 2", [9.69, -1.35, 4.5], [-2.06, 7.4], [1, 0], -53.3, "wide_2", true],
    ["10 lane 3", [9.69, -1.35, 4.5], [7.29, 8.6], [1, 0], -13.6, "straight_1", true],
  ] as const;

  const sheetName = (picked: PickedAngle) => `${picked.set}_${picked.index}`;

  test.each(storyboard)("%s picks the storyboard sheet and flip", (_, camera, horse, tangent, yaw, sheet, flip) => {
    const toCamX = camera[0] - horse[0];
    const toCamY = camera[1] - horse[1];
    const view = headingView(tangent[0], tangent[1], toCamX, toCamY);
    const picked = pickHorseAngle(view, cameraElevationDeg(camera[2], toCamX, toCamY));
    expect(Math.abs(view.sheetYaw - yaw)).toBeLessThan(0.1);
    expect(sheetName(picked)).toBe(sheet);
    expect(picked.flip).toBe(flip);
  });

  test("side views pick the straight profile and flip toward the camera side", () => {
    const fromLeft = pickHorseAngle(headingView(1, 0, 0, 10), 24);
    expect(sheetName(fromLeft)).toBe("straight_2");
    expect(fromLeft.flip).toBe(false);
    const fromRight = pickHorseAngle(headingView(1, 0, 0, -10), 24);
    expect(sheetName(fromRight)).toBe("straight_2");
    expect(fromRight.flip).toBe(true);
    expect(sheetName(pickHorseAngle(headingView(1, 0, 7, 7), 24))).toBe("wide_3");
  });

  test("dead-ahead and dead-behind views clamp to the wide ends and hold the previous flip", () => {
    const prev: PickedAngle = { set: "straight", index: 2, yawDeg: 0, flip: true };
    const ahead = headingView(1, 0, 10, 0.01);
    expect(ahead.sheetYaw).toBeCloseTo(-89.9, 1);
    expect(sheetName(pickHorseAngle(ahead, 24))).toBe("wide_0");
    expect(pickHorseAngle(ahead, 24).flip).toBe(false);
    expect(pickHorseAngle(ahead, 24, prev).flip).toBe(true);
    const behind = headingView(1, 0, -10, 0.01);
    expect(behind.sheetYaw).toBeCloseTo(89.9, 1);
    expect(sheetName(pickHorseAngle(behind, 24))).toBe("wide_6");
    expect(pickHorseAngle(behind, 24, prev).flip).toBe(true);
  });

  const viewAt = (sheetYaw: number) => ({ sheetYaw, flip: false, side: 1 });
  const straightCenter: PickedAngle = { set: "straight", index: 2, yawDeg: 0, flip: false };
  const cornerCenter: PickedAngle = { set: "corner", index: 0, yawDeg: 0, flip: false };

  test("a yaw bucket holds until the yaw leaves its center by more than 10.5°", () => {
    expect(sheetName(pickHorseAngle(viewAt(9), 24))).toBe("straight_3");
    expect(sheetName(pickHorseAngle(viewAt(9), 24, straightCenter))).toBe("straight_2");
    expect(sheetName(pickHorseAngle(viewAt(11), 24, straightCenter))).toBe("straight_3");
  });

  test("the corner set enters below 15° and leaves above 18°", () => {
    expect(pickHorseAngle(viewAt(0), 16, cornerCenter).set).toBe("corner");
    expect(pickHorseAngle(viewAt(0), 16).set).toBe("straight");
    expect(pickHorseAngle(viewAt(0), 14.9, straightCenter).set).toBe("corner");
    expect(pickHorseAngle(viewAt(0), 18.1, cornerCenter).set).toBe("straight");
  });

  test("selected sprites face the screen-space travel direction around the track", () => {
    const ends = segmentEnds();
    const samples = [
      ["start chute", 0],
      ["corner", (ends.corner12Entry + ends.corner12Exit) / 2],
      ["back straight", (ends.corner12Exit + ends.backEnd) / 2],
      ["home straight", (ends.corner34Exit + 1) / 2],
      ["finish", 1],
    ] as const;
    const camera = createDefaultCamera();

    for (const [name, progress] of samples) {
      const logical = presentationLogical(progress, 6);
      const pose = projectWithCamera(logical, camera);
      const toCamX = camera.groundX - logical.x;
      const toCamY = camera.groundY - logical.y;
      const picked = pickHorseAngle(
        headingView(logical.tx, logical.ty, toCamX, toCamY),
        cameraElevationDeg(camera.height, toCamX, toCamY),
      );
      const spriteFacingX = picked.flip ? -1 : 1;

      expect(picked.flip, name).toBe(pose.flipX);
      expect(spriteFacingX * pose.tangentX, name).toBeGreaterThan(0);
    }
  });
});

describe("gallop clock", () => {
  test("horses start on the authored frame and advance at 24 fps", () => {
    expect(START_FRAME_OFFSET).toEqual([0, 5, 9, 2, 7, 4, 11, 6]);
    expect(gallopFrame(1, 0)).toBe(0);
    expect(gallopFrame(2, 0)).toBe(5);
    expect(gallopFrame(1, 1 / 24)).toBe(1);
    expect(gallopFrame(8, 0)).toBe(6);
  });

  test("the gate holds one gathered sheet frame instead of a staggered stride", () => {
    expect(IDLE_FRAME).toBeGreaterThanOrEqual(0);
    expect(IDLE_FRAME).toBeLessThan(12);
    expect(IDLE_FRAME).not.toBe(START_FRAME_OFFSET[1]);
  });

  test("lanes 9–12 reuse the gallop offsets of lanes 1–8", () => {
    for (const lane of [9, 10, 11, 12]) {
      expect(gallopFrame(lane, 0)).toBe(gallopFrame(lane - 8, 0));
      expect(gallopFrame(lane, 0.5)).toBe(gallopFrame(lane - 8, 0.5));
    }
  });
});

describe("saddle number", () => {
  test("glyph height is at least 48px at 1080 and 24px at 540", () => {
    expect(glyphHeightPx(30, 1, 1080)).toBe(48);
    expect(glyphHeightPx(40, 2, 1080)).toBeCloseTo(92, 5);
    expect(glyphHeightPx(10, 1, 540)).toBe(24);
    expect(glyphHeightPx(10, 1)).toBe(40);
    expect(glyphFontPx(48)).toBeCloseTo(62.4, 5);
    expect(glyphOutlinePx(20)).toBe(3);
    expect(glyphOutlinePx(40)).toBeCloseTo(4.8, 5);
  });

  test("flip mirrors the plate across the ground anchor", () => {
    const plate = { cx: 100, cy: 80, h: 30 };
    expect(plateScreenOffset(plate, 160, 200, 1, false).x).toBeCloseTo(-60, 5);
    expect(plateScreenOffset(plate, 160, 200, 1, true).x).toBeCloseTo(60, 5);
  });
});

describe("lane tint", () => {
  test("coat stays put and the silk mask takes the lane color", () => {
    const color = new Uint8ClampedArray([200, 100, 50, 255]);
    const clear = new Uint8ClampedArray([255, 0, 0, 255]);
    const out = new Uint8ClampedArray(4);
    tintHorsePixels(color, clear, [229, 23, 63], out);
    expect([...out]).toEqual([200, 100, 50, 255]);

    const silk = new Uint8ClampedArray([0, 255, 0, 255]);
    tintHorsePixels(color, silk, [229, 23, 63], out);
    const lum = luminance(200, 100, 50);
    const gain = (lum / 185) ** 1.1;
    expect(out[0]).toBe(Math.round(Math.min(255, 229 * gain)));
    expect(out[1]).toBe(Math.round(Math.min(255, 23 * gain)));
    expect(out[3]).toBe(255);
  });

  test("the jockey tint uses the G channel and a steeper gamma", () => {
    const color = new Uint8ClampedArray([200, 100, 50, 255]);
    const silk = new Uint8ClampedArray([0, 255, 0, 255]);
    const plate = new Uint8ClampedArray([0, 0, 255, 255]);
    const out = new Uint8ClampedArray(4);
    tintJockeyPixels(color, silk, [229, 23, 63], out);
    const lum = luminance(200, 100, 50);
    const gain = (lum / 185) ** JOCKEY_TINT_GAMMA;
    expect(JOCKEY_TINT_GAMMA).toBeCloseTo(1.4);
    expect(out[0]).toBe(Math.round(Math.min(255, 229 * gain)));
    expect(out[1]).toBe(Math.round(Math.min(255, 23 * gain)));
    tintJockeyPixels(color, plate, [229, 23, 63], out);
    expect([...out]).toEqual([200, 100, 50, 255]);
  });

  test("the plate mask is a lane-colored panel", () => {
    const color = new Uint8ClampedArray([200, 100, 50, 255]);
    const plate = new Uint8ClampedArray([0, 0, 255, 255]);
    const out = new Uint8ClampedArray(4);
    tintHorsePixels(color, plate, [229, 23, 63], out);
    const lum = luminance(200, 100, 50);
    const gain = lum / 200;
    expect(out[0]).toBe(Math.round(229 * gain));
    expect(out[2]).toBe(Math.round(63 * gain));
  });
});

describe("mounted pair", () => {
  test("a rider sheet swaps in without replacing the horse slot", () => {
    const slots = createMountedSlots();
    expect(slots.rideEnabled).toBe(true);
    const rider = { key: "rider-run", frameWidth: 80, frameHeight: 80, anchorX: 40, anchorY: 78, frames: 8 };
    const next = assignRiderSheet(slots, rider);
    expect(next.rider?.key).toBe("rider-run");
    expect(next.horse).toBeNull();
    const horse = { key: "horse-only", frameWidth: 100, frameHeight: 80, anchorX: 50, anchorY: 78, frames: 12 };
    expect(assignHorseSheet(next, horse).horse?.key).toBe("horse-only");
    expect(assignHorseSheet(next, horse).rider?.key).toBe("rider-run");
  });

  test("ride can be taken off one horse and moved onto another", () => {
    const donor = assignRiderSheet(createMountedSlots(), {
      key: "ride-a",
      frameWidth: 10,
      frameHeight: 10,
      anchorX: 5,
      anchorY: 9,
      frames: 12,
    });
    const bare = disableRideLayer(donor);
    expect(bare.rideEnabled).toBe(false);
    expect(bare.rider).toBeNull();

    const moved = transferRideLayer(donor, createMountedSlots());
    expect(moved.from.rideEnabled).toBe(false);
    expect(moved.to.rideEnabled).toBe(true);
    expect(moved.to.rider?.key).toBe("ride-a");
    expect(moved.from.rider).toBeNull();
  });
});

describe("ride seating", () => {
  test("the jockey hips sit on horse_attach inside the horse frame", () => {
    const [hipsX, hipsY] = horseAttach("straight", 2, 0);
    const seated = ridePose("straight", 2, 0, 160, 207.73, 1, false);
    expect(seated).not.toBeNull();
    if (!seated) return;
    expect(seated.x).toBeCloseTo(hipsX - 160, 4);
    expect(seated.y).toBeCloseTo(hipsY - 207.73, 4);
    expect(seated.y).toBeLessThan(0);
    const flipped = ridePose("straight", 2, 0, 160, 207.73, 2, true);
    expect(flipped?.x).toBeCloseTo(-(hipsX - 160) * 2, 4);
  });

  test("wide angles seat the ride sheet at offset_in_horse_frame and mirror under flip", () => {
    const anchor = HORSE_ANGLES.wide[4];
    const ride = RIDE_ANGLES.wide[4];
    expect(anchor && ride).toBeTruthy();
    if (!anchor || !ride) return;
    for (let index = 0; index < HORSE_ANGLES.wide.length; index += 1) {
      expect(() => ridePose("wide", index, 3, anchor.anchorX, anchor.anchorY, 1, false)).not.toThrow();
    }
    const scale = 1.5;
    const seated = ridePose("wide", 4, 3, anchor.anchorX, anchor.anchorY, scale, false);
    const flipped = ridePose("wide", 4, 3, anchor.anchorX, anchor.anchorY, scale, true);
    expect(seated && flipped).toBeTruthy();
    if (!seated || !flipped) return;
    const topLeftX = seated.x - seated.originX * seated.frameW * scale;
    const topLeftY = seated.y - seated.originY * seated.frameH * scale;
    expect(topLeftX).toBeCloseTo((ride.offsetX - anchor.anchorX) * scale, 4);
    expect(topLeftY).toBeCloseTo((ride.offsetY - anchor.anchorY) * scale, 4);
    expect(flipped.x).toBeCloseTo(-seated.x, 4);
    expect(flipped.originX).toBeCloseTo(seated.originX, 6);
  });
});

describe("rank slot mode", () => {
  test("hud query selects face or name and otherwise uses the phase-1 default", () => {
    expect(rankSlotModeFromSearch("")).toBe("name");
    expect(rankSlotModeFromSearch("?hud=face")).toBe("face");
    expect(rankSlotModeFromSearch("?hud=name")).toBe("name");
    expect(rankSlotModeFromSearch("?hud=photo")).toBe("name");
  });
});

describe("track art placement", () => {
  test("distance posts sit every 200 m of the 1600 m race", () => {
    const posts = distancePostProgresses();
    expect(posts).toHaveLength(7);
    expect(posts[0]).toBeCloseTo(0.125, 5);
    expect(posts.at(-1)).toBeCloseTo(0.875, 5);
  });

  test("dirt is the band between the rails and the infield is turf", () => {
    expect(isDirt(0, 0)).toBe(false);
    expect(isDirt(0, laneRadius(1))).toBe(true);
    expect(isDirt(0, 8000)).toBe(false);
    const lane = presentationLogical(0.95, 1);
    expect(isDirt(lane.x, lane.y)).toBe(true);
  });

  test("raising z moves a point up the screen and z=0 matches a ground point", () => {
    const camera = cameraFromLook({
      targetX: 0,
      targetY: 0,
      distance: 400,
      azimuth: 0,
      elevation: 20,
      focalLength: 1000,
    });
    const ground = projectWithCamera({ x: 0, y: 0, tx: 0, ty: 0 }, camera);
    const same = projectWithCamera({ x: 0, y: 0, z: 0, tx: 0, ty: 0 }, camera);
    const raised = projectWithCamera({ x: 0, y: 0, z: 10, tx: 0, ty: 0 }, camera);
    expect(same.x).toBeCloseTo(ground.x, 5);
    expect(same.y).toBeCloseTo(ground.y, 5);
    expect(raised.y).toBeLessThan(ground.y);
  });
});
