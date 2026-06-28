import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { retrievePolicyDocs, searchKnowledge } from "../retriever.js";
import type {
  KnowledgeRepository,
  KnowledgeSearchHit
} from "../../../repositories/vector/types.js";

function repoReturning(hits: KnowledgeSearchHit[]): KnowledgeRepository {
  return {
    async upsertDocument() {
      throw new Error("not used");
    },
    async replaceChunks() {},
    async search() {
      return hits;
    },
    async listDocumentRefs() {
      return [];
    },
    async deleteBySourceRef() {}
  };
}

const hit: KnowledgeSearchHit = {
  documentId: "doc-1",
  chunkIndex: 2,
  content: "Premium loan APR is 5.9%.",
  score: 0.9123,
  title: "Personal Loan Packages",
  category: "loan_package",
  uri: "loans/personal-loan-packages.md",
  sourceRef: "loans/personal-loan-packages.md",
  metadata: { heading: "Premium Loan" }
};

describe("searchKnowledge (config-free core)", () => {
  test("embeds the query and maps repository hits to citations", async () => {
    let embeddedQuery = "";
    const citations = await searchKnowledge({
      query: "what is the premium APR",
      repository: repoReturning([hit]),
      embed: async (q) => {
        embeddedQuery = q;
        return Array(1536).fill(0.2);
      },
      topK: 5
    });

    assert.equal(embeddedQuery, "what is the premium APR");
    assert.equal(citations.length, 1);
    assert.equal(citations[0].title, "Personal Loan Packages");
    assert.equal(citations[0].category, "loan_package");
    assert.equal(citations[0].chunkIndex, 2);
    assert.equal(citations[0].score, 0.9123);
    assert.match(citations[0].excerpt, /5\.9%/);
  });

  test("passes topK / category / minScore through to the repository", async () => {
    const seen: unknown[] = [];
    const repo = repoReturning([]);
    repo.search = async (criteria) => {
      seen.push(criteria);
      return [];
    };
    await searchKnowledge({
      query: "fees",
      repository: repo,
      embed: async () => Array(1536).fill(0),
      topK: 3,
      category: "policy",
      minScore: 0.4
    });
    assert.deepEqual(seen[0], {
      embedding: Array(1536).fill(0),
      topK: 3,
      category: "policy",
      minScore: 0.4
    });
  });
});

describe("retrievePolicyDocs (env-gated wrapper)", () => {
  test("returns available:false / 'disabled' when RAG is off (default config)", async () => {
    const result = await retrievePolicyDocs("loan packages", {
      repository: repoReturning([hit]),
      embed: async () => Array(1536).fill(0.2)
    });
    assert.equal(result.available, false);
    if (!result.available) assert.equal(result.reason, "disabled");
  });
});
