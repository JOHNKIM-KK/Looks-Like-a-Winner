import { describe, expect, test } from "vitest";
import { cameraConfig } from "./cameraConfig";
import { simulateRace, progressAt } from "../lib/race";
import { mockHorses } from "../lib/mockHorses";
import { orderByPresentation } from "./rankOrder";
import { LANE_COLORS } from "./laneColors";
import {
  advanceCameraPresentation,
  createCameraPresentation,
} from "./cameraBlend";
import {
  CORNER_IN_AZIMUTH,
  CORNER_IN_ELEVATION,
  CORNER_OUT_AZIMUTH,
  CORNER_OUT_ELEVATION,
  STRAIGHT_EARLY_ELEVATION,
  STRAIGHT_HOME_ELEVATION,
  cameraFromLook,
  createInitialState,
  getCameraLookForState,
  nextCameraState,
  shouldShowFinishMark,
  type CameraState,
  type RaceSnapshot,
} from "./cameraState";
import {
  FRAME_BOTTOM,
  FRAME_LEFT,
  FRAME_RIGHT,
  FRAME_TOP,
  anchorVisible,
  cornerLowerThanStraights,
  cornerRailSagitta,
  activeFrameIncludes,
  createFrameMemory,
  frameHorseLook,
  framingRuleFor,
  grassBelowRailFraction,
  horseFit,
  requestFrameInclude,
  requiredFrameSubjects,
  resetFrameIncludes,
  spriteRect,
  subjectsForFrameRule,
  type FrameMemory,
  type FrameSubject,
} from "./cameraFrame";
import {
  STRAIGHT,
  finishPostLogical,
  innerRailRadius,
  outerRailRadius,
  presentationLogical,
  projectWithCamera,
  renderLane,
  segmentEnds,
} from "./track";

const SEEDS = [1, 7, 42, 99, 256, 512, 777, 2024];
const HALF = STRAIGHT / 2;

function stateLabel(state: CameraState, lead: number) {
  if (state.name === "STRAIGHT") return lead >= segmentEnds().cornerEnd ? "STRAIGHT-home" : "STRAIGHT-early";
  return state.name;
}

describe("lane colors", () => {
  test("the eight cloth colors stay, and 9–12 are placeholders", () => {
    expect(LANE_COLORS.slice(0, 8)).toEqual([
      "#E5173F",
      "#1F5BFF",
      "#FFD000",
      "#00A86B",
      "#8E3BFF",
      "#FF4FC8",
      "#00C8E0",
      "#14181F",
    ]);
    expect(LANE_COLORS).toHaveLength(12);
    expect(LANE_COLORS[8]).toBe("#F97316");
    expect(LANE_COLORS[11]).toBe("#64748B");
  });
});

describe("presentation path", () => {
  test("back straight, corner, and home straight meet for every lane", () => {
    const ends = segmentEnds();
    for (const lane of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const back = presentationLogical(ends.backStraightEnd - 1e-4, lane);
      const cornerIn = presentationLogical(ends.backStraightEnd, lane);
      const cornerOut = presentationLogical(ends.cornerEnd - 1e-4, lane);
      const home = presentationLogical(ends.cornerEnd, lane);
      expect(Math.hypot(back.x - cornerIn.x, back.y - cornerIn.y)).toBeLessThan(2);
      expect(Math.hypot(cornerOut.x - home.x, cornerOut.y - home.y)).toBeLessThan(2);
      expect(cornerIn.y).toBeLessThan(0);
      expect(home.y).toBeGreaterThan(0);
      expect(presentationLogical((ends.backStraightEnd + ends.cornerEnd) / 2, lane).x).toBeLessThan(-HALF);
    }
  });

  test("the finish post is in the infield, just outside the inner rail", () => {
    const post = finishPostLogical();
    expect(post.y).toBeLessThan(innerRailRadius());
    expect(innerRailRadius() - post.y).toBeLessThan(40);
    expect(post.y).toBeGreaterThan(0);
    expect(post.x).toBeGreaterThan(-STRAIGHT / 2);
    expect(post.x).toBeLessThan(STRAIGHT / 2);
    const ends = segmentEnds();
    expect(shouldShowFinishMark("CORNER_IN", (ends.backStraightEnd + ends.cornerEnd) / 2)).toBe(false);
    expect(shouldShowFinishMark("CORNER_OUT", (ends.backStraightEnd + ends.cornerEnd) / 2)).toBe(false);
    expect(shouldShowFinishMark("STRAIGHT", ends.backStraightEnd)).toBe(false);
    expect(shouldShowFinishMark("STRAIGHT", ends.cornerEnd)).toBe(true);
    expect(shouldShowFinishMark("FINISH", 0.95)).toBe(true);
  });
});

