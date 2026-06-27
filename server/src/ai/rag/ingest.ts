/**
 * Knowledge-base ingestion orchestrator (RAG_PLAN.md §4).
 *
 * Pulls files from a source, chunks + embeds the ones whose revision changed, and
 * upserts them into the vector store. Idempotent: unchanged files (same revision)
 * are skipped, and documents that vanished from the source are removed. The
 * repository + embedder are injected so this is unit-testable without a DB/OpenAI.
 */
import { chunkDocument } from "./chunk.js";
import { embedDocuments } from "./embeddings.js";
import type { KnowledgeSource } from "./sources/types.js";
import { knowledgeRepository } from "../../repositories/vector/knowledge.repository.js";
import type {
  KnowledgeChunkInput,
  KnowledgeRepository
} from "../../repositories/vector/types.js";

export type SyncSummary = {
  created: number;
  updated: number;
  skipped: number;
  removed: number;
  chunks: number;
};

export type SyncOptions = {
  dryRun?: boolean;
  /** Re-embed even when the revision is unchanged. */
  force?: boolean;
  repository?: KnowledgeRepository;
  embed?: (texts: string[]) => Promise<number[][]>;
  log?: (message: string) => void;
  chunkOptions?: Parameters<typeof chunkDocument>[1];
};

export async function syncKnowledgeBase(
  source: KnowledgeSource,
  options: SyncOptions = {}
): Promise<SyncSummary> {
  const repository = options.repository ?? knowledgeRepository;
  const embed = options.embed ?? embedDocuments;
  const log = options.log ?? (() => {});
  const summary: SyncSummary = { created: 0, updated: 0, skipped: 0, removed: 0, chunks: 0 };

  const files = await source.list();
  const existing = await repository.listDocumentRefs(source.kind);
  const existingByRef = new Map(existing.map((d) => [d.sourceRef, d]));
  const seenRefs = new Set<string>();

  for (const file of files) {
    seenRefs.add(file.sourceRef);
    const prior = existingByRef.get(file.sourceRef);
    const isNew = !prior;
    const unchanged = prior?.revision === file.revision;

    if (unchanged && !options.force) {
      summary.skipped += 1;
      log(`= skip   ${file.sourceRef} (unchanged)`);
      continue;
    }

    const chunks = chunkDocument(file.content, options.chunkOptions);
    if (chunks.length === 0) {
      summary.skipped += 1;
      log(`= skip   ${file.sourceRef} (no content)`);
      continue;
    }

    if (options.dryRun) {
      log(`${isNew ? "+ create" : "~ update"} ${file.sourceRef} → ${chunks.length} chunks (dry-run)`);
      isNew ? (summary.created += 1) : (summary.updated += 1);
      summary.chunks += chunks.length;
      continue;
    }

    const embeddings = await embed(chunks.map((c) => c.content));
    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count (${embeddings.length}) != chunk count (${chunks.length}) for ${file.sourceRef}.`
      );
    }

    const doc = await repository.upsertDocument({
      source: source.kind,
      sourceRef: file.sourceRef,
      revision: file.revision,
      title: file.title,
      mimeType: file.mimeType,
      category: file.category,
      uri: file.uri
    });

    const chunkInputs: KnowledgeChunkInput[] = chunks.map((c, i) => ({
      chunkIndex: c.chunkIndex,
      content: c.content,
      tokenCount: c.tokenCount,
      embedding: embeddings[i],
      metadata: c.heading ? { heading: c.heading } : {}
    }));
    await repository.replaceChunks(doc.id, chunkInputs);

    isNew ? (summary.created += 1) : (summary.updated += 1);
    summary.chunks += chunks.length;
    log(`${isNew ? "+ create" : "~ update"} ${file.sourceRef} → ${chunks.length} chunks`);
  }

  // Removal detection: documents stored but no longer present in the source.
  for (const doc of existing) {
    if (seenRefs.has(doc.sourceRef)) continue;
    summary.removed += 1;
    if (!options.dryRun) {
      await repository.deleteBySourceRef(source.kind, doc.sourceRef);
    }
    log(`- remove ${doc.sourceRef}${options.dryRun ? " (dry-run)" : ""}`);
  }

  return summary;
}
