/**
 * Sync the RAG knowledge base from a source into pgvector (RAG_PLAN.md §4).
 *
 * Run from server/:
 *   npm run rag:sync -- --source=drive                 # sync the Drive folder (M2)
 *   npm run rag:sync -- --source=local --dir=/abs/path # sync a local folder (M1)
 *   npm run rag:sync -- ... --dry-run                  # show the plan, write nothing
 *   npm run rag:sync -- ... --force                    # re-embed even unchanged files
 *
 * Drive uses VIRLY_RAG_DRIVE_FOLDER_ID + a service account
 * (VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON or VIRLY_GOOGLE_APPLICATION_CREDENTIALS).
 * Local uses --dir or VIRLY_RAG_LOCAL_DIR. Both require VIRLY_AI_PG_URL and,
 * unless --dry-run, OPENAI_API_KEY.
 */
import path from "node:path";

import { config } from "../src/config.js";
import { runAiMigrations, closeAiPool } from "../src/db/vector.js";
import { isEmbeddingsConfigured } from "../src/ai/rag/embeddings.js";
import { syncKnowledgeBase } from "../src/ai/rag/ingest.js";
import { createLocalSource } from "../src/ai/rag/sources/local.js";
import { createDriveSource } from "../src/ai/rag/sources/drive.js";
import type { KnowledgeSource } from "../src/ai/rag/sources/types.js";

function getFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function buildSource(category?: string): Promise<{ source: KnowledgeSource; label: string }> {
  const kind = getFlag("source") ?? "drive";

  if (kind === "local") {
    const dirArg = getFlag("dir") ?? config.rag.localDir;
    if (!dirArg) {
      throw new Error("Local source needs --dir=<path> or VIRLY_RAG_LOCAL_DIR.");
    }
    const dir = path.resolve(dirArg);
    return { source: createLocalSource(dir, category), label: `local dir=${dir}` };
  }

  if (kind === "drive") {
    const folderId = getFlag("folder") ?? config.rag.drive.folderId;
    if (!folderId) {
      throw new Error("Drive source needs --folder=<id> or VIRLY_RAG_DRIVE_FOLDER_ID.");
    }
    // Import the googleapis-backed client lazily so the SDK loads only for Drive.
    const { createGoogleDriveClient } = await import("../src/ai/rag/sources/driveClient.js");
    const client = createGoogleDriveClient();
    const source = createDriveSource(folderId, client, {
      categoryOverride: category,
      onSkip: (file, reason) => console.log(`  ~ skip   ${file.name} (${reason})`)
    });
    return { source, label: `drive folder=${folderId}` };
  }

  throw new Error(`Unknown --source=${kind}. Use 'drive' or 'local'.`);
}

async function main(): Promise<void> {
  const dryRun = hasFlag("dry-run");
  const force = hasFlag("force");
  const category = getFlag("category");

  if (!config.rag.aiPgUrl) {
    throw new Error(
      "No AI Postgres configured. Set VIRLY_AI_PG_URL (or VIRLY_VECTOR_DB_URL / VIRLY_POSTGRES_URL)."
    );
  }
  if (!dryRun && !isEmbeddingsConfigured()) {
    throw new Error("OPENAI_API_KEY is required to embed documents (or pass --dry-run).");
  }

  const { source, label } = await buildSource(category);
  console.log(`Knowledge sync — source=${label}${dryRun ? " [dry-run]" : ""}`);

  if (!dryRun) {
    await runAiMigrations();
  }

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
