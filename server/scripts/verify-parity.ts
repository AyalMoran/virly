// server/scripts/verify-parity.ts
//
// Compare Mongo and Postgres for every entity: row count + a stable content
// checksum (records canonicalised to the table's column set, ObjectId/Map/Date
// normalised, keys sorted, sha256 over id-sorted records). Prints a per-entity
// table and exits non-zero on any mismatch — the cutover gate.
//
//   tsx scripts/verify-parity.ts
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { getPgDb, runPgMigrations, closePgPool } from "../src/db/postgres.js";
import { ENTITIES, tableColumnNames, mongoValueToPg } from "./_entities.js";

/** Deep-canonicalise: Date -> ISO, undefined -> null, object keys sorted. */
function canon(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = canon(o[k]);
    return out;
  }
  return v;
}

/** Build a column-restricted canonical record + its id, from either source. */
function recordFor(
  source: Record<string, unknown>,
  cols: string[],
  fromMongo: boolean
): { id: string; canon: string } {
  const rec: Record<string, unknown> = {};
  for (const col of cols) {
    if (col === "id") {
      rec.id = fromMongo ? String(source._id) : String(source.id);
    } else {
      rec[col] = fromMongo ? mongoValueToPg(source[col]) : source[col];
    }
  }
  return { id: String(rec.id), canon: JSON.stringify(canon(rec)) };
}

function checksum(records: { id: string; canon: string }[]): string {
  const h = createHash("sha256");
  for (const r of [...records].sort((a, b) => a.id.localeCompare(b.id))) h.update(r.canon);
  return h.digest("hex");
}

async function main(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  const db = getPgDb();
  await runPgMigrations();

  let mismatches = 0;
  const rows: string[] = [];

  try {
    for (const { name, model, table } of ENTITIES) {
      const cols = tableColumnNames(table);
      const mongoDocs = (await model.find().lean()) as Record<string, unknown>[];
      const pgRows = (await db.select().from(table)) as Record<string, unknown>[];

      const mongoSum = checksum(mongoDocs.map((d) => recordFor(d, cols, true)));
      const pgSum = checksum(pgRows.map((r) => recordFor(r, cols, false)));

      const countOk = mongoDocs.length === pgRows.length;
      const sumOk = mongoSum === pgSum;
      const ok = countOk && sumOk;
      if (!ok) mismatches++;

      rows.push(
        `${ok ? "OK  " : "FAIL"}  ${name.padEnd(22)} ` +
          `mongo=${String(mongoDocs.length).padStart(6)}  pg=${String(pgRows.length).padStart(6)}  ` +
          `${sumOk ? "checksum=match" : `checksum=DIFFER (mongo=${mongoSum.slice(0, 8)} pg=${pgSum.slice(0, 8)})`}`
      );
    }
  } finally {
    await mongoose.disconnect();
    await closePgPool();
  }

  console.log("\n=== mongo <-> postgres parity ===");
  for (const r of rows) console.log(r);
  console.log(mismatches === 0 ? "\nAll entities match. ✅" : `\n${mismatches} entit(y/ies) mismatched. ❌`);
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify-parity failed:", e);
  process.exit(1);
});