describe("corner viewpoint", () => {
  test("corner elevation is lower than both straights and the camera sits outside the bend", () => {
    expect(cornerLowerThanStraights()).toBe(true);
    expect(CORNER_IN_ELEVATION).toBeLessThan(STRAIGHT_EARLY_ELEVATION);
    expect(CORNER_OUT_ELEVATION).toBeLessThan(STRAIGHT_HOME_ELEVATION);
    const ends = segmentEnds();
    const midIn = ends.backStraightEnd + (ends.cornerEnd - ends.backStraightEnd) * 0.25;
    const midOut = ends.backStraightEnd + (ends.cornerEnd - ends.backStraightEnd) * 0.75;
    for (const [name, progress, azimuth] of [
      ["CORNER_IN", midIn, CORNER_IN_AZIMUTH],
      ["CORNER_OUT", midOut, CORNER_OUT_AZIMUTH],
    ] as const) {
      const horses = [1, 2, 3, 4, 5, 6, 7, 8].map((lane) => presentationLogical(progress, lane));
      const packX = horses.reduce((sum, horse) => sum + horse.x, 0) / horses.length;
      const packY = horses.reduce((sum, horse) => sum + horse.y, 0) / horses.length;
      const look = getCameraLookForState(
        { name },
        { raceTime: 10, started: true, gateOpen: 1, leadProgress: progress, horses: [] },
        packX,
        packY,
      );
      expect(look.azimuth).toBe(azimuth);
      expect(look.elevation).toBeLessThan(STRAIGHT_EARLY_ELEVATION);
      const camera = cameraFromLook(look);
      const packDx = packX + HALF;
      const packDy = packY;
      const camDx = camera.groundX + HALF;
      const camDy = camera.groundY;
      expect(Math.hypot(camDx, camDy)).toBeGreaterThan(outerRailRadius(8));
      expect(packDx * camDx + packDy * camDy).toBeGreaterThan(0);
      console.log(
        `${name} base sagitta=${cornerRailSagitta(camera).toFixed(1)}px grass=${(grassBelowRailFraction(camera) * 100).toFixed(1)}%`,
      );
    }
  });
});

