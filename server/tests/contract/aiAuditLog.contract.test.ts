// server/tests/contract/aiAuditLog.contract.test.ts
import assert from "node:assert/strict";
import { describeContract } from "./harness.js";
import type { AiAuditLogRecord } from "../../src/repositories/types.js";

function makeLog(
  overrides: Partial<Omit<AiAuditLogRecord, "id" | "createdAt" | "updatedAt">> = {}
): Omit<AiAuditLogRecord, "id" | "createdAt" | "updatedAt"> {
  return {
    userId: "a".repeat(24),
    conversationId: "conv-001",
    requestId: "req-001",
    assistantId: "oshri",
    intent: "transfer",
    toolsRequested: ["lookupCounterparty", "createTransfer"],
    toolsExecuted: ["lookupCounterparty"],
    refusalReason: null,
    diagnostics: [{ step: "classify", ok: true }],
    ...overrides
  };
}

describeContract("AiAuditLogRepository", {
  "create returns a record with a 24-hex id and round-trips all fields": async ({ repos }) => {
    const created = await repos.aiAuditLogs.create(makeLog());
    assert.match(created.id, /^[0-9a-fA-F]{24}$/);
    assert.equal(created.userId, "a".repeat(24));
    assert.equal(created.conversationId, "conv-001");
    assert.equal(created.requestId, "req-001");
    assert.equal(created.assistantId, "oshri");
    assert.equal(created.intent, "transfer");
    assert.deepEqual(created.toolsRequested, ["lookupCounterparty", "createTransfer"]);
    assert.deepEqual(created.toolsExecuted, ["lookupCounterparty"]);
    assert.equal(created.refusalReason, null);
    assert.deepEqual(created.diagnostics, [{ step: "classify", ok: true }]);
    assert.ok(created.createdAt instanceof Date);
    assert.ok(created.updatedAt instanceof Date);
  },

  "create persists a null requestId and a refusalReason": async ({ repos }) => {
    const created = await repos.aiAuditLogs.create(
      makeLog({ requestId: null, refusalReason: "policy_violation", toolsExecuted: [] })
    );
    assert.equal(created.requestId, null);
    assert.equal(created.refusalReason, "policy_violation");
    assert.deepEqual(created.toolsExecuted, []);
  },

  "empty toolsRequested/toolsExecuted arrays and empty diagnostics round-trip": async ({ repos }) => {
    const created = await repos.aiAuditLogs.create(
      makeLog({ toolsRequested: [], toolsExecuted: [], diagnostics: [] })
    );
    assert.deepEqual(created.toolsRequested, []);
    assert.deepEqual(created.toolsExecuted, []);
    assert.deepEqual(created.diagnostics, []);
  },

  "toolsRequested (text[]) preserves order and duplicates": async ({ repos }) => {
    const tools = ["b", "a", "a", "c", "b"];
    const created = await repos.aiAuditLogs.create(makeLog({ toolsRequested: tools }));
    assert.deepEqual(created.toolsRequested, tools);
  },

  "diagnostics (jsonb array) round-trips a heterogeneous nested structure exactly": async ({ repos }) => {
    const diagnostics = [
      { step: "classify", intent: "transfer", confidence: 0.92 },
      { step: "resolve", candidates: [{ email: "a@b.c" }, { email: "d@e.f" }] },
      "a plain string entry",
      42
    ];
    const created = await repos.aiAuditLogs.create(makeLog({ diagnostics }));
    assert.deepEqual(created.diagnostics, diagnostics);
  }
});
