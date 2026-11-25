import { describe, expect, it } from "vitest";
import { entrantField, fieldHorses, fillEntrantNames, graphemeLength, reshuffleStalls, validateEntrantNames } from "../lib/field";
import { mockHorses } from "../lib/mockHorses";
import { MAX_HORSES, laneAt, simulateRace } from "../lib/race";

describe("race field", () => {
  it("fills to 12 and shuffles players with fillers from the seed", () => {
    const players = mockHorses.slice(0, 3);
    const once = fieldHorses(players, 42);
    const again = fieldHorses(players, 42);
    expect(once.map((horse) => horse.id)).toEqual(again.map((horse) => horse.id));
    expect(once).toHaveLength(MAX_HORSES);
    expect(once.filter((horse) => horse.id.startsWith("filler-"))).toHaveLength(9);
    for (const player of players) {
      expect(once.some((horse) => horse.id === player.id)).toBe(true);
    }
    expect(once.map((horse) => horse.id).slice(0, 3)).not.toEqual(players.map((horse) => horse.id));

    let fillerLeads = false;
    const leadStalls = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const field = fieldHorses(players, seed);
      const leader = field[0];
      if (leader?.id.startsWith("filler-")) fillerLeads = true;
      const player = field.findIndex((horse) => horse.id === players[0]?.id);
      leadStalls.add(player + 1);
    }
    expect(fillerLeads).toBe(true);
    expect(leadStalls.size).toBeGreaterThan(1);
  });

  it("reshuffles gate order without changing who is racing", () => {
    const field = fieldHorses(mockHorses, 7);
    const again = reshuffleStalls(field, 7);
    const moved = reshuffleStalls(field, 99);
    expect(again.map((horse) => horse.id)).toEqual(reshuffleStalls(field, 7).map((horse) => horse.id));
    expect(moved).toHaveLength(field.length);
    expect(moved.map((horse) => horse.id).sort()).toEqual(field.map((horse) => horse.id).sort());
    expect(moved.map((horse) => horse.id)).not.toEqual(field.map((horse) => horse.id));
    for (const horse of moved) {
      const original = field.find((entry) => entry.id === horse.id);
      expect(original).toBeTruthy();
      expect(horse.name).toBe(original?.name);
      expect(horse.skillId).toBe(original?.skillId);
      expect(horse.biases).toEqual(original?.biases);
    }
  });
});

