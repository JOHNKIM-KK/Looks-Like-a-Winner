import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { lineupDensity, lineupRowHeight, LineupScreen } from "../components/LineupScreen";
import { setupRowHeight, SetupScreen } from "../components/SetupScreen";
import { RaceResult } from "../components/RaceResult";
import type { HorseInput } from "../lib/race";
import { entrantField, graphemeLength, reshuffleStalls } from "../lib/field";
import {
  RECENT_ENTRANTS_KEY,
  clampEntrantName,
  createEntrantSession,
  entrantIssue,
  finishRacing,
  lineupRows,
  loadRecentEntrants,
  openSetup,
  presentLineup,
  removeEntrant,
  reshuffleToLineup,
  resizeEntrantNames,
  returnToSetup,
  saveRecentEntrants,
  shuffleSetup,
  startRacing,
  withCount,
  withName,
  type EntrantStorage,
} from "../lib/entrantSetup";
import { MAX_HORSES, simulateRace } from "../lib/race";

function memoryStore(initial?: string): EntrantStorage & { raw: () => string | null } {
  let value = initial ?? null;
  return {
    getItem(key: string) {
      return key === RECENT_ENTRANTS_KEY ? value : null;
    },
    setItem(key: string, next: string) {
      if (key !== RECENT_ENTRANTS_KEY) throw new Error(key);
      value = next;
    },
    raw: () => value,
  };
}

function setupWith(names: readonly string[], typeSeed = 4) {
  let session = withCount(openSetup(createEntrantSession(typeSeed)), names.length);
  names.forEach((name, index) => {
    session = withName(session, index, name);
  });
  return session;
}

function buttonTag(html: string, testId: string) {
  return html.match(new RegExp(`<button\\b(?=[^>]*data-testid="${testId}")[^>]*>`))?.[0] ?? "";
}

describe("entrant names", () => {
  it("cuts a name at 8 graphemes and keeps one line", () => {
    expect(clampEntrantName("가나다라마바사아")).toBe("가나다라마바사아");
    expect(clampEntrantName("가나다라마바사아자")).toBe("가나다라마바사아");
    const decomposed = "나".repeat(9).normalize("NFD");
    expect(graphemeLength(decomposed)).toBe(9);
    expect(graphemeLength(clampEntrantName(decomposed))).toBe(8);
    expect(clampEntrantName("철수\n영희")).toBe("철수영희");
  });

  it("keeps the stepper inside 2..12 and drops the slots at the end", () => {
    expect(resizeEntrantNames(["가", "나", "다", "라"], 2)).toEqual(["가", "나"]);
    expect(resizeEntrantNames(["가", "나"], 4)).toEqual(["가", "나", "", ""]);
    expect(resizeEntrantNames(["가", "나", "다"], 1)).toEqual(["가", "나"]);
    expect(resizeEntrantNames(["가", "나"], 99)).toHaveLength(MAX_HORSES);
    expect(resizeEntrantNames(["가", "나"], Number.NaN)).toEqual(["가", "나"]);
  });

  it("rejects duplicate final names and names that are still too long", () => {
    expect(entrantIssue(["", ""])).toBeNull();
    expect(entrantIssue(["철수", "  철수  "])).toBe("이름이 겹칩니다.");
    expect(entrantIssue(["가나다라마바사아자", "나"])).toBe("이름은 8자까지입니다.");
    expect(entrantIssue(["가나다라마바사아", ""])).toBeNull();
  });

  it("stays on setup when the names cannot start", () => {
    const session = setupWith(["철수", "철수"]);
    expect(presentLineup(session)).toBe(session);
    expect(shuffleSetup(session, 9)).toBe(session);
  });
});

describe("recent entrants", () => {
  it("round-trips the typed roster under gemi.recentEntrants", () => {
    const store = memoryStore();
    saveRecentEntrants(store, ["철수", "", "영희"]);
    expect(store.raw()).toBe(JSON.stringify({ names: ["철수", "", "영희"] }));
    expect(JSON.parse(store.raw() ?? "{}")).not.toHaveProperty("stall");
    expect(loadRecentEntrants(store)).toEqual(["철수", "", "영희"]);
  });

  it("ignores a missing, short, long, or broken roster", () => {
    expect(loadRecentEntrants(memoryStore())).toBeNull();
    expect(loadRecentEntrants(memoryStore("nope"))).toBeNull();
    expect(loadRecentEntrants(memoryStore("{}"))).toBeNull();
    expect(loadRecentEntrants(memoryStore(JSON.stringify({ names: ["혼자"] })))).toBeNull();
    expect(loadRecentEntrants(memoryStore(JSON.stringify({ names: ["가", 1] })))).toBeNull();
    expect(loadRecentEntrants(memoryStore(JSON.stringify({ names: ["가나다라마바사아자", "나"] })))).toBeNull();
    expect(loadRecentEntrants(memoryStore(JSON.stringify({ names: Array.from({ length: 13 }, () => "가") })))).toBeNull();
    const blocked: EntrantStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(loadRecentEntrants(blocked)).toBeNull();
    expect(() => saveRecentEntrants(blocked, ["가", "나"])).not.toThrow();
  });
});

