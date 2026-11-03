"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RaceResult as RaceData } from "@/lib/race";
import type { RaceGameHandle } from "@/game/createRaceGame";
import type { RaceOverlaySnapshot } from "@/game/overlayLayout";
import { rankSlotModeFromSearch, type RankSlotMode } from "@/game/rankDisplay";
import { RaceOverlay } from "@/components/RaceOverlay";
import { RaceResult } from "@/components/RaceResult";
import { RotatePrompt } from "@/components/RotatePrompt";
import { SAFE_AREA_PADDING, useStage } from "@/components/useStage";

type Props = {
  race: RaceData;
  finished: boolean;
  onComplete: () => void;
  onRematch: () => void;
  onExit: () => void;
};

const EMPTY_OVERLAY: RaceOverlaySnapshot = {
  phase: "countdown",
  countdown: "3",
  horses: [],
};

export function RaceGame({ race, finished, onComplete, onRematch, onExit }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<RaceGameHandle | null>(null);
  const stage = useStage(shellRef);
  const stageRef = useRef(stage);
  const onCompleteRef = useRef(onComplete);
  const [comment, setComment] = useState("게이트 앞에서 대기 중입니다.");
  const [overlay, setOverlay] = useState<RaceOverlaySnapshot>(EMPTY_OVERLAY);
  const [slotMode] = useState<RankSlotMode>(() => rankSlotModeFromSearch(window.location.search));

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useLayoutEffect(() => {
    stageRef.current = stage;
    if (stage) gameRef.current?.setStage(stage);
  }, [stage]);

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
      });
      gameRef.current = game;
      if (stageRef.current) game.setStage(stageRef.current);
    });

    return () => {
      dead = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [race]);

  return (
    <div ref={shellRef} className="fixed inset-0 z-50 overflow-hidden bg-[#3F4630]" style={SAFE_AREA_PADDING}>
      <div ref={hostRef} className="absolute inset-0" />
      {stage?.kind === "landscape" ? (
        <RaceOverlay
          stage={stage}
          snapshot={overlay}
          comment={comment}
          slotMode={slotMode}
          results={finished ? <RaceResult race={race} onRematch={onRematch} onExit={onExit} /> : null}
        />
      ) : null}
      {stage?.kind === "portrait" ? <RotatePrompt /> : null}
    </div>
  );
}
