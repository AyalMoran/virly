/**
 * Unsupervised kNN anomaly score on Virly transfer features (RAG_PLAN.md M4 ph3).
 *
 * No labels, no embeddings: standardize a user's recent transfers, then measure
 * how far a new transfer sits from its k nearest historical neighbors. A transfer
 * unlike the user's normal behavior scores high. Pure; the production caller feeds
 * the user's recent debits (in-memory is fine — per-user history is small).
 */
import { fitScaler, transform } from "./scaler.js";

/** Minimum history before anomaly is meaningful; below this we return 0 (cold start). */
export const MIN_HISTORY = 5;

function l2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

/**
 * Anomaly score in [0, 1): 0 = looks like the user's normal transfers, →1 = very
 * unlike them. Computed as the mean standardized L2 distance to the k nearest
 * historical transfers, squashed to [0, 1).
 */
export function knnAnomalyScore(
  history: number[][],
  query: number[],
  k = 5
): number {
  if (history.length < MIN_HISTORY) return 0;
  const scaler = fitScaler(history);
  const stdHistory = history.map((h) => transform(h, scaler));
  const stdQuery = transform(query, scaler);

  const dists = stdHistory.map((h) => l2(h, stdQuery)).sort((a, b) => a - b);
  const top = dists.slice(0, Math.min(k, dists.length));
  const meanDist = top.reduce((s, d) => s + d, 0) / top.length;

  // Normal points cluster (small std-space distance); squash so typical ~0,
  // far-outliers approach 1. Scale by sqrt(dim) (expected spread per dimension).
  const scale = Math.sqrt(query.length) || 1;
  return 1 - Math.exp(-meanDist / (2 * scale));
}
