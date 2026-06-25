
// server/tests/contract/harness.ts
import test from "node:test";
import mongoose from "mongoose";
import { createMongoRepositories } from "../../src/repositories/mongo/index.js";
import { createPostgresRepositories } from "../../src/repositories/postgres/index.js";
import { getPgDb, runPgMigrations, closePgPool } from "../../src/db/postgres.js";
import type { Repositories } from "../../src/repositories/types.js";

export type ContractCtx = { repos: Repositories };
export type ContractCase = (ctx: ContractCtx, t: test.TestContext) => Promise<void>;

const PG_TABLES = [
  "video_audit_logs", "video_sessions", "ai_audit_logs", "ai_pending_transfers",
  "ai_conversations", "exchange_rates", "personal_details", "transactions", "users"
];

export function describeContract(name: string, cases: Record<string, ContractCase>) {
  // ---- Postgres driver ----
  const pgUrl = process.env.CONTRACT_PG_URL;
  test(`[postgres] ${name}`, { skip: pgUrl ? false : "set CONTRACT_PG_URL to run" }, async (t) => {
    process.env.VIRLY_POSTGRES_URL = pgUrl;
    try {
      await runPgMigrations();
      const db = getPgDb();
      const repos = createPostgresRepositories(db);
      for (const [label, fn] of Object.entries(cases)) {
        await t.test(label, async (st) => {
          await db.execute(`TRUNCATE ${PG_TABLES.join(", ")} CASCADE`);
          await fn({ repos }, st);
        });
      }
    } finally {
      await closePgPool();
    }
  });

  // ---- Mongo driver ----
  const mongoUrl = process.env.CONTRACT_MONGO_URL;
  test(`[mongo] ${name}`, { skip: mongoUrl ? false : "set CONTRACT_MONGO_URL to run" }, async (t) => {
    try {
      await mongoose.connect(mongoUrl!);
      const repos = createMongoRepositories();
      for (const [label, fn] of Object.entries(cases)) {
        await t.test(label, async (st) => {
          await mongoose.connection.dropDatabase();
          // dropDatabase removes indexes too; rebuild them so unique
          // constraints (e.g. users.email) are enforced like Postgres'
          // TRUNCATE keeps the schema's indexes.
          await mongoose.connection.syncIndexes();
          await fn({ repos }, st);
        });
      }
    } finally {
      await mongoose.disconnect();
    }
  });
}
