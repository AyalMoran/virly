import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { fitScaler, transform } from "../scaler.js";

describe("fitScaler / transform", () => {
  test("centers to mean 0 and scales to unit std", () => {
    const rows = [
      [0, 10],
      [2, 20],
      [4, 30]
    ];
    const scaler = fitScaler(rows);
    assert.deepEqual(scaler.mean, [2, 20]);
    // population std: sqrt(((-2)^2+0+2^2)/3) = sqrt(8/3)
    assert.ok(Math.abs(scaler.std[0] - Math.sqrt(8 / 3)) < 1e-9);
    const t = transform([2, 20], scaler);
    assert.deepEqual(t, [0, 0]);
  });

  test("guards zero-variance columns against divide-by-zero", () => {
    const scaler = fitScaler([
      [5, 1],
      [5, 3]
    ]);
    assert.equal(scaler.std[0], 1); // constant column -> std forced to 1
    assert.deepEqual(transform([5, 2], scaler), [0, 0]);
  });

  test("throws on inconsistent feature lengths and empty input", () => {
    assert.throws(() => fitScaler([]));
    assert.throws(() => fitScaler([[1, 2], [1]]));
    const scaler = fitScaler([[1, 2]]);
    assert.throws(() => transform([1], scaler));
  });
});
