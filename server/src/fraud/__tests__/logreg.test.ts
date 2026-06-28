import { predictProba, trainLogReg } from "../logreg.js";
import type { FraudLabel } from "../types.js";

describe("trainLogReg / predictProba", () => {
  test("learns a linearly separable pattern", () => {
    // class 1 clusters at +3, class 0 at -3 (1 feature).
    const X: number[][] = [];
    const y: FraudLabel[] = [];
    for (let i = 0; i < 50; i++) {
      X.push([3 + (i % 5) * 0.1]);
      y.push(1);
      X.push([-3 - (i % 5) * 0.1]);
      y.push(0);
    }
    const model = trainLogReg(X, y, { epochs: 400, learningRate: 0.3 });
    expect(predictProba(model, [3])).toBeGreaterThan(0.9);
    expect(predictProba(model, [-3])).toBeLessThan(0.1);
  });

  test("balanced weights let the rare class be learned despite imbalance", () => {
    // 1 positive among 40 negatives, but positives are separable at +5.
    const X: number[][] = [];
    const y: FraudLabel[] = [];
    for (let i = 0; i < 40; i++) {
      X.push([0 + (i % 3) * 0.1]);
      y.push(0);
    }
    X.push([5]);
    y.push(1);
    const model = trainLogReg(X, y, { epochs: 500, learningRate: 0.3, balanced: true });
    expect(predictProba(model, [5])).toBeGreaterThan(0.5);
  });

  test("throws on empty training data", () => {
    expect(() => trainLogReg([], [])).toThrow();
  });
});
