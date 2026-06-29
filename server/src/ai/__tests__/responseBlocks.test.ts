import { DEFAULT_ASSISTANT_ID } from "../assistants.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";
import { runAssistantGraph } from "../graph.js";
import {
  assistantResponseFormatVersion,
  buildAssistantResponseBlocks
} from "../responseBlocks.js";
import { createToolResult } from "../toolResults.js";
import type {
  AssistantGraphState,
  AssistantLlmProvider,
  AssistantToolExecutors,
  TransferConfirmation
} from "../state.js";

function baseState(
  overrides: Partial<AssistantGraphState> = {}
): AssistantGraphState {
  return {
    conversationId: "response-block-test",
    assistantId: DEFAULT_ASSISTANT_ID,
    messages: [],
    counterpartyMemory: createEmptyCounterpartyMemory(),
    currentTurn: 1,
    requestedToolNames: [],
    executedToolNames: [],
    toolResults: [],
    ...overrides
  };
}

function hebrewState(overrides: Partial<AssistantGraphState> = {}) {
  return baseState({
    normalizedMessage: {
      originalText: "תראה לי עסקאות",
      detectedLanguages: ["he"],
      normalizedText: "תראה לי עסקאות",
      direction: "rtl",
      containsHebrew: true,
      containsCurrencySymbol: false,
      containsDateExpression: false
    },
    ...overrides
  });
}

function fakeLlmProvider(
  overrides: Partial<AssistantLlmProvider>
): AssistantLlmProvider {
  return {
    async classifyIntent() {
      return { intent: "unsupported" };
    },
    async extractTransferDraft() {
      return {};
    },
    async resolveCounterpartyReference() {
      return { kind: "none", confidence: "low" };
    },
    async composeResponse(input) {
      return input.fallbackMessage;
    },
    ...overrides
  };
}

type ResponseBlock = ReturnType<typeof buildAssistantResponseBlocks>[number];

/**
 * Assert a block's discriminant and return it narrowed to that variant.
 * Restores the union narrowing node:assert.equal provided implicitly but
 * Jest's expect(...).toBe(...) does not.
 */
function expectBlock<T extends ResponseBlock["type"]>(
  block: ResponseBlock | undefined,
  type: T
): Extract<ResponseBlock, { type: T }> {
  expect(block?.type).toBe(type);
  return block as Extract<ResponseBlock, { type: T }>;
}

test("response block builder maps account balance tool results into an account summary block", () => {
  const blocks = buildAssistantResponseBlocks(
    hebrewState({
      detectedIntent: "account_summary",
      toolResults: [
        createToolResult({
          toolName: "getUserAccounts",
          status: "ok",
          data: { accountLabel: "Virly account" },
          summary: "Virly account",
          metadata: { recordCount: 1, accountLabel: "Virly account" }
        }),
        createToolResult({
          toolName: "getAccountBalance",
          status: "ok",
          data: { balance: 1234.56 },
          summary: "Balance: **999.99**",
          metadata: {
            recordCount: 1,
            accountLabel: "Virly account",
            amount: 1234.56
          }
        })
      ]
    })
  );

  expect(blocks.length).toBe(1);
  const block = expectBlock(blocks[0], "account_summary");
  expect(block.title?.dir).toBe("rtl");
  expect(block.availableBalance.amount).toBe(1234.56);
  expect(block.availableBalance.currency).toBe("ILS");
});

test("response block builder uses transaction row data instead of Markdown summaries", () => {
  const blocks = buildAssistantResponseBlocks(
    hebrewState({
      detectedIntent: "transaction_search",
      toolResults: [
        createToolResult({
          toolName: "searchTransactions",
          status: "ok",
          data: [
            {
              transactionId: "tx-structured-1",
              direction: "sent",
              amount: 23364.07,
              currency: "ILS",
              counterpartyLabel:
                "Shai Gilgeous-Alexander (very.long.email.address@example.com)",
              counterpartyMaskedLabel: "s***@example.com",
              counterpartyEmail: "very.long.email.address@example.com",
              reason: "בדיקת RTL",
              occurredAt: "2026-06-07T10:22:00.000Z",
              status: "completed"
            }
          ],
          summary:
            "Transactions: **wrong markdown amount 1.00 ILS** for someone else.",
          metadata: { recordCount: 1, amount: 1 }
        })
      ]
    })
  );

  expect(blocks.length).toBe(1);
  const block = expectBlock(blocks[0], "transaction_list");
  expect(block.transactions[0]?.amount.amount).toBe(23364.07);
  expect(
    block.transactions[0]?.counterpartyEmail
  ).toBe("very.long.email.address@example.com");
  expect(block.transactions[0]?.description).toBe("בדיקת RTL");
});

