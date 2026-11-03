import { describe, expect, test } from "vitest";
import { REFERENCE, stageFor, type Insets, type LandscapeStage, type Rect, type StageInput } from "./stage";

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

function landscape(input: Partial<StageInput> & Pick<StageInput, "viewport">): LandscapeStage {
  const stage = stageFor({ insets: NO_INSETS, pixelRatio: 1, touchPortrait: false, ...input });
  if (stage.kind !== "landscape") throw new Error(`expected landscape, got ${stage.kind}`);
  return stage;
}

function expectRect(actual: Rect, expected: Rect, digits = 6) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.width).toBeCloseTo(expected.width, digits);
  expect(actual.height).toBeCloseTo(expected.height, digits);
}

function toCss(stage: LandscapeStage, rect: Rect): Rect {
  return {
    x: stage.frame.x + rect.x * stage.scale,
    y: stage.frame.y + rect.y * stage.scale,
    width: rect.width * stage.scale,
    height: rect.height * stage.scale,
  };
}

function expectHudOnSafeEdges(stage: LandscapeStage, insets: Insets) {
  const css = toCss(stage, stage.hud);
  expect(css.x).toBeCloseTo(insets.left, 6);
  expect(css.y).toBeCloseTo(insets.top, 6);
  expect(css.x + css.width).toBeCloseTo(stage.viewport.width - insets.right, 6);
  expect(css.y + css.height).toBeCloseTo(stage.viewport.height - insets.bottom, 6);
}

describe("stageFor", () => {
  test("1600x900 fills the viewport with the reference frame and no bleed", () => {
    const stage = landscape({ viewport: { width: 1600, height: 900 } });
    expect(stage.scale).toBe(1);
    expectRect(stage.frame, { x: 0, y: 0, width: 1600, height: 900 });
    expectRect(stage.bleed, { x: 0, y: 0, width: 1600, height: 900 });
    expectRect(stage.hud, { x: 0, y: 0, width: 1600, height: 900 });
    expect(stage.backing).toEqual({ width: 1600, height: 900, zoom: 1 });
  });

  test("1920x1080 scales the frame up and caps backing at reference pixels", () => {
    const stage = landscape({ viewport: { width: 1920, height: 1080 }, pixelRatio: 2 });
    expect(stage.scale).toBeCloseTo(1.2, 9);
    expectRect(stage.frame, { x: 0, y: 0, width: 1920, height: 1080 });
    expectRect(stage.bleed, { x: 0, y: 0, width: 1600, height: 900 });
    expect(stage.backing.width).toBe(1600);
    expect(stage.backing.height).toBe(900);
    expect(stage.backing.zoom).toBeCloseTo(1, 9);
  });

  test("2560x1080 ultrawide bleeds sideways, never letterboxes", () => {
    const stage = landscape({ viewport: { width: 2560, height: 1080 } });
    expect(stage.scale).toBeCloseTo(1.2, 9);
    expectRect(stage.frame, { x: 320, y: 0, width: 1920, height: 1080 });
    expectRect(stage.bleed, { x: -320 / 1.2, y: 0, width: 2560 / 1.2, height: 900 });
    expectRect(stage.hud, stage.bleed);
  });

  test("1280x800 (16:10) bleeds above and below", () => {
    const stage = landscape({ viewport: { width: 1280, height: 800 } });
    expect(stage.scale).toBeCloseTo(0.8, 9);
    expectRect(stage.frame, { x: 0, y: 40, width: 1280, height: 720 });
    expectRect(stage.bleed, { x: 0, y: -50, width: 1600, height: 1000 });
    expectRect(stage.hud, stage.bleed);
  });

  test("landscape phone with a notch keeps the HUD on the safe-area edges", () => {
    const insets = { top: 0, right: 47, bottom: 21, left: 47 };
    const stage = landscape({ viewport: { width: 844, height: 390 }, insets, pixelRatio: 3 });
    const scale = 390 / 900;
    expect(stage.scale).toBeCloseTo(scale, 9);
    expect(stage.frame.x).toBeCloseTo((844 - 1600 * scale) / 2, 9);
    expect(stage.bleed.x).toBeLessThan(0);
    expect(stage.bleed.y).toBeCloseTo(0, 9);
    expect(stage.hud.y).toBeCloseTo(0, 9);
    expect(stage.hud.y + stage.hud.height).toBeCloseTo(900 - 21 / scale, 6);
    expectHudOnSafeEdges(stage, insets);
    expect(stage.backing.zoom).toBeCloseTo(1, 9);
  });

  test("a notch that reaches into the frame pushes the HUD inward", () => {
    const insets = { top: 0, right: 0, bottom: 0, left: 60 };
    const stage = landscape({ viewport: { width: 800, height: 450 }, insets });
    expectRect(stage.hud, { x: 120, y: 0, width: 1480, height: 900 });
    expectHudOnSafeEdges(stage, insets);
  });

  test("touch device held upright asks to rotate and carries no geometry", () => {
    const stage = stageFor({
      viewport: { width: 390, height: 844 },
      insets: { top: 47, right: 0, bottom: 34, left: 0 },
      pixelRatio: 3,
      touchPortrait: true,
    });
    expect(stage).toEqual({ kind: "portrait", viewport: { width: 390, height: 844 } });
  });

  test("a narrow desktop window bleeds vertically instead of asking to rotate", () => {
    const stage = landscape({ viewport: { width: 500, height: 900 } });
    expect(stage.bleed.x).toBeCloseTo(0, 9);
    expect(stage.bleed.y).toBeLessThan(0);
  });

  test("any landscape viewport fills edge to edge and keeps the frame 16:9", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let i = 0; i < 300; i++) {
      const viewport = { width: 200 + random() * 3000, height: 200 + random() * 2000 };
      const insets = { top: random() * 60, right: random() * 60, bottom: random() * 60, left: random() * 60 };
      const stage = landscape({ viewport, insets, pixelRatio: 1 + random() * 2 });

      expect(stage.frame.width / stage.frame.height).toBeCloseTo(16 / 9, 9);
      expect(stage.bleed.width * stage.scale).toBeCloseTo(viewport.width, 6);
      expect(stage.bleed.height * stage.scale).toBeCloseTo(viewport.height, 6);
      expect(stage.bleed.x).toBeLessThanOrEqual(1e-9);
      expect(stage.bleed.y).toBeLessThanOrEqual(1e-9);
      expect(stage.bleed.x + stage.bleed.width).toBeGreaterThanOrEqual(REFERENCE.width - 1e-6);
      expect(stage.bleed.y + stage.bleed.height).toBeGreaterThanOrEqual(REFERENCE.height - 1e-6);
      expect(Math.min(Math.abs(stage.bleed.x), Math.abs(stage.bleed.y))).toBeLessThan(1e-9);
      expect(stage.backing.width).toBeLessThanOrEqual(Math.ceil(stage.bleed.width));
      expectHudOnSafeEdges(stage, insets);
    }
  });
});
