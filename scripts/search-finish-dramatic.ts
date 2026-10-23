import { projectWithCamera, laneRadius, goalLineLogical, renderLane, type Camera } from "@/game/track";

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

// Horse sprite dimensions
const FRAME_HEIGHT = 211;
const HORSE_HEIGHT = 96;

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

console.log("=== Searching FINISH camera (low dramatic goal shot) ===\n");

// Horses at finish (98-99% progress)
const horses = Array.from({ length: 8 }, (_, i) => ({
  progress: 0.98 + i * 0.002,
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

const goalInner = goalLineLogical(1);
const goalOuter = goalLineLogical(8);
const goalInnerLogical = { ...goalInner, tx: 1, ty: 0 };
const goalOuterLogical = { ...goalOuter, tx: 1, ty: 0 };

let bestResult: any = null;
let bestScore = -Infinity;

// Low dramatic shot: elevation <= 25, focal length for drama
for (let focalLength = 800; focalLength <= 2000; focalLength += 100) {
  for (let azimuth = 70; azimuth <= 200; azimuth += 5) {
    for (let elevation = 10; elevation <= 25; elevation += 2) {
      for (let distance = 400; distance <= 1500; distance += 50) {
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
        const horseSpriteHeights: number[] = [];
        
        horses.forEach((h: any) => {
          const logical = getLogicalAt(h.progress, h.lane);
          const projected = projectWithCamera(logical, camera);
          
          if (projected.visible && 
              projected.x >= 0 && projected.x <= GAME_WIDTH && 
              projected.y >= 0 && projected.y <= GAME_HEIGHT) {
            horsesInside++;
            minX = Math.min(minX, projected.x);
            maxX = Math.max(maxX, projected.x);
            
            // Calculate sprite height in screen pixels
            const spriteHeight = (HORSE_HEIGHT / FRAME_HEIGHT) * projected.scale * GAME_HEIGHT;
            horseSpriteHeights.push(spriteHeight);
          }
        });
        
        if (horsesInside < 6) continue;
        
        // Median horse sprite height
        horseSpriteHeights.sort((a, b) => a - b);
        const medianHeight = horseSpriteHeights[Math.floor(horseSpriteHeights.length / 2)] ?? 0;
        if (medianHeight < 110) continue;
        
        // Horizontal spread only
        const packSpreadX = maxX - minX;
        const packSpreadPercent = (packSpreadX / GAME_WIDTH) * 100;
        
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
        
        // Score: prioritize dramatic shot (large horses, goal visible, horizontal spread)
        const horseHeightScore = Math.min(medianHeight, 200); // Cap at 200px
        const spreadScore = packSpreadPercent >= 50 && packSpreadPercent <= 85 ? 100 : 50;
        
        const score = 
          1000 * horsesInside +
          500 * (goalPostInside ? 1 : 0) +
          10 * horseHeightScore +
          5 * spreadScore;
        
        if (score > bestScore) {
          bestScore = score;
          bestResult = {
            azimuth,
            elevation,
            distance,
            focalLength,
            score,
            metrics: {
              horsesInside,
              packSpreadX,
              packSpreadPercent,
              medianHeight,
              goalPostInside,
            },
          };
        }
      }
    }
  }
}

if (!bestResult) {
  console.log("❌ No valid camera found for FINISH");
  process.exit(1);
}

console.log("✅ Best FINISH camera (low dramatic shot):");
console.log(`  Azimuth: ${bestResult.azimuth}°, Elevation: ${bestResult.elevation}°, Distance: ${bestResult.distance}, Focal: ${bestResult.focalLength}`);
console.log(`  Score: ${bestResult.score.toFixed(2)}`);
console.log(`  Horses inside: ${bestResult.metrics.horsesInside}/8`);
console.log(`  Median horse height: ${bestResult.metrics.medianHeight.toFixed(0)}px (target: >= 110px)`);
console.log(`  Pack horizontal spread: ${bestResult.metrics.packSpreadPercent.toFixed(1)}%`);
console.log(`  Goal post inside: ${bestResult.metrics.goalPostInside}`);
