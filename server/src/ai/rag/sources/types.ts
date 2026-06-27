/**
 * Knowledge-base source adapter interface (RAG_PLAN.md §4).
 *
 * M1 ships only the local-folder adapter; the Drive adapter (M2) implements this
 * same interface so the sync script never changes. A source yields the raw files;
 * chunking + embedding + upserting is the script's job, not the source's.
 */
import type { KnowledgeDocumentSource } from "../../../repositories/vector/types.js";

export type SourceFile = {
  /** Stable identity within the source: a path (local) or fileId (Drive). */
  sourceRef: string;
  /** Changes whenever the content changes (content hash / Drive revisionId). */
  revision: string;
  title: string;
  mimeType: string | null;
  category: string | null;
  /** A human-openable locator for citations (file path, Drive URL). */
  uri: string | null;
  content: string;
};

export interface KnowledgeSource {
  readonly kind: KnowledgeDocumentSource;
  list(): Promise<SourceFile[]>;
}
