import { AIMessage } from "@langchain/core/messages";
import { runAssistantGraph } from "../graph.js";
import {
  createFakeTools,
  createFakeLlmProvider,
  createFakeConversationStore,
  createFakeTransferPreparationService,
  createMemoryWithCounterparties
} from "./_aiSafetyKit3.js";
import { createFakePhaseTwoCounterpartyTools } from "./_aiSafetyKit2.js";
import { createFakePhaseFourTransferTools } from "./_aiSafetyKit4.js";
import { createEmptyCounterpartyMemory, rememberCounterparty } from "../counterpartyMemory.js";
import { classifyAmountReference, resolveContextualAmount } from "../amountResolution.js";
import { withTransactionRepoStub } from "./_aiSafetyKit1.js";
import { getTotalReceivedFromCounterparty } from "../tools/getTotalReceivedFromCounterparty.js";
import { getNetWithCounterparty } from "../tools/getNetWithCounterparty.js";
import type { TransactionRecord } from "../../repositories/types.js";
import type { AmountResolutionService, TransferPreparationService } from "../state.js";

test("send money request prepares a transfer confirmation and executes no tool", async () => {
  const executed: string[] = [];
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "transfer_prepare" }; },
    async extractTransferDraft() { return { recipientEmail: "alex@example.com", amount: 50, reason: null }; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-send", message: "Send 50 shekels to Alex" },
    { tools: createFakeTools(executed), llmProvider, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );

  expect(result.intent).toBe("transfer_prepare");
  expect(result.toolCalls).toStrictEqual([]);
  expect(executed).toStrictEqual([]);
  expect(result.confirmation?.recipientEmail).toBe("alex@example.com");
  expect(result.confirmation?.recipientFirstName).toBe("Alex");
  expect(result.confirmation?.version).toBe(1);
  expect(result.confirmation?.status).toBe("pending");
  expect(result.confirmation?.currency).toBe("ILS");
  expect(result.confirmation?.confirmAction.body).toStrictEqual({ action: "confirm", version: 1 });
  expect(transferPreparations[0].draft.amount).toBe(50);
});

test("deterministic mixed-language pronoun transfer resolves last counterparty", async () => {
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const memory = rememberCounterparty(createEmptyCounterpartyMemory(), { email: "alex@example.com", maskedLabel: "a***@example.com", userLabel: "Alex Example (alex@example.com)", displayName: "Alex Example", firstMentionedAtTurn: 1, lastReferencedAtTurn: 1 }, 1);
  const conversationStore = createFakeConversationStore({ messages: [], memory });
  const amountResolutionService: AmountResolutionService = async () => ({ status: "unresolved", reason: "no_received_transaction_for_counterparty" });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-mixed-pronoun-transfer", message: "תעביר him again 50" },
    { tools: createFakeTools([]), conversationStore, amountResolutionService, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );

  expect(result.intent).toBe("transfer_prepare");
  expect(result.confirmation?.recipientEmail).toBe("alex@example.com");
  expect(transferPreparations[0].draft.amount).toBe(50);
  expect(transferPreparations[0].resolvedCounterparty?.email).toBe("alex@example.com");
});

test("deterministic transfer parser preserves contextual amount references", async () => {
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const memory = rememberCounterparty(createEmptyCounterpartyMemory(), { email: "alex@example.com", maskedLabel: "a***@example.com", userLabel: "Alex Example (alex@example.com)", displayName: "Alex Example", firstMentionedAtTurn: 1, lastReferencedAtTurn: 1 }, 1);
  const conversationStore = createFakeConversationStore({ messages: [], memory });
  const amountResolutionService: AmountResolutionService = async () => ({ status: "unresolved", reason: "no_received_transaction_for_counterparty" });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-deterministic-contextual-amount", message: "send him the same amount he sent me" },
    { tools: createFakeTools([]), conversationStore, amountResolutionService, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );

  expect(result.intent).toBe("transfer_prepare");
  expect(result.confirmation).toBeUndefined();
  expect(result.clarification?.reason).toBe("missing_amount");
  expect(transferPreparations[0].draft.amountReferenceText).toBe("same amount he sent me");
  expect(transferPreparations[0].resolvedCounterparty?.email).toBe("alex@example.com");
});

