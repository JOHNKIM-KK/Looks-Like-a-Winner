"use client";

import { useState } from "react";
import { RaceGame } from "@/components/RaceGame";
import { primeStartSound } from "@/game/bang";
import {
  createEntrantSession,
  entrantIssue,
  finishRacing,
  loadRecentEntrants,
  openSetup,
  presentLineup,
  removeEntrant,
  reshuffleToLineup,
  returnToSetup,
  saveRecentEntrants,
  startRacing,
  withCount,
  withName,
  withNames,
  type EntrantSession,
} from "@/lib/entrantSetup";
import { fieldHorses } from "@/lib/field";
import { mockHorses } from "@/lib/mockHorses";
import { simulateRace, type RaceResult as RaceData } from "@/lib/race";

const EMPTY_RECENT = "불러올 최근 참가자가 없습니다.";

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

/** Idle track behind the title. The race a player starts is the lineup field. */
function newRace() {
  const seed = seedFromSearch() ?? nextSeed();
  return simulateRace(fieldHorses(mockHorses, seed), seed);
}

/** Client-only: seeds come from the URL and `Math.random`, so this must never prerender. */
export function RaceSession() {
  const [race, setRace] = useState<RaceData>(newRace);
  const [session, setSession] = useState<EntrantSession>(() => createEntrantSession(seedFromSearch() ?? nextSeed()));
  const [notice, setNotice] = useState<string | null>(null);
  const issue = entrantIssue(session.names);

  return (
    <RaceGame
      key={race.seed}
      race={race}
      phase={session.phase}
      names={session.names}
      issue={issue}
      notice={notice}
      horses={session.horses}
      onOpenSetup={() => {
        setNotice(null);
        setSession((current) => openSetup(current));
      }}
      onStep={(delta) => {
        setNotice(null);
        setSession((current) => withCount(current, current.names.length + delta));
      }}
      onName={(index, value) => {
        setNotice(null);
        setSession((current) => withName(current, index, value));
      }}
      onRemove={(index) => {
        setNotice(null);
        setSession((current) => removeEntrant(current, index));
      }}
      recent={typeof window === "undefined" ? null : loadRecentEntrants(window.localStorage)}
      onLoadRecent={() => {
        const names = loadRecentEntrants(window.localStorage);
        if (!names) {
          setNotice(EMPTY_RECENT);
          return;
        }
        setNotice(null);
        setSession((current) => withNames(current, names));
      }}
      onConfirmSetup={() => {
        const next = presentLineup(session);
        if (next === session) return;
        setNotice(null);
        setSession(next);
      }}
      onStartRace={() => {
        const next = startRacing(session);
        if (next === session) return;
        primeStartSound();
        const seed = seedFromSearch() ?? nextSeed();
        const nextRace = simulateRace(session.horses, seed);
        saveRecentEntrants(window.localStorage, session.names);
        setRace(nextRace);
        setSession(next);
      }}
      onComplete={() => setSession((current) => finishRacing(current))}
      onRematch={() => setSession((current) => reshuffleToLineup(current, nextSeed()))}
      onChangeSettings={() => {
        setNotice(null);
        setSession((current) => returnToSetup(current));
      }}
    />
  );
}
