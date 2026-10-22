import type { SkillKind } from "@/lib/skills";

export const FOCUS_ZOOM = 1.35;
export const ZOOM_IN = 0.35;
export const ZOOM_OUT = 0.45;
export const HORSE_UNIT = 96;
export const BEAT_FOCUS = 0.35;
export const BEAT_ANNOUNCE = 0.65;
export const BEAT_RELEASE = 0.75;
export const INTRO = BEAT_FOCUS + BEAT_ANNOUNCE + BEAT_RELEASE;
export const PAYOFF_HOLD = 1.75;
export const BANNER_HOLD = 2.6;
export const SHOW_TOTAL = INTRO + PAYOFF_HOLD;

export type ShowBeat = "focus" | "announce" | "release" | "payoff";

export type SkillScript = {
  kind: SkillKind;
  payoff: string;
  miss: string;
  color: number;
};

export const SKILL_SCRIPTS: Record<SkillKind, SkillScript> = {
  start: { kind: "start", payoff: "가속", miss: "빗나감", color: 0xfff4c2 },
  recall: { kind: "recall", payoff: "도보", miss: "빗나감", color: 0x7ec8ff },
  "final-burst": { kind: "final-burst", payoff: "가속", miss: "빗나감", color: 0xff6a2a },
  jaywalk: { kind: "jaywalk", payoff: "지름길", miss: "울타리", color: 0x8fd18a },
  shot: { kind: "shot", payoff: "정지", miss: "빗나감", color: 0xfff4c2 },
  glare: { kind: "glare", payoff: "감속", miss: "빗나감", color: 0xe23b3b },
  crown: { kind: "crown", payoff: "선두", miss: "유지", color: 0xf0c14d },
  crack: { kind: "crack", payoff: "감속", miss: "빗나감", color: 0xf4f7fb },
};

export function beatAt(age: number): ShowBeat | "idle" {
  if (age < 0) return "idle";
  if (age < BEAT_FOCUS) return "focus";
  if (age < BEAT_FOCUS + BEAT_ANNOUNCE) return "announce";
  if (age < INTRO) return "release";
  if (age < SHOW_TOTAL) return "payoff";
  return "idle";
}

export function payoffWord(kind: SkillKind, hit: boolean) {
  const script = SKILL_SCRIPTS[kind];
  return hit ? script.payoff : script.miss;
}
