import { runAssistantGraph } from "../graph.js";
import {
  createFakeTools,
  createFakeLlmProvider,
  createFakeConversationStore,
  createFakeTransferPreparationService
} from "./_aiSafetyKit3.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";
import type { AuditLogInput, TransferPreparationService } from "../state.js";

test("confirmation context is persisted in structured conversation memory", async () => {
  const conversationStore = createFakeConversationStore();
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "transfer_prepare" }; },
    async extractTransferDraft() { return { recipientEmail: "alex@example.com", amount: 50 }; }
  });

  await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transfer-memory", message: "Send Alex 50 shekels" },
    { tools: createFakeTools([]), conversationStore, llmProvider, transferPreparationService: createFakeTransferPreparationService() }
  );

  const savedMemory = conversationStore.saved.at(-1)?.memory;
  expect(savedMemory?.mode).toBe("transfer_confirmation_pending");
  expect(savedMemory?.pendingConfirmation?.confirmationId).toBe("pending-transfer-1");
  expect(savedMemory?.pendingConfirmation?.version).toBe(1);
  expect(savedMemory?.answerFrames?.at(-1)?.intent).toBe("transfer_prepare");
});

test("chat confirmation wording never executes money movement", async () => {
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-chat-confirm", message: "yes confirm it" },
    {
      tools: createFakeTools([]),
      conversationStore: createFakeConversationStore({
        messages: [],
        memory: {
          ...createEmptyCounterpartyMemory(),
          pendingConfirmation: { confirmationId: "pending-transfer-1", type: "transfer", status: "pending", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), recipientEmail: "alex@example.com", amount: 50, currency: "ILS", turnCreated: 1, version: 1 },
          mode: "transfer_confirmation_pending"
        }
      })
    }
  );

  expect(result.intent).toBe("pending_confirmation_status");
  expect(result.toolCalls).toStrictEqual([]);
  expect(result.message).toMatch(/cannot confirm a transfer from chat text/i);
});

test("llm response post-check rejects chat-confirmation money movement claims", async () => {
  const auditLogs: AuditLogInput[] = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "pending_confirmation_status" }; },
    async composeResponse() { return "I confirmed it and the transfer has been sent."; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-response-post-check-transfer-claim", requestId: "request-response-post-check-transfer-claim", message: "yes confirm it" },
    {
      tools: createFakeTools([]),
      llmProvider,
      auditLogger: async (input) => { auditLogs.push(input); },
      conversationStore: createFakeConversationStore({
        messages: [],
        memory: {
          ...createEmptyCounterpartyMemory(),
          pendingConfirmation: { confirmationId: "pending-transfer-1", type: "transfer", status: "pending", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), recipientEmail: "alex@example.com", amount: 50, currency: "ILS", turnCreated: 1, version: 1 },
          mode: "transfer_confirmation_pending"
        }
      })
    }
  );
  const diagnostics = auditLogs[0].diagnostics ?? [];

  expect(result.intent).toBe("pending_confirmation_status");
  expect(result.message).toMatch(/cannot confirm a transfer from chat text/i);
  expect(diagnostics.some((event) => event.nodeName === "composeResponse" && event.fallbackReason === "response_post_check_failed:unsafe_money_movement_claim")).toBeTruthy();
});

test("llm responder input includes pending confirmation memory facts", async () => {
  let safeConfirmation: { status: string; recipientMaskedLabel: string; amount: number; formattedAmount: string; expiresAt: string } | undefined;
  let requiredResponseFacts: Array<{ kind: string; source: string; value: string }> = [];
  const expiresAt = "2026-05-24T12:00:00.000Z";
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "pending_confirmation_status" }; },
    async composeResponse(input) {
      safeConfirmation = input.safeResolvedReferences.confirmation ?? undefined;
      requiredResponseFacts = input.requiredResponseFacts.map((fact) => ({ kind: fact.kind, source: fact.source, value: fact.value }));
      return input.fallbackMessage;
    }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-pending-memory-response-facts", message: "what is pending?" },
    {
      tools: createFakeTools([]),
      llmProvider,
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

  expect(result.intent).toBe("pending_confirmation_status");
  expect(safeConfirmation).toStrictEqual({ status: "pending", recipientMaskedLabel: "a***@example.com", amount: 50, currency: "ILS", formattedAmount: "50.00 ILS", reason: null, warningCodes: [], expiresAt });
  expect(requiredResponseFacts.some((f) => f.kind === "currency" && f.source === "confirmation.currency" && f.value === "ILS")).toBeTruthy();
  expect(requiredResponseFacts.some((f) => f.kind === "amount" && f.source === "confirmation.amount" && f.value === "50.00")).toBeTruthy();
  expect(requiredResponseFacts.some((f) => f.kind === "recipient" && f.source === "confirmation.recipient" && f.value === "a***@example.com")).toBeTruthy();
  expect(requiredResponseFacts.some((f) => f.kind === "status" && f.source === "confirmation.status" && f.value === "pending")).toBeTruthy();
  expect(requiredResponseFacts.some((f) => f.kind === "date" && f.source === "confirmation.expiresAt" && f.value === expiresAt)).toBeTruthy();
});
