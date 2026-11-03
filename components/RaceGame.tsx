"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RaceResult } from "@/lib/race";
import type { RaceGameHandle, RankRow } from "@/game/createRaceGame";
import type { RaceOverlaySnapshot } from "@/game/overlayLayout";
import { rankSlotModeFromSearch, type RankSlotMode } from "@/game/rankDisplay";
import { RaceOverlay } from "@/components/RaceOverlay";
import { RotatePrompt } from "@/components/RotatePrompt";
import { SAFE_AREA_PADDING, useStage } from "@/components/useStage";

type Props = {
  race: RaceResult;
  onComplete: () => void;
  isRacing: boolean;
};

const EMPTY_OVERLAY: RaceOverlaySnapshot = {
  phase: "countdown",
  countdown: "3",
  horses: [],
};

export function RaceGame({ race, onComplete, isRacing }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<RaceGameHandle | null>(null);
  const stage = useStage(shellRef);
  const stageRef = useRef(stage);
  const onCompleteRef = useRef(onComplete);
  const [comment, setComment] = useState("게이트 앞에서 대기 중입니다.");
  const [ranks, setRanks] = useState<RankRow[]>([]);
  const [overlay, setOverlay] = useState<RaceOverlaySnapshot>(EMPTY_OVERLAY);
  const [slotMode, setSlotMode] = useState<RankSlotMode>("name");

  useEffect(() => {
    setSlotMode(rankSlotModeFromSearch(window.location.search));
  }, []);

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
        onRanks: setRanks,
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

  if (isRacing) {
    return (
      <div ref={shellRef} className="fixed inset-0 z-50 overflow-hidden bg-[#3F4630]" style={SAFE_AREA_PADDING}>
        <div ref={hostRef} className="absolute inset-0" />
        {stage?.kind === "landscape" ? (
          <RaceOverlay stage={stage} snapshot={overlay} comment={comment} slotMode={slotMode} />
        ) : null}
        {stage?.kind === "portrait" ? <RotatePrompt /> : null}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <p
        aria-live="polite"
        className="min-h-14 border-4 border-[#5ce1ff] bg-[#1b1030] px-4 py-3 text-sm leading-6 sm:text-base"
      >
        {comment}
      </p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ranks.map((row) => (
          <li
            key={row.id}
            className="flex min-w-0 items-center gap-2 border-2 bg-[#1b1030] px-2 py-2"
            style={{
              borderColor: row.place === 1 ? "#ffe14a" : "#ff4fd8",
              boxShadow: row.place === 1 ? "3px 3px 0 #ffe14a" : "3px 3px 0 #5ce1ff",
            }}
          >
            <span
              className="w-9 shrink-0 text-center text-xs font-black sm:text-sm"
              style={{ color: placeColor(row.place) }}
            >
              {row.place}등
            </span>
            {slotMode === "face" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.portrait}
                alt=""
                className="h-8 w-8 shrink-0 border-2 object-cover"
                style={{ borderColor: row.color }}
              />
            ) : null}
            <span className="min-w-0 truncate text-xs font-bold sm:text-sm">{row.name}</span>
          </li>
        ))}
      </ol>
      <div className="relative overflow-hidden border-4 border-[#ffe14a] shadow-[6px_6px_0_#ff4fd8]">
        <div ref={hostRef} className="w-full" />
      </div>
    </section>
  );
}

function placeColor(place: number) {
  if (place === 1) return "#ffe14a";
  if (place === 2) return "#d5dbe6";
  if (place === 3) return "#e0a15a";
  return "#5ce1ff";
}
