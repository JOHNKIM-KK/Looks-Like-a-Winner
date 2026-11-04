import { projectWithCamera, laneRadius, goalLineLogical, type Camera } from "@/game/track";

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

function validateCamera(
  name: string,
  azimuth: number,
  elevation: number,
  distance: number,
  focalLength: number,
  progress: number,
  targetYOffset: number = 0
) {
  console.log(`\n=== Validating ${name} camera ===`);
  console.log(`  Azimuth: ${azimuth}°, Elevation: ${elevation}°, Distance: ${distance}, Focal: ${focalLength}`);
  
  const horses = Array.from({ length: 8 }, (_, i) => ({
    progress,
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
  
  console.log(`\n  Horse positions:`);
  horses.forEach(h => {
    const logical = getLogicalAt(h.progress, h.lane);
    const projected = projectWithCamera(logical, camera);
    
    const inside = projected.visible && 
      projected.x >= 0 && projected.x <= GAME_WIDTH && 
      projected.y >= 0 && projected.y <= GAME_HEIGHT;
    
    if (inside) {
      horsesInside++;
      minX = Math.min(minX, projected.x);
      maxX = Math.max(maxX, projected.x);
      sumX += projected.x;
      sumY += projected.y;
    }
    
    console.log(`    Lane ${h.lane}: (${projected.x.toFixed(0)}, ${projected.y.toFixed(0)}) ${inside ? '✓' : '✗'}`);
  });
  
  const packSpread = maxX - minX;
  const packSpreadPercent = (packSpread / GAME_WIDTH) * 100;
  const centroidX = sumX / horsesInside;
  const centroidY = sumY / horsesInside;
  const centroidOffsetX = Math.abs(centroidX - CENTER_X);
  const centroidOffsetY = Math.abs(centroidY - CENTER_Y);
  const centroidOffsetPercent = Math.max(
    (centroidOffsetX / GAME_WIDTH) * 100,
    (centroidOffsetY / GAME_HEIGHT) * 100
  );
  
  console.log(`\n  Metrics:`);
  console.log(`    Horses inside: ${horsesInside}/8`);
  console.log(`    Pack spread: ${packSpread.toFixed(1)}px (${packSpreadPercent.toFixed(1)}%)`);
  console.log(`    Centroid: (${centroidX.toFixed(0)}, ${centroidY.toFixed(0)})`);
  console.log(`    Centroid offset: ${centroidOffsetX.toFixed(0)}px, ${centroidOffsetY.toFixed(0)}px (${centroidOffsetPercent.toFixed(1)}%)`);
  
  if (name === "START") {
    console.log(`\n  Gate stalls:`);
    let gateMinX = Infinity;
    let gateMaxX = -Infinity;
    let gateStallsInside = 0;
    
    for (let lane = 1; lane <= 8; lane++) {
      const radius = laneRadius(lane);
      const gateLogical = { x: 709 + 158, y: -radius, tx: -1, ty: 0 };
      const gateProjected = projectWithCamera(gateLogical, camera);
      
      const inside = gateProjected.visible && 
        gateProjected.x >= 0 && gateProjected.x <= GAME_WIDTH && 
        gateProjected.y >= 0 && gateProjected.y <= GAME_HEIGHT;
      
      if (inside) {
        gateStallsInside++;
        gateMinX = Math.min(gateMinX, gateProjected.x);
        gateMaxX = Math.max(gateMaxX, gateProjected.x);
      }
      
      console.log(`    Lane ${lane}: (${gateProjected.x.toFixed(0)}, ${gateProjected.y.toFixed(0)}) ${inside ? '✓' : '✗'}`);
    }
    
    const gateSpread = gateMaxX - gateMinX;
    const gateSpreadPercent = (gateSpread / GAME_WIDTH) * 100;
    console.log(`    Gate spread: ${gateSpread.toFixed(1)}px (${gateSpreadPercent.toFixed(1)}%)`);
    console.log(`    Gate stalls inside: ${gateStallsInside}/8`);
  }
  
  if (name === "FINISH") {
    console.log(`\n  Goal posts:`);
    const goalInner = goalLineLogical(1);
    const goalOuter = goalLineLogical(8);
    const goalInnerLogical = { ...goalInner, tx: 1, ty: 0 };
    const goalOuterLogical = { ...goalOuter, tx: 1, ty: 0 };
    
    const goalInnerProj = projectWithCamera(goalInnerLogical, camera);
    const goalOuterProj = projectWithCamera(goalOuterLogical, camera);
    
    const innerInside = goalInnerProj.visible && 
      goalInnerProj.x >= 0 && goalInnerProj.x <= GAME_WIDTH && 
      goalInnerProj.y >= 0 && goalInnerProj.y <= GAME_HEIGHT;
    
    const outerInside = goalOuterProj.visible && 
      goalOuterProj.x >= 0 && goalOuterProj.x <= GAME_WIDTH && 
      goalOuterProj.y >= 0 && goalOuterProj.y <= GAME_HEIGHT;
    
    console.log(`    Inner: (${goalInnerProj.x.toFixed(0)}, ${goalInnerProj.y.toFixed(0)}) ${innerInside ? '✓' : '✗'}`);
    console.log(`    Outer: (${goalOuterProj.x.toFixed(0)}, ${goalOuterProj.y.toFixed(0)}) ${outerInside ? '✓' : '✗'}`);
    console.log(`    Goal post inside: ${innerInside && outerInside}`);
  }
  
  // Pass/fail assessment
  console.log(`\n  Assessment:`);
  const checks = [];
  
  if (horsesInside === 8) {
    checks.push('✓ All 8 horses visible');
  } else {
    checks.push(`✗ Only ${horsesInside}/8 horses visible`);
  }
  
  if (packSpreadPercent >= 60 && packSpreadPercent <= 85) {
    checks.push('✓ Pack spread in ideal range (60-85%)');
  } else {
    checks.push(`✗ Pack spread ${packSpreadPercent.toFixed(1)}% (target: 60-85%)`);
  }
  
  if (centroidOffsetPercent <= 10) {
    checks.push('✓ Centroid within 10% of center');
  } else {
    checks.push(`✗ Centroid offset ${centroidOffsetPercent.toFixed(1)}% (target: ≤10%)`);
  }
  
  checks.forEach(check => console.log(`    ${check}`));
}

// Validate current camera parameters
validateCamera("START", 25, 24, 300, 1000, 0, -200);
validateCamera("FINISH", 90, 39, 2000, 1500, 0.95, 0);
