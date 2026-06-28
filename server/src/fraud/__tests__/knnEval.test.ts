import { knnFraudProbInMemory } from "../knnEval.js";
import type { FraudLabel } from "../types.js";

const refX = [
  [0, 0],
  [0, 1],
  [10, 10],
  [11, 11]
];
const refY: FraudLabel[] = [0, 0, 1, 1];

describe("knnFraudProbInMemory", () => {
  test("returns the fraud fraction among the k nearest reference rows", () => {
    // Query near the two legit rows -> 0 fraud among k=2.
    expect(knnFraudProbInMemory(refX, refY, [0, 0], 2)).toBe(0);
    // Query near the two fraud rows -> 1.0 fraud among k=2.
    expect(knnFraudProbInMemory(refX, refY, [10, 10], 2)).toBe(1);
  });

  test("mixes labels when k spans the boundary", () => {
    // k=4 spans all rows -> 2 fraud / 4 = 0.5.
    expect(knnFraudProbInMemory(refX, refY, [5, 5], 4)).toBe(0.5);
  });

  test("returns 0 for an empty reference set", () => {
    expect(knnFraudProbInMemory([], [], [1, 2], 3)).toBe(0);
  });

  test("k larger than the reference set uses all rows", () => {
    expect(knnFraudProbInMemory(refX, refY, [0, 0], 99)).toBe(0.5);
  });
});
