import { runAssistantGraph } from "../graph.js";
import {
  createFakeTools,
  createFakeLlmProvider,
  createFakeConversationStore,
  createMemoryWithCounterparties
} from "./_aiSafetyKit3.js";
import { createFakePhaseThreeTransactionTools } from "./_aiSafetyKit2.js";
import { createFakePhaseFourTransferTools } from "./_aiSafetyKit4.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";
import type { AuditLogInput } from "../state.js";

test("llm response post-check preserves required balance amount facts", async () => {
  const auditLogs: AuditLogInput[] = [];
  const executed: string[] = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "balance_inquiry" }; },
    async composeResponse() { return "Your Virly balance is 999.00."; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-post-check-balance-fact", requestId: "request-response-post-check-balance-fact", message: "What is my balance?" },
    { tools: createFakeTools(executed), llmProvider, auditLogger: async (input) => { auditLogs.push(input); } }
  );
  const diagnostics = auditLogs[0].diagnostics ?? [];

  expect(result.intent).toBe("balance_inquiry");
  expect(result.toolCalls).toStrictEqual(["getUserAccounts", "getAccountBalance"]);
  expect(result.message).toBe("Virly account Your Virly account available balance is 125.00.");
  expect(diagnostics.some((event) => event.nodeName === "composeResponse" && event.fallbackReason === "response_post_check_failed:missing_required_amount_fact")).toBeTruthy();
});

test("llm response post-check preserves required aggregate amount facts", async () => {
  const auditLogs: AuditLogInput[] = [];
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore({ messages: [], memory: createMemoryWithCounterparties(["alex@example.com"]) });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "counterparty_total_sent" }; },
    async resolveCounterpartyReference() { return { kind: "last_counterparty", confidence: "high" }; },
    async composeResponse() { return "You have sent 420.00 in total."; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-post-check-total-fact", requestId: "request-response-post-check-total-fact", message: "How much did I send him?" },
    { tools: createFakeTools(executed), conversationStore, llmProvider, auditLogger: async (input) => { auditLogs.push(input); } }
  );
  const diagnostics = auditLogs[0].diagnostics ?? [];

  expect(result.intent).toBe("counterparty_total_sent");
  expect(result.toolCalls).toStrictEqual(["getTotalSentToCounterparty"]);
  expect(result.message).toBe("You have sent 42.00 in total to alex@example.com.");
  expect(diagnostics.some((event) => event.nodeName === "composeResponse" && event.fallbackReason === "response_post_check_failed:missing_required_amount_fact")).toBeTruthy();
});

test("llm response post-check rejects contradictory transaction status and date facts", async () => {
  const auditLogs: AuditLogInput[] = [];
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore();
  const llmProvider = createFakeLlmProvider({
    async classifyIntent(input) { return { intent: /second one/i.test(input.userMessage) ? "transaction_detail" : "transaction_search" }; },
    async composeResponse() { return "Transaction details for tx-2: received 200.00 ILS with Sarah Example (sarah@example.com) on 2026-05-20T10:00:00.000Z. Status: pending."; }
  });

  await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-post-check-transaction-facts", message: "Show transfers over 100 from last week" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore, llmProvider }
  );

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-post-check-transaction-facts", requestId: "request-response-post-check-transaction-facts", message: "Tell me more about the second one" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore, llmProvider, auditLogger: async (input) => { auditLogs.push(input); } }
  );
  const diagnostics = auditLogs.at(-1)?.diagnostics ?? [];

  expect(result.intent).toBe("transaction_detail");
  expect(result.toolCalls).toStrictEqual(["resolveTransactionReference", "getTransactionReceipt"]);
  expect(result.message).toMatch(/Resolved transaction reference to tx-2\./);
  expect(result.message).toMatch(/Transaction details for tx-2: received 200\.00 ILS with Sarah Example \(sarah@example\.com\)\./);
  expect(diagnostics.some((event) => event.nodeName === "composeResponse" && event.fallbackReason === "response_post_check_failed:contradicting_required_status_fact")).toBeTruthy();
});

