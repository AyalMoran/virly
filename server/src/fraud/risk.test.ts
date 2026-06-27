import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { computeRisk, type RiskSignals } from "./risk.js";

function signals(overrides: Partial<RiskSignals> = {}): RiskSignals {
  return {
    amount: 50,
    hourOfDay: 14,
    isNewCounterparty: false,
    perTransferLimit: 500,
    dailyLimit: 1000,
    projectedDailyTotal: 100,
    recentDebitAmounts: [40, 50, 45, 55, 50],
    anomalyScore: 0,
    ...overrides
  };
}

describe("computeRisk", () => {
  test("a normal, repeat-recipient, in-range transfer is low risk", () => {
    const r = computeRisk(signals());
    assert.equal(r.level, "low");
    assert.equal(r.score, 0);
    assert.deepEqual(r.reasons, []);
  });

  test("new counterparty + high amount raises the score and explains why", () => {
    const r = computeRisk(signals({ isNewCounterparty: true, amount: 450 }));
    assert.ok(r.flags.newCounterparty && r.flags.highAmount);
    assert.ok(r.score >= 0.4, `expected >=0.4, got ${r.score}`);
    assert.ok(r.reasons.some((m) => /first transfer/i.test(m)));
    assert.ok(r.reasons.some((m) => /per-transfer limit/i.test(m)));
  });

  test("over the daily limit is flagged distinctly from near it", () => {
    const over = computeRisk(signals({ projectedDailyTotal: 1000 }));
    assert.ok(over.flags.overDailyLimit && !over.flags.nearDailyLimit);
    const near = computeRisk(signals({ projectedDailyTotal: 950 }));
    assert.ok(near.flags.nearDailyLimit && !near.flags.overDailyLimit);
  });

  test("an amount far above the user's norm is a spike", () => {
    const r = computeRisk(signals({ amount: 400, recentDebitAmounts: [40, 50, 45, 55, 50] }));
    assert.ok(r.flags.amountSpike);
  });

  test("a high anomaly score pushes the transfer to high risk", () => {
    const r = computeRisk(signals({ isNewCounterparty: true, amount: 450, anomalyScore: 0.95 }));
    assert.equal(r.level, "high");
    assert.ok(r.flags.anomalous);
  });

  test("score is clamped to [0,1]", () => {
    const r = computeRisk(
      signals({ isNewCounterparty: true, amount: 500, projectedDailyTotal: 2000, anomalyScore: 1, hourOfDay: 3 })
    );
    assert.ok(r.score <= 1 && r.score >= 0);
    assert.equal(r.level, "high");
  });
});
