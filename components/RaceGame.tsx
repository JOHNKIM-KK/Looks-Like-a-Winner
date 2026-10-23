"use client";

import { useEffect, useRef, useState } from "react";
import type { RaceResult, SkillCutin } from "@/lib/race";
import type { RankRow } from "@/game/createRaceGame";

type Props = {
  race: RaceResult;
  onComplete: () => void;
  isRacing: boolean;
};

export function RaceGame({ race, onComplete, isRacing }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const [comment, setComment] = useState("게이트 앞에서 대기 중입니다.");
  const [cutin, setCutin] = useState<SkillCutin | null>(null);
  const [ranks, setRanks] = useState<RankRow[]>([]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let game: { destroy: (removeCanvas: boolean) => void } | null = null;

    void import("@/game/createRaceGame").then(({ createRaceGame }) => {
      if (dead || !hostRef.current) return;
      game = createRaceGame(hostRef.current, race, {
        onComment: setComment,
        onCutin: setCutin,
        onRanks: setRanks,
        onComplete: () => onCompleteRef.current(),
      });
    });

    return () => {
      dead = true;
      game?.destroy(true);
    };
  }, [race]);

  if (isRacing) {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#145c34]"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      >
        <div className="relative h-full w-full max-w-[540px] overflow-hidden">
          <div ref={hostRef} className="h-full w-full" />
          {cutin ? <SkillCutinBanner key={`${cutin.number}-${cutin.skillName}`} cutin={cutin} /> : null}
        </div>
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.portrait}
              alt=""
              className="h-8 w-8 shrink-0 border-2 object-cover"
              style={{ borderColor: row.color }}
            />
            <span className="min-w-0 truncate text-xs font-bold sm:text-sm">{row.name}</span>
          </li>
        ))}
      </ol>
      <div className="relative overflow-hidden border-4 border-[#ffe14a] shadow-[6px_6px_0_#ff4fd8]">
        <div ref={hostRef} className="w-full" />
        {cutin ? <SkillCutinBanner key={`${cutin.number}-${cutin.skillName}`} cutin={cutin} /> : null}
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

function SkillCutinBanner({ cutin }: { cutin: SkillCutin }) {
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 sm:inset-x-4 sm:bottom-4">
      <div
        className="flex items-center gap-3 border-4 border-[#ffe14a] bg-[#12081c]/94 px-3 py-3 shadow-[4px_4px_0_#ff4fd8] sm:gap-4 sm:px-4"
        style={{ animation: "skill-in 220ms ease-out" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cutin.portrait}
          alt=""
          className="h-16 w-16 shrink-0 border-4 object-cover sm:h-20 sm:w-20"
          style={{ borderColor: cutin.color }}
        />
        <div className="min-w-0">
          <p className="text-xs font-black tracking-widest text-[#5ce1ff]">{cutin.number}번 관상</p>
          <p className="truncate text-lg font-black text-[#ffe14a] sm:text-2xl">{cutin.horseName}</p>
          <p className="text-sm font-bold text-white sm:text-base">
            {cutin.skillName} {cutin.hit ? "발동" : "빗나감"}
          </p>
          <p className="text-sm leading-5 text-[#fff6ea] sm:text-base">{cutin.effect}</p>
        </div>
      </div>
    </div>
  );
}
