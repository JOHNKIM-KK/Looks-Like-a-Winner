import { payoffWord } from "@/game/skillShow";
import { COAST_END, cutLength, poseAt, segmentAt, segmentEnds, referenceDistance } from "@/game/track";
import { skillById, type SkillId, type SkillKind } from "./skills";

export { segmentAt, COAST_END };

export const MAX_HORSES = 10;
export const RACE_DURATION = 40;
export const SAMPLE_STEP = 0.1;
export const SKILL_WINDOW = 2.4;
export const SKILL_BOOST = 1.35;
export const SURGE = 1.55;
const CRACK_GAP = 0.16;
const CRACK_SLOW = 0.5;
const CRACK_WINDOW = 2.2;
export const SKILL_SLOW = 1 / 1.35;
export const MIN_SKILL_GAP = 1.2;
export const BRAKE_TIME = 1.5;

function brakeFor(arrive: number) {
  const span = 0.016;
  return Math.min(BRAKE_TIME, Math.max(0.8, (2 * span) / Math.max(arrive, 0.012)));
}
const FOOT_RATE = 0.6;
const STOP_TIME = 0.7;
const GLARE_GAP = 0.07;

export type HorseStats = {
  start: number;
  accel: number;
  stamina: number;
  corner: number;
  mental: number;
  luck: number;
};

export type HorseInput = {
  id: string;
  name: string;
  title: string;
  color: string;
  portrait: string;
  skillId: SkillId;
  biases: HorseStats;
  reasons: [string, string];
};

export type SegmentKind = "straight" | "corner" | "final";

export type SkillCutin = {
  skillName: string;
  shout: string;
  reason: string;
  hit: boolean;
  portrait: string;
  color: string;
  horseName: string;
  number: number;
  payoff: string;
  effect: string;
};

export type RaceEvent = {
  time: number;
  horseId: string;
  message: string;
  cutin?: SkillCutin;
};

export type RaceHorse = HorseInput & {
  number: number;
  stats: HorseStats;
  finishTime: number;
  rank: number;
  samples: number[];
  skillName: string;
  skillShout: string;
  skillTime: number;
  skillHit: boolean;
  skillTargetId: string;
  footFrom: number;
  footUntil: number;
  stopFrom: number;
  stopUntil: number;
  slowFrom: number;
  slowUntil: number;
  swapFrom: number;
  swapUntil: number;
  cutFrom: number;
  cutTo: number;
  cutUntil: number;
};

export type RaceResult = {
  seed: number;
  duration: number;
  horses: RaceHorse[];
  ranking: RaceHorse[];
  events: RaceEvent[];
};

const STAT_KEYS = ["start", "accel", "stamina", "corner", "mental", "luck"] as const;
const BASE_SPEED = 1 / 40.2;
const ENDS = segmentEnds();
const START_SEGMENT = ENDS.pocketEnd;

