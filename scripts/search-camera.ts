import { projectWithCamera, laneRadius, goalLineLogical, renderLane, type Camera } from "@/game/track";
import { progressAt } from "@/lib/race";
import { readFile } from "fs/promises";

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

// EXACT times matching screenshot capture
export const SCREENSHOT_TIMES = {
  START: 0.0,      // Gate, before race starts
  FINISH: 36.0,    // Near finish line (adjusted to ensure lead >= 0.9)
};

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

async function loadRaceData() {
  // Use fixed progress values for consistent testing
  // START: all horses at progress 0
  // FINISH: horses at ~90-95% progress
  return null; // Will use hardcoded progress values
}

function searchStartCamera(raceData: any): SearchResult {
  console.log("=== Searching START camera ===");
  console.log(`Using exact screenshot time: ${SCREENSHOT_TIMES.START}s\n`);
  
  // All horses start at progress 0, lanes 1-8
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
  
  console.log(`Pack center at t=${SCREENSHOT_TIMES.START}s: (${packCenterX.toFixed(1)}, ${packCenterY.toFixed(1)})`);
  console.log(`Horse progresses:`, horses.map((h: any) => `Lane ${h.lane}: ${(h.progress * 100).toFixed(1)}%`).join(', '));
  
  let bestResult: SearchResult | null = null;
  let bestScore = -Infinity;
  
  const focalLength = 1000;
  
  // Wider search for START - allow higher centroid offset initially
  for (let azimuth = 15; azimuth <= 45; azimuth += 2) {
    for (let elevation = 20; elevation <= 35; elevation += 2) {
      for (let distance = 250; distance <= 600; distance += 25) {
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
        
        if (gateStallsInside < 8) continue;
        if (centroidOffsetPercent > 12) continue; // Slightly relaxed from 10%
        if (packSpreadPercent < 55 || packSpreadPercent > 90) continue;
        
        // Score with balanced priorities
        const packSpreadScore = 100 - Math.abs(packSpreadPercent - 70);
        const gateSpreadScore = 100 - Math.abs(gateSpreadPercent - 65);
        const centroidScore = Math.max(0, 100 - centroidOffsetPercent * 10);
        
        const score = 
          1000 * horsesInside +
          500 * gateStallsInside +
          10 * packSpreadScore +
          10 * gateSpreadScore +
          20 * centroidScore;
        
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
}
  
  if (!bestResult) {
    console.log("❌ No valid camera found for START");
    process.exit(1);
  }
  
  console.log("\n✅ Best START camera:");
  console.log(`  Azimuth: ${bestResult.azimuth}°, Elevation: ${bestResult.elevation}°, Distance: ${bestResult.distance}`);
  console.log(`  Score: ${bestResult.score.toFixed(2)}`);
  console.log(`  Horses inside: ${bestResult.metrics.horsesInside}/8`);
  console.log(`  Pack spread: ${bestResult.metrics.packSpreadPercent.toFixed(1)}%`);
  console.log(`  Gate spread: ${bestResult.metrics.gateSpreadPercent?.toFixed(1)}%`);
  console.log(`  Centroid: (${bestResult.metrics.centroidX.toFixed(0)}, ${bestResult.metrics.centroidY.toFixed(0)}), offset: ${bestResult.metrics.centroidOffsetPercent.toFixed(1)}%`);
  
  return bestResult;
}

function searchFinishCamera(raceData: any): SearchResult {
  console.log("\n=== Searching FINISH camera ===");
  console.log(`Using exact screenshot time: ${SCREENSHOT_TIMES.FINISH}s\n`);
  
  // Horses at finish (100% progress)
  const horses = Array.from({ length: 8 }, (_, i) => ({
    progress: 0.98 + i * 0.002, // 98.0% to 99.4%
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
  
  console.log(`Pack center at t=${SCREENSHOT_TIMES.FINISH}s: (${packCenterX.toFixed(1)}, ${packCenterY.toFixed(1)})`);
  console.log(`Horse progresses:`, horses.map((h: any) => `Lane ${h.lane}: ${(h.progress * 100).toFixed(1)}%`).join(', '));
  
  const goalInner = goalLineLogical(1);
  const goalOuter = goalLineLogical(8);
  const goalInnerLogical = { ...goalInner, tx: 1, ty: 0 };
  const goalOuterLogical = { ...goalOuter, tx: 1, ty: 0 };
  
  let bestResult: SearchResult | null = null;
  let bestScore = -Infinity;
  
  const focalLength = 1500;
  
  // Wider search for FINISH
  for (let azimuth = 70; azimuth <= 200; azimuth += 5) {
    for (let elevation = 25; elevation <= 45; elevation += 2) {
      for (let distance = 1000; distance <= 2500; distance += 100) {
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
        if (centroidOffsetPercent > 10) continue;
        if (packSpreadPercent < 60 || packSpreadPercent > 85) continue;
        
        // Score with balanced priorities
        const packSpreadScore = 100 - Math.abs(packSpreadPercent - 72.5);
        const centroidScore = Math.max(0, 100 - centroidOffsetPercent * 10);
        
        const score = 
          1000 * horsesInside +
          500 * (goalPostInside ? 1 : 0) +
          10 * packSpreadScore +
          20 * centroidScore;
        
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
  
  console.log("\n✅ Best FINISH camera:");
  console.log(`  Azimuth: ${bestResult.azimuth}°, Elevation: ${bestResult.elevation}°, Distance: ${bestResult.distance}`);
  console.log(`  Score: ${bestResult.score.toFixed(2)}`);
  console.log(`  Horses inside: ${bestResult.metrics.horsesInside}/8`);
  console.log(`  Pack spread: ${bestResult.metrics.packSpreadPercent.toFixed(1)}%`);
  console.log(`  Centroid: (${bestResult.metrics.centroidX.toFixed(0)}, ${bestResult.metrics.centroidY.toFixed(0)}), offset: ${bestResult.metrics.centroidOffsetPercent.toFixed(1)}%`);
  console.log(`  Goal post inside: ${bestResult.metrics.goalPostInside}`);
  
  return bestResult;
}

async function main() {
  const raceData = await loadRaceData();
  
  const startResult = searchStartCamera(raceData);
  const finishResult = searchFinishCamera(raceData);
  
  console.log("\n=== Summary ===");
  console.log(`START (t=${SCREENSHOT_TIMES.START}s): azimuth=${startResult.azimuth}, elevation=${startResult.elevation}, distance=${startResult.distance}`);
  console.log(`FINISH (t=${SCREENSHOT_TIMES.FINISH}s): azimuth=${finishResult.azimuth}, elevation=${finishResult.elevation}, distance=${finishResult.distance}`);
}

main().catch(console.error);