test("amount reference classifier maps directional references", () => {
  expect(classifyAmountReference("same amount he sent me")).toBe("last_received_transaction");
  expect(classifyAmountReference("what he sent me")).toBe("last_received_transaction");
  expect(classifyAmountReference("מה שהוא שלח לי")).toBe("last_received_transaction");
  expect(classifyAmountReference("what I sent him last time")).toBe("last_sent_transaction");
  expect(classifyAmountReference("מה ששלחתי לו")).toBe("last_sent_transaction");
  expect(classifyAmountReference("אותה כמות")).toBe("last_pending_transfer");
  expect(classifyAmountReference("same as before")).toBe("last_pending_transfer");
  expect(classifyAmountReference("that amount")).toBe("last_answer_total");
  expect(classifyAmountReference("that total")).toBe("last_answer_total");
});

test("received-total tool aggregates credits by authenticated user and counterparty", async () => {
  const calls: Array<{ ownerId: string; counterpartyEmail: string }> = [];

  await withTransactionRepoStub(
    {
      getDirectionalTotals: async ({ ownerId, counterpartyEmail }) => {
        calls.push({ ownerId, counterpartyEmail });
        return { creditTotal: 35, creditCount: 2, debitTotal: 0, debitCount: 0 };
      }
    },
    async () => {
      const result = await getTotalReceivedFromCounterparty({
        userId: "507f1f77bcf86cd799439011",
        conversationId: "test-received-total-tool",
        message: "How much did Alex send me?",
        resolvedCounterparty: { email: "Alex@Example.com", maskedLabel: "a***@example.com", userLabel: "Alex Example (alex@example.com)", displayName: "Alex Example", firstMentionedAtTurn: 1, lastReferencedAtTurn: 1 }
      });

      expect(result.status).toBe("ok");
      expect(result.displayData?.metadata.amount).toBe(35);
      expect(calls[0].ownerId).toBe("507f1f77bcf86cd799439011");
      expect(calls[0].counterpartyEmail).toBe("alex@example.com");
    }
  );
});

test("net-total tool aggregates credits and debits by authenticated user and counterparty", async () => {
  const calls: Array<{ ownerId: string; counterpartyEmail: string }> = [];

  await withTransactionRepoStub(
    {
      getDirectionalTotals: async ({ ownerId, counterpartyEmail }) => {
        calls.push({ ownerId, counterpartyEmail });
        return { creditTotal: 90, creditCount: 2, debitTotal: 35, debitCount: 1 };
      }
    },
    async () => {
      const result = await getNetWithCounterparty({
        userId: "507f1f77bcf86cd799439011",
        conversationId: "test-net-total-tool",
        message: "What is my net with Alex?",
        resolvedCounterparty: { email: "Alex@Example.com", maskedLabel: "a***@example.com", userLabel: "Alex Example (alex@example.com)", displayName: "Alex Example", firstMentionedAtTurn: 1, lastReferencedAtTurn: 1 }
      });

      expect(result.status).toBe("ok");
      expect(result.displayData?.metadata.amount).toBe(55);
      expect(result.displayData?.metadata.netAmount).toBe(55);
      expect(result.displayData?.metadata.receivedAmount).toBe(90);
      expect(result.displayData?.metadata.sentAmount).toBe(35);
      expect(calls[0].ownerId).toBe("507f1f77bcf86cd799439011");
      expect(calls[0].counterpartyEmail).toBe("alex@example.com");
    }
  );
});

test("default contextual amount resolver scopes latest received lookup by user and counterparty", async () => {
  const queries: Array<{ ownerId: string; counterpartyEmail?: string; type?: string }> = [];

  await withTransactionRepoStub(
    {
      lastForOwner: async (criteria) => {
        queries.push(criteria);
        const record: TransactionRecord = { id: "60d5ec49f1b2c8a1f8e4e1b1", ownerId: "507f1f77bcf86cd799439011", counterpartyEmail: "alex@example.com", amount: 88, type: "credit", directionLabel: "Received", reason: null, createdAt: new Date("2026-06-01T12:00:00.000Z"), updatedAt: new Date("2026-06-01T12:00:00.000Z") };
        return record;
      }
    },
    async () => {
      const result = await resolveContextualAmount({
        userId: "507f1f77bcf86cd799439011",
        conversationId: "test-default-amount-resolver",
        transferDraft: { amountReferenceText: "same amount he sent me" },
        resolvedCounterparty: { email: "Alex@Example.com", maskedLabel: "a***@example.com", firstMentionedAtTurn: 1, lastReferencedAtTurn: 1 },
        counterpartyMemory: createEmptyCounterpartyMemory()
      });

      expect(result.status).toBe("resolved");
      expect(result.status === "resolved" ? result.amount.amount : 0).toBe(88);
      expect(queries[0]).toStrictEqual({ ownerId: "507f1f77bcf86cd799439011", counterpartyEmail: "alex@example.com", type: "credit" });
    }
  );
});

