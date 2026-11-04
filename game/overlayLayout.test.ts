import { describe, expect, it } from "vitest";
import { leadMeters, overlayLayout, resultGapLabel, type OverlayHorse } from "./overlayLayout";
import { REFERENCE } from "./stage";

function horse(place: number, progress: number): OverlayHorse {
  return { id: `h${place}`, name: `말${place}`, number: place, place, portrait: "", progress };
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
    expect(results.top + results.height).toBeLessThan(REFERENCE.height - overlayLayout.ticker.bottom - overlayLayout.ticker.height);
  });

  it("keeps the rank board clear of the results panel and its buttons", () => {
    const { board, results, actions } = overlayLayout;
    const resultsLeft = REFERENCE.width - results.right - results.width;
    expect(board.left + board.width).toBeLessThan(resultsLeft);
    expect(board.top + board.height).toBeLessThan(results.top + results.height - actions.height);
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
    expect(leadMeters([horse(1, 0.932), horse(2, 0.9)])).toBe(333);
    expect(leadMeters([horse(1, 1.04)])).toBe(357);
    expect(leadMeters([])).toBe(0);
  });
});
