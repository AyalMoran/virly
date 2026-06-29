import { knnAnomalyScore, MIN_HISTORY } from "../anomaly.js";

describe("knnAnomalyScore", () => {
  test("returns 0 below the minimum history (cold start)", () => {
    const history = Array.from({ length: MIN_HISTORY - 1 }, () => [50, 14]);
    expect(knnAnomalyScore(history, [50, 14])).toBe(0);
  });

  test("a transfer like the user's history scores ~0", () => {
    const history = Array.from({ length: 20 }, (_, i) => [48 + (i % 5), 14]);
    const score = knnAnomalyScore(history, [50, 14]);
    expect(score).toBeLessThan(0.2);
  });

  test("a transfer far from the user's history scores high", () => {
    const history = Array.from({ length: 20 }, (_, i) => [48 + (i % 5), 14]);
    const score = knnAnomalyScore(history, [5000, 3]);
    expect(score).toBeGreaterThan(0.6);
  });

  test("score stays within [0, 1] even for extreme outliers", () => {
    const history = Array.from({ length: 10 }, () => [50, 14]);
    const score = knnAnomalyScore(history, [99999, 0]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
