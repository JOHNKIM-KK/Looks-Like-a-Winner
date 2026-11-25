import type { CSSProperties, ReactNode } from "react";
import { overlayLayout } from "@/game/overlayLayout";
import type { LandscapeStage } from "@/game/stage";

const { style } = overlayLayout;

export function splitColumns<T>(items: readonly T[], maxSingle = 6): T[][] {
  if (items.length <= maxSingle) return [items.slice()];
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

export function EntrantFrame({ stage, testId, children }: { stage: LandscapeStage; testId: string; children: ReactNode }) {
  const { frame, scale } = stage;
  return (
    <div data-testid={testId} className="absolute inset-0 z-10 overflow-hidden">
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
        <div style={{ position: "absolute", inset: 0, background: "rgba(12, 6, 22, 0.72)" }} />
        <section style={panelStyle}>{children}</section>
      </div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  position: "absolute",
  left: 210,
  top: 70,
  width: 1180,
  height: 760,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  padding: "36px 48px 32px",
  borderRadius: 18,
  border: `3px solid ${style.border}`,
  background: "rgba(30, 19, 50, 0.96)",
  color: style.text,
  fontFamily: style.fontFamily,
};

export function EntrantTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 42, fontWeight: 800, lineHeight: 1, letterSpacing: -0.5 }}>{title}</h1>
      {hint ? <p style={{ margin: "12px 0 0", fontSize: 18, fontWeight: 600, color: style.soft }}>{hint}</p> : null}
    </div>
  );
}

export function EntrantColumns({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "center", gap: 36, marginTop: 28, flex: 1 }}>{children}</div>;
}

export function EntrantColumn({ wide, children }: { wide: boolean; children: ReactNode }) {
  return <div style={{ width: wide ? 640 : 500, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>;
}

export function EntrantActions({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>{children}</div>;
}

export function EntrantButton({
  kind,
  testId,
  disabled,
  type = "button",
  onClick,
  children,
}: {
  kind: "primary" | "secondary";
  testId: string;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  children: ReactNode;
}) {
  const primary = kind === "primary";
  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 64,
        minWidth: primary ? 220 : undefined,
        padding: "0 22px",
        borderRadius: 10,
        border: primary ? "2px solid #f4b48c" : `3px solid ${style.border}`,
        background: primary ? "linear-gradient(180deg, #e0703a 0%, #c9521f 100%)" : "transparent",
        boxShadow: primary && !disabled ? "0 6px 14px rgba(60, 24, 6, 0.35)" : undefined,
        color: primary ? "#fff8ef" : style.text,
        fontFamily: style.fontFamily,
        fontSize: primary ? 28 : 20,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}
