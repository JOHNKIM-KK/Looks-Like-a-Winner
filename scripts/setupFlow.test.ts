import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LineupScreen } from "../components/LineupScreen";
import { RaceResult } from "../components/RaceResult";
import { SetupScreen } from "../components/SetupScreen";
import type { LandscapeStage } from "../game/stage";
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

const stage = {
  kind: "landscape",
  viewport: { width: 1600, height: 900 },
  frame: { x: 0, y: 0, width: 1600, height: 900 },
  scale: 1,
  bleed: { x: 0, y: 0, width: 1600, height: 900 },
  hud: { x: 0, y: 0, width: 1600, height: 900 },
  backing: { width: 1600, height: 900, zoom: 1 },
} satisfies LandscapeStage;

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

describe("setup and result screens", () => {
  it("renders the setup form, blocks a bad start, and stops the stepper at the ends", () => {
    const open = renderToStaticMarkup(
      createElement(SetupScreen, {
        stage,
        names: ["철수", ""],
        issue: null,
        notice: null,
        onStep() {},
        onName() {},
        onLoadRecent() {},
        onShuffle() {},
        onStart() {},
      }),
    );
    expect(open).toContain("출전 설정");
    expect(open).toContain("비우면 기본 이름");
    expect(open).toContain("최근 참가자 불러오기");
    expect(open).toContain("레인 섞기");
    expect(open).toContain("경주 시작");
    expect(open).toContain('data-testid="entrant-count"');
    expect(open).toContain(">2<");
    expect(buttonTag(open, "setup-start")).not.toContain("disabled");
    expect(buttonTag(open, "setup-start")).toContain('type="submit"');
    expect(open.match(/data-testid="entrant-name-/g)).toHaveLength(2);
    expect(buttonTag(open, "참가자 줄이기") || open.match(/<button\b(?=[^>]*참가자 줄이기)[^>]*>/)?.[0]).toContain("disabled");

    const blocked = renderToStaticMarkup(
      createElement(SetupScreen, {
        stage,
        names: ["철수", "철수"],
        issue: "이름이 겹칩니다.",
        notice: "레인을 다시 배정했습니다. 라인업에서 확인할 수 있습니다.",
        onStep() {},
        onName() {},
        onLoadRecent() {},
        onShuffle() {},
        onStart() {},
      }),
    );
    expect(buttonTag(blocked, "setup-start")).toContain("disabled");
    expect(blocked).toContain("이름이 겹칩니다.");
    expect(blocked).not.toContain("레인을 다시 배정했습니다");

    const full = renderToStaticMarkup(
      createElement(SetupScreen, {
        stage,
        names: Array.from({ length: MAX_HORSES }, () => ""),
        issue: null,
        notice: null,
        onStep() {},
        onName() {},
        onLoadRecent() {},
        onShuffle() {},
        onStart() {},
      }),
    );
    expect(full.match(/data-testid="entrant-name-/g)).toHaveLength(MAX_HORSES);
    expect(full.match(/<button\b(?=[^>]*참가자 늘리기)[^>]*>/)?.[0]).toContain("disabled");
  });

  it("lists assigned gates in stall order and leaves unused gates off the lineup", () => {
    const horses = entrantField(["가", "나", "다"], 8);
    const html = renderToStaticMarkup(
      createElement(LineupScreen, { stage, horses, onShuffle() {}, onStart() {} }),
    );
    const shown = [...html.matchAll(/data-testid="lineup-gate-(\d+)"/g)].map((match) => Number(match[1]));
    expect(shown).toEqual(lineupRows(horses).map((row) => row.stall));
    expect(shown).toHaveLength(3);
    expect(html).toContain("게이트는 무작위로 배정되었습니다");
    expect(html).toContain("레인 다시 섞기");
    expect(html).toContain("경주 시작");
    for (const horse of horses) expect(html).toContain(horse.name);
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
