/**
 * Embeddings factory for the RAG knowledge base (RAG_PLAN.md §4).
 *
 * Uses the same OpenAI key as the rest of the app, with the embedding model from
 * config (`text-embedding-3-small`, 1536-dim). One instance is reused per process.
 */
import { OpenAIEmbeddings } from "@langchain/openai";

import { config } from "../../config.js";

let cached: OpenAIEmbeddings | null = null;

export function isEmbeddingsConfigured(): boolean {
  return Boolean(config.ai.openAIApiKey.trim() && config.rag.embeddingModel.trim());
}

export function getEmbeddings(): OpenAIEmbeddings {
  if (cached) return cached;
  cached = new OpenAIEmbeddings({
    apiKey: config.ai.openAIApiKey,
    model: config.rag.embeddingModel,
    dimensions: config.rag.embeddingDimensions
  });
  return cached;
}

/** Embed a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  return getEmbeddings().embedQuery(text);
}

/** Embed a batch of documents (chunk contents). */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return getEmbeddings().embedDocuments(texts);
}
