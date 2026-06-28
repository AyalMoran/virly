// server/tests/contract/aiAuditLog.contract.test.ts
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
    expect(created.id).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(created.userId).toBe("a".repeat(24));
    expect(created.conversationId).toBe("conv-001");
    expect(created.requestId).toBe("req-001");
    expect(created.assistantId).toBe("oshri");
    expect(created.intent).toBe("transfer");
    expect(created.toolsRequested).toStrictEqual(["lookupCounterparty", "createTransfer"]);
    expect(created.toolsExecuted).toStrictEqual(["lookupCounterparty"]);
    expect(created.refusalReason).toBeNull();
    expect(created.diagnostics).toStrictEqual([{ step: "classify", ok: true }]);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  },

  "create persists a null requestId and a refusalReason": async ({ repos }) => {
    const created = await repos.aiAuditLogs.create(
      makeLog({ requestId: null, refusalReason: "policy_violation", toolsExecuted: [] })
    );
    expect(created.requestId).toBeNull();
    expect(created.refusalReason).toBe("policy_violation");
    expect(created.toolsExecuted).toStrictEqual([]);
  },

  "empty toolsRequested/toolsExecuted arrays and empty diagnostics round-trip": async ({ repos }) => {
    const created = await repos.aiAuditLogs.create(
      makeLog({ toolsRequested: [], toolsExecuted: [], diagnostics: [] })
    );
    expect(created.toolsRequested).toStrictEqual([]);
    expect(created.toolsExecuted).toStrictEqual([]);
    expect(created.diagnostics).toStrictEqual([]);
  },

  "toolsRequested (text[]) preserves order and duplicates": async ({ repos }) => {
    const tools = ["b", "a", "a", "c", "b"];
    const created = await repos.aiAuditLogs.create(makeLog({ toolsRequested: tools }));
    expect(created.toolsRequested).toStrictEqual(tools);
  },

  "diagnostics (jsonb array) round-trips a heterogeneous nested structure exactly": async ({ repos }) => {
    const diagnostics = [
      { step: "classify", intent: "transfer", confidence: 0.92 },
      { step: "resolve", candidates: [{ email: "a@b.c" }, { email: "d@e.f" }] },
      "a plain string entry",
      42
    ];
    const created = await repos.aiAuditLogs.create(makeLog({ diagnostics }));
    expect(created.diagnostics).toStrictEqual(diagnostics);
  }
});
