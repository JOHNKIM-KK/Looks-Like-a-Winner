import { useEffect, useState } from "react";
import { formatRaceTime, type RaceResult } from "@/lib/race";
import { rankSlotModeFromSearch, type RankSlotMode } from "@/game/rankDisplay";

type Props = {
  race: RaceResult;
  onRematch: () => void;
};

export function RaceResult({ race, onRematch }: Props) {
  const [slotMode, setSlotMode] = useState<RankSlotMode>("name");
  useEffect(() => {
    setSlotMode(rankSlotModeFromSearch(window.location.search));
  }, []);
  const winner = race.ranking[0];
  if (!winner) return null;
  const rest = race.ranking.slice(1);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-auto bg-[#12081c]/94 p-4">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <p className="text-xs font-black tracking-[0.35em] text-[#ff4fd8]">FINISH</p>
        <article className="flex items-center gap-4 border-4 border-[#ffe14a] bg-[#1b1030] p-4 shadow-[5px_5px_0_#ff4fd8]">
          {slotMode === "face" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={winner.portrait}
              alt={winner.name}
              className="h-24 w-24 shrink-0 border-4 object-cover"
              style={{ borderColor: winner.color }}
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-black text-[#ffe14a]">1등</p>
            <h2 className="text-3xl font-black tracking-tight">{winner.name}</h2>
            <p className="text-sm text-[#fff6ea]/80">
              {winner.skillName}
              {winner.skillHit ? " · 적중" : " · 빗나감"}
            </p>
            <p className="mt-1 font-mono text-lg">{formatRaceTime(winner.finishTime)}</p>
          </div>
        </article>
        <ol className="flex flex-col gap-2">
          {rest.map((horse) => {
            const gap = horse.finishTime - winner.finishTime;
            return (
              <li key={horse.id} className="flex items-center gap-3 border-2 border-[#5ce1ff] bg-[#1b1030] px-4 py-3">
                <span className="w-10 text-lg font-black text-[#ffe14a]">{horse.rank}등</span>
                {slotMode === "face" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={horse.portrait}
                    alt=""
                    className="h-12 w-12 shrink-0 border-2 object-cover"
                    style={{ borderColor: horse.color }}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{horse.name}</p>
                  <p className="truncate text-sm text-[#fff6ea]/75">
                    {horse.skillName}
                    {horse.skillHit ? " · 적중" : " · 빗나감"}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm text-[#5ce1ff]">
                  {gap < 0.005 ? "동착" : `+${gap.toFixed(2)}초`}
                </p>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={onRematch}
          className="h-14 border-4 border-[#fff6ea] bg-[#ffe14a] text-lg font-black text-[#1a1024] shadow-[0_6px_0_#b8860b] transition hover:bg-[#fff1a8] active:translate-y-1 active:shadow-none"
        >
          재대결
        </button>
      </div>
    </div>
  );
}
