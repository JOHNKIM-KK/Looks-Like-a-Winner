"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RaceResult as RaceData } from "@/lib/race";
import type { RaceGameHandle } from "@/game/createRaceGame";
import { introLine } from "@/game/droneIntro";
import type { RaceOverlaySnapshot } from "@/game/overlayLayout";
import { RaceOverlay } from "@/components/RaceOverlay";
import { RaceResult } from "@/components/RaceResult";
import { RotatePrompt } from "@/components/RotatePrompt";
import { StageLoading } from "@/components/StageLoading";
import { TitleScreen } from "@/components/TitleScreen";
import { SAFE_AREA_PADDING, useStage } from "@/components/useStage";

type Props = {
  race: RaceData;
  started: boolean;
  finished: boolean;
  onStart: () => void;
  onComplete: () => void;
  onRematch: () => void;
  onExit: () => void;
};

const EMPTY_OVERLAY: RaceOverlaySnapshot = {
  phase: "intro",
  countdown: null,
  horses: [],
};

export function RaceGame({ race, started, finished, onStart, onComplete, onRematch, onExit }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<RaceGameHandle | null>(null);
  const stage = useStage(shellRef);
  const stageRef = useRef(stage);
  const startedRef = useRef(started);
  const onCompleteRef = useRef(onComplete);
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [comment, setComment] = useState(() => introLine(0));
  const [overlay, setOverlay] = useState<RaceOverlaySnapshot>(EMPTY_OVERLAY);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useLayoutEffect(() => {
    stageRef.current = stage;
    if (stage) gameRef.current?.setStage(stage);
  }, [stage]);

  useEffect(() => {
    startedRef.current = started;
    if (started) gameRef.current?.start();
  }, [started]);

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
      {ready && stage?.kind === "landscape" && !started ? <TitleScreen stage={stage} onStart={onStart} /> : null}
      {ready && stage?.kind === "landscape" && started ? (
        <RaceOverlay
          stage={stage}
          snapshot={overlay}
          comment={comment}
          results={finished ? <RaceResult race={race} hudHeight={stage.hud.height} onRematch={onRematch} onExit={onExit} /> : null}
        />
      ) : null}
      {stage?.kind === "portrait" ? <RotatePrompt /> : null}
    </div>
  );
}
