import {
  CHUTE_M,
  FINISH_HOME_FRACTION,
  RACE_METERS,
  REFERENCE_RADIUS_M,
  STRAIGHT_M,
  referenceDistance,
  segmentEnds,
  ENGINE_PX_PER_M,
} from "../game/track";

const ends = segmentEnds();
const early = ends.corner12Exit;
const mid = ends.corner34Exit - ends.corner12Exit;
const late = 1 - ends.corner34Exit;
const meters = referenceDistance() / ENGINE_PX_PER_M;

console.log("=== 닫힌 타원 구간 ===");
console.log(`총거리: ${meters.toFixed(2)} m`);
console.log(`슈트: ${CHUTE_M.toFixed(2)} m`);
console.log(`직선: ${STRAIGHT_M.toFixed(2)} m`);
console.log(`기준 반경: ${REFERENCE_RADIUS_M.toFixed(2)} m`);
console.log(`초반 (게이트→1·2코너 출구): ${(early * 100).toFixed(2)}%`);
console.log(`중반 (맞은편+3·4코너): ${(mid * 100).toFixed(2)}%`);
console.log(`막판 (홈 직선→결승): ${(late * 100).toFixed(2)}%`);

const earlyM = (CHUTE_M + STRAIGHT_M + Math.PI * REFERENCE_RADIUS_M) / RACE_METERS;
const midM = (STRAIGHT_M + Math.PI * REFERENCE_RADIUS_M) / RACE_METERS;
const lateM = (FINISH_HOME_FRACTION * STRAIGHT_M) / RACE_METERS;
const ok =
  Math.abs(meters - RACE_METERS) < 0.05 &&
  Math.abs(early - earlyM) < 0.002 &&
  Math.abs(mid - midM) < 0.002 &&
  Math.abs(late - lateM) < 0.002;

console.log(ok ? "\n구간이 닫힌 타원 공식과 일치합니다." : "\n구간이 공식과 어긋납니다.");
process.exit(ok ? 0 : 1);
