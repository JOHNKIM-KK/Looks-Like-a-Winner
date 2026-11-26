"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MAX_HORSES } from "@/lib/race";
import { MIN_ENTRANTS } from "@/lib/entrantSetup";

type Props = {
  names: readonly string[];
  issue: string | null;
  notice: string | null;
  recent: readonly string[] | null;
  onStep: (delta: number) => void;
  onName: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onLoadRecent: () => void;
  onStart: () => void;
};

const DISABLED = "#5E5C58";
const SHEET_CLOSE_MS = 200;
const ROW_MS = 150;
const DRAG_CLOSE = 56;

/** 12 names share the screen at 44px. Fewer stay at 52. */
export function setupRowHeight(count: number) {
  return count >= MAX_HORSES ? 44 : 52;
}

export function SetupScreen({ names, issue, notice, recent, onStep, onName, onRemove, onLoadRecent, onStart }: Props) {
  const count = names.length;
  const compact = count >= MAX_HORSES;
  const rowHeight = setupRowHeight(count);
  const message = issue ?? notice;
  const [sheet, setSheet] = useState<"closed" | "open" | "closing">("closed");
  const [dragY, setDragY] = useState(0);
  const [motion, setMotion] = useState<{ kind: "add" | "del"; index: number } | null>(null);
  const drag = useRef({ y: 0, active: false, delta: 0 });
  const timers = useRef<number[]>([]);
  const atMin = count <= MIN_ENTRANTS;
  const atMax = count >= MAX_HORSES;

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    if (sheet !== "closing") return;
    const id = window.setTimeout(() => {
      setSheet("closed");
      setDragY(0);
    }, SHEET_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [sheet]);

  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      const index = timers.current.indexOf(id);
      if (index >= 0) timers.current.splice(index, 1);
      fn();
    }, ms);
    timers.current.push(id);
  }

  function closeSheet() {
    setSheet((current) => (current === "open" ? "closing" : current));
  }

  function addRow() {
    if (atMax) return;
    onStep(1);
    setMotion({ kind: "add", index: count });
    later(() => setMotion(null), ROW_MS);
  }

  function removeRow(index: number) {
    if (atMin || motion?.kind === "del") return;
    setMotion({ kind: "del", index });
    later(() => {
      onRemove(index);
      setMotion(null);
    }, ROW_MS);
  }

  function applyRecent() {
    if (!recent) return;
    onLoadRecent();
    closeSheet();
  }

  function onHandleDown(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = { y: event.clientY, active: true, delta: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onHandleMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const delta = Math.max(0, event.clientY - drag.current.y);
    drag.current.delta = delta;
    setDragY(delta);
  }

  function onHandleUp() {
    if (!drag.current.active) return;
    const delta = drag.current.delta;
    drag.current.active = false;
    drag.current.delta = 0;
    setDragY(0);
    if (delta >= DRAG_CLOSE) closeSheet();
  }

  return (
    <div className="night-root" data-testid="setup-screen">
      <form
        className={`night setup${compact ? " compact" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!issue) onStart();
        }}
      >
        <div className="body">
          <div className="kicker">참가자</div>
          <div className="hero-row">
            <div className="count" data-testid="entrant-count">
              {count}
            </div>
            <div className="stepper">
              <button
                type="button"
                className={atMin ? "disabled" : undefined}
                aria-label="줄이기"
                data-testid="setup-minus"
                disabled={atMin}
                style={atMin ? { color: DISABLED } : undefined}
                onClick={() => onStep(-1)}
              >
                −
              </button>
              <button
                type="button"
                className={atMax ? "disabled" : undefined}
                aria-label="늘리기"
                data-testid="setup-plus"
                disabled={atMax}
                style={atMax ? { color: DISABLED } : undefined}
                onClick={() => onStep(1)}
              >
                +
              </button>
            </div>
          </div>
          <div className="list" data-row-height={rowHeight}>
            {names.map((name, index) => {
              const dropping = motion?.kind === "del" && motion.index === index;
              const added = motion?.kind === "add" && motion.index === index;
              return (
                <label
                  key={index}
                  className={`row${added ? " is-add" : ""}${dropping ? " is-del" : ""}`}
                  data-row-height={dropping ? 0 : rowHeight}
                  style={dropping ? { height: 0 } : { height: rowHeight }}
                >
                  <span className="idx">{index + 1}</span>
                  <input
                    className="name"
                    aria-label={`참가자 ${index + 1}`}
                    data-testid={`entrant-name-${index}`}
                    value={name}
                    placeholder="이름"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus={index === 0 && names.every((slot) => slot.length === 0)}
                    onChange={(event) => onName(index, event.target.value)}
                  />
                  <button
                    type="button"
                    className="del"
                    aria-label={`${index + 1}번 삭제`}
                    disabled={atMin}
                    onClick={() => removeRow(index)}
                  >
                    ×
                  </button>
                </label>
              );
            })}
            {atMax ? null : (
              <button type="button" className="add-row" data-testid="setup-add" onClick={addRow}>
                + 추가
              </button>
            )}
          </div>
          {message ? (
            <p data-testid="setup-note" role={issue ? "alert" : "status"} className="issue">
              {message}
            </p>
          ) : null}
          <button type="button" className="recent-link" data-testid="setup-load" onClick={() => setSheet("open")}>
            최근 명단 불러오기
          </button>
        </div>
        <div className="foot">
          <button type="submit" className="cta" data-testid="setup-start" disabled={issue !== null}>
            라인업 보기
          </button>
        </div>
        {sheet === "closed" ? null : (
          <RecentSheet
            recent={recent}
            closing={sheet === "closing"}
            dragY={dragY}
            onClose={closeSheet}
            onPick={applyRecent}
            onHandleDown={onHandleDown}
            onHandleMove={onHandleMove}
            onHandleUp={onHandleUp}
          />
        )}
      </form>
    </div>
  );
}

function RecentSheet({
  recent,
  closing,
  dragY,
  onClose,
  onPick,
  onHandleDown,
  onHandleMove,
  onHandleUp,
}: {
  recent: readonly string[] | null;
  closing: boolean;
  dragY: number;
  onClose: () => void;
  onPick: () => void;
  onHandleDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onHandleMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onHandleUp: () => void;
}) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(true), 280);
    return () => window.clearTimeout(id);
  }, []);
  const out = closing ? " is-out" : "";
  const who = recent?.map((name) => name.trim() || "이름").join(" · ");
  return (
    <>
      <button type="button" className={`dim${out}`} aria-label="닫기" onClick={onClose} />
      <aside
        className={`sheet${out}`}
        role="dialog"
        aria-modal="true"
        aria-label="최근 참가자"
        style={
          closing
            ? undefined
            : {
                transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
                animation: dragY > 0 || settled ? "none" : undefined,
                transition: settled ? "transform 200ms ease-in" : "none",
              }
        }
      >
        <div className="handle" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} />
        <h2>최근 참가자</h2>
        {recent && who ? (
          <button type="button" className="sheet-item on" data-testid="recent-row" onClick={onPick}>
            <span className="when">{recent.length}명</span>
            <span className="who">{who}</span>
          </button>
        ) : (
          <p className="sheet-empty">불러올 최근 명단이 없습니다.</p>
        )}
      </aside>
    </>
  );
}
