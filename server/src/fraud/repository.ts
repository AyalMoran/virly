/**
 * pgvector-backed fraud transaction store (RAG_PLAN.md M4).
 *
 * Lives in the dedicated AI Postgres alongside the knowledge base. Like the
 * memory store, it self-manages its schema (CREATE ... IF NOT EXISTS) rather than
 * a drizzle migration. Features are L2-indexed for nearest-neighbour search
 * (Euclidean is the right metric for standardized numeric features).
 */
import { sql } from "drizzle-orm";

import { getAiDb } from "../db/vector.js";
import { newObjectId } from "../repositories/postgres/id.js";
import { FRAUD_FEATURE_DIM, type FraudLabel, type KnnNeighbor } from "./types.js";

let didSetup = false;

function toVectorLiteral(features: number[]): string {
  return `[${features.join(",")}]`;
}

/** Create the fraud table + L2 HNSW index (idempotent). */
export async function setupFraudSchema(): Promise<void> {
  if (didSetup) return;
  const db = getAiDb();
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fraud_transactions (
      id char(24) PRIMARY KEY,
      source text NOT NULL,
      features vector(${sql.raw(String(FRAUD_FEATURE_DIM))}) NOT NULL,
      label integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS fraud_transactions_features_l2 ON fraud_transactions USING hnsw (features vector_l2_ops)`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS fraud_transactions_label_idx ON fraud_transactions (label)`
  );
  didSetup = true;
}

async function ensureSetup(): Promise<void> {
  if (!didSetup) await setupFraudSchema();
}

export type FraudInsert = { source: string; features: number[]; label: FraudLabel | null };

/** Bulk-insert standardized feature vectors in batches. */
export async function insertMany(records: FraudInsert[], batchSize = 1000): Promise<number> {
  await ensureSetup();
  const db = getAiDb();
  let inserted = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const values = batch.map(
      (r) =>
        sql`(${newObjectId()}, ${r.source}, ${toVectorLiteral(r.features)}::vector, ${r.label}, now())`
    );
    await db.execute(
      sql`INSERT INTO fraud_transactions (id, source, features, label, created_at) VALUES ${sql.join(values, sql`, `)}`
    );
    inserted += batch.length;
  }
  return inserted;
}

/** The k nearest LABELED transactions to a query vector, by L2 distance. */
export async function knnSearch(features: number[], k: number): Promise<KnnNeighbor[]> {
  await ensureSetup();
  const db = getAiDb();
  const q = toVectorLiteral(features);
  const res = await db.execute(sql`
    SELECT label, (features <-> ${q}::vector) AS distance
    FROM fraud_transactions
    WHERE label IS NOT NULL
    ORDER BY features <-> ${q}::vector
    LIMIT ${k}
  `);
  return (res as unknown as { rows: Array<{ label: number; distance: number }> }).rows.map(
    (r) => ({ label: (r.label === 1 ? 1 : 0) as FraudLabel, distance: Number(r.distance) })
  );
}

/** Count labeled rows (sanity/stat helper). */
export async function countLabeled(): Promise<{ fraud: number; legit: number }> {
  await ensureSetup();
  const db = getAiDb();
  const res = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE label = 1)::int AS fraud,
      COUNT(*) FILTER (WHERE label = 0)::int AS legit
    FROM fraud_transactions
  `);
  const row = (res as unknown as { rows: Array<{ fraud: number; legit: number }> }).rows[0];
  return { fraud: Number(row?.fraud ?? 0), legit: Number(row?.legit ?? 0) };
}
