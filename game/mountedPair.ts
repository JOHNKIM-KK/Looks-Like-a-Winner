/**
 * Horse and rider are separate slots that share one ground anchor.
 * The shipped sheets bake both into one image. Until a rider-only sheet is
 * assigned, the rider slot repeats that baked sheet at the same pose.
 * Phase 3 can call `assignRiderSheet` (and `assignHorseSheet` for a horse-only
 * sheet) without touching the race simulator.
 */

export type SpriteSheetRef = {
  key: string;
  frameWidth: number;
  frameHeight: number;
  anchorX: number;
  anchorY: number;
  frames: number;
};

export type MountedSlots = {
  /** Null uses the baked combined gallop sheet. */
  horse: SpriteSheetRef | null;
  /** Null repeats whatever the horse slot is showing. */
  rider: SpriteSheetRef | null;
};

export function createMountedSlots(): MountedSlots {
  return { horse: null, rider: null };
}

export function assignHorseSheet(slots: MountedSlots, sheet: SpriteSheetRef): MountedSlots {
  return { ...slots, horse: sheet };
}

export function assignRiderSheet(slots: MountedSlots, sheet: SpriteSheetRef): MountedSlots {
  return { ...slots, rider: sheet };
}

export function horseSheetKey(slots: MountedSlots, bakedKey: string) {
  return slots.horse?.key ?? bakedKey;
}

export function riderSheetKey(slots: MountedSlots, bakedKey: string) {
  return slots.rider?.key ?? horseSheetKey(slots, bakedKey);
}