test("response block builder returns an empty state for empty transaction results", () => {
  const blocks = buildAssistantResponseBlocks(
    hebrewState({
      detectedIntent: "recent_transactions",
      toolResults: [
        createToolResult({
          toolName: "getRecentTransactions",
          status: "empty",
          data: [],
          summary: "No recent transactions.",
          metadata: { recordCount: 0 }
        })
      ]
    })
  );

  expect(blocks.length).toBe(1);
  const block = expectBlock(blocks[0], "empty_state");
  expect(block.message.dir).toBe("rtl");
});

test("response block builder exposes transfer confirmation blocks without executing transfer actions", () => {
  const confirmation: TransferConfirmation = {
    id: "6650cc68782e55fbbf857111",
    version: 2,
    type: "transfer",
    status: "pending",
    recipientEmail: "recipient@example.com",
    recipientFirstName: "Recipient",
    recipientLastName: "Example",
    amount: 50,
    currency: "ILS",
    recipient: {
      email: "recipient@example.com",
      firstName: "Recipient",
      lastName: "Example",
      displayName: "Recipient Example",
      verified: true
    },
    amountDetails: {
      value: 50,
      currency: "ILS",
      formatted: "₪50.00"
    },
    reason: "Dinner",
    warnings: [],
    expiresAt: "2026-06-08T12:00:00.000Z",
    confirmAction: {
      method: "POST",
      path: "/api/ai/confirmations/6650cc68782e55fbbf857111",
      body: { action: "confirm", version: 2 }
    },
    denyAction: {
      method: "POST",
      path: "/api/ai/confirmations/6650cc68782e55fbbf857111",
      body: { action: "deny", version: 2 }
    }
  };

  const blocks = buildAssistantResponseBlocks(
    baseState({
      detectedIntent: "transfer_prepare",
      confirmation
    })
  );

  expect(blocks.length).toBe(1);
  const block = expectBlock(blocks[0], "transfer_confirmation");
  expect(block.confirmation.id).toBe(confirmation.id);
  expect(block.confirmation.confirmAction.body.action).toBe("confirm");
});

test("response block builder exposes pending transfer status without implying completion", () => {
  const blocks = buildAssistantResponseBlocks(
    hebrewState({
      detectedIntent: "pending_confirmation_status",
      counterpartyMemory: {
        ...createEmptyCounterpartyMemory(),
        pendingConfirmation: {
          confirmationId: "6650cc68782e55fbbf857222",
          type: "transfer",
          status: "pending",
          createdAt: "2026-06-08T11:00:00.000Z",
          expiresAt: "2026-06-08T11:10:00.000Z",
          recipientEmail: "recipient@example.com",
          recipientFirstName: "Recipient",
          recipientLastName: "Example",
          amount: 75,
          currency: "ILS",
          reason: "Lunch",
          turnCreated: 1,
          version: 1
        }
      }
    })
  );

  expect(blocks.length).toBe(1);
  const block = expectBlock(blocks[0], "transfer_status");
  expect(block.status).toBe("pending");
  expect(block.amount?.amount).toBe(75);
  expect(block.message?.text ?? "").toMatch(/שום כסף לא הועבר/);
});

test("response block builder combines transfer limit, usage, and eligibility tool payloads", () => {
  const blocks = buildAssistantResponseBlocks(
    hebrewState({
      detectedIntent: "transfer_eligibility",
      toolResults: [
        createToolResult({
          toolName: "getTransferLimits",
          status: "ok",
          data: {
            perTransferLimit: 1000,
            dailyTransferLimit: 2500
          },
          summary: "Limits",
          metadata: { recordCount: 1 }
        }),
        createToolResult({
          toolName: "getDailyTransferUsage",
          status: "ok",
          data: {
            dailyLimit: 2500,
            usedToday: 400,
            remainingToday: 2100,
            transferCountToday: 2,
            resetAt: new Date("2026-06-09T00:00:00.000Z")
          },
          summary: "Usage",
          metadata: { recordCount: 2, amount: 2100 }
        }),
        createToolResult({
          toolName: "getTransferEligibility",
          status: "error",
          data: {
            eligible: false,
            amount: 3000,
            currency: "ILS",
            reasons: ["INSUFFICIENT_BALANCE"],
            maxSendableNow: 900
          },
          summary: "Not eligible",
          metadata: { recordCount: 1, amount: 900 }
        })
      ]
    })
  );

  expect(blocks.length).toBe(1);
  const block = expectBlock(blocks[0], "transfer_limits");
  expect(block.eligible).toBe(false);
  expect(block.amount?.amount).toBe(3000);
  expect(block.perTransferLimit?.amount).toBe(1000);
  expect(block.dailyRemaining?.amount).toBe(2100);
  expect(block.maxSendableNow?.amount).toBe(900);
  expect(block.transferCountToday).toBe(2);
  expect(block.resetAt).toBe("2026-06-09T00:00:00.000Z");
  expect(block.reasons).toStrictEqual(["INSUFFICIENT_BALANCE"]);
});

test("response block builder returns no blocks for unsupported unstructured intents", () => {
  expect(
    buildAssistantResponseBlocks(
      baseState({
        detectedIntent: "general_help",
        toolResults: []
      })
    )
  ).toStrictEqual([]);
});

