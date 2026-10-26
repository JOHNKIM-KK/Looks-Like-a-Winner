import { describe, expect, test } from "vitest";
import { assignHorseSheet, assignRiderSheet, createMountedSlots } from "./mountedPair";
import { rankSlotModeFromSearch } from "./rankDisplay";
import {
  START_FRAME_OFFSET,
  gallopFrame,
  glyphFontPx,
  glyphHeightPx,
  glyphOutlinePx,
  luminance,
  pickHorseAngle,
  plateScreenOffset,
  relativeYawDeg,
  tintHorsePixels,
} from "./horseVisual";
import { distancePostProgresses } from "./artScale";
import { cameraFromLook } from "./cameraState";
import { laneRadius, presentationLogical, projectWithCamera } from "./track";
import { isDirt } from "./trackArt";

describe("horse angle", () => {
  test("yaw is negative in front of the horse and zero from its right side", () => {
    expect(relativeYawDeg(1, 0, 1, 0)).toBeCloseTo(-90, 5);
    expect(relativeYawDeg(1, 0, 0, -1)).toBeCloseTo(0, 5);
  });

  test("straight cameras use five yaws and corner cameras use three", () => {
    const straight = pickHorseAngle(10, 24);
    expect(straight.set).toBe("straight");
    expect(straight.yawDeg).toBe(15);
    expect(straight.flip).toBe(false);

    const corner = pickHorseAngle(18, 14);
    expect(corner.set).toBe("corner");
    expect(corner.yawDeg).toBe(20);
    expect(corner.flip).toBe(false);
  });

  test("a view from inside the bend flips the sheet", () => {
    const picked = pickHorseAngle(120, 22);
    expect(picked.flip).toBe(true);
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
});

describe("saddle number", () => {
  test("glyph height is at least 48px at 1080 and 24px at 540", () => {
    expect(glyphHeightPx(30, 1, 1080)).toBe(48);
    expect(glyphHeightPx(40, 2, 1080)).toBeCloseTo(92, 5);
    expect(glyphHeightPx(10, 1, 540)).toBe(24);
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
    const rider = { key: "rider-run", frameWidth: 80, frameHeight: 80, anchorX: 40, anchorY: 78, frames: 8 };
    const next = assignRiderSheet(slots, rider);
    expect(next.rider?.key).toBe("rider-run");
    expect(next.horse).toBeNull();
    const horse = { key: "horse-only", frameWidth: 100, frameHeight: 80, anchorX: 50, anchorY: 78, frames: 12 };
    expect(assignHorseSheet(next, horse).horse?.key).toBe("horse-only");
    expect(assignHorseSheet(next, horse).rider?.key).toBe("rider-run");
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