test("llm response post-check rejects contradictory transaction currency facts", async () => {
  const auditLogs: AuditLogInput[] = [];
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore();
  const llmProvider = createFakeLlmProvider({
    async classifyIntent(input) { return { intent: /second one/i.test(input.userMessage) ? "transaction_detail" : "transaction_search" }; },
    async composeResponse() { return "Transaction details for tx-2: received 200.00 USD with Sarah Example (sarah@example.com)."; }
  });

  await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-post-check-transaction-currency", message: "Show transfers over 100 from last week" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore, llmProvider }
  );

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-post-check-transaction-currency", requestId: "request-response-post-check-transaction-currency", message: "Tell me more about the second one" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore, llmProvider, auditLogger: async (input) => { auditLogs.push(input); } }
  );
  const diagnostics = auditLogs.at(-1)?.diagnostics ?? [];

  expect(result.intent).toBe("transaction_detail");
  expect(result.toolCalls).toStrictEqual(["resolveTransactionReference", "getTransactionReceipt"]);
  expect(result.message).toMatch(/Transaction details for tx-2: received 200\.00 ILS with Sarah Example \(sarah@example\.com\)\./);
  expect(diagnostics.some((event) => event.nodeName === "composeResponse" && event.fallbackReason === "response_post_check_failed:contradicting_required_currency_fact")).toBeTruthy();
});

test("llm response post-check rejects contradictory pending-transfer recipient facts", async () => {
  const auditLogs: AuditLogInput[] = [];
  const executed: string[] = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "pending_ai_transfers" }; },
    async composeResponse() { return "Pending transfer confirmations in this conversation: 1. 50.00 ILS to Rani Example (rani@example.com), expires 2026-05-24T12:00:00.000Z."; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-post-check-pending-recipient", requestId: "request-response-post-check-pending-recipient", message: "Do I have pending confirmations?" },
    { tools: createFakePhaseFourTransferTools(executed), llmProvider, auditLogger: async (input) => { auditLogs.push(input); } }
  );
  const diagnostics = auditLogs[0].diagnostics ?? [];

  expect(result.intent).toBe("pending_ai_transfers");
  expect(result.toolCalls).toStrictEqual(["getPendingAiTransfers"]);
  expect(result.message).toBe("Pending transfer confirmations in this conversation: 1. 50.00 ILS to Alex Example (alex@example.com).");
  expect(diagnostics.some((event) => event.nodeName === "composeResponse" && event.fallbackReason === "response_post_check_failed:contradicting_required_recipient_fact")).toBeTruthy();
});

test("llm response hydration replaces bare masked pending-transfer recipients", async () => {
  const auditLogs: AuditLogInput[] = [];
  const executed: string[] = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "pending_ai_transfers" }; },
    async composeResponse() { return "Pending transfer confirmations in this conversation: 1. 50.00 ILS to a***@example.com."; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-hydration-pending-recipient", requestId: "request-response-hydration-pending-recipient", message: "Do I have pending confirmations?" },
    { tools: createFakePhaseFourTransferTools(executed), llmProvider, auditLogger: async (input) => { auditLogs.push(input); } }
  );
  const diagnostics = auditLogs[0].diagnostics ?? [];

  expect(result.intent).toBe("pending_ai_transfers");
  expect(result.toolCalls).toStrictEqual(["getPendingAiTransfers"]);
  expect(result.message).toBe("Pending transfer confirmations in this conversation: 1. 50.00 ILS to Alex Example (alex@example.com).");
  expect(!diagnostics.some((event) => event.nodeName === "composeResponse" && event.fallbackReason?.startsWith("response_post_check_failed:"))).toBeTruthy();
});

