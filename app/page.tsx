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
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold tracking-wide text-[#f0c14d]">지금은 목업 출전마</p>
        <h1 className="text-4xl font-bold tracking-tight">얼굴 경주마</h1>
        <p className="max-w-2xl text-sm leading-6 text-[#f6f1e7]/75">
          출전은 최대 {MAX_HORSES}마리입니다. 지금은 {mockHorses.length}마리의 특성과 스킬입니다. 타원 코스는 출전 수만큼 레인이 생깁니다.
        </p>
      </header>

      {phase === "idle" ? (
        <section className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {mockHorses.map((horse, index) => (
              <article
                key={horse.id}
                className="flex flex-col gap-3 rounded-3xl bg-[#1b2a22] p-4"
                style={{ boxShadow: `inset 0 4px 0 ${horse.color}` }}
              >
                {/* Portrait is a local mock illustration, not a user upload. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={horse.portrait}
                  alt={horse.name}
                  className="h-28 w-28 self-center rounded-full object-cover"
                  style={{ boxShadow: `0 0 0 4px ${horse.color}` }}
                />
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-[#f6f1e7]/60">{index + 1}번</p>
                  <h2 className="text-lg font-bold">{horse.name}</h2>
                  <p className="text-sm text-[#f0c14d]">{horse.title}</p>
                  <p className="text-sm font-semibold">{skillById(horse.skillId).name}</p>
                  <p className="text-sm leading-5 text-[#f6f1e7]/75">{horse.reasons[0]}</p>
                  <p className="text-sm leading-5 text-[#f6f1e7]/75">{horse.reasons[1]}</p>
                </div>
              </article>
            ))}
          </div>
          <button
            type="button"
            onClick={start}
            className="h-14 rounded-full bg-[#f0c14d] text-lg font-bold text-[#24180f] transition hover:bg-[#ffd56a]"
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