test("assistant graph returns responseBlocks and tells the LLM to keep structured replies short", async () => {
  let structuredResponse:
    | Parameters<AssistantLlmProvider["composeResponse"]>[0]["structuredResponse"]
    | undefined;
  const tools: AssistantToolExecutors = {
    async getUserAccounts() {
      return createToolResult({
        toolName: "getUserAccounts",
        status: "ok",
        data: { accountLabel: "Virly account" },
        summary: "Virly account",
        metadata: { recordCount: 1, accountLabel: "Virly account" }
      });
    },
    async getAccountBalance() {
      return createToolResult({
        toolName: "getAccountBalance",
        status: "ok",
        data: { balance: 125 },
        summary: "Balance 125.00 ILS",
        metadata: { recordCount: 1, accountLabel: "Virly account", amount: 125 }
      });
    }
  };
  const llmProvider = fakeLlmProvider({
    async classifyIntent() {
      return { intent: "balance_inquiry" };
    },
    async composeResponse(input) {
      structuredResponse = input.structuredResponse;
      return "מצאתי את הפרטים:";
    }
  });

  const result = await runAssistantGraph(
    {
      userId: "507f1f77bcf86cd799439011",
      conversationId: "response-block-graph-test",
      message: "מה היתרה שלי?"
    },
    {
      tools,
      llmProvider
    }
  );

  expect(result.responseFormatVersion).toBe(assistantResponseFormatVersion);
  expect(result.responseBlocks?.[0]?.type).toBe("account_summary");
  expect(structuredResponse).toStrictEqual({
    responseFormatVersion: 1,
    blockTypes: ["account_summary"],
    blockCount: 1,
    introFallbackMessage: "מצאתי את הנתונים הרלוונטיים:"
  });
  expect(result.message).toBe("מצאתי את הפרטים:");
});

test("assistant graph regenerates once when personality linter rejects an out-of-context phrase", async () => {
  let composeCalls = 0;
  const tools: AssistantToolExecutors = {
    async getUserAccounts() {
      return createToolResult({
        toolName: "getUserAccounts",
        status: "ok",
        data: { accountLabel: "Virly account" },
        summary: "Virly account",
        metadata: { recordCount: 1, accountLabel: "Virly account" }
      });
    },
    async getAccountBalance() {
      return createToolResult({
        toolName: "getAccountBalance",
        status: "ok",
        data: { balance: 125 },
        summary: "Balance 125.00 ILS",
        metadata: { recordCount: 1, accountLabel: "Virly account", amount: 125 }
      });
    }
  };
  const llmProvider = fakeLlmProvider({
    async classifyIntent() {
      return { intent: "balance_inquiry" };
    },
    async composeResponse(input) {
      composeCalls += 1;
      expect(input.responseStyleContext.situation).toBe("balance_inquiry_success");
      return composeCalls === 1
        ? "היתרה מוצגת בכרטיס. הכסף כבר בדרך."
        : "בדקתי לך. היתרה מוצגת בכרטיס.";
    }
  });

  const result = await runAssistantGraph(
    {
      userId: "507f1f77bcf86cd799439011",
      conversationId: "response-style-lint-retry",
      message: "מה היתרה שלי?"
    },
    {
      tools,
      llmProvider
    }
  );

  expect(composeCalls).toBe(2);
  expect(result.message).toBe("בדקתי לך. היתרה מוצגת בכרטיס.");
  expect(result.message).not.toMatch(/הכסף כבר בדרך/);
});

test("assistant graph falls back deterministically when personality linter rejects the retry", async () => {
  let composeCalls = 0;
  const tools: AssistantToolExecutors = {
    async getUserAccounts() {
      return createToolResult({
        toolName: "getUserAccounts",
        status: "ok",
        data: { accountLabel: "Virly account" },
        summary: "Virly account",
        metadata: { recordCount: 1, accountLabel: "Virly account" }
      });
    },
    async getAccountBalance() {
      return createToolResult({
        toolName: "getAccountBalance",
        status: "ok",
        data: { balance: 125 },
        summary: "Balance 125.00 ILS",
        metadata: { recordCount: 1, accountLabel: "Virly account", amount: 125 }
      });
    }
  };
  const llmProvider = fakeLlmProvider({
    async classifyIntent() {
      return { intent: "balance_inquiry" };
    },
    async composeResponse() {
      composeCalls += 1;
      return "הכסף כבר בדרך.";
    }
  });

  const result = await runAssistantGraph(
    {
      userId: "507f1f77bcf86cd799439011",
      conversationId: "response-style-lint-fallback",
      message: "מה היתרה שלי?"
    },
    {
      tools,
      llmProvider
    }
  );

  expect(composeCalls).toBe(2);
  expect(result.message).toBe("מצאתי: Virly account Balance 125.00 ILS");
  expect(result.message).not.toMatch(/הכסף כבר בדרך/);
});
