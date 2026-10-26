import { describe, expect, test } from "vitest";
import { simulateRace, progressAt } from "../lib/race";
import { mockHorses } from "../lib/mockHorses";
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
  createFrameMemory,
  frameHorseLook,
  grassBelowRailFraction,
  laneBackgroundFraction,
  spriteRect,
  type FrameMemory,
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
  test("the eight cloth colors are the shared lane list", () => {
    expect([...LANE_COLORS]).toEqual([
      "#E5173F",
      "#1F5BFF",
      "#FFD000",
      "#00A86B",
      "#8E3BFF",
      "#FF4FC8",
      "#00C8E0",
      "#14181F",
    ]);
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
        `${name} base sagitta=${cornerRailSagitta(camera).toFixed(1)}px grass=${(grassBelowRailFraction(camera) * 100).toFixed(1)}% laneBg=${(laneBackgroundFraction(camera) * 100).toFixed(1)}%`,
      );
    }
  });
});

describe("horse framing", () => {
  test("eight seeds keep every sprite inside the safe rect", () => {
    type Stat = {
      samples: number;
      worst: number;
      heights: number[];
      grass: number;
      background: number;
      sagitta: number;
      postOut: number;
      outsideFail: number;
    };
    const byState = new Map<string, Stat>();
    const ensure = (name: string) => {
      let stat = byState.get(name);
      if (!stat) {
        stat = { samples: 0, worst: Infinity, heights: [], grass: 0, background: 0, sagitta: Infinity, postOut: 0, outsideFail: 0 };
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
        const anchors = pres.state.name === "FINISH" ? [post, { x: post.x, y: outerRailRadius(8) }] : [];
        const framed = frameHorseLook(
          pres.look,
          subjects.map((subject) => subject.logical),
          pres.state.name,
          anchors,
          memory,
          raceTime === 0 ? 0 : 0.1,
        );
        memory = framed.memory;
        const camera = cameraFromLook(framed.look);
        const label = stateLabel(pres.state, leadProgress);
        const stat = ensure(label);
        stat.samples += 1;
        const heights: number[] = [];
        for (const subject of subjects) {
          const pose = projectWithCamera(subject.logical, camera);
          expect(pose.visible, `${label} seed ${seed} t ${raceTime}`).toBe(true);
          const rect = spriteRect(pose);
          heights.push(rect.height);
          const margin = Math.min(rect.minX - FRAME_LEFT, FRAME_RIGHT - rect.maxX, rect.minY - FRAME_TOP, FRAME_BOTTOM - rect.maxY);
          stat.worst = Math.min(stat.worst, margin);
          expect(rect.minX, `${label} seed ${seed} t ${raceTime.toFixed(1)} left`).toBeGreaterThanOrEqual(FRAME_LEFT - 0.6);
          expect(rect.maxX, `${label} seed ${seed} t ${raceTime.toFixed(1)} right`).toBeLessThanOrEqual(FRAME_RIGHT + 0.6);
          expect(rect.minY, `${label} seed ${seed} t ${raceTime.toFixed(1)} top`).toBeGreaterThanOrEqual(FRAME_TOP - 0.6);
          expect(rect.maxY, `${label} seed ${seed} t ${raceTime.toFixed(1)} bottom`).toBeLessThanOrEqual(FRAME_BOTTOM + 0.6);
        }
        heights.sort((a, b) => a - b);
        stat.heights.push(heights[Math.floor((heights.length - 1) / 2)] ?? 0);
        const grass = grassBelowRailFraction(camera);
        stat.grass = Math.max(stat.grass, grass);
        stat.background = Math.max(stat.background, laneBackgroundFraction(camera));
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
          if (!anchorVisible(framed.look, post)) stat.postOut += 1;
        }
      }
    }

    const lines: string[] = [];
    for (const [name, stat] of byState) {
      const heights = [...stat.heights].sort((a, b) => a - b);
      const median = heights[Math.floor((heights.length - 1) / 2)] ?? 0;
      const minMedian = heights[0] ?? 0;
      lines.push(
        [
          name,
          `n=${stat.samples}`,
          `worstMargin=${stat.worst.toFixed(1)}px`,
          `medianHorse=${median.toFixed(1)}px`,
          `minFrameMedian=${minMedian.toFixed(1)}px`,
          `worstGrass=${(stat.grass * 100).toFixed(1)}%`,
          `worstLaneBg=${(stat.background * 100).toFixed(1)}%`,
          stat.sagitta < Infinity ? `minSagitta=${stat.sagitta.toFixed(0)}px` : "sagitta=n/a",
          `postMiss=${stat.postOut}`,
          `outsideFail=${stat.outsideFail}`,
        ].join(" | "),
      );
    }
    console.log(lines.join("\n"));
  }, 120000);
});
