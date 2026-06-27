/**
 * Logistic regression in pure TypeScript (RAG_PLAN.md M4, phase 2).
 *
 * Trained offline by `fraud-train.ts`; the model is just `{ weights, bias }`, so
 * runtime scoring is a free dot-product + sigmoid (no ML runtime dependency).
 * Balanced class weights handle the extreme fraud imbalance (~0.17% positives).
 * For higher accuracy, swap in a gradient-boosted model later (train in Python,
 * transpile to JS with m2cgen) behind this same `{weights,bias}`-style artifact.
 */
import type { FraudLabel } from "./types.js";

export type LogRegModel = {
  weights: number[];
  bias: number;
};

export type TrainOptions = {
  epochs?: number;
  learningRate?: number;
  /** L2 regularization strength. */
  l2?: number;
  /** Re-weight classes inversely to frequency (handles imbalance). Default true. */
  balanced?: boolean;
};

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export function predictProba(model: LogRegModel, x: number[]): number {
  let z = model.bias;
  for (let i = 0; i < model.weights.length; i++) z += model.weights[i] * x[i];
  return sigmoid(z);
}

/** Batch gradient-descent logistic regression with optional balanced weights. */
export function trainLogReg(
  X: number[][],
  y: FraudLabel[],
  options: TrainOptions = {}
): LogRegModel {
  const epochs = options.epochs ?? 300;
  const lr = options.learningRate ?? 0.1;
  const l2 = options.l2 ?? 0.0;
  const balanced = options.balanced ?? true;
  const n = X.length;
  if (n === 0) throw new Error("Cannot train on zero rows.");
  const dim = X[0].length;

  const nPos = y.reduce<number>((s, v) => s + v, 0);
  const nNeg = n - nPos;
  // sklearn-style balanced weights: n / (2 * class_count).
  const wPos = balanced && nPos > 0 ? n / (2 * nPos) : 1;
  const wNeg = balanced && nNeg > 0 ? n / (2 * nNeg) : 1;
  const weightSum = X.reduce((s, _x, i) => s + (y[i] === 1 ? wPos : wNeg), 0);

  const weights = new Array(dim).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(dim).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const x = X[i];
      const w = y[i] === 1 ? wPos : wNeg;
      const err = (predictProba({ weights, bias }, x) - y[i]) * w;
      for (let d = 0; d < dim; d++) gradW[d] += err * x[d];
      gradB += err;
    }
    for (let d = 0; d < dim; d++) {
      weights[d] -= lr * (gradW[d] / weightSum + l2 * weights[d]);
    }
    bias -= lr * (gradB / weightSum);
  }

  return { weights, bias };
}
