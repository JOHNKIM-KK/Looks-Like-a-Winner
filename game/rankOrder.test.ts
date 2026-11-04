import { describe, expect, test } from "vitest";
import { orderByPresentation, type RankSource } from "./rankOrder";

const field: RankSource[] = [
  { id: "h1", number: 1, shown: 0.42, finishTime: 39.2, rank: 6 },
  { id: "h2", number: 2, shown: 0.91, finishTime: 33.4, rank: 1 },
  { id: "h3", number: 3, shown: 0.63, finishTime: 37.1, rank: 4 },
  { id: "h4", number: 4, shown: 0.77, finishTime: 34.8, rank: 2 },
  { id: "h5", number: 5, shown: 0.55, finishTime: 38.0, rank: 5 },
  { id: "h6", number: 6, shown: 0.70, finishTime: 36.2, rank: 3 },
  { id: "h7", number: 7, shown: 0.31, finishTime: 41.0, rank: 8 },
  { id: "h8", number: 8, shown: 0.31, finishTime: 40.2, rank: 7 },
];

describe("orderByPresentation", () => {
  test("orders 8 horses by presentation progress", () => {
    const running = orderByPresentation(field, 10);
    expect(running).toHaveLength(8);
    expect(running.map((horse) => horse.number)).toEqual([2, 4, 6, 3, 5, 1, 7, 8]);

    const finished = orderByPresentation(field, 42);
    expect(finished.map((horse) => horse.number)).toEqual([2, 4, 6, 3, 5, 1, 8, 7]);
  });
});
