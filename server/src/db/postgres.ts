import path from "node:path";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../repositories/postgres/schema.js";
import { config } from "../config.js";

/** Absolute path to the generated migrations dir (server/drizzle), CWD-independent. */
const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../../drizzle");

export type PgDatabase = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: PgDatabase | null = null;

export function getPgDb(): PgDatabase {
  if (db) return db;
  const url = config.postgresUrl;
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
