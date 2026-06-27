import { defineConfig } from "drizzle-kit";

/**
 * Drizzle config for the DEDICATED AI-data Postgres (pgvector) — RAG_PLAN.md §5.
 * Fully separate from drizzle.config.ts so the AI store's schema + migration
 * history never collide with the driver-switched app schema.
 * Generate:  npm run rag:generate    Apply:  npm run rag:migrate
 */
export default defineConfig({
  schema: "./src/repositories/vector/schema.ts",
  out: "./drizzle-ai",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.VIRLY_AI_PG_URL ??
      process.env.VIRLY_VECTOR_DB_URL ??
      process.env.VIRLY_POSTGRES_URL ??
      ""
  }
});
