import type { HorseInput } from "./race";
import type { SkillId } from "./skills";

export const mockHorses: HorseInput[] = [
  {
    id: "sprinter",
    name: "직선마",
    title: "승부상",
    color: "#e23b3b",
    portrait: "/mock/sprinter.jpg",
    skillId: "start-dash" satisfies SkillId,
    biases: { start: 5, accel: 4, stamina: -3, corner: 0, mental: 2, luck: -1 },
    reasons: [
      "눈꼬리가 올라가 직선 가속에 집착한다",
      "초반에 힘을 다 써서 후반은 헐떡인다",
    ],
  },
  {
    id: "corner",
    name: "스마트마",
    title: "스마트형",
    color: "#1f8a84",
    portrait: "/mock/corner.jpg",
    skillId: "horse-recall" satisfies SkillId,
    biases: { start: 0, accel: 2, stamina: 1, corner: -1, mental: 4, luck: 1 },
    reasons: [
      "눈이 또렷해서 남의 말을 먼저 읽는다",
      "고개가 기울면 회수 버튼을 누른다",
    ],
  },
  {
    id: "stamina",
    name: "지구마",
    title: "잠잠한 얼굴",
    color: "#d4a017",
    portrait: "/mock/stamina.jpg",
    skillId: "final-spurt" satisfies SkillId,
    biases: { start: -2, accel: 0, stamina: 5, corner: 1, mental: 4, luck: 0 },
    reasons: [
      "표정이 잠잠해서 페이스를 끝까지 지킨다",
      "초반은 느긋하고 막판에 따라붙는다",
    ],
  },
  {
    id: "luck",
    name: "얌체마",
    title: "얍삽이상",
    color: "#7c5cbf",
    portrait: "/mock/luck.jpg",
    skillId: "jaywalk" satisfies SkillId,
    biases: { start: 1, accel: 1, stamina: 0, corner: -2, mental: 2, luck: 4 },
    reasons: [
      "눈동자가 옆으로 흘러 지름길만 본다",
      "코너는 돌아가는 게 아깝다고 생각한다",
    ],
  },
  {
    id: "shot",
    name: "발포마",
    title: "범죄자상",
    color: "#8c3a3a",
    portrait: "/mock/shot.jpg",
    skillId: "gunshot" satisfies SkillId,
    biases: { start: 2, accel: 2, stamina: 0, corner: 1, mental: 3, luck: 1 },
    reasons: [
      "눈매가 가늘고 입꼬리가 비뚤다",
      "가까워지면 먼저 손을 쓴다",
    ],
  },
  {
    id: "glare",
    name: "눈총마",
    title: "노려보는 눈",
    color: "#2a6f9a",
    portrait: "/mock/glare.jpg",
    skillId: "glare" satisfies SkillId,
    biases: { start: 0, accel: 2, stamina: 1, corner: 1, mental: 5, luck: -1 },
    reasons: [
      "미간이 좁아 선두를 노려본다",
      "찍히면 발이 움츠러든다",
    ],
  },
  {
    id: "crown",
    name: "왕마",
    title: "왕이 될 관상",
    color: "#c9842a",
    portrait: "/mock/crown.jpg",
    skillId: "crown" satisfies SkillId,
    biases: { start: 1, accel: 1, stamina: 2, corner: 0, mental: 3, luck: 2 },
    reasons: [
      "표정이 낮고 자리가 자기 것처럼 보인다",
      "선두 바로 뒤까지는 참는다",
    ],
  },
  {
    id: "crack",
    name: "균열마",
    title: "강한 눈빛",
    color: "#d4537e",
    portrait: "/mock/crack.jpg",
    skillId: "screen-crack" satisfies SkillId,
    biases: { start: -1, accel: 3, stamina: 0, corner: 1, mental: 4, luck: 0 },
    reasons: [
      "눈빛이 세서 근처가 움찔한다",
      "한 번 터지면 화면까지 금이 간다",
    ],
  },
];
