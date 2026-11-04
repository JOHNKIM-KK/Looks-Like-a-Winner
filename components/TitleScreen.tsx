import type { CSSProperties } from "react";
import { overlayLayout } from "@/game/overlayLayout";
import type { LandscapeStage } from "@/game/stage";

type Props = {
  stage: LandscapeStage;
  onStart: () => void;
};

const TITLE = "WINNING POST";

const lettering: CSSProperties = {
  position: "absolute",
  inset: 0,
  margin: 0,
  fontFamily: "var(--font-geist-sans), sans-serif",
  fontSize: 170,
  fontWeight: 900,
  fontStyle: "italic",
  lineHeight: "210px",
  letterSpacing: -6,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const woodGold = [
  "repeating-linear-gradient(176deg, rgba(120, 66, 18, 0) 0 5px, rgba(120, 66, 18, 0.28) 5px 7px, rgba(255, 244, 200, 0.18) 7px 10px)",
  "linear-gradient(180deg, #fff4cf 0%, #f6d58a 30%, #d99a45 52%, #f3c776 70%, #fff0c4 100%)",
].join(", ");

export function TitleScreen({ stage, onStart }: Props) {
  const { frame, scale } = stage;
  return (
    <div className="absolute inset-0 z-10 overflow-hidden">
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
        <h1
          aria-label={TITLE}
          style={{ position: "absolute", left: -40, right: 40, top: 240, height: 210, margin: 0, transform: "scaleY(1.48)" }}
        >
          <span
            aria-hidden
            style={{
              ...lettering,
              color: "#2a1406",
              WebkitTextStroke: "22px #2a1406",
              filter: "drop-shadow(10px 12px 0 rgba(42, 20, 6, 0.55))",
            }}
          >
            {TITLE}
          </span>
          <span aria-hidden style={{ ...lettering, color: "transparent", WebkitTextStroke: "8px #fff1c8" }}>
            {TITLE}
          </span>
          <span
            aria-hidden
            style={{
              ...lettering,
              color: "transparent",
              background: woodGold,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }}
          >
            {TITLE}
          </span>
        </h1>
        <button
          type="button"
          onClick={onStart}
          style={{
            position: "absolute",
            left: 668,
            top: 684,
            width: 264,
            height: 72,
            borderRadius: 10,
            border: "2px solid #f4b48c",
            background: "linear-gradient(180deg, #e0703a 0%, #c9521f 100%)",
            boxShadow: "0 6px 14px rgba(60, 24, 6, 0.35)",
            color: "#fff8ef",
            fontFamily: overlayLayout.style.fontFamily,
            fontSize: 30,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          출발
        </button>
      </div>
    </div>
  );
}
