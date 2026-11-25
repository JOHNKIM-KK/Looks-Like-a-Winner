import type { CSSProperties } from "react";
import { MAX_HORSES } from "@/lib/race";
import { MIN_ENTRANTS } from "@/lib/entrantSetup";
import { overlayLayout } from "@/game/overlayLayout";
import type { LandscapeStage } from "@/game/stage";
import { EntrantActions, EntrantButton, EntrantColumn, EntrantColumns, EntrantFrame, EntrantTitle, splitColumns } from "@/components/entrantChrome";

type Props = {
  stage: LandscapeStage;
  names: readonly string[];
  issue: string | null;
  notice: string | null;
  onStep: (delta: number) => void;
  onName: (index: number, value: string) => void;
  onLoadRecent: () => void;
  onShuffle: () => void;
  onStart: () => void;
};

const { style } = overlayLayout;

export function SetupScreen({ stage, names, issue, notice, onStep, onName, onLoadRecent, onShuffle, onStart }: Props) {
  const count = names.length;
  const columns = splitColumns(names.map((name, index) => ({ name, index })));
  const note = issue ?? notice ?? "";

  return (
    <EntrantFrame stage={stage} testId="setup-screen">
      <form
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!issue) onStart();
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <EntrantTitle title="출전 설정" hint="비운 칸은 기본 이름으로 채워집니다." />
          <Stepper count={count} onStep={onStep} />
        </div>
        <EntrantColumns>
          {columns.map((column, columnIndex) => (
            <EntrantColumn key={columnIndex} wide={columns.length === 1}>
              {column.map((slot) => (
                <label key={slot.index} style={{ display: "flex", alignItems: "center", gap: 12, height: 58 }}>
                  <span style={{ width: 28, textAlign: "right", fontSize: 18, fontWeight: 700, color: style.soft }}>{slot.index + 1}</span>
                  <input
                    aria-label={`참가자 ${slot.index + 1}`}
                    data-testid={`entrant-name-${slot.index}`}
                    value={slot.name}
                    placeholder="비우면 기본 이름"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(event) => onName(slot.index, event.target.value)}
                    className="placeholder:text-[#ECE6F5]/45"
                    style={inputStyle}
                  />
                </label>
              ))}
            </EntrantColumn>
          ))}
        </EntrantColumns>
        <p
          data-testid="setup-note"
          role={issue ? "alert" : "status"}
          style={{ minHeight: 28, margin: "12px 0 0", fontSize: 18, fontWeight: 700, color: issue ? "#FFB4C8" : style.soft }}
        >
          {note}
        </p>
        <EntrantActions>
          <EntrantButton kind="secondary" testId="setup-load" onClick={onLoadRecent}>
            최근 참가자 불러오기
          </EntrantButton>
          <EntrantButton kind="secondary" testId="setup-shuffle" onClick={onShuffle}>
            레인 섞기
          </EntrantButton>
          <span style={{ flex: 1 }} />
          <EntrantButton kind="primary" testId="setup-start" type="submit" disabled={issue !== null}>
            경주 시작
          </EntrantButton>
        </EntrantActions>
      </form>
    </EntrantFrame>
  );
}

function Stepper({ count, onStep }: { count: number; onStep: (delta: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 20, fontWeight: 800, color: style.soft }}>참가자</span>
      <button type="button" aria-label="참가자 줄이기" disabled={count <= MIN_ENTRANTS} onClick={() => onStep(-1)} style={stepStyle(count <= MIN_ENTRANTS)}>
        −
      </button>
      <span data-testid="entrant-count" style={{ width: 48, textAlign: "center", fontSize: 36, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
        {count}
      </span>
      <button type="button" aria-label="참가자 늘리기" disabled={count >= MAX_HORSES} onClick={() => onStep(1)} style={stepStyle(count >= MAX_HORSES)}>
        +
      </button>
    </div>
  );
}

function stepStyle(disabled: boolean): CSSProperties {
  return {
    width: 48,
    height: 48,
    borderRadius: 10,
    border: `3px solid ${style.border}`,
    background: "transparent",
    color: style.text,
    fontFamily: style.fontFamily,
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.35 : 1,
  };
}

const inputStyle: CSSProperties = {
  flex: 1,
  height: 50,
  boxSizing: "border-box",
  borderRadius: 10,
  border: "2px solid rgba(92, 225, 255, 0.55)",
  background: "rgba(255, 255, 255, 0.06)",
  color: style.text,
  fontFamily: style.fontFamily,
  fontSize: 22,
  fontWeight: 700,
  padding: "0 14px",
};
