/**
 * Fraud detection types (RAG_PLAN.md M4).
 *
 * Trained on the Kaggle "Credit Card Fraud Detection" (ULB) dataset as a free,
 * embedding-free demo pipeline: each transaction is a numeric feature vector
 * (V1..V28 + standardized Amount), stored in pgvector for kNN similarity, and
 * scored by a logistic-regression model (Phase 2). Role-gated; not wired to real
 * Virly transactions (different schema).
 */

/** V1..V28 (28) + Amount (1) = 29 standardized features per transaction. */
export const FRAUD_FEATURE_DIM = 29;

export type FraudLabel = 0 | 1;

/** A parsed dataset row before scaling. */
export type RawTransaction = {
  /** Raw features in column order: [V1..V28, Amount]. */
  features: number[];
  /** 1 = fraud, 0 = legit, null = unlabeled (scoring input). */
  label: FraudLabel | null;
};

/** Standardization parameters fit on the training set; reused at score time. */
export type Scaler = {
  mean: number[];
  std: number[];
};

export type FraudVectorRecord = {
  id: string;
  source: string;
  features: number[];
  label: FraudLabel | null;
  createdAt: Date;
};

export type KnnNeighbor = {
  label: FraudLabel;
  distance: number;
};

export type FraudKnnScore = {
  /** Fraction of the k nearest LABELED neighbors that are fraud, in [0, 1]. */
  fraudProbability: number;
  k: number;
  neighbors: KnnNeighbor[];
  /** Distance to the nearest fraud neighbor, or null if none among the k. */
  nearestFraudDistance: number | null;
};