test("contextual amount resolver uses latest positive total answer for resolved counterparty", async () => {
  const memory = createMemoryWithCounterparties(["alex@example.com"]);
  memory.entities = [
    { id: "total:received:rani@example.com", type: "total", turnIntroduced: 2, turnLastReferenced: 2, source: "tool_result", confidence: "high", displayName: "total received from m***@example.com", counterpartyEmail: "rani@example.com", direction: "received", sourceToolName: "getTotalReceivedFromCounterparty", amount: 200, currency: "ILS", aliases: ["that amount"] },
    { id: "total:received:alex@example.com", type: "total", turnIntroduced: 3, turnLastReferenced: 3, source: "tool_result", confidence: "high", displayName: "total received from a***@example.com", counterpartyEmail: "alex@example.com", direction: "received", sourceToolName: "getTotalReceivedFromCounterparty", amount: 120, currency: "ILS", aliases: ["that amount", "that total"] }
  ];

  const result = await resolveContextualAmount({
    userId: "507f1f77bcf86cd799439011",
    conversationId: "test-total-answer-amount-resolver",
    transferDraft: { amountReferenceText: "that amount" },
    resolvedCounterparty: { email: "Alex@Example.com", maskedLabel: "a***@example.com", firstMentionedAtTurn: 1, lastReferencedAtTurn: 1 },
    counterpartyMemory: memory
  });

  expect(result.status).toBe("resolved");
  expect(result.status === "resolved" ? result.amount.amount : 0).toBe(120);
  expect(result.status === "resolved" ? result.amount.source : undefined).toBe("last_answer_total_received");
});

test("contextual amount resolver flags same-amount ambiguity when total answer exists", async () => {
  const memory = createMemoryWithCounterparties(["alex@example.com"]);
  memory.entities = [
    { id: "total:received:alex@example.com", type: "total", turnIntroduced: 3, turnLastReferenced: 3, source: "tool_result", confidence: "high", displayName: "total received from a***@example.com", counterpartyEmail: "alex@example.com", direction: "received", sourceToolName: "getTotalReceivedFromCounterparty", amount: 120, currency: "ILS", aliases: ["that amount", "that total"] }
  ];

  const result = await resolveContextualAmount({
    userId: "507f1f77bcf86cd799439011",
    conversationId: "test-ambiguous-same-amount-resolver",
    transferDraft: { amountReferenceText: "same amount" },
    resolvedCounterparty: { email: "alex@example.com", maskedLabel: "a***@example.com", firstMentionedAtTurn: 1, lastReferencedAtTurn: 1 },
    counterpartyMemory: memory
  });

  expect(result).toStrictEqual({ status: "unresolved", reason: "ambiguous_amount_scope" });
});

test("contextual amount resolver fills transfer amount before preparation", async () => {
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const amountResolutionInputs: Array<Parameters<AmountResolutionService>[0]> = [];
  const memory = rememberCounterparty(createEmptyCounterpartyMemory(), { email: "alex@example.com", maskedLabel: "a***@example.com", userLabel: "Alex Example (alex@example.com)", displayName: "Alex Example", firstMentionedAtTurn: 1, lastReferencedAtTurn: 1 }, 1);
  const conversationStore = createFakeConversationStore({ messages: [], memory });
  const amountResolutionService: AmountResolutionService = async (input) => {
    amountResolutionInputs.push(input);
    return { status: "resolved", amount: { amount: 75, currency: "ILS", source: "last_received_transaction", confidence: "high", explanation: "Resolved amount from the latest received transaction with the counterparty." } };
  };

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-contextual-amount-resolution", message: "send him the same amount he sent me" },
    { tools: createFakeTools([]), conversationStore, amountResolutionService, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );

  expect(result.confirmation?.amount).toBe(75);
  expect(result.confirmation?.recipientEmail).toBe("alex@example.com");
  expect(amountResolutionInputs[0].resolvedCounterparty?.email).toBe("alex@example.com");
  expect(amountResolutionInputs[0].transferDraft.amountReferenceText).toBe("same amount he sent me");
  expect(transferPreparations[0].draft.amount).toBe(75);
});

test("transfer can resolve that amount from latest total answer memory", async () => {
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const memory = createMemoryWithCounterparties(["alex@example.com"]);
  memory.entities = [
    { id: "total:received:alex@example.com", type: "total", turnIntroduced: 2, turnLastReferenced: 2, source: "tool_result", confidence: "high", displayName: "total received from a***@example.com", counterpartyEmail: "alex@example.com", direction: "received", sourceToolName: "getTotalReceivedFromCounterparty", amount: 120, currency: "ILS", aliases: ["that amount", "that total"] }
  ];
  const conversationStore = createFakeConversationStore({ messages: [], memory });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transfer-from-total-answer", message: "send him that amount" },
    { tools: createFakeTools([]), conversationStore, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );

  expect(result.intent).toBe("transfer_prepare");
  expect(result.confirmation?.amount).toBe(120);
  expect(result.confirmation?.recipientEmail).toBe("alex@example.com");
  expect(transferPreparations[0].draft.amount).toBe(120);
  expect(transferPreparations[0].draft.amountReferenceText).toBe("that amount");
});

