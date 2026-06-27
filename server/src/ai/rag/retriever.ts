/**
 * Policy-document retriever (RAG_PLAN.md §4) — the single retrieval entry point.
 *
 * Embeds the query and runs a top-k cosine search over the knowledge base,
 * returning chunks WITH citation metadata. The v2 `searchPolicyDocs` tool wraps
 * this directly (no MCP hop); a future MCP server would wrap this same function.
 *
 * Degrades gracefully: when RAG is disabled or embeddings aren't configured it
 * returns `{ available: false }` rather than throwing, so the agent can tell the
 * user the knowledge base isn't set up instead of erroring the turn.
 */
import { config } from "../../config.js";
import { knowledgeRepository } from "../../repositories/vector/knowledge.repository.js";
import type { KnowledgeRepository, KnowledgeSearchHit } from "../../repositories/vector/types.js";
import { embedQuery, isEmbeddingsConfigured } from "./embeddings.js";

export type PolicyDocCitation = {
  title: string;
  category: string | null;
  uri: string | null;
  sourceRef: string;
  chunkIndex: number;
  score: number;
  excerpt: string;
};

export type RetrievePolicyDocsResult =
  | { available: false; reason: "disabled" | "not_configured"; citations: [] }
  | { available: true; citations: PolicyDocCitation[] };

export type RetrievePolicyDocsOptions = {
  topK?: number;
  category?: string;
  /** Injected for tests; defaults to the real pgvector repository. */
  repository?: KnowledgeRepository;
  /** Injected for tests; defaults to the real OpenAI embedder. */
  embed?: (text: string) => Promise<number[]>;
};

function toCitation(hit: KnowledgeSearchHit): PolicyDocCitation {
  return {
    title: hit.title,
    category: hit.category,
    uri: hit.uri,
    sourceRef: hit.sourceRef,
    chunkIndex: hit.chunkIndex,
    score: Number(hit.score.toFixed(4)),
    excerpt: hit.content
  };
}

/**
 * Config-free retrieval core: embed the query, search, map to citations. Both the
 * production wrapper and tests call this — the wrapper adds env-gating on top.
 */
export async function searchKnowledge(params: {
  query: string;
  embed: (text: string) => Promise<number[]>;
  repository: KnowledgeRepository;
  topK: number;
  category?: string;
  minScore?: number;
}): Promise<PolicyDocCitation[]> {
  const embedding = await params.embed(params.query);
  const hits = await params.repository.search({
    embedding,
    topK: params.topK,
    category: params.category,
    minScore: params.minScore
  });
  return hits.map(toCitation);
}

export async function retrievePolicyDocs(
  query: string,
  options: RetrievePolicyDocsOptions = {}
): Promise<RetrievePolicyDocsResult> {
  if (!config.rag.enabled) {
    return { available: false, reason: "disabled", citations: [] };
  }
  const embed = options.embed ?? embedQuery;
  if (!options.embed && !isEmbeddingsConfigured()) {
    return { available: false, reason: "not_configured", citations: [] };
  }

  const citations = await searchKnowledge({
    query,
    embed,
    repository: options.repository ?? knowledgeRepository,
    topK: options.topK ?? config.rag.topK,
    category: options.category,
    minScore: config.rag.minScore
  });

  return { available: true, citations };
}
