import { bestF1Threshold, confusionAtThreshold, prAuc } from "../metrics.js";
import type { FraudLabel } from "../types.js";

describe("fraud metrics", () => {
  test("prAuc = 1.0 when scores rank all positives above all negatives", () => {
    const y: FraudLabel[] = [1, 1, 0, 0];
    const scores = [0.9, 0.8, 0.4, 0.1];
    expect(prAuc(y, scores)).toBe(1);
  });

  test("prAuc penalizes a negative ranked above positives", () => {
    const y: FraudLabel[] = [1, 1, 0];
    const perfect = prAuc(y, [0.9, 0.8, 0.1]);
    const worse = prAuc(y, [0.9, 0.4, 0.8]); // a negative beats a positive
    expect(worse).toBeLessThan(perfect);
  });

  test("prAuc is 0 when there are no positives", () => {
    expect(prAuc([0, 0], [0.9, 0.1])).toBe(0);
  });

  test("confusionAtThreshold computes precision/recall/f1", () => {
    const y: FraudLabel[] = [1, 1, 0, 0];
    const scores = [0.9, 0.3, 0.8, 0.1];
    const c = confusionAtThreshold(y, scores, 0.5);
    expect({ tp: c.tp, fp: c.fp, tn: c.tn, fn: c.fn }).toStrictEqual({ tp: 1, fp: 1, tn: 1, fn: 1 });
    expect(c.precision).toBe(0.5);
    expect(c.recall).toBe(0.5);
    expect(c.f1).toBe(0.5);
  });

  test("bestF1Threshold finds a threshold that separates the classes", () => {
    const y: FraudLabel[] = [1, 1, 0, 0];
    const scores = [0.9, 0.7, 0.3, 0.1];
    const { threshold, f1 } = bestF1Threshold(y, scores);
    expect(f1).toBe(1);
    expect(threshold).toBeGreaterThan(0.3);
    expect(threshold).toBeLessThanOrEqual(0.7);
  });
});