describe("setup flow", () => {
  it("opens setup from the title and does not start a race", () => {
    const session = openSetup(createEntrantSession(1));
    expect(session.phase).toBe("setup");
    expect(session.names).toEqual(["", ""]);
    expect(session.horses).toEqual([]);
    expect(startRacing(session)).toBe(session);
  });

  it("builds 2 to 12 horses for the lineup and leaves the other gates out", () => {
    for (const count of [2, 7, MAX_HORSES]) {
      const names = Array.from({ length: count }, (_, index) => (index % 2 === 0 ? "" : `말${index}`));
      const session = presentLineup(setupWith(names, 6));
      expect(session.phase).toBe("lineup");
      expect(session.horses).toHaveLength(count);
      expect(session.horses).toHaveLength(session.names.length);
      const rows = lineupRows(session.horses);
      expect(rows.map((row) => row.stall)).toEqual([...rows.map((row) => row.stall)].sort((a, b) => a - b));
      expect(new Set(rows.map((row) => row.stall)).size).toBe(count);
      for (const row of rows) {
        expect(row.stall).toBeGreaterThanOrEqual(1);
        expect(row.stall).toBeLessThanOrEqual(MAX_HORSES);
      }
      expect(rows.some((row) => row.name.length === 0)).toBe(false);
    }
  });

  it("shuffles gates on setup without changing horse types, and shows that on the lineup", () => {
    const drafted = setupWith(["가", "나", "다"], 4);
    const held = shuffleSetup(drafted, 99);
    expect(held.phase).toBe("setup");
    expect(held.names).toEqual(["가", "나", "다"]);
    const lineup = presentLineup(held);
    const dealt = entrantField(["가", "나", "다"], 4);
    expect(lineup.horses.map((horse) => horse.skillId)).toEqual(dealt.map((horse) => horse.skillId));
    expect(lineup.horses.map((horse) => horse.stall)).toEqual(reshuffleStalls(dealt, 99).map((horse) => horse.stall));
    expect(lineup.horses.map((horse) => horse.stall)).not.toEqual(dealt.map((horse) => horse.stall));
  });

  it("starts the lineup field without padding empty gates", () => {
    const lineup = presentLineup(setupWith(["가", "나", "다", "라"], 5));
    const racing = startRacing(lineup);
    expect(racing.phase).toBe("racing");
    expect(racing.horses).toHaveLength(4);
    const race = simulateRace(racing.horses, 5);
    expect(race.horses).toHaveLength(4);
    expect(race.horses.map((horse) => horse.number)).toEqual(racing.horses.map((horse) => horse.stall));
  });

  it("returns 다시 하기 to the lineup with the same names and new stalls", () => {
    let session = presentLineup(setupWith(["철수", "영희", ""]));
    const names = session.names.slice();
    const field = session.horses;
    session = finishRacing(startRacing(session));
    expect(session.phase).toBe("done");
    session = reshuffleToLineup(session, 99);
    expect(session.phase).toBe("lineup");
    expect(session.names).toEqual(names);
    expect(session.horses.map((horse) => horse.id)).toEqual(field.map((horse) => horse.id));
    expect(session.horses.map((horse) => horse.name)).toEqual(field.map((horse) => horse.name));
    expect(session.horses.map((horse) => horse.skillId)).toEqual(field.map((horse) => horse.skillId));
    expect(session.horses.map((horse) => horse.biases)).toEqual(field.map((horse) => horse.biases));
    expect(session.horses.map((horse) => horse.stall)).toEqual(reshuffleStalls(field, 99).map((horse) => horse.stall));
    expect(startRacing(session).phase).toBe("racing");
    expect(finishRacing(session)).toBe(session);
  });

  it("opens 설정 변경 on the setup form with the typed names still in the slots", () => {
    let session = presentLineup(setupWith(["철수", ""]));
    session = finishRacing(startRacing(session));
    session = returnToSetup(session);
    expect(session.phase).toBe("setup");
    expect(session.names).toEqual(["철수", ""]);
    session = withName(session, 1, "영희");
    expect(session.names).toEqual(["철수", "영희"]);
    const lineup = presentLineup(session);
    expect(returnToSetup(lineup)).toBe(lineup);
  });
});

