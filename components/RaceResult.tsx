import type { CSSProperties } from "react";
import { overlayLayout, resultGapLabel, resultsFit, type FinishBoardRow } from "@/game/overlayLayout";
import { LaneBadge } from "@/components/LaneBadge";

type Props = {
  rows: readonly FinishBoardRow[];
  winnerName: string | null;
  /** Buttons and the large winner line. Partial fills keep the same panel without them. */
  complete: boolean;
  /** Reference units. */
  hudHeight: number;
  onRematch: () => void;
  onExit: () => void;
};

export function RaceResult({ rows, winnerName, complete, hudHeight, onRematch, onExit }: Props) {
  const box = overlayLayout.results;
  const { style } = overlayLayout;
  const winnerTime = rows.find((horse) => horse.rank === 1)?.finishTime ?? rows[0]?.finishTime ?? 0;

  return (
    <>
      {winnerName ? <WinnerBanner name={winnerName} large={complete} /> : null}
      {rows.length > 0 ? (
        <div
          style={{
            position: "absolute",
            top: box.top,
            right: box.right,
            width: box.width,
            transform: `scale(${resultsFit(hudHeight)})`,
            transformOrigin: "top right",
          }}
        >
          <section
            data-testid="race-results"
            data-complete={complete ? "true" : "false"}
            aria-label="경주 결과"
            style={{
              position: "relative",
              width: box.width,
              height: box.height,
              boxSizing: "border-box",
              borderRadius: box.radius,
              border: `${box.border}px solid ${style.border}`,
              background: style.panel,
              fontFamily: style.fontFamily,
              color: style.text,
              animation: "results-in 0.4s ease-out both",
            }}
          >
            <h2
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: box.titleCenterY - box.border,
                transform: "translateY(-50%)",
                margin: 0,
                textAlign: "center",
                fontSize: box.titleSize,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {box.title}
            </h2>
            <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {rows.map((horse) => {
                const podium = horse.rank <= 3;
                const first = horse.rank === 1;
                return (
                  <li
                    key={horse.id}
                    style={{
                      position: "absolute",
                      left: box.padX - box.border,
                      right: box.padX - box.border,
                      top: box.rowsTop - box.border + (horse.rank - 1) * box.rowPitch,
                      height: box.rowHeight,
                      boxSizing: "border-box",
                      display: "flex",
                      alignItems: "center",
                      borderRadius: box.rowRadius,
                      border: podium ? `${box.rowBorder}px solid ${first ? style.first : style.border}` : undefined,
                      background: podium ? box.rowFill : undefined,
                    }}
                  >
                    <span
                      style={{
                        ...cell(podium ? box.podiumPlaceSize : box.placeSize, first ? style.first : style.text, 800),
                        position: "absolute",
                        left: box.placeLeft - (podium ? box.rowBorder : 0),
                      }}
                    >
                      {horse.rank}
                    </span>
                    <span style={{ position: "absolute", left: box.badgeLeft - (podium ? box.rowBorder : 0) }}>
                      <LaneBadge number={horse.number} size={box.badge} fontSize={box.badgeSize} />
                    </span>
                    <span
                      style={{
                        ...cell(podium ? box.podiumNameSize : box.nameSize, style.text, podium ? 800 : 700),
                        position: "absolute",
                        left: box.badgeLeft + box.badge + box.nameGap - (podium ? box.rowBorder : 0),
                      }}
                    >
                      {horse.name}
                    </span>
                    <span
                      style={{
                        ...cell(box.gapSize, style.soft, 500),
                        position: "absolute",
                        right: box.gapRight - (podium ? box.rowBorder : 0),
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {resultGapLabel(horse.finishTime, winnerTime, horse.rank)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
          {complete ? <Actions onRematch={onRematch} onExit={onExit} /> : null}
        </div>
      ) : null}
    </>
  );
}

function WinnerBanner({ name, large }: { name: string; large: boolean }) {
  const box = large ? overlayLayout.winner.large : overlayLayout.winner.small;
  const { style } = overlayLayout;
  return (
    <div
      data-testid="winner-banner"
      data-size={large ? "large" : "small"}
      style={{
        position: "absolute",
        top: box.top,
        left: box.left,
        maxWidth: "maxWidth" in box ? box.maxWidth : 270,
        boxSizing: "border-box",
        padding: `${box.padY}px ${box.padX}px`,
        borderRadius: box.radius,
        background: style.panel,
        border: `2px solid ${style.first}`,
        color: style.first,
        fontFamily: style.fontFamily,
        fontWeight: 800,
        fontSize: box.fontSize,
        lineHeight: 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
      }}
    >
      WINNER {name}
    </div>
  );
}

function cell(fontSize: number, color: string, fontWeight: number): CSSProperties {
  return { fontSize, color, fontWeight, lineHeight: 1, whiteSpace: "nowrap" };
}

function Actions({ onRematch, onExit }: { onRematch: () => void; onExit: () => void }) {
  const { actions, style } = overlayLayout;
  const button: CSSProperties = {
    flex: 1,
    height: actions.height,
    borderRadius: 10,
    fontFamily: style.fontFamily,
    fontSize: actions.fontSize,
    fontWeight: 800,
    cursor: "pointer",
  };
  return (
    <div
      style={{
        display: "flex",
        gap: actions.gap,
        marginTop: actions.top,
        pointerEvents: "auto",
        animation: "results-in 0.4s ease-out 0.25s both",
      }}
    >
      <button
        type="button"
        onClick={onExit}
        style={{ ...button, background: style.panel, color: style.text, border: `3px solid ${style.border}` }}
      >
        나가기
      </button>
      <button
        type="button"
        onClick={onRematch}
        style={{ ...button, background: style.first, color: "#1A1024", border: `3px solid ${style.first}` }}
      >
        다시 하기
      </button>
    </div>
  );
}
