import { describe, expect, it } from "vitest";
import { SAMPLE_STEP } from "@/lib/race";
import {
  FINISH_START,
  FINISH_TIMELINE,
  advanceFinish,
  boardDue,
  captionCue,
  captionText,
  finishCamera,
  finishCourseFrom,
  gallopOut,
  josa,
  timeScale,
  toGoAt,
  type FinishFrame,
  type FinishPhase,
  type FinishState,
} from "./finishSequence";
import { ENGINE_PX_PER_M, finishGoalX, referenceDistance, segmentEnds, type Camera } from "./track";

const COURSE_M = referenceDistance() / ENGINE_PX_PER_M;
const SPEED = 6.7;
const EXIT_M = segmentEnds().corner34Exit * COURSE_M;
const course = finishCourseFrom((t) => (EXIT_M + SPEED * Math.max(0, t)) / COURSE_M, 20);
const DT = 1 / 240;

type Step = { wall: number; state: FinishState };

function run(seconds: number): Step[] {
  const steps: Step[] = [];
  let state = FINISH_START;
  for (let wall = 0; wall <= seconds; wall += DT) {
    steps.push({ wall, state });
    state = advanceFinish(state, DT, course);
  }
  return steps;
}

const steps = run(16);
const wallAt = (test: (state: FinishState) => boolean) => steps.find((step) => test(step.state))?.wall ?? NaN;
const enters = (kind: FinishPhase["kind"]) => wallAt((state) => state.phase.kind === kind);
const atToGo = (toGo: number): FinishState => ({
  phase: { kind: "track" },
  raceTime: (toGoAt(course, 0) - toGo) / SPEED,
});

function frameAt(state: FinishState, winnerY = 8.6): FinishFrame {
  const winnerX = finishGoalX() + (COURSE_M * (course.leadProgressAt(state.raceTime) - 1)) * ENGINE_PX_PER_M;
  const enteredFrom: Camera = { groundX: 0, groundY: 0, height: 500, pitch: 0.2, yaw: 0, focalLength: 1500 };
  return { course, winner: { x: winnerX, y: winnerY * ENGINE_PX_PER_M }, enteredFrom };
}

describe("finish course marks", () => {
  it("cuts 30 m out and freezes with the leader's nose on the line", () => {
    expect(course.exitAt).toBeCloseTo(0, 6);
    expect(toGoAt(course, course.cutAt)).toBeCloseTo(30, 6);
    expect(toGoAt(course, course.freezeAt)).toBeCloseTo(0, 6);
  });
});

describe("finish phases", () => {
  it("holds the f01 stretch until 30 m out, then cuts to tracking", () => {
    const lastStretch = steps.filter((step) => step.state.phase.kind === "stretch").at(-1);
    const firstTrack = steps.find((step) => step.state.phase.kind === "track");
    expect(toGoAt(course, lastStretch?.state.raceTime ?? 0)).toBeGreaterThan(30);
    expect(toGoAt(course, firstTrack?.state.raceTime ?? 0)).toBeLessThanOrEqual(30);
    expect(toGoAt(course, firstTrack?.state.raceTime ?? 0)).toBeGreaterThan(29.9);
  });

  it("starts the slow-mo phase 10 m out", () => {
    const firstSlow = steps.find((step) => step.state.phase.kind === "slow");
    expect(toGoAt(course, firstSlow?.state.raceTime ?? 0)).toBeCloseTo(10, 1);
  });

  it("freezes for 1.0 s of wall time with race time pinned to the nose-on-line moment", () => {
    const frozen = steps.filter((step) => step.state.phase.kind === "freeze");
    for (const step of frozen) expect(step.state.raceTime).toBe(course.freezeAt);
    expect(enters("rise") - enters("freeze")).toBeCloseTo(FINISH_TIMELINE.freezeSec, 2);
  });

  it("rises for 1.8 s and brings the board in 0.4 s before the rise ends", () => {
    expect(enters("result") - enters("rise")).toBeCloseTo(FINISH_TIMELINE.riseSec, 2);
    expect(wallAt(boardDue) - enters("rise")).toBeCloseTo(1.4, 2);
    expect(steps.filter((step) => step.state.phase.kind === "rise").some((step) => step.state.raceTime > course.freezeAt)).toBe(true);
  });

  it("tracks for about 6.7 s from the cut to the end of the freeze", () => {
    expect(enters("rise") - enters("track")).toBeCloseTo(2.99 + 2.72 + 1.0, 1);
  });
});

describe("time scale", () => {
  it("eases from real speed to 0.5x between 10 and 7 m out", () => {
    expect(timeScale(atToGo(12), course)).toBe(1);
    expect(timeScale(atToGo(10), course)).toBeCloseTo(1, 6);
    expect(timeScale(atToGo(8.5), course)).toBeCloseTo(0.75, 6);
    expect(timeScale(atToGo(7), course)).toBeCloseTo(0.5, 6);
    expect(timeScale(atToGo(2), course)).toBeCloseTo(0.5, 6);
  });

  it("stops in the freeze and ramps 0.5x back to 1.0x over 0.6 s", () => {
    const at = (phase: FinishPhase) => timeScale({ phase, raceTime: course.freezeAt }, course);
    expect(at({ kind: "freeze", age: 0.5 })).toBe(0);
    expect(at({ kind: "rise", age: 0 })).toBeCloseTo(0.5, 6);
    expect(at({ kind: "rise", age: 0.3 })).toBeCloseTo(0.75, 6);
    expect(at({ kind: "rise", age: 0.6 })).toBeCloseTo(1, 6);
    expect(at({ kind: "result", age: 0 })).toBe(1);
  });
});

