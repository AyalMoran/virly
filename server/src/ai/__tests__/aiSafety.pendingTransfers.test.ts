import { runAssistantGraph } from "../graph.js";
import { createFakePhaseFourTransferTools } from "./_aiSafetyKit4.js";
import { createFakeConversationStore } from "./_aiSafetyKit3.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";
import { resolvePendingTransferReference } from "../tools/resolvePendingTransferReference.js";
import { getLimitReasons, getMaxSendableNow } from "../tools/transferPreflightHelpers.js";
import { getPendingTransferScope } from "../tools/pendingTransferHelpers.js";
import { config } from "../../config.js";

test("transfer eligibility request routes to phase four eligibility tool", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transfer-eligibility", message: "Can I send 500?" },
    { tools: createFakePhaseFourTransferTools(executed) }
  );

  expect(result.intent).toBe("transfer_eligibility");
  expect(result.toolCalls).toStrictEqual(["getTransferEligibility"]);
  expect(executed).toStrictEqual(["getTransferEligibility"]);
  expect(result.message).toMatch(/does not create or send/);
});

test("hebrew transfer eligibility and daily usage requests route to phase four tools", async () => {
  const eligibilityExecuted: string[] = [];
  const eligibilityResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-transfer-eligibility", message: "אפשר להעביר 500?" },
    { tools: createFakePhaseFourTransferTools(eligibilityExecuted) }
  );
  const usageExecuted: string[] = [];
  const usageResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-daily-transfer-usage", message: "כמה נשאר לי לשלוח היום?" },
    { tools: createFakePhaseFourTransferTools(usageExecuted) }
  );

  expect(eligibilityResult.intent).toBe("transfer_eligibility");
  expect(eligibilityExecuted).toStrictEqual(["getTransferEligibility"]);
  expect(usageResult.intent).toBe("daily_transfer_usage");
  expect(usageExecuted).toStrictEqual(["getDailyTransferUsage"]);
});

test("transfer quote with explicit email skips counterparty resolver", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transfer-quote-explicit-email", message: "Preview transfer to alex@example.com for 50 shekels" },
    { tools: createFakePhaseFourTransferTools(executed) }
  );

  expect(result.intent).toBe("transfer_quote");
  expect(result.toolCalls).toStrictEqual(["getTransferQuote"]);
  expect(executed).toStrictEqual(["getTransferQuote:alex@example.com"]);
  expect(result.message).toMatch(/does not create or send/);
  expect(result.message).toMatch(/alex@example\.com/);
});

test("transfer quote with named recipient resolves counterparty before quote", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transfer-quote-resolved-recipient", message: "What would happen if I send 50 to Daniel?" },
    { tools: createFakePhaseFourTransferTools(executed) }
  );

  expect(result.intent).toBe("transfer_quote");
  expect(result.toolCalls).toStrictEqual(["resolveCounterpartyCandidates", "getTransferQuote"]);
  expect(executed).toStrictEqual(["resolveCounterpartyCandidates", "getTransferQuote:daniel@example.com"]);
  expect(result.message).toMatch(/daniel@example\.com/);
});

test("daily transfer usage request routes to daily usage tool", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-daily-transfer-usage", message: "How much can I still send today?" },
    { tools: createFakePhaseFourTransferTools(executed) }
  );

  expect(result.intent).toBe("daily_transfer_usage");
  expect(result.toolCalls).toStrictEqual(["getDailyTransferUsage"]);
  expect(executed).toStrictEqual(["getDailyTransferUsage"]);
  expect(result.message).toMatch(/880\.00 ILS remaining/);
});

test("pending ai transfers default to current conversation scope", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-pending-ai-transfers-current", message: "Do I have pending confirmations?" },
    { tools: createFakePhaseFourTransferTools(executed) }
  );

  expect(result.intent).toBe("pending_ai_transfers");
  expect(result.toolCalls).toStrictEqual(["getPendingAiTransfers"]);
  expect(executed).toStrictEqual(["getPendingAiTransfers:current_conversation"]);
  expect(result.message).toMatch(/Pending transfer confirmations/);
  expect(result.message).toMatch(/alex@example\.com/);
  expect(result.message).not.toMatch(/a\*\*\*@example\.com/);
});

test("all pending confirmations request uses broad pending scope", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-pending-ai-transfers-all", message: "Show all my pending confirmations" },
    { tools: createFakePhaseFourTransferTools(executed) }
  );

  expect(result.intent).toBe("pending_ai_transfers");
  expect(executed).toStrictEqual(["getPendingAiTransfers:all_user"]);
});

