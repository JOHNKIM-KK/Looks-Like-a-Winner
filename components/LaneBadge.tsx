import { laneColor, laneNumberInk } from "@/game/laneColors";
import { overlayLayout } from "@/game/overlayLayout";

const NIGHT_EDGE: Record<number, string> = {
  8: "#E8E4DC",
  10: "#B8B2A6",
};

export function LaneBadge({
  number,
  size,
  fontSize,
  variant = "race",
}: {
  number: number;
  size: number;
  fontSize: number;
  variant?: "race" | "night";
}) {
  const { badge, style } = overlayLayout;
  const night = variant === "night";
  const edge = night ? NIGHT_EDGE[number] : badge.edgedLanes.includes(number) ? badge.edge : undefined;
  return (
    <span
      data-testid="lane-badge"
      data-lane={number}
      data-edge={edge ?? ""}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        borderRadius: badge.radius,
        border: !night && edge ? `1.5px solid ${edge}` : undefined,
        boxShadow: night && edge ? `inset 0 0 0 1.5px ${edge}` : undefined,
        background: laneColor(number),
        color: laneNumberInk(number).color,
        fontFamily: night ? undefined : style.fontFamily,
        fontWeight: night ? 700 : 800,
        fontSize,
        lineHeight: 1,
        letterSpacing: night ? "-0.04em" : -0.5,
      }}
    >
      {number}
    </span>
  );
}
