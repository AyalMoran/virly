/**
 * Ingest the Kaggle Credit Card Fraud dataset into pgvector (RAG_PLAN.md M4).
 *
 * Free, embedding-free: parse the CSV, fit a StandardScaler, save it as an
 * artifact (reused at score time), standardize, and bulk-insert feature vectors.
 * Run from server/:
 *   npm run fraud:ingest -- --file=/path/to/creditcard.csv
 *   npm run fraud:ingest -- --file=./fraud-sample/creditcard.sample.csv   # demo
 *
 * Requires VIRLY_AI_PG_URL. No OpenAI/embeddings needed.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { config } from "../src/config.js";
import { closeAiPool } from "../src/db/vector.js";
import { parseCreditCardCsv } from "../src/fraud/csv.js";
import { countLabeled, insertMany, setupFraudSchema } from "../src/fraud/repository.js";
import { fitScaler, transform } from "../src/fraud/scaler.js";

function getFlag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const DEFAULT_SCALER = path.resolve(import.meta.dirname, "../artifacts/fraud-scaler.json");

async function main(): Promise<void> {
  const file = getFlag("file");
  const source = getFlag("source") ?? "creditcard";
  const scalerOut = getFlag("scaler-out") ?? DEFAULT_SCALER;
  const limit = getFlag("limit") ? Number(getFlag("limit")) : undefined;

  if (!file) throw new Error("Pass --file=<path to creditcard.csv>.");
  if (!config.rag.aiPgUrl) {
    throw new Error("VIRLY_AI_PG_URL (or VIRLY_VECTOR_DB_URL / VIRLY_POSTGRES_URL) is required.");
  }

  const text = await fs.readFile(path.resolve(file), "utf8");
  let rows = parseCreditCardCsv(text);
  if (limit) rows = rows.slice(0, limit);
  if (rows.length === 0) throw new Error("No rows parsed from the CSV.");

  console.log(`Parsed ${rows.length} rows. Fitting scaler...`);
  const scaler = fitScaler(rows.map((r) => r.features));
  await fs.mkdir(path.dirname(scalerOut), { recursive: true });
  await fs.writeFile(scalerOut, JSON.stringify(scaler));
  console.log(`Saved scaler to ${scalerOut}.`);

  await setupFraudSchema();
  const inserted = await insertMany(
    rows.map((r) => ({ source, features: transform(r.features, scaler), label: r.label }))
  );
  const counts = await countLabeled();
  console.log(
    `Inserted ${inserted} transactions. Labeled totals — fraud: ${counts.fraud}, legit: ${counts.legit}.`
  );
}

main()
  .then(() => closeAiPool())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeAiPool().catch(() => {});
    process.exit(1);
  });