test("llm response post-check rejects contradictory pending confirmation memory facts", async () => {
  const auditLogs: AuditLogInput[] = [];
  const expiresAt = "2026-05-24T12:00:00.000Z";
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "pending_confirmation_status" }; },
    async composeResponse() { return "Your pending transfer to rani@example.com for 70.00 ILS is pending until 2026-05-25T12:00:00.000Z."; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-post-check-pending-memory-facts", requestId: "request-response-post-check-pending-memory-facts", message: "what is pending?" },
    {
      tools: createFakeTools([]),
      llmProvider,
      auditLogger: async (input) => { auditLogs.push(input); },
      conversationStore: createFakeConversationStore({
        messages: [],
        memory: {
          ...createEmptyCounterpartyMemory(),
          pendingConfirmation: { confirmationId: "pending-transfer-1", type: "transfer", status: "pending", createdAt: "2026-05-24T11:50:00.000Z", expiresAt, recipientEmail: "alex@example.com", amount: 50, currency: "ILS", turnCreated: 1, version: 1 },
          mode: "transfer_confirmation_pending"
        }
      })
    }
  );
  const diagnostics = auditLogs[0].diagnostics ?? [];

  expect(result.intent).toBe("pending_confirmation_status");
  expect(result.message).toMatch(/cannot confirm a transfer from chat text/i);
  expect(diagnostics.some((event) => event.nodeName === "composeResponse" && event.fallbackReason === "response_post_check_failed:missing_required_amount_fact")).toBeTruthy();
});

test("llm response hydration replaces bare masked pending confirmation recipients", async () => {
  const auditLogs: AuditLogInput[] = [];
  const expiresAt = "2026-05-24T12:00:00.000Z";
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "pending_confirmation_status" }; },
    async composeResponse() { return "Your pending transfer to a***@example.com for 50.00 ILS is pending until 2026-05-24T12:00:00.000Z."; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-hydration-pending-memory-recipient", requestId: "request-response-hydration-pending-memory-recipient", message: "what is pending?" },
    {
      tools: createFakeTools([]),
      llmProvider,
      auditLogger: async (input) => { auditLogs.push(input); },
      conversationStore: createFakeConversationStore({
        messages: [],
        memory: {
          ...createEmptyCounterpartyMemory(),
          pendingConfirmation: { confirmationId: "pending-transfer-1", type: "transfer", status: "pending", createdAt: "2026-05-24T11:50:00.000Z", expiresAt, recipientEmail: "alex@example.com", recipientFirstName: "Alex", recipientLastName: "Example", amount: 50, currency: "ILS", turnCreated: 1, version: 1 },
          mode: "transfer_confirmation_pending"
        }
      })
    }
  );
  const diagnostics = auditLogs[0].diagnostics ?? [];

  expect(result.intent).toBe("pending_confirmation_status");
  expect(result.message).toBe("Your pending transfer to Alex Example (alex@example.com) for 50.00 ILS is pending until 2026-05-24T12:00:00.000Z.");
  expect(!diagnostics.some((event) => event.nodeName === "composeResponse" && event.fallbackReason?.startsWith("response_post_check_failed:"))).toBeTruthy();
});

test("llm response post-check rejects contradictory pending confirmation currency facts", async () => {
  const auditLogs: AuditLogInput[] = [];
  const expiresAt = "2026-05-24T12:00:00.000Z";
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "pending_confirmation_status" }; },
    async composeResponse() { return "Your pending transfer to alex@example.com for 50.00 USD is pending until 2026-05-24T12:00:00.000Z."; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-post-check-pending-memory-currency", requestId: "request-response-post-check-pending-memory-currency", message: "what is pending?" },
    {
      tools: createFakeTools([]),
      llmProvider,
      auditLogger: async (input) => { auditLogs.push(input); },
      conversationStore: createFakeConversationStore({
        messages: [],
        memory: {
          ...createEmptyCounterpartyMemory(),
          pendingConfirmation: { confirmationId: "pending-transfer-1", type: "transfer", status: "pending", createdAt: "2026-05-24T11:50:00.000Z", expiresAt, recipientEmail: "alex@example.com", amount: 50, currency: "ILS", turnCreated: 1, version: 1 },
          mode: "transfer_confirmation_pending"
        }
      })
    }
  );
  const diagnostics = auditLogs[0].diagnostics ?? [];

  expect(result.intent).toBe("pending_confirmation_status");
  expect(result.message).toMatch(/cannot confirm a transfer from chat text/i);
  expect(diagnostics.some((event) => event.nodeName === "composeResponse" && event.fallbackReason === "response_post_check_failed:contradicting_required_currency_fact")).toBeTruthy();
});
