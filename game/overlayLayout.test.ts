import { describe, expect, it } from "vitest";
import {
  leadMeters,
  lineupNameSlot,
  overlayLayout,
  podiumNameSlot,
  rankBoardHeight,
  resultGapLabel,
  resultNameSlot,
  resultsFit,
  resultsPanelHeight,
  winnerNameSlot,
  type OverlayHorse,
} from "./overlayLayout";
import { REFERENCE } from "./stage";

function horse(place: number, progress: number): OverlayHorse {
  return { id: `h${place}`, name: `말${place}`, number: place, place, progress };
}

describe("overlay layout (storyboard 09·10)", () => {
  it("uses the SPEC HUD colors", () => {
    expect(overlayLayout.style.border).toBe("#5CE1FF");
    expect(overlayLayout.style.first).toBe("#FFE14A");
  });

  it("lines the podium cards up with the nine chips", () => {
    const { board } = overlayLayout;
    const inner = board.width - board.padX * 2;
    expect(board.podium.width * 3 + board.podium.gap * 2).toBeCloseTo(inner);
    expect(board.chase.width * 9 + board.chase.gap * 8).toBeCloseTo(inner);
  });

  it("fits twelve result rows inside the results panel", () => {
    const { results } = overlayLayout;
    const lastBottom = results.rowsTop + results.rowPitch * 11 + results.rowHeight;
    expect(lastBottom).toBeLessThan(results.height);
    expect(resultsPanelHeight(12)).toBe(results.height);
  });

  it("gives an 8-grapheme name a full em slot on the board, the result row, the lineup, and the winner line", () => {
    for (const slot of [
      podiumNameSlot(),
      resultNameSlot(true),
      resultNameSlot(false),
      lineupNameSlot(false),
      lineupNameSlot(true),
      winnerNameSlot(false),
      winnerNameSlot(true),
    ]) {
      expect(slot.width).toBeGreaterThanOrEqual(slot.fontSize * 8);
    }
  });

  it("drops the chip band for two or three horses and keeps it for a larger field", () => {
    expect(rankBoardHeight(2)).toBeLessThan(overlayLayout.board.height);
    expect(rankBoardHeight(3)).toBe(rankBoardHeight(2));
    expect(rankBoardHeight(4)).toBe(overlayLayout.board.height);
    expect(resultsPanelHeight(2)).toBeLessThan(resultsPanelHeight(4));
    expect(resultsPanelHeight(4)).toBeLessThan(resultsPanelHeight(8));
    expect(resultsPanelHeight(8)).toBeLessThan(resultsPanelHeight(12));
  });

  it("lines the results panel up with the rank board's top edge", () => {
    expect(overlayLayout.results.top).toBe(overlayLayout.board.top);
  });

  it("keeps the rank board clear of the results panel", () => {
    const { board, results } = overlayLayout;
    const resultsLeft = REFERENCE.width - results.right - results.width;
    expect(board.left + board.width).toBeLessThan(resultsLeft);
  });

  it("shrinks the results and buttons only when the HUD is too short for them", () => {
    const { results, actions } = overlayLayout;
    expect(resultsFit(REFERENCE.height)).toBe(1);
    const short = 700;
    const fit = resultsFit(short);
    expect(fit).toBeLessThan(1);
    expect(results.top + (results.height + actions.top + actions.height) * fit).toBeCloseTo(short - results.bottom);
  });
});

describe("resultGapLabel", () => {
  it("shows the winner's time and everyone else's gap", () => {
    expect(resultGapLabel(13.824, 13.824, 1)).toBe("13.82s");
    expect(resultGapLabel(13.914, 13.824, 2)).toBe("+0.09");
    expect(resultGapLabel(13.824, 13.824, 2)).toBe("+0.00");
  });
});

describe("leadMeters", () => {
  it("reads the leader's distance, capped at the race length", () => {
    expect(leadMeters([horse(1, 0.932), horse(2, 0.9)])).toBe(417);
    expect(leadMeters([horse(1, 1.04)])).toBe(447.5);
    expect(leadMeters([])).toBe(0);
  });
});
