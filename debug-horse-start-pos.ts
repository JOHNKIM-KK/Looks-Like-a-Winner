import { laneRadius } from "./game/track";

function getLogicalAt(progress: number, lane: number) {
  const STRAIGHT = 1712;
  const INNER_RADIUS = 256;
  const LANE_GAP = 58;
  const CHUTE = 158;
  const STRAIGHT_BACK = 1418;
  const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;
  const GOAL_ALONG = 0.920;
  
  const radius = laneRadius(lane);
  const halfBack = STRAIGHT_BACK / 2;
  const corner = Math.PI * radius;
  const total = CHUTE + STRAIGHT_BACK + Math.PI * REFERENCE_RADIUS + GOAL_ALONG * STRAIGHT;
  let cursor = Math.max(0, progress * total);
  
  if (cursor <= CHUTE) {
    const x = halfBack + CHUTE - cursor;
    const y = -radius;
    return { x, y, tx: -1, ty: 0 };
  }
  
  return { x: 0, y: 0, tx: 0, ty: 0 };
}

console.log("Horse positions at START (progress = 0):");
for (let lane = 1; lane <= 8; lane++) {
  const pos = getLogicalAt(0, lane);
  console.log(`Lane ${lane}: (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
}

const avgX = Array.from({ length: 8 }, (_, i) => getLogicalAt(0, i + 1).x).reduce((a, b) => a + b, 0) / 8;
const avgY = Array.from({ length: 8 }, (_, i) => getLogicalAt(0, i + 1).y).reduce((a, b) => a + b, 0) / 8;

console.log(`\nPack center at START: (${avgX.toFixed(0)}, ${avgY.toFixed(0)})`);
