/**
 * Standard scaler for fraud features (RAG_PLAN.md M4).
 *
 * kNN and logistic regression both need features on a comparable scale (raw
 * Amount dwarfs the PCA components otherwise). We fit mean/std on the training
 * set and reuse the SAME scaler at score time — so the scaler is a saved artifact,
 * not recomputed per query. Pure functions, no dependencies.
 */
import { FRAUD_FEATURE_DIM, type Scaler } from "./types.js";

/** Fit per-column mean and population std over the training rows. */
export function fitScaler(rows: number[][]): Scaler {
  if (rows.length === 0) {
    throw new Error("Cannot fit a scaler on zero rows.");
  }
  const dim = rows[0].length;
  const mean = new Array(dim).fill(0);
  const std = new Array(dim).fill(0);

  for (const row of rows) {
    if (row.length !== dim) {
      throw new Error(`Inconsistent feature length: expected ${dim}, got ${row.length}.`);
    }
    for (let i = 0; i < dim; i++) mean[i] += row[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= rows.length;

  for (const row of rows) {
    for (let i = 0; i < dim; i++) {
      const d = row[i] - mean[i];
      std[i] += d * d;
    }
  }
  for (let i = 0; i < dim; i++) {
    std[i] = Math.sqrt(std[i] / rows.length);
    // Guard against zero-variance columns (constant feature) to avoid /0.
    if (std[i] === 0) std[i] = 1;
  }

  return { mean, std };
}

/** Standardize one feature row with a fitted scaler. */
export function transform(row: number[], scaler: Scaler): number[] {
  if (row.length !== scaler.mean.length) {
    throw new Error(
      `Feature length ${row.length} does not match scaler dim ${scaler.mean.length}.`
    );
  }
  return row.map((v, i) => (v - scaler.mean[i]) / scaler.std[i]);
}

/** Validate a scaler matches the expected feature dimension. */
export function assertScalerDim(scaler: Scaler, dim = FRAUD_FEATURE_DIM): void {
  if (scaler.mean.length !== dim || scaler.std.length !== dim) {
    throw new Error(
      `Scaler dim ${scaler.mean.length} != expected ${dim}. Re-fit on the dataset.`
    );
  }
}
