import { describe, expect, it } from "vitest";
import { SAMPLE_STEP } from "@/lib/race";
import { HORSE_LENGTH_M } from "@/lib/lanes";
import {
  FINISH_START,
  FINISH_TIMELINE,
  advanceFinish,
  boardDue,
  cameraAtFor,
  captionCue,
  captionText,
  contestGroups,
  clearOfLineCamera,
  finishCamera,
  finishHorseScreenBox,
  runOutScreen,
  finishCourseFrom,
  finishPlanFrom,
  gallopOut,
  josa,
  revealedRows,
  showsOuterRail,
  showsPhotoFinish,
  slowSpans,
  timeScale,
  toGoAt,
  type BoardHorse,
  type FinishPlan,
  type FinishState,
} from "./finishSequence";
import { nearRailRadius } from "./artScale";
import { REFERENCE } from "./stage";
import { ENGINE_PX_PER_M, finishGoalX, finishPostLogical, presentationLogical, projectWithCamera, referenceDistance, segmentEnds, type Camera } from "./track";

const DT = 1 / 240;
const COURSE_M = referenceDistance() / ENGINE_PX_PER_M;
const SPEED = 6.7;
const EXIT_M = segmentEnds().corner34Exit * COURSE_M;

function horse(id: string, rank: number, finishTime: number, name = id): BoardHorse {
  return { id, name, number: rank, rank, finishTime };
}

function planOf(times: readonly number[], cameraAt = 0): FinishPlan {
  return finishPlanFrom(
    times.map((finishTime, index) => horse(String.fromCharCode(97 + index), index + 1, finishTime, `말${index + 1}`)),
    cameraAt,
  );
}

type Step = { wall: number; state: FinishState };

function run(plan: FinishPlan, seconds: number, start: FinishState = FINISH_START): Step[] {
  const steps: Step[] = [];
  let state = start;
  for (let wall = 0; wall <= seconds; wall += DT) {
    steps.push({ wall, state });
    state = advanceFinish(state, DT, plan);
  }
  return steps;
}

function approaching(plan: FinishPlan, before = 0.4): FinishState {
  const raceTime = Math.max(0, plan.winnerAt - before);
  const onCamera = raceTime >= plan.cameraAt;
  return {
    ...FINISH_START,
    raceTime,
    phase: onCamera ? { kind: "line" } : { kind: "before" },
    cameraAge: onCamera ? FINISH_TIMELINE.cameraBlendSec : -1,
  };
}

function burstLengths(steps: Step[]) {
  const lengths: number[] = [];
  let start = -1;
  let prev = "";
  for (const step of steps) {
    const kind = step.state.phase.kind;
    const bursting = kind === "easeIn" || kind === "slow" || kind === "easeOut";
    if (prev === "easeOut" && kind === "easeIn" && start >= 0) {
      lengths.push(step.wall - start);
      start = step.wall;
    } else if (bursting && start < 0) start = step.wall;
    else if (!bursting && start >= 0) {
      lengths.push(step.wall - start);
      start = -1;
    }
    prev = kind;
  }
  return lengths;
}

const enteredFrom: Camera = {
  groundX: 0,
  groundY: 400,
  height: 500,
  pitch: 0.2,
  yaw: 0.4,
  focalLength: 800,
};

