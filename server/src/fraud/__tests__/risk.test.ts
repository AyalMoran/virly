import { computeRisk, type RiskSignals } from "../risk.js";

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
    expect(r.level).toBe("low");
    expect(r.score).toBe(0);
    expect(r.reasons).toStrictEqual([]);
  });

  test("new counterparty + high amount raises the score and explains why", () => {
    const r = computeRisk(signals({ isNewCounterparty: true, amount: 450 }));
    expect(r.flags.newCounterparty && r.flags.highAmount).toBeTruthy();
    expect(r.score).toBeGreaterThanOrEqual(0.4);
    expect(r.reasons.some((m) => /first transfer/i.test(m))).toBeTruthy();
    expect(r.reasons.some((m) => /per-transfer limit/i.test(m))).toBeTruthy();
  });

  test("over the daily limit is flagged distinctly from near it", () => {
    const over = computeRisk(signals({ projectedDailyTotal: 1000 }));
    expect(over.flags.overDailyLimit && !over.flags.nearDailyLimit).toBeTruthy();
    const near = computeRisk(signals({ projectedDailyTotal: 950 }));
    expect(near.flags.nearDailyLimit && !near.flags.overDailyLimit).toBeTruthy();
  });

  test("an amount far above the user's norm is a spike", () => {
    const r = computeRisk(signals({ amount: 400, recentDebitAmounts: [40, 50, 45, 55, 50] }));
    expect(r.flags.amountSpike).toBeTruthy();
  });

  test("a high anomaly score pushes the transfer to high risk", () => {
    const r = computeRisk(signals({ isNewCounterparty: true, amount: 450, anomalyScore: 0.95 }));
    expect(r.level).toBe("high");
    expect(r.flags.anomalous).toBeTruthy();
  });

  test("score is clamped to [0,1]", () => {
    const r = computeRisk(
      signals({ isNewCounterparty: true, amount: 500, projectedDailyTotal: 2000, anomalyScore: 1, hourOfDay: 3 })
    );
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.level).toBe("high");
  });
});
