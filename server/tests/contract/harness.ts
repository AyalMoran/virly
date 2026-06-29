
// server/tests/contract/harness.ts
import mongoose from "mongoose";
import { createMongoRepositories } from "../../src/repositories/mongo/index.js";
import { createPostgresRepositories } from "../../src/repositories/postgres/index.js";
import { getPgDb, runPgMigrations, closePgPool } from "../../src/db/postgres.js";
import type { Repositories } from "../../src/repositories/types.js";

export type ContractCtx = { repos: Repositories };
export type ContractCase = (ctx: ContractCtx) => Promise<void>;

const PG_TABLES = [
  "video_audit_logs", "video_sessions", "ai_audit_logs", "ai_pending_transfers",
  "ai_conversations", "exchange_rates", "personal_details", "transactions", "users"
];

export function describeContract(name: string, cases: Record<string, ContractCase>) {
  // ---- Postgres driver ----
  const pgUrl = process.env.CONTRACT_PG_URL;
  (pgUrl ? describe : describe.skip)(`[postgres] ${name}`, () => {
    let repos: Repositories;

    beforeAll(async () => {
      process.env.VIRLY_POSTGRES_URL = pgUrl;
      await runPgMigrations();
      const db = getPgDb();
      repos = createPostgresRepositories(db);
    });

    afterAll(async () => {
      await closePgPool();
    });

    for (const [label, fn] of Object.entries(cases)) {
      test(label, async () => {
        const db = getPgDb();
        await db.execute(`TRUNCATE ${PG_TABLES.join(", ")} CASCADE`);
        await fn({ repos });
      });
    }
  });

  // ---- Mongo driver ----
  const mongoUrl = process.env.CONTRACT_MONGO_URL;
  (mongoUrl ? describe : describe.skip)(`[mongo] ${name}`, () => {
    let repos: Repositories;

    beforeAll(async () => {
      await mongoose.connect(mongoUrl!);
      repos = createMongoRepositories();
    });

    afterAll(async () => {
      await mongoose.disconnect();
    });

    for (const [label, fn] of Object.entries(cases)) {
      test(label, async () => {
        await mongoose.connection.dropDatabase();
        // dropDatabase removes indexes too; rebuild them so unique
        // constraints (e.g. users.email) are enforced like Postgres'
        // TRUNCATE keeps the schema's indexes.
        await mongoose.connection.syncIndexes();
        await fn({ repos });
      });
    }
  });
}
