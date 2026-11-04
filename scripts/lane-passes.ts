import fs from "node:fs";
import path from "node:path";
import { ENGINE_PX_PER_M, referenceDistance } from "../game/track";
import { fieldHorses } from "../lib/field";
import { CHUTE_END_M, LANE_RULES, LANE_ZONES, zoneAt, type LaneZone } from "../lib/lanes";
import { mockHorses } from "../lib/mockHorses";
import { SAMPLE_STEP, simulateRace, type RaceHorse } from "../lib/race";

const SEEDS = Number(process.env.SEEDS ?? 2000);
const OUT = process.env.OUT ?? "docs/stage2/captures/taskB/passes.md";
const RACE_LENGTH_M = referenceDistance() / ENGINE_PX_PER_M;
const HOME_FROM_M = 305;
const HOME_TO_M = 350;

const ZONE_LABEL: Record<LaneZone, string> = {
  chute: "슈트 (0~55m)",
  firstStraight: "첫 직선 (55~135.3m)",
  corner12: "코너1 (1·2코너, 135.3~179.3m)",
  backStraight: "백스트레치 (179.3~259.5m)",
  corner34: "코너2 (3·4코너, 259.5~303.5m)",
  home: "결승 직선 (303.5~357m)",
};
const STRAIGHTS: LaneZone[] = ["firstStraight", "backStraight", "home"];
const CORNERS: LaneZone[] = ["corner12", "corner34"];

/** Lane a horse holds as it reaches `meters`, interpolated between samples. */
function laneAtMeters(horse: RaceHorse, meters: number) {
  const mark = meters / RACE_LENGTH_M;
  const index = horse.samples.findIndex((progress) => progress >= mark);
  if (index <= 0) return horse.lanes[Math.max(0, index)] ?? 0;
  const before = horse.samples[index - 1];
  const after = horse.samples[index];
  const blend = after > before ? (mark - before) / (after - before) : 0;
  return horse.lanes[index - 1] + (horse.lanes[index] - horse.lanes[index - 1]) * blend;
}

function spread(lanes: number[]) {
  const mean = lanes.reduce((sum, lane) => sum + lane, 0) / lanes.length;
  const std = Math.sqrt(lanes.reduce((sum, lane) => sum + (lane - mean) ** 2, 0) / lanes.length);
  return { range: Math.max(...lanes) - Math.min(...lanes), std };
}

const passes = Object.fromEntries(LANE_ZONES.map(({ zone }) => [zone, 0])) as Record<LaneZone, number>;
const wins = Array.from({ length: 12 }, () => 0);
let chuteMaxLane = 0;
const chuteRows = new Map<number, number>();
let railThree = 0;
let chuteSeconds = 0;
const home = { fromRange: 0, toRange: 0, fromStd: 0, toStd: 0 };
const backPasses: { seed: number; time: number; passer: number; passed: number; meters: number; outward: number }[] = [];

for (let seed = 1; seed <= SEEDS; seed += 1) {
  const race = simulateRace(fieldHorses(mockHorses, seed), seed);
  const horses = race.horses;
  wins[(race.ranking[0]?.number ?? 1) - 1] += 1;

  const count = Math.min(...horses.map((horse) => horse.samples.length));
  for (let index = 1; index < count; index += 1) {
    for (const passer of horses) {
      const now = passer.samples[index];
      if (now >= 1) continue;
      for (const passed of horses) {
        if (passed === passer || passed.samples[index] >= 1) continue;
        if (passer.samples[index - 1] < passed.samples[index - 1] && now > passed.samples[index]) {
          const meters = now * RACE_LENGTH_M;
          const zone = zoneAt(meters);
          passes[zone] += 1;
          if (zone === "backStraight") {
            const outward = passer.lanes[index] - passed.lanes[index];
            backPasses.push({ seed, time: index * SAMPLE_STEP, passer: passer.number, passed: passed.number, meters, outward });
          }
        }
      }
    }
  }

  const atChuteEnd = horses.map((horse) => laneAtMeters(horse, CHUTE_END_M));
  const maxLane = Math.max(...atChuteEnd);
  chuteMaxLane += maxLane;
  const rows = Math.round(maxLane);
  chuteRows.set(rows, (chuteRows.get(rows) ?? 0) + 1);
  railThree += atChuteEnd.filter((lane) => lane <= 3.5).length / horses.length;
  const chuteMark = CHUTE_END_M / RACE_LENGTH_M;
  chuteSeconds += horses.reduce((sum, horse) => sum + horse.samples.findIndex((progress) => progress >= chuteMark) * SAMPLE_STEP, 0) / horses.length;

  const from = spread(horses.map((horse) => laneAtMeters(horse, HOME_FROM_M)));
  const to = spread(horses.map((horse) => laneAtMeters(horse, HOME_TO_M)));
  home.fromRange += from.range;
  home.toRange += to.range;
  home.fromStd += from.std;
  home.toStd += to.std;
}

const total = Object.values(passes).reduce((sum, value) => sum + value, 0);
const perRace = (value: number) => value / SEEDS;
const sum = (zones: LaneZone[]) => zones.reduce((acc, zone) => acc + passes[zone], 0);
const straight = sum(STRAIGHTS);
const corner = sum(CORNERS);
const ratio = straight / Math.max(1, corner);
const ratioWithChute = (straight + passes.chute) / Math.max(1, corner);
const homeShare = passes.home / Math.max(1, total);
const homeNearZero = perRace(passes.home) < 0.5;
const laterStraights = passes.backStraight + passes.home;
const chuteTime = chuteSeconds / SEEDS;
const chuteDive = chuteTime * LANE_RULES.chute.railPull;
const widen = home.toRange / Math.max(1e-9, home.fromRange) - 1;