describe("horse framing", () => {
  test("eight seeds keep topN or all horses inside the safe rect", () => {
    resetFrameIncludes();
    expect(cameraConfig.framing.topN).toBe(5);
    type Stat = {
      samples: number;
      worst: number;
      heights: number[];
      leaderHeights: number[];
      span: number[];
      hMargin: number[];
      vMargin: number[];
      grass: number;
      sagitta: number;
      postOut: number;
      postFrames: number;
      outsideFail: number;
      trailerOut: number;
    };
    const byState = new Map<string, Stat>();
    const ensure = (name: string) => {
      let stat = byState.get(name);
      if (!stat) {
        stat = {
          samples: 0,
          worst: Infinity,
          heights: [],
          leaderHeights: [],
          span: [],
          hMargin: [],
          vMargin: [],
          grass: 0,
          sagitta: Infinity,
          postOut: 0,
          postFrames: 0,
          outsideFail: 0,
          trailerOut: 0,
        };
        byState.set(name, stat);
      }
      return stat;
    };

    for (const seed of SEEDS) {
      const race = simulateRace(mockHorses, seed);
      const initialLook = getCameraLookForState(createInitialState(), {
        raceTime: 0,
        started: false,
        gateOpen: 0,
        leadProgress: 0,
        horses: [],
      }, 0, 0);
      let pres = createCameraPresentation(createInitialState(), initialLook);
      let memory: FrameMemory = createFrameMemory(initialLook);
      const post = finishPostLogical();
      for (let raceTime = 0; raceTime <= race.duration + 1e-9; raceTime = Math.round((raceTime + 0.1) * 10) / 10) {
        const started = raceTime > 0;
        const gateOpen = started ? Math.min(1, raceTime / 0.28) : 0;
        const subjects = race.horses.map((horse) => {
          const sample = started ? progressAt(horse.samples, raceTime) : 0;
          const progress = !started ? 0 : gateOpen < 1 ? sample * gateOpen : sample;
          return { horse, progress, logical: presentationLogical(progress, renderLane(horse.number, progress, race.seed)) };
        });
        const leadProgress = started && gateOpen >= 1 ? Math.max(...subjects.map((subject) => subject.progress)) : 0;
        const snapshot: RaceSnapshot = {
          raceTime,
          started,
          gateOpen,
          leadProgress,
          horses: subjects.map((subject, index) => ({ index, progress: subject.progress })),
        };
        const next = nextCameraState(pres.state, snapshot);
        const packX = subjects.reduce((sum, subject) => sum + subject.logical.x, 0) / subjects.length;
        const packY = subjects.reduce((sum, subject) => sum + subject.logical.y, 0) / subjects.length;
        const desired = getCameraLookForState(next, snapshot, packX, packY);
        const presentationTime = 2.4 + raceTime;
        pres = advanceCameraPresentation(pres, next, desired, presentationTime);
        const ranked = orderByPresentation(
          subjects.map((subject) => ({
            id: subject.horse.id,
            number: subject.horse.number,
            shown: subject.progress,
            finishTime: subject.horse.finishTime,
            rank: subject.horse.rank,
          })),
          started ? raceTime : 0,
        );
        const rankById = new Map(ranked.map((horse, index) => [horse.id, index + 1]));
        const framedSubjects: FrameSubject[] = subjects.map((subject) => ({
          ...subject.logical,
          id: subject.horse.id,
          rank: rankById.get(subject.horse.id) ?? subject.horse.number,
        }));
        const anchors = pres.state.name === "FINISH" ? [post, { x: post.x, y: outerRailRadius(8) }] : [];
        const framed = frameHorseLook(
          pres.look,
          framedSubjects,
          pres.state.name,
          anchors,
          memory,
          raceTime === 0 ? 0 : 0.1,
          leadProgress,
        );
        memory = framed.memory;
        const camera = cameraFromLook(framed.look);
        const label = stateLabel(pres.state, leadProgress);
        const rule = framingRuleFor(pres.state.name, leadProgress);
        if (label === "START" || label === "STRAIGHT-early") expect(rule, label).toBe("all");
        if (label === "CORNER_IN" || label === "CORNER_OUT" || label === "STRAIGHT-home" || label === "FINISH") {
          expect(rule, label).toBe("topN");
        }
        const topN = cameraConfig.framing.topN;
        const stat = ensure(label);
        stat.samples += 1;
        const heights: number[] = [];
        const leaderHeights: number[] = [];
        let boxL = Infinity;
        let boxR = -Infinity;
        let hMargin = Infinity;
        let vMargin = Infinity;
        let trailerLeft = false;
        for (const subject of framedSubjects) {
          const pose = projectWithCamera(subject, camera);
          const mustFit = rule === "all" || (subject.rank ?? Number.POSITIVE_INFINITY) <= topN;
          if (pose.visible) {
            heights.push(spriteRect(pose).height);
          }
          if (!mustFit) {
            if (!pose.visible) {
              trailerLeft = true;
              continue;
            }
            const rect = spriteRect(pose);
            const inside =
              rect.minX >= FRAME_LEFT - 0.6 &&
              rect.maxX <= FRAME_RIGHT + 0.6 &&
              rect.minY >= FRAME_TOP - 0.6 &&
              rect.maxY <= FRAME_BOTTOM + 0.6;
            if (!inside) trailerLeft = true;
            continue;
          }
          expect(pose.visible, `${label} seed ${seed} t ${raceTime} rank ${subject.rank}`).toBe(true);
          const rect = spriteRect(pose);
          leaderHeights.push(rect.height);
          boxL = Math.min(boxL, rect.minX);
          boxR = Math.max(boxR, rect.maxX);
          hMargin = Math.min(hMargin, rect.minX - FRAME_LEFT, FRAME_RIGHT - rect.maxX);
          vMargin = Math.min(vMargin, rect.minY - FRAME_TOP, FRAME_BOTTOM - rect.maxY);
          const margin = Math.min(rect.minX - FRAME_LEFT, FRAME_RIGHT - rect.maxX, rect.minY - FRAME_TOP, FRAME_BOTTOM - rect.maxY);
          stat.worst = Math.min(stat.worst, margin);
          expect(rect.minX, `${label} seed ${seed} t ${raceTime.toFixed(1)} rank ${subject.rank} left`).toBeGreaterThanOrEqual(FRAME_LEFT - 0.6);
          expect(rect.maxX, `${label} seed ${seed} t ${raceTime.toFixed(1)} rank ${subject.rank} right`).toBeLessThanOrEqual(FRAME_RIGHT + 0.6);
          expect(rect.minY, `${label} seed ${seed} t ${raceTime.toFixed(1)} rank ${subject.rank} top`).toBeGreaterThanOrEqual(FRAME_TOP - 0.6);
          expect(rect.maxY, `${label} seed ${seed} t ${raceTime.toFixed(1)} rank ${subject.rank} bottom`).toBeLessThanOrEqual(FRAME_BOTTOM + 0.6);
        }
        if (trailerLeft) stat.trailerOut += 1;
        heights.sort((a, b) => a - b);
        leaderHeights.sort((a, b) => a - b);
        stat.heights.push(heights[Math.floor((heights.length - 1) / 2)] ?? 0);
        stat.leaderHeights.push(leaderHeights[Math.floor((leaderHeights.length - 1) / 2)] ?? 0);
        stat.span.push(boxR - boxL);
        stat.hMargin.push(hMargin);
        stat.vMargin.push(vMargin);
        stat.grass = Math.max(stat.grass, grassBelowRailFraction(camera));
        const settled = !pres.blend;
        if (settled && (pres.state.name === "CORNER_IN" || pres.state.name === "CORNER_OUT")) {
          stat.sagitta = Math.min(stat.sagitta, cornerRailSagitta(camera));
          expect(framed.look.elevation).toBeLessThan(STRAIGHT_EARLY_ELEVATION);
          expect(framed.look.elevation).toBeLessThan(STRAIGHT_HOME_ELEVATION);
          const camDx = camera.groundX + HALF;
          const camDy = camera.groundY;
          const packDx = packX + HALF;
          const packDy = packY;
          const outside = Math.hypot(camDx, camDy) > outerRailRadius(8) && packDx * camDx + packDy * camDy > 0;
          if (!outside) stat.outsideFail += 1;
          expect(outside, `${label} t ${raceTime.toFixed(1)}`).toBe(true);
        }
        if (settled && pres.state.name === "FINISH" && leadProgress >= 0.9) {
          stat.postFrames += 1;
          if (!anchorVisible(framed.look, post)) stat.postOut += 1;
        }
      }
    }

    const lines: string[] = [];
    for (const [name, stat] of byState) {
      const heights = [...stat.heights].sort((a, b) => a - b);
      const median = heights[Math.floor((heights.length - 1) / 2)] ?? 0;
      const minMedian = heights[0] ?? 0;
      const leaders = [...stat.leaderHeights].sort((a, b) => a - b);
      const spans = [...stat.span].sort((a, b) => a - b);
      const hMargins = [...stat.hMargin].sort((a, b) => a - b);
      const vMargins = [...stat.vMargin].sort((a, b) => a - b);
      const mid = (values: number[]) => values[Math.floor((values.length - 1) / 2)] ?? 0;
      lines.push(
        [
          name,
          `n=${stat.samples}`,
          `worstMargin=${stat.worst.toFixed(1)}px`,
          `medianHorse=${median.toFixed(1)}px`,
          `leaderMedian=${mid(leaders).toFixed(1)}px`,
          `span=${mid(spans).toFixed(0)}/${(FRAME_RIGHT - FRAME_LEFT).toFixed(0)}`,
          `hMargin=${mid(hMargins).toFixed(1)}`,
          `vMargin=${mid(vMargins).toFixed(1)}`,
          `minFrameMedian=${minMedian.toFixed(1)}px`,
          `worstGrass=${(stat.grass * 100).toFixed(1)}%`,
          stat.sagitta < Infinity ? `minSagitta=${stat.sagitta.toFixed(0)}px` : "sagitta=n/a",
          `postMiss=${stat.postOut}/${stat.postFrames}`,
          `outsideFail=${stat.outsideFail}`,
          `trailerOut=${stat.trailerOut}`,
        ].join(" | "),
      );
    }
    console.log(lines.join("\n"));
    const medianOf = (name: string) => {
      const heights = [...(byState.get(name)?.heights ?? [])].sort((a, b) => a - b);
      return heights[Math.floor((heights.length - 1) / 2)] ?? 0;
    };
    expect(medianOf("START")).toBeCloseTo(125.3, 0);
    expect(medianOf("STRAIGHT-early")).toBeCloseTo(82.5, 0);
    expect(medianOf("CORNER_IN")).toBeGreaterThanOrEqual(95);
    expect(medianOf("CORNER_OUT")).toBeGreaterThanOrEqual(95);
    expect(medianOf("STRAIGHT-home")).toBeGreaterThanOrEqual(100);
    expect(medianOf("FINISH")).toBeGreaterThanOrEqual(95);
    const finish = byState.get("FINISH");
    const postRatio = finish && finish.postFrames > 0 ? (finish.postFrames - finish.postOut) / finish.postFrames : 0;
    console.log(
      `finishPostVisible=${(postRatio * 100).toFixed(1)}% (${(finish?.postFrames ?? 0) - (finish?.postOut ?? 0)}/${finish?.postFrames ?? 0})`,
    );
    expect(postRatio).toBe(1);
  }, 120000);

  test("requestFrameInclude widens for a dummy horse, and cut does not", () => {
    resetFrameIncludes();
    expect(cameraConfig.framing.includePolicy).toBe("widen");
    const ends = segmentEnds();
    const progress = ends.backStraightEnd + (ends.cornerEnd - ends.backStraightEnd) * 0.25;
    const leaders: FrameSubject[] = [1, 2, 3, 4, 5].map((lane) => ({
      ...presentationLogical(progress, lane),
      id: `lane-${lane}`,
      rank: lane,
    }));
    const packX = leaders.reduce((sum, horse) => sum + horse.x, 0) / leaders.length;
    const packY = leaders.reduce((sum, horse) => sum + horse.y, 0) / leaders.length;
    const base = getCameraLookForState(
      { name: "CORNER_IN" },
      { raceTime: 12, started: true, gateOpen: 1, leadProgress: progress, horses: [] },
      packX,
      packY,
    );
    const lead = progress;
    const baseCamera = cameraFromLook(base);
    let dummy: FrameSubject | null = null;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const len = Math.hypot(dx, dy);
      for (let dist = 80; dist <= 4800; dist += 80) {
        const candidate: FrameSubject = {
          x: packX + (dx / len) * dist,
          y: packY + (dy / len) * dist,
          tx: 0,
          ty: 1,
          id: "dummy",
          rank: 8,
        };
        const pose = projectWithCamera(candidate, baseCamera);
        if (!pose.visible) break;
        if (!horseFit(base, [candidate]).ok) {
          dummy = candidate;
          break;
        }
      }
      if (dummy) break;
    }
    expect(dummy, "a visible horse outside the state camera").not.toBeNull();
    if (!dummy) return;

    const parked = frameHorseLook(base, [...leaders, dummy], "CORNER_IN", [], createFrameMemory(base), 0, lead).look;
    expect(horseFit(parked, leaders).ok, "leaders stay inside without the dummy").toBe(true);
    expect(requiredFrameSubjects([...leaders, dummy], "CORNER_IN", lead).some((subject) => subject.id === "dummy")).toBe(
      false,
    );

    requestFrameInclude("dummy", 1.25);
    expect(activeFrameIncludes()).toEqual([{ horseId: "dummy", remaining: 1.25 }]);
    const widened = frameHorseLook(base, [...leaders, dummy], "CORNER_IN", [], createFrameMemory(base), 0, lead);
    expect(horseFit(widened.look, [dummy]).ok).toBe(true);
    expect(horseFit(widened.look, leaders).ok).toBe(true);
    expect(widened.look.distance).toBeGreaterThan(parked.distance);
    expect(widened.look.focalLength).toBeLessThan(parked.focalLength);

    const ids = (policy: "widen" | "cut") =>
      subjectsForFrameRule([...leaders, dummy], "topN", policy).map((subject) => subject.id);
    expect(ids("widen")).toContain("dummy");
    expect(ids("cut")).not.toContain("dummy");
    expect(activeFrameIncludes().map((item) => item.horseId)).toEqual(["dummy"]);

    frameHorseLook(base, [...leaders, dummy], "CORNER_IN", [], widened.memory, 1.25, lead);
    expect(activeFrameIncludes()).toEqual([]);
    expect(requiredFrameSubjects([...leaders, dummy], "CORNER_IN", lead).some((subject) => subject.id === "dummy")).toBe(
      false,
    );
    resetFrameIncludes();
  });

  test("START keeps all 12 horses inside the safe rect", () => {
    const field: FrameSubject[] = Array.from({ length: 12 }, (_, index) => {
      const lane = index + 1;
      return { ...presentationLogical(0, lane), id: `lane-${lane}`, rank: lane };
    });
    const packX = field.reduce((sum, horse) => sum + horse.x, 0) / field.length;
    const packY = field.reduce((sum, horse) => sum + horse.y, 0) / field.length;
    const base = getCameraLookForState(
      { name: "START" },
      { raceTime: 0, started: false, gateOpen: 0, leadProgress: 0, horses: [] },
      packX,
      packY,
    );
    expect(base.azimuth).toBe(cameraConfig.states.START.azimuth);
    expect(base.elevation).toBe(cameraConfig.states.START.elevation);
    expect(base.distance).toBe(cameraConfig.states.START.distance);
    expect(base.focalLength).toBe(cameraConfig.states.START.focalLength);
    const framed = frameHorseLook(base, field, "START", [], createFrameMemory(base), 0, 0);
    const camera = cameraFromLook(framed.look);
    for (const horse of field) {
      const pose = projectWithCamera(horse, camera);
      expect(pose.visible, `lane ${horse.rank}`).toBe(true);
      const rect = spriteRect(pose);
      expect(rect.minX, `lane ${horse.rank} left`).toBeGreaterThanOrEqual(FRAME_LEFT - 0.6);
      expect(rect.maxX, `lane ${horse.rank} right`).toBeLessThanOrEqual(FRAME_RIGHT + 0.6);
      expect(rect.minY, `lane ${horse.rank} top`).toBeGreaterThanOrEqual(FRAME_TOP - 0.6);
      expect(rect.maxY, `lane ${horse.rank} bottom`).toBeLessThanOrEqual(FRAME_BOTTOM + 0.6);
    }
  });
});
