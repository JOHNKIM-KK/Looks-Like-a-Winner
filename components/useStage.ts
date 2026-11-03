"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { stageFor, type Stage, type StageInput } from "@/game/stage";

export const SAFE_AREA_PADDING: CSSProperties = {
  paddingTop: "env(safe-area-inset-top)",
  paddingRight: "env(safe-area-inset-right)",
  paddingBottom: "env(safe-area-inset-bottom)",
  paddingLeft: "env(safe-area-inset-left)",
};

const TOUCH_PORTRAIT = "(orientation: portrait) and (pointer: coarse)";

export function readStageInput(shell: HTMLElement): StageInput | null {
  const box = shell.getBoundingClientRect();
  if (!(box.width >= 1 && box.height >= 1)) return null;
  const style = getComputedStyle(shell);
  const px = (value: string) => Math.max(0, Number.parseFloat(value) || 0);
  return {
    viewport: { width: box.width, height: box.height },
    insets: {
      top: px(style.paddingTop),
      right: px(style.paddingRight),
      bottom: px(style.paddingBottom),
      left: px(style.paddingLeft),
    },
    pixelRatio: window.devicePixelRatio || 1,
    touchPortrait: window.matchMedia(TOUCH_PORTRAIT).matches,
  };
}

function sameInput(a: StageInput, b: StageInput) {
  return (
    a.viewport.width === b.viewport.width &&
    a.viewport.height === b.viewport.height &&
    a.insets.top === b.insets.top &&
    a.insets.right === b.insets.right &&
    a.insets.bottom === b.insets.bottom &&
    a.insets.left === b.insets.left &&
    a.pixelRatio === b.pixelRatio &&
    a.touchPortrait === b.touchPortrait
  );
}

/** The shell must cover the viewport and carry `SAFE_AREA_PADDING`. Null until the first measurement. */
export function useStage(shellRef: RefObject<HTMLElement | null>): Stage | null {
  const [stage, setStage] = useState<Stage | null>(null);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    let last: StageInput | null = null;
    let dpr: MediaQueryList | null = null;

    function measure() {
      if (!shell) return;
      const input = readStageInput(shell);
      if (!input || (last && sameInput(last, input))) return;
      last = input;
      setStage(stageFor(input));
      watchPixelRatio(input.pixelRatio);
    }

    function watchPixelRatio(ratio: number) {
      dpr?.removeEventListener("change", measure);
      dpr = window.matchMedia(`(resolution: ${ratio}dppx)`);
      dpr.addEventListener("change", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    const portrait = window.matchMedia(TOUCH_PORTRAIT);
    portrait.addEventListener("change", measure);
    measure();
    return () => {
      observer.disconnect();
      portrait.removeEventListener("change", measure);
      dpr?.removeEventListener("change", measure);
    };
  }, [shellRef]);

  return stage;
}
