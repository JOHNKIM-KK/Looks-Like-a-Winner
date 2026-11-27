import { describe, it } from "vitest";
import { fieldHorses } from "../lib/field";
import { mockHorses } from "../lib/mockHorses";
import { simulateRace } from "../lib/race";

/** `INCIDENT_STATS=1 npx vitest run scripts/incident-stats` prints how often each incident fires over seeds 1-200. */
describe.runIf(process.env.INCIDENT_STATS === "1")("incident stats", () => {
  it("prints", () => {
    const seeds = 200;
    const causes: Record<string, number> = { collision: 0, titan: 0, graze: 0 };
    const racesWith: Record<string, number> = { collision: 0, titan: 0, graze: 0 };
    const finish: Record<string, number[]> = { run: [], super: [], bike: [] };
    const winnerMode: Record<string, number> = { none: 0, run: 0, super: 0, bike: 0 };
    const gap: number[] = [];
    let anyIncident = 0;
    let slowest = 0;
    for (let seed = 1; seed <= seeds; seed += 1) {
      const race = simulateRace(fieldHorses(mockHorses, seed), seed);
      const down = race.horses.filter((horse) => horse.dismount);
      if (down.length > 0) anyIncident += 1;
      for (const cause of new Set(down.map((horse) => horse.dismount?.cause ?? ""))) racesWith[cause] = (racesWith[cause] ?? 0) + 1;
      for (const horse of down) {
        const d = horse.dismount;
        if (!d) continue;
        causes[d.cause] = (causes[d.cause] ?? 0) + 1;
        finish[d.mode]?.push(horse.finishTime);
      }
      const winner = race.ranking[0];
      winnerMode[winner?.dismount?.mode ?? "none"] = (winnerMode[winner?.dismount?.mode ?? "none"] ?? 0) + 1;
      const first = race.ranking[0]?.finishTime ?? 0;
      gap.push(Math.max(...race.horses.map((horse) => horse.finishTime)) - first);
      slowest = Math.max(slowest, ...race.horses.map((horse) => horse.finishTime));
    }
    const mean = (list: number[]) => (list.length ? (list.reduce((a, b) => a + b, 0) / list.length).toFixed(2) : "n/a");
    console.log(JSON.stringify({
      seeds,
      racesWithAnyIncident: anyIncident,
      racesWithCause: racesWith,
      dismountsByCause: causes,
      onFootCountByMode: Object.fromEntries(Object.entries(finish).map(([k, v]) => [k, v.length])),
      avgFinishByMode: Object.fromEntries(Object.entries(finish).map(([k, v]) => [k, mean(v)])),
      winnerByMode: winnerMode,
      avgLastMinusFirst: mean(gap),
      slowestFinish: slowest.toFixed(2),
    }, null, 2));
  });
});
