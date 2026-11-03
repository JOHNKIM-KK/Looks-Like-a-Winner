"use client";

import type { CSSProperties, ReactNode } from "react";
import { laneColor } from "@/game/laneColors";
import type { RankSlotMode } from "@/game/rankDisplay";
import {
  clamp01,
  leadMeters,
  overlayLayout,
  type OverlayHorse,
  type RaceOverlaySnapshot,
} from "@/game/overlayLayout";
import { RACE_METERS } from "@/game/track";
import type { LandscapeStage } from "@/game/stage";
import { LaneBadge } from "@/components/LaneBadge";

type Props = {
  stage: LandscapeStage;
  snapshot: RaceOverlaySnapshot;
  comment: string;
  slotMode?: RankSlotMode;
  results?: ReactNode;
};

export function RaceOverlay({ stage, snapshot, comment, slotMode = "name", results }: Props) {
  const { frame, scale, hud } = stage;
  const showHud = snapshot.phase === "racing";

  return (
    <div data-testid="race-overlay" data-phase={snapshot.phase} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div
        style={{
          position: "absolute",
          left: frame.x,
          top: frame.y,
          width: overlayLayout.view.width,
          height: overlayLayout.view.height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {showHud ? null : <Countdown label={snapshot.countdown ?? "3"} />}
        <div
          data-testid="race-hud"
          style={{ position: "absolute", left: hud.x, top: hud.y, width: hud.width, height: hud.height }}
        >
          {showHud ? <RankBoard horses={snapshot.horses} slotMode={slotMode} /> : null}
          <Ticker comment={comment} horses={showHud ? snapshot.horses : []} />
          {results}
        </div>
      </div>
    </div>
  );
}

function panelStyle(radius: number): CSSProperties {
  return {
    position: "absolute",
    boxSizing: "border-box",
    borderRadius: radius,
    background: overlayLayout.style.panel,
    boxShadow: `inset 0 0 0 1px ${overlayLayout.style.panelEdge}`,
  };
}

function textStyle(fontSize: number, color: string, fontWeight = 700): CSSProperties {
  return {
    color,
    fontFamily: overlayLayout.style.fontFamily,
    fontWeight,
    fontSize,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
}

function RankBoard({ horses, slotMode }: { horses: OverlayHorse[]; slotMode: RankSlotMode }) {
  const board = overlayLayout.board;
  const podium = horses.filter((horse) => horse.place >= 1 && horse.place <= 3);
  const chase = horses.filter((horse) => horse.place >= 4 && horse.place <= 12);

  return (
    <div
      data-testid="ranking"
      style={{ ...panelStyle(board.radius), left: board.left, top: board.top, width: board.width, height: board.height }}
    >
      <ol style={rowStyle(board.padX, board.podium.top, board.podium.gap)}>
        {podium.map((horse) => (
          <PodiumCard key={horse.id} horse={horse} slotMode={slotMode} />
        ))}
      </ol>
      <ol style={rowStyle(board.padX, board.chase.top, board.chase.gap)}>
        {chase.map((horse) => (
          <ChaseChip key={horse.id} horse={horse} />
        ))}
      </ol>
    </div>
  );
}

function rowStyle(left: number, top: number, gap: number): CSSProperties {
  return {
    position: "absolute",
    left,
    top,
    display: "flex",
    gap,
    margin: 0,
    padding: 0,
    listStyle: "none",
  };
}

function PodiumCard({ horse, slotMode }: { horse: OverlayHorse; slotMode: RankSlotMode }) {
  const card = overlayLayout.board.podium;
  const { style } = overlayLayout;
  const first = horse.place === 1;
  return (
    <li
      style={{
        width: card.width,
        height: card.height,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        paddingLeft: card.padLeft,
        borderRadius: card.radius,
        border: `${card.border}px solid ${first ? style.first : style.border}`,
      }}
    >
      <span style={{ ...textStyle(card.placeSize, first ? style.first : style.text, 800), width: card.placeWidth }}>
        {horse.place}
      </span>
      <LaneBadge number={horse.number} size={card.badge} fontSize={card.badgeSize} />
      {slotMode === "name" ? (
        <span
          data-testid="rank-slot-name"
          style={{ ...textStyle(card.nameSize, style.text, 800), marginLeft: card.nameGap, overflow: "hidden" }}
        >
          {horse.name}
        </span>
      ) : (
        // Portrait is a local mock illustration.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={horse.portrait}
          alt=""
          width={card.badge}
          height={card.badge}
          style={{ width: card.badge, height: card.badge, objectFit: "cover", marginLeft: card.nameGap }}
        />
      )}
    </li>
  );
}

function ChaseChip({ horse }: { horse: OverlayHorse }) {
  const chip = overlayLayout.board.chase;
  return (
    <li
      style={{
        width: chip.width,
        height: chip.height,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        paddingLeft: chip.padLeft,
        borderRadius: chip.radius,
        border: `${chip.border}px solid ${overlayLayout.style.border}`,
      }}
    >
      <span style={{ ...textStyle(chip.placeSize, overlayLayout.style.text, 600), width: chip.placeWidth, letterSpacing: -0.5 }}>
        {horse.place}
      </span>
      <LaneBadge number={horse.number} size={chip.badge} fontSize={chip.badgeSize} />
    </li>
  );
}

function Ticker({ comment, horses }: { comment: string; horses: OverlayHorse[] }) {
  const ticker = overlayLayout.ticker;
  const { caption } = ticker;
  const { style } = overlayLayout;
  return (
    <div
      data-testid="ticker"
      style={{ ...panelStyle(ticker.radius), left: ticker.left, right: ticker.right, bottom: ticker.bottom, height: ticker.height }}
    >
      <div
        style={{
          position: "absolute",
          left: caption.insetX,
          right: caption.insetX,
          top: caption.top,
          height: caption.height,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: caption.labelGap,
          padding: `0 ${caption.padX}px`,
          borderRadius: caption.radius,
          border: `${caption.border}px solid ${style.border}`,
        }}
      >
        <span style={textStyle(caption.labelSize, style.border)}>{caption.label}</span>
        <p aria-live="polite" style={{ ...textStyle(caption.textSize, style.text, 800), margin: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {comment}
        </p>
      </div>
      <Progress horses={horses} />
    </div>
  );
}

function Progress({ horses }: { horses: OverlayHorse[] }) {
  const bar = overlayLayout.ticker.progress;
  const lead = horses.reduce((max, horse) => Math.max(max, clamp01(horse.progress)), 0);
  const back = [...horses].sort((a, b) => b.place - a.place);
  return (
    <>
      <div
        data-testid="progress"
        style={{
          position: "absolute",
          left: bar.left,
          right: bar.right,
          top: bar.centerY - bar.barHeight / 2,
          height: bar.barHeight,
          borderRadius: bar.barHeight / 2,
          background: bar.track,
        }}
      >
        <div style={{ width: `${lead * 100}%`, height: "100%", borderRadius: "inherit", background: bar.fill }} />
        {back.map((horse) => (
          <span
            key={horse.id}
            style={{
              position: "absolute",
              left: `calc(${clamp01(horse.progress) * 100}% - ${bar.marker / 2}px)`,
              top: (bar.barHeight - bar.marker) / 2,
              width: bar.marker,
              height: bar.marker,
              boxSizing: "border-box",
              borderRadius: "50%",
              background: laneColor(horse.number),
              border: `${bar.markerEdge}px solid #FFFFFF`,
            }}
          />
        ))}
      </div>
      <span
        style={{
          ...textStyle(bar.distanceSize, overlayLayout.style.text, 600),
          position: "absolute",
          right: bar.distanceRight,
          top: bar.centerY,
          transform: "translateY(-50%)",
        }}
      >
        {leadMeters(horses)} / {RACE_METERS}m
      </span>
    </>
  );
}

function Countdown({ label }: { label: string }) {
  const box = overlayLayout.countdown;
  const { style } = overlayLayout;
  return (
    <div
      data-testid="countdown"
      role="status"
      style={{
        position: "absolute",
        left: 0,
        width: overlayLayout.view.width,
        top: box.centerY,
        transform: "translateY(-50%)",
        textAlign: "center",
        ...textStyle(box.fontSize, style.text),
        WebkitTextStroke: `${style.outlineWidth}px ${style.outlineColor}`,
        paintOrder: "stroke fill",
      }}
    >
      {label}
    </div>
  );
}
