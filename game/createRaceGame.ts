import Phaser from "phaser";
import { skillById } from "@/lib/skills";
import { SKILL_WINDOW, progressAt, type RaceHorse, type RaceResult, type SkillCutin } from "@/lib/race";
import {
  BANNER_HOLD,
  BEAT_FOCUS,
  FOCUS_ZOOM,
  HORSE_UNIT,
  INTRO,
  PAYOFF_HOLD,
  ZOOM_IN,
  ZOOM_OUT,
  beatAt,
  type ShowBeat,
} from "@/game/skillShow";
import { playBang } from "@/game/bang";
import { renderLane, projectWithCamera, presentationLogical, finishPostLogical, finishOuterLogical, segmentEnds } from "@/game/track";
import {
  createInitialState,
  nextCameraState,
  getCameraLookForState,
  cameraFromLook,
  shouldScaleHorseInCorner,
  shouldShowFinishMark,
  type CameraState,
  type CameraStateName,
  type RaceSnapshot,
} from "@/game/cameraState";
import {
  advanceCameraPresentation,
  cameraBlendProgress,
  createCameraPresentation,
  type CameraPresentation,
} from "@/game/cameraBlend";
import {
  frameHorseLook,
  createFrameMemory,
  framingRuleFor,
  grassBelowRailFraction,
  horseFit,
  requiredFrameSubjects,
  resetFrameIncludes,
  type FrameMemory,
} from "@/game/cameraFrame";
import { cameraConfig } from "@/game/cameraConfig";
import { LOGICAL_PER_METER, horseSpriteScale } from "@/game/artScale";
import { createHorseCoatLibrary, type HorseCoatLibrary } from "@/game/horseCoat";
import { introCountdownAt, introStartLook, sampleIntro } from "@/game/introCamera";
import { createGateConfig, createStartingGate, type StartingGate } from "@/game/startingGate";
import { GATE_SIGN_TEXT, ensureGatePlateTextures, gatePlateKey, paintStartingGate } from "@/game/gateView";
import {
  HORSE_ANGLES,
  gallopFrame,
  IDLE_FRAME,
  glyphFontPx,
  glyphHeightPx,
  glyphOutlinePx,
  pickHorseAngle,
  plateScreenOffset,
  relativeYawDeg,
} from "@/game/horseVisual";
import {
  assignHorseSheet,
  assignRiderSheet,
  createMountedSlots,
  horseSheetKey,
  type MountedSlots,
  type SpriteSheetRef,
} from "@/game/mountedPair";
import { RIDE_ANGLES, ridePose } from "@/game/jockeyRide";
import { createTrackRenderer, trackViewFor } from "@/game/trackRenderer";
import type { RaceOverlaySnapshot } from "@/game/overlayLayout";
import { orderByPresentation } from "@/game/rankOrder";

const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;

export type RankRow = {
  id: string;
  name: string;
  place: number;
  color: string;
  portrait: string;
};

type Hooks = {
  onComment: (message: string) => void;
  onCutin: (cutin: SkillCutin | null) => void;
  onRanks: (ranks: RankRow[]) => void;
  onPresentation: (snapshot: RaceOverlaySnapshot) => void;
  onComplete: () => void;
};

type Actor = {
  horse: RaceHorse;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  rider: Phaser.GameObjects.Sprite;
  /** Saddle cloth and number plate, drawn above the shaded body. */
  marks: Phaser.GameObjects.Sprite;
  mount: MountedSlots;
  setHorseSheet: (sheet: SpriteSheetRef) => void;
  setRiderSheet: (sheet: SpriteSheetRef) => void;
  face: Phaser.GameObjects.Image;
  lines: Phaser.GameObjects.Graphics;
  dust: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Graphics;
  shadow: Phaser.GameObjects.Image;
  number: Phaser.GameObjects.Text;
  stamp: Phaser.GameObjects.Text;
  progress: number;
  shown: number;
  animTime: number;
};

type RaceCameraDebug = {
  state: string;
  from: string | null;
  to: string | null;
  blend: number;
  duration: number;
  raceTime: number;
  wallClock: number;
  leadProgress: number;
  settled: boolean;
};

type CameraDebugHost = Window & {
  __raceCamera?: RaceCameraDebug;
  __raceCameraWant?: { from: CameraStateName; to: CameraStateName } | null;
  __cameraFreeze?: boolean;
  __raceCameraFrozen?: RaceCameraDebug;
  __raceGame?: Phaser.Game;
  /** When false, debug markers and the text overlay are cleared. The frame stays frozen. */
  __raceDebugVisible?: boolean;
};

function cameraDebugHost(): CameraDebugHost {
  return window as CameraDebugHost;
}

function cameraStateLabel(state: CameraState, lead: number): string {
  if (state.name === "STRAIGHT") {
    return lead >= segmentEnds().cornerEnd ? "STRAIGHT-home" : "STRAIGHT-early";
  }
  return state.name;
}

/**
 * Golden grade over the frame. The playfield stays near white in multiply so the
 * pre-desaturated turf is not lifted toward beige. Warmth is the 1.07:0.93:0.78
 * ratio (1 : 0.87 : 0.73) only toward the corners, plus a small upper-left sun.
 */
