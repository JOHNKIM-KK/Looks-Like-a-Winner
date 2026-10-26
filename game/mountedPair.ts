/**
 * Horse and rider are separate slots that share one ground anchor.
 * `rider === null` means "draw the riding jockey sheet for this angle".
 * Phase 3 calls `disableRideLayer` or `transferRideLayer` when a jockey
 * falls or changes horses. Those functions are not used by the race loop yet.
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
  /** Null uses the baked horse-only gallop sheet. */
  horse: SpriteSheetRef | null;
  /** Null uses the baked ride sheet. A sheet here replaces that ride layer. */
  rider: SpriteSheetRef | null;
  /** False: this horse is riderless. The ride layer is not drawn. */
  rideEnabled: boolean;
};

export function createMountedSlots(): MountedSlots {
  return { horse: null, rider: null, rideEnabled: true };
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

export function riderSheetKey(slots: MountedSlots, rideKey: string): string | null {
  if (!slots.rideEnabled) return null;
  return slots.rider?.key ?? rideKey;
}

/** Phase 3: take the ride layer off this horse. Not called by the race loop. */
export function disableRideLayer(slots: MountedSlots): MountedSlots {
  return { ...slots, rider: null, rideEnabled: false };
}

/**
 * Phase 3: move the ride layer from one horse onto another.
 * The source becomes riderless. Not called by the race loop.
 */
export function transferRideLayer(from: MountedSlots, to: MountedSlots): { from: MountedSlots; to: MountedSlots } {
  return {
    from: { ...from, rider: null, rideEnabled: false },
    to: { ...to, rider: from.rider, rideEnabled: true },
  };
}
