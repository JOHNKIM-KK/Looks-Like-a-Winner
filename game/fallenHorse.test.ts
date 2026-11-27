import { describe, expect, it } from "vitest";
import type { Dismount, HorseFate } from "@/lib/incidents";
import { bodyAt, stampWord } from "./fallenHorse";

const logical = (progress: number, lane: number) => ({ x: progress * 1000, y: lane * 10, tx: 1, ty: 0 });
const dismount = (mode: Dismount["mode"] = "run"): Dismount => ({ time: 10, cause: "graze", mode, horseAt: { progress: 0.3, lane: 2 } });

describe("riderless horse", () => {
  it("lies still where the horse stopped", () => {
    const fate: HorseFate = { kind: "down", at: { progress: 0.3, lane: 2 } };
    expect(bodyAt(fate, dismount(), 9.9, logical)).toBeNull();
    expect(bodyAt(fate, dismount(), 40, logical)).toMatchObject({ pose: "down", at: { x: 300, y: 20 } });
  });

  it("walks to the infield spot, then grazes in place", () => {
    const fate: HorseFate = { kind: "graze", from: { progress: 0.3, lane: 2 }, spot: { x: 300, y: -500 }, walkUntil: 13 };
    const mid = bodyAt(fate, dismount(), 11.5, logical);
    expect(mid?.pose).toBe("walk");
    expect(mid?.at.y).toBeCloseTo(-240, 0);
    const done = bodyAt(fate, dismount(), 20, logical);
    expect(done).toMatchObject({ pose: "graze", at: { x: 300, y: -500 } });
  });

  it("is lifted and fades out after the titan grabs it", () => {
    const fate: HorseFate = { kind: "eaten", at: { progress: 0.3, lane: 2 }, titanFrom: 7.5, grabAt: 10 };
    const half = bodyAt(fate, dismount(), 10.4, logical);
    expect(half?.pose).toBe("lifted");
    expect(half?.lift).toBeCloseTo(0.5, 6);
    expect(half?.alpha).toBeCloseTo(0.5, 6);
    expect(bodyAt(fate, dismount(), 11, logical)).toBeNull();
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
});