test("ambiguous same-amount transfer stores amount-scope clarification with resume draft", async () => {
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const memory = createMemoryWithCounterparties(["alex@example.com"]);
  memory.entities = [
    { id: "total:received:alex@example.com", type: "total", turnIntroduced: 2, turnLastReferenced: 2, source: "tool_result", confidence: "high", displayName: "total received from a***@example.com", counterpartyEmail: "alex@example.com", direction: "received", sourceToolName: "getTotalReceivedFromCounterparty", amount: 120, currency: "ILS", aliases: ["that amount", "that total"] }
  ];
  const conversationStore = createFakeConversationStore({ messages: [], memory });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-amount-scope-clarification", message: "send him the same amount" },
    { tools: createFakeTools([]), conversationStore, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );
  const savedClarification = conversationStore.saved.at(-1)?.memory.clarification;

  expect(result.intent).toBe("transfer_prepare");
  expect(result.confirmation).toBeUndefined();
  expect(transferPreparations.length).toBe(0);
  expect(result.clarification?.reason).toBe("ambiguous_amount");
  expect(result.clarification?.expectedReplyType).toBe("amount_scope");
  expect(result.clarification?.resumeIntent).toBe("transfer_prepare");
  expect(result.clarification?.resumeDraft?.amountReferenceText).toBe("same amount");
  expect(result.clarification?.options?.map((o) => o.value)).toStrictEqual(["last_sent_transaction", "last_answer_total"]);
  expect(savedClarification?.resumeIntent).toBe("transfer_prepare");
  expect(savedClarification?.resumeDraft?.amountReferenceText).toBe("same amount");
});

test("amount-scope clarification reply resumes transfer with previous answer total", async () => {
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const memory = createMemoryWithCounterparties(["alex@example.com"]);
  memory.entities = [
    { id: "total:received:alex@example.com", type: "total", turnIntroduced: 2, turnLastReferenced: 2, source: "tool_result", confidence: "high", displayName: "total received from a***@example.com", counterpartyEmail: "alex@example.com", direction: "received", sourceToolName: "getTotalReceivedFromCounterparty", amount: 120, currency: "ILS", aliases: ["that amount", "that total"] }
  ];
  memory.clarification = {
    reason: "ambiguous_amount",
    message: "Do you mean the last amount from that counterparty, or the total from the previous answer?",
    expectedReplyType: "amount_scope",
    resumeIntent: "transfer_prepare",
    resumeDraft: { recipientReference: "him", amountReferenceText: "same amount" },
    options: [
      { id: "last_sent_transaction", label: "Last sent amount", value: "last_sent_transaction" },
      { id: "last_answer_total", label: "Previous answer total", value: "last_answer_total" }
    ]
  };
  const conversationStore = createFakeConversationStore({ messages: [], memory });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-amount-scope-resume-total", message: "the previous answer total" },
    { tools: createFakeTools([]), conversationStore, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );
  const savedMemory = conversationStore.saved.at(-1)?.memory;

  expect(result.intent).toBe("transfer_prepare");
  expect(result.confirmation?.amount).toBe(120);
  expect(result.confirmation?.recipientEmail).toBe("alex@example.com");
  expect(transferPreparations[0].draft.amount).toBe(120);
  expect(transferPreparations[0].draft.amountReferenceText).toBe("that amount");
  expect(savedMemory?.clarification).toBeNull();
});

test("unresolved contextual amount does not create a pending transfer", async () => {
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const memory = rememberCounterparty(createEmptyCounterpartyMemory(), { email: "alex@example.com", maskedLabel: "a***@example.com", userLabel: "Alex Example (alex@example.com)", displayName: "Alex Example", firstMentionedAtTurn: 1, lastReferencedAtTurn: 1 }, 1);
  const conversationStore = createFakeConversationStore({ messages: [], memory });
  const amountResolutionService: AmountResolutionService = async () => ({ status: "unresolved", reason: "no_received_transaction_for_counterparty" });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-contextual-amount-unresolved", message: "send him the same amount he sent me" },
    { tools: createFakeTools([]), conversationStore, amountResolutionService, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );

  expect(result.confirmation).toBeUndefined();
  expect(result.clarification?.reason).toBe("missing_amount");
  expect(transferPreparations[0].draft.amount).toBeUndefined();
  expect(transferPreparations[0].draft.amountReferenceText).toBe("same amount he sent me");
});

