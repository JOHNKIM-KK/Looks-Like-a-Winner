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
import { LANE_GAP, cutPose, laneRadius, renderLane, viewBounds, projectWithCamera, sampleRadiusLogical, sampleChuteLogical, projectLogicalPoints, goalLineLogical, type TrackPose } from "@/game/track";
import {
  createInitialState,
  nextCameraState,
  getCameraForState,
  shouldScaleHorseInCorner,
  type CameraState,
  type RaceSnapshot,
} from "@/game/cameraState";

const FRAME_WIDTH = 213;
const FRAME_HEIGHT = 211;
const HORSE_HEIGHT = 96;
const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;
const HELMETS = [
  { x: 136, y: 43 },
  { x: 137, y: 42 },
  { x: 132, y: 41 },
  { x: 129, y: 42 },
  { x: 129, y: 45 },
  { x: 126, y: 45 },
];

const SILKS = [
  "/horses/silk-red.png",
  "/horses/silk-teal.png",
  "/horses/silk-gold.png",
  "/horses/silk-violet.png",
];

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
  onComplete: () => void;
};

type Actor = {
  horse: RaceHorse;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  face: Phaser.GameObjects.Image;
  lines: Phaser.GameObjects.Graphics;
  dust: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Graphics;
  shadow: Phaser.GameObjects.Ellipse;
  number: Phaser.GameObjects.Text;
  stamp: Phaser.GameObjects.Text;
  progress: number;
  shown: number;
};

function sheetFor(horse: RaceHorse) {
  return SILKS[(horse.number - 1) % SILKS.length] ?? SILKS[0];
}

function getLogicalAt(progress: number, lane: number) {
  const STRAIGHT = 1712;
  const INNER_RADIUS = 256;
  const LANE_GAP = 58;
  const CHUTE = 158;
  const STRAIGHT_BACK = 1418;
  const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;
  const GOAL_ALONG = 0.920;
  
  const radius = laneRadius(lane);
  const halfBack = STRAIGHT_BACK / 2;
  const halfHome = STRAIGHT / 2;
  const corner = Math.PI * radius;
  const total = CHUTE + STRAIGHT_BACK + Math.PI * REFERENCE_RADIUS + GOAL_ALONG * STRAIGHT;
  let cursor = Math.max(0, progress * total);
  
  if (cursor <= CHUTE) {
    const x = halfBack + CHUTE - cursor;
    const y = -radius;
    return { x, y, tx: -1, ty: 0 };
  }
  cursor -= CHUTE;
  
  if (cursor <= STRAIGHT_BACK) {
    const x = halfBack - cursor;
    const y = -radius;
    return { x, y, tx: -1, ty: 0 };
  }
  cursor -= STRAIGHT_BACK;
  
  if (cursor <= corner) {
    const theta = -Math.PI / 2 + cursor / radius;
    return {
      x: -halfHome + Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      tx: -Math.sin(theta),
      ty: Math.cos(theta),
    };
  }
  cursor -= corner;
  
  if (cursor <= GOAL_ALONG * STRAIGHT) {
    const x = -halfHome + cursor;
    const y = radius;
    return { x, y, tx: 1, ty: 0 };
  }
  
  const theta = Math.PI / 2 + (cursor - GOAL_ALONG * STRAIGHT) / radius;
  return {
    x: halfHome + Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    tx: -Math.sin(theta),
    ty: Math.cos(theta),
  };
}

const COUNT_STEP = 0.8;
const SKILL_LEAD = 0.1;

