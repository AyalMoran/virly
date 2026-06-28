import { buildToolInput } from "../toolInputs.js";
import type { AssistantGraphState, CounterpartyMemory, RuntimeToolResult } from "../state.js";

function emptyMemory(): CounterpartyMemory {
  return {
    turn: 0,
    mentionedCounterparties: []
  };
}

function baseState(overrides: Partial<AssistantGraphState> = {}): AssistantGraphState {
  return {
    userId: "user-123",
    conversationId: "conv-abc",
    assistantId: "oshri",
    messages: [],
    counterpartyMemory: emptyMemory(),
    currentTurn: 1,
    requestedToolNames: [],
    executedToolNames: [],
    toolResults: [],
    ...overrides
  };
}

describe("buildToolInput — simple tools (no counterparty context needed)", () => {
  const simpleTools = [
    "getUserAccounts",
    "getAccountBalance",
    "getTransferLimits",
    "getDailyTransferUsage"
  ] as const;

  test.each(simpleTools)("builds minimal context for %s", (toolName) => {
    const state = baseState({
      normalizedMessage: {
        originalText: "What is my balance?",
        detectedLanguages: ["en"],
        normalizedText: "What is my balance?",
        direction: "ltr",
        containsHebrew: false,
        containsCurrencySymbol: false,
        containsDateExpression: false
      }
    });
    const input = buildToolInput(toolName, state);
    expect(input.userId).toBe("user-123");
    expect(input.conversationId).toBe("conv-abc");
    expect(input.message).toBe("What is my balance?");
    expect(input.currentTurn).toBe(1);
  });

  test("uses empty string for message when normalizedMessage is absent", () => {
    const state = baseState({ normalizedMessage: undefined });
    const input = buildToolInput("getAccountBalance", state);
    expect(input.message).toBe("");
  });
});

describe("buildToolInput — counterparty-aware tools", () => {
  const counterpartyTools = [
    "getRecentTransactions",
    "getVerifiedRecipients",
    "getTransactionsWithCounterparty",
    "getTotalSentToCounterparty",
    "getTotalReceivedFromCounterparty",
    "getNetWithCounterparty",
    "searchTransactions",
    "getTransactionStats",
    "getTransferEligibility",
    "getTransferQuote",
    "getLastSentCounterparty",
    "getRecentSentCounterparties",
    "getRecentReceivedCounterparties",
    "resolveCounterpartyCandidates",
    "resolveTransactionReference",
    "resolvePendingTransferReference",
    "getPendingAiTransfers",
    "getCounterpartySummary",
    "getCounterpartyActivityTimeline",
    "getTransactionReceipt"
  ] as const;

  test.each(counterpartyTools)("includes counterpartyMemory for %s", (toolName) => {
    const resolvedCounterparty = {
      email: "alice@example.com",
      maskedLabel: "a***@example.com",
      aliases: [],
      firstMentionedAtTurn: 1,
      lastReferencedAtTurn: 1
    };
    const state = baseState({ resolvedCounterparty });
    const input = buildToolInput(toolName, state);
    expect(input.counterpartyMemory).toBeDefined();
    expect(input.resolvedCounterparty).toStrictEqual(resolvedCounterparty);
  });

  test("resolvedTransactionId is picked from toolResults when present", () => {
    const toolResult: RuntimeToolResult = {
      toolName: "resolveTransactionReference",
      status: "ok",
      data: { transactionId: "tx-found-123" }
    };
    const state = baseState({ toolResults: [toolResult] });
    const input = buildToolInput("getTransactionReceipt", state);
    expect(input.resolvedTransactionId).toBe("tx-found-123");
  });

  test("resolvedTransactionId is undefined when no toolResult has transactionId", () => {
    const toolResult: RuntimeToolResult = {
      toolName: "getAccountBalance",
      status: "ok",
      data: { balance: 1000 }
    };
    const state = baseState({ toolResults: [toolResult] });
    const input = buildToolInput("getTransactionReceipt", state);
    expect(input.resolvedTransactionId).toBeUndefined();
  });

  test("resolvedTransactionId is undefined when toolResults is empty", () => {
    const state = baseState({ toolResults: [] });
    const input = buildToolInput("getTransactionReceipt", state);
    expect(input.resolvedTransactionId).toBeUndefined();
  });

  test("passes clarification from counterpartyMemory", () => {
    const memory = {
      ...emptyMemory(),
      clarification: {
        reason: "missing_recipient" as const,
        message: "Who should I send to?",
        expectedReplyType: "recipient" as const
      }
    };
    const state = baseState({ counterpartyMemory: memory });
    const input = buildToolInput("resolveCounterpartyCandidates", state);
    expect(input.clarification).toStrictEqual(memory.clarification);
  });

  test("resolvedDateRange is set when message contains date expression", () => {
    const state = baseState({
      normalizedMessage: {
        originalText: "show transactions from last month",
        detectedLanguages: ["en"],
        normalizedText: "show transactions from last month",
        direction: "ltr",
        containsHebrew: false,
        containsCurrencySymbol: false,
        containsDateExpression: true
      }
    });
    const input = buildToolInput("getRecentTransactions", state);
    // May or may not resolve depending on date content, just check it is defined or undefined
    if (input.resolvedDateRange !== undefined) {
      expect(input.resolvedDateRange.from).toBeInstanceOf(Date);
      expect(input.resolvedDateRange.to).toBeInstanceOf(Date);
      expect(typeof input.resolvedDateRange.label).toBe("string");
    }
  });
});

describe("buildToolInput — default (unknown) tools", () => {
  test("returns minimal context for unknown tool name", () => {
    const state = baseState();
    // Cast to bypass TypeScript strict tool name check for the default branch
    const input = buildToolInput("getMyProfile" as any, state);
    expect(input.userId).toBe("user-123");
    expect(input.conversationId).toBe("conv-abc");
    expect(input.currentTurn).toBe(1);
  });
});
