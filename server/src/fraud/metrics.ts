/**
 * Imbalanced-classification metrics (RAG_PLAN.md M4, phase 2).
 *
 * Accuracy is useless at 0.17% positives, so we report PR-AUC (average precision)
 * and precision/recall/F1 at a chosen threshold — the metrics that actually
 * matter for fraud. Pure functions, no dependencies.
 */
import type { FraudLabel } from "./types.js";

export type Confusion = {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
};

export function confusionAtThreshold(
  yTrue: FraudLabel[],
  yScore: number[],
  threshold: number
): Confusion {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const pred = yScore[i] >= threshold ? 1 : 0;
    if (pred === 1 && yTrue[i] === 1) tp++;
    else if (pred === 1) fp++;
    else if (yTrue[i] === 1) fn++;
    else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, tn, fn, precision, recall, f1 };
}

/**
 * Average precision (area under the precision-recall curve), the standard
 * threshold-free score for imbalanced detection. Computed by walking predictions
 * in descending score order and summing precision over each recall increment.
 */
export function prAuc(yTrue: FraudLabel[], yScore: number[]): number {
  const totalPos = yTrue.reduce<number>((s, v) => s + v, 0);
  if (totalPos === 0) return 0;

  const order = yTrue.map((_, i) => i).sort((a, b) => yScore[b] - yScore[a]);
  let tp = 0;
  let fp = 0;
  let prevRecall = 0;
  let ap = 0;
  // Process all items sharing a score TOGETHER, so average precision doesn't
  // depend on the arbitrary ordering of ties (coarse kNN probabilities tie a lot).
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j < order.length && yScore[order[j]] === yScore[order[i]]) {
      if (yTrue[order[j]] === 1) tp++;
      else fp++;
      j++;
    }
    const precision = tp / (tp + fp);
    const recall = tp / totalPos;
    ap += (recall - prevRecall) * precision;
    prevRecall = recall;
    i = j;
  }
  return ap;
}

/** The threshold (from the observed scores) that maximizes F1. */
export function bestF1Threshold(
  yTrue: FraudLabel[],
  yScore: number[]
): { threshold: number; f1: number } {
  const candidates = [...new Set(yScore)].sort((a, b) => a - b);
  let best = { threshold: 0.5, f1: -1 };
  for (const t of candidates) {
    const { f1 } = confusionAtThreshold(yTrue, yScore, t);
    if (f1 > best.f1) best = { threshold: t, f1 };
  }
  return best;
}
