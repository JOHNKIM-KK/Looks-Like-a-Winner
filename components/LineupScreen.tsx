import type { HorseInput } from "@/lib/race";
import { lineupRows } from "@/lib/entrantSetup";
import { LaneBadge } from "@/components/LaneBadge";

type Props = {
  horses: readonly HorseInput[];
  onStart: () => void;
};

/** Assigned rows only. 2–6 stay 56, 7–9 tighten to 52, 10–12 fit at 44. */
export function lineupRowHeight(count: number) {
  if (count >= 10) return 44;
  if (count >= 7) return 52;
  return 56;
}

export function lineupDensity(count: number) {
  if (count >= 10) return "n-full";
  if (count >= 7) return "n-mid";
  return "";
}

export function LineupScreen({ horses, onStart }: Props) {
  const rows = lineupRows(horses);
  const height = lineupRowHeight(rows.length);
  const density = lineupDensity(rows.length);
  return (
    <div className="night-root" data-testid="lineup-screen">
      <section className={`night lineup ${density}`.trim()}>
        <div className="body">
          <div className="lu-head">
            <h1>라인업</h1>
          </div>
          <div className="lu-list" data-align="start" data-count={rows.length} data-row-height={height}>
            {rows.map((row) => (
              <div
                key={row.id}
                className="stall"
                data-testid={`lineup-gate-${row.stall}`}
                data-row-height={height}
                aria-label={`${row.stall}번 게이트 ${row.name}`}
                style={{ height, flexBasis: height }}
              >
                <LaneBadge variant="night" number={row.stall} size={22} fontSize={11} />
                <span data-testid="lineup-name" className="nm">
                  {row.name}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="foot">
          <button type="button" className="cta" data-testid="lineup-start" onClick={onStart}>
            출발
          </button>
        </div>
      </section>
    </div>
  );
}
