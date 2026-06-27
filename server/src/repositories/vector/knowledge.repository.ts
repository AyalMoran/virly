/**
 * pgvector-backed KnowledgeRepository (RAG_PLAN.md §4).
 *
 * Documents are upserted by (source, sourceRef); chunks are replaced wholesale on
 * re-sync (idempotent). Search uses pgvector's cosine-distance operator (`<=>`)
 * with the HNSW index; similarity is reported as 1 - distance in [0, 1].
 */
import { and, eq, sql } from "drizzle-orm";

import { getAiDb } from "../../db/vector.js";
import { newObjectId } from "../postgres/id.js";
import { knowledgeChunks, knowledgeDocuments } from "./schema.js";
import type {
  KnowledgeChunkInput,
  KnowledgeDocumentRecord,
  KnowledgeDocumentSource,
  KnowledgeDocumentUpsert,
  KnowledgeRepository,
  KnowledgeSearchCriteria,
  KnowledgeSearchHit
} from "./types.js";

type DocRow = typeof knowledgeDocuments.$inferSelect;

function toDocRecord(r: DocRow): KnowledgeDocumentRecord {
  return {
    id: r.id,
    source: r.source as KnowledgeDocumentSource,
    sourceRef: r.sourceRef,
    revision: r.revision,
    title: r.title,
    mimeType: r.mimeType ?? null,
    category: r.category ?? null,
    uri: r.uri ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

/** Render a number[] as a pgvector literal: [1,2,3]. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export const knowledgeRepository: KnowledgeRepository = {
  async upsertDocument(input: KnowledgeDocumentUpsert): Promise<KnowledgeDocumentRecord> {
    const db = getAiDb();
    const now = new Date();
    const [row] = await db
      .insert(knowledgeDocuments)
      .values({
        id: newObjectId(),
        source: input.source,
        sourceRef: input.sourceRef,
        revision: input.revision,
        title: input.title,
        mimeType: input.mimeType ?? null,
        category: input.category ?? null,
        uri: input.uri ?? null,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [knowledgeDocuments.source, knowledgeDocuments.sourceRef],
        set: {
          revision: input.revision,
          title: input.title,
          mimeType: input.mimeType ?? null,
          category: input.category ?? null,
          uri: input.uri ?? null,
          updatedAt: now
        }
      })
      .returning();
    return toDocRecord(row);
  },

  async replaceChunks(documentId: string, chunks: KnowledgeChunkInput[]): Promise<void> {
    const db = getAiDb();
    await db.transaction(async (tx) => {
      await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
      if (chunks.length === 0) return;
      const now = new Date();
      await tx.insert(knowledgeChunks).values(
        chunks.map((c) => ({
          id: newObjectId(),
          documentId,
          chunkIndex: c.chunkIndex,
          content: c.content,
          tokenCount: c.tokenCount,
          embedding: c.embedding,
          metadata: c.metadata ?? {},
          createdAt: now
        }))
      );
    });
  },

  async search(criteria: KnowledgeSearchCriteria): Promise<KnowledgeSearchHit[]> {
    const db = getAiDb();
    const queryVec = toVectorLiteral(criteria.embedding);
    const minScore = criteria.minScore ?? 0;
    // distance = cosine distance (0 = identical); similarity = 1 - distance.
    const result = await db.execute(sql`
      SELECT
        c.document_id           AS "documentId",
        c.chunk_index           AS "chunkIndex",
        c.content               AS "content",
        c.metadata              AS "metadata",
        1 - (c.embedding <=> ${queryVec}::vector) AS "score",
        d.title                 AS "title",
        d.category              AS "category",
        d.uri                   AS "uri",
        d.source_ref            AS "sourceRef"
      FROM knowledge_chunks c
      JOIN knowledge_documents d ON d.id = c.document_id
      ${criteria.category ? sql`WHERE d.category = ${criteria.category}` : sql``}
      ORDER BY c.embedding <=> ${queryVec}::vector ASC
      LIMIT ${criteria.topK}
    `);
    const rows = (result as { rows: Array<Record<string, unknown>> }).rows;
    return rows
      .map((row) => ({
        documentId: row["documentId"] as string,
        chunkIndex: Number(row["chunkIndex"]),
        content: row["content"] as string,
        score: Number(row["score"]),
        title: row["title"] as string,
        category: (row["category"] as string | null) ?? null,
        uri: (row["uri"] as string | null) ?? null,
        sourceRef: row["sourceRef"] as string,
        metadata: (row["metadata"] as Record<string, unknown> | null) ?? {}
      }))
      .filter((hit) => hit.score >= minScore);
  },

  async listDocumentRefs(source: KnowledgeDocumentSource) {
    const db = getAiDb();
    const rows = await db
      .select({
        id: knowledgeDocuments.id,
        sourceRef: knowledgeDocuments.sourceRef,
        revision: knowledgeDocuments.revision
      })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.source, source));
    return rows;
  },

  async deleteBySourceRef(source: KnowledgeDocumentSource, sourceRef: string): Promise<void> {
    const db = getAiDb();
    await db.transaction(async (tx) => {
      const [doc] = await tx
        .select({ id: knowledgeDocuments.id })
        .from(knowledgeDocuments)
        .where(
          and(
            eq(knowledgeDocuments.source, source),
            eq(knowledgeDocuments.sourceRef, sourceRef)
          )
        )
        .limit(1);
      if (!doc) return;
      await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc.id));
      await tx.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, doc.id));
    });
  }
};
