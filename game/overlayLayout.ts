import { RACE_METERS } from "./track";
import { REFERENCE } from "./stage";

/**
 * Every overlay position and size lives here, in 1600x900 reference units
 * measured from storyboard scenes 09 and 10. Offsets are from the HUD rect.
 */
export const overlayLayout = {
  view: REFERENCE,
  style: {
    fontFamily: '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    panel: "rgba(30, 19, 50, 0.9)",
    panelEdge: "rgba(255, 255, 255, 0.08)",
    border: "#5CE1FF",
    first: "#FFE14A",
    text: "#FFFFFF",
    soft: "#ECE6F5",
    outlineWidth: 2,
    outlineColor: "#000000",
  },
  badge: {
    radius: 5,
    /** Lane 8 cloth is near-black and needs an edge on the dark panel. */
    edgedLanes: [8] as readonly number[],
    edge: "#F2F0E8",
  },
  board: {
    left: 18,
    top: 16,
    width: 744,
    height: 150,
    radius: 10,
    padX: 16,
    podium: {
      top: 12,
      width: (744 - 16 * 2 - 12 * 2) / 3,
      height: 63,
      gap: 12,
      radius: 8,
      border: 2.5,
      padLeft: 6,
      placeWidth: 20,
      placeSize: 28,
      badge: 28,
      badgeSize: 16,
      nameGap: 4,
      /** Clearance so an 8-grapheme name ends before the card edge. */
      nameInset: 6,
      nameSize: 20,
    },
    chase: {
      top: 88,
      width: 72,
      height: 48,
      gap: 8,
      radius: 8,
      border: 2,
      padLeft: 10,
      placeWidth: 20,
      placeSize: 18,
      badge: 30,
      badgeSize: 22,
    },
  },
  ticker: {
    left: 18,
    right: 18,
    bottom: 13,
    height: 105,
    radius: 10,
    caption: {
      top: 10,
      insetX: 12,
      height: 57,
      border: 3,
      radius: 8,
      padX: 15,
      label: "실황 중계",
      labelSize: 20,
      labelGap: 29,
      textSize: 24,
    },
    progress: {
      centerY: 86,
      left: 30,
      right: 152,
      barHeight: 9,
      fill: "#F9B33E",
      track: "rgba(206, 190, 130, 0.72)",
      marker: 15,
      markerEdge: 1.5,
      distanceRight: 30,
      distanceSize: 19,
    },
  },
  results: {
    top: 16,
    right: 18,
    /** Kept clear below the buttons. The panel and buttons shrink together when the HUD is shorter. */
    bottom: 16,
    width: 530,
    height: 709,
    radius: 12,
    border: 3,
    padX: 15,
    title: `경주 결과 · ${RACE_METERS}m`,
    titleCenterY: 33,
    titleSize: 32,
    rowsTop: 74,
    rowHeight: 49,
    rowPitch: 52.5,
    rowRadius: 8,
    rowBorder: 2,
    rowFill: "#3B2962",
    placeLeft: 20,
    badgeLeft: 51,
    badge: 30,
    badgeSize: 20,
    nameGap: 16,
    podiumPlaceSize: 29,
    placeSize: 21,
    podiumNameSize: 27,
    nameSize: 22,
    gapRight: 18,
    gapSize: 21,
  },
  /**
   * Winner chip. The small one sits in the gap between the rank board and the
   * results panel. The large one sits under the rank board, left of the panel.
   */
  winner: {
    small: { top: 16, left: 770, maxWidth: 270, fontSize: 18, padX: 12, padY: 7, radius: 8 },
    large: { top: 178, left: 36, maxWidth: 980, fontSize: 42, padX: 20, padY: 12, radius: 12 },
  },
  /** Under the results panel, splitting its width. */
  actions: {
    top: 12,
    gap: 12,
    height: 56,
    fontSize: 22,
  },
  countdown: {
    fontSize: 480,
    centerY: REFERENCE.height * 0.42,
    depth: 22,
  },
  lineup: {
    rowHeight: 58,
    badge: 44,
    badgeSize: 22,
    gap: 16,
    nameSize: 26,
    column: 500,
    wideColumn: 640,
  },
} as const;

