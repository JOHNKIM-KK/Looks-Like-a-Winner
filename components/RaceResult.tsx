import { formatRaceTime, type RaceResult } from "@/lib/race";

type Props = {
  race: RaceResult;
  onRematch: () => void;
};

export function RaceResult({ race, onRematch }: Props) {
  const winner = race.ranking[0];
  if (!winner) return null;
  const rest = race.ranking.slice(1);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-auto bg-[#102018] p-4">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <p className="text-sm font-semibold tracking-[0.2em] text-[#f0c14d]">결승</p>
        <article className="flex items-center gap-4 rounded-3xl bg-[#1b2a22] p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={winner.portrait}
            alt={winner.name}
            className="h-24 w-24 shrink-0 rounded-full object-cover"
            style={{ boxShadow: `0 0 0 4px ${winner.color}` }}
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#f0c14d]">1위</p>
            <h2 className="text-3xl font-black tracking-tight">{winner.name}</h2>
            <p className="text-sm text-[#f6f1e7]/80">
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
              <li key={horse.id} className="flex items-center gap-3 rounded-2xl bg-[#1b2a22] px-4 py-3">
                <span className="w-8 text-xl font-black text-[#f0c14d]">{horse.rank}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={horse.portrait}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                  style={{ boxShadow: `0 0 0 3px ${horse.color}` }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{horse.name}</p>
                  <p className="truncate text-sm text-[#f6f1e7]/75">
                    {horse.skillName}
                    {horse.skillHit ? " · 적중" : " · 빗나감"}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm text-[#f0c14d]">
                  {gap < 0.005 ? "동착" : `+${gap.toFixed(2)}초`}
                </p>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={onRematch}
          className="h-14 rounded-full bg-[#f0c14d] text-lg font-bold text-[#24180f] transition hover:bg-[#ffd56a]"
        >
          재대결
        </button>
      </div>
    </div>
  );
}
