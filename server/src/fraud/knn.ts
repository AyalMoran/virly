/**
 * kNN fraud scorer (RAG_PLAN.md M4, baseline).
 *
 * Scores a transaction by its k nearest LABELED neighbors in pgvector: the
 * fraud probability is the fraction of those neighbors that are fraud. Free
 * (no training, no embeddings) and explainable ("similar to N known frauds").
 * The repository + scaler are injectable for testing.
 */
import { knnSearch as defaultKnnSearch } from "./repository.js";
import { transform } from "./scaler.js";
import type { FraudKnnScore, KnnNeighbor, Scaler } from "./types.js";

export type KnnScoreOptions = {
  k?: number;
  /** Already-standardized? Pass a scaler to standardize raw features first. */
  scaler?: Scaler;
  /** Injectable for tests; defaults to the pgvector repository. */
  search?: (features: number[], k: number) => Promise<KnnNeighbor[]>;
};

export async function scoreByKnn(
  features: number[],
  options: KnnScoreOptions = {}
): Promise<FraudKnnScore> {
  const k = options.k ?? 5;
  const search = options.search ?? defaultKnnSearch;
  const query = options.scaler ? transform(features, options.scaler) : features;

  const neighbors = await search(query, k);
  if (neighbors.length === 0) {
    return { fraudProbability: 0, k, neighbors: [], nearestFraudDistance: null };
  }
  const fraud = neighbors.filter((n) => n.label === 1);
  const nearestFraudDistance = fraud.length > 0 ? Math.min(...fraud.map((n) => n.distance)) : null;
  return {
    fraudProbability: fraud.length / neighbors.length,
    k,
    neighbors,
    nearestFraudDistance
  };
}