test("unsupported transfer currency asks clarification before preparation", async () => {
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "transfer_prepare" }; },
    async extractTransferDraft() { return { recipientEmail: "alex@example.com", amount: 50, amountText: "$50", currency: "USD", currencyMentioned: true, currencySupported: false }; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transfer-usd", message: "Send Alex $50" },
    { tools: createFakeTools([]), llmProvider, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );

  expect(result.intent).toBe("transfer_prepare");
  expect(result.confirmation).toBeUndefined();
  expect(transferPreparations.length).toBe(0);
  expect(result.message).toMatch(/only in ILS/);
});

test("transfer request can resolve recipient from last counterparty", async () => {
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const conversationStore = createFakeConversationStore({ messages: [], memory: createMemoryWithCounterparties(["alex@example.com"]) });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "transfer_prepare" }; },
    async extractTransferDraft() { return { recipientReference: "him", amount: 25, reason: "Dinner" }; },
    async resolveCounterpartyReference() { return { kind: "last_counterparty", confidence: "high" }; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transfer-reference", message: "Send him 25 for dinner" },
    { tools: createFakeTools([]), conversationStore, llmProvider, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );

  expect(result.intent).toBe("transfer_prepare");
  expect(result.toolCalls).toStrictEqual([]);
  expect(result.confirmation?.recipientEmail).toBe("alex@example.com");
  expect(transferPreparations[0].resolvedCounterparty?.email).toBe("alex@example.com");
});

test("hebrew transfer request resolves לו from last counterparty and returns confirmation", async () => {
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const conversationStore = createFakeConversationStore({ messages: [new AIMessage("האדם האחרון שהעברת אליו היה alex@example.com.")], memory: createMemoryWithCounterparties(["alex@example.com"]) });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "transfer_prepare" }; },
    async extractTransferDraft() { return { recipientReference: "לו", amount: 50, currency: "ILS", currencyMentioned: true, currencySupported: true }; },
    async resolveCounterpartyReference() { return { kind: "none", confidence: "low" }; },
    async composeResponse() { return "hallucinated response should not replace confirmation fallback"; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-transfer-reference", message: "בוא נעביר לו 50 שקל" },
    { tools: createFakeTools([]), conversationStore, llmProvider, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );

  expect(result.intent).toBe("transfer_prepare");
  expect(result.confirmation?.recipientEmail).toBe("alex@example.com");
  expect(transferPreparations[0].resolvedCounterparty?.email).toBe("alex@example.com");
  expect(result.message).toBe("צריך לבדוק את פרטי ההעברה ולהשתמש בכפתורי האישור לפני שמשהו נשלח.");
});

test("hebrew same amount transfer can reuse recent sent counterparty memory", async () => {
  const executed: string[] = [];
  const transferPreparations: Array<Parameters<TransferPreparationService>[0]> = [];
  const conversationStore = createFakeConversationStore();
  const amountResolutionService: AmountResolutionService = async (input) => {
    expect(input.resolvedCounterparty?.email).toBe("rani@example.com");
    expect(input.transferDraft.amountReferenceText).toBe("אותה כמות");
    return { status: "resolved", amount: { amount: 25, currency: "ILS", source: "last_sent_transaction", confidence: "high", explanation: "Resolved from test latest sent transaction." } };
  };

  const firstResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-same-amount-after-recent-sent", message: "למי העברתי היום?" },
    { tools: createFakePhaseTwoCounterpartyTools(executed), conversationStore }
  );
  const secondResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-same-amount-after-recent-sent", message: "בוא נעביר לו שוב את אותה כמות" },
    { tools: createFakePhaseTwoCounterpartyTools(executed), conversationStore, amountResolutionService, transferPreparationService: createFakeTransferPreparationService(transferPreparations) }
  );

  expect(firstResult.intent).toBe("recent_sent_counterparties");
  expect(firstResult.toolCalls).toStrictEqual(["getRecentSentCounterparties"]);
  expect(secondResult.intent).toBe("transfer_prepare");
  expect(secondResult.confirmation?.recipientEmail).toBe("rani@example.com");
  expect(secondResult.confirmation?.amount).toBe(25);
  expect(transferPreparations[0].resolvedCounterparty?.email).toBe("rani@example.com");
  expect(transferPreparations[0].draft.amountReferenceText).toBe("אותה כמות");
  expect(executed).toStrictEqual(["getRecentSentCounterparties"]);
});