function paintGoldenGrade(scene: Phaser.Scene) {
  const width = GAME_WIDTH;
  const height = GAME_HEIGHT;
  const vignette = scene.textures.createCanvas("grade-vignette", width, height);
  if (vignette) {
    const context = vignette.getContext();
    const ink = context.createRadialGradient(width * 0.42, height * 0.28, height * 0.2, width / 2, height * 0.45, height * 0.85);
    ink.addColorStop(0, "rgba(255,255,255,1)");
    ink.addColorStop(0.72, "rgba(255,255,255,1)");
    ink.addColorStop(1, "rgba(255,222,186,1)");
    context.fillStyle = ink;
    context.fillRect(0, 0, width, height);
    vignette.refresh();
    scene.add.image(width / 2, height / 2, "grade-vignette").setScrollFactor(0).setDepth(8000).setBlendMode(Phaser.BlendModes.MULTIPLY);
  }
  const sun = scene.textures.createCanvas("grade-sun", width, height);
  if (sun) {
    const context = sun.getContext();
    context.clearRect(0, 0, width, height);
    const glow = context.createRadialGradient(width * 0.12, height * 0.08, 0, width * 0.2, height * 0.16, height * 0.42);
    glow.addColorStop(0, "rgba(255, 196, 120, 0.07)");
    glow.addColorStop(1, "rgba(255, 196, 120, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    sun.refresh();
    scene.add.image(width / 2, height / 2, "grade-sun").setScrollFactor(0).setDepth(8001).setBlendMode(Phaser.BlendModes.ADD);
  }
}

function farShade(scale: number) {
  const depth = Math.max(0, Math.min(1, (1.05 - scale) / 0.7));
  const channel = Math.round(255 - depth * 25);
  return (channel << 16) | (channel << 8) | channel;
}

/** Hide the canvas until the first painted frame, then fade it in. */
function fadeInCanvas(canvas: HTMLCanvasElement) {
  canvas.style.opacity = "0";
  const startedAt = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - startedAt) / 300);
    canvas.style.opacity = String(t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function frameName(texture: Phaser.Textures.Texture, frame: number) {
  const named = String(frame);
  if (texture.has(named)) return named;
  return "__BASE";
}

type Heading = { x: number; y: number; tx: number; ty: number };

function blendLogical(from: Heading, to: Heading, blend: number): Heading {
  return {
    x: from.x + (to.x - from.x) * blend,
    y: from.y + (to.y - from.y) * blend,
    tx: from.tx + (to.tx - from.tx) * blend,
    ty: from.ty + (to.ty - from.ty) * blend,
  };
}

function paintGallop(
  sprite: Phaser.GameObjects.Sprite,
  key: string,
  frame: number,
  anchorX: number,
  anchorY: number,
  frameW: number,
  frameH: number,
  scale: number,
  flip: boolean,
) {
  const texture = sprite.scene.textures.get(key);
  if (!texture || texture.key === "__MISSING") return;
  sprite.setTexture(key, frameName(texture, frame));
  const safeW = frameW || 1;
  const safeH = frameH || 1;
  sprite.setOrigin(anchorX / safeW, anchorY / safeH);
  sprite.setScale(scale);
  sprite.setFlipX(flip);
}

function getLogicalAt(progress: number, lane: number) {
  return presentationLogical(progress, lane);
}

/** Same presentation progress the ranking HUD sorts by, including an in-progress position swap. */
function liveShown(horse: RaceHorse, progress: number, time: number) {
  const swapping = horse.swapUntil > 0 && time >= horse.swapUntil - 0.6 && time < horse.swapUntil;
  if (!swapping) return progress;
  const swapBlend = 1 - (horse.swapUntil - time) / 0.6;
  return horse.swapFrom + (progress - horse.swapFrom) * swapBlend;
}

const COUNT_STEP = 0.8;
const SKILL_LEAD = 0.1;

function countdownLabel(wallClock: number) {
  const step = Math.min(2, Math.floor(wallClock / COUNT_STEP));
  return ["3", "2", "1"][step] ?? "1";
}

export function createRaceGame(parent: HTMLElement, race: RaceResult, hooks: Hooks) {
  const actors: Actor[] = [];
  let raceTime = 0;
  let wallClock = 0;
  let introTime = 0;
  let introActive = true;
  let countdownTime = 0;
  let started = false;
  let gateOpen = 0;
  const restZoom = 0.45;
  let finished = false;
  const zoom = 1;
  let skillFocusNumber = 0;
  let showStart = -1;
  let showSkillTime = 0;
  let beat: ShowBeat | "idle" = "idle";
  let skillLive = false;
  let announced = false;
  let sparked = false;
  let sparkWave = -1;
  let marks: Phaser.GameObjects.Graphics | null = null;
  let cutPath: Phaser.GameObjects.Graphics | null = null;
  let brakeSkid: Phaser.GameObjects.Graphics | null = null;
  let brakeHaze: Phaser.GameObjects.Graphics | null = null;
  let activeCutin: SkillCutin | null = null;
  let crack: Phaser.GameObjects.Graphics | null = null;
  let crackPlate: Phaser.GameObjects.Image | null = null;
  let crackPlateWidth = 1;
  let crackPlateHeight = 1;
  const ghosts: Phaser.GameObjects.Image[] = [];
  let ribbon: Phaser.GameObjects.Image | null = null;
  let muzzle: Phaser.GameObjects.Image | null = null;
  let tracer: Phaser.GameObjects.Image | null = null;
  let beam: Phaser.GameObjects.Image | null = null;
  let crownMark: Phaser.GameObjects.Image | null = null;
  let slash: Phaser.GameObjects.Image | null = null;
  let sparks: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  let rankKey = "";
  let lastPhaseSig = "";
  let lastPresentationAt = -1;
  let lastComment = "";
  let gates: Phaser.GameObjects.Graphics | null = null;
  let gatePlates: Phaser.GameObjects.Image[] = [];
  let gateNumbers: Phaser.GameObjects.Text[] = [];
  let gateSign: Phaser.GameObjects.Text | null = null;
  let startingGate: StartingGate | null = null;
  let debugOverlay: Phaser.GameObjects.Graphics | null = null;
  let debugText: Phaser.GameObjects.Text | null = null;
  const fired = new Set<number>();
  const releasedSkills = new Set<number>();
  const cutinQueue: SkillCutin[] = [];
  const initialSnapshot: RaceSnapshot = {
    raceTime: 0,
    started: false,
    gateOpen: 0,
    leadProgress: 0,
    horses: [],
  };
  let cameraState: CameraState = createInitialState();
  let cameraPresentation: CameraPresentation = createCameraPresentation(
    cameraState,
    getCameraLookForState(cameraState, initialSnapshot, 0, 0),
  );
  resetFrameIncludes();
  let frameMemory: FrameMemory = createFrameMemory(cameraPresentation.look);
  let frameDt = 0;
  let frameMargin = 0;
  let currentCamera = cameraFromLook(cameraPresentation.look);
  let lastLeadProgress = 0;
  
  const DEBUG_ENABLED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

  const goalInnerLogical = finishPostLogical();
  const goalOuterLogical = finishOuterLogical(Math.max(1, race.horses.length));
  let world: ReturnType<typeof createTrackRenderer> | null = null;
  let coats: HorseCoatLibrary | null = null;

  class RaceScene extends Phaser.Scene {
    constructor() {
      super("race");
    }

    preload() {
      this.load.image("ground-turf", "/track/v2/ground_turf.webp");
      this.load.image("ground-dirt", "/track/v2/ground_dirt.webp");
      this.load.image("rail-segment", "/track/v2/rail_segment.png");
      this.load.image("sky", "/track/v2/sky_strip.webp");
      this.load.image("stands-strip", "/track/v2/stands_strip_v4.webp");
      this.load.image("trees-strip", "/track/v2/trees_strip.png");
      this.load.image("prop-distance", "/track/props/distance_post.webp");
      this.load.image("prop-finish", "/track/props/finish_post.webp");
      this.load.image("prop-tree", "/track/props/corner_tree.webp");
      this.load.image("finish-checker", "/track/props/finish_line_checker.webp");
      for (const set of ["straight", "corner"] as const) {
        for (const angle of HORSE_ANGLES[set]) {
          this.load.image(`horse-color-${set}-${angle.index}`, `/horses/${angle.colorFile}`);
          this.load.image(`horse-mask-${set}-${angle.index}`, `/horses/${angle.maskFile}`);
        }
        for (const angle of RIDE_ANGLES[set]) {
          this.load.image(`ride-color-${set}-${angle.index}`, `/jockey/${angle.colorFile}`);
          this.load.image(`ride-mask-${set}-${angle.index}`, `/jockey/${angle.maskFile}`);
        }
      }
      for (const horse of race.horses) {
        this.load.image(`portrait-${horse.id}`, horse.portrait);
      }
      this.load.image("crack-plate", "/fx/screen-crack.jpg");
    }

    create() {
      this.cameras.main.setBackgroundColor("#3F4630");
      coats = createHorseCoatLibrary(this);
      world = createTrackRenderer(this);
      paintGoldenGrade(this);

      for (const horse of race.horses) {
        const canvas = this.textures.createCanvas(`face-${horse.id}`, 64, 64);
        if (canvas) {
          const context = canvas.getContext();
          const source = this.textures.get(`portrait-${horse.id}`).getSourceImage() as CanvasImageSource;
          context.save();
          context.beginPath();
          context.arc(32, 32, 30, 0, Math.PI * 2);
          context.clip();
          context.drawImage(source, 0, 0, 64, 64);
          context.restore();
          context.strokeStyle = horse.color;
          context.lineWidth = 6;
          context.beginPath();
          context.arc(32, 32, 28, 0, Math.PI * 2);
          context.stroke();
          canvas.refresh();
        }

        const sprite = this.add.sprite(0, 0, "horse-color-straight-2").setOrigin(0.5, 0.96);
        const marks = this.add.sprite(0, 0, "horse-color-straight-2").setOrigin(0.5, 0.96).setVisible(false);
        const rider = this.add.sprite(0, 0, "horse-color-straight-2").setOrigin(0.5, 0.96).setVisible(false);
        const faceKey = this.textures.exists(`face-${horse.id}`) ? `face-${horse.id}` : `portrait-${horse.id}`;
        const face = this.add.image(0, 0, faceKey).setDisplaySize(52, 52).setVisible(false);
        const lines = this.add.graphics();
        const dust = this.add.graphics();
        const body = this.add.graphics();
        const shadow = this.add.image(0, 0, "horse-color-straight-2").setDepth(80).setVisible(false);
        const number = this.add
          .text(0, 0, String(horse.number), {
            fontFamily: "sans-serif",
            fontSize: "24px",
            color: "#FFFFFF",
            fontStyle: "bold",
            stroke: "#140E0A",
            strokeThickness: 3,
          })
          .setOrigin(0.5);
        const stamp = this.add
          .text(0, -168, "", {
            fontFamily: "sans-serif",
            fontSize: "32px",
            color: "#fffaf2",
            fontStyle: "bold",
            stroke: "#24180f",
            strokeThickness: 6,
          })
          .setOrigin(0.5);
        const container = this.add.container(0, 0);
        container.add([dust, lines, body, sprite, marks, rider, face, number, stamp]);
        const mount = createMountedSlots();
        const actor: Actor = {
          horse,
          container,
          sprite,
          rider,
          marks,
          mount,
          setHorseSheet: (sheet) => {
            actor.mount = assignHorseSheet(actor.mount, sheet);
          },
          setRiderSheet: (sheet) => {
            actor.mount = assignRiderSheet(actor.mount, sheet);
          },
          face,
          lines,
          dust,
          body,
          shadow,
          number,
          stamp,
          progress: 0,
          shown: 0,
          animTime: 0,
        };
        actors.push(actor);
      }
      this.paintFxTextures();

      for (let index = 0; index < 6; index += 1) {
        ghosts.push(this.add.image(0, 0, "horse-color-straight-2").setVisible(false).setDepth(3400));
      }
      ribbon = this.add.image(0, 0, "fx-ribbon").setVisible(false).setDepth(3450).setBlendMode(Phaser.BlendModes.ADD);
      muzzle = this.add.image(0, 0, "fx-muzzle").setVisible(false).setDepth(3600).setBlendMode(Phaser.BlendModes.ADD);
      tracer = this.add.image(0, 0, "fx-muzzle").setVisible(false).setDepth(3600).setBlendMode(Phaser.BlendModes.ADD);
      beam = this.add.image(0, 0, "fx-beam").setVisible(false).setDepth(3600).setBlendMode(Phaser.BlendModes.ADD);
      crownMark = this.add.image(0, 0, "fx-crown").setVisible(false).setDepth(3600);
      slash = this.add.image(0, 0, "fx-slash").setVisible(false).setDepth(3550).setBlendMode(Phaser.BlendModes.ADD);
      sparks = this.add.particles(0, 0, "fx-grain", {
        lifespan: 420,
        speed: { min: 40, max: 220 },
        scale: { start: 1, end: 0 },
        quantity: 0,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      });
      sparks.setDepth(3650);
      marks = this.add.graphics().setDepth(3480);
      cutPath = this.add.graphics().setDepth(37);
      brakeSkid = this.add.graphics().setDepth(36);
      brakeHaze = this.add.graphics().setDepth(38);
      crack = this.add.graphics().setScrollFactor(0).setDepth(4200);
      const plateSource = this.textures.get("crack-plate").getSourceImage() as CanvasImageSource & {
        width: number;
        height: number;
      };
      crackPlateWidth = plateSource.width;
      crackPlateHeight = plateSource.height;
      const plateCanvas = this.textures.createCanvas("crack-glass", plateSource.width, plateSource.height);
      if (plateCanvas) {
        const context = plateCanvas.getContext();
        context.drawImage(plateSource, 0, 0);
        const pixels = context.getImageData(0, 0, plateSource.width, plateSource.height);
        const data = pixels.data;
        for (let index = 0; index < data.length; index += 4) {
          const lum = Math.max(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0);
          const lift = lum < 26 ? 0 : Math.min(255, ((lum - 26) / 180) ** 0.72 * 300);
          data[index] = 255;
          data[index + 1] = 255;
          data[index + 2] = 255;
          data[index + 3] = lift;
        }
        context.putImageData(pixels, 0, 0);
        plateCanvas.refresh();
      }
      crackPlate = this.add
        .image(0, 0, plateCanvas ? "crack-glass" : "crack-plate")
        .setScrollFactor(0)
        .setOrigin(0.5)
        .setDepth(4250)
        .setVisible(false);

      startingGate = createStartingGate(createGateConfig());
      ensureGatePlateTextures(this, startingGate.config.stallCount);
      gates = this.add.graphics().setDepth(20);
      gatePlates = [];
      gateNumbers = [];
      for (let index = 0; index < startingGate.config.stallCount; index += 1) {
        gatePlates.push(this.add.image(0, 0, gatePlateKey(index + 1)).setVisible(false).setDepth(6000));
        gateNumbers.push(
          this.add.text(0, 0, String(index + 1), {
            fontFamily: "sans-serif",
            fontSize: "32px",
            color: "#ffffff",
            fontStyle: "bold",
          }).setOrigin(0.5).setVisible(false).setDepth(6001),
        );
      }
      gateSign = this.add.text(0, 0, GATE_SIGN_TEXT, {
        fontFamily: "sans-serif",
        fontSize: "28px",
        color: "#14315c",
        backgroundColor: "#f7f1e4",
        padding: { x: 16, y: 6 },
      }).setOrigin(0.5).setVisible(false).setDepth(6002);
      this.input.on("pointerdown", () => {
        if (introActive) {
          introActive = false;
          countdownTime = 0;
          lastComment = "게이트 앞에서 대기 중입니다.";
          hooks.onComment(lastComment);
        }
      });
      debugOverlay = this.add.graphics().setDepth(10000);
      debugText = this.add.text(10, 10, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffff00',
        backgroundColor: '#000000dd',
        padding: { x: 10, y: 10 },
      }).setDepth(10001).setVisible(DEBUG_ENABLED).setScrollFactor(0);
      lastComment = "경기장을 한 바퀴 봅니다.";
      hooks.onComment(lastComment);
      this.paintGates();
      this.placeHorses();
      this.frameCamera(true);
      this.publishField("intro", null);
      this.events.once("render", () => fadeInCanvas(this.game.canvas));
    }

    update(_time: number, delta: number) {
      if (DEBUG_ENABLED && cameraDebugHost().__cameraFreeze) {
        if (cameraDebugHost().__raceDebugVisible === false) this.paintDebugOverlay();
        return;
      }
      const wall = Math.min(delta, 40) / 1000;
      frameDt = wall;
      wallClock += wall;
      startingGate?.tick(wall);
      if (!started) {
        if (introActive) {
          introTime += wall;
          if (introTime >= introCountdownAt()) {
            introActive = false;
            countdownTime = 0;
            lastComment = "게이트 앞에서 대기 중입니다.";
            hooks.onComment(lastComment);
          }
        }
        if (introActive) {
          raceTime = 0;
          this.placeHorses();
          this.paintTrack();
          this.paintGates();
          this.publishField("intro", null);
          this.frameCamera(false);
          this.publishCameraDebug();
          if (DEBUG_ENABLED) this.paintDebugOverlay();
          return;
        }
        const label = countdownLabel(countdownTime);
        if (countdownTime < COUNT_STEP * 3) {
          countdownTime += wall;
          raceTime = 0;
          this.placeHorses();
          this.paintTrack();
          this.paintGates();
          this.publishField("countdown", label);
          this.frameCamera(false);
          this.publishCameraDebug();
          if (DEBUG_ENABLED) {
            this.paintDebugOverlay();
          }
          return;
        }
        started = true;
        startingGate?.openAll();
        playBang();
        lastComment = "게이트가 열렸습니다.";
        hooks.onComment(lastComment);
      }
      if (gateOpen < 1) gateOpen = Math.min(1, gateOpen + wall / 0.28);
      raceTime += wall;
      const age = showStart >= 0 ? wallClock - showStart : -1;
      beat = beatAt(age);
      const payoffAge = age - INTRO;
      skillLive = beat === "payoff" && (zoom <= 1.08 || zoom <= restZoom + 0.16);
      if (skillLive) releasedSkills.add(showSkillTime);
      if (beat === "announce" && !announced && activeCutin) {
        announced = true;
        hooks.onCutin(activeCutin);
      }
      if (announced && (beat === "idle" || age >= BEAT_FOCUS + BANNER_HOLD)) {
        announced = false;
        hooks.onCutin(null);
      }
      if (beat === "idle" && showStart >= 0 && age >= INTRO + PAYOFF_HOLD) {
        showStart = -1;
        skillFocusNumber = 0;
        activeCutin = null;
      }

      for (const event of race.events) {
        if (!event.cutin || fired.has(event.time)) continue;
        if (raceTime + 0.0001 < event.time - INTRO) continue;
        fired.add(event.time);
        cutinQueue.push(event.cutin);
        hooks.onComment(event.message);
      }
      if (showStart < 0 && cutinQueue.length > 0) {
        const next = cutinQueue.shift();
        if (next) {
          activeCutin = next;
          announced = false;
          skillFocusNumber = next.number;
          showSkillTime = race.events.find((event) => event.cutin === next)?.time ?? raceTime;
          showStart = wallClock;
          sparked = false;
          sparkWave = -1;
          beat = "focus";
        }
      }

      let latest = "";
      for (const event of race.events) {
        if (event.time <= raceTime + 0.0001) latest = event.message;
      }
      if (latest && latest !== lastComment) {
        lastComment = latest;
        hooks.onComment(latest);
      }

      this.placeHorses();
      this.paintTrack();
      this.paintGates();
      this.publishField("racing", null);
      this.frameCamera(false);
      this.publishCameraDebug();

      if (DEBUG_ENABLED) {
        this.paintDebugOverlay();
        this.holdDebugShot();
      }

      if (!finished && raceTime >= race.duration) {
        finished = true;
        hooks.onCutin(null);
        hooks.onComplete();
      }
    }

    paintTrack() {
      world?.paint(currentCamera, trackViewFor(cameraState.name, lastLeadProgress, segmentEnds().cornerEnd));
    }

    placeHorses() {
      const leadHorse = [...actors].sort((a, b) => {
        const aProgress = progressAt(a.horse.samples, raceTime);
        const bProgress = progressAt(b.horse.samples, raceTime);
        return bProgress - aProgress;
      })[0];
      const leadProgress = leadHorse ? progressAt(leadHorse.horse.samples, raceTime) : 0;

      const snapshot: RaceSnapshot = {
        raceTime,
        started,
        gateOpen,
        leadProgress: started && gateOpen >= 1 ? leadProgress : 0,
        horses: actors.map((actor, index) => ({
          index,
          progress: progressAt(actor.horse.samples, raceTime),
        })),
      };

      const nextState = nextCameraState(cameraPresentation.state, snapshot);

      const placed = actors.map((actor) => {
        const sample = progressAt(actor.horse.samples, raceTime);
        const progress = !started ? 0 : gateOpen < 1 ? sample * gateOpen : sample;
        const displayLane = renderLane(actor.horse.number, progress, race.seed);
        return { actor, progress, logical: getLogicalAt(progress, displayLane) };
      });
      const rankClock = started ? raceTime : 0;
      const ranked = orderByPresentation(
        placed.map((item) => ({
          id: item.actor.horse.id,
          number: item.actor.horse.number,
          shown: liveShown(item.actor.horse, item.progress, rankClock),
          finishTime: item.actor.horse.finishTime,
          rank: item.actor.horse.rank,
        })),
        rankClock,
      );
      const rankById = new Map(ranked.map((horse, index) => [horse.id, index + 1]));
      const subjects = placed.map((item) => ({
        ...item.logical,
        id: item.actor.horse.id,
        rank: rankById.get(item.actor.horse.id) ?? item.actor.horse.number,
      }));
      let packCenterX = 0;
      let packCenterY = 0;
      for (const logical of subjects) {
        packCenterX += logical.x;
        packCenterY += logical.y;
      }
      packCenterX /= Math.max(1, subjects.length);
      packCenterY /= Math.max(1, subjects.length);

      if (introActive) {
        const startLook = introStartLook(subjects, packCenterX, packCenterY);
        const intro = sampleIntro(introTime, startLook, {
          packX: packCenterX,
          packY: packCenterY,
          stallCount: startingGate?.config.stallCount ?? subjects.length,
        });
        currentCamera = cameraFromLook(intro.look);
        cameraState = { name: "START" };
        lastLeadProgress = 0;
      } else {
      const desiredLook = getCameraLookForState(nextState, snapshot, packCenterX, packCenterY);
      // Blends advance on the presentation clock (wallClock), never raceTime.
      cameraPresentation = advanceCameraPresentation(cameraPresentation, nextState, desiredLook, wallClock);
      cameraState = cameraPresentation.state;
      lastLeadProgress = snapshot.leadProgress;
      const anchors = cameraState.name === "FINISH" ? [goalInnerLogical, goalOuterLogical] : [];
      const framed = frameHorseLook(
        cameraPresentation.look,
        subjects,
        cameraState.name,
        anchors,
        frameMemory,
        frameDt,
        snapshot.leadProgress,
      );
      frameMemory = framed.memory;
      frameMargin = horseFit(
        framed.look,
        requiredFrameSubjects(subjects, cameraState.name, snapshot.leadProgress),
      ).worst;
      currentCamera = cameraFromLook(framed.look);
      }

      for (const actor of actors) {
        const sample = progressAt(actor.horse.samples, raceTime);
        actor.progress = !started ? 0 : gateOpen < 1 ? sample * gateOpen : sample;
        const kind = skillById(actor.horse.skillId).kind;
        const since = raceTime - actor.horse.skillTime;
        const casting = actor.horse.skillHit && since >= 0 && since < SKILL_WINDOW;
        const missed = !actor.horse.skillHit && since >= 0 && since < 0.8;
        const onFoot = raceTime >= actor.horse.footFrom && raceTime < actor.horse.footUntil;
        const stopped = raceTime >= actor.horse.stopFrom && raceTime < actor.horse.stopUntil;
        const swapping = actor.horse.swapUntil > 0 && raceTime >= actor.horse.swapUntil - 0.6 && raceTime < actor.horse.swapUntil;
        const swapBlend = swapping ? 1 - (actor.horse.swapUntil - raceTime) / 0.6 : 1;
        actor.shown = swapping
          ? actor.horse.swapFrom + (actor.progress - actor.horse.swapFrom) * swapBlend
          : actor.progress;
        const payoffAge = Math.max(0, wallClock - showStart - INTRO);
        const castingNow = actor.horse.number === skillFocusNumber && skillLive;
        const cutting =
          actor.horse.skillHit &&
          actor.horse.cutUntil > actor.horse.skillTime &&
          raceTime >= actor.horse.skillTime &&
          raceTime < actor.horse.cutUntil;
        const cutBlend = cutting ? (raceTime - actor.horse.skillTime) / (actor.horse.cutUntil - actor.horse.skillTime) : 0;
        const displayLane = renderLane(actor.horse.number, actor.progress, race.seed);
        const logical = getLogicalAt(actor.progress, displayLane);
        const heading = cutting
          ? blendLogical(getLogicalAt(actor.horse.cutFrom, displayLane), getLogicalAt(actor.horse.cutTo, displayLane), cutBlend)
          : swapping
            ? blendLogical(getLogicalAt(actor.horse.swapFrom, displayLane), logical, swapBlend)
            : logical;
        const pose = projectWithCamera(heading, currentCamera);
        const ahead = !started ? 0 : actor.progress >= 1 ? progressAt(actor.horse.samples, raceTime + 0.2) - actor.progress : 1;
        const braking = actor.progress >= 1;
        const pull = !started ? 0 : braking ? Math.max(0, Math.min(1, ahead / 0.003)) : 1;
        const footAge = raceTime - actor.horse.footFrom;
        const sucking = onFoot && footAge >= 0 && footAge < 0.4;
        const gallopRate = !started
          ? 0
          : braking
            ? pull
            : onFoot && !sucking
              ? 0
              : casting && (kind === "start" || kind === "final-burst")
                ? 1.9
                : 1;
        if (started) actor.animTime += frameDt * gallopRate;

        actor.container.setVisible(pose.visible);
        actor.shadow.setVisible(false);
        if (!pose.visible) continue;

        actor.container.setPosition(pose.x, pose.y);
        if (castingNow && kind === "final-burst" && payoffAge < 0.35) {
          const lunge = Math.sin((payoffAge / 0.35) * Math.PI) * 52;
          actor.container.x += pose.tangentX * lunge;
          actor.container.y += pose.tangentY * lunge;
        }
        const brakeLean = braking ? Math.sin((1 - pull) * Math.PI) * 20 : 0;
        const idleSway = !started ? Math.sin(wallClock * 1.6 + actor.horse.number) * 2.4 : 0;
        actor.container.setAngle(brakeLean * (pose.flipX ? 1 : -1) + idleSway);
        actor.container.setScale(1);
        actor.container.setDepth(pose.y);
        const punch = castingNow && kind === "start" && payoffAge < 0.08 ? 1.08 : 1;
        const inCornerCloseup = cameraState.name === "CLOSEUP" &&
          cameraState.closeupHorseIndex === (actor.horse.number - 1) &&
          shouldScaleHorseInCorner(cameraState);
        const closeupScale = inCornerCloseup ? 1.15 : 1;
        const drawn = horseSpriteScale(pose.scale) * punch * closeupScale;
        const yaw = relativeYawDeg(
          heading.tx,
          heading.ty,
          currentCamera.groundX - heading.x,
          currentCamera.groundY - heading.y,
        );
        const picked = pickHorseAngle(yaw, (currentCamera.pitch * 180) / Math.PI);
        const angle = HORSE_ANGLES[picked.set][picked.index] ?? HORSE_ANGLES.straight[2];
        if (!angle) continue;
        const frame = started ? gallopFrame(actor.horse.number, actor.animTime) : IDLE_FRAME;
        const baked = coats?.bakedKey(picked.set, picked.index, actor.horse.number) ?? `horse-color-${picked.set}-${picked.index}`;
        const horseKey = horseSheetKey(actor.mount, baked);
        const horseSheet = actor.mount.horse;
        paintGallop(actor.sprite, horseKey, frame, horseSheet?.anchorX ?? angle.anchorX, horseSheet?.anchorY ?? angle.anchorY, horseSheet?.frameWidth ?? angle.frameW, horseSheet?.frameHeight ?? angle.frameH, drawn, picked.flip);
        const marksBaked = actor.mount.horse ? null : coats?.marksKey(picked.set, picked.index, actor.horse.number) ?? null;
        const marksVisible = marksBaked != null && this.textures.exists(marksBaked);
        if (marksVisible && marksBaked) {
          paintGallop(actor.marks, marksBaked, frame, horseSheet?.anchorX ?? angle.anchorX, horseSheet?.anchorY ?? angle.anchorY, horseSheet?.frameWidth ?? angle.frameW, horseSheet?.frameHeight ?? angle.frameH, drawn, picked.flip);
        }
        const mounted = !onFoot || sucking;
        actor.sprite.setVisible(mounted);
        actor.marks.setVisible(mounted && marksVisible);
        const recoil = castingNow && kind === "shot" && payoffAge < 0.45 && payoffAge % 0.08 < 0.05;
        const recoilX = recoil ? (picked.flip ? 14 : -14) : 0;
        const recoilY = sucking ? (-footAge / 0.4) * 420 : 0;
        actor.sprite.setPosition(recoilX, recoilY);
        actor.marks.setPosition(recoilX, recoilY);
        const customRide = actor.mount.rider;
        const rideBaked = actor.mount.rideEnabled ? coats?.rideKey(picked.set, picked.index, actor.horse.number) ?? null : null;
        const rideVisible = mounted && actor.mount.rideEnabled && (customRide != null || (rideBaked != null && this.textures.exists(rideBaked)));
        actor.rider.setVisible(rideVisible);
        if (rideVisible && customRide) {
          const rideFrame = frame % Math.max(1, customRide.frames);
          paintGallop(actor.rider, customRide.key, rideFrame, customRide.anchorX, customRide.anchorY, customRide.frameWidth, customRide.frameHeight, drawn, picked.flip);
          actor.rider.setPosition(recoilX, recoilY);
        } else if (rideVisible && rideBaked) {
          const seated = ridePose(picked.set, picked.index, frame, angle.anchorX, angle.anchorY, drawn, picked.flip);
          if (seated) {
            paintGallop(actor.rider, rideBaked, frame, seated.originX * seated.frameW, seated.originY * seated.frameH, seated.frameW, seated.frameH, drawn, picked.flip);
            actor.rider.setPosition(recoilX + seated.x, recoilY + seated.y);
          } else {
            actor.rider.setVisible(false);
          }
        }
        const fade = sucking ? 1 - footAge / 0.4 : 1;
        actor.sprite.setAlpha(fade);
        actor.marks.setAlpha(fade);
        actor.rider.setAlpha(fade);
        actor.face.setAlpha(fade);
        const stumbling = raceTime >= actor.horse.slowFrom && raceTime < actor.horse.slowUntil;
        const flash =
          (stopped && raceTime - actor.horse.stopFrom < 0.15) ||
          (stumbling && raceTime - actor.horse.slowFrom < 0.15);
        const tint = flash ? 0xffffff : farShade(pose.scale);
        const tintMode = flash ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY;
        actor.sprite.setTint(tint).setTintMode(tintMode);
        actor.rider.setTint(tint).setTintMode(tintMode);
        actor.marks.setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
        actor.number.setTint(0xffffff);
        const wobble = missed || stopped || stumbling ? Math.sin(raceTime * 26) * 8 : 0;
        actor.sprite.setAngle(wobble);
        actor.marks.setAngle(wobble);
        actor.rider.setAngle(wobble);
        if (coats) {
          const shadowKey = coats.shadowKey(picked.set, picked.index, frame, picked.flip);
          const origin = coats.shadowOrigin(picked.set, picked.index);
          if (this.textures.exists(shadowKey)) {
            actor.shadow.setTexture(shadowKey).setOrigin(origin.x, origin.y).setScale(drawn).setFlipX(false);
            actor.shadow.setPosition(actor.container.x - 0.12 * LOGICAL_PER_METER * pose.scale, actor.container.y);
            actor.shadow.setVisible(!onFoot);
            actor.shadow.setDepth(80);
          }
        }
        actor.body.clear();
        actor.lines.clear();
        actor.dust.clear();
        const dir = picked.flip ? 1 : -1;
        const puff = (raceTime * 10 + actor.horse.number) % 1;
        actor.face.setVisible(onFoot && !sucking);
        actor.number.setVisible(!onFoot);
        if (onFoot && !sucking) {
          const swing = Math.sin(raceTime * 16 + actor.horse.number) * 14;
          actor.body.lineStyle(5, 0x24180f, 1);
          actor.body.lineBetween(0, -78, 0, -36);
          actor.body.lineBetween(0, -36, -12 + swing, 4);
          actor.body.lineBetween(0, -36, 12 - swing, 4);
          actor.body.lineStyle(4, 0x24180f, 1);
          actor.body.lineBetween(0, -62, -16, -46);
          actor.body.lineBetween(0, -62, 16, -46);
          actor.face.setDisplaySize(34, 34);
          actor.face.setPosition(0, -86);
          actor.dust.fillStyle(0xc4a06a, 0.7);
          actor.dust.fillCircle(dir * 10, 2, 4);
        } else if (!braking && pull > 0.15) {
          actor.dust.fillStyle(0xf6ead2, 0.7);
          actor.dust.fillCircle(dir * (36 + puff * 34), -4, 7 - puff * 5);
          actor.dust.fillCircle(dir * (58 + puff * 20), -1, 4);
        }
        const plate = angle.plates[frame] ?? angle.plates[0];
        if (plate) {
          const plateAt = plateScreenOffset(plate, angle.anchorX, angle.anchorY, drawn, picked.flip);
          const glyph = glyphHeightPx(plate.h, drawn, GAME_WIDTH);
          actor.number.setPosition(plateAt.x, plateAt.y);
          actor.number.setFontSize(`${glyphFontPx(glyph)}px`);
          actor.number.setStroke("#140E0A", glyphOutlinePx(glyph));
        }
        if (castingNow && kind === "jaywalk" && !actor.horse.skillHit) {
          const fence = Math.sin(payoffAge * 30) * 18;
          actor.sprite.setAngle(fence);
          actor.marks.setAngle(fence);
          actor.rider.setAngle(fence);
        }
        const word =
          casting && (kind === "start" || kind === "final-burst")
            ? "가속"
            : onFoot
              ? "도보"
              : stopped
                ? "정지"
                : stumbling
                  ? "감속"
                  : kind === "crown" && since >= 0 && since < 2
                    ? actor.horse.skillHit
                      ? "선두"
                      : "유지"
                    : cutting
                      ? "지름길"
                      : kind === "jaywalk" && missed
                        ? "울타리"
                        : "";
        actor.stamp.setText(word).setVisible(word.length > 0);
      }
      this.paintPayoff();
      this.paintShortcut();
      this.paintBrake();
    }

    paintShortcut() {
      cutPath?.clear();
      if (!cutPath) return;
      for (const actor of actors) {
        const horse = actor.horse;
        if (!horse.skillHit || horse.cutUntil <= horse.skillTime) continue;
        const age = raceTime - horse.skillTime;
        const span = horse.cutUntil - horse.skillTime;
        if (age < 0 || age > span + 0.8) continue;
        const fade = age <= span ? 1 : 1 - (age - span) / 0.8;
        const lane = renderLane(horse.number, actor.progress, race.seed);
        const from = getLogicalAt(horse.cutFrom, lane);
        const to = getLogicalAt(horse.cutTo, lane);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        const nx = -dy / length;
        const ny = dx / length;
        const tNow = Math.min(1, Math.max(0, age / Math.max(span, 1e-6)));
        const t0 = Math.max(0, tNow - 90 / length);
        const t1 = Math.min(1, tNow + 24 / length);
        const at = (t: number) => projectWithCamera({
          x: from.x + dx * t,
          y: from.y + dy * t,
          tx: dx / length,
          ty: dy / length,
        }, currentCamera);
        if (!at(tNow).visible) continue;
        const steps = 8;
        const fillStrip = (half: number, color: number, alpha: number) => {
          const edge = (t: number, side: number) => projectWithCamera({
            x: from.x + dx * t + nx * half * side,
            y: from.y + dy * t + ny * half * side,
            tx: dx / length,
            ty: dy / length,
          }, currentCamera);
          cutPath?.fillStyle(color, alpha * fade);
          cutPath?.beginPath();
          const first = edge(t0, 1);
          cutPath?.moveTo(first.x, first.y);
          for (let step = 1; step <= steps; step += 1) {
            const point = edge(t0 + (t1 - t0) * (step / steps), 1);
            cutPath?.lineTo(point.x, point.y);
          }
          for (let step = steps; step >= 0; step -= 1) {
            const point = edge(t0 + (t1 - t0) * (step / steps), -1);
            cutPath?.lineTo(point.x, point.y);
          }
          cutPath?.closePath();
          cutPath?.fillPath();
        };
        fillStrip(16, 0x2f6b3a, 0.95);
        fillStrip(8, 0xc4a06a, 1);
      }
    }

    paintBrake() {
      brakeHaze?.clear();
      for (const actor of actors) {
        if (actor.progress < 1) continue;
        const ahead = progressAt(actor.horse.samples, raceTime + 0.2) - actor.progress;
        const pull = Math.max(0, Math.min(1, ahead / 0.003));
        if (pull < 0.08) continue;
        const logical = getLogicalAt(actor.progress, actor.horse.number);
        const pose = projectWithCamera(logical, currentCamera);
        const backX = -pose.tangentX;
        const backY = -pose.tangentY;
        brakeHaze?.fillStyle(0xf7f4ee, 0.34 + pull * 0.4);
        brakeHaze?.fillCircle(pose.x + backX * 26, pose.y + backY * 16, 14 + pull * 12);
        brakeHaze?.fillStyle(0xd7d2c8, 0.28 + pull * 0.25);
        brakeHaze?.fillCircle(pose.x + backX * 56, pose.y + backY * 24, 20 + pull * 16);
        brakeHaze?.fillCircle(pose.x + backX * 86, pose.y + backY * 18, 16 + pull * 10);
        if (!brakeSkid || pull < 0.15) continue;
        brakeSkid.fillStyle(0x6e675d, 0.22);
        brakeSkid.fillCircle(pose.x + backX * 18, pose.y + backY * 12, 5);
      }
    }

    paintFxTextures() {
      this.drawFx("fx-grain", 16, 16, (ctx) => {
        const ink = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        ink.addColorStop(0, "rgba(255,255,255,1)");
        ink.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = ink;
        ctx.fillRect(0, 0, 16, 16);
      });
      this.drawFx("fx-ribbon", 256, 48, (ctx) => {
        const ink = ctx.createLinearGradient(0, 0, 256, 0);
        ink.addColorStop(0, "rgba(255,255,255,0)");
        ink.addColorStop(0.2, "rgba(255,250,230,0.95)");
        ink.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.moveTo(8, 24);
        ctx.quadraticCurveTo(90, 2, 250, 20);
        ctx.quadraticCurveTo(90, 46, 8, 24);
        ctx.fill();
      });
      this.drawFx("fx-muzzle", 160, 160, (ctx) => {
        ctx.translate(80, 80);
        for (let ray = 0; ray < 14; ray += 1) {
          ctx.rotate((Math.PI * 2) / 14);
          const length = 28 + (ray % 3) * 24;
          const ink = ctx.createLinearGradient(0, 0, length, 0);
          ink.addColorStop(0, "rgba(255,255,255,1)");
          ink.addColorStop(1, "rgba(255,214,120,0)");
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.moveTo(0, -4);
          ctx.lineTo(length, 0);
          ctx.lineTo(0, 4);
          ctx.fill();
        }
      });
      this.drawFx("fx-beam", 320, 40, (ctx) => {
        const ink = ctx.createLinearGradient(0, 0, 0, 40);
        ink.addColorStop(0, "rgba(226,59,59,0)");
        ink.addColorStop(0.32, "rgba(226,59,59,0.9)");
        ink.addColorStop(0.5, "rgba(255,255,255,1)");
        ink.addColorStop(0.68, "rgba(226,59,59,0.9)");
        ink.addColorStop(1, "rgba(226,59,59,0)");
        ctx.fillStyle = ink;
        ctx.fillRect(0, 0, 320, 40);
      });
      this.drawFx("fx-crown", 96, 72, (ctx) => {
        ctx.fillStyle = "#f0c14d";
        ctx.beginPath();
        ctx.moveTo(8, 62);
        ctx.lineTo(8, 28);
        ctx.lineTo(28, 46);
        ctx.lineTo(48, 10);
        ctx.lineTo(68, 46);
        ctx.lineTo(88, 28);
        ctx.lineTo(88, 62);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fff4c2";
        ctx.fillRect(10, 50, 76, 8);
      });
      this.drawFx("fx-slash", 280, 80, (ctx) => {
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(240,193,77,0.95)";
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(18, 62);
        ctx.quadraticCurveTo(140, 8, 262, 22);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 4;
        ctx.stroke();
      });
    }

    drawFx(key: string, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
      const canvas = this.textures.createCanvas(key, width, height);
      if (!canvas) return;
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, width, height);
      paint(ctx);
      canvas.refresh();
    }

    paintPayoff() {
      for (const ghost of ghosts) ghost.setVisible(false);
      ribbon?.setVisible(false);
      muzzle?.setVisible(false);
      tracer?.setVisible(false);
      beam?.clearTint()?.setVisible(false);
      crownMark?.setVisible(false);
      slash?.setVisible(false);
      crackPlate?.setVisible(false);
      crack?.clear();
      marks?.clear();
      if (!skillLive) return;
      const caster = actors.find((actor) => actor.horse.number === skillFocusNumber);
      if (!caster) return;
      const kind = skillById(caster.horse.skillId).kind;
      const age = Math.max(0, wallClock - showStart - INTRO);
      const logical = getLogicalAt(caster.progress, caster.horse.number);
      const pose = projectWithCamera(logical, currentCamera);
      const backX = -pose.tangentX;
      const backY = -pose.tangentY;
      const burst = (x: number, y: number, count: number) => {
        if (sparked || age > 0.05) return;
        sparks?.explode(count, x, y);
        sparked = true;
      };
      const showGhosts = (count: number, gap: number) => {
        for (let index = 0; index < count; index += 1) {
          const ghost = ghosts[index];
          if (!ghost) continue;
          const along = (index + 1) * gap;
          const fadeScale = 1 - index * 0.05;
          ghost
            .setTexture(caster.sprite.texture.key, caster.sprite.frame.name)
            .setOrigin(caster.sprite.originX, caster.sprite.originY)
            .setFlipX(caster.sprite.flipX)
            .setPosition(caster.container.x + backX * along, caster.container.y + backY * along)
            .setScale(caster.sprite.scaleX * fadeScale, caster.sprite.scaleY * fadeScale)
            .setAlpha(0.5 - index * 0.06)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setVisible(true)
            .setDepth(caster.container.depth - 1);
        }
      };
      const layRibbon = (length: number, tint: number) => {
        ribbon
          ?.setPosition(caster.container.x + backX * length * 0.5, caster.container.y + backY * length * 0.5)
          .setRotation(Math.atan2(backY, backX))
          .setDisplaySize(length, 46)
          .setTint(tint)
          .setAlpha(0.92)
          .setVisible(true);
      };
      if (kind === "start") {
        showGhosts(6, 54);
        layRibbon(HORSE_UNIT * 6, 0xffffff);
        burst(caster.container.x + backX * 30, caster.container.y, 22);
      } else if (kind === "final-burst") {
        const along = (axis: number) => {
          const slow = axis * 140;
          const fast = axis * 340;
          return { min: Math.min(slow, fast), max: Math.max(slow, fast) };
        };
        sparks?.setParticleTint(0xff6a2a);
        sparks?.setRadial(false);
        sparks?.updateConfig({ speedX: along(pose.tangentX), speedY: along(pose.tangentY) });
        const wave = Math.floor(age / 0.08);
        if (age < 0.36 && wave < 4 && wave !== sparkWave) {
          sparkWave = wave;
          for (let step = 1; step <= 3; step += 1) {
            sparks?.explode(
              5,
              caster.container.x + pose.tangentX * (28 + 46 * step),
              caster.container.y + pose.tangentY * (28 + 46 * step),
            );
          }
        }
        sparks?.setRadial(true);
        sparks?.updateConfig({ speed: { min: 40, max: 220 } });
      } else if (kind === "recall" && marks) {
        marks.lineStyle(7, 0x7ec8ff, 0.9);
        for (let ring = 0; ring < 3; ring += 1) {
          const radius = 78 + ring * 34;
          const start = age * 2.2 + ring * 0.8;
          marks.beginPath();
          marks.arc(caster.container.x, caster.container.y, radius, start, start + 1.5, false);
          marks.strokePath();
        }
        burst(caster.container.x, caster.container.y - 20, 16);
      } else if (kind === "shot") {
        const shot = Math.floor(age / 0.08);
        const shotAge = age - shot * 0.08;
        const firing = shot < 5 && age < 0.45;
        const noseX = caster.container.x + pose.tangentX * 40;
        const noseY = caster.container.y + pose.tangentY * 40 - 24;
        const target = actors.find((actor) => actor.horse.id === caster.horse.skillTargetId);
        const aimX = target ? target.container.x : caster.container.x + pose.tangentX * HORSE_UNIT * 4;
        const aimY = target ? target.container.y : caster.container.y + pose.tangentY * HORSE_UNIT * 4;
        if (firing && shotAge < 0.05) {
          muzzle?.setPosition(noseX, noseY).setDisplaySize(HORSE_UNIT * 0.7, HORSE_UNIT * 0.7).setVisible(true);
        }
        if (firing) {
          const flight = Math.min(1, shotAge / 0.07);
          const endX = noseX + (aimX - noseX) * flight;
          const endY = noseY + (aimY - noseY) * flight;
          beam
            ?.setPosition((noseX + endX) / 2, (noseY + endY) / 2)
            .setRotation(Math.atan2(endY - noseY, endX - noseX))
            .setDisplaySize(Math.max(8, Math.hypot(endX - noseX, endY - noseY)), 8)
            .setTint(0xfff4c2)
            .setVisible(true);
          tracer?.setPosition(endX, endY).setDisplaySize(28, 28).setVisible(true);
        }
        if (firing && shot === 2 && shotAge < 0.04 && !sparked) {
          sparks?.setParticleTint(0xfff4c2);
          sparks?.explode(10, aimX, aimY);
          sparked = true;
        }
      } else if (kind === "glare") {
        const target = actors.find((actor) => actor.horse.id === caster.horse.skillTargetId);
        const reach = caster.horse.skillHit ? 1 : 0.5;
        const fromY = caster.container.y - 36;
        const aimX = target ? target.container.x : caster.container.x + pose.tangentX * HORSE_UNIT * 5;
        const aimY = target ? target.container.y : caster.container.y + pose.tangentY * HORSE_UNIT * 5;
        const endX = caster.container.x + (aimX - caster.container.x) * reach;
        const endY = fromY + (aimY - fromY) * reach;
        beam
          ?.setPosition((caster.container.x + endX) / 2, (fromY + endY) / 2)
          .setRotation(Math.atan2(endY - fromY, endX - caster.container.x))
          .setDisplaySize(Math.max(8, Math.hypot(endX - caster.container.x, endY - fromY)), 26)
          .setVisible(true);
        if (!caster.horse.skillHit && !sparked && age > 0.12) {
          sparks?.explode(12, endX, endY);
          sparked = true;
        }
      } else if (kind === "crown") {
        const target = actors.find((actor) => actor.horse.id === caster.horse.skillTargetId);
        if (caster.horse.skillHit && age < 0.22 && target) {
          slash
            ?.setPosition((caster.container.x + target.container.x) / 2, (caster.container.y + target.container.y) / 2)
            .setDisplaySize(240, 72)
            .setVisible(true);
        }
        crownMark
          ?.setPosition(caster.container.x, caster.container.y - 82)
          .setDisplaySize(56, 42)
          .setVisible(true)
          .setDepth(caster.container.depth + 4);
        showGhosts(3, 24);
        burst(caster.container.x, caster.container.y - 70, 18);
      } else if (kind === "crack" && crackPlate) {
        const camera = this.cameras.main;
        const zoomNow = camera.zoom || 1;
        const screenX = (caster.container.x - camera.scrollX - camera.width / 2) * zoomNow + camera.width / 2;
        const screenY = (caster.container.y - camera.scrollY - camera.height / 2) * zoomNow + camera.height / 2;
        const cover = Math.max(camera.width / crackPlateWidth, camera.height / crackPlateHeight) * 1.35;
        const fade = age < 0.75 ? 1 : 1 - (age - 0.75) / 0.35;
        crackPlate.setPosition(screenX, screenY).setScale(cover).setAlpha(Math.max(0, fade)).setVisible(true);
        if (age < 0.08 && crack) {
          crack.fillStyle(0xffffff, 0.72);
          crack.fillRect(0, 0, camera.width, camera.height);
        }
      }
    }


    paintGates() {
      if (!gates || !startingGate || !gateSign) return;
      const behind = started && gateOpen >= 1 && lastLeadProgress > segmentEnds().pocketEnd + 0.08;
      if (behind) {
        gates.clear();
        for (const plate of gatePlates) plate.setVisible(false);
        for (const number of gateNumbers) number.setVisible(false);
        gateSign.setVisible(false);
        return;
      }
      gates.setDepth(20);
      paintStartingGate({
        graphics: gates,
        plates: gatePlates,
        numbers: gateNumbers,
        sign: gateSign,
        gate: startingGate,
        camera: currentCamera,
      });
    }

    frameCamera(immediate: boolean) {
      const camera = this.cameras.main;
      camera.setZoom(1);
      camera.scrollX = 0;
      camera.scrollY = 0;
    }

    publishField(phase: "intro" | "countdown" | "racing", countdown: string | null) {
      const raceNow = phase === "racing" ? raceTime : 0;
      const ordered = orderByPresentation(
        actors.map((actor) => ({
          id: actor.horse.id,
          name: actor.horse.name,
          number: actor.horse.number,
          portrait: actor.horse.portrait,
          color: actor.horse.color,
          shown: actor.shown,
          finishTime: actor.horse.finishTime,
          rank: actor.horse.rank,
        })),
        raceNow,
      );
      const nextKey = ordered.map((horse) => horse.id).join(">");
      if (nextKey !== rankKey) {
        rankKey = nextKey;
        hooks.onRanks(
          ordered.map((horse, index) => ({
            id: horse.id,
            name: horse.name,
            place: index + 1,
            color: horse.color,
            portrait: horse.portrait,
          })),
        );
      }
      const phaseSig = `${phase}|${countdown ?? ""}|${nextKey}`;
      if (phaseSig === lastPhaseSig && wallClock - lastPresentationAt < 0.1) return;
      lastPhaseSig = phaseSig;
      lastPresentationAt = wallClock;
      hooks.onPresentation({
        phase,
        countdown,
        horses: ordered.map((horse, index) => ({
          id: horse.id,
          name: horse.name,
          number: horse.number,
          place: index + 1,
          portrait: horse.portrait,
          progress: horse.shown,
        })),
      });
    }
    
    publishCameraDebug() {
      const blend = cameraPresentation.blend;
      const blend01 = cameraBlendProgress(blend, wallClock);
      const stateLabel = cameraStateLabel(cameraState, lastLeadProgress);
      cameraDebugHost().__raceCamera = {
        state: stateLabel,
        from: blend?.fromName ?? null,
        to: blend?.toName ?? null,
        blend: blend01,
        duration: blend?.duration ?? 0,
        raceTime,
        wallClock,
        leadProgress: lastLeadProgress,
        settled: !blend,
      };
    }

    paintDebugOverlay() {
      if (!debugOverlay) return;
      debugOverlay.clear();
      if (cameraDebugHost().__raceDebugVisible === false) {
        debugText?.setVisible(false);
        return;
      }
      debugText?.setVisible(true);
      
      // 무리 중심 계산
      let packCenterX = 0;
      let packCenterY = 0;
      let visibleCount = 0;
      const horsePosSum = { x: 0, y: 0 };
      
      actors.forEach(actor => {
        const logical = getLogicalAt(actor.progress, actor.horse.number);
        packCenterX += logical.x;
        packCenterY += logical.y;
        horsePosSum.x += actor.container.x;
        horsePosSum.y += actor.container.y;
      });
      
      packCenterX /= actors.length;
      packCenterY /= actors.length;
      horsePosSum.x /= actors.length;
      horsePosSum.y /= actors.length;
      
      // 화면 중심 (파란 선 - 가로/세로 전체)
      const centerX = GAME_WIDTH / 2;
      const centerY = GAME_HEIGHT * 0.474;
      debugOverlay.lineStyle(2, 0x0000ff, 0.6);
      debugOverlay.lineBetween(0, centerY, GAME_WIDTH, centerY);
      debugOverlay.lineBetween(centerX, 0, centerX, GAME_HEIGHT);
      
      // 실제 말 평균 위치 (초록 십자선)
      debugOverlay.lineStyle(4, 0x00ff00, 1);
      debugOverlay.lineBetween(horsePosSum.x - 40, horsePosSum.y, horsePosSum.x + 40, horsePosSum.y);
      debugOverlay.lineBetween(horsePosSum.x, horsePosSum.y - 40, horsePosSum.x, horsePosSum.y + 40);
      
      // 각 말의 노란 점
      actors.forEach(actor => {
        const logical = getLogicalAt(actor.progress, actor.horse.number);
        const projected = projectWithCamera(logical, currentCamera);
        
        if (projected.visible && projected.x >= 0 && projected.x <= GAME_WIDTH && projected.y >= 0 && projected.y <= GAME_HEIGHT) {
          visibleCount++;
        }
        
        debugOverlay?.fillStyle(0xffff00, 1);
        debugOverlay?.fillCircle(actor.container.x, actor.container.y, 10);
      });
      
      // 텍스트 정보
      const offsetX = horsePosSum.x - centerX;
      const offsetY = horsePosSum.y - centerY;
      const blend = cameraPresentation.blend;
      const blend01 = cameraBlendProgress(blend, wallClock);
      const blendLine = blend
        ? `${blend.fromName}→${blend.toName} ${Math.round(blend01 * 100)}% (${Math.max(0, wallClock - blend.startedAt).toFixed(2)}/${blend.duration.toFixed(2)}s)`
        : "settled";
      const stateLabel = cameraStateLabel(cameraState, lastLeadProgress);
      const infoText = [
        `State: ${stateLabel}`,
        `Blend: ${blendLine}`,
        `Race: ${raceTime.toFixed(3)}s`,
        `Wall: ${wallClock.toFixed(3)}s`,
        `Pack: (${horsePosSum.x.toFixed(0)}, ${horsePosSum.y.toFixed(0)})`,
        `Offset: (${offsetX.toFixed(0)}, ${offsetY.toFixed(0)})`,
        `Logic: (${packCenterX.toFixed(0)}, ${packCenterY.toFixed(0)})`,
        `Center: (${centerX}, ${centerY.toFixed(0)})`,
        `Visible: ${visibleCount}/8`,
        `Frame: ${framingRuleFor(cameraState.name, lastLeadProgress) === "all" ? "all" : `top${cameraConfig.framing.topN}`}`,
        `Grass: ${(grassBelowRailFraction(currentCamera, actors.length) * 100).toFixed(1)}%`,
        `Margin: ${frameMargin.toFixed(1)}px`,
      ].join("\n");
      
      debugText?.setText(infoText);
      this.publishCameraDebug();
    }

    holdDebugShot() {
      const host = cameraDebugHost();
      const info = host.__raceCamera;
      const want = host.__raceCameraWant;
      if (!info || !want || host.__cameraFreeze) return;
      if (info.from === want.from && info.to === want.to && info.duration > 0 && info.blend >= 0.5) {
        host.__cameraFreeze = true;
        host.__raceCameraFrozen = { ...info };
      }
    }
  }

  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#3F4630",
    callbacks: {
      postBoot: (booted) => {
        booted.canvas.style.opacity = "0";
      },
    },
    scene: RaceScene,
    render: {
      mipmapFilter: "LINEAR_MIPMAP_LINEAR",
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
    },
    banner: false,
  });
  cameraDebugHost().__raceGame = game;
  return game;
}
