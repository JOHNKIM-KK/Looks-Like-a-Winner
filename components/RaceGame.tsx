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
  horses: readonly HorseInput[];
  onOpenSetup: () => void;
  onStep: (delta: number) => void;
  onName: (index: number, value: string) => void;
  onLoadRecent: () => void;
  onShuffleSetup: () => void;
  onConfirmSetup: () => void;
  onShuffleLineup: () => void;
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
  horses,
  onOpenSetup,
  onStep,
  onName,
  onLoadRecent,
  onShuffleSetup,
  onConfirmSetup,
  onShuffleLineup,
  onStartRace,
  onComplete,
  onRematch,
  onChangeSettings,
}: Props) {
  const live = phase === "racing" || phase === "done";
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
      {ready && stage?.kind === "landscape" && phase === "setup" ? (
        <SetupScreen
          stage={stage}
          names={names}
          issue={issue}
          notice={notice}
          onStep={onStep}
          onName={onName}
          onLoadRecent={onLoadRecent}
          onShuffle={onShuffleSetup}
          onStart={onConfirmSetup}
        />
      ) : null}
      {ready && stage?.kind === "landscape" && phase === "lineup" ? (
        <LineupScreen stage={stage} horses={horses} onShuffle={onShuffleLineup} onStart={onStartRace} />
      ) : null}
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
      {stage?.kind === "portrait" ? <RotatePrompt /> : null}
    </div>
  );
}
