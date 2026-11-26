"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HorseInput, RaceResult as RaceData } from "@/lib/race";
import type { EntrantPhase } from "@/lib/entrantSetup";
import type { RaceGameHandle } from "@/game/createRaceGame";
import { introLine } from "@/game/droneIntro";
import type { RaceOverlaySnapshot } from "@/game/overlayLayout";
import { perfOverlayRequested, startPerfOverlay } from "@/lib/perfOverlay";
import { LineupScreen } from "@/components/LineupScreen";
import { RaceOverlay } from "@/components/RaceOverlay";
import { RotatePrompt } from "@/components/RotatePrompt";
import { SetupScreen } from "@/components/SetupScreen";
import { StageLoading } from "@/components/StageLoading";
import { TitleScreen } from "@/components/TitleScreen";
import { SAFE_AREA_PADDING, useStage } from "@/components/useStage";

type Props = {
  race: RaceData;
  phase: EntrantPhase;
  names: readonly string[];
  issue: string | null;
  notice: string | null;
  recent: readonly string[] | null;
  horses: readonly HorseInput[];
  onOpenSetup: () => void;
  onStep: (delta: number) => void;
  onName: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onLoadRecent: () => void;
  onConfirmSetup: () => void;
  onStartRace: () => void;
  onComplete: () => void;
  onRematch: () => void;
  onChangeSettings: () => void;
};

const EMPTY_OVERLAY: RaceOverlaySnapshot = {
  phase: "intro",
  countdown: null,
  horses: [],
  finishBoard: null,
};

export function RaceGame({
  race,
  phase,
  names,
  issue,
  notice,
  recent,
  horses,
  onOpenSetup,
  onStep,
  onName,
  onRemove,
  onLoadRecent,
  onConfirmSetup,
  onStartRace,
  onComplete,
  onRematch,
  onChangeSettings,
}: Props) {
  const live = phase === "racing" || phase === "done";
  const openedPortrait = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<RaceGameHandle | null>(null);
  const stage = useStage(shellRef);
  const stageRef = useRef(stage);
  const startedRef = useRef(live);
  const onCompleteRef = useRef(onComplete);
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [comment, setComment] = useState(() => introLine(0));
  const [overlay, setOverlay] = useState<RaceOverlaySnapshot>(EMPTY_OVERLAY);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!perfOverlayRequested(window.location.search)) return;
    return startPerfOverlay();
  }, []);

  useLayoutEffect(() => {
    stageRef.current = stage;
    if (stage) gameRef.current?.setStage(stage);
  }, [stage]);

  useLayoutEffect(() => {
    if (openedPortrait.current || !ready || stage?.kind !== "portrait" || phase !== "title") return;
    openedPortrait.current = true;
    onOpenSetup();
  }, [ready, stage, phase, onOpenSetup]);

  useEffect(() => {
    startedRef.current = live;
    if (live) gameRef.current?.start();
  }, [live]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;

    void import("@/game/createRaceGame").then(({ createRaceGame }) => {
      if (dead || !hostRef.current) return;
      const game = createRaceGame(hostRef.current, race, {
        onComment: setComment,
        // Skill cut-ins stay in the Phaser scene. The overlay slot is empty.
        onCutin: () => {},
        onPresentation: setOverlay,
        onComplete: () => onCompleteRef.current(),
        onLoadProgress: setLoaded,
        onReady: () => setReady(true),
      });
      gameRef.current = game;
      if (stageRef.current) game.setStage(stageRef.current);
      if (startedRef.current) game.start();
    });

    return () => {
      dead = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [race]);

  return (
    <div ref={shellRef} className="fixed inset-0 z-50 overflow-hidden bg-[#C9A25E]" style={SAFE_AREA_PADDING}>
      <div ref={hostRef} className="absolute inset-0" />
      {!ready ? <StageLoading progress={loaded} /> : null}
      {ready && stage?.kind === "landscape" && phase === "title" ? <TitleScreen stage={stage} onStart={onOpenSetup} /> : null}
      {ready && phase === "setup" ? (
        <SetupScreen
          names={names}
          issue={issue}
          notice={notice}
          recent={recent}
          onStep={onStep}
          onName={onName}
          onRemove={onRemove}
          onLoadRecent={onLoadRecent}
          onStart={onConfirmSetup}
        />
      ) : null}
      {ready && phase === "lineup" ? <LineupScreen horses={horses} onStart={onStartRace} /> : null}
      {ready && stage?.kind === "landscape" && live ? (
        <RaceOverlay
          stage={stage}
          snapshot={overlay}
          comment={comment}
          finished={phase === "done"}
          onRematch={onRematch}
          onChangeSettings={onChangeSettings}
        />
      ) : null}
      {stage?.kind === "portrait" && live ? <RotatePrompt /> : null}
    </div>
  );
}