function renderSetup(
  names: readonly string[],
  extra?: { issue?: string | null; notice?: string | null; recent?: readonly string[] | null },
) {
  return renderToStaticMarkup(
    createElement(SetupScreen, {
      names,
      issue: extra?.issue ?? null,
      notice: extra?.notice ?? null,
      recent: extra?.recent ?? null,
      onStep() {},
      onName() {},
      onRemove() {},
      onLoadRecent() {},
      onStart() {},
    }),
  );
}

function namedHorse(id: string, name: string, stall?: number): HorseInput {
  return {
    id,
    name,
    title: "t",
    color: "#fff",
    skillId: "start-dash",
    biases: { start: 0, accel: 0, stamina: 0, corner: 0, mental: 0, luck: 0 },
    reasons: ["a", "b"],
    stall,
  };
}

function renderLineup(horses: readonly HorseInput[]) {
  return renderToStaticMarkup(createElement(LineupScreen, { horses, onStart() {} }));
}

function badgeTag(html: string, lane: number) {
  return html.match(new RegExp(`<span\\b(?=[^>]*data-testid="lane-badge")(?=[^>]*data-lane="${lane}")[^>]*>`))?.[0] ?? "";
}

describe("setup and result screens", () => {
  it("renders the setup form, blocks a bad start, and stops the stepper at the ends", () => {
    const open = renderSetup(["철수", ""]);
    expect(open).toContain("참가자");
    expect(open).toContain('placeholder="이름"');
    expect(open).toContain("최근 명단 불러오기");
    expect(open).toContain("라인업 보기");
    expect(open).toContain("+ 추가");
    expect(open).not.toContain("레인 섞기");
    expect(open).not.toContain("경주 시작");
    expect(open).toContain('data-testid="entrant-count"');
    expect(open).toContain(">2<");
    expect(open).toContain('data-row-height="52"');
    expect(buttonTag(open, "setup-start")).not.toContain("disabled");
    expect(buttonTag(open, "setup-start")).toContain('type="submit"');
    expect(open.match(/data-testid="entrant-name-/g)).toHaveLength(2);
    expect(buttonTag(open, "setup-minus")).toContain("disabled");
    expect(buttonTag(open, "setup-minus")).toContain("#5E5C58");
    expect(buttonTag(open, "setup-plus")).not.toContain("disabled");

    const blocked = renderSetup(["철수", "철수"], {
      issue: "이름이 겹칩니다.",
      notice: "레인을 다시 배정했습니다. 라인업에서 확인할 수 있습니다.",
    });
    expect(buttonTag(blocked, "setup-start")).toContain("disabled");
    expect(blocked).toContain("이름이 겹칩니다.");
    expect(blocked).not.toContain("레인을 다시 배정했습니다");

    const full = renderSetup(Array.from({ length: MAX_HORSES }, () => ""));
    expect(full.match(/data-testid="entrant-name-/g)).toHaveLength(MAX_HORSES);
    expect(full).toContain('data-row-height="44"');
    expect(full).toContain("compact");
    expect(full).not.toContain("+ 추가");
    expect(buttonTag(full, "setup-plus")).toContain("disabled");
    expect(buttonTag(full, "setup-plus")).toContain("#5E5C58");
    expect(buttonTag(full, "setup-minus")).not.toContain("disabled");
  });

  it("keeps the stepper active between the 2 and 12 ends", () => {
    expect(setupRowHeight(11)).toBe(52);
    expect(setupRowHeight(MAX_HORSES)).toBe(44);
    const three = renderSetup(["가", "나", "다"]);
    expect(buttonTag(three, "setup-minus")).not.toContain("disabled");
    expect(buttonTag(three, "setup-plus")).not.toContain("disabled");
    expect(three).toContain('data-row-height="52"');
    const eleven = renderSetup(Array.from({ length: 11 }, (_, index) => `말${index}`));
    expect(buttonTag(eleven, "setup-plus")).not.toContain("disabled");
    expect(buttonTag(eleven, "setup-minus")).not.toContain("disabled");
    expect(eleven).toContain("+ 추가");
  });

  it("drops a middle slot and will not go under two entrants", () => {
    const session = setupWith(["가", "나", "다"]);
    expect(removeEntrant(session, 1).names).toEqual(["가", "다"]);
    const pair = setupWith(["가", "나"]);
    expect(removeEntrant(pair, 0)).toBe(pair);
    expect(removeEntrant(pair, 3)).toBe(pair);
  });

  it("lists assigned gates in stall order and leaves unused gates off the lineup", () => {
    const horses = entrantField(["가", "나", "다"], 8);
    const html = renderLineup(horses);
    const shown = [...html.matchAll(/data-testid="lineup-gate-(\d+)"/g)].map((match) => Number(match[1]));
    expect(shown).toEqual(lineupRows(horses).map((row) => row.stall));
    expect(shown).toHaveLength(3);
    expect(html).toContain('data-align="start"');
    expect(html).toContain("라인업");
    expect(html).toContain("출발");
    expect(html).not.toContain("다시 섞기");
    expect(html).not.toContain("경주 시작");
    for (const horse of horses) expect(html).toContain(horse.name);
  });

  it("sorts lineup rows to the top and skips empty lanes", () => {
    const html = renderLineup([
      namedHorse("gap", "빈칸"),
      namedHorse("late", "뒤", 12),
      namedHorse("early", "앞", 1),
    ]);
    const shown = [...html.matchAll(/data-testid="lineup-gate-(\d+)"/g)].map((match) => Number(match[1]));
    expect(shown).toEqual([1, 12]);
    expect(html).not.toContain("빈칸");
    expect(html).not.toContain("lineup-gate-2");
    expect(html).toContain('data-align="start"');
    expect(html).toContain('data-count="2"');
    expect(html.match(/data-testid="lineup-name"/g)).toHaveLength(2);
  });

  it("uses 56, 52, and 44 pixel rows for 2–6, 7–9, and 10–12 horses", () => {
    for (const count of [2, 6, 7, 9, 10, 12]) {
      const expected = count >= 10 ? 44 : count >= 7 ? 52 : 56;
      const density = count >= 10 ? "n-full" : count >= 7 ? "n-mid" : "";
      expect(lineupRowHeight(count)).toBe(expected);
      expect(lineupDensity(count)).toBe(density);
      const horses = Array.from({ length: count }, (_, index) => namedHorse(`h${index}`, `말${index}`, count - index));
      const html = renderLineup(horses);
      expect(html.match(/data-testid="lineup-gate-/g)).toHaveLength(count);
      expect(html).toContain(`data-row-height="${expected}"`);
      expect(html).toContain(`height:${expected}px`);
      if (density) expect(html).toContain(density);
      else expect(html).not.toMatch(/n-mid|n-full/);
      const shown = [...html.matchAll(/data-testid="lineup-gate-(\d+)"/g)].map((match) => Number(match[1]));
      expect(shown).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    }
  });

  it("paints night lane badges at 22px, with dark ink on 3, 10, and 12 and edges on 8 and 10", () => {
    const html = renderLineup(Array.from({ length: 12 }, (_, index) => namedHorse(`h${index}`, `말${index}`, index + 1)));
    for (const lane of [1, 3, 8, 10, 12]) {
      const tag = badgeTag(html, lane);
      expect(tag).toContain("width:22px");
      expect(tag).toContain("height:22px");
      expect(tag).toContain("font-size:11px");
    }
    expect(badgeTag(html, 3)).toContain("#14181F");
    expect(badgeTag(html, 10)).toContain("#14181F");
    expect(badgeTag(html, 12)).toContain("#14181F");
    expect(badgeTag(html, 8)).toContain('data-edge="#E8E4DC"');
    expect(badgeTag(html, 8)).toContain("inset 0 0 0 1.5px #E8E4DC");
    expect(badgeTag(html, 10)).toContain('data-edge="#B8B2A6"');
    expect(badgeTag(html, 10)).toContain("inset 0 0 0 1.5px #B8B2A6");
    expect(badgeTag(html, 1)).toContain('data-edge=""');
    expect(badgeTag(html, 3)).toContain('data-edge=""');
    expect(badgeTag(html, 1)).not.toContain("box-shadow");
  });

  it("keeps the v4 winner banner and result buttons, and withholds them until the board is complete", () => {
    const row = { id: "a", name: "철수", number: 3, rank: 1, finishTime: 59.2 };
    const partial = renderToStaticMarkup(
      createElement(RaceResult, {
        rows: [row],
        winnerName: "철수",
        complete: false,
        hudHeight: 900,
        onRematch() {},
        onChangeSettings() {},
      }),
    );
    expect(partial).toContain("WINNER 철수");
    expect(partial).toContain('data-size="small"');
    expect(partial).toContain("#FFE14A");
    expect(partial).not.toContain("설정 변경");
    expect(partial).not.toContain("다시 하기");

    const full = renderToStaticMarkup(
      createElement(RaceResult, {
        rows: [row, { id: "b", name: "영희", number: 7, rank: 2, finishTime: 59.8 }],
        winnerName: "철수",
        complete: true,
        hudHeight: 900,
        onRematch() {},
        onChangeSettings() {},
      }),
    );
    expect(full).toContain("WINNER 철수");
    expect(full).toContain('data-size="large"');
    expect(full).toContain("#FFE14A");
    expect(full).toContain("설정 변경");
    expect(full).toContain("다시 하기");
    expect(full).not.toContain("나가기");
    expect(full).not.toContain("공유");
  });
});
