import droneStalls from "../public/gate/drone/stalls.json";
import startStalls from "../public/gate/start/stalls.json";
import topStalls from "../public/gate/top/stalls.json";
import { groundAt } from "./cameraFrame";
import { cameraFromLook, type CameraLook } from "./cameraState";
import { PROJECTION_CENTER } from "./stage";
import { CHUTE, ENGINE_PX_PER_M, STRAIGHT, laneRadius, type Camera } from "./track";

const M = ENGINE_PX_PER_M;

export const GATE_X = -STRAIGHT / 2 - CHUTE;
export const GATE_CENTER_Y = (laneRadius(1) + laneRadius(12)) / 2;

export type GateView = "drone" | "top" | "start";
export const DOOR_STATES = ["closed", "opening1", "opening2", "open"] as const;
export type DoorState = (typeof DOOR_STATES)[number];

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };
export type GateLayer = Rect & { key: string; file: string };

type StallsJson = {
  layers: Record<"back.png" | "front.png" | "sign.png", Rect>;
  stalls: readonly {
    lane: number;
    doorTop: number[];
    doorBottom: number[];
    horseFoot: number[];
    doors: Record<DoorState, Rect & { file: string }>;
  }[];
};

export type GateViewSpec = {
  look: CameraLook;
  camera: Camera;
  stalls: StallsJson["stalls"];
  back: GateLayer;
  /** Per door state, in draw order. */
  doors: Record<DoorState, readonly GateLayer[]>;
  front: GateLayer;
  sign: GateLayer;
  doorStates: readonly DoorState[];
  box: { x: number; y: number; width: number; height: number };
  /** World ground point under each lane's stalls.json horseFoot, keyed by lane. */
  feet: ReadonlyMap<number, Point>;
};

/**
 * Each look is fitted to its stalls.json door lines: the asset is a render from exactly this camera.
 * `stallOrder` "12to1" draws far stalls first where open doors overlap the neighbour.
 */
const VIEW_SOURCES: Record<
  GateView,
  { json: StallsJson; look: CameraLook; doorStates: readonly DoorState[]; stallOrder: "json" | "12to1" }
> = {
  drone: {
    json: droneStalls,
    look: {
      targetX: GATE_X + -27.188557222992074 * M,
      targetY: GATE_CENTER_Y + 9.81952915991845 * M,
      distance: 45.050957344330044 * M,
      azimuth: -69.73335954488843,
      elevation: 4.216963349484524,
      focalLength: 1200,
    },
    doorStates: ["closed"],
    stallOrder: "json",
  },
  top: {
    json: topStalls,
    look: {
      targetX: GATE_X + -2.3894894798423514 * M,
      targetY: GATE_CENTER_Y + 0.35012069719464556 * M,
      distance: 23.023319565967277 * M,
      azimuth: -69.87460414228735,
      elevation: 39.39672517252379,
      focalLength: 1200,
    },
    doorStates: ["closed"],
    stallOrder: "json",
  },
  start: {
    json: startStalls,
    look: {
      targetX: GATE_X + -5.7316189011436 * M,
      targetY: GATE_CENTER_Y + 4.443169925485172 * M,
      distance: 26.25987997909368 * M,
      azimuth: -43.298070855482706,
      elevation: 10.363066773981894,
      focalLength: 1350,
    },
    doorStates: DOOR_STATES,
    stallOrder: "12to1",
  },
};

function gateView(view: GateView): GateViewSpec {
  const { json, look, doorStates, stallOrder } = VIEW_SOURCES[view];
  const camera = cameraFromLook(look);
  const layer = (name: keyof StallsJson["layers"]): GateLayer => ({
    key: `gate-${view}-${name.replace(".png", "")}`,
    file: name,
    ...json.layers[name],
  });
  const drawn = stallOrder === "12to1" ? [...json.stalls].sort((a, b) => b.lane - a.lane) : json.stalls;
  const doorsAt = (state: DoorState) =>
    drawn.map(({ lane, doors }) => ({ key: `gate-${view}-${lane}-${state}`, ...doors[state] }));
  const doors = {
    closed: doorsAt("closed"),
    opening1: doorsAt("opening1"),
    opening2: doorsAt("opening2"),
    open: doorsAt("open"),
  };
  const back = layer("back.png");
  const front = layer("front.png");
  const sign = layer("sign.png");
  const boxed = [back, front, sign, ...doorStates.flatMap((state) => doors[state])];
  const x0 = Math.min(...boxed.map((rect) => rect.x));
  const y0 = Math.min(...boxed.map((rect) => rect.y));
  const x1 = Math.max(...boxed.map((rect) => rect.x + rect.w));
  const y1 = Math.max(...boxed.map((rect) => rect.y + rect.h));
  const feet = new Map(
    json.stalls.map(({ lane, horseFoot: [sx, sy] }) => {
      const { x, y } = groundAt(camera, sx!, sy!);
      return [lane, { x, y }] as const;
    }),
  );
  return {
    look,
    camera,
    stalls: json.stalls,
    back,
    doors,
    front,
    sign,
    doorStates,
    box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
    feet,
  };
}

export const GATE_VIEWS: Record<GateView, GateViewSpec> = {
  drone: gateView("drone"),
  top: gateView("top"),
  start: gateView("start"),
};

/** Inverse of projectWithCamera under `camera`, onto the vertical gate plane x = GATE_X. */
export function gatePlanePoint(camera: Camera, sx: number, sy: number) {
  const { groundX, groundY, height, yaw, pitch, focalLength } = camera;
  const a = (PROJECTION_CENTER.x - sx) / focalLength;
  const b = (PROJECTION_CENTER.y - sy) / focalLength;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const forward = cosPitch + b * sinPitch;
  const depth = (GATE_X - groundX) / (a * cosYaw - forward * sinYaw);
  return {
    x: GATE_X,
    y: groundY + depth * (a * sinYaw + forward * cosYaw),
    z: height + depth * (b * cosPitch - sinPitch),
  };
}
