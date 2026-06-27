/**
 * Transfer risk scoring for REAL Virly transfers (RAG_PLAN.md M4 phase 3).
 *
 * Combines explainable RULES (new counterparty, high amount, near/over daily
 * limit, amount spike vs the user's norm, odd hour) with the unsupervised
 * kNN-anomaly signal into a 0..1 score + level + human reasons. Pure and
 * deterministic; the live service (service.ts) gathers the signals from repos.
 */
export type RiskLevel = "low" | "medium" | "high";

export type RiskSignals = {
  amount: number;
  hourOfDay: number; // 0..23, in the app timezone
  isNewCounterparty: boolean;
  perTransferLimit: number;
  dailyLimit: number;
  /** Total debited today INCLUDING this transfer (projected). */
  projectedDailyTotal: number;
  /** Amounts of the user's recent debits (for the spike rule); may be empty. */
  recentDebitAmounts: number[];
  /** Unsupervised anomaly score in [0, 1] from knnAnomalyScore. */
  anomalyScore: number;
};

export type RiskResult = {
  score: number;
  level: RiskLevel;
  reasons: string[];
  flags: {
    newCounterparty: boolean;
    highAmount: boolean;
    nearDailyLimit: boolean;
    overDailyLimit: boolean;
    amountSpike: boolean;
    oddHour: boolean;
    anomalous: boolean;
  };
};

const HIGH_AMOUNT_FRACTION = 0.8; // of the per-transfer limit
const NEAR_DAILY_FRACTION = 0.9; // of the daily limit
const SPIKE_SIGMAS = 3; // amount > mean + 3*std of recent debits
const ODD_HOURS = new Set([0, 1, 2, 3, 4, 5]);
const ANOMALY_FLAG_THRESHOLD = 0.6;

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
function std(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length);
}

export function computeRisk(signals: RiskSignals): RiskResult {
  const reasons: string[] = [];
  let score = 0;

  const newCounterparty = signals.isNewCounterparty;
  if (newCounterparty) {
    score += 0.2;
    reasons.push("First transfer to this recipient.");
  }

  const highAmount = signals.amount >= HIGH_AMOUNT_FRACTION * signals.perTransferLimit;
  if (highAmount) {
    score += 0.2;
    reasons.push(`Amount is near the per-transfer limit (${signals.amount}/${signals.perTransferLimit}).`);
  }

  const overDailyLimit = signals.projectedDailyTotal >= signals.dailyLimit;
  const nearDailyLimit =
    !overDailyLimit && signals.projectedDailyTotal >= NEAR_DAILY_FRACTION * signals.dailyLimit;
  if (overDailyLimit) {
    score += 0.35;
    reasons.push(`This transfer reaches/exceeds the daily limit (${signals.projectedDailyTotal}/${signals.dailyLimit}).`);
  } else if (nearDailyLimit) {
    score += 0.2;
    reasons.push(`This transfer is near the daily limit (${signals.projectedDailyTotal}/${signals.dailyLimit}).`);
  }

  let amountSpike = false;
  if (signals.recentDebitAmounts.length >= 5) {
    const m = mean(signals.recentDebitAmounts);
    const sd = std(signals.recentDebitAmounts, m);
    amountSpike = sd > 0 && signals.amount > m + SPIKE_SIGMAS * sd;
    if (amountSpike) {
      score += 0.25;
      reasons.push(`Amount is far above this user's usual transfers (~${Math.round(m)}).`);
    }
  }

  const oddHour = ODD_HOURS.has(signals.hourOfDay);
  if (oddHour) {
    score += 0.1;
    reasons.push(`Sent at an unusual hour (${signals.hourOfDay}:00).`);
  }

  const anomalous = signals.anomalyScore >= ANOMALY_FLAG_THRESHOLD;
  score += 0.4 * signals.anomalyScore;
  if (anomalous) {
    reasons.push(`Pattern is unlike this user's normal transfers (anomaly ${signals.anomalyScore.toFixed(2)}).`);
  }

  score = Math.min(1, Math.max(0, score));
  const level: RiskLevel = score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low";

  return {
    score: Number(score.toFixed(4)),
    level,
    reasons,
    flags: { newCounterparty, highAmount, nearDailyLimit, overDailyLimit, amountSpike, oddHour, anomalous }
  };
}
