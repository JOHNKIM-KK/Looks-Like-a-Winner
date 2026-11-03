import { REFERENCE } from "./stage";

/**
 * Every overlay position and size lives here.
 * The skill banner is an empty slot.
 */
export const overlayLayout = {
  view: REFERENCE,
  style: {
    fontFamily: '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    fontWeight: 700,
    background: "rgba(0, 0, 0, 0.45)",
    textColor: "#ffffff",
    outlineWidth: 2,
    outlineColor: "#000000",
  },
  placeAccents: {
    1: "#FFD54A",
    2: "#CFD8DC",
    3: "#D8A06A",
  },
  minimap: {
    left: 24,
    right: 24,
    bottom: 24,
    height: 47,
    insetX: 16,
    barHeight: 8,
    marker: 12,
    markerBorder: 1,
    track: "rgba(255, 255, 255, 0.35)",
    lead: "#FFD54A",
  },
  ranking: {
    left: 24,
    top: 24,
    width: 720,
    height: 150,
    paddingX: 8,
    paddingTop: 6,
    rowGap: 6,
    podium: {
      face: 40,
      gap: 10,
      fontSize: 18,
      borderWidth: 2,
      chipPad: 2,
      chipGap: 4,
    },
    chase: {
      face: 18,
      gap: 6,
      fontSize: 11,
      borderWidth: 2,
      chipPad: 1,
      chipGap: 2,
    },
  },
  countdown: {
    fontSize: 112,
    centerY: REFERENCE.height * 0.42,
  },
  caption: {
    left: 24,
    right: 24,
    bottom: 80,
    height: 96,
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 24,
    paddingX: 16,
    paddingY: 12,
    borderWidth: 4,
    borderColor: "#5ce1ff",
    background: "#1b1030",
    color: "#fff6ea",
  },
  skillSlot: {
    top: 24,
    right: 24,
    width: 360,
    height: 100,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
} as const;

export type OverlayHorse = {
  id: string;
  name: string;
  number: number;
  place: number;
  portrait: string;
  /** Presentation progress along the track, 0–1 and beyond while braking. */
  progress: number;
};

export type RaceOverlaySnapshot = {
  phase: "countdown" | "racing";
  countdown: string | null;
  horses: OverlayHorse[];
};

export function placeAccent(place: number): string | undefined {
  if (place === 1) return overlayLayout.placeAccents[1];
  if (place === 2) return overlayLayout.placeAccents[2];
  if (place === 3) return overlayLayout.placeAccents[3];
  return undefined;
}
