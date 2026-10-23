import { poseAt, createDefaultCamera } from "../game/track";

const camera = createDefaultCamera();
console.log("카메라:", camera);
console.log("\n샘플 점 가시성:");

for (const [label, progress, lane] of [
  ["출발(레인4)", 0, 4],
  ["코너(레인4)", 0.5, 4],
  ["골(레인4)", 1.0, 4],
] as const) {
  const pose = poseAt(progress, lane);
  console.log(`${label}: visible=${pose.visible}, x=${pose.x.toFixed(1)}, y=${pose.y.toFixed(1)}, scale=${pose.scale.toFixed(3)}`);
}

// 전체 통계
let visibleCount = 0;
let invisibleCount = 0;

for (let lane = 1; lane <= 8; lane++) {
  for (let i = 0; i <= 100; i++) {
    const progress = i / 100;
    const pose = poseAt(progress, lane);
    if (pose.visible) visibleCount++;
    else invisibleCount++;
  }
}

console.log(`\n전체: visible=${visibleCount}, invisible=${invisibleCount}`);
