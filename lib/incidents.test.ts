import { FINISH_M } from "./lanes";
import { describe, expect, it } from "vitest";
import { fieldHorses } from "./field";
import { INCIDENT_TUNING, footSpeedFactor, planIncidents, rollMode, type FootMode } from "./incidents";
import { mockHorses } from "./mockHorses";
import { mulberry32 } from "./rng";
import { simulateRace } from "./race";

const T = INCIDENT_TUNING;
const race = (seed: number, options = {}) => simulateRace(fieldHorses(mockHorses, seed), seed, options);
const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1);
const FOOT_START = T.fallS + T.getUpS;

describe("director", () => {
  it("makes the same plan for the same seed", () => {
    for (const seed of [3, 17, 88]) {
      const a = race(seed);
      const b = race(seed);
      expect(b.horses.map((horse) => [horse.dismount, horse.fate])).toEqual(a.horses.map((horse) => [horse.dismount, horse.fate]));
      expect(b.horses.map((horse) => horse.samples)).toEqual(a.horses.map((horse) => horse.samples));
      expect(b.titan).toEqual(a.titan);
    }
  });

  it("changes nothing with incidents off", () => {
    const off = race(5, { incidents: false });
    expect(off.horses.every((horse) => horse.dismount === null && horse.fate === null)).toBe(true);
    expect(off.titan).toBeNull();
  });

  it("keeps the budget on every seed", () => {
    for (const seed of SEEDS) {
      const result = race(seed);
      const dismounts = result.horses.flatMap((horse) => (horse.dismount ? [{ horse, ...horse.dismount }] : []));
      const big = dismounts.filter((entry) => entry.cause !== "collision");
      expect(big.every((entry) => entry.cause === big[0]?.cause)).toBe(true);
      expect(new Set(big.map((entry) => entry.time)).size).toBeLessThanOrEqual(1);
      expect(dismounts.filter((entry) => entry.cause === "collision").length).toBeLessThanOrEqual(1);
      const times = [...new Set(dismounts.map((entry) => entry.time))].sort((a, b) => a - b);
      for (let index = 1; index < times.length; index += 1) {
        expect((times[index] ?? 0) - (times[index - 1] ?? 0)).toBeGreaterThanOrEqual(T.minGap - 1e-6);
      }
      for (const entry of dismounts) {
        expect(entry.time).toBeGreaterThanOrEqual(T.firstAt);
        const index = Math.round(entry.time / 0.1);
        const leader = Math.max(...result.horses.map((horse) => horse.samples[index] ?? 0));
        expect(leader).toBeLessThanOrEqual(T.leaderCutoff + 0.01);
      }
    }
  });

  it("fires each cause across seeds", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) for (const horse of race(seed).horses) if (horse.dismount) seen.add(horse.dismount.cause);
    expect([...seen].sort()).toEqual(["collision", "graze", "titan"]);
  });

  it("pairs each fate with its dismount", () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const horse of race(seed).horses) {
        expect(Boolean(horse.fate)).toBe(Boolean(horse.dismount));
        if (!horse.dismount || !horse.fate) continue;
        const want = { collision: "down", titan: "eaten", graze: "graze" }[horse.dismount.cause];
        expect(horse.fate.kind).toBe(want);
      }
    }
  });
});

describe("forced incidents", () => {
  it.each(["collision", "titan", "graze"] as const)("forces %s with the chosen mode", (cause) => {
    const result = race(11, { force: { cause, mode: "super" } });
    const down = result.horses.filter((horse) => horse.dismount);
    expect(down.length).toBeGreaterThan(0);
    expect(down.every((horse) => horse.dismount?.cause === cause && horse.dismount.mode === "super")).toBe(true);
  });
});

describe("mode roll", () => {
  it("is about 60/20/20", () => {
    const random = mulberry32(2024);
    const counts: Record<FootMode, number> = { run: 0, super: 0, bike: 0 };
    const n = 20000;
    for (let index = 0; index < n; index += 1) counts[rollMode(random, 0.3)] += 1;
    expect(Math.abs((counts.run / n) * 100 - 60)).toBeLessThan(5);
    expect(Math.abs((counts.super / n) * 100 - 20)).toBeLessThan(5);
    expect(Math.abs((counts.bike / n) * 100 - 20)).toBeLessThan(5);
  });

  it("never rolls bike near the finish", () => {
    const random = mulberry32(9);
    for (let index = 0; index < 5000; index += 1) {
      expect(rollMode(random, 1 - T.bikeMinRemaining + 0.001)).not.toBe("bike");
    }
  });

  it("holds the forced mode", () => {
    expect(rollMode(() => 0.99, 0.99, "bike")).toBe("bike");
  });

  it("stays seeded: the schedule is a pure function of the seed", () => {
    expect(planIncidents(12)).toEqual(planIncidents(12));
  });
});