describe("contest groups", () => {
  it("builds no group when every gap is past 0.15s", () => {
    expect(contestGroups([horse("a", 1, 10), horse("b", 2, 10.16), horse("c", 3, 10.32)])).toEqual([]);
  });

  it("groups a single pair at the 0.15s boundary and drops the horse after it", () => {
    const groups = contestGroups([horse("a", 1, 10), horse("b", 2, 10.15), horse("c", 3, 11)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.horses.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(groups[0]?.photoPairs).toEqual([]);
    expect(groups[0]?.slowStart).toBeCloseTo(9.6, 6);
    expect(groups[0]?.slowEnd).toBeCloseTo(10.35, 6);
  });

  it("leaves a 0.151s gap ungrouped", () => {
    expect(contestGroups([horse("a", 1, 10), horse("b", 2, 10.151)])).toEqual([]);
  });

  it("marks a 0.03s pair as a photo finish and not a 0.031s pair", () => {
    const photo = contestGroups([horse("a", 1, 10), horse("b", 2, 10.03)]);
    expect(photo[0]?.photoPairs).toEqual([{ from: 10, to: 10.03 }]);
    const plain = contestGroups([horse("a", 1, 10), horse("b", 2, 10.031)]);
    expect(plain).toHaveLength(1);
    expect(plain[0]?.photoPairs).toEqual([]);
  });

  it("groups horses that are not contesting the win", () => {
    const groups = contestGroups([
      horse("a", 1, 10),
      horse("b", 2, 11),
      horse("c", 3, 20),
      horse("d", 4, 20.1),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.horses.map((entry) => entry.rank)).toEqual([3, 4]);
  });

  it("keeps playing one slow across groups whose windows sit within 0.5s", () => {
    const plan = planOf([10, 10.1, 10.9, 11], 8);
    expect(plan.spans).toHaveLength(1);
    const span = plan.spans[0];
    const steps = run(plan, 12, approaching(plan, 1));
    const inside = steps.filter(
      (step) => step.state.raceTime > (span?.start ?? 0) + 0.05 && step.state.raceTime < (span?.end ?? 0) - 0.05,
    );
    expect(inside.length).toBeGreaterThan(0);
    for (const step of inside) expect(["easeIn", "slow", "easeOut"]).toContain(step.state.phase.kind);
  });

  it("keeps one slow span when the next window starts within 0.5s, including the boundary", () => {
    const close = contestGroups([
      horse("a", 1, 10),
      horse("b", 2, 10.1),
      horse("c", 3, 10.9),
      horse("d", 4, 11),
    ]);
    const merged = slowSpans(close);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.merged).toBe(true);
    expect(merged[0]?.start).toBeCloseTo(9.6, 6);
    expect(merged[0]?.end).toBeCloseTo(11.2, 6);

    const edge = slowSpans(
      contestGroups([
        horse("a", 1, 10),
        horse("b", 2, 10.1),
        horse("c", 3, 11.2),
        horse("d", 4, 11.3),
      ]),
    );
    expect(edge).toHaveLength(1);

    const split = slowSpans(
      contestGroups([
        horse("a", 1, 10),
        horse("b", 2, 10.1),
        horse("c", 3, 11.21),
        horse("d", 4, 11.31),
      ]),
    );
    expect(split).toHaveLength(2);
    expect(split[1]!.start - split[0]!.end).toBeGreaterThan(0.5);
  });
});

describe("time scale", () => {
  const spread = planOf([10, 12, 14], 8);

  it("eases between full speed and 0.3x over 0.2s and holds 0.3x", () => {
    const state = (kind: FinishState["phase"]["kind"], age: number, raceTime: number): FinishState => ({
      ...FINISH_START,
      raceTime,
      phase:
        kind === "easeIn" || kind === "slow"
          ? { kind, age, span: 0 }
          : kind === "easeOut"
            ? { kind, age, span: 0, reason: "end" }
            : { kind: "line" },
    });
    expect(timeScale(state("line", 0, 10), spread)).toBe(1);
    expect(timeScale(state("easeIn", 0, 10), spread)).toBeCloseTo(1, 6);
    expect(timeScale(state("easeIn", 0.1, 10), spread)).toBeCloseTo(0.65, 6);
    expect(timeScale(state("easeIn", 0.2, 10), spread)).toBeCloseTo(0.3, 6);
    expect(timeScale(state("slow", 0.4, 10), spread)).toBe(0.3);
    expect(timeScale(state("easeOut", 0, 10), spread)).toBeCloseTo(0.3, 6);
    expect(timeScale(state("easeOut", 0.2, 10), spread)).toBeCloseTo(1, 6);
  });

  it("plays a contest at 0.3x, eases for 0.2s, and caps one burst at 1.5s", () => {
    const plan = planOf([10, 10.15], 8);
    const steps = run(plan, 8, approaching(plan, 1));
    const slow = steps.find((step) => step.state.phase.kind === "slow");
    expect(slow).toBeTruthy();
    expect(timeScale(slow?.state ?? FINISH_START, plan)).toBe(0.3);

    const firstIn = steps.find((step) => step.state.phase.kind === "easeIn");
    const firstSlow = steps.find((step) => step.wall >= (firstIn?.wall ?? 0) && step.state.phase.kind === "slow");
    expect((firstSlow?.wall ?? 0) - (firstIn?.wall ?? 0)).toBeCloseTo(FINISH_TIMELINE.easeSec, 2);

    const firstOut = steps.find((step) => step.state.phase.kind === "easeOut");
    const afterOut = steps.find(
      (step) =>
        step.wall > (firstOut?.wall ?? 0) &&
        (step.state.phase.kind === "line" || step.state.phase.kind === "easeIn"),
    );
    expect((afterOut?.wall ?? 0) - (firstOut?.wall ?? 0)).toBeCloseTo(FINISH_TIMELINE.easeSec, 2);

    const bursts = burstLengths(steps);
    expect(bursts.length).toBeGreaterThan(1);
    for (const length of bursts) expect(length).toBeLessThanOrEqual(FINISH_TIMELINE.slowMaxSec + DT);
  });

  it("runs at 2x after 3 sim seconds past the winner when nobody is contesting", () => {
    const plan = planOf([20, 30, 40], 18);
    const steps = run(plan, 12, approaching(plan, 1));
    const ratio = (from: number, until: number) => {
      const start = steps.find((step) => step.state.raceTime >= from && step.state.phase.kind === "line");
      const end = steps.find((step) => step.wall >= (start?.wall ?? 0) + 0.4 && step.state.raceTime < until);
      const wall = (end?.wall ?? 0) - (start?.wall ?? 0);
      return ((end?.state.raceTime ?? 0) - (start?.state.raceTime ?? 0)) / wall;
    };
    expect(ratio(20.2, 23)).toBeCloseTo(1, 1);
    expect(ratio(23.2, 29)).toBeCloseTo(2, 1);
  });

  it("confirms horses still out after 8 wall seconds at their simulated rank", () => {
    const plan = planOf([30, 50, 70], 28);
    const steps = run(plan, 12, approaching(plan, 0.5));
    const won = steps.find((step) => step.state.sinceWinner >= 0);
    const timed = steps.find((step) => step.state.timedOut);
    const due = steps.find((step) => boardDue(step.state, plan));
    expect(timed?.state.raceTime ?? 0).toBeLessThan(50);
    expect(revealedRows(timed?.state ?? FINISH_START, plan).map((row) => row.rank)).toEqual([1, 2, 3]);
    expect((due?.wall ?? 0) - (won?.wall ?? 0)).toBeCloseTo(8.5, 1);
    expect((due?.wall ?? 0) - (won?.wall ?? 0)).toBeLessThanOrEqual(8.5 + DT);
  });

  it("reaches the full board within 8.5 wall seconds of the winner", () => {
    const plans = [
      planOf([10, 12, 14, 16], 8),
      planOf([10, 10.05, 10.1, 10.2], 8),
      planOf([10, 10.2, 10.7, 10.9, 14], 8),
      planOf([30, 50, 70], 28),
    ];
    for (const plan of plans) {
      const steps = run(plan, 20, approaching(plan, 0.5));
      const won = steps.find((step) => step.state.sinceWinner >= 0);
      const due = steps.find((step) => boardDue(step.state, plan));
      expect(due).toBeTruthy();
      expect((due?.wall ?? 99) - (won?.wall ?? 0)).toBeLessThanOrEqual(8.5 + DT);
      for (const step of steps) expect(timeScale(step.state, plan)).toBeGreaterThan(0);
    }
  });
});

describe("finish camera", () => {
  const course = finishCourseFrom((t) => (EXIT_M + SPEED * Math.max(0, t)) / COURSE_M);
  const cameraAt = cameraAtFor(course, 30);
  const winnerAt = cameraAt + FINISH_TIMELINE.closeM / SPEED;
  const plan = finishPlanFrom(
    [horse("a", 1, winnerAt, "금빛별"), horse("b", 2, winnerAt + 1.5, "붉은해")],
    cameraAt,
  );

  it("fixes the side camera when the leader's nose is 3 lengths out and then stays on the line", () => {
    expect(FINISH_TIMELINE.closeM).toBeCloseTo(3 * HORSE_LENGTH_M, 6);
    expect(FINISH_TIMELINE.closeM).toBeCloseTo(7.2, 6);
    const steps = run(plan, 6, { ...FINISH_START, raceTime: cameraAt - 0.3 });
    const switched = steps.find((step) => step.state.cameraAge >= 0);
    expect(toGoAt(course, switched?.state.raceTime ?? 0)).toBeCloseTo(7.2, 1);
    const locked = steps.filter((step) => step.state.cameraAge >= FINISH_TIMELINE.cameraBlendSec);
    expect(locked.length).toBeGreaterThan(10);
    const ground = locked.map((step) => finishCamera(step.state, { enteredFrom })?.groundX ?? NaN);
    for (const x of ground) expect(x).toBeCloseTo(finishGoalX(), 4);
    expect(Math.max(...ground) - Math.min(...ground)).toBeLessThan(1e-6);
    const last = locked.filter((step) => step.state.raceTime <= plan.lastAt);
    expect(last.at(-1)?.state.raceTime ?? 0).toBeGreaterThan(winnerAt);
    expect(showsOuterRail(FINISH_START)).toBe(true);
    expect(showsOuterRail(switched?.state ?? FINISH_START)).toBe(false);
  });

  it("keeps the finish-line camera after the result board is due", () => {
    const steps = run(plan, 8, { ...FINISH_START, raceTime: cameraAt - 0.3 });
    const due = steps.find((step) => boardDue(step.state, plan));
    expect(due).toBeTruthy();
    const after = steps.filter((step) => step.wall >= (due?.wall ?? 0) && step.wall <= (due?.wall ?? 0) + 2);
    expect(after.length).toBeGreaterThan(10);
    const shots = after.map((step) => finishCamera(step.state, { enteredFrom }));
    for (const shot of shots) {
      expect(shot?.groundX).toBeCloseTo(finishGoalX(), 4);
      expect(shot?.groundY).toBeCloseTo(shots[0]?.groundY ?? NaN, 4);
      expect(shot?.height).toBeCloseTo(shots[0]?.height ?? NaN, 4);
      expect(shot?.pitch).toBeCloseTo(shots[0]?.pitch ?? NaN, 6);
      expect(shot?.yaw).toBeCloseTo(shots[0]?.yaw ?? NaN, 6);
    }
  });

  it("stands just outside the outer rail and drops the straight's zoom", () => {
    const zoomed: Camera = { ...enteredFrom, focalLength: 4200, groundY: nearRailRadius() * 0.4 };
    const shot = finishCamera({ ...FINISH_START, cameraAge: FINISH_TIMELINE.cameraBlendSec }, { enteredFrom: zoomed });
    expect(shot).toBeTruthy();
    const rail = nearRailRadius();
    expect(shot!.groundY).toBeGreaterThan(rail);
    expect(shot!.groundY).not.toBeCloseTo(zoomed.groundY, 0);
    expect((shot!.groundY - rail) / ENGINE_PX_PER_M).toBeCloseTo(0.8, 2);
    expect(shot!.focalLength).toBeCloseTo((45 / 36) * REFERENCE.width, 4);
    expect(shot!.focalLength).toBeLessThan(zoomed.focalLength);
    for (const lane of [1, 6]) {
      const pose = projectWithCamera(presentationLogical(1, lane), shot!);
      expect(pose.visible, `lane ${lane}`).toBe(true);
      expect(pose.x).toBeGreaterThan(REFERENCE.width * 0.2);
      expect(pose.x).toBeLessThan(REFERENCE.width * 0.8);
      expect(pose.y).toBeGreaterThan(REFERENCE.height * 0.3);
      expect(pose.y).toBeLessThan(REFERENCE.height * 0.9);
    }
    const post = projectWithCamera({ ...finishPostLogical(), tx: 0, ty: 0 }, shot!);
    expect(post.visible).toBe(true);
    expect(post.x).toBeGreaterThan(REFERENCE.width * 0.3);
    expect(post.x).toBeLessThan(REFERENCE.width * 0.7);
    expect(post.y).toBeGreaterThan(REFERENCE.height * 0.4);
    expect(post.y).toBeLessThan(REFERENCE.height * 0.85);
  });
});

describe("result board", () => {
  it("adds a row per finisher and opens the full board 0.5s after the last", () => {
    const plan = planOf([10, 12, 14], 8);
    const steps = run(plan, 8, approaching(plan, 1));
    const counts: number[] = [];
    for (const step of steps) {
      const count = revealedRows(step.state, plan).length;
      if (count !== counts[counts.length - 1]) counts.push(count);
    }
    expect(counts).toEqual([0, 1, 2, 3]);
    const marked = steps.find((step) => step.state.sinceMark >= 0);
    const due = steps.find((step) => boardDue(step.state, plan));
    expect((due?.wall ?? 0) - (marked?.wall ?? 0)).toBeCloseTo(0.5, 2);
    expect(revealedRows(due?.state ?? FINISH_START, plan).map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it("holds a slow group until that slow has eased out", () => {
    const plan = planOf([10, 10.1, 14], 8);
    const steps = run(plan, 10, approaching(plan, 1));
    const during = steps.filter(
      (step) => step.state.spanIndex === 0 && step.state.raceTime > 10.12 && step.state.raceTime < 10.28,
    );
    expect(during.length).toBeGreaterThan(0);
    for (const step of during) expect(revealedRows(step.state, plan)).toEqual([]);
    const released = steps.find((step) => step.state.spanIndex > 0 && step.state.raceTime < 14);
    expect(revealedRows(released?.state ?? FINISH_START, plan).map((row) => row.id)).toEqual(["a", "b"]);
    const due = steps.find((step) => boardDue(step.state, plan));
    expect(due?.state.raceTime ?? 0).toBeGreaterThanOrEqual(14);
    expect(revealedRows(due?.state ?? FINISH_START, plan)).toHaveLength(3);
  });

  it("shows the photo line only while a 0.03s pair is crossing", () => {
    const photo = planOf([10, 10.03, 12], 8);
    const inside: FinishState = { ...FINISH_START, raceTime: 10.03, phase: { kind: "slow", age: 0, span: 0 } };
    const outside: FinishState = { ...inside, raceTime: 10.04 };
    expect(showsPhotoFinish(inside, photo)).toBe(true);
    expect(showsPhotoFinish({ ...inside, raceTime: 10 }, photo)).toBe(true);
    expect(showsPhotoFinish(outside, photo)).toBe(false);
    expect(captionCue(inside, photo)).toBe("photo");
    const plain = planOf([10, 10.1], 8);
    const slow: FinishState = { ...FINISH_START, raceTime: 10.05, phase: { kind: "slow", age: 0, span: 0 } };
    expect(showsPhotoFinish(slow, plain)).toBe(false);
    expect(captionCue(slow, plain)).toBe("contest");
  });
});

describe("captions", () => {
  it("picks josa by the final consonant", () => {
    expect(josa("금빛별", "이/가")).toBe("금빛별이");
    expect(josa("번개", "이/가")).toBe("번개가");
    expect(josa("금빛별", "과/와")).toBe("금빛별과");
    expect(josa("붉은해", "과/와")).toBe("붉은해와");
  });

  it("uses the photo line only for that cue", () => {
    const live = ["금빛별", "붉은해", "번개"];
    expect(captionText("photo", live, live)).toBe("사진 판정할 것 같습니다!");
    expect(captionText("contest", live, live)).toBe("금빛별과 붉은해, 번개까지 접전입니다!");
    expect(captionText("result", live, live)).toBe("금빛별 1착! 붉은해 2착, 번개 3착!");
    expect(captionText("winner", live, live)).toBe("금빛별! 금빛별이 해냈습니다!");
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

  it("keeps x increasing after the line until the horse is off the side camera", () => {
    const shown = gallopOut([
      { samples: samplesFor(10, 7.8), finishTime: 10 },
      { samples: samplesFor(12, 7), finishTime: 12 },
      { samples: samplesFor(14, 6.5), finishTime: 14 },
    ]);
    const xOf = (index: number, t: number) => presentationLogical(shown(index, t), 1).x;
    for (const index of [0, 1, 2]) {
      const finish = [10, 12, 14][index] ?? 10;
      const xs = [0.2, 1, 2, 4].map((age) => xOf(index, finish + age));
      for (let step = 1; step < xs.length; step += 1) expect(xs[step] ?? 0).toBeGreaterThan((xs[step - 1] ?? 0) + ENGINE_PX_PER_M);
    }
    expect(clearOfLineCamera(shown(0, 10), 1)).toBe(false);
    expect(clearOfLineCamera(shown(0, 12), 1)).toBe(true);
    expect(pastLineM(shown, 0, 14)).toBeGreaterThan(pastLineM(shown, 2, 14));
  });

  it("holds a fixed finish view only after the sprite box has left the wide screen", () => {
    const shown = gallopOut([
      { samples: samplesFor(10, 7.8), finishTime: 10 },
      { samples: samplesFor(12, 7), finishTime: 12 },
      { samples: samplesFor(14, 6.5), finishTime: 14 },
    ]);
    const screen = runOutScreen();
    const misses = (box: { minX: number; maxX: number; minY: number; maxY: number }) =>
      box.maxX < screen.minX || box.minX > screen.maxX || box.maxY < screen.minY || box.minY > screen.maxY;

    for (const lane of [1, 12]) {
      const crossing = finishHorseScreenBox(shown(0, 10), lane);
      expect(crossing, `lane ${lane} at the line`).not.toBeNull();
      expect(misses(crossing!), `lane ${lane} at the line`).toBe(false);
      expect(clearOfLineCamera(shown(0, 10), lane)).toBe(false);

      const held = shown(0, 14);
      const box = finishHorseScreenBox(held, lane);
      expect(box, `lane ${lane} run-out`).not.toBeNull();
      expect(misses(box!), `lane ${lane} run-out`).toBe(true);
      expect(clearOfLineCamera(held, lane)).toBe(true);
    }
  });
});
