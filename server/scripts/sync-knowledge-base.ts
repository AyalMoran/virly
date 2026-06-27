/**
 * Sync the RAG knowledge base from a source into pgvector (RAG_PLAN.md §4).
 *
 * M1: local-folder source only. Run from server/:
 *   npm run rag:sync                       # sync server/knowledge-base → AI Postgres
 *   npm run rag:sync -- --dir=./docs       # custom folder
 *   npm run rag:sync -- --dry-run          # show the plan, write nothing
 *   npm run rag:sync -- --force            # re-embed even unchanged files
 *
 * Requires VIRLY_AI_PG_URL (or VIRLY_VECTOR_DB_URL / VIRLY_POSTGRES_URL) and,
 * unless --dry-run, OPENAI_API_KEY.
 */
import path from "node:path";

import { config } from "../src/config.js";
import { runAiMigrations, closeAiPool } from "../src/db/vector.js";
import { isEmbeddingsConfigured } from "../src/ai/rag/embeddings.js";
import { syncKnowledgeBase } from "../src/ai/rag/ingest.js";
import { createLocalSource } from "../src/ai/rag/sources/local.js";

function getFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const dryRun = hasFlag("dry-run");
  const force = hasFlag("force");
  const dir = getFlag("dir") ?? path.resolve(import.meta.dirname, "../knowledge-base");
  const category = getFlag("category");

  if (!config.rag.aiPgUrl) {
    throw new Error(
      "No AI Postgres configured. Set VIRLY_AI_PG_URL (or VIRLY_VECTOR_DB_URL / VIRLY_POSTGRES_URL)."
    );
  }
  if (!dryRun && !isEmbeddingsConfigured()) {
    throw new Error("OPENAI_API_KEY is required to embed documents (or pass --dry-run).");
  }

  console.log(`Knowledge sync — source=local dir=${dir}${dryRun ? " [dry-run]" : ""}`);

  if (!dryRun) {
    await runAiMigrations();
  }

  const source = createLocalSource(dir, category);
  const summary = await syncKnowledgeBase(source, {
    dryRun,
    force,
    log: (m) => console.log(`  ${m}`)
  });

  console.log(
    `Done: ${summary.created} created, ${summary.updated} updated, ` +
      `${summary.skipped} skipped, ${summary.removed} removed, ${summary.chunks} chunks.`
  );
}

main()
  .then(() => closeAiPool())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeAiPool().catch(() => {});
    process.exit(1);
  });
