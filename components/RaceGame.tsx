"use client";

import { useEffect, useRef, useState } from "react";
import type { RaceResult, SkillCutin } from "@/lib/race";
import type { RankRow } from "@/game/createRaceGame";

type Props = {
  race: RaceResult;
  onComplete: () => void;
};

export function RaceGame({ race, onComplete }: Props) {
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

  return (
    <section className="flex flex-col gap-3">
      <p aria-live="polite" className="min-h-14 rounded-2xl bg-[#24180f] px-4 py-3 text-base leading-6">
        {comment}
      </p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {ranks.map((row) => (
          <li key={row.id} className="flex items-center gap-2 rounded-2xl bg-[#1b2a22] px-3 py-2">
            <span className="w-5 font-bold text-[#f0c14d]">{row.place}</span>
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="truncate text-sm">{row.name}</span>
          </li>
        ))}
      </ol>
      <div className="relative overflow-hidden rounded-3xl border border-[#f6f1e7]/15">
        <div ref={hostRef} className="w-full" />
        {cutin ? <SkillCutinBanner key={`${cutin.number}-${cutin.skillName}`} cutin={cutin} /> : null}
      </div>
    </section>
  );
}

function SkillCutinBanner({ cutin }: { cutin: SkillCutin }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10">
      <div
        className="flex items-center gap-4 rounded-3xl bg-[#1c140c]/90 px-4 py-3 text-white"
        style={{ animation: "skill-in 220ms ease-out" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cutin.portrait}
          alt=""
          className="h-24 w-24 rounded-full object-cover"
          style={{ boxShadow: `0 0 0 4px ${cutin.color}` }}
        />
        <div>
          <p className="text-sm text-[#f3d7a1]">
            {cutin.number}번 {cutin.horseName}
          </p>
          <p className="text-3xl font-black leading-none" style={{ textShadow: `0 3px 0 ${cutin.color}` }}>
            {cutin.shout}
          </p>
          <p className="mt-1 text-lg font-bold text-[#fff6d8]">{cutin.payoff}</p>
        </div>
      </div>
    </div>
  );
}