describe("finish camera", () => {
  it("starts the rise exactly where the frozen rig camera stands", () => {
    const frozen: FinishState = { phase: { kind: "freeze", age: 0.99 }, raceTime: course.freezeAt };
    const rising: FinishState = { phase: { kind: "rise", age: 0 }, raceTime: course.freezeAt };
    const a = finishCamera(frozen, frameAt(frozen));
    const b = finishCamera(rising, frameAt(rising));
    for (const key of ["groundX", "groundY", "height", "pitch", "yaw", "focalLength"] as const) {
      expect(b?.[key]).toBeCloseTo(a?.[key] ?? NaN, 6);
    }
  });

  it("puts the frozen camera on the finish line", () => {
    const frozen: FinishState = { phase: { kind: "freeze", age: 0 }, raceTime: course.freezeAt };
    expect(finishCamera(frozen, frameAt(frozen))?.groundX).toBeCloseTo(finishGoalX(), 6);
  });

  it("stays outside the winner through the rise, so it never crosses the 180° line", () => {
    for (const lane of [8.6, 14.6, 20.6]) {
      for (let age = 0; age <= FINISH_TIMELINE.riseSec; age += 0.05) {
        const state: FinishState = { phase: { kind: "rise", age }, raceTime: course.freezeAt + age };
        const frame = frameAt(state, lane);
        expect(finishCamera(state, frame)?.groundY).toBeGreaterThan(frame.winner.y);
      }
    }
  });

  it("leaves the race camera alone before the corner exit", () => {
    expect(finishCamera(FINISH_START, frameAt(FINISH_START))).toBeNull();
  });
});

describe("captions", () => {
  it("picks josa by the final consonant", () => {
    expect(josa("금빛별", "이/가")).toBe("금빛별이");
    expect(josa("번개", "이/가")).toBe("번개가");
    expect(josa("금빛별", "과/와")).toBe("금빛별과");
    expect(josa("붉은해", "과/와")).toBe("붉은해와");
  });

  it("speaks each phase once, with the result line when the board starts", () => {
    const cues = steps.map((step) => captionCue(step.state)).filter((cue, index, all) => cue !== all[index - 1]);
    expect(cues).toEqual([null, "stretch", "track", "slow", "freeze", "rise", "result"]);
    const live = ["금빛별", "붉은해", "번개"];
    expect(captionText("track", live, live)).toBe("금빛별과 붉은해, 번개까지 세 마리의 접전!");
    expect(captionText("result", live, live)).toBe("금빛별 1착! 붉은해 2착, 번개 3착!");
  });
});

describe("gallop-out past the line", () => {
  const samplesFor = (finishTime: number, speed: number) =>
    Array.from({ length: 200 }, (_, index) => Math.min(1.02, 1 + (speed * (index * SAMPLE_STEP - finishTime)) / COURSE_M));

  const pastLineM = (shown: ReturnType<typeof gallopOut>, index: number, t: number) => (shown(index, t) - 1) * COURSE_M;

  it("keeps the sim up to the line and the gap after it", () => {
    const shown = gallopOut([
      { samples: samplesFor(10, 6), finishTime: 10 },
      { samples: samplesFor(10.2, 6), finishTime: 10.2 },
    ]);
    expect(shown(0, 9.5)).toBeCloseTo(1 - 3 / COURSE_M, 6);
    expect(pastLineM(shown, 0, 10.2) - pastLineM(shown, 1, 10.2)).toBeCloseTo(1.2, 1);
    expect(pastLineM(shown, 0, 11.5) - pastLineM(shown, 1, 11.5)).toBeGreaterThan(0.8);
    expect(pastLineM(shown, 0, 30) - pastLineM(shown, 1, 30)).toBeGreaterThan(0.8);
  });

  it("never lets a faster closer catch the winner after the line", () => {
    const shown = gallopOut([
      { samples: samplesFor(10, 6.4), finishTime: 10 },
      { samples: samplesFor(10.18, 7.3), finishTime: 10.18 },
    ]);
    const lineGap = pastLineM(shown, 0, 10.18);
    for (let t = 10.2; t < 30; t += 0.1) {
      expect(pastLineM(shown, 0, t) - pastLineM(shown, 1, t)).toBeGreaterThanOrEqual(lineGap - 1e-9);
    }
  });

  it("pulls up on the home straight", () => {
    const shown = gallopOut([{ samples: samplesFor(10, 7.8), finishTime: 10 }]);
    const stopM = pastLineM(shown, 0, 30);
    expect(stopM).toBeGreaterThan(18);
    expect(finishGoalX() / ENGINE_PX_PER_M + stopM).toBeLessThan(40.15);
  });
});