describe("entrant field", () => {
  const blanks = (count: number) => Array.from({ length: count }, () => "");

  it("builds 2 to 12 horses and leaves the other gates empty", () => {
    for (let count = 2; count <= MAX_HORSES; count += 1) {
      const field = entrantField(blanks(count), 7);
      const again = entrantField(blanks(count), 7);
      const stalls = field.map((horse) => horse.stall);
      expect(field).toHaveLength(count);
      expect(stalls).toEqual(again.map((horse) => horse.stall));
      expect(new Set(stalls).size).toBe(count);
      for (const stall of stalls) {
        expect(stall).toBeGreaterThanOrEqual(1);
        expect(stall).toBeLessThanOrEqual(MAX_HORSES);
      }
      expect(MAX_HORSES - new Set(stalls).size).toBe(MAX_HORSES - count);
    }
    expect(() => entrantField(blanks(1), 1)).toThrow(/2마리/);
    expect(() => entrantField(blanks(13), 1)).toThrow(/12마리/);
  });

  it("draws stalls from the seed, not from roster order", () => {
    const seen = new Set<string>();
    let pastRoster = false;
    let pastCount = false;
    for (let seed = 1; seed <= 30; seed += 1) {
      const field = entrantField(blanks(4), seed);
      const stalls = field.map((horse) => horse.stall ?? 0);
      seen.add(stalls.join(","));
      if (stalls.some((stall, index) => stall !== index + 1)) pastRoster = true;
      if (stalls.some((stall) => stall > 4)) pastCount = true;
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(pastRoster).toBe(true);
    expect(pastCount).toBe(true);
  });

  it("fills blank names from the catalog, then ordinary names, skipping names already used", () => {
    expect(fillEntrantNames(["", "하늘새", "  "])).toEqual(["번개", "하늘새", "은빛바람"]);
    const catalog = mockHorses.map((horse) => horse.name);
    expect(fillEntrantNames(blanks(10)).slice(0, 8)).toEqual(catalog);
    expect(fillEntrantNames(blanks(10)).slice(8)).toEqual(["바람질주", "달림이"]);
    expect(fillEntrantNames([...catalog, "달림이", ""])).toEqual([...catalog, "달림이", "바람질주"]);
    expect(entrantField(["", "영희"], 1).map((horse) => horse.name)).toEqual(
      entrantField(["", "영희"], 9).map((horse) => horse.name),
    );
  });

  it("puts the participant name on the horse and takes skill, bias, and coat from the catalog", () => {
    const before = mockHorses.map((horse) => ({ ...horse.biases }));
    const field = entrantField(["철수", "영희", "  "], 4);
    expect(field.map((horse) => horse.name)).toEqual(["철수", "영희", "번개"]);
    const skills = new Set<string>();
    for (let seed = 1; seed <= 24; seed += 1) {
      const horse = entrantField(["철수", "영희"], seed)[0];
      expect(horse?.name).toBe("철수");
      const type = mockHorses.find((entry) => entry.skillId === horse?.skillId);
      expect(type).toBeTruthy();
      expect(horse?.biases).toEqual(type?.biases);
      expect(horse?.color).toBe(type?.color);
      expect(horse?.title).toBe(type?.title);
      if (horse) skills.add(horse.skillId);
    }
    expect(skills.size).toBeGreaterThan(1);
    expect(mockHorses.map((horse) => horse.biases)).toEqual(before);
  });

  it("rejects duplicate names and names longer than 8 graphemes", () => {
    const eight = "가".repeat(8).normalize("NFD");
    expect(graphemeLength(eight)).toBe(8);
    expect(eight.length).toBeGreaterThan(8);
    expect(validateEntrantNames([eight, "나"])).toBeNull();
    expect(validateEntrantNames(["가".repeat(9)])).toBe("이름은 8자까지입니다.");
    expect(validateEntrantNames(["번개", "번개"])).toBe("이름이 겹칩니다.");
    expect(validateEntrantNames(fillEntrantNames(["번개", ""]))).toBeNull();
    expect(() => entrantField(["번개", "  번개  "], 1)).toThrow("이름이 겹칩니다.");
    expect(() => entrantField(["가나다라마바사아자", "둘"], 1)).toThrow("이름은 8자까지입니다.");
    expect(entrantField(["가나다라마바사아", ""], 2)[0]?.name).toBe("가나다라마바사아");
  });

  it("redraws stalls for the same roster and keeps names", () => {
    const field = entrantField(["가", "나", "다", "라"], 4);
    const again = reshuffleStalls(field, 4);
    expect(again.map((horse) => horse.stall)).toEqual(reshuffleStalls(field, 4).map((horse) => horse.stall));
    expect(again.map((horse) => horse.id)).toEqual(field.map((horse) => horse.id));
    expect(again.map((horse) => horse.name)).toEqual(field.map((horse) => horse.name));
    expect(again.map((horse) => horse.skillId)).toEqual(field.map((horse) => horse.skillId));
    expect(again.map((horse) => horse.biases)).toEqual(field.map((horse) => horse.biases));
    const seen = new Set<string>();
    let pastCount = false;
    for (let seed = 1; seed <= 40; seed += 1) {
      const stalls = reshuffleStalls(field, seed).map((horse) => horse.stall ?? 0);
      seen.add(stalls.join(","));
      expect(new Set(stalls).size).toBe(field.length);
      expect(MAX_HORSES - new Set(stalls).size).toBe(MAX_HORSES - field.length);
      if (stalls.some((stall) => stall > field.length)) pastCount = true;
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(pastCount).toBe(true);
  });

  it("starts each horse in its assigned stall and still races one horse", () => {
    const field = entrantField(blanks(4), 5);
    const race = simulateRace(field, 5);
    expect(race.horses.map((horse) => horse.number)).toEqual(field.map((horse) => horse.stall));
    for (const horse of race.horses) expect(laneAt(horse.lanes, 0)).toBe(horse.number);
    expect(race.ranking.map((horse) => horse.rank)).toEqual([1, 2, 3, 4]);

    const solo = simulateRace([mockHorses[0]!], 3);
    expect(solo.horses).toHaveLength(1);
    expect(solo.horses[0]?.number).toBe(1);
    expect(solo.horses[0]?.rank).toBe(1);
  });
});
