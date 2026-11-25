import type { HorseInput } from "@/lib/race";
import { lineupRows } from "@/lib/entrantSetup";
import { overlayLayout } from "@/game/overlayLayout";
import type { LandscapeStage } from "@/game/stage";
import { LaneBadge } from "@/components/LaneBadge";
import { EntrantActions, EntrantButton, EntrantColumn, EntrantColumns, EntrantFrame, EntrantTitle, splitColumns } from "@/components/entrantChrome";

type Props = {
  stage: LandscapeStage;
  horses: readonly HorseInput[];
  onShuffle: () => void;
  onStart: () => void;
};

const { style } = overlayLayout;

export function LineupScreen({ stage, horses, onShuffle, onStart }: Props) {
  const rows = splitColumns(lineupRows(horses));
  return (
    <EntrantFrame stage={stage} testId="lineup-screen">
      <EntrantTitle title="라인업" hint="게이트는 무작위로 배정되었습니다" />
      <EntrantColumns>
        {rows.map((column, columnIndex) => (
          <EntrantColumn key={columnIndex} wide={rows.length === 1}>
            {column.map((row) => (
              <div
                key={row.id}
                data-testid={`lineup-gate-${row.stall}`}
                aria-label={`${row.stall}번 게이트 ${row.name}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: overlayLayout.lineup.gap,
                  height: overlayLayout.lineup.rowHeight,
                }}
              >
                <LaneBadge number={row.stall} size={overlayLayout.lineup.badge} fontSize={overlayLayout.lineup.badgeSize} />
                <span data-testid="lineup-name" style={{ fontSize: overlayLayout.lineup.nameSize, fontWeight: 800, color: style.text, whiteSpace: "nowrap" }}>
                  {row.name}
                </span>
              </div>
            ))}
          </EntrantColumn>
        ))}
      </EntrantColumns>
      <EntrantActions>
        <EntrantButton kind="secondary" testId="lineup-shuffle" onClick={onShuffle}>
          레인 다시 섞기
        </EntrantButton>
        <span style={{ flex: 1 }} />
        <EntrantButton kind="primary" testId="lineup-start" onClick={onStart}>
          경주 시작
        </EntrantButton>
      </EntrantActions>
    </EntrantFrame>
  );
}
