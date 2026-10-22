"use client";

import { useState } from "react";
import { RaceGame } from "@/components/RaceGame";
import { RaceResult } from "@/components/RaceResult";
import { mockHorses } from "@/lib/mockHorses";
import { skillById } from "@/lib/skills";
import { MAX_HORSES, simulateRace, type RaceResult as RaceData } from "@/lib/race";

type Phase = "idle" | "racing" | "done";

function nextSeed() {
  return Math.floor(Math.random() * 1_000_000_000) + 1;
}

export default function HomePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [race, setRace] = useState<RaceData | null>(null);

  function start() {
    setRace(simulateRace(mockHorses, nextSeed()));
    setPhase("racing");
    window.scrollTo(0, 0);
  }

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2 border-4 border-[#ff4fd8] bg-[#1b1030] px-4 py-4 shadow-[6px_6px_0_#5ce1ff] sm:px-6">
        <p className="text-xs font-black tracking-[0.35em] text-[#ff4fd8]">ARCADE SELECT</p>
        <h1 className="text-3xl font-black tracking-tight text-[#ffe14a] [text-shadow:3px_3px_0_#ff4fd8] sm:text-4xl">
          어떤 관상이 1등일까
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-[#fff6ea]/80">
          출전은 최대 {MAX_HORSES}관상. 지금은 {mockHorses.length}장의 얼굴과 스킬이다. 한 바퀴가 끝나면 어떤 관상이 1등인지 남는다.
        </p>
      </header>

      {phase === "idle" ? (
        <section className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {mockHorses.map((horse, index) => {
              const skill = skillById(horse.skillId);
              return (
                <article
                  key={horse.id}
                  className="flex flex-col gap-3 border-4 border-[#ffe14a] bg-[#1b1030] p-3 shadow-[5px_5px_0_#ff4fd8]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="bg-[#ffe14a] px-2 py-0.5 text-xs font-black text-[#1a1024]">{index + 1}번</span>
                    <span className="truncate text-xs font-bold tracking-wide text-[#5ce1ff]">{skill.name}</span>
                  </div>
                  {/* Portrait is a local mock illustration, not a user upload. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={horse.portrait}
                    alt={horse.name}
                    className="h-28 w-28 self-center border-4 object-cover"
                    style={{ borderColor: horse.color }}
                  />
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-black leading-tight">{horse.name}</h2>
                    <p className="text-sm font-bold text-[#ffe14a]">{horse.title}</p>
                    <p className="text-sm leading-5 text-[#fff6ea]/80">{horse.reasons[0]}</p>
                    <p className="text-sm leading-5 text-[#fff6ea]/80">{horse.reasons[1]}</p>
                  </div>
                </article>
              );
            })}
          </div>
          <button
            type="button"
            onClick={start}
            className="h-14 border-4 border-[#fff6ea] bg-[#ffe14a] text-lg font-black text-[#1a1024] shadow-[0_6px_0_#b8860b] transition hover:bg-[#fff1a8] active:translate-y-1 active:shadow-none"
          >
            출발
          </button>
        </section>
      ) : null}

      {race && phase !== "idle" ? (
        <div className="relative">
          <RaceGame key={race.seed} race={race} onComplete={() => setPhase("done")} />
          {phase === "done" ? <RaceResult race={race} onRematch={start} /> : null}
        </div>
      ) : null}
    </main>
  );
}