describe("footSpeedFactor", () => {
  it("is zero through the fall and get-up", () => {
    for (const mode of ["run", "super", "bike"] as const) {
      expect(footSpeedFactor(mode, 0)).toBe(0);
      expect(footSpeedFactor(mode, FOOT_START - 0.01)).toBe(0);
    }
  });

  it("runs at 0.72 and supers at 1.15 after a 0.5 s ramp", () => {
    expect(footSpeedFactor("run", FOOT_START + 5)).toBe(0.72);
    expect(footSpeedFactor("super", FOOT_START + 0.25)).toBeCloseTo(0.575, 5);
    expect(footSpeedFactor("super", FOOT_START + 3)).toBe(1.15);
  });

  it("summons the bike for 1.5 s, then eases 0.5 to 3.0 and caps", () => {
    expect(footSpeedFactor("bike", FOOT_START + 1.4)).toBe(0);
    expect(footSpeedFactor("bike", FOOT_START + 1.5 + 0.001)).toBeCloseTo(0.5, 2);
    const mid = footSpeedFactor("bike", FOOT_START + 1.5 + 3.5);
    expect(mid).toBeCloseTo(1.75, 5);
    expect(footSpeedFactor("bike", FOOT_START + 1.5 + 7)).toBeCloseTo(3.0, 5);
    expect(footSpeedFactor("bike", FOOT_START + 60)).toBe(3.0);
    let last = 0;
    for (let t = 0; t < 12; t += 0.1) {
      const value = footSpeedFactor("bike", FOOT_START + t);
      expect(value).toBeGreaterThanOrEqual(last - 1e-9);
      last = value;
    }
  });
});

describe("ranking", () => {
  it("ranks the jockey crossing the line", () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const result = race(seed);
      const order = [...result.horses].sort((a, b) => a.finishTime - b.finishTime || a.number - b.number);
      expect(result.ranking.map((horse) => horse.id)).toEqual(order.map((horse) => horse.id));
      for (const horse of result.horses) {
        const crossed = horse.samples.findIndex((value) => value >= 1);
        expect(crossed).toBeGreaterThan(0);
        expect(Math.abs(crossed * 0.1 - horse.finishTime)).toBeLessThanOrEqual(0.1 + 1e-6);
        expect(horse.finishTime).toBeLessThan(70);
      }
    }
  });

  it("keeps every on-foot jockey moving forward after the fall", () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const horse of race(seed).horses) {
        for (let index = 1; index < horse.samples.length; index += 1) {
          expect(horse.samples[index] ?? 0).toBeGreaterThanOrEqual((horse.samples[index - 1] ?? 0) - 1e-9);
        }
      }
    }
  });
});

describe("debug URL override", () => {
  it("parses cause and mode and drops junk", async () => {
    const { parseForcedIncident } = await import("./incidents");
    expect(parseForcedIncident("?incident=titan&mode=bike")).toEqual({ cause: "titan", mode: "bike" });
    expect(parseForcedIncident("?mode=super")).toEqual({ mode: "super" });
    expect(parseForcedIncident("?incident=nope&mode=x")).toBeNull();
    expect(parseForcedIncident("")).toBeNull();
  });
});

describe("downed horse", () => {
  const RACE_M = FINISH_M;
  const overlaps = (seed: number) => {
    const result = race(seed, { force: { cause: "collision", mode: "run" } });
    const down = result.horses.find((horse) => horse.fate?.kind === "down");
    if (!down || down.fate?.kind !== "down") return null;
    const spot = down.fate.at;
    const found: { id: string; time: number }[] = [];
    for (const horse of result.horses) {
      if (horse === down || horse.id === down.dismount?.partnerId) continue;
      horse.samples.forEach((progress, index) => {
        if (index * 0.1 < (down.dismount?.time ?? 0)) return;
        const closeM = Math.abs(progress - spot.progress) * RACE_M < 1.2;
        const closeLane = Math.abs((horse.lanes[index] ?? 0) - spot.lane) < 0.8;
        if (closeM && closeLane) found.push({ id: horse.id, time: index * 0.1 });
      });
    }
    return found;
  };

  it("is steered around by nearly every runner, and nobody is left stuck behind it", () => {
    let races = 0;
    let crossed = 0;
    for (const seed of SEEDS.slice(0, 100)) {
      const found = overlaps(seed);
      if (!found) continue;
      races += 1;
      if (found.length > 0) crossed += 1;
      const result = race(seed, { force: { cause: "collision", mode: "run" } });
      for (const horse of result.horses) expect(horse.finishTime, `seed ${seed} ${horse.id}`).toBeLessThan(70);
    }
    expect(races).toBeGreaterThan(50);
    expect(crossed / races).toBeLessThan(0.1);
  });
});