const fmt = (value: number, digits = 2) => value.toFixed(digits);
const rows = LANE_ZONES.map(({ zone }) => {
  return `| ${ZONE_LABEL[zone]} | ${fmt(perRace(passes[zone]))} | ${fmt((passes[zone] / Math.max(1, total)) * 100, 1)}% |`;
});
const rowCounts = [...chuteRows.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([lanes, races]) => `${lanes}레인 ${fmt((races / SEEDS) * 100, 1)}%`)
  .join(", ");

const lines = [
  ...(homeNearZero ? ["**⚠️ 결승 직선 추월 거의 0, 시게루와 '홈 직선만 늘리는 안' 재검토 대상**", ""] : []),
  "# 작업 B 추월 집계 (레인 이동·막힘)",
  "",
  "`npx vite-node -c vitest.config.ts scripts/lane-passes.ts` 로 다시 만든다.",
  "",
  "## 정의",
  "",
  `- 시드 1~${SEEDS}, 출전마는 \`fieldHorses(mockHorses, seed)\` (공정성 테스트와 같음), 스킬 꺼짐.`,
  `- 추월 1회 = 두 말의 진행 순서가 연속한 두 샘플(${SAMPLE_STEP}초 간격) 사이에 뒤바뀐 경우. 두 말 모두 결승 전이어야 한다.`,
  "- 구간은 뒤바뀐 샘플에서 추월한 말의 위치(m)로 정한다. 구간 경계는 SPEC §8-1 표.",
  "",
  "## 구간별 추월",
  "",
  "| 구간 | 경주당 평균 | 비율 |",
  "|---|---|---|",
  ...rows,
  `| 합계 | ${fmt(perRace(total))} | 100% |`,
  "",
  `- 직선(첫 직선+백스트레치+결승 직선) : 코너(코너1+코너2) = **${fmt(ratio)} : 1** (${fmt(perRace(straight))} : ${fmt(perRace(corner))} 경주당). 목표 ≈ 3 : 1.`,
  `- 슈트 포함 직선 : 코너 = ${fmt(ratioWithChute)} : 1 (${fmt(perRace(straight + passes.chute))} : ${fmt(perRace(corner))}).`,
  `- 첫 직선을 뺀 직선(백스트레치+결승 직선) : 코너 = ${fmt(laterStraights / Math.max(1, corner))} : 1. 슈트에서는 바깥으로 빠질 수 없어(outRate 0) 슈트에서 막힌 추월이 첫 직선에 몰린다.`,
  `- 결승 직선 추월: 경주당 ${fmt(perRace(passes.home))}회, 전체의 ${fmt(homeShare * 100, 1)}%.`,
  "",
  "## 슈트 끝(55m) 레일 쪽 뭉침",
  "",
  `- 각 말이 55m를 지날 때의 레인. 가장 바깥 말의 레인 평균 ${fmt(chuteMaxLane / SEEDS)}.`,
  `- 가장 바깥 레인(반올림) 분포: ${rowCounts}.`,
  `- 레인 3.5 안쪽(레일 쪽 3줄)에 있는 말 비율 평균 ${fmt((railThree / SEEDS) * 100, 1)}%.`,
  `- 슈트 통과 평균 ${fmt(chuteTime, 1)}초 × 최대 ${LANE_RULES.chute.railPull}레인/초 = 최대 ${fmt(chuteDive, 1)}레인 안쪽 이동. 12번 칸 말은 막힘이 없어도 레인 ${fmt(12 - chuteDive, 1)} 안쪽으로 못 들어온다. 그래서 SPEC의 '레일 쪽 2~3줄'은 슈트 끝에서 바깥 칸 말까지는 닿지 않는다.`,
  "",
  "## 결승 직선 퍼짐",
  "",
  `| 위치 | 레인 폭(최대−최소) 평균 | 레인 표준편차 평균 |`,
  "|---|---|---|",
  `| ${HOME_FROM_M}m | ${fmt(home.fromRange / SEEDS)} | ${fmt(home.fromStd / SEEDS)} |`,
  `| ${HOME_TO_M}m | ${fmt(home.toRange / SEEDS)} | ${fmt(home.toStd / SEEDS)} |`,
  "",
  `- 레인 폭이 ${HOME_FROM_M}m → ${HOME_TO_M}m 에서 ${fmt(widen * 100, 0)}% 넓어진다. 결승 직선은 안쪽 당김이 0이라 막혀서 바깥으로 빠진 말이 다시 들어오지 않는 만큼만 퍼진다(새 힘은 넣지 않았다).`,
  "",
  "## 칸별 1착률 (같은 시드)",
  "",
  wins.map((count, index) => `${index + 1}번 ${fmt((count / SEEDS) * 100)}%`).join(", "),
  "",
];

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join("\n"));
console.log(lines.join("\n"));

const showcase = backPasses
  .filter((pass) => pass.outward >= 0.9 && pass.meters >= 215 && pass.meters <= 245)
  .slice(0, 12)
  .map((pass) => `seed ${pass.seed} t=${fmt(pass.time, 1)}s ${pass.passer}번→${pass.passed}번 ${fmt(pass.meters, 1)}m 바깥 +${fmt(pass.outward)}`);
console.log("\n백스트레치 바깥 추월 후보:\n" + showcase.join("\n"));
