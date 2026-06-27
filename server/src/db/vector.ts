/**
 * Dedicated AI-data Postgres (pgvector) connection — RAG_PLAN.md §1, §4.
 *
 * This is DELIBERATELY separate from `db/postgres.ts`/`getPgDb()`: the app's OLTP
 * store follows `VIRLY_DB_DRIVER` (mongo | postgres), but the AI store (vectors
 * now; the LangGraph checkpointer in Phase M1.5) always lives in Postgres so it
 * is reachable even in mongo mode. Its schema + migration history are independent
 * (`drizzle-ai/`, applied by `npm run rag:migrate`).
 */
import path from "node:path";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import * as schema from "../repositories/vector/schema.js";
import { config } from "../config.js";

/** Absolute path to the AI-store migrations dir (server/drizzle-ai), CWD-independent. */
const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../../drizzle-ai");

export type AiDatabase = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: AiDatabase | null = null;

/** Resolve the AI Postgres URL, preferring the live env var (contract harness sets it late). */
function resolveUrl(): string {
  const url =
    process.env.VIRLY_AI_PG_URL ??
    process.env.VIRLY_VECTOR_DB_URL ??
    config.rag.aiPgUrl;
  if (!url) {
    throw new Error(
      "VIRLY_AI_PG_URL (or VIRLY_VECTOR_DB_URL / VIRLY_POSTGRES_URL) is required to use the AI store."
    );
  }
  return url;
}

export function getAiDb(): AiDatabase {
  if (db) return db;
  pool = new pg.Pool({ connectionString: resolveUrl() });
  db = drizzle(pool, { schema });
  return db;
}

/**
 * Enable the pgvector extension, then apply the AI-store migrations. The
 * extension is created here (idempotent) rather than in a migration so ordering
 * is never an issue.
 */
export async function runAiMigrations(): Promise<void> {
  const database = getAiDb();
  await database.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
}

export async function closeAiPool(): Promise<void> {
  await pool?.end();
  pool = null;
  db = null;
}
