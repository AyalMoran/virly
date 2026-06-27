/**
 * `searchPolicyDocs` — the RAG knowledge-base tool (RAG_PLAN.md §4).
 *
 * Unlike the other read-only tools, this does NOT wrap a v1 executor: it calls
 * the in-process policy-document retriever directly (no MCP hop). It returns the
 * top matching chunks with numbered citations the model can reference, and
 * degrades to a clear "knowledge base unavailable" message when RAG is off.
 */
import { tool } from "@langchain/core/tools";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";

import {
  retrievePolicyDocs,
  type PolicyDocCitation
} from "../../rag/retriever.js";
import { statusWriter } from "../streamEvents.js";
import * as D from "./descriptions.js";

function renderCitations(citations: PolicyDocCitation[]): string {
  if (citations.length === 0) {
    return "No matching policy or loan documents were found for that query.";
  }
  const lines = citations.map((c, i) => {
    const label = c.category ? `${c.title} (${c.category})` : c.title;
    const source = c.uri ?? c.sourceRef;
    return `[${i + 1}] ${label} — source: ${source}\n${c.excerpt}`;
  });
  return (
    "Relevant documents (cite these by their [number] in your answer):\n\n" +
    lines.join("\n\n")
  );
}

export const searchPolicyDocsTool = tool(
  async (args, config: LangGraphRunnableConfig) => {
    statusWriter(config)?.({ kind: "status", label: "Looking through policy documents" });
    try {
      const result = await retrievePolicyDocs(args.query, {
        category: args.category,
        topK: args.limit
      });
      if (!result.available) {
        return result.reason === "disabled"
          ? "The policy/loan knowledge base is not enabled in this environment."
          : "The policy/loan knowledge base is not configured yet.";
      }
      return renderCitations(result.citations);
    } catch (error) {
      return `That document search failed: ${
        error instanceof Error ? error.message : "unknown error"
      }.`;
    }
  },
  {
    name: "searchPolicyDocs",
    description: D.SEARCH_POLICY_DOCS_DESC,
    schema: z.object({
      query: z
        .string()
        .describe("What to look up, in the user's words (a question or topic)."),
      category: z
        .enum(["policy", "loan_package"])
        .optional()
        .describe("Restrict to a document category when the user is clearly asking about one."),
      limit: z.number().int().min(1).max(10).default(5)
    })
  }
);

export const knowledgeTools = [searchPolicyDocsTool];
