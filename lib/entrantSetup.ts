import { fillEntrantNames, graphemeLength, reshuffleStalls, validateEntrantNames, entrantField } from "./field";
import { MAX_HORSES, type HorseInput } from "./race";

/** Last roster that actually left the gate. Count is `names.length`. */
export const RECENT_ENTRANTS_KEY = "gemi.recentEntrants";

export const MIN_ENTRANTS = 2;
export const NAME_LIMIT = 8;

const graphemes = new Intl.Segmenter("ko", { granularity: "grapheme" });

export type EntrantPhase = "title" | "setup" | "lineup" | "racing" | "done";

export type EntrantSession = {
  phase: EntrantPhase;
  /** Typed slots. An empty string is filled with a default name at the lineup. */
  names: string[];
  /** Deals skill, coat, and the first gate draw. Lane shuffles do not change it. */
  typeSeed: number;
  /** Set by 레인 섞기. Null keeps the gates from `typeSeed`. */
  stallSeed: number | null;
  horses: HorseInput[];
};

export type EntrantStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type LineupRow = {
  id: string;
  stall: number;
  name: string;
};

export function createEntrantSession(typeSeed: number): EntrantSession {
  return { phase: "title", names: ["", ""], typeSeed, stallSeed: null, horses: [] };
}

/** One row, at most 8 graphemes. A pasted line is cut, not rejected whole. */
export function clampEntrantName(value: string) {
  const single = value.replace(/[\r\n]/g, "");
  const parts = Array.from(graphemes.segment(single), (part) => part.segment);
  if (parts.length <= NAME_LIMIT) return single;
  return parts.slice(0, NAME_LIMIT).join("");
}

/** Stepper bounds. Shrinking drops the slots at the end. Growing adds empty ones. */
export function resizeEntrantNames(names: readonly string[], count: number) {
  const nextCount = Number.isFinite(count)
    ? Math.min(MAX_HORSES, Math.max(MIN_ENTRANTS, Math.trunc(count)))
    : Math.min(MAX_HORSES, Math.max(MIN_ENTRANTS, names.length));
  const next = names.slice(0, nextCount);
  while (next.length < nextCount) next.push("");
  return next;
}

/** Why 경주 시작 stays disabled. Null means the lineup can open. */
export function entrantIssue(names: readonly string[]) {
  if (names.length < MIN_ENTRANTS || names.length > MAX_HORSES) {
    return `출전마는 ${MIN_ENTRANTS}마리에서 ${MAX_HORSES}마리까지입니다.`;
  }
  return validateEntrantNames(fillEntrantNames(names));
}

export function saveRecentEntrants(store: EntrantStorage, names: readonly string[]) {
  try {
    store.setItem(RECENT_ENTRANTS_KEY, JSON.stringify({ names: [...names] }));
  } catch {
    // Storage can be blocked. The race still starts.
  }
}

export function loadRecentEntrants(store: EntrantStorage): string[] | null {
  try {
    const raw = store.getItem(RECENT_ENTRANTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { names?: unknown };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.names)) return null;
    if (parsed.names.length < MIN_ENTRANTS || parsed.names.length > MAX_HORSES) return null;
    const names: string[] = [];
    for (const name of parsed.names) {
      if (typeof name !== "string" || graphemeLength(name) > NAME_LIMIT) return null;
      names.push(name);
    }
    return names;
  } catch {
    return null;
  }
}

/** Gates from the type seed, then a lane shuffle when the setup asked for one. */
export function lineupField(names: readonly string[], typeSeed: number, stallSeed: number | null) {
  const field = entrantField(names, typeSeed);
  if (stallSeed === null) return field;
  return reshuffleStalls(field, stallSeed);
}

/** Assigned gates only, lowest number first. Empty stalls are not rows. */
export function lineupRows(horses: readonly HorseInput[]): LineupRow[] {
  return horses
    .flatMap((horse) => (horse.stall === undefined ? [] : [{ id: horse.id, stall: horse.stall, name: horse.name }]))
    .sort((left, right) => left.stall - right.stall || left.id.localeCompare(right.id));
}

export function openSetup(session: EntrantSession): EntrantSession {
  if (session.phase !== "title") return session;
  return { ...session, phase: "setup" };
}

export function withCount(session: EntrantSession, count: number): EntrantSession {
  if (session.phase !== "setup") return session;
  return { ...session, names: resizeEntrantNames(session.names, count) };
}

export function withName(session: EntrantSession, index: number, value: string): EntrantSession {
  if (session.phase !== "setup") return session;
  if (!Number.isInteger(index) || index < 0 || index >= session.names.length) return session;
  const names = session.names.slice();
  names[index] = clampEntrantName(value);
  return { ...session, names };
}

/** Drop one slot. Two entrants is the floor, so the ends of the stepper stay put. */
export function removeEntrant(session: EntrantSession, index: number): EntrantSession {
  if (session.phase !== "setup") return session;
  if (session.names.length <= MIN_ENTRANTS) return session;
  if (!Number.isInteger(index) || index < 0 || index >= session.names.length) return session;
  return { ...session, names: session.names.filter((_, slot) => slot !== index) };
}

export function withNames(session: EntrantSession, names: readonly string[]): EntrantSession {
  if (session.phase !== "setup") return session;
  const clamped = names.map((name) => clampEntrantName(name));
  return { ...session, names: resizeEntrantNames(clamped, clamped.length) };
}

/** New gates. The lineup is where they show. Names and horse types stay. */
export function shuffleSetup(session: EntrantSession, stallSeed: number): EntrantSession {
  if (session.phase !== "setup" || entrantIssue(session.names)) return session;
  return { ...session, stallSeed };
}

export function presentLineup(session: EntrantSession): EntrantSession {
  if (session.phase !== "setup" || entrantIssue(session.names)) return session;
  return {
    ...session,
    phase: "lineup",
    horses: lineupField(session.names, session.typeSeed, session.stallSeed),
  };
}

/** 레인 다시 섞기 and 다시 하기. Same horses, new stalls, lineup — not a new race. */
export function reshuffleToLineup(session: EntrantSession, stallSeed: number): EntrantSession {
  if (session.horses.length < MIN_ENTRANTS) return session;
  return {
    ...session,
    phase: "lineup",
    stallSeed,
    horses: reshuffleStalls(session.horses, stallSeed),
  };
}

export function startRacing(session: EntrantSession): EntrantSession {
  if (session.phase !== "lineup" || session.horses.length < MIN_ENTRANTS) return session;
  return { ...session, phase: "racing" };
}

export function finishRacing(session: EntrantSession): EntrantSession {
  if (session.phase !== "racing") return session;
  return { ...session, phase: "done" };
}

/** Result screen 설정 변경. The typed slots stay so the form opens filled. */
export function returnToSetup(session: EntrantSession): EntrantSession {
  if (session.phase !== "done" && session.phase !== "racing") return session;
  return { ...session, phase: "setup" };
}
