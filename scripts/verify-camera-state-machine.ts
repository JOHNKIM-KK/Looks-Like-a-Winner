import { simulateRace } from "@/lib/race";
import { mockHorses } from "@/lib/mockHorses";
import { createInitialState, nextCameraState, type CameraState, type RaceSnapshot } from "@/game/cameraState";
import { segmentEnds } from "@/game/track";

const seeds = [42, 123, 789, 2024, 9999];

console.log("=== 카메라 상태 전이 검증 ===\n");

const ends = segmentEnds();
console.log("구간 경계:");
console.log(`  chuteEnd: ${(ends.chuteEnd * 100).toFixed(2)}%`);
console.log(`  corner12Exit: ${(ends.corner12Exit * 100).toFixed(2)}%`);
console.log(`  backEnd: ${(ends.backEnd * 100).toFixed(2)}%`);
console.log(`  corner34Exit: ${(ends.corner34Exit * 100).toFixed(2)}%`);
console.log(`  90% (FINISH 전환): 90.00%`);
console.log();

for (const seed of seeds) {
  console.log(`\n시드 ${seed}:`);
  console.log("─".repeat(80));

  const result = simulateRace(mockHorses, seed);
  
  const transitions: Array<{ time: number; prevState: string; newState: string; leadProgress: number }> = [];
  
  let prevState: CameraState = createInitialState();
  let started = false;
  let gateOpen = 0;

  for (let t = 0; t <= result.duration; t += 0.1) {
    if (t >= 2.4 && !started) {
      started = true;
      gateOpen = 0;
    }
    
    if (started && gateOpen < 1) {
      gateOpen = Math.min(1, gateOpen + 0.1 / 0.28);
    }

    const leadHorse = result.horses
      .map(h => ({
        horse: h,
        progress: h.samples[Math.floor(t / 0.1)] ?? h.samples[h.samples.length - 1] ?? 0,
      }))
      .sort((a, b) => b.progress - a.progress)[0];

    const leadProgress = leadHorse ? leadHorse.progress : 0;

    const snapshot: RaceSnapshot = {
      raceTime: t,
      started,
      gateOpen,
      leadProgress: started && gateOpen >= 1 ? leadProgress : 0,
      horses: result.horses.map((h, index) => ({
        index,
        progress: h.samples[Math.floor(t / 0.1)] ?? h.samples[h.samples.length - 1] ?? 0,
      })),
    };

    const newState = nextCameraState(prevState, snapshot);

    if (newState.name !== prevState.name) {
      transitions.push({
        time: t,
        prevState: prevState.name,
        newState: newState.name,
        leadProgress: started && gateOpen >= 1 ? leadProgress : 0,
      });
    }

    prevState = newState;
  }

  console.log("\n전이 시각 (초)       이전 상태           새 상태            선두 진행도");
  console.log("─".repeat(80));
  
  for (const trans of transitions) {
    const time = trans.time.toFixed(1).padStart(6);
    const prev = trans.prevState.padEnd(15);
    const next = trans.newState.padEnd(15);
    const prog = `${(trans.leadProgress * 100).toFixed(2)}%`.padStart(10);
    console.log(`${time}             ${prev}  →  ${next} ${prog}`);
  }

  const stateSequence = transitions.map(t => t.newState);
  const expected = ["STRAIGHT", "CORNER_IN", "CORNER_OUT", "STRAIGHT", "CORNER_IN", "CORNER_OUT", "STRAIGHT", "FINISH"];
  
  const isCorrect = JSON.stringify(stateSequence) === JSON.stringify(expected);
  
  console.log("\n전이 순서:");
  console.log(`  실제: ${stateSequence.join(" → ")}`);
  console.log(`  예상: ${expected.join(" → ")}`);
  console.log(`  ${isCorrect ? "✅ 올바름" : "❌ 불일치"}`);
}

console.log("\n=== 검증 완료 ===");
