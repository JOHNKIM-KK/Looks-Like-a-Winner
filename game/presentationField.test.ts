import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LineupScreen } from "@/components/LineupScreen";
import { RaceOverlay } from "@/components/RaceOverlay";
import { RaceResult } from "@/components/RaceResult";
import { laneColor } from "@/game/laneColors";
import { LANE_COUNT } from "@/game/track";
import { overlayLayout, rankBoardHeight, resultsPanelHeight, type FinishBoardRow, type OverlayHorse } from "@/game/overlayLayout";
import type { LandscapeStage } from "@/game/stage";
import type { HorseInput } from "@/lib/race";

const stage = {
  kind: "landscape",
  viewport: { width: 1600, height: 900 },
  frame: { x: 0, y: 0, width: 1600, height: 900 },
  scale: 1,
  bleed: { x: 0, y: 0, width: 1600, height: 900 },
  hud: { x: 0, y: 0, width: 1600, height: 900 },
  backing: { width: 1600, height: 900, zoom: 1 },
} satisfies LandscapeStage;

const EIGHT = "가나다라마바사아";

/** Stalls that are not the array index, so a badge of index+1 fails. */
const FIELDS: Record<number, number[]> = {
  2: [12, 3],
  4: [2, 11, 5, 8],
  8: [1, 4, 12, 7, 9, 10, 6, 2],
  12: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
};

function horses(stalls: readonly number[]): OverlayHorse[] {
  return stalls.map((stall, index) => ({
    id: `h${stall}`,
    name: EIGHT,
    number: stall,
    place: index + 1,
    progress: 0.4 - index * 0.01,
  }));
}

function rows(stalls: readonly number[]): FinishBoardRow[] {
  return stalls.map((stall, index) => ({
    id: `h${stall}`,
    name: EIGHT,
    number: stall,
    rank: index + 1,
    finishTime: 60 + index * 0.2,
  }));
}

function lineup(stalls: readonly number[]): HorseInput[] {
  return stalls.map((stall) => ({
    id: `h${stall}`,
    name: EIGHT,
    title: "t",
    color: "#fff",
    skillId: "start-dash",
    biases: { start: 0, accel: 0, stamina: 0, corner: 0, mental: 0, luck: 0 },
    reasons: ["a", "b"],
    stall,
  }));
}

function badges(html: string) {
  return [...html.matchAll(/<span\b[^>]*data-testid="lane-badge"[^>]*>[\s\S]*?<\/span>/g)].map((match) => {
    const tag = match[0];
    return {
      lane: Number(tag.match(/data-lane="(\d+)"/)?.[1]),
      color: tag.match(/background:\s*([^;"]+)/)?.[1] ?? "",
      text: Number(tag.match(/>(\d+)</)?.[1]),
    };
  });
}

function marked(html: string, testId: string) {
  return [...html.matchAll(new RegExp(`data-testid="${testId}"[^>]*data-lane="(\\d+)"`, "g"))].map((match) => Number(match[1]));
}

describe.each([2, 4, 8, 12])("field of %i", (count) => {
  const stalls = FIELDS[count]!;

  it("sizes the rank board and progress markers to the field, colored by stall", () => {
    const html = renderToStaticMarkup(
      createElement(RaceOverlay, {
        stage,
        snapshot: { phase: "racing", countdown: null, horses: horses(stalls), finishBoard: null },
        comment: "실황",
        onRematch() {},
        onChangeSettings() {},
      }),
    );
    const podium = Math.min(3, count);
    const chase = Math.max(0, count - 3);
    expect(html.match(/data-testid="podium-card"/g)).toHaveLength(podium);
    expect(html.match(/data-testid="chase-chip"/g) ?? []).toHaveLength(chase);
    expect(html).toContain(`data-podium-count="${podium}"`);
    expect(html).toContain(`data-chase-count="${chase}"`);
    expect(html).toContain(`height:${rankBoardHeight(count)}px`);
    expect(marked(html, "chase-chip")).toEqual(stalls.slice(3));
    expect(marked(html, "progress-marker")).toEqual([...stalls].reverse());
    const shown = badges(html);
    expect(shown).toHaveLength(count);
    for (const stall of stalls) {
      const badge = shown.find((item) => item.lane === stall);
      expect(badge).toMatchObject({ lane: stall, text: stall, color: laneColor(stall) });
    }
    expect(html).toContain(EIGHT);
    expect(html).not.toMatch(/data-testid="rank-slot-name"[^>]*ellipsis/);
    expect(html).not.toMatch(/data-testid="rank-slot-name"[^>]*overflow:/);
    expect(html).toContain(overlayLayout.style.first);
  });

  it("draws one result row per horse and keeps the first-place mark", () => {
    const html = renderToStaticMarkup(
      createElement(RaceResult, {
        rows: rows(stalls),
        winnerName: EIGHT,
        complete: true,
        hudHeight: 900,
        onRematch() {},
        onChangeSettings() {},
      }),
    );
    expect(html.match(/data-testid="result-row"/g)).toHaveLength(count);
    expect(html).toContain(`data-rows="${count}"`);
    expect(html).toContain(`height:${resultsPanelHeight(count)}px`);
    expect(marked(html, "result-row")).toEqual(stalls);
    const shown = badges(html);
    expect(shown.map((badge) => badge.lane)).toEqual(stalls);
    for (const badge of shown) expect(badge).toMatchObject({ text: badge.lane, color: laneColor(badge.lane) });
    expect(html).toContain(`WINNER ${EIGHT}`);
    expect(html).toContain('data-size="large"');
    expect(html).toContain(overlayLayout.style.first);
    expect(html).not.toMatch(/data-testid="winner-banner"[^>]*ellipsis/);
    expect(html).not.toMatch(/data-testid="result-name"[^>]*ellipsis/);
    expect(html).not.toMatch(/data-testid="result-name"[^>]*overflow:/);
    expect(LANE_COUNT).toBe(12);
  });

  it("lists each assigned stall, not the roster index", () => {
    const html = renderToStaticMarkup(
      createElement(LineupScreen, { horses: lineup(stalls), onStart() {} }),
    );
    const shown = [...html.matchAll(/data-testid="lineup-gate-(\d+)"/g)].map((match) => Number(match[1]));
    expect(shown).toEqual([...stalls].sort((a, b) => a - b));
    expect(html.match(/data-testid="lineup-name"/g)).toHaveLength(count);
    expect(html).toContain(EIGHT);
    expect(html).not.toMatch(/data-testid="lineup-name"[^>]*ellipsis/);
  });
});
