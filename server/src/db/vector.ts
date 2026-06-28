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
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import * as schema from "../repositories/vector/schema.js";
import { config } from "../config.js";

/** Absolute path to the AI-store migrations dir (server/drizzle-ai), CWD-independent.
 * Derived from import.meta.url (portable across Node ESM and Jest's ESM runtime,
 * which does not populate import.meta.dirname). */
const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle-ai"
);

export type AiDatabase = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: AiDatabase | null = null;

/**
 * Resolve the AI Postgres URL, preferring the live env var (the contract harness
 * sets it after config.ts froze its snapshot). Shared by every AI-Postgres
 * consumer (drizzle pool here, the checkpointer in checkpointer.ts) so the
 * precedence stays in one place.
 */
export function resolveAiPgUrl(): string {
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
  pool = new pg.Pool({ connectionString: resolveAiPgUrl() });
  // An idle-client error otherwise crashes the process; log and let the pool
  // recycle the connection.
  pool.on("error", (err) => {
    console.error("[ai-postgres] idle client error:", err.message);
  });
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
  // Use a SEPARATE tracking table from the app's migrations: the AI store may
  // share one Postgres with the app (VIRLY_AI_PG_URL defaults to the app URL),
  // and Drizzle's default `__drizzle_migrations` table would otherwise be shared
  // — making the two independent histories clobber each other.
  await migrate(database, {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsTable: "__drizzle_migrations_ai"
  });
}

export async function closeAiPool(): Promise<void> {
  await pool?.end();
  pool = null;
  db = null;
}
