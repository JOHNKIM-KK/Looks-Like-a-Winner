import { laneColor, laneNumberInk } from "@/game/laneColors";
import { overlayLayout } from "@/game/overlayLayout";

export function LaneBadge({ number, size, fontSize }: { number: number; size: number; fontSize: number }) {
  const { badge, style } = overlayLayout;
  const edged = badge.edgedLanes.includes(number);
  return (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        borderRadius: badge.radius,
        border: edged ? `1.5px solid ${badge.edge}` : undefined,
        background: laneColor(number),
        color: laneNumberInk(number).color,
        fontFamily: style.fontFamily,
        fontWeight: 800,
        fontSize,
        lineHeight: 1,
        letterSpacing: -0.5,
      }}
    >
      {number}
    </span>
  );
}