test("pending confirmation status remains non-mutating and executes no tools", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore({
    messages: [],
    memory: {
      ...createEmptyCounterpartyMemory(),
      pendingConfirmation: { confirmationId: "pending-transfer-1", type: "transfer", status: "pending", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), recipientEmail: "alex@example.com", amount: 50, currency: "ILS", turnCreated: 1, version: 1 },
      mode: "transfer_confirmation_pending"
    }
  });
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-pending-status-no-tools-phase-four", message: "Yes, confirm it" },
    { tools: createFakePhaseFourTransferTools(executed), conversationStore }
  );

  expect(result.intent).toBe("pending_confirmation_status");
  expect(result.toolCalls).toStrictEqual([]);
  expect(executed).toStrictEqual([]);
  expect(result.message).toMatch(/use its Confirm or Deny button/i);
});

test("pending transfer list follow-up resolves ordinal read-only", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore();
  const tools = createFakePhaseFourTransferTools(executed);

  const listResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-pending-list-follow-up", message: "Show my pending confirmations" },
    { tools, conversationStore }
  );
  const followUpResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-pending-list-follow-up", message: "what about the first one" },
    { tools, conversationStore }
  );

  expect(listResult.intent).toBe("pending_ai_transfers");
  expect(listResult.toolCalls).toStrictEqual(["getPendingAiTransfers"]);
  expect(followUpResult.intent).toBe("pending_confirmation_status");
  expect(followUpResult.toolCalls).toStrictEqual(["resolvePendingTransferReference"]);
  expect(executed).toStrictEqual(["getPendingAiTransfers:current_conversation", "resolvePendingTransferReference"]);
  expect(followUpResult.message).toMatch(/50\.00 ILS to Alex Example/);
  expect(followUpResult.message).toMatch(/alex@example\.com/);
  expect(followUpResult.message).not.toMatch(/a\*\*\*@example\.com/);
  expect(followUpResult.confirmation).toBeUndefined();
});

test("hebrew pending transfer list follow-up resolves ordinal read-only", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore();
  const tools = createFakePhaseFourTransferTools(executed);

  const listResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-pending-list-follow-up", message: "תראה לי אישורים ממתינים" },
    { tools, conversationStore }
  );
  const followUpResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-pending-list-follow-up", message: "מה לגבי הראשון" },
    { tools, conversationStore }
  );

  expect(listResult.intent).toBe("pending_ai_transfers");
  expect(listResult.toolCalls).toStrictEqual(["getPendingAiTransfers"]);
  expect(followUpResult.intent).toBe("pending_confirmation_status");
  expect(followUpResult.toolCalls).toStrictEqual(["resolvePendingTransferReference"]);
  expect(executed).toStrictEqual(["getPendingAiTransfers:current_conversation", "resolvePendingTransferReference"]);
  expect(followUpResult.message).toMatch(/50\.00 ILS to Alex Example/);
  expect(followUpResult.message).toMatch(/alex@example\.com/);
  expect(followUpResult.confirmation).toBeUndefined();
});

test("pending transfer reference resolves ordinal from clarification options", async () => {
  const result = await resolvePendingTransferReference({
    userId: "507f1f77bcf86cd799439011",
    conversationId: "test-pending-clarification-follow-up",
    message: "the second one",
    currentTurn: 2,
    clarification: {
      reason: "ambiguous_pending_transfer",
      message: "Which pending transfer do you mean?",
      expectedReplyType: "pending_transfer",
      options: [
        { id: "pending-transfer-1", label: "1. 50.00 ILS to Alex Example (alex@example.com)", value: "pending-transfer-1" },
        { id: "pending-transfer-2", label: "2. 70.00 ILS to Rani Example (rani@example.com)", value: "pending-transfer-2" }
      ]
    }
  });

  expect(result.status).toBe("ok");
  expect(result.data).toStrictEqual({
    kind: "pending_transfer",
    status: "resolved",
    pendingTransferId: "pending-transfer-2",
    candidates: [{ id: "pending-transfer-2", label: "2. 70.00 ILS to Rani Example (rani@example.com)", value: "pending-transfer-2" }]
  });
});

test("transfer preflight helper caps max sendable by balance and limits", () => {
  expect(getMaxSendableNow({ balance: 400, dailyRemaining: 900 })).toBe(400);
  expect(getMaxSendableNow({ balance: 900, dailyRemaining: 300 })).toBe(300);
});

test("transfer preflight helper returns blocking limit reasons", () => {
  const reasons = getLimitReasons({ amount: config.ai.perTransferLimit + 100, balance: 100, dailyRemaining: 1, currencySupported: false });
  expect(reasons.map((r) => r.code)).toStrictEqual(["UNSUPPORTED_CURRENCY", "INSUFFICIENT_BALANCE", "EXCEEDS_PER_TRANSFER_LIMIT", "EXCEEDS_DAILY_LIMIT"]);
});

test("pending transfer scope defaults current conversation and broadens only explicitly", () => {
  expect(getPendingTransferScope("Do I have pending confirmations?")).toBe("current_conversation");
  expect(getPendingTransferScope("Show all my pending confirmations")).toBe("all_user");
});
