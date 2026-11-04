import { describe, expect, test } from "vitest";
import { ENGINE_PX_PER_M, referenceDistance, segmentEnds } from "../game/track";
import { fieldHorses } from "../lib/field";
import {
  BACK_STRAIGHT_END_M,
  CHUTE_END_M,
  CORNER12_END_M,
  CORNER34_END_M,
  FIRST_STRAIGHT_END_M,
  HORSE_LENGTH_M,
  MIN_LATERAL_GAP,
  laneRunner,
  stepLanes,
  zoneAt,
  type LaneRunner,
  type LaneZone,
} from "../lib/lanes";
import { mockHorses } from "../lib/mockHorses";
import { SAMPLE_STEP, laneAt, simulateRace, type RaceResult } from "../lib/race";

const SEEDS = 200;
const RACE_LENGTH_M = referenceDistance() / ENGINE_PX_PER_M;
const EPS = 1e-6;

const races: RaceResult[] = Array.from({ length: SEEDS }, (_, index) => {
  const seed = index + 1;
  return simulateRace(fieldHorses(mockHorses, seed), seed);
});

const natural = new WeakMap<LaneRunner, number>();

function runner(meters: number, lane: number, speed: number): LaneRunner {
  const horse = { ...laneRunner(lane), meters, speed };
  natural.set(horse, speed);
  return horse;
}

/** Steps the constructed field for `seconds`, each horse asking for its natural speed every step. Returns each horse's widest lane. */
function run(field: LaneRunner[], seconds: number) {
  const widest = field.map((horse) => horse.lane);
  for (let time = 0; time < seconds; time += SAMPLE_STEP) {
    for (const horse of field) horse.speed = natural.get(horse) ?? horse.speed;
    stepLanes(field, SAMPLE_STEP);
    field.forEach((horse, index) => {
      horse.meters += horse.speed * SAMPLE_STEP;
      widest[index] = Math.max(widest[index], horse.lane);
    });
  }
  return widest;
}

describe("lane zones", () => {
  test("zone boundaries match the track segments within 0.2 m", () => {
    const ends = segmentEnds();
    const metres = (fraction: number) => fraction * RACE_LENGTH_M;
    expect(Math.abs(CHUTE_END_M - metres(ends.chuteEnd))).toBeLessThan(0.2);
    expect(Math.abs(FIRST_STRAIGHT_END_M - metres(ends.corner12Entry))).toBeLessThan(0.2);
    expect(Math.abs(CORNER12_END_M - metres(ends.corner12Exit))).toBeLessThan(0.2);
    expect(Math.abs(BACK_STRAIGHT_END_M - metres(ends.backEnd))).toBeLessThan(0.2);
    expect(Math.abs(CORNER34_END_M - metres(ends.corner34Exit))).toBeLessThan(0.2);
  });
});

describe("lateral speed per zone (SPEC §8-2)", () => {
  const outward = new Map<LaneZone, number>();
  const inward = new Map<LaneZone, number>();
  for (const race of races) {
    for (const horse of race.horses) {
      for (let index = 1; index < horse.lanes.length; index += 1) {
        if (horse.samples[index - 1] >= 1) break;
        const zone = zoneAt(horse.samples[index - 1] * RACE_LENGTH_M);
        const rate = (horse.lanes[index] - horse.lanes[index - 1]) / SAMPLE_STEP;
        outward.set(zone, Math.max(outward.get(zone) ?? 0, rate));
        inward.set(zone, Math.max(inward.get(zone) ?? 0, -rate));
      }
    }
  }
  const max = (rates: Map<LaneZone, number>, zones: LaneZone[]) => Math.max(...zones.map((zone) => rates.get(zone) ?? 0));

  test("never faster than 0.6 lanes/s, and horses really do change lanes", () => {
    const all: LaneZone[] = ["chute", "firstStraight", "corner12", "backStraight", "corner34", "home"];
    expect(max(outward, all)).toBeLessThanOrEqual(0.6 + EPS);
    expect(max(inward, all)).toBeLessThanOrEqual(0.6 + EPS);
    expect(max(inward, ["chute"])).toBeGreaterThan(0.55);
    expect(max(outward, ["firstStraight", "backStraight", "home"])).toBeGreaterThan(0.55);
  });

  test("chute dives in and never fans out", () => {
    expect(max(outward, ["chute"])).toBeLessThanOrEqual(EPS);
  });

  test("corners move out at most 0.3 lanes/s", () => {
    expect(max(outward, ["corner12", "corner34"])).toBeLessThanOrEqual(0.3 + EPS);
    expect(max(outward, ["corner12", "corner34"])).toBeGreaterThan(0.2);
  });

  test("rail pull is half on straights and corners, zero in the home straight", () => {
    expect(max(inward, ["firstStraight", "corner12", "backStraight", "corner34"])).toBeLessThanOrEqual(0.3 + EPS);
    expect(max(inward, ["home"])).toBeLessThanOrEqual(EPS);
  });
});

describe("blocking (SPEC §8-2)", () => {
  test("a faster horse boxed in on the rail stays in its lane and matches the horse ahead", () => {
    const front = runner(100, 1, 6);
    const boxed = runner(100 - HORSE_LENGTH_M * 1.2, 1, 7);
    const outside = runner(100 - HORSE_LENGTH_M * 1.2, 2, 6);
    run([front, boxed, outside], 3);
    expect(boxed.lane).toBe(1);
    expect(boxed.speed).toBeCloseTo(front.speed, 9);
    expect(boxed.meters).toBeLessThan(front.meters - HORSE_LENGTH_M);
  });

  test("with the outside clear on a straight, the same horse moves out and goes past", () => {
    const front = runner(100, 1, 6);
    const boxed = runner(100 - HORSE_LENGTH_M * 1.2, 1, 7);
    run([front, boxed], 1);
    expect(boxed.lane).toBeGreaterThan(1.1);
    const [, widest] = run([front, boxed], 6);
    expect(widest).toBeGreaterThanOrEqual(2 - EPS);
    expect(boxed.meters).toBeGreaterThan(front.meters);
  });
});

describe("spacing", () => {
  test("horses alongside each other stay at least 0.8 lanes apart", () => {
    let pairs = 0;
    let closest = Number.POSITIVE_INFINITY;
    for (const race of races) {
      const horses = race.horses;
      for (let index = 0; index < horses[0].samples.length; index += 1) {
        for (const a of horses) {
          for (const b of horses) {
            if (a.number >= b.number || a.samples[index] >= 1 || b.samples[index] >= 1) continue;
            if (Math.abs(a.samples[index] - b.samples[index]) * RACE_LENGTH_M >= HORSE_LENGTH_M - EPS) continue;
            pairs += 1;
            closest = Math.min(closest, Math.abs(a.lanes[index] - b.lanes[index]));
          }
        }
      }
    }
    expect(pairs).toBeGreaterThan(1000);
    expect(closest).toBeGreaterThanOrEqual(MIN_LATERAL_GAP);
  });

  test("before the start every horse sits in its own gate lane", () => {
    for (const horse of races[0].horses) expect(laneAt(horse.lanes, 0)).toBe(horse.number);
  });
});
