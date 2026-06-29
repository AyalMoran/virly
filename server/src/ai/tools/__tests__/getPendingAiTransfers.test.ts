import { getPendingAiTransfers } from "../getPendingAiTransfers.js";
import { withRepos, makePendingTransferRecord } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Show my pending transfers",
    ...overrides
  };
}

describe("getPendingAiTransfers", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no pending transfers exist", async () => {
    cleanup = withRepos({
      aiPendingTransfers: {
        ...({} as any),
        listActivePendingForUser: async () => []
      }
    });

    const result = await getPendingAiTransfers(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getPendingAiTransfers");
    expect(result.data).toEqual([]);
    expect(result.displayData?.summary).toContain("No pending transfer confirmations");
  });

  it("scopes to current conversation by default (message without 'all')", async () => {
    const captured: { conversationId?: string }[] = [];
    cleanup = withRepos({
      aiPendingTransfers: {
        ...({} as any),
        listActivePendingForUser: async (input: { userId: string; conversationId?: string; limit: number }) => {
          captured.push({ conversationId: input.conversationId });
          return [];
        }
      }
    });

    await getPendingAiTransfers(makeContext({ message: "Show pending transfers" }));
    expect(captured[0].conversationId).toBe("conv-1");
  });

  it("scopes to all_user when message contains 'all'", async () => {
    const captured: { conversationId?: string }[] = [];
    cleanup = withRepos({
      aiPendingTransfers: {
        ...({} as any),
        listActivePendingForUser: async (input: { userId: string; conversationId?: string; limit: number }) => {
          captured.push({ conversationId: input.conversationId });
          return [];
        }
      }
    });

    await getPendingAiTransfers(makeContext({ message: "Show all pending transfers" }));
    expect(captured[0].conversationId).toBeUndefined();
  });

  it("returns ok result with row data when pending transfers exist", async () => {
    const record = makePendingTransferRecord({
      id: "pt-1",
      amount: 200,
      reason: "lunch",
      expiresAt: new Date("2025-06-01T12:00:00Z")
    });
    cleanup = withRepos({
      aiPendingTransfers: {
        ...({} as any),
        listActivePendingForUser: async () => [record]
      }
    });

    const result = await getPendingAiTransfers(makeContext());
    expect(result.status).toBe("ok");
    const data = result.data as Array<{ amount: number; reason: string | null }>;
    expect(data).toHaveLength(1);
    expect(data[0].amount).toBe(200);
    expect(data[0].reason).toBe("lunch");
  });

  it("summary includes recipient label and expiry when transfers exist", async () => {
    const record = makePendingTransferRecord({
      recipientEmail: "bob@example.com",
      recipientFirstName: null,
      recipientLastName: null,
      amount: 150,
      reason: null,
      expiresAt: new Date("2025-07-01T10:00:00Z")
    });
    cleanup = withRepos({
      aiPendingTransfers: {
        ...({} as any),
        listActivePendingForUser: async () => [record]
      }
    });

    const result = await getPendingAiTransfers(makeContext());
    const summary = result.displayData?.summary ?? "";
    expect(summary).toContain("150.00 ILS");
    expect(summary).toContain("expires");
  });

  it("memory update lists pending transfers on ok result", async () => {
    const record = makePendingTransferRecord({ amount: 100 });
    cleanup = withRepos({
      aiPendingTransfers: {
        ...({} as any),
        listActivePendingForUser: async () => [record]
      }
    });

    const result = await getPendingAiTransfers(makeContext());
    expect(result.memoryUpdates?.pendingTransfers).toHaveLength(1);
    expect(result.memoryUpdates?.pendingTransfers?.[0].amount).toBe(100);
  });

  it("memory update lists empty pending transfers on empty result", async () => {
    cleanup = withRepos({
      aiPendingTransfers: {
        ...({} as any),
        listActivePendingForUser: async () => []
      }
    });

    const result = await getPendingAiTransfers(makeContext());
    expect(result.memoryUpdates?.pendingTransfers).toEqual([]);
  });
});
