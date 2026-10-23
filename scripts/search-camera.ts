import { projectWithCamera, laneRadius, goalLineLogical, type Camera } from "@/game/track";
import { getCameraForState, type RaceSnapshot } from "@/game/cameraState";

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

type SearchResult = {
  azimuth: number;
  elevation: number;
  distance: number;
  score: number;
  metrics: {
    horsesInside: number;
    packSpread: number;
    packSpreadPercent: number;
    centroidX: number;
    centroidY: number;
    centroidOffsetPercent: number;
    gateSpread?: number;
    gateSpreadPercent?: number;
    goalPostInside?: boolean;
  };
};

function searchStartCamera(): SearchResult {
  console.log("=== Searching START camera ===\n");
  
  const horses = Array.from({ length: 8 }, (_, i) => ({
    progress: 0,
    lane: i + 1,
  }));
  
  let packCenterX = 0;
  let packCenterY = 0;
  horses.forEach(h => {
    const logical = getLogicalAt(h.progress, h.lane);
    packCenterX += logical.x;
    packCenterY += logical.y;
  });
  packCenterX /= horses.length;
  packCenterY /= horses.length;
  
  console.log(`Pack center: (${packCenterX.toFixed(1)}, ${packCenterY.toFixed(1)})`);
  
  let bestResult: SearchResult | null = null;
  let bestScore = -Infinity;
  let totalCandidates = 0;
  let horsesInsideFailures = 0;
  let gateFailures = 0;
  let packSpreadFailures = 0;
  let centroidFailures = 0;
  
  const focalLength = 1000;
  
  // Focused search around azimuth 165
  for (let azimuth = 140; azimuth <= 200; azimuth += 2) {
    for (let elevation = 20; elevation <= 32; elevation += 2) {
      for (let distance = 400; distance <= 1200; distance += 50) {
        totalCandidates++;
        const camera = cameraLookAt(
          packCenterX,
          packCenterY - 200,
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
        
        horses.forEach(h => {
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
        let gateMinX = Infinity;
        let gateMaxX = -Infinity;
        let gateStallsInside = 0;
        
        for (let lane = 1; lane <= 8; lane++) {
          const radius = laneRadius(lane);
          const gateLogical = { x: 709 + 158, y: -radius, tx: -1, ty: 0 };
          const gateProjected = projectWithCamera(gateLogical, camera);
          
          if (gateProjected.visible && 
              gateProjected.x >= 0 && gateProjected.x <= GAME_WIDTH && 
              gateProjected.y >= 0 && gateProjected.y <= GAME_HEIGHT) {
            gateStallsInside++;
            gateMinX = Math.min(gateMinX, gateProjected.x);
            gateMaxX = Math.max(gateMaxX, gateProjected.x);
          }
        }
        
        const gateSpread = gateMaxX - gateMinX;
        const gateSpreadPercent = (gateSpread / GAME_WIDTH) * 100;
        
        // Relaxed criteria to find ANY valid camera
        if (horsesInside < 8) { horsesInsideFailures++; continue; }
        if (gateStallsInside < 8) { gateFailures++; continue; }
        if (packSpreadPercent < 40 || packSpreadPercent > 95) { packSpreadFailures++; continue; }
        if (centroidOffsetPercent > 15) { centroidFailures++; continue; }
        
        const score = 
          1000 * horsesInside +
          500 * gateStallsInside +
          300 * gateSpreadPercent +
          200 * Math.max(0, 1 - centroidOffsetPercent / 15) +
          100 * (packSpreadPercent >= 60 && packSpreadPercent <= 85 ? packSpreadPercent : packSpreadPercent * 0.5);
        
        if (score > bestScore) {
          bestScore = score;
          bestResult = {
            azimuth,
            elevation,
            distance,
            score,
            metrics: {
              horsesInside,
              packSpread,
              packSpreadPercent,
              centroidX,
              centroidY,
              centroidOffsetPercent,
              gateSpread,
              gateSpreadPercent,
            },
          };
        }
      }
    }
  }
  
  if (!bestResult) {
    console.log("❌ No valid camera found for START");
    console.log(`  Total candidates: ${totalCandidates}`);
    console.log(`  Failed horses inside check: ${horsesInsideFailures}`);
    console.log(`  Failed gate check: ${gateFailures}`);
    console.log(`  Failed pack spread check: ${packSpreadFailures}`);
    console.log(`  Failed centroid check: ${centroidFailures}`);
    process.exit(1);
  }
  
  console.log("✅ Best START camera:");
  console.log(`  Azimuth: ${bestResult.azimuth}°, Elevation: ${bestResult.elevation}°, Distance: ${bestResult.distance}`);
  console.log(`  Score: ${bestResult.score.toFixed(2)}`);
  console.log(`  Horses inside: ${bestResult.metrics.horsesInside}/8`);
  console.log(`  Pack spread: ${bestResult.metrics.packSpreadPercent.toFixed(1)}%`);
  console.log(`  Centroid: (${bestResult.metrics.centroidX.toFixed(0)}, ${bestResult.metrics.centroidY.toFixed(0)}), offset: ${bestResult.metrics.centroidOffsetPercent.toFixed(1)}%`);
  console.log(`  Gate spread: ${bestResult.metrics.gateSpreadPercent?.toFixed(1)}%`);
  
  return bestResult;
}

function searchFinishCamera(): SearchResult {
  console.log("\n=== Searching FINISH camera ===\n");
  
  const horses = Array.from({ length: 8 }, (_, i) => ({
    progress: 0.95,
    lane: i + 1,
  }));
  
  let packCenterX = 0;
  let packCenterY = 0;
  horses.forEach(h => {
    const logical = getLogicalAt(h.progress, h.lane);
    packCenterX += logical.x;
    packCenterY += logical.y;
  });
  packCenterX /= horses.length;
  packCenterY /= horses.length;
  
  console.log(`Pack center: (${packCenterX.toFixed(1)}, ${packCenterY.toFixed(1)})`);
  
  const goalInner = goalLineLogical(1);
  const goalOuter = goalLineLogical(8);
  const goalInnerLogical = { ...goalInner, tx: 1, ty: 0 };
  const goalOuterLogical = { ...goalOuter, tx: 1, ty: 0 };
  
  let bestResult: SearchResult | null = null;
  let bestScore = -Infinity;
  
  const focalLength = 1500;
  
  // Focused search around azimuth 105
  for (let azimuth = 80; azimuth <= 130; azimuth += 2) {
    for (let elevation = 22; elevation <= 34; elevation += 2) {
      for (let distance = 1000; distance <= 1400; distance += 25) {
        const camera = cameraLookAt(
          packCenterX,
          packCenterY,
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
        
        horses.forEach(h => {
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
        
        if (horsesInside < 6) continue;
        
        const packSpread = maxX - minX;
        const packSpreadPercent = (packSpread / GAME_WIDTH) * 100;
        const centroidX = sumX / horsesInside;
        const centroidY = sumY / horsesInside;
        const centroidOffsetX = Math.abs(centroidX - CENTER_X) / GAME_WIDTH;
        const centroidOffsetY = Math.abs(centroidY - CENTER_Y) / GAME_HEIGHT;
        const centroidOffsetPercent = Math.max(centroidOffsetX, centroidOffsetY) * 100;
        
        // Check goal posts
        const goalInnerProj = projectWithCamera(goalInnerLogical, camera);
        const goalOuterProj = projectWithCamera(goalOuterLogical, camera);
        const goalPostInside = 
          goalInnerProj.visible && 
          goalInnerProj.x >= 0 && goalInnerProj.x <= GAME_WIDTH && 
          goalInnerProj.y >= 0 && goalInnerProj.y <= GAME_HEIGHT &&
          goalOuterProj.visible && 
          goalOuterProj.x >= 0 && goalOuterProj.x <= GAME_WIDTH && 
          goalOuterProj.y >= 0 && goalOuterProj.y <= GAME_HEIGHT;
        
        if (!goalPostInside) continue;
        if (horsesInside < 8) continue;
        if (!goalPostInside) continue;
        if (packSpreadPercent < 60 || packSpreadPercent > 85) continue;
        if (centroidOffsetPercent > 10) continue;
        
        const score = 
          1000 * horsesInside +
          500 * (goalPostInside ? 1 : 0) +
          200 * Math.max(0, 1 - centroidOffsetPercent / 10) +
          100 * (packSpreadPercent >= 60 && packSpreadPercent <= 85 ? packSpreadPercent : 0);
        
        if (score > bestScore) {
          bestScore = score;
          bestResult = {
            azimuth,
            elevation,
            distance,
            score,
            metrics: {
              horsesInside,
              packSpread,
              packSpreadPercent,
              centroidX,
              centroidY,
              centroidOffsetPercent,
              goalPostInside,
            },
          };
        }
      }
    }
  }
  
  if (!bestResult) {
    console.log("❌ No valid camera found for FINISH");
    process.exit(1);
  }
  
  console.log("✅ Best FINISH camera:");
  console.log(`  Azimuth: ${bestResult.azimuth}°, Elevation: ${bestResult.elevation}°, Distance: ${bestResult.distance}`);
  console.log(`  Score: ${bestResult.score.toFixed(2)}`);
  console.log(`  Horses inside: ${bestResult.metrics.horsesInside}/8`);
  console.log(`  Pack spread: ${bestResult.metrics.packSpreadPercent.toFixed(1)}%`);
  console.log(`  Centroid: (${bestResult.metrics.centroidX.toFixed(0)}, ${bestResult.metrics.centroidY.toFixed(0)}), offset: ${bestResult.metrics.centroidOffsetPercent.toFixed(1)}%`);
  console.log(`  Goal post inside: ${bestResult.metrics.goalPostInside}`);
  
  return bestResult;
}

const startResult = searchStartCamera();
const finishResult = searchFinishCamera();

console.log("\n=== Summary ===");
console.log(`START: azimuth=${startResult.azimuth}, elevation=${startResult.elevation}, distance=${startResult.distance}`);
console.log(`FINISH: azimuth=${finishResult.azimuth}, elevation=${finishResult.elevation}, distance=${finishResult.distance}`);
