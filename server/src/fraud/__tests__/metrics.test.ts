import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { bestF1Threshold, confusionAtThreshold, prAuc } from "../metrics.js";
import type { FraudLabel } from "../types.js";

describe("fraud metrics", () => {
  test("prAuc = 1.0 when scores rank all positives above all negatives", () => {
    const y: FraudLabel[] = [1, 1, 0, 0];
    const scores = [0.9, 0.8, 0.4, 0.1];
    assert.equal(prAuc(y, scores), 1);
  });

  test("prAuc penalizes a negative ranked above positives", () => {
    const y: FraudLabel[] = [1, 1, 0];
    const perfect = prAuc(y, [0.9, 0.8, 0.1]);
    const worse = prAuc(y, [0.9, 0.4, 0.8]); // a negative beats a positive
    assert.ok(worse < perfect);
  });

  test("prAuc is 0 when there are no positives", () => {
    assert.equal(prAuc([0, 0], [0.9, 0.1]), 0);
  });

  test("confusionAtThreshold computes precision/recall/f1", () => {
    const y: FraudLabel[] = [1, 1, 0, 0];
    const scores = [0.9, 0.3, 0.8, 0.1];
    const c = confusionAtThreshold(y, scores, 0.5);
    assert.deepEqual({ tp: c.tp, fp: c.fp, tn: c.tn, fn: c.fn }, { tp: 1, fp: 1, tn: 1, fn: 1 });
    assert.equal(c.precision, 0.5);
    assert.equal(c.recall, 0.5);
    assert.equal(c.f1, 0.5);
  });

  test("bestF1Threshold finds a threshold that separates the classes", () => {
    const y: FraudLabel[] = [1, 1, 0, 0];
    const scores = [0.9, 0.7, 0.3, 0.1];
    const { threshold, f1 } = bestF1Threshold(y, scores);
    assert.equal(f1, 1);
    assert.ok(threshold > 0.3 && threshold <= 0.7);
  });
});
