import { pathToFileURL } from "node:url";
import { FINISH_TIMELINE } from "../game/finishSequence";
import { ENGINE_PX_PER_M, referenceDistance, segmentEnds } from "../game/track";
import { entrantField, fieldHorses } from "../lib/field";
import { LANE_ZONES, zoneAt, type LaneZone } from "../lib/lanes";
import { mockHorses } from "../lib/mockHorses";
import { MAX_HORSES, simulateRace } from "../lib/race";

/** SPEC §8-4 field sizes. */
export const ENTRANT_COUNTS = [4, 6, 8, 12] as const;

export type EntrantFairness = {
  count: number;
  seeds: number;
  seconds: number;
  /** Starts and wins per gate stall 1–12. Rate is wins/starts, the stall's win rate when occupied. */
  gateStarts: number[];
  gateWins: number[];
  /** Wins by roster slot 1–N. */
  rosterWins: number[];
};

export function measureEntrantFairness(count: number, seeds: number): EntrantFairness {
  const gateStarts = Array.from({ length: MAX_HORSES }, () => 0);
  const gateWins = Array.from({ length: MAX_HORSES }, () => 0);
  const rosterWins = Array.from({ length: count }, () => 0);
  const names = Array.from({ length: count }, () => "");
  const started = performance.now();
  for (let seed = 1; seed <= seeds; seed += 1) {
    const field = entrantField(names, seed);
    for (const horse of field) gateStarts[(horse.stall ?? 1) - 1] += 1;
    const race = simulateRace(field, seed);
    const roster = race.horses.findIndex((horse) => horse.rank === 1);
    const winner = race.horses[roster];
    if (!winner || roster < 0) continue;
    gateWins[winner.number - 1] += 1;
    rosterWins[roster] += 1;
  }
  return {
    count,
    seeds,
    seconds: (performance.now() - started) / 1000,
    gateStarts,
    gateWins,
    rosterWins,
  };
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

export function formatEntrantFairness(measured: EntrantFairness) {
  const target = 1 / measured.count;
  const gateRates = measured.gateWins.map((wins, index) => wins / Math.max(1, measured.gateStarts[index] ?? 0));
  const rosterRates = measured.rosterWins.map((wins) => wins / measured.seeds);
  const mark = (rate: number) => (Math.abs(rate - target) > 0.02 ? `**${pct(rate)}**` : pct(rate));
  const head = Array.from({ length: MAX_HORSES }, (_, index) => `${index + 1}`).join(" | ");
  const lines = [
    `### N=${measured.count} (${measured.seconds.toFixed(1)}s, 목표 ${pct(target)} ±2%p)`,
    "",
    `| 칸 | ${head} |`,
    `|---|${Array.from({ length: MAX_HORSES }, () => "---").join("|")}|`,
    `| 출전 | ${measured.gateStarts.join(" | ")} |`,
    `| 1착 | ${measured.gateWins.join(" | ")} |`,
    `| 칸에 말이 있을 때 1착률 | ${gateRates.map(mark).join(" | ")} |`,
    "",
    `| 명단 | ${rosterRates.map((_, index) => `${index + 1}`).join(" | ")} |`,
    `|---|${rosterRates.map(() => "---").join("|")}|`,
    `| 1착률 | ${rosterRates.map(mark).join(" | ")} |`,
    "",
    `- 칸 1착률 ${gateRates.every((rate) => Math.abs(rate - target) <= 0.02) ? "합격" : "기준 밖"}, 명단 1착률 ${rosterRates.every((rate) => Math.abs(rate - target) <= 0.02) ? "합격" : "기준 밖"}.`,
  ];
  return lines.join("\n");
}

const LEAD_MARGIN = 0.004;

export type DramaReport = {
  seeds: number;
  seconds: number;
  leadChanges: number;
  lateLeadChanges: number;
  racesWithLate: number;
  photoFinishes: number;
  winnerMean: number;
  winnerP10: number;
  winnerP50: number;
  winnerP90: number;
  winnerMin: number;
  winnerMax: number;
  lastMean: number;
  kmh: number;
};

/** Lead changes use the commentary rule (0.004 progress, about 1.8 m). Late means the new leader is on the home straight. Photo is 1st–2nd within FINISH_TIMELINE.photoGap (0.03 s). */
export function measureDrama(seeds: number): DramaReport {
  const home = segmentEnds().corner34Exit;
  const length = referenceDistance() / ENGINE_PX_PER_M;
  const winnerTimes: number[] = [];
  let leadChanges = 0;
  let lateLeadChanges = 0;
  let racesWithLate = 0;
  let photoFinishes = 0;
  let lastTime = 0;
  const started = performance.now();

  for (let seed = 1; seed <= seeds; seed += 1) {
    const race = simulateRace(fieldHorses(mockHorses, seed), seed);
    const horses = race.horses;
    const winner = race.ranking[0];
    const second = race.ranking[1];
    const winTime = winner?.finishTime ?? 0;
    winnerTimes.push(winTime);
    lastTime += Math.max(...horses.map((horse) => horse.finishTime));
    if (winner && second && second.finishTime - winner.finishTime <= FINISH_TIMELINE.photoGap) photoFinishes += 1;

    let leader = horses[0];
    let lateHere = 0;
    const count = Math.min(...horses.map((horse) => horse.samples.length));
    for (let index = 1; index < count; index += 1) {
      if (horses.some((horse) => (horse.samples[index] ?? 0) >= 1)) break;
      const next = horses.reduce((best, horse) => {
        return (horse.samples[index] ?? 0) > (best?.samples[index] ?? 0) + LEAD_MARGIN ? horse : best;
      }, leader);
      if (!next || next.id === leader?.id) continue;
      leadChanges += 1;
      if ((next.samples[index] ?? 0) >= home) lateHere += 1;
      leader = next;
    }
    lateLeadChanges += lateHere;
    if (lateHere > 0) racesWithLate += 1;
  }

  winnerTimes.sort((a, b) => a - b);
  const pick = (p: number) => winnerTimes[Math.min(winnerTimes.length - 1, Math.floor(p * winnerTimes.length))] ?? 0;
  const winnerMean = winnerTimes.reduce((sum, time) => sum + time, 0) / seeds;
  return {
    seeds,
    seconds: (performance.now() - started) / 1000,
    leadChanges,
    lateLeadChanges,
    racesWithLate,
    photoFinishes,
    winnerMean,
    winnerP10: pick(0.1),
    winnerP50: pick(0.5),
    winnerP90: pick(0.9),
    winnerMin: winnerTimes[0] ?? 0,
    winnerMax: winnerTimes[winnerTimes.length - 1] ?? 0,
    lastMean: lastTime / seeds,
    kmh: (length / winnerMean) * 3.6,
  };
}

export function formatDrama(drama: DramaReport) {
  const perRace = drama.leadChanges / drama.seeds;
  const lateShare = drama.lateLeadChanges / Math.max(1, drama.leadChanges);
  const lateRaces = drama.racesWithLate / drama.seeds;
  const photo = drama.photoFinishes / drama.seeds;
  const mark = (ok: boolean) => (ok ? "합격" : "기준 밖");
  return [
    `### 드라마·시간 (${drama.seeds}판, ${drama.seconds.toFixed(1)}s)`,
    "",
    `- 역전: 경주당 ${perRace.toFixed(2)}회. 기준 ≥3. ${mark(perRace >= 3)}.`,
    `- 후반 역전 경주(홈 직선에서 선두가 바뀐 경주): ${(lateRaces * 100).toFixed(2)}%. 기준 ≥40%. ${mark(lateRaces >= 0.4)}.`,
    `- 역전 횟수 중 후반 비율: ${(lateShare * 100).toFixed(2)}% (참고. 위 기준과 별도).`,
    `- 사진판정(1·2착 차이 ≤ ${FINISH_TIMELINE.photoGap}s): ${(photo * 100).toFixed(2)}% (${drama.photoFinishes}/${drama.seeds}). 약 15%는 12~18%로 본다. ${mark(photo >= 0.12 && photo <= 0.18)}.`,
    `- 1착 시간: 평균 ${drama.winnerMean.toFixed(2)}s, p10 ${drama.winnerP10.toFixed(2)}s, p50 ${drama.winnerP50.toFixed(2)}s, p90 ${drama.winnerP90.toFixed(2)}s, 최소 ${drama.winnerMin.toFixed(2)}s, 최대 ${drama.winnerMax.toFixed(2)}s.`,
    `- 1착 평균 속력 ${drama.kmh.toFixed(2)} km/h. 목표 약 41 km/h, 약 39초.`,
    `- 꼴찌 평균 ${drama.lastMean.toFixed(2)}s.`,
    `- 역전 정의: 실황과 같음. 샘플 0.1초, 앞말보다 진행률 0.004(약 1.8m) 이상 앞서야 선두 교체. 후반은 3·4코너를 나온 홈 직선.`,
  ].join("\n");
}

export function reportLegacyField(seeds: number) {
  const length = referenceDistance() / ENGINE_PX_PER_M;
  const straights: LaneZone[] = ["firstStraight", "backStraight", "home"];
  const corners: LaneZone[] = ["corner12", "corner34"];
  const wins = Array.from({ length: MAX_HORSES }, () => 0);
  const passes = Object.fromEntries(LANE_ZONES.map(({ zone }) => [zone, 0])) as Record<LaneZone, number>;
  let winnerTime = 0;
  let lastTime = 0;
  const started = performance.now();

  for (let seed = 1; seed <= seeds; seed += 1) {
    const race = simulateRace(fieldHorses(mockHorses, seed), seed);
    const horses = race.horses;
    wins[(race.ranking[0]?.number ?? 1) - 1] += 1;
    winnerTime += race.ranking[0]?.finishTime ?? 0;
    lastTime += Math.max(...horses.map((horse) => horse.finishTime));

    const count = Math.min(...horses.map((horse) => horse.samples.length));
    for (let index = 1; index < count; index += 1) {
      for (const passer of horses) {
        const now = passer.samples[index];
        if (now === undefined || now >= 1) continue;
        for (const passed of horses) {
          const passedNow = passed.samples[index];
          const passerPrev = passer.samples[index - 1];
          const passedPrev = passed.samples[index - 1];
          if (passed === passer || passedNow === undefined || passedNow >= 1) continue;
          if (passerPrev === undefined || passedPrev === undefined) continue;
          if (passerPrev < passedPrev && now > passedNow) passes[zoneAt(now * length)] += 1;
        }
      }
    }
  }

  const fmt = (value: number, digits = 2) => value.toFixed(digits);
  const total = Object.values(passes).reduce((sum, value) => sum + value, 0);
  const sum = (zones: LaneZone[]) => zones.reduce((acc, zone) => acc + passes[zone], 0);
  const rates = wins.map((count) => count / seeds);
  const gateOk = rates.every((rate) => Math.abs(rate - 1 / MAX_HORSES) <= 0.02);
  return [
    `### 12마리 고정 배정 (${fmt((performance.now() - started) / 1000, 1)}s)`,
    "",
    "합격 범위 6.33%~10.33% (1/12 ±2%p).",
    "",
    `| 칸 | ${wins.map((_, index) => `${index + 1}`).join(" | ")} |`,
    `|---|${wins.map(() => "---").join("|")}|`,
    `| 1착률 | ${rates.map((rate) => `${fmt(rate * 100)}%`).join(" | ")} |`,
    "",
    `- 칸 공정성: ${gateOk ? "합격" : "기준 밖"}.`,
    `- 1착 평균 ${fmt(winnerTime / seeds)}s, 꼴찌 평균 ${fmt(lastTime / seeds)}s.`,
    `- ${LANE_ZONES.map(({ zone }) => `${zone} ${fmt(passes[zone] / seeds)} (${fmt((passes[zone] / total) * 100, 1)}%)`).join(", ")}.`,
    `- 경주당 추월 ${fmt(total / seeds)}회, 직선:코너 = ${fmt(sum(straights) / Math.max(1, sum(corners)))} : 1. 이 추월 횟수는 선두 교체가 아니라 모든 순위 교차다.`,
  ].join("\n");
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invoked) {
  const seeds = Number(process.env.SEEDS ?? 10000);
  console.log(reportLegacyField(seeds));
  console.log("");
  console.log(formatDrama(measureDrama(seeds)));
  console.log("\n## 출전 N, 12칸 중 무작위 배정");
  for (const count of ENTRANT_COUNTS) {
    console.log("");
    console.log(formatEntrantFairness(measureEntrantFairness(count, seeds)));
  }
}