/** 12-horse board stays 150. Two or three horses drop the empty chip band. */
export function rankBoardHeight(count: number) {
  const { board } = overlayLayout;
  const pad = board.height - (board.chase.top + board.chase.height);
  if (count > 3) return board.height;
  return board.podium.top + board.podium.height + pad;
}

/** Panel height for `rowCount` result rows. Twelve rows keep the 709px panel. */
export function resultsPanelHeight(rowCount: number) {
  const { results } = overlayLayout;
  const rows = Math.max(1, Math.min(12, Math.floor(rowCount) || 1));
  const fullBottom = results.rowsTop + results.rowPitch * 11 + results.rowHeight;
  const tail = results.height - fullBottom;
  return results.rowsTop + results.rowPitch * (rows - 1) + results.rowHeight + tail;
}

/** Hangul in this face occupies one em. The slot must hold eight graphemes. */
export function podiumNameSlot() {
  const card = overlayLayout.board.podium;
  return {
    fontSize: card.nameSize,
    width: card.width - card.padLeft - card.placeWidth - card.badge - card.nameGap - card.nameInset,
  };
}

export function resultNameSlot(podium: boolean) {
  const box = overlayLayout.results;
  const rowWidth = box.width - 2 * (box.padX - box.border);
  const nameLeft = box.badgeLeft + box.badge + box.nameGap - (podium ? box.rowBorder : 0);
  const timeWidth = box.gapSize * 7 * 0.62;
  const gapRight = box.gapRight - (podium ? box.rowBorder : 0);
  return {
    fontSize: podium ? box.podiumNameSize : box.nameSize,
    width: rowWidth - nameLeft - gapRight - timeWidth,
  };
}

export function lineupNameSlot(wide: boolean) {
  const { lineup } = overlayLayout;
  const column = wide ? lineup.wideColumn : lineup.column;
  return { fontSize: lineup.nameSize, width: column - lineup.badge - lineup.gap };
}

export function winnerNameSlot(large: boolean) {
  const box = large ? overlayLayout.winner.large : overlayLayout.winner.small;
  const latin = 7 * box.fontSize * 0.72;
  return { fontSize: box.fontSize, width: box.maxWidth - box.padX * 2 - latin };
}

export type OverlayHorse = {
  id: string;
  name: string;
  number: number;
  place: number;
  /** Presentation progress along the track, 0–1 and beyond while braking. */
  progress: number;
};

export type FinishBoardRow = {
  id: string;
  name: string;
  number: number;
  rank: number;
  finishTime: number;
};

export type FinishBoard = {
  rows: FinishBoardRow[];
  /** Full results, with the rematch and exit buttons. */
  complete: boolean;
  winnerName: string | null;
};

export type RaceOverlaySnapshot = {
  phase: "intro" | "countdown" | "racing";
  countdown: string | null;
  horses: OverlayHorse[];
  finishBoard: FinishBoard | null;
};

export function leadMeters(horses: OverlayHorse[]) {
  const lead = horses.reduce((max, horse) => Math.max(max, horse.progress), 0);
  return Math.round(clamp01(lead) * RACE_METERS);
}

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Scale for the results panel and its buttons so both fit a HUD `hudHeight` reference units tall. */
export function resultsFit(hudHeight: number, rowCount = 12) {
  const { results, actions } = overlayLayout;
  const needed = resultsPanelHeight(rowCount) + actions.top + actions.height;
  const room = hudHeight - results.top - results.bottom;
  return Math.min(1, Math.max(0, room / needed));
}

/** Winner reads as absolute time, everyone else as the gap behind the winner. */
export function resultGapLabel(finishTime: number, winnerTime: number, place: number) {
  if (place === 1) return `${finishTime.toFixed(2)}s`;
  return `+${Math.max(0, finishTime - winnerTime).toFixed(2)}`;
}
