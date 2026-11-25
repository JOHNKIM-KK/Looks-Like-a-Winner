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

const graphemes = new Intl.Segmenter("ko", { granularity: "grapheme" });

/** Hangul syllables count as one character, including decomposed jamo. */
export function graphemeLength(text: string) {
  return Array.from(graphemes.segment(text)).length;
}

/**
 * Final names, after empty slots have been filled.
 * Longer than 8 graphemes, or the same name twice, cannot start.
 */
export function validateEntrantNames(names: readonly string[]) {
  const seen = new Set<string>();
  for (const name of names) {
    if (graphemeLength(name) > 8) return "이름은 8자까지입니다.";
    if (seen.has(name)) return "이름이 겹칩니다.";
    seen.add(name);
  }
  return null;
}

function defaultNamePool() {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const horse of mockHorses) {
    if (seen.has(horse.name)) continue;
    seen.add(horse.name);
    names.push(horse.name);
  }
  for (const name of ORDINARY_NAMES) {
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * Empty or whitespace-only slots take the next unused default name.
 * Catalog names come first, then ordinary names. Names already taken are skipped.
 */
export function fillEntrantNames(names: readonly string[]) {
  const trimmed = names.map((name) => name.trim());
  const used = new Set(trimmed.filter((name) => name.length > 0));
  const pool = defaultNamePool();
  let cursor = 0;
  return trimmed.map((name) => {
    if (name) return name;
    while (cursor < pool.length && used.has(pool[cursor] ?? "")) cursor += 1;
    const next = pool[cursor];
    if (!next) throw new Error("기본 이름이 부족합니다.");
    cursor += 1;
    used.add(next);
    return next;
  });
}

/** N distinct stalls out of the 12 gates. The rest stay empty. */
function drawStalls(count: number, seed: number, salt: number) {
  const random = mulberry32(mixSeed(seed, salt));
  const gates = shuffle(
    Array.from({ length: MAX_HORSES }, (_, index) => index + 1),
    random,
  );
  return gates.slice(0, count);
}

function dealTypes(count: number, seed: number) {
  const random = mulberry32(mixSeed(seed, 0x7be01));
  const deck = shuffle(mockHorses, random);
  return Array.from({ length: count }, (_, index) => deck[index % deck.length]);
}

/**
 * V2 entry. One horse per participant, never padded to 12.
 * Names stay the participants' names. Skill, bias, and coat come from the catalog.
 * Stalls are a seeded draw of N gates out of 12.
 */
export function entrantField(names: readonly string[], seed: number): HorseInput[] {
  if (names.length < 2 || names.length > MAX_HORSES) {
    throw new Error(`출전마는 2마리에서 ${MAX_HORSES}마리까지입니다.`);
  }
  const resolved = fillEntrantNames(names);
  const issue = validateEntrantNames(resolved);
  if (issue) throw new Error(issue);
  const types = dealTypes(names.length, seed);
  const stalls = drawStalls(names.length, seed, 0x0a11e);
  return resolved.map((name, index) => {
    const type = types[index];
    const stall = stalls[index];
    if (!type || stall === undefined) throw new Error("출전 말을 만들지 못했습니다.");
    return {
      id: `entrant-${index + 1}`,
      name,
      title: type.title,
      color: type.color,
      skillId: type.skillId,
      biases: { ...type.biases },
      reasons: [type.reasons[0], type.reasons[1]],
      stall,
    };
  });
}

function copyHorse(horse: HorseInput): HorseInput {
  return {
    id: horse.id,
    name: horse.name,
    title: horse.title,
    color: horse.color,
    skillId: horse.skillId,
    biases: { ...horse.biases },
    reasons: [horse.reasons[0], horse.reasons[1]],
    ...(horse.stall !== undefined ? { stall: horse.stall } : {}),
  };
}

/**
 * Same entrants and the same horse count. Only the gate assignment changes.
 * Horses that already have stalls keep roster order and draw new stalls.
 * A legacy full field has no stalls, so its array order is shuffled instead.
 */
export function reshuffleStalls(horses: readonly HorseInput[], seed: number): HorseInput[] {
  const copies = horses.map(copyHorse);
  if (copies.length > 0 && copies.every((horse) => horse.stall !== undefined)) {
    const stalls = drawStalls(copies.length, seed, 0x57411);
    return copies.map((horse, index) => {
      const stall = stalls[index];
      if (stall === undefined) throw new Error("칸을 다시 뽑지 못했습니다.");
      return { ...horse, stall };
    });
  }
  return shuffle(copies, mulberry32(mixSeed(seed, 0x57411)));
}
