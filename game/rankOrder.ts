/** A horse as it stands on the presentation clock. `shown` is track progress. */
export type RankSource = {
  id: string;
  number: number;
  shown: number;
  finishTime: number;
  rank: number;
};

/**
 * Live order from presentation progress. Horses that have already finished
 * keep their official rank and sit ahead of anyone still running.
 */
export function orderByPresentation<T extends RankSource>(horses: readonly T[], raceTime: number): T[] {
  const finished = (horse: T) => raceTime + 0.0001 >= horse.finishTime;
  return [...horses].sort((a, b) => {
    const aDone = finished(a);
    const bDone = finished(b);
    if (aDone && bDone) return a.rank - b.rank;
    if (aDone !== bDone) return aDone ? -1 : 1;
    return b.shown - a.shown || a.number - b.number;
  });
}
