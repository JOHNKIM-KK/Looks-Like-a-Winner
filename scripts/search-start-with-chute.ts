import { projectWithCamera, laneRadius, goalLineLogical, renderLane, sampleChuteLogical, type Camera } from "@/game/track";
import { progressAt } from "@/lib/race";

const GAME_WIDTH = 540;
const GAME_HEIGHT = 1170;
const CENTER_X = GAME_WIDTH / 2;
const CENTER_Y = GAME_HEIGHT * 0.474;

const LANE_GAP = 58;
const CHUTE = 158;
const STRAIGHT_BACK = 1418;
const INNER_RADIUS = 256;
const STRAIGHT = 1712;
const REFERENCE_RADIUS = INNER_RADIUS + 3 * LANE_GAP;
const GOAL_ALONG = 0.920;

function getLogicalAt(progress: number, lane: number) {
  const radius = laneRadius(lane);
  const halfBack = STRAIGHT_BACK / 2;
  const halfHome = STRAIGHT / 2;
  const corner = Math.PI * radius;
  const total = CHUTE + STRAIGHT_BACK + Math.PI * REFERENCE_RADIUS + GOAL_ALONG * STRAIGHT;
  let cursor = Math.max(0, progress * total);
  
  if (cursor <= CHUTE) {
    const x = halfBack + CHUTE - cursor;
    const y = -radius;
    return { x, y, tx: -1, ty: 0 };
  }
  cursor -= CHUTE;
  
  if (cursor <= STRAIGHT_BACK) {
    const x = halfBack - cursor;
    const y = -radius;
    return { x, y, tx: -1, ty: 0 };
  }
  cursor -= STRAIGHT_BACK;
  
  if (cursor <= corner) {
    const theta = -Math.PI / 2 + cursor / radius;
    return {
      x: -halfBack + Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      tx: -Math.cos(theta),
      ty: Math.sin(theta),
    };
  }
  cursor -= corner;
  
  if (cursor <= GOAL_ALONG * STRAIGHT) {
    const x = -halfHome + cursor;
    const y = radius;
    return { x, y, tx: 1, ty: 0 };
  }
  
  const theta = Math.PI / 2 + (cursor - GOAL_ALONG * STRAIGHT) / radius;
  return {
    x: halfHome + Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    tx: -Math.sin(theta),
    ty: Math.cos(theta),
  };
}

function cameraLookAt(
  targetX: number,
  targetY: number,
  distance: number,
  azimuth: number,
  elevation: number,
  focalLength: number
): Camera {
  const azimuthRad = azimuth * (Math.PI / 180);
  const elevationRad = elevation * (Math.PI / 180);
  
  const groundX = targetX - distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
  const groundY = targetY - distance * Math.cos(elevationRad) * Math.cos(azimuthRad);
  const height = distance * Math.sin(elevationRad);
  
  const dx = targetX - groundX;
  const dy = targetY - groundY;
  const dz = 0 - height;
  
  const yaw = Math.atan2(-dx, dy);
  const horizontalDist = Math.hypot(dx, dy);
  const pitch = Math.atan2(-dz, horizontalDist);
  
  return { groundX, groundY, height, pitch, yaw, focalLength };
}

function countChutePointsVisible(camera: Camera): { outer: number; inner: number } {
  const outerLane = 8;
  const chuteOuterLogical = sampleChuteLogical(laneRadius(outerLane) + 28, 24);
  const chuteInnerLogical = sampleChuteLogical(Math.max(70, laneRadius(1) - 34), 24);
  
  let outerVisible = 0;
  let innerVisible = 0;
  
  for (const point of chuteOuterLogical) {
    const projected = projectWithCamera({ x: point.x, y: point.y, tx: 0, ty: 0 }, camera);
    if (projected.visible && 
        projected.x >= 0 && projected.x <= GAME_WIDTH && 
        projected.y >= 0 && projected.y <= GAME_HEIGHT) {
      outerVisible++;
    }
  }
  
  for (const point of chuteInnerLogical) {
    const projected = projectWithCamera({ x: point.x, y: point.y, tx: 0, ty: 0 }, camera);
    if (projected.visible && 
        projected.x >= 0 && projected.x <= GAME_WIDTH && 
        projected.y >= 0 && projected.y <= GAME_HEIGHT) {
      innerVisible++;
    }
  }
  
  return { outer: outerVisible, inner: innerVisible };
}

console.log("=== Searching START camera with chute visibility ===\n");

const horses = Array.from({ length: 8 }, (_, i) => ({
  progress: 0,
  lane: i + 1,
  number: i + 1
}));

let packCenterX = 0;
let packCenterY = 0;
horses.forEach((h: any) => {
  const logical = getLogicalAt(h.progress, h.lane);
  packCenterX += logical.x;
  packCenterY += logical.y;
});
packCenterX /= horses.length;
packCenterY /= horses.length;

