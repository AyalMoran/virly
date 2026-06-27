/**
 * In-memory kNN for OFFLINE evaluation only (RAG_PLAN.md M4, phase 2).
 *
 * The production kNN serving path is pgvector (repository.ts); this brute-force
 * version exists so `fraud-train.ts` can score the kNN baseline on the same
 * held-out split as the trained model for an apples-to-apples comparison, without
 * needing a database. O(test * ref * dim), so callers cap the reference set.
 */
import type { FraudLabel } from "./types.js";

function l2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s; // squared distance is fine for ranking
}

/** Fraud fraction among the k nearest reference rows to `query`. */
export function knnFraudProbInMemory(
  refX: number[][],
  refY: FraudLabel[],
  query: number[],
  k: number
): number {
  const dists = refX.map((x, i) => ({ d: l2(x, query), y: refY[i] }));
  dists.sort((a, b) => a.d - b.d);
  const top = dists.slice(0, k);
  if (top.length === 0) return 0;
  return top.filter((t) => t.y === 1).length / top.length;
}
