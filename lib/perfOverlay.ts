/**
 * Phone-side frame timing, switched on with `?perf=1`. No Web Inspector needed.
 * Shows the last second's fps in a corner and keeps frame times per race segment.
 * Tap the badge to see (and copy) the per-segment report. Without the flag nothing runs.
 */

type CameraProbe = { state?: string; finishPhase?: string; raceTime?: number; wallClock?: number };

type Segment = { label: string; dts: number[]; order: number };

export function perfOverlayRequested(search: string) {
  return new URLSearchParams(search).get("perf") === "1";
}

function segmentLabel(probe: CameraProbe | undefined) {
  if (!probe) return "loading";
  const phase = probe.finishPhase;
  if (phase && !["before", "track", "stretch"].includes(phase)) return `finish:${phase}`;
  if ((probe.raceTime ?? 0) <= 0) return (probe.wallClock ?? 0) < 5 ? "intro(drone)" : "countdown";
  return `race:${probe.state ?? "?"}`;
}

function quantile(sorted: number[], q: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

export function startPerfOverlay() {
  const badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;left:4px;top:4px;z-index:99999;background:#000b;color:#0f0;font:11px/1.35 monospace;padding:3px 6px;border-radius:4px;white-space:pre-wrap;max-width:92vw;max-height:80vh;overflow:auto";
  document.body.appendChild(badge);

  const segments = new Map<string, Segment>();
  let showReport = false;
  let frames = 0;
  let worst = 0;
  let mark = performance.now();
  let last = mark;
  let line = "perf…";
  let raf = 0;

  const report = () => {
    const rows = [...segments.values()]
      .filter((segment) => segment.dts.length >= 10)
      .sort((a, b) => a.order - b.order)
      .map((segment) => {
        const sorted = [...segment.dts].sort((a, b) => a - b);
        const avg = segment.dts.reduce((sum, dt) => sum + dt, 0) / segment.dts.length;
        return `${segment.label.padEnd(20)} ${(1000 / avg).toFixed(0).padStart(3)}fps avg ${avg.toFixed(0)}ms p95 ${quantile(sorted, 0.95).toFixed(0)}ms`;
      });
    return rows.join("\n");
  };

  const render = () => {
    badge.textContent = showReport ? `${line}\n${report()}\n(tap: close)` : line;
  };

  const tick = (now: number) => {
    const dt = now - last;
    last = now;
    frames += 1;
    worst = Math.max(worst, dt);

    const label = segmentLabel((window as Window & { __raceCamera?: CameraProbe }).__raceCamera);
    let segment = segments.get(label);
    if (!segment) {
      segment = { label, dts: [], order: segments.size };
      segments.set(label, segment);
    }
    segment.dts.push(dt);

    if (now - mark >= 1000) {
      line = `${frames} fps  worst ${worst.toFixed(0)}ms  ${label}`;
      frames = 0;
      worst = 0;
      mark = now;
      render();
    }
    raf = requestAnimationFrame(tick);
  };

  badge.addEventListener("click", () => {
    showReport = !showReport;
    render();
    if (showReport) void navigator.clipboard?.writeText(report()).catch(() => undefined);
  });

  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    badge.remove();
  };
}
