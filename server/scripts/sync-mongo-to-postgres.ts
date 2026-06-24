// server/scripts/sync-mongo-to-postgres.ts
//
// Copy every Mongo collection into the matching Postgres table. Idempotent and
// re-runnable: each row is upserted by `id` (INSERT ... ON CONFLICT (id) DO
// UPDATE). Run during a migration window before flipping VIRLY_DB_DRIVER.
//
//   tsx scripts/sync-mongo-to-postgres.ts
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { getPgDb, runPgMigrations, closePgPool } from "../src/db/postgres.js";
import { ENTITIES, docToRow } from "./_entities.js";

async function main(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  const db = getPgDb();
  await runPgMigrations();

  try {
    for (const { name, model, table } of ENTITIES) {
      const docs = (await model.find().lean()) as Record<string, unknown>[];
      let synced = 0;
      for (const doc of docs) {
        const row = docToRow(doc, table);
        const { id: _id, ...set } = row;
        void _id;
        await db
          .insert(table)
          .values(row)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .onConflictDoUpdate({ target: (table as any).id, set });
        synced++;
      }
      console.log(`${name}: synced ${synced} document(s) -> postgres`);
    }
    console.log("mongo -> postgres sync complete.");
  } finally {
    await mongoose.disconnect();
    await closePgPool();
  }
}

main().catch((e) => {
  console.error("mongo -> postgres sync failed:", e);
  process.exit(1);
});
