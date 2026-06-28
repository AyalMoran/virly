import { writeAiAuditLog } from "../aiAuditLog.service.js";
import { getRepositories, setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { Repositories, AiAuditLogRecord } from "../../repositories/types.js";
import type { AuditLogInput } from "../../ai/state.js";

const base = createMongoRepositories();

function stubRecord(): AiAuditLogRecord {
  return {
    id: "log-1",
    userId: "u1",
    conversationId: "c1",
    requestId: null,
    assistantId: "oshri",
    intent: "balance_inquiry",
    toolsRequested: [],
    toolsExecuted: [],
    refusalReason: null,
    diagnostics: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function baseInput(): AuditLogInput {
  return {
    userId: "u1",
    conversationId: "c1",
    assistantId: "oshri",
    intent: "balance_inquiry",
    toolsRequested: ["getAccountBalance"],
    toolsExecuted: ["getAccountBalance"],
    requestId: "req-1"
  };
}

afterEach(() => {
  setRepositories(base);
});

describe("writeAiAuditLog", () => {
  test("creates a log record with all provided fields", async () => {
    let captured: Parameters<typeof base.aiAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      aiAuditLogs: {
        ...base.aiAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["aiAuditLogs"]
    });

    await writeAiAuditLog(baseInput());

    expect(captured).not.toBeNull();
    expect(captured!.userId).toBe("u1");
    expect(captured!.conversationId).toBe("c1");
    expect(captured!.requestId).toBe("req-1");
    expect(captured!.assistantId).toBe("oshri");
    expect(captured!.intent).toBe("balance_inquiry");
    expect(captured!.toolsRequested).toStrictEqual(["getAccountBalance"]);
    expect(captured!.toolsExecuted).toStrictEqual(["getAccountBalance"]);
    expect(captured!.refusalReason).toBeNull();
    expect(captured!.diagnostics).toStrictEqual([]);
  });

  test("defaults requestId to null when omitted", async () => {
    let captured: Parameters<typeof base.aiAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      aiAuditLogs: {
        ...base.aiAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["aiAuditLogs"]
    });

    const input = baseInput();
    delete (input as { requestId?: string }).requestId;
    await writeAiAuditLog(input);

    expect(captured!.requestId).toBeNull();
  });

  test("defaults diagnostics to empty array when omitted", async () => {
    let captured: Parameters<typeof base.aiAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      aiAuditLogs: {
        ...base.aiAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["aiAuditLogs"]
    });

    const input: AuditLogInput = { ...baseInput(), diagnostics: undefined };
    await writeAiAuditLog(input);

    expect(captured!.diagnostics).toStrictEqual([]);
  });

  test("defaults refusalReason to null when omitted", async () => {
    let captured: Parameters<typeof base.aiAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      aiAuditLogs: {
        ...base.aiAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["aiAuditLogs"]
    });

    await writeAiAuditLog(baseInput());

    expect(captured!.refusalReason).toBeNull();
  });

  test("passes a non-null refusalReason through unchanged", async () => {
    let captured: Parameters<typeof base.aiAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      aiAuditLogs: {
        ...base.aiAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["aiAuditLogs"]
    });

    await writeAiAuditLog({ ...baseInput(), refusalReason: "unsafe_request" });

    expect(captured!.refusalReason).toBe("unsafe_request");
  });

  test("propagates repository errors to the caller", async () => {
    setRepositories({
      ...base,
      aiAuditLogs: {
        ...base.aiAuditLogs,
        create: async () => {
          throw new Error("db unavailable");
        }
      } as Repositories["aiAuditLogs"]
    });

    await expect(writeAiAuditLog(baseInput())).rejects.toThrow("db unavailable");
  });
});