type Runner = {
  input: HorseInput;
  number: number;
  stats: HorseStats;
  progress: number;
  samples: number[];
  finishTime: number;
  arriveSpeed: number;
  brakeFor: number;
  skillTime: number;
  skillHit: boolean;
  skillUsed: boolean;
  skillTargetId: string;
  buffUntil: number;
  buffMul: number;
  slowFrom: number;
  slowUntil: number;
  slowMul: number;
  footFrom: number;
  footUntil: number;
  stopFrom: number;
  stopUntil: number;
  swapFrom: number;
  swapUntil: number;
  cutFrom: number;
  cutTo: number;
  cutUntil: number;
};

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(seed: number, index: number) {
  return (Math.imul(seed ^ Math.imul(index + 1, 0x9e3779b1), 0x85ebca6b) >>> 0) || 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildStats(biases: HorseStats, random: () => number): HorseStats {
  const stats = {} as HorseStats;
  for (const key of STAT_KEYS) {
    const condition = (random() - 0.5) * 22;
    stats[key] = clamp(Math.round(58 + biases[key] * 4 + condition), 40, 94);
  }
  return stats;
}

export function gateProgress(stats: HorseStats) {
  return 0;
}

function speedAt(stats: HorseStats, progress: number) {
  const kind = segmentAt(Math.min(progress, 0.999));
  let phase = 1;
  if (kind === "straight") {
    phase = 1 + ((stats.accel - 60) / 100) * 0.95;
    if (progress < START_SEGMENT) phase += ((stats.start - 60) / 100) * 2.4;
  } else if (kind === "corner") {
    phase = 1 + ((stats.corner - 60) / 100) * 0.55;
  } else {
    phase = 1 + ((stats.stamina - 60) / 100) * 1.35 + ((stats.mental - 60) / 100) * 0.4;
  }
  const luck = 1 + ((stats.luck - 60) / 100) * 0.1;
  return Math.max(0.012, BASE_SPEED * phase * luck);
}

function previewProgress(stats: HorseStats, time: number) {
  let progress = 0;
  for (let cursor = 0; cursor < time && progress < 1; cursor += 0.25) {
    progress += speedAt(stats, progress) * 0.25;
  }
  return progress;
}

function skillWindows(kind: SkillKind, stats: HorseStats) {
  if (kind === "start") {
    const early: number[] = [];
    for (let time = 0.5; time <= 2.4; time += 0.4) {
      const progress = previewProgress(stats, time);
      if (progress < START_SEGMENT + 0.02) early.push(Number(time.toFixed(1)));
    }
    if (early.length > 0) return early;
  }
  if (kind === "jaywalk") {
    const cuts: number[] = [];
    for (let time = 2; time <= 34; time += 0.5) {
      const progress = previewProgress(stats, time);
      if (cornerRoom(progress) >= 0.14) cuts.push(time);
    }
    if (cuts.length > 0) return cuts;
  }
  const matches: number[] = [];
  for (let time = 2; time <= 38; time += 0.5) {
    const progress = previewProgress(stats, time);
    const ahead = previewProgress(stats, time + 1);
    const segment = segmentAt(progress);
    const settled = segmentAt(ahead) === segment;
    const fits =
      settled &&
      ((kind === "final-burst" && segment === "final") ||
        (kind === "start" && progress < START_SEGMENT) ||
        (kind === "recall" && progress > 0.18 && progress < 0.72) ||
        (kind === "shot" && progress > 0.12 && progress < 0.82) ||
        (kind === "glare" && progress > 0.35 && progress < 0.7) ||
        (kind === "crown" && progress > 0.62 && progress < 0.74) ||
        (kind === "crack" && progress > 0.28 && progress < 0.75));
    if (fits) matches.push(time);
  }
  return matches.length > 0 ? matches : [8, 16, 24, 32];
}

function scheduleSkills(runners: Runner[], seed: number) {
  const random = mulberry32(mixSeed(seed, 99));
  const chosen = runners.map((runner) => {
    const skill = skillById(runner.input.skillId);
    const windows = skillWindows(skill.kind, runner.stats);
    return { runner, windows, time: windows[Math.floor(random() * windows.length)] ?? 12 };
  });
  chosen.sort((a, b) => a.time - b.time || a.runner.number - b.runner.number);
  for (let index = 1; index < chosen.length; index += 1) {
    const previous = chosen[index - 1];
    const current = chosen[index];
    if (current.time < previous.time + MIN_SKILL_GAP) {
      const earliest = previous.time + MIN_SKILL_GAP;
      const later = current.windows.find((time) => time + 0.001 >= earliest);
      current.time = later ?? current.windows[current.windows.length - 1] ?? earliest;
    }
  }
  for (const pick of chosen) {
    const earliestTime = skillById(pick.runner.input.skillId).kind === "start" ? 0.4 : 2;
    pick.runner.skillTime = clamp(Number(pick.time.toFixed(1)), earliestTime, 38);
  }
}

function leaderOf(runners: Runner[]) {
  return [...runners].sort((a, b) => b.progress - a.progress)[0];
}

function applySkill(runners: Runner[], runner: Runner) {
  const skill = skillById(runner.input.skillId);
  const segment = segmentAt(runner.progress);
  let hit = false;

  if (skill.kind === "final-burst") {
    hit = segment === "final";
    if (hit) {
      runner.buffUntil = runner.skillTime + SKILL_WINDOW;
      runner.buffMul = SURGE;
    }
  } else if (skill.kind === "start") {
    hit = runner.progress < START_SEGMENT + 0.02;
    if (hit) {
      runner.buffUntil = runner.skillTime + SKILL_WINDOW;
      runner.buffMul = SURGE;
    }
  } else if (skill.kind === "recall") {
    const others = runners.filter((other) => other.input.id !== runner.input.id);
    hit = others.length > 0;
    for (const other of others) {
      other.footFrom = runner.skillTime;
      other.footUntil = runner.skillTime + SKILL_WINDOW;
    }
  } else if (skill.kind === "jaywalk") {
    const onBend = segment === "corner";
    hit = onBend;
    if (hit) {
      const from = runner.progress;
      const to = Math.max(from + 0.012, Math.min(0.97, ENDS.cornerEnd));
      runner.cutFrom = from;
      runner.cutTo = to;
      runner.cutUntil = runner.skillTime + cutDuration(from, to, runner.number, speedAt(runner.stats, from));
    }
  } else if (skill.kind === "shot") {
    const target = runners
      .filter((other) => {
        const laneGap = Math.abs(other.number - runner.number);
        const progressGap = Math.abs(other.progress - runner.progress);
        return other.input.id !== runner.input.id && laneGap === 1 && progressGap <= 0.06;
      })
      .sort((a, b) => Math.abs(a.progress - runner.progress) - Math.abs(b.progress - runner.progress))[0];
    hit = Boolean(target);
    if (target) {
      runner.skillTargetId = target.input.id;
      target.stopFrom = runner.skillTime;
      target.stopUntil = runner.skillTime + STOP_TIME;
    }
  } else if (skill.kind === "glare") {
    const leader = leaderOf(runners);
    hit = Boolean(leader) && leader.input.id !== runner.input.id && leader.progress - runner.progress <= GLARE_GAP;
    if (leader && leader.input.id !== runner.input.id) runner.skillTargetId = leader.input.id;
    if (hit && leader) {
      leader.slowFrom = runner.skillTime;
      leader.slowUntil = runner.skillTime + SKILL_WINDOW;
      leader.slowMul = SKILL_SLOW;
    }
  } else if (skill.kind === "crown") {
    const ordered = [...runners].sort((a, b) => b.progress - a.progress);
    const leader = ordered[0];
    const pack = ordered.find((other) => other.input.id !== runner.input.id && other.input.id !== leader?.input.id);
    hit = Boolean(leader) && leader.input.id !== runner.input.id;
    if (hit && leader) {
      runner.skillTargetId = leader.input.id;
      const nose = 0.008;
      const front = Math.min(leader.progress, (pack?.progress ?? leader.progress) + 0.028);
      leader.swapFrom = leader.progress;
      runner.swapFrom = runner.progress;
      leader.swapUntil = runner.skillTime + 0.6;
      runner.swapUntil = runner.skillTime + 0.6;
      leader.progress = Math.max(runner.progress, front - nose);
      runner.progress = front + nose;
    }
  } else if (skill.kind === "crack") {
    const nearby = runners.filter((other) => {
      return other.input.id !== runner.input.id && Math.abs(other.progress - runner.progress) <= CRACK_GAP;
    });
    hit = nearby.length > 0;
    for (const other of nearby) {
      other.slowFrom = runner.skillTime;
      other.slowUntil = runner.skillTime + CRACK_WINDOW;
      other.slowMul = CRACK_SLOW;
    }
  }

  runner.skillHit = hit;
  runner.skillUsed = true;
  return hit;
}

function cutDuration(from: number, to: number, lane: number, progressSpeed: number) {
  const start = poseAt(from, lane);
  const probeProgress = Math.min(to, from + 0.008);
  const probe = poseAt(probeProgress, lane);
  const rail = Math.hypot(probe.x - start.x, probe.y - start.y) / Math.max(0.001, probeProgress - from);
  const screenSpeed = Math.max(24, rail * progressSpeed);
  return Math.max(0.55, cutLength(from, to, lane) / screenSpeed);
}

function cornerRoom(progress: number) {
  if (segmentAt(progress) !== "corner") return 0;
  return Math.max(0, ENDS.cornerEnd - progress);
}

function skillReady(runner: Runner) {
  const kind = skillById(runner.input.skillId).kind;
  const segment = segmentAt(runner.progress);
  if (kind === "final-burst") return segment === "final" || runner.progress >= 0.999;
  if (kind === "jaywalk") return cornerRoom(runner.progress) >= 0.14 || runner.progress >= ENDS.cornerEnd - 0.14;
  if (kind === "crown") return runner.progress >= 0.6;
  return true;
}

function stepSpeed(runner: Runner, time: number) {
  if (time < runner.stopUntil) return 0;
  let multiplier = 1;
  if (time < runner.buffUntil) multiplier *= runner.buffMul;
  if (time < runner.slowUntil) multiplier *= runner.slowMul;
  if (time < runner.footUntil) multiplier *= FOOT_RATE;
  return speedAt(runner.stats, runner.progress) * multiplier;
}

function simulate(runners: Runner[]) {
  const finishAt = 70;
  const steps = Math.round(finishAt / SAMPLE_STEP);
  for (let index = 0; index <= steps; index += 1) {
    const time = Number((index * SAMPLE_STEP).toFixed(1));
    for (const runner of runners) {
      if (!runner.skillUsed && time + 0.0001 >= runner.skillTime && skillReady(runner)) {
        if (time > runner.skillTime + 0.001) runner.skillTime = time;
        applySkill(runners, runner);
      }
    }
    for (const runner of runners) {
      if (index === 0) {
        runner.progress = 0;
        runner.samples.push(runner.progress);
        continue;
      }
      if (runner.finishTime > 0) {
        const age = time - runner.finishTime;
        if (age < runner.brakeFor && runner.progress < 1.02) {
          const pull = 1 - Math.max(0, age) / runner.brakeFor;
          runner.progress += runner.arriveSpeed * pull * pull * SAMPLE_STEP;
        }
        runner.samples.push(runner.progress);
        continue;
      }
      if (runner.cutUntil > runner.skillTime && time < runner.cutUntil) {
        const duration = Math.max(0.05, runner.cutUntil - runner.skillTime);
        const blend = Math.min(1, Math.max(0, (time - runner.skillTime) / duration));
        runner.progress = runner.cutFrom + (runner.cutTo - runner.cutFrom) * blend;
        runner.samples.push(runner.progress);
        continue;
      }
      if (runner.cutUntil > runner.skillTime && time + 0.0001 >= runner.cutUntil && runner.progress < runner.cutTo - 0.0001) {
        runner.progress = runner.cutTo;
        runner.samples.push(runner.progress);
        continue;
      }
      const delta = stepSpeed(runner, time) * SAMPLE_STEP;
      if (runner.progress + delta >= 1) {
        const fraction = delta > 0 ? (1 - runner.progress) / delta : 1;
        runner.finishTime = Number((time - SAMPLE_STEP + fraction * SAMPLE_STEP).toFixed(3));
        runner.arriveSpeed = delta / SAMPLE_STEP;
        runner.brakeFor = brakeFor(runner.arriveSpeed);
        const leftoverTime = (1 - fraction) * SAMPLE_STEP;
        const pull = 1 - leftoverTime / (2 * runner.brakeFor);
        runner.progress = Math.min(1.02, 1 + leftoverTime * runner.arriveSpeed * pull * pull);
      } else {
        runner.progress += delta;
      }
      runner.samples.push(runner.progress);
    }
    if (runners.every((runner) => runner.finishTime > 0 && time + 0.0001 >= runner.finishTime + runner.brakeFor)) break;
  }
  for (const runner of runners) {
    if (runner.finishTime === 0) runner.finishTime = finishAt;
  }
}

function buildEvents(horses: RaceHorse[]): RaceEvent[] {
  const events: RaceEvent[] = [
    {
      time: 0,
      horseId: horses[0]?.id ?? "",
      message: "게이트가 열렸습니다.",
    },
  ];

  for (const horse of horses) {
    const skill = skillById(horse.skillId);
    const effect = horse.skillHit ? skill.effect : skill.miss;
    const call = horse.skillHit ? "발동" : "빗나감";
    events.push({
      time: horse.skillTime,
      horseId: horse.id,
      message: `${horse.name}이라 ${horse.skillName} ${call}. ${effect}`,
      cutin: {
        skillName: horse.skillName,
        shout: horse.skillShout,
        reason: horse.reasons[0],
        hit: horse.skillHit,
        portrait: horse.portrait,
        color: horse.color,
        horseName: horse.name,
        number: horse.number,
        payoff: payoffWord(skill.kind, horse.skillHit),
        effect,
      },
    });
  }

  let leaderId = horses[0]?.id ?? "";
  const sampleCount = horses[0]?.samples.length ?? 0;
  for (let index = 1; index < sampleCount; index += 1) {
    const time = Number((index * SAMPLE_STEP).toFixed(1));
    if (horses.some((horse) => (horse.samples[index] ?? 0) >= 1)) break;
    const leader = horses.reduce((best, horse) => {
      return horse.samples[index] > best.samples[index] + 0.004 ? horse : best;
    }, horses.find((horse) => horse.id === leaderId) ?? horses[0]);
    if (leader.id !== leaderId) {
      events.push({
        time,
        horseId: leader.id,
        message: `${leader.number}번 ${leader.name}, 선두를 가져갔습니다.`,
      });
      leaderId = leader.id;
    }
  }

  for (const horse of [...horses].sort((a, b) => a.rank - b.rank)) {
    events.push({
      time: Number(horse.finishTime.toFixed(2)),
      horseId: horse.id,
      message: `${horse.number}번 ${horse.name}, 결승선을 통과했습니다.`,
    });
  }

  return events.sort((a, b) => a.time - b.time);
}

export function simulateRace(horses: HorseInput[], seed: number): RaceResult {
  if (horses.length < 1 || horses.length > MAX_HORSES) {
    throw new Error(`출전마는 1마리에서 ${MAX_HORSES}마리까지입니다.`);
  }
  const runners: Runner[] = horses.map((input, index) => {
    const stats = buildStats(input.biases, mulberry32(mixSeed(seed, index)));
    return {
      input,
      number: index + 1,
      stats,
      progress: 0,
      samples: [],
      finishTime: 0,
      arriveSpeed: 0,
      brakeFor: BRAKE_TIME,
      skillTime: 12,
      skillHit: false,
      skillUsed: false,
      buffUntil: 0,
      buffMul: 1,
      slowFrom: 0,
      slowUntil: 0,
      slowMul: 1,
      footFrom: 0,
      footUntil: 0,
      stopFrom: 0,
      stopUntil: 0,
      swapFrom: 0,
      swapUntil: 0,
      cutFrom: 0,
      cutTo: 0,
      cutUntil: 0,
      skillTargetId: "",
    };
  });

  scheduleSkills(runners, seed);
  simulate(runners);

  const raced: RaceHorse[] = runners.map((runner) => {
    const skill = skillById(runner.input.skillId);
    return {
      ...runner.input,
      number: runner.number,
      stats: runner.stats,
      finishTime: runner.finishTime,
      rank: 0,
      samples: runner.samples,
      skillName: skill.name,
      skillShout: skill.shout,
      skillTime: runner.skillTime,
      skillHit: runner.skillHit,
      footFrom: runner.footFrom,
      footUntil: runner.footUntil,
      stopFrom: runner.stopFrom,
      stopUntil: runner.stopUntil,
      slowFrom: runner.slowFrom,
      slowUntil: runner.slowUntil,
      swapFrom: runner.swapFrom,
      swapUntil: runner.swapUntil,
      cutFrom: runner.cutFrom,
      cutTo: runner.cutTo,
      cutUntil: runner.cutUntil,
      skillTargetId: runner.skillTargetId,
    };
  });

  const ranking = [...raced].sort((a, b) => a.finishTime - b.finishTime || a.number - b.number);
  ranking.forEach((horse, index) => {
    horse.rank = index + 1;
  });

  const duration = Math.max(...raced.map((horse) => horse.finishTime)) + BRAKE_TIME + 0.8;

  return {
    seed,
    duration,
    horses: raced,
    ranking,
    events: buildEvents(raced),
  };
}

export function progressAt(samples: number[], time: number) {
  if (samples.length === 0 || time <= 0) return samples[0] ?? 0;
  const lastIndex = samples.length - 1;
  const maxTime = lastIndex * SAMPLE_STEP;
  if (time >= maxTime) return samples[lastIndex] ?? 1;
  const position = time / SAMPLE_STEP;
  const index = Math.floor(position);
  const fraction = position - index;
  const left = samples[index] ?? 0;
  const right = samples[index + 1] ?? left;
  return left + (right - left) * fraction;
}

export function commentAt(events: RaceEvent[], time: number) {
  let message = "게이트 앞에서 대기 중입니다.";
  for (const event of events) {
    if (event.time <= time + 0.0001) message = event.message;
  }
  return message;
}

export function formatRaceTime(seconds: number) {
  return `${seconds.toFixed(2)}초`;
}

export function cutinAt(events: RaceEvent[], time: number) {
  return [...events].reverse().find((event) => event.cutin && event.time <= time && time < event.time + 0.9);
}
