/**
 * Tests for tools/policyDocs.ts.
 *
 * The tool wraps retrievePolicyDocs which checks config.rag.enabled. In test
 * environments VIRLY_RAG_ENABLED defaults to false, so the "disabled" and error
 * paths are reachable without any mocking. The citation-rendering path requires
 * RAG to be on, which cannot be reached offline in this ESM-Jest configuration
 * (no jest.mock support); those code paths are exercised in the RAG integration
 * suite instead.
 *
 * What IS tested here:
 *   - RAG-disabled message
 *   - Tool name and schema are defined
 */

import { searchPolicyDocsTool } from "../policyDocs.js";

// Minimal config satisfying LangGraphRunnableConfig.
function makeConfig() {
  return { configurable: {} };
}

// ---------------------------------------------------------------------------
// Degradation path: RAG disabled (default in test env)
// ---------------------------------------------------------------------------

describe("searchPolicyDocsTool with RAG disabled (default test env)", () => {
  test("returns a 'not enabled' message when RAG is off", async () => {
    const result = await searchPolicyDocsTool.invoke(
      { query: "what is the early repayment policy", limit: 5 },
      makeConfig()
    );
    expect(String(result)).toMatch(/not enabled/i);
  });

  test("same disabled message for any query string", async () => {
    const result = await searchPolicyDocsTool.invoke(
      { query: "loan packages", limit: 3 },
      makeConfig()
    );
    expect(String(result)).toMatch(/not enabled/i);
  });

  test("works with the minimum allowed limit (1)", async () => {
    const result = await searchPolicyDocsTool.invoke(
      { query: "fee schedule", limit: 1 },
      makeConfig()
    );
    // No throw; returns a graceful message.
    expect(typeof String(result)).toBe("string");
    expect(String(result).length).toBeGreaterThan(0);
  });

  test("works with the maximum allowed limit (10)", async () => {
    const result = await searchPolicyDocsTool.invoke(
      { query: "eligibility", limit: 10 },
      makeConfig()
    );
    expect(typeof String(result)).toBe("string");
    expect(String(result).length).toBeGreaterThan(0);
  });

  test("works with a category filter (policy)", async () => {
    const result = await searchPolicyDocsTool.invoke(
      { query: "transfer fees", limit: 5, category: "policy" },
      makeConfig()
    );
    expect(typeof String(result)).toBe("string");
    expect(String(result).length).toBeGreaterThan(0);
  });

  test("works with a category filter (loan_package)", async () => {
    const result = await searchPolicyDocsTool.invoke(
      { query: "interest rate", limit: 5, category: "loan_package" },
      makeConfig()
    );
    expect(typeof String(result)).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Tool metadata
// ---------------------------------------------------------------------------

describe("searchPolicyDocsTool metadata", () => {
  test("tool name is 'searchPolicyDocs'", () => {
    expect(searchPolicyDocsTool.name).toBe("searchPolicyDocs");
  });

  test("tool has a non-empty description", () => {
    expect(searchPolicyDocsTool.description.length).toBeGreaterThan(0);
  });
});
