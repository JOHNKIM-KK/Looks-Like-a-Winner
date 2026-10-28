import type { HorseInput } from "./race";
import { MAX_HORSES } from "./race";
import { mockHorses } from "./mockHorses";

/**
 * Ordinary names for filler horses. Not face-reading titles.
 * The list is only a name source. Types and skills come from the existing roster.
 */
const ORDINARY_NAMES = [
  "바람질주",
  "달림이",
  "검은발",
  "하얀갈기",
  "산들바람",
  "벼락호",
  "아침이슬",
  "밤별",
  "푸른들",
  "빠른발",
  "은빛갈기",
  "노을발",
  "강물",
  "솔바람",
  "구름길",
  "단풍길",
  "바다내음",
  "들판",
  "번개발",
  "서리갈기",
  "발구름",
  "청보리",
  "먹구름",
];

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(seed: number, salt: number) {
  return (Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b) >>> 0) || 1;
}

function shuffle<T>(items: T[], random: () => number) {
  const next = items.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const left = next[index];
    const right = next[swap];
    if (left === undefined || right === undefined) continue;
    next[index] = right;
    next[swap] = left;
  }
  return next;
}

function fillerName(random: () => number, used: Set<string>) {
  const start = Math.floor(random() * ORDINARY_NAMES.length);
  for (let step = 0; step < ORDINARY_NAMES.length; step += 1) {
    const name = ORDINARY_NAMES[(start + step) % ORDINARY_NAMES.length] ?? "달림이";
    if (!used.has(name)) return name;
  }
  let extra = ORDINARY_NAMES.length + 1;
  while (used.has(`달림이 ${extra}`)) extra += 1;
  return `달림이 ${extra}`;
}

/**
 * A filler is a new draw of an existing horse type: the same skill and the same
 * bias numbers already on the roster. Only the name is generated.
 */
function createFiller(random: () => number, usedNames: Set<string>, index: number): HorseInput {
  const catalog = mockHorses;
  const type = catalog[Math.floor(random() * catalog.length)] ?? catalog[0];
  if (!type) throw new Error("no horse type to copy");
  const name = fillerName(random, usedNames);
  usedNames.add(name);
  return {
    id: `filler-${index}-${name}`,
    name,
    title: "임시 출전",
    color: type.color,
    portrait: type.portrait,
    skillId: type.skillId,
    biases: { ...type.biases },
    reasons: ["같은 출전 규칙으로 채워진 말이다", "칸은 시드가 정한다"],
  };
}

/**
 * Always 12 horses. Players keep their own entries. Empty slots become fillers.
 * Stall order is a seed shuffle of players and fillers together.
 */
export function fieldHorses(players: readonly HorseInput[], seed: number): HorseInput[] {
  if (players.length > MAX_HORSES) {
    throw new Error(`출전마는 1마리에서 12마리까지입니다.`);
  }
  const random = mulberry32(mixSeed(seed, 0x51a11));
  const used = new Set(players.map((horse) => horse.name));
  const fillers: HorseInput[] = [];
  for (let index = players.length; index < MAX_HORSES; index += 1) {
    fillers.push(createFiller(random, used, index));
  }
  return shuffle([...players, ...fillers], random);
}