console.log(`Pack center: (${packCenterX.toFixed(1)}, ${packCenterY.toFixed(1)})\n`);

let bestResult: any = null;
let bestScore = -Infinity;

const focalLength = 1000;

// Search prioritizing chute visibility
for (let azimuth = 10; azimuth <= 50; azimuth += 2) {
  for (let elevation = 15; elevation <= 30; elevation += 2) {
    for (let distance = 300; distance <= 700; distance += 25) {
      for (let targetYOffset = -250; targetYOffset <= -100; targetYOffset += 25) {
        const camera = cameraLookAt(
          packCenterX,
          packCenterY + targetYOffset,
          distance,
          azimuth,
          elevation,
          focalLength
        );
        
        let horsesInside = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        let sumX = 0;
        let sumY = 0;
        
        horses.forEach((h: any) => {
          const logical = getLogicalAt(h.progress, h.lane);
          const projected = projectWithCamera(logical, camera);
          
          if (projected.visible && 
              projected.x >= 0 && projected.x <= GAME_WIDTH && 
              projected.y >= 0 && projected.y <= GAME_HEIGHT) {
            horsesInside++;
            minX = Math.min(minX, projected.x);
            maxX = Math.max(maxX, projected.x);
            sumX += projected.x;
            sumY += projected.y;
          }
        });
        
        if (horsesInside < 8) continue;
        
        const packSpread = maxX - minX;
        const packSpreadPercent = (packSpread / GAME_WIDTH) * 100;
        const centroidX = sumX / horsesInside;
        const centroidY = sumY / horsesInside;
        const centroidOffsetX = Math.abs(centroidX - CENTER_X) / GAME_WIDTH;
        const centroidOffsetY = Math.abs(centroidY - CENTER_Y) / GAME_HEIGHT;
        const centroidOffsetPercent = Math.max(centroidOffsetX, centroidOffsetY) * 100;
        
        // Check gate stalls
        let gateStallsInside = 0;
        for (let lane = 1; lane <= 8; lane++) {
          const radius = laneRadius(lane);
          const gateLogical = { x: 709 + 158, y: -radius, tx: -1, ty: 0 };
          const gateProjected = projectWithCamera(gateLogical, camera);
          
          if (gateProjected.visible && 
              gateProjected.x >= 0 && gateProjected.x <= GAME_WIDTH && 
              gateProjected.y >= 0 && gateProjected.y <= GAME_HEIGHT) {
            gateStallsInside++;
          }
        }
        
        // Check chute visibility
        const chutePoints = countChutePointsVisible(camera);
        const chuteVisibilityScore = chutePoints.outer + chutePoints.inner;
        
        if (gateStallsInside < 8) continue;
        if (chuteVisibilityScore < 10) continue; // Need at least 10 chute points visible
        if (centroidOffsetPercent > 12) continue;
        if (packSpreadPercent < 50 || packSpreadPercent > 90) continue;
        
        // Score with chute visibility as high priority
        const packSpreadScore = 100 - Math.abs(packSpreadPercent - 65);
        const centroidScore = Math.max(0, 100 - centroidOffsetPercent * 10);
        
        const score = 
          1000 * horsesInside +
          500 * gateStallsInside +
          100 * chuteVisibilityScore +
          10 * packSpreadScore +
          20 * centroidScore;
        
        if (score > bestScore) {
          bestScore = score;
          bestResult = {
            azimuth,
            elevation,
            distance,
            targetYOffset,
            score,
            metrics: {
              horsesInside,
              packSpread,
              packSpreadPercent,
              centroidX,
              centroidY,
              centroidOffsetPercent,
              gateStallsInside,
              chuteOuter: chutePoints.outer,
              chuteInner: chutePoints.inner,
            },
          };
        }
      }
    }
  }
}

if (!bestResult) {
  console.log("❌ No valid camera found for START");
  process.exit(1);
}

console.log("✅ Best START camera:");
console.log(`  Azimuth: ${bestResult.azimuth}°, Elevation: ${bestResult.elevation}°, Distance: ${bestResult.distance}`);
console.log(`  Target Y offset: ${bestResult.targetYOffset}`);
console.log(`  Score: ${bestResult.score.toFixed(2)}`);
console.log(`  Horses inside: ${bestResult.metrics.horsesInside}/8`);
console.log(`  Pack spread: ${bestResult.metrics.packSpreadPercent.toFixed(1)}%`);
console.log(`  Gate stalls inside: ${bestResult.metrics.gateStallsInside}/8`);
console.log(`  Chute points visible: ${bestResult.metrics.chuteOuter + bestResult.metrics.chuteInner} (outer: ${bestResult.metrics.chuteOuter}, inner: ${bestResult.metrics.chuteInner})`);
console.log(`  Centroid: (${bestResult.metrics.centroidX.toFixed(0)}, ${bestResult.metrics.centroidY.toFixed(0)}), offset: ${bestResult.metrics.centroidOffsetPercent.toFixed(1)}%`);
