/**
 * AI-store (pgvector) schema — RAG_PLAN.md §3.
 *
 * Two tables, kept OUT of the driver-switched `postgres/schema.ts` so the AI
 * store has its own independent migration history:
 *  - `knowledge_documents`: one row per source file (Drive file / local path).
 *  - `knowledge_chunks`: one embedded chunk per row, with a vector(1536) column.
 *
 * The `vector` extension is enabled in `runAiMigrations()` before these apply.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  char,
  text,
  integer,
  timestamp,
  jsonb,
  vector,
  uniqueIndex,
  index
} from "drizzle-orm/pg-core";

const id = () => char("id", { length: 24 }).primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull();

/** Matches config.rag.embeddingDimensions (text-embedding-3-small). */
export const EMBEDDING_DIMENSIONS = 1536;

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: id(),
    /** Where the document came from: a local folder or Google Drive (M2). */
    source: text("source").notNull(),
    /** Stable per-source identity: Drive fileId or the local relative path. */
    sourceRef: text("source_ref").notNull(),
    /** Drive revisionId or a content hash — lets re-sync skip unchanged files. */
    revision: text("revision").notNull(),
    title: text("title").notNull(),
    mimeType: text("mime_type"),
    /** e.g. 'policy' | 'loan_package' — drives the optional retrieval filter. */
    category: text("category"),
    uri: text("uri"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [uniqueIndex("knowledge_documents_source_ref_uq").on(t.source, t.sourceRef)]
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: id(),
    documentId: char("document_id", { length: 24 }).notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt()
  },
  (t) => [
    uniqueIndex("knowledge_chunks_doc_idx_uq").on(t.documentId, t.chunkIndex),
    index("knowledge_chunks_doc_idx").on(t.documentId),
    // Approximate-nearest-neighbour index for cosine similarity search.
    index("knowledge_chunks_embedding_hnsw")
      .using("hnsw", t.embedding.op("vector_cosine_ops"))
  ]
);
