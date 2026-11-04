"use client";

import { useState } from "react";
import { RaceGame } from "@/components/RaceGame";
import { mockHorses } from "@/lib/mockHorses";
import { primeStartSound } from "@/game/bang";
import { fieldHorses } from "@/lib/field";
import { simulateRace, type RaceResult as RaceData } from "@/lib/race";

type Phase = "title" | "racing" | "done";

function nextSeed() {
  return Math.floor(Math.random() * 1_000_000_000) + 1;
}

function seedFromSearch() {
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const seed = Math.floor(value);
  return seed > 0 ? seed : null;
}

function newRace() {
  const seed = seedFromSearch() ?? nextSeed();
  return simulateRace(fieldHorses(mockHorses, seed), seed);
}

/** Client-only: the race is seeded from the URL and `Math.random`, so it must never prerender. */
export function RaceSession() {
  const [race, setRace] = useState<RaceData>(newRace);
  const [phase, setPhase] = useState<Phase>("title");

  function start() {
    primeStartSound();
    setPhase("racing");
  }

  function rematch() {
    primeStartSound();
    setRace(newRace());
    setPhase("racing");
  }

  function exit() {
    setRace(newRace());
    setPhase("title");
  }

  return (
    <RaceGame
      key={race.seed}
      race={race}
      started={phase !== "title"}
      finished={phase === "done"}
      onStart={start}
      onComplete={() => setPhase("done")}
      onRematch={rematch}
      onExit={exit}
    />
  );
}
