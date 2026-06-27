import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createSupportTools, type SupportToolDeps } from "./support.js";
import type { RuntimeToolResult, ToolContext } from "../ai/state.js";
import type { UserRecord } from "../repositories/types.js";

function user(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "507f1f77bcf86cd799439011",
    email: "dan@example.com",
    passwordHash: "x",
    phone: "+1",
    isVerified: true,
    personalDetails: null,
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    balance: 1840.5,
    role: "user",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function makeDeps(overrides: Partial<SupportToolDeps> = {}): {
  deps: SupportToolDeps;
  calls: Array<{ name: string; ctx: ToolContext }>;
} {
  const calls: Array<{ name: string; ctx: ToolContext }> = [];
  const result = (summary: string): RuntimeToolResult => ({
    toolName: "getAccountBalance",
    status: "ok",
    data: { ok: true },
    displayData: { summary, metadata: {} }
  });
  const deps: SupportToolDeps = {
    repos: {
      users: {
        findByEmail: async (email: string) => (email === "dan@example.com" ? user() : null),
        findById: async () => user()
      }
    } as unknown as SupportToolDeps["repos"],
    executors: new Proxy(
      {},
      {
        get: (_t, name: string) => async (ctx: ToolContext) => {
          calls.push({ name, ctx });
          return result(`ran ${name}`);
        }
      }
    ) as SupportToolDeps["executors"],
    retrieve: (async () => ({ available: false, reason: "disabled", citations: [] })) as SupportToolDeps["retrieve"],
    listFraudFlags: (async () => []) as SupportToolDeps["listFraudFlags"],
    listHeldTransfers: (async () => []) as SupportToolDeps["listHeldTransfers"],
    ...overrides
  };
  return { deps, calls };
}

function tool(deps: SupportToolDeps, name: string) {
  const t = createSupportTools(deps).find((x) => x.name === name);
  assert.ok(t, `tool ${name} should exist`);
  return t;
}

describe("support MCP tools", () => {
  test("get_balance resolves the customer and runs the executor with their id", async () => {
    const { deps, calls } = makeDeps();
    const out = await tool(deps, "get_balance").handler({ customerEmail: "dan@example.com" });
    assert.equal(out.isError, undefined);
    assert.match(out.content[0].text, /ran getAccountBalance/);
    assert.equal(calls[0].name, "getAccountBalance");
    assert.equal(calls[0].ctx.userId, "507f1f77bcf86cd799439011");
    assert.equal(calls[0].ctx.conversationId, "mcp-support");
  });

  test("unknown customer returns an error result without calling executors", async () => {
    const { deps, calls } = makeDeps();
    const out = await tool(deps, "get_balance").handler({ customerEmail: "nope@example.com" });
    assert.equal(out.isError, true);
    assert.match(out.content[0].text, /No customer found/);
    assert.equal(calls.length, 0);
  });

  test("get_counterparty_summary passes a resolved counterparty ref to the executor", async () => {
    const { deps, calls } = makeDeps();
    await tool(deps, "get_counterparty_summary").handler({
      customerEmail: "dan@example.com",
      counterpartyEmail: "Rani@Example.com"
    });
    assert.equal(calls[0].name, "getCounterpartySummary");
    assert.equal(calls[0].ctx.resolvedCounterparty?.email, "rani@example.com");
  });

  test("lookup_customer returns a profile summary", async () => {
    const { deps } = makeDeps();
    const out = await tool(deps, "lookup_customer").handler({ customerEmail: "dan@example.com" });
    assert.match(out.content[0].text, /dan@example\.com/);
    assert.match(out.content[0].text, /balance: 1840\.50/);
  });

  test("list_fraud_flags formats flags and passes filters through", async () => {
    let received: unknown;
    const { deps } = makeDeps({
      listFraudFlags: (async (opts: unknown) => {
        received = opts;
        return [
          {
            id: "f1",
            userId: "u1",
            transactionId: "t1",
            recipientEmail: "dan@example.com",
            amount: 450,
            score: 0.8,
            level: "high",
            reasons: ["new recipient"],
            createdAt: new Date("2026-06-01T00:00:00.000Z")
          }
        ];
      }) as SupportToolDeps["listFraudFlags"]
    });
    const out = await tool(deps, "list_fraud_flags").handler({ level: "high", limit: 5 });
    assert.match(out.content[0].text, /\[high\] score=0\.8 ₪450 → dan@example\.com/);
    assert.deepEqual(received, { level: "high", userId: undefined, limit: 5 });
  });

  test("list_fraud_flags resolves customerEmail to a userId filter", async () => {
    let received: { userId?: string } = {};
    const { deps } = makeDeps({
      listFraudFlags: (async (opts: { userId?: string }) => {
        received = opts;
        return [];
      }) as SupportToolDeps["listFraudFlags"]
    });
    await tool(deps, "list_fraud_flags").handler({ customerEmail: "dan@example.com" });
    assert.equal(received.userId, "507f1f77bcf86cd799439011");
  });

  test("list_held_transfers reports an empty result cleanly", async () => {
    const { deps } = makeDeps();
    const out = await tool(deps, "list_held_transfers").handler({ status: "pending" });
    assert.match(out.content[0].text, /No held transfers/);
  });

  test("search_policy_docs reports a friendly message when RAG is disabled", async () => {
    const { deps } = makeDeps();
    const out = await tool(deps, "search_policy_docs").handler({ query: "loan packages" });
    assert.equal(out.isError, undefined);
    assert.match(out.content[0].text, /not enabled/);
  });

  test("search_policy_docs renders cited excerpts when available", async () => {
    const { deps } = makeDeps({
      retrieve: (async () => ({
        available: true,
        citations: [
          {
            title: "Loan Packages",
            category: "loan_package",
            uri: "loans/x.md",
            sourceRef: "loans/x.md",
            chunkIndex: 0,
            score: 0.9,
            excerpt: "Premium APR is 5.9%."
          }
        ]
      })) as SupportToolDeps["retrieve"]
    });
    const out = await tool(deps, "search_policy_docs").handler({ query: "premium apr" });
    assert.match(out.content[0].text, /\[1\] Loan Packages \(loan_package\)/);
    assert.match(out.content[0].text, /5\.9%/);
  });
});
