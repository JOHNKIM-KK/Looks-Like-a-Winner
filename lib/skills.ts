export const SKILL_IDS = [
  "start-dash",
  "horse-recall",
  "final-spurt",
  "jaywalk",
  "gunshot",
  "glare",
  "crown",
  "screen-crack",
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export type SkillKind = "start" | "recall" | "final-burst" | "jaywalk" | "shot" | "glare" | "crown" | "crack";

export type Skill = {
  id: SkillId;
  name: string;
  shout: string;
  kind: SkillKind;
};

export const SKILLS: Skill[] = [
  { id: "start-dash", name: "스타트 대시", shout: "스타트 대시!", kind: "start" },
  { id: "horse-recall", name: "말 회수", shout: "회수 완료!", kind: "recall" },
  { id: "final-spurt", name: "막판 스퍼트", shout: "막판 스퍼트!", kind: "final-burst" },
  { id: "jaywalk", name: "지름길 사용", shout: "지름길!", kind: "jaywalk" },
  { id: "gunshot", name: "따발총", shout: "다다다닥!", kind: "shot" },
  { id: "glare", name: "눈총", shout: "너 찍혔어!", kind: "glare" },
  { id: "crown", name: "즉위", shout: "주상전하 납시오!", kind: "crown" },
  { id: "screen-crack", name: "액정 붕괴", shout: "액정 붕괴!", kind: "crack" },
];

const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

export function skillById(id: SkillId) {
  const skill = SKILL_BY_ID.get(id);
  if (!skill) throw new Error(`unknown skill: ${id}`);
  return skill;
}
