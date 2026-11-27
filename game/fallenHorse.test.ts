import { describe, expect, it } from "vitest";
import type { Dismount, HorseFate } from "@/lib/incidents";
import { bodyAt, stampWord } from "./fallenHorse";

const logical = (progress: number, lane: number) => ({ x: progress * 1000, y: lane * 10, tx: 1, ty: 0 });
const dismount = (mode: Dismount["mode"] = "run"): Dismount => ({ time: 10, cause: "graze", mode, horseAt: { progress: 0.3, lane: 2 } });

describe("riderless horse", () => {
  it("stays where the horse stopped", () => {
    const fate: HorseFate = { kind: "down", at: { progress: 0.3, lane: 2 } };
    expect(bodyAt(fate, dismount(), 9.9, logical)).toBeNull();
    expect(bodyAt(fate, dismount(), 40, logical)).toMatchObject({ pose: "down", at: { x: 300, y: 20 } });
  });

  it("walks to the infield spot, then grazes in place", () => {
    const fate: HorseFate = { kind: "graze", from: { progress: 0.3, lane: 2 }, spot: { x: 300, y: -500 }, walkUntil: 13 };
    const mid = bodyAt(fate, dismount(), 11.5, logical);
    expect(mid?.pose).toBe("walk");
    expect(mid?.at.y).toBeCloseTo(-240, 0);
    expect(mid?.travel).toBeGreaterThan(0);
    const done = bodyAt(fate, dismount(), 20, logical);
    expect(done).toMatchObject({ pose: "graze", at: { x: 300, y: -500 }, since: 7 });
  });

  it("is held still while the hand closes, then lifted and faded at the bite", () => {
    const fate: HorseFate = { kind: "eaten", at: { progress: 0.3, lane: 2 }, titanFrom: 7.5, grabAt: 10 };
    const eaten: Dismount = { ...dismount(), cause: "titan" };
    expect(bodyAt(fate, eaten, 10.2, logical)).toMatchObject({ pose: "lifted", lift: 0, alpha: 1 });
    const mid = bodyAt(fate, eaten, 10.6, logical);
    expect(mid?.lift).toBeCloseTo(0.5, 6);
    expect(mid?.alpha).toBe(1);
    expect(bodyAt(fate, eaten, 10.9, logical)?.alpha).toBeCloseTo(0.5, 6);
    expect(bodyAt(fate, eaten, 11, logical)).toBeNull();
  });
});

describe("stamp word", () => {
  it("shows fall first, then the mode", () => {
    expect(stampWord(dismount("super"), 0.2)).toBe("낙마");
    expect(stampWord(dismount("super"), 1.4)).toBe("초인");
    expect(stampWord(dismount("bike"), 1.4)).toBe("오토바이");
    expect(stampWord(dismount("run"), 1.4)).toBe("");
    expect(stampWord(dismount("super"), 9)).toBe("");
  });

  it("stays off the giant's body until the giant has gone", () => {
    const eaten: Dismount = { ...dismount("super"), cause: "titan" };
    expect(stampWord(eaten, 0.2)).toBe("");
    expect(stampWord(eaten, 1.5)).toBe("");
    expect(stampWord(eaten, 2.5)).toBe("초인");
  });
});

describe("titan", () => {
  const target = { x: 100, y: 1000, tx: 1, ty: 0 };
  it("runs in from outside the rail, grabs where the horse is, then walks out facing away", async () => {
    const { titanAt, TITAN_START_PX, TITAN_GRAB_S } = await import("./fallenHorse");
    expect(titanAt(5, 7.5, 4.9, target)).toBeNull();
    const start = titanAt(5, 7.5, 5, target);
    expect(start?.at.y).toBeCloseTo(1000 + TITAN_START_PX, 3);
    expect(start?.phase).toBe("run");
    const grab = titanAt(5, 7.5, 7.5 + 0.5, target);
    expect(grab).toMatchObject({ phase: "grab", at: { x: 100, y: 1000 } });
    const leaving = titanAt(5, 7.5, 7.5 + TITAN_GRAB_S + 0.6, target);
    expect(leaving?.phase).toBe("leave");
    expect(Math.sign(leaving?.at.ty ?? 0)).toBe(-Math.sign(start?.at.ty ?? 0) || 1);
    expect(titanAt(5, 7.5, 12, target)).toBeNull();
  });
});
