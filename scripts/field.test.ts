import { describe, expect, it } from "vitest";
import { fieldHorses, reshuffleStalls } from "../lib/field";
import { mockHorses } from "../lib/mockHorses";
import { MAX_HORSES } from "../lib/race";

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
