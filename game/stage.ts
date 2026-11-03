/** Race screen reference frame. The single source of the 16:9 geometry. */
export const REFERENCE = { width: 1600, height: 900 } as const;

/** Projection center in reference units. The y ratio 0.474 keeps the old portrait horizon placement. */
export const PROJECTION_CENTER = { x: REFERENCE.width / 2, y: REFERENCE.height * 0.474 } as const;

export type Size = { width: number; height: number };
export type Insets = { top: number; right: number; bottom: number; left: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** Parsed at the browser boundary. Values are finite, viewport is at least 1, insets are at least 0. */
export type StageInput = { viewport: Size; insets: Insets; pixelRatio: number; touchPortrait: boolean };

export type LandscapeStage = {
  kind: "landscape";
  viewport: Size;
  /** CSS px. Where the reference frame sits: contained and centered in the viewport. */
  frame: Rect;
  /** CSS px per reference unit. */
  scale: number;
  /** Reference units. The whole viewport mapped back to reference coordinates; contains the reference frame. */
  bleed: Rect;
  /** Reference units. Reference frame intersected with the safe area. HUD lives only here. */
  hud: Rect;
  /** Canvas backing pixels and the camera zoom (backing px per reference unit). */
  backing: { width: number; height: number; zoom: number };
};

export type PortraitStage = { kind: "portrait"; viewport: Size };

export type Stage = LandscapeStage | PortraitStage;

export function stageFor({ viewport, insets, pixelRatio, touchPortrait }: StageInput): Stage {
  if (touchPortrait) return { kind: "portrait", viewport };

  const scale = Math.min(viewport.width / REFERENCE.width, viewport.height / REFERENCE.height);
  const frame = {
    x: (viewport.width - REFERENCE.width * scale) / 2,
    y: (viewport.height - REFERENCE.height * scale) / 2,
    width: REFERENCE.width * scale,
    height: REFERENCE.height * scale,
  };
  const bleed = {
    x: -frame.x / scale,
    y: -frame.y / scale,
    width: viewport.width / scale,
    height: viewport.height / scale,
  };

  const left = Math.max(0, (insets.left - frame.x) / scale);
  const top = Math.max(0, (insets.top - frame.y) / scale);
  const right = Math.min(REFERENCE.width, (viewport.width - insets.right - frame.x) / scale);
  const bottom = Math.min(REFERENCE.height, (viewport.height - insets.bottom - frame.y) / scale);
  const hud = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };

  // Never draw the reference frame with more backing pixels than 1600x900: big desktop windows
  // pay reference cost and CSS upscales, high-DPR phones stay sharp.
  const resolution = Math.min(pixelRatio, 1 / scale);
  const backing = {
    width: Math.round(viewport.width * resolution),
    height: Math.round(viewport.height * resolution),
    zoom: scale * resolution,
  };

  return { kind: "landscape", viewport, frame, scale, bleed, hud, backing };
}
