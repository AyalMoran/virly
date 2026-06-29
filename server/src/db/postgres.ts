import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../repositories/postgres/schema.js";
import { config } from "../config.js";

/** Absolute path to the generated migrations dir (server/drizzle), CWD-independent.
 * Derived from import.meta.url (portable across Node ESM and Jest's ESM runtime,
 * which does not populate import.meta.dirname). */
const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle"
);

export type PgDatabase = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: PgDatabase | null = null;

export function getPgDb(): PgDatabase {
  if (db) return db;
  // Read the live env var first so a late-set VIRLY_POSTGRES_URL (e.g. the
  // contract harness sets it at runtime, after config.ts froze its snapshot)
  // is honoured; fall back to the config snapshot (which also resolves aliases).
  const url = process.env.VIRLY_POSTGRES_URL ?? config.postgresUrl;
  if (!url) throw new Error("VIRLY_POSTGRES_URL is required to use the postgres driver.");
  pool = new pg.Pool({ connectionString: url });
  db = drizzle(pool, { schema });
  return db;
}

export async function runPgMigrations(): Promise<void> {
  await migrate(getPgDb(), { migrationsFolder: MIGRATIONS_FOLDER });
}

export async function closePgPool(): Promise<void> {
  await pool?.end();
  pool = null;
  db = null;
}
