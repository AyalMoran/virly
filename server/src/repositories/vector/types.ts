/**
 * AI-store record + repository types (RAG_PLAN.md §4).
 *
 * Plain POJOs (id is the 24-hex ObjectId string, mirroring the app repos).
 */

export type KnowledgeDocumentSource = "local" | "drive";

export type KnowledgeDocumentRecord = {
  id: string;
  source: KnowledgeDocumentSource;
  sourceRef: string;
  revision: string;
  title: string;
  mimeType: string | null;
  category: string | null;
  uri: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A chunk to embed + store (the embedding is the model output, length must match the column). */
export type KnowledgeChunkInput = {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[];
  metadata?: Record<string, unknown>;
};

/** A retrieved chunk joined to its parent document, with its similarity score. */
export type KnowledgeSearchHit = {
  documentId: string;
  chunkIndex: number;
  content: string;
  /** Cosine similarity in [0, 1]; higher is closer. */
  score: number;
  title: string;
  category: string | null;
  uri: string | null;
  sourceRef: string;
  metadata: Record<string, unknown>;
};

export type KnowledgeSearchCriteria = {
  embedding: number[];
  topK: number;
  /** Restrict to one document category (e.g. 'policy'); omit for all. */
  category?: string;
  /** Drop hits below this cosine similarity (0..1). */
  minScore?: number;
};

export type KnowledgeDocumentUpsert = {
  source: KnowledgeDocumentSource;
  sourceRef: string;
  revision: string;
  title: string;
  mimeType?: string | null;
  category?: string | null;
  uri?: string | null;
};

export interface KnowledgeRepository {
  /** Insert or update a document by (source, sourceRef); returns the stored record. */
  upsertDocument(input: KnowledgeDocumentUpsert): Promise<KnowledgeDocumentRecord>;
  /** Replace ALL chunks for a document (delete + insert) so re-sync is idempotent. */
  replaceChunks(documentId: string, chunks: KnowledgeChunkInput[]): Promise<void>;
  /** Top-k cosine-similarity search, optionally filtered by category. */
  search(criteria: KnowledgeSearchCriteria): Promise<KnowledgeSearchHit[]>;
  /** All stored (source, sourceRef, revision) tuples — drives removal detection on sync. */
  listDocumentRefs(source: KnowledgeDocumentSource): Promise<
    Array<{ id: string; sourceRef: string; revision: string }>
  >;
  /** Delete a document and its chunks (a source file vanished). */
  deleteBySourceRef(source: KnowledgeDocumentSource, sourceRef: string): Promise<void>;
}
