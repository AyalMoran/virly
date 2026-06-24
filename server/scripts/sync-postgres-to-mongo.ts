// server/scripts/sync-postgres-to-mongo.ts
//
// The reverse of sync-mongo-to-postgres: copy every Postgres table back into the
// matching Mongo collection. Idempotent — each doc is upserted by `_id` via
// bulkWrite. Used to roll back a cutover. `timestamps: false` preserves the
// original createdAt/updatedAt instead of letting Mongoose stamp now().
//
//   tsx scripts/sync-postgres-to-mongo.ts
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { getPgDb, runPgMigrations, closePgPool } from "../src/db/postgres.js";
import { ENTITIES, rowToDoc } from "./_entities.js";

async function main(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  const db = getPgDb();
  await runPgMigrations();

  try {
    for (const { name, model, table } of ENTITIES) {
      const rows = (await db.select().from(table)) as Record<string, unknown>[];
      if (rows.length === 0) {
        console.log(`${name}: 0 rows -> mongo`);
        continue;
      }
      const ops = rows.map((row) => {
        const { _id, ...rest } = rowToDoc(row);
        return { updateOne: { filter: { _id }, update: { $set: rest }, upsert: true } };
      });
      await model.bulkWrite(ops, { timestamps: false });
      console.log(`${name}: upserted ${rows.length} row(s) -> mongo`);
    }
    console.log("postgres -> mongo sync complete.");
  } finally {
    await mongoose.disconnect();
    await closePgPool();
  }
}

main().catch((e) => {
  console.error("postgres -> mongo sync failed:", e);
  process.exit(1);
});
