/**
 * Reusable knowledge-base sync core (extracted from scripts/sync-knowledge-base.ts).
 *
 * `buildKnowledgeSource` resolves a source (Drive or local) from options +
 * config; `runKnowledgeSync` adds the config guards, migrations, and the
 * `syncKnowledgeBase` orchestration. Both the CLI script and the in-process
 * scheduler call these so the source-resolution logic lives in exactly one place.
 *
 * Note: callers own pool lifecycle. The CLI closes the AI pool and exits; the
 * long-lived server scheduler keeps it open. So nothing here calls closeAiPool().
 */
import path from "node:path";

import { config } from "../../config.js";
import { runAiMigrations } from "../../db/vector.js";
import { isEmbeddingsConfigured } from "./embeddings.js";
import { syncKnowledgeBase, type SyncSummary } from "./ingest.js";
import { createLocalSource } from "./sources/local.js";
import { createDriveSource } from "./sources/drive.js";
import type { KnowledgeSource } from "./sources/types.js";

export type KnowledgeSourceKind = "drive" | "local";

export type BuildSourceOptions = {
  kind: KnowledgeSourceKind;
  category?: string;
  /** Drive: overrides VIRLY_RAG_DRIVE_FOLDER_ID. */
  folderId?: string;
  /** Local: overrides VIRLY_RAG_LOCAL_DIR. */
  dir?: string;
  log?: (message: string) => void;
};

export async function buildKnowledgeSource(
  opts: BuildSourceOptions
): Promise<{ source: KnowledgeSource; label: string }> {
  const log = opts.log ?? (() => {});

  if (opts.kind === "local") {
    const dirArg = opts.dir ?? config.rag.localDir;
    if (!dirArg) {
      throw new Error("Local source needs --dir=<path> or VIRLY_RAG_LOCAL_DIR.");
    }
    const dir = path.resolve(dirArg);
    return { source: createLocalSource(dir, opts.category), label: `local dir=${dir}` };
  }

  if (opts.kind === "drive") {
    const folderId = opts.folderId ?? config.rag.drive.folderId;
    if (!folderId) {
      throw new Error("Drive source needs --folder=<id> or VIRLY_RAG_DRIVE_FOLDER_ID.");
    }
    // Import the googleapis-backed client lazily so the SDK loads only for Drive.
    const { createGoogleDriveClient } = await import("./sources/driveClient.js");
    const client = createGoogleDriveClient();
    const source = createDriveSource(folderId, client, {
      categoryOverride: opts.category,
      onSkip: (file, reason) => log(`~ skip   ${file.name} (${reason})`)
    });
    return { source, label: `drive folder=${folderId}` };
  }

  throw new Error(`Unknown source kind=${opts.kind}. Use 'drive' or 'local'.`);
}

export type RunKnowledgeSyncOptions = {
  kind: KnowledgeSourceKind;
  category?: string;
  folderId?: string;
  dir?: string;
  /** Re-embed even unchanged files. The scheduler always leaves this false. */
  force?: boolean;
  dryRun?: boolean;
  /** Per-file progress sink. */
  log?: (message: string) => void;
  /** Called once after the source resolves, before syncing (for a header line). */
  onStart?: (info: { label: string; dryRun: boolean }) => void;
};

export async function runKnowledgeSync(
  opts: RunKnowledgeSyncOptions
): Promise<{ summary: SyncSummary; label: string }> {
  const log = opts.log ?? (() => {});
  const dryRun = opts.dryRun ?? false;

  if (!config.rag.aiPgUrl) {
    throw new Error(
      "No AI Postgres configured. Set VIRLY_AI_PG_URL (or VIRLY_VECTOR_DB_URL / VIRLY_POSTGRES_URL)."
    );
  }
  if (!dryRun && !isEmbeddingsConfigured()) {
    throw new Error("OPENAI_API_KEY is required to embed documents (or pass --dry-run).");
  }

  const { source, label } = await buildKnowledgeSource({
    kind: opts.kind,
    category: opts.category,
    folderId: opts.folderId,
    dir: opts.dir,
    log
  });
  opts.onStart?.({ label, dryRun });

  // migrate() is idempotent (tracked in __drizzle_migrations_ai); a no-op once applied.
  if (!dryRun) {
    await runAiMigrations();
  }

  const summary = await syncKnowledgeBase(source, {
    dryRun,
    force: opts.force ?? false,
    log
  });

  return { summary, label };
}
