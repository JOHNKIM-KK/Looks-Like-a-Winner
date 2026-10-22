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
  effect: string;
  miss: string;
};

export const SKILLS: Skill[] = [
  {
    id: "start-dash",
    name: "스타트 대시",
    shout: "스타트 대시!",
    kind: "start",
    effect: "직선에서 크게 가속한다",
    miss: "타이밍이 어긋나 가속이 없다",
  },
  {
    id: "horse-recall",
    name: "말 회수",
    shout: "회수 완료!",
    kind: "recall",
    effect: "다른 말들이 내려서 걷는다",
    miss: "회수할 말이 없다",
  },
  {
    id: "final-spurt",
    name: "막판 스퍼트",
    shout: "막판 스퍼트!",
    kind: "final-burst",
    effect: "마지막 직선에서 속도를 올린다",
    miss: "막판이 아니라 스퍼트가 안 붙는다",
  },
  {
    id: "jaywalk",
    name: "지름길 사용",
    shout: "지름길!",
    kind: "jaywalk",
    effect: "코너 안쪽을 가로질러 간다",
    miss: "울타리에 막혀 지름길이 끊긴다",
  },
  {
    id: "gunshot",
    name: "따발총",
    shout: "다다다닥!",
    kind: "shot",
    effect: "바로 옆 말을 멈춰 세운다",
    miss: "사정거리 안에 말이 없어 빗나간다",
  },
  {
    id: "glare",
    name: "눈총",
    shout: "너 찍혔어!",
    kind: "glare",
    effect: "선두를 노려봐 그 말의 속도가 꺾인다",
    miss: "선두가 멀어 눈총이 닿지 않는다",
  },
  {
    id: "crown",
    name: "즉위",
    shout: "주상전하 납시오!",
    kind: "crown",
    effect: "선두와 자리가 바뀌어 순위가 뒤집힌다",
    miss: "이미 선두라 자리가 그대로다",
  },
  {
    id: "screen-crack",
    name: "액정 붕괴",
    shout: "액정 붕괴!",
    kind: "crack",
    effect: "근처 말이 움찔하며 느려지고 화면에 금이 간다",
    miss: "근처에 말이 없어 금만 잠시 간다",
  },
];

const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

export function skillById(id: SkillId) {
  const skill = SKILL_BY_ID.get(id);
  if (!skill) throw new Error(`unknown skill: ${id}`);
  return skill;
}
