"use client";

import type { CSSProperties } from "react";
import { laneColor } from "@/game/laneColors";
import type { RankSlotMode } from "@/game/rankDisplay";
import {
  overlayLayout,
  placeAccent,
  type OverlayHorse,
  type RaceOverlaySnapshot,
} from "@/game/overlayLayout";
import type { LandscapeStage } from "@/game/stage";

type Props = {
  stage: LandscapeStage;
  snapshot: RaceOverlaySnapshot;
  comment: string;
  slotMode?: RankSlotMode;
};

type RankMetrics = {
  face: number;
  gap: number;
  fontSize: number;
  borderWidth: number;
  chipPad: number;
  chipGap: number;
};

export function RaceOverlay({ stage, snapshot, comment, slotMode = "name" }: Props) {
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
          {showHud ? (
            <>
              <Minimap horses={snapshot.horses} />
              <Ranking horses={snapshot.horses} slotMode={slotMode} />
            </>
          ) : null}
          <Caption comment={comment} />
          <SkillSlot />
        </div>
      </div>
    </div>
  );
}

function labelStyle(fontSize: number, color: string, fontWeight: number = overlayLayout.style.fontWeight): CSSProperties {
  const { style } = overlayLayout;
  return {
    color,
    fontFamily: style.fontFamily,
    fontWeight,
    fontSize,
    lineHeight: 1,
    WebkitTextStroke: `${style.outlineWidth}px ${style.outlineColor}`,
    paintOrder: "stroke fill",
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function Minimap({ horses }: { horses: OverlayHorse[] }) {
  const bar = overlayLayout.minimap;
  const lead = horses.reduce((max, horse) => Math.max(max, clamp01(horse.progress)), 0);
  const barTop = (bar.height - bar.barHeight) / 2;

  return (
    <div
      data-testid="minimap"
      style={{
        position: "absolute",
        left: bar.left,
        right: bar.right,
        bottom: bar.bottom,
        height: bar.height,
        background: overlayLayout.style.background,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: bar.insetX,
          right: bar.insetX,
          top: barTop,
          height: bar.barHeight,
          background: bar.track,
        }}
      >
        <div style={{ width: `${lead * 100}%`, height: "100%", background: bar.lead }} />
      </div>
      {horses.map((horse) => (
        <div
          key={horse.id}
          style={{
            position: "absolute",
            left: `calc(${bar.insetX - bar.marker / 2}px + ${clamp01(horse.progress)} * (100% - ${bar.insetX * 2}px))`,
            top: (bar.height - bar.marker) / 2,
            width: bar.marker,
            height: bar.marker,
            background: laneColor(horse.number),
            border: `${bar.markerBorder}px solid ${overlayLayout.style.outlineColor}`,
            boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );
}

function Ranking({ horses, slotMode }: { horses: OverlayHorse[]; slotMode: RankSlotMode }) {
  const band = overlayLayout.ranking;
  const podium = horses.filter((horse) => horse.place >= 1 && horse.place <= 3);
  const chase = horses.filter((horse) => horse.place >= 4 && horse.place <= 12);

  return (
    <div
      data-testid="ranking"
      style={{
        position: "absolute",
        top: band.top,
        left: band.left,
        width: band.width,
        height: band.height,
        background: overlayLayout.style.background,
        padding: `${band.paddingTop}px ${band.paddingX}px 0`,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <ol style={rowStyle(band.podium.gap)}>
        {podium.map((horse) => (
          <RankChip key={horse.id} horse={horse} metrics={band.podium} slotMode={slotMode} />
        ))}
      </ol>
      <ol style={{ ...rowStyle(band.chase.gap), marginTop: band.rowGap, flexWrap: "wrap" }}>
        {chase.map((horse) => (
          <RankChip key={horse.id} horse={horse} metrics={band.chase} slotMode={slotMode} />
        ))}
      </ol>
    </div>
  );
}

function rowStyle(gap: number): CSSProperties {
  return {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap,
    margin: 0,
    padding: 0,
    listStyle: "none",
  };
}

function RankChip({ horse, metrics, slotMode }: { horse: OverlayHorse; metrics: RankMetrics; slotMode: RankSlotMode }) {
  const nameWidth = metrics.face >= 32 ? 108 : 64;
  const nameFont = metrics.face >= 32 ? 12 : 8;
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        gap: metrics.chipGap,
        padding: metrics.chipPad,
        border: `${metrics.borderWidth}px solid ${laneColor(horse.number)}`,
      }}
    >
      <span style={labelStyle(metrics.fontSize, placeAccent(horse.place) ?? overlayLayout.style.textColor)}>{horse.place}</span>
      {slotMode === "name" ? (
        <span
          data-testid="rank-slot-name"
          style={{
            width: nameWidth,
            height: metrics.face,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            textAlign: "center",
            color: "#ffffff",
            fontFamily: overlayLayout.style.fontFamily,
            fontWeight: 700,
            fontSize: nameFont,
            lineHeight: 1.05,
          }}
        >
          {horse.name}
        </span>
      ) : (
        // Portrait is a local mock illustration.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={horse.portrait}
          alt=""
          width={metrics.face}
          height={metrics.face}
          style={{
            width: metrics.face,
            height: metrics.face,
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
    </li>
  );
}

function Countdown({ label }: { label: string }) {
  const box = overlayLayout.countdown;
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
        ...labelStyle(box.fontSize, overlayLayout.style.textColor),
      }}
    >
      {label}
    </div>
  );
}

function Caption({ comment }: { comment: string }) {
  const box = overlayLayout.caption;
  return (
    <p
      aria-live="polite"
      style={{
        position: "absolute",
        left: box.left,
        right: box.right,
        bottom: box.bottom,
        height: box.height,
        margin: 0,
        overflow: "hidden",
        boxSizing: "border-box",
        border: `${box.borderWidth}px solid ${box.borderColor}`,
        background: box.background,
        color: box.color,
        fontFamily: overlayLayout.style.fontFamily,
        fontWeight: box.fontWeight,
        fontSize: box.fontSize,
        lineHeight: `${box.lineHeight}px`,
        padding: `${box.paddingY}px ${box.paddingX}px`,
      }}
    >
      {comment}
    </p>
  );
}

function SkillSlot() {
  const slot = overlayLayout.skillSlot;
  return (
    <div
      data-testid="skill-slot"
      aria-hidden="true"
      style={{
        position: "absolute",
        top: slot.top,
        right: slot.right,
        width: slot.width,
        height: slot.height,
        boxSizing: "border-box",
        background: overlayLayout.style.background,
        border: `${slot.borderWidth}px solid ${slot.borderColor}`,
      }}
    />
  );
}