export function createRaceGame(parent: HTMLElement, race: RaceResult, hooks: Hooks) {
  const actors: Actor[] = [];
  const bounds = viewBounds(race.horses.length);
  let raceTime = 0;
  let wallClock = 0;
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
  let lastComment = "";
  let countdownText: Phaser.GameObjects.Text | null = null;
  let gates: Phaser.GameObjects.Graphics | null = null;
  let debugOverlay: Phaser.GameObjects.Graphics | null = null;
  let debugText: Phaser.GameObjects.Text | null = null;
  const fired = new Set<number>();
  const releasedSkills = new Set<number>();
  const cutinQueue: SkillCutin[] = [];
  let cameraState: CameraState = createInitialState();
  let currentCamera = getCameraForState(cameraState, {
    raceTime: 0,
    started: false,
    gateOpen: 0,
    leadProgress: 0,
    horses: [],
  }, 0, 0);
  
  const DEBUG_ENABLED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

  const outerLane = Math.max(1, race.horses.length);
  const trackOuterLogical = sampleRadiusLogical(laneRadius(outerLane) + 28, 140);
  const trackInnerLogical = sampleRadiusLogical(Math.max(70, laneRadius(1) - 34), 140);
  const railOutLogical = trackOuterLogical;
  const railInLogical = trackInnerLogical;
  const chuteOuterLogical = sampleChuteLogical(laneRadius(outerLane) + 28, 24);
  const chuteInnerLogical = sampleChuteLogical(Math.max(70, laneRadius(1) - 34), 24);
  const crowdLogical = sampleRadiusLogical(laneRadius(outerLane) + 78, 90);
  const goalInnerLogical = goalLineLogical(1);
  const goalOuterLogical = goalLineLogical(outerLane);
  let track: Phaser.GameObjects.Graphics | null = null;

  class RaceScene extends Phaser.Scene {
    constructor() {
      super("race");
    }

    preload() {
      for (const horse of race.horses) {
        this.load.spritesheet(horse.id, sheetFor(horse), {
          frameWidth: FRAME_WIDTH,
          frameHeight: FRAME_HEIGHT,
        });
        this.load.image(`portrait-${horse.id}`, horse.portrait);
      }
      this.load.image("crack-plate", "/fx/screen-crack.jpg");
    }

    create() {
      this.cameras.main.setBackgroundColor("#145c34");
      track = this.add.graphics().setDepth(1);

      for (const horse of race.horses) {
        const key = `gallop-${horse.id}`;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(horse.id, { start: 0, end: 5 }),
          frameRate: 10,
          repeat: -1,
        });

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

        const sprite = this.add.sprite(0, 0, horse.id, 0).setOrigin(0.5, 0.9);
        sprite.play(key);
        const faceKey = this.textures.exists(`face-${horse.id}`) ? `face-${horse.id}` : `portrait-${horse.id}`;
        const face = this.add.image(0, 0, faceKey).setDisplaySize(52, 52);
        const lines = this.add.graphics();
        const dust = this.add.graphics();
        const body = this.add.graphics();
        const shadow = this.add.ellipse(6, -2, 168, 28, 0x3a2414, 0.32);
        const number = this.add
          .text(24, -78, String(horse.number), {
            fontFamily: "sans-serif",
            fontSize: "22px",
            color: "#fffaf2",
            fontStyle: "bold",
            stroke: "#24180f",
            strokeThickness: 4,
          })
          .setOrigin(0.5);
        const name = this.add
          .text(0, -FRAME_HEIGHT * 0.72, horse.name, {
            fontFamily: "Apple SD Gothic Neo, sans-serif",
            fontSize: "16px",
            color: "#24180f",
            stroke: "#fff8ea",
            strokeThickness: 5,
          })
          .setOrigin(0.5, 1);
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
        container.add([shadow, dust, lines, body, sprite, face, number, name, stamp]);
        container.setScale(HORSE_HEIGHT / FRAME_HEIGHT);
        actors.push({ horse, container, sprite, face, lines, dust, body, shadow, number, stamp, progress: 0, shown: 0 });
      }
      this.paintFxTextures();

      for (let index = 0; index < 6; index += 1) {
        ghosts.push(this.add.image(0, 0, race.horses[0]?.id ?? "").setVisible(false).setDepth(3400));
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
      cutPath = this.add.graphics().setDepth(4);
      brakeSkid = this.add.graphics().setDepth(3);
      brakeHaze = this.add.graphics().setDepth(30);
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

      gates = this.add.graphics().setDepth(2);
      debugOverlay = this.add.graphics().setDepth(10000);
      debugText = this.add.text(10, 10, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffff00',
        backgroundColor: '#000000dd',
        padding: { x: 10, y: 10 },
      }).setDepth(10001).setVisible(DEBUG_ENABLED).setScrollFactor(0);
      countdownText = this.add
        .text(this.cameras.main.width / 2, this.cameras.main.height / 2, "3", {
          fontFamily: "sans-serif",
          fontSize: "112px",
          color: "#fffaf2",
          fontStyle: "bold",
          stroke: "#24180f",
          strokeThickness: 12,
        })
        .setScrollFactor(0)
        .setOrigin(0.5)
        .setDepth(5000);
      lastComment = "게이트 앞에서 대기 중입니다.";
      hooks.onComment(lastComment);
      this.paintGates();
      this.placeHorses();
      this.frameCamera(true);
      this.publishRanks();
    }

    update(_time: number, delta: number) {
      const wall = Math.min(delta, 40) / 1000;
      wallClock += wall;
      if (!started) {
        const step = Math.min(2, Math.floor(wallClock / COUNT_STEP));
        const label = ["3", "2", "1"][step] ?? "1";
        const camera = this.cameras.main;
        countdownText?.setText(label).setPosition(camera.width / 2, camera.height * 0.42);
        if (wallClock < COUNT_STEP * 3) {
          raceTime = 0;
          this.paintTrack();
          this.paintGates();
          this.placeHorses();
          this.publishRanks();
          this.frameCamera(false);
          if (DEBUG_ENABLED) {
            this.paintDebugOverlay();
          }
          return;
        }
        started = true;
        playBang();
        countdownText?.setVisible(false);
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

      this.paintTrack();
      this.paintGates();
      this.placeHorses();
      this.publishRanks();
      this.frameCamera(false);
      
      if (DEBUG_ENABLED) {
        this.paintDebugOverlay();
      }

      if (!finished && raceTime >= race.duration) {
        finished = true;
        hooks.onCutin(null);
        hooks.onComplete();
      }
    }

    paintTrack() {
      if (!track) return;
      track.clear();

      const trackOuter = projectLogicalPoints(trackOuterLogical, currentCamera);
      const trackInner = projectLogicalPoints(trackInnerLogical, currentCamera);
      const railOut = projectLogicalPoints(railOutLogical, currentCamera);
      const railIn = projectLogicalPoints(railInLogical, currentCamera);

      // Always render, Phaser will clip at canvas bounds
      track.fillStyle(0xc4a06a, 1);
      track.beginPath();
      if (trackOuter[0]) track.moveTo(trackOuter[0].x, trackOuter[0].y);
      for (const point of trackOuter) {
        if (point) track.lineTo(point.x, point.y);
      }
      track.closePath();
      track.fillPath();

      track.fillStyle(0x176b3c, 1);
      track.beginPath();
      if (trackInner[0]) track.moveTo(trackInner[0].x, trackInner[0].y);
      for (const point of trackInner) {
        if (point) track.lineTo(point.x, point.y);
      }
      track.closePath();
      track.fillPath();

      track.lineStyle(5, 0xf7f4ee, 1);
      track.beginPath();
      if (railOut[0]) track.moveTo(railOut[0].x, railOut[0].y);
      for (const point of railOut) {
        if (point) track.lineTo(point.x, point.y);
      }
      track.closePath();
      track.strokePath();
      
      track.beginPath();
      if (railIn[0]) track.moveTo(railIn[0].x, railIn[0].y);
      for (const point of railIn) {
        if (point) track.lineTo(point.x, point.y);
      }
      track.closePath();
      track.strokePath();

      const chuteOuter = projectLogicalPoints(chuteOuterLogical, currentCamera);
      const chuteInner = projectLogicalPoints(chuteInnerLogical, currentCamera);
      
      if (chuteOuter.length > 1 && chuteInner.length > 1 && chuteOuter[0] && chuteInner[0]) {
        track.fillStyle(0xc4a06a, 1);
        track.beginPath();
        track.moveTo(chuteOuter[0].x, chuteOuter[0].y);
        for (let i = 1; i < chuteOuter.length; i++) {
          const point = chuteOuter[i];
          if (point) track.lineTo(point.x, point.y);
        }
        for (let i = chuteInner.length - 1; i >= 0; i--) {
          const point = chuteInner[i];
          if (point) track.lineTo(point.x, point.y);
        }
        track.closePath();
        track.fillPath();
        
        track.lineStyle(5, 0xf7f4ee, 1);
        track.beginPath();
        track.moveTo(chuteOuter[0].x, chuteOuter[0].y);
        for (let i = 1; i < chuteOuter.length; i++) {
          const point = chuteOuter[i];
          if (point) track.lineTo(point.x, point.y);
        }
        track.strokePath();
        
        track.beginPath();
        track.moveTo(chuteInner[0].x, chuteInner[0].y);
        for (let i = 1; i < chuteInner.length; i++) {
          const point = chuteInner[i];
          if (point) track.lineTo(point.x, point.y);
        }
        track.strokePath();
      }

      const heads = [0xe23b3b, 0xf0c14d, 0x1f8a84, 0x7c5cbf, 0xf6f1e7, 0x2a6f9a, 0xc47a4a];
      const crowd = projectLogicalPoints(crowdLogical, currentCamera);
      crowd.forEach((point, index) => {
        if (point.visible && track) {
          track.fillStyle(heads[index % heads.length] ?? 0xf6f1e7, 1);
          track.fillCircle(point.x, point.y, 7 * point.scale);
        }
      });

      const goalInner = projectWithCamera({ x: goalInnerLogical.x, y: goalInnerLogical.y, tx: 0, ty: 0 }, currentCamera);
      const goalOuter = projectWithCamera({ x: goalOuterLogical.x, y: goalOuterLogical.y, tx: 0, ty: 0 }, currentCamera);
      if (goalInner.visible && goalOuter.visible && track) {
        const steps = 12;
        for (let index = 0; index < steps; index += 1) {
          const from = index / steps;
          const to = (index + 1) / steps;
          track.lineStyle(12, index % 2 === 0 ? 0x161616 : 0xf7f7f7, 1);
          track.lineBetween(
            goalInner.x + (goalOuter.x - goalInner.x) * from,
            goalInner.y + (goalOuter.y - goalInner.y) * from,
            goalInner.x + (goalOuter.x - goalInner.x) * to,
            goalInner.y + (goalOuter.y - goalInner.y) * to,
          );
        }
        if (track) {
          track.fillStyle(0xc62828, 1);
          track.fillCircle(goalInner.x, goalInner.y, 11);
          track.fillCircle(goalOuter.x, goalOuter.y, 11);
        }
      }
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

      cameraState = nextCameraState(cameraState, snapshot);

      const sortedByProgress = [...actors].sort((a, b) => {
        const aProgress = progressAt(a.horse.samples, raceTime);
        const bProgress = progressAt(b.horse.samples, raceTime);
        return bProgress - aProgress;
      });
      const leadCount = actors.length;
      let packCenterX = 0;
      let packCenterY = 0;
      for (let i = 0; i < leadCount; i += 1) {
        const actor = sortedByProgress[i];
        if (actor) {
          const displayLane = renderLane(actor.horse.number, progressAt(actor.horse.samples, raceTime), race.seed);
          const logical = getLogicalAt(progressAt(actor.horse.samples, raceTime), displayLane);
          packCenterX += logical.x;
          packCenterY += logical.y;
        }
      }
      packCenterX /= leadCount;
      packCenterY /= leadCount;

      currentCamera = getCameraForState(cameraState, snapshot, packCenterX, packCenterY);

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
        
        const logicalFromLoop = (progress: number, lane: number) => {
          const radius = laneRadius(lane);
          const STRAIGHT = 1712;
          const INNER_RADIUS = 256;
          const LANE_GAP = 58;
          const CHUTE = 158;
          const STRAIGHT_BACK = 1418;
          const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;
          const GOAL_ALONG = 0.920;
          
          const halfBack = STRAIGHT_BACK / 2;
          const halfHome = STRAIGHT / 2;
          const corner = Math.PI * radius;
          const total = CHUTE + STRAIGHT_BACK + Math.PI * REFERENCE_RADIUS + GOAL_ALONG * STRAIGHT;
          let cursor = Math.max(0, progress * total);
          
          if (cursor <= CHUTE) {
            return { x: halfBack + CHUTE - cursor, y: -radius, tx: -1, ty: 0 };
          }
          cursor -= CHUTE;
          
          if (cursor <= STRAIGHT_BACK) {
            return { x: halfBack - cursor, y: -radius, tx: -1, ty: 0 };
          }
          cursor -= STRAIGHT_BACK;
          
          if (cursor <= corner) {
            const theta = -Math.PI / 2 + cursor / radius;
            return {
              x: -halfHome + Math.cos(theta) * radius,
              y: Math.sin(theta) * radius,
              tx: -Math.sin(theta),
              ty: Math.cos(theta),
            };
          }
          cursor -= corner;
          
          if (cursor <= GOAL_ALONG * STRAIGHT) {
            return { x: -halfHome + cursor, y: radius, tx: 1, ty: 0 };
          }
          
          const theta = Math.PI / 2 + (cursor - GOAL_ALONG * STRAIGHT) / radius;
          return {
            x: halfHome + Math.cos(theta) * radius,
            y: Math.sin(theta) * radius,
            tx: -Math.sin(theta),
            ty: Math.cos(theta),
          };
        };

        const logical = logicalFromLoop(actor.progress, displayLane);
        let pose = projectWithCamera(logical, currentCamera);
        
        if (cutting) {
          const cutFrom = logicalFromLoop(actor.horse.cutFrom, displayLane);
          const cutTo = logicalFromLoop(actor.horse.cutTo, displayLane);
          const cutLogical = {
            x: cutFrom.x + (cutTo.x - cutFrom.x) * cutBlend,
            y: cutFrom.y + (cutTo.y - cutFrom.y) * cutBlend,
            tx: cutFrom.tx + (cutTo.tx - cutFrom.tx) * cutBlend,
            ty: cutFrom.ty + (cutTo.ty - cutFrom.ty) * cutBlend,
          };
          pose = projectWithCamera(cutLogical, currentCamera);
        } else if (swapping) {
          const blend = swapBlend;
          const previous = logicalFromLoop(actor.horse.swapFrom, displayLane);
          const swapLogical = {
            x: previous.x + (logical.x - previous.x) * blend,
            y: previous.y + (logical.y - previous.y) * blend,
            tx: previous.tx + (logical.tx - previous.tx) * blend,
            ty: previous.ty + (logical.ty - previous.ty) * blend,
          };
          pose = projectWithCamera(swapLogical, currentCamera);
        }
        
        actor.container.setVisible(pose.visible);
        if (!pose.visible) continue;
        
        actor.container.setPosition(pose.x, pose.y);
        if (castingNow && kind === "final-burst" && payoffAge < 0.35) {
          const lunge = Math.sin((payoffAge / 0.35) * Math.PI) * 52;
          actor.container.x += pose.tangentX * lunge;
          actor.container.y += pose.tangentY * lunge;
        }
        const ahead = !started ? 0 : actor.progress >= 1 ? progressAt(actor.horse.samples, raceTime + 0.2) - actor.progress : 1;
        const braking = actor.progress >= 1;
        const pull = !started ? 0 : braking ? Math.max(0, Math.min(1, ahead / 0.003)) : 1;
        const brakeLean = braking ? Math.sin((1 - pull) * Math.PI) * 20 : 0;
        actor.container.setAngle(pose.lean + brakeLean * (pose.flipX ? 1 : -1));
        const punch = castingNow && kind === "start" && payoffAge < 0.08 ? 1.08 : 1;
        
        const inCornerCloseup = cameraState.name === "CLOSEUP" && 
                               cameraState.closeupHorseIndex === (actor.horse.number - 1) &&
                               shouldScaleHorseInCorner(cameraState);
        const closeupScale = inCornerCloseup ? 1.15 : 1;
        
        actor.container.setScale((HORSE_HEIGHT / FRAME_HEIGHT) * pose.scale * punch * closeupScale);
        actor.container.setDepth(pose.y);
        const footAge = raceTime - actor.horse.footFrom;
        const sucking = onFoot && footAge >= 0 && footAge < 0.4;
        actor.sprite.setVisible(!onFoot || sucking);
        actor.shadow.setVisible(!onFoot);
        actor.sprite.setScale(pose.flipX ? -1 : 1, 1);
        const recoil = castingNow && kind === "shot" && payoffAge < 0.45 && payoffAge % 0.08 < 0.05;
        actor.sprite.setX(recoil ? (pose.flipX ? 14 : -14) : 0);
        actor.sprite.setY(sucking ? (-footAge / 0.4) * 420 : 0);
        actor.sprite.setAlpha(sucking ? 1 - footAge / 0.4 : 1);
        actor.face.setAlpha(sucking ? 1 - footAge / 0.4 : 1);
        const stumbling = raceTime >= actor.horse.slowFrom && raceTime < actor.horse.slowUntil;
        const flash =
          (stopped && raceTime - actor.horse.stopFrom < 0.15) ||
          (stumbling && raceTime - actor.horse.slowFrom < 0.15);
        if (flash) actor.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        else actor.sprite.clearTint();
        actor.sprite.setAngle(missed || stopped || stumbling ? Math.sin(raceTime * 26) * 8 : 0);
        actor.sprite.anims.timeScale = !started
          ? 0
          : braking
          ? pull
          : onFoot
            ? 0.55
            : casting && (kind === "start" || kind === "final-burst")
              ? 1.9
              : 1;
        actor.body.clear();
        actor.lines.clear();
        actor.dust.clear();
        const dir = pose.flipX ? 1 : -1;
        const puff = (raceTime * 10 + actor.horse.number) % 1;
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
        } else {
          const frame = actor.sprite.anims.currentFrame?.index ?? 0;
          const helmet = HELMETS[frame] ?? HELMETS[0];
          actor.face.setDisplaySize(52, 52);
          actor.face.setPosition((pose.flipX ? -1 : 1) * (helmet.x - FRAME_WIDTH * 0.5), helmet.y - FRAME_HEIGHT * 0.9);
          if (!braking && pull > 0.15) {
            actor.dust.fillStyle(0xf6ead2, 0.7);
            actor.dust.fillCircle(dir * (36 + puff * 34), -4, 7 - puff * 5);
            actor.dust.fillCircle(dir * (58 + puff * 20), -1, 4);
          }
        }
        actor.number.setX((pose.flipX ? -1 : 1) * 24);
        if (castingNow && kind === "jaywalk" && !actor.horse.skillHit) {
          actor.sprite.setAngle(Math.sin(payoffAge * 30) * 18);
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
        const points: TrackPose[] = [];
        for (let step = 0; step <= 16; step += 1) {
          points.push(cutPose(horse.cutFrom, horse.cutTo, horse.number, step / 16));
        }
        const stroke = (width: number, color: number, alpha: number) => {
          cutPath?.lineStyle(width, color, alpha * fade);
          const first = points[0];
          if (!first) return;
          cutPath?.beginPath();
          cutPath?.moveTo(first.x, first.y);
          for (const point of points) cutPath?.lineTo(point.x, point.y);
          cutPath?.strokePath();
        };
        stroke(46, 0x2f6b3a, 0.95);
        stroke(24, 0xe7d7a8, 1);
        cutPath.lineStyle(8, 0xcbb98a, 0.9 * fade);
        for (let index = 1; index < points.length - 1; index += 2) {
          const point = points[index];
          if (!point) continue;
          cutPath.lineBetween(point.x - point.tangentY * 16, point.y + point.tangentX * 16, point.x + point.tangentY * 16, point.y - point.tangentX * 16);
        }
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
      const frame = caster.sprite.frame.name;
      const horseScale = HORSE_HEIGHT / FRAME_HEIGHT;
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
          ghost
            .setTexture(caster.horse.id, frame)
            .setPosition(caster.container.x + backX * along, caster.container.y + backY * along)
            .setScale(horseScale * (pose.flipX ? -1 : 1) * (1 - index * 0.05), horseScale)
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
      if (!gates) return;
      gates.clear();
      const lanes = race.horses.length;
      
      for (let lane = 0; lane <= lanes; lane += 1) {
        const radius = laneRadius(1) - LANE_GAP / 2 + lane * LANE_GAP;
        const leftLogical = { x: 709 + 158, y: -radius, tx: -1, ty: 0 };
        
        const post = projectWithCamera(leftLogical, currentCamera);
        if (!post.visible) continue;
        
        if (lane < lanes) {
          const rightRadius = laneRadius(1) - LANE_GAP / 2 + (lane + 1) * LANE_GAP;
          const rightPost = projectWithCamera({ x: 709 + 158, y: -rightRadius, tx: -1, ty: 0 }, currentCamera);
          
          if (rightPost.visible) {
            const back = 84;
            const front = 34;
            
            const lx = post.x + post.tangentX * back;
            const ly = post.y + post.tangentY * back;
            const rx = rightPost.x + rightPost.tangentX * back;
            const ry = rightPost.y + rightPost.tangentY * back;
            const lfx = post.x - post.tangentX * front;
            const lfy = post.y - post.tangentY * front;
            const rfx = rightPost.x - rightPost.tangentX * front;
            const rfy = rightPost.y - rightPost.tangentY * front;
            
            gates.setDepth(!started || gateOpen < 0.85 ? 4000 : 2);
            gates.fillStyle(0x8a6239, 1);
            gates.fillCircle(lx, ly, 7);
            gates.fillCircle(rx, ry, 7);
            gates.lineStyle(7, 0x5c3b22, 1);
            gates.lineBetween(lx, ly, lfx, lfy);
            gates.lineBetween(rx, ry, rfx, rfy);
            gates.lineBetween(lx, ly, rx, ry);
            
            const mx = (lfx + rfx) / 2;
            const my = (lfy + rfy) / 2;
            const swing = gateOpen * 1.35;
            const turn = (dx: number, dy: number, angle: number) => ({
              x: dx * Math.cos(angle) - dy * Math.sin(angle),
              y: dx * Math.sin(angle) + dy * Math.cos(angle),
            });
            const leftDoor = turn(mx - lfx, my - lfy, -swing);
            const rightDoor = turn(mx - rfx, my - rfy, swing);
            gates.lineStyle(8, 0xf4f1ea, 1);
            gates.lineBetween(lfx, lfy, lfx + leftDoor.x, lfy + leftDoor.y);
            gates.lineBetween(rfx, rfy, rfx + rightDoor.x, rfy + rightDoor.y);
          }
        }
      }
    }

    frameCamera(immediate: boolean) {
      const camera = this.cameras.main;
      camera.setZoom(1);
      camera.scrollX = 0;
      camera.scrollY = 0;
    }

    publishRanks() {
      const finished = (actor: Actor) => raceTime + 0.0001 >= actor.horse.finishTime;
      const ordered = [...actors].sort((a, b) => {
        const aDone = finished(a);
        const bDone = finished(b);
        if (aDone && bDone) return a.horse.rank - b.horse.rank;
        if (aDone !== bDone) return aDone ? -1 : 1;
        return b.shown - a.shown || a.horse.number - b.horse.number;
      });
      const nextKey = ordered.map((actor) => actor.horse.id).join(">");
      if (nextKey === rankKey) return;
      rankKey = nextKey;
      hooks.onRanks(
        ordered.map((actor, index) => ({
          id: actor.horse.id,
          name: actor.horse.name,
          place: index + 1,
          color: actor.horse.color,
          portrait: actor.horse.portrait,
        })),
      );
    }
    
    paintDebugOverlay() {
      if (!debugOverlay) return;
      debugOverlay.clear();
      
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
      const infoText = [
        `State: ${cameraState.name}`,
        `Pack: (${horsePosSum.x.toFixed(0)}, ${horsePosSum.y.toFixed(0)})`,
        `Offset: (${offsetX.toFixed(0)}, ${offsetY.toFixed(0)})`,
        `Logic: (${packCenterX.toFixed(0)}, ${packCenterY.toFixed(0)})`,
        `Center: (${centerX}, ${centerY.toFixed(0)})`,
        `Visible: ${visibleCount}/8`,
      ].join("\n");
      
      debugText?.setText(infoText);
    }
  }

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#145c34",
    scene: RaceScene,
    scale: { 
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
    },
    banner: false,
  });
}
