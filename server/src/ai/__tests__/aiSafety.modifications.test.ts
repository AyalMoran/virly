import { runAssistantGraph } from "../graph.js";
import {
  createFakeTools,
  createFakeLlmProvider,
  createFakeConversationStore,
  createFakeTransferModificationService,
  createMemoryWithCounterparties
} from "./_aiSafetyKit3.js";
import { fakeResult } from "./_aiSafetyKit1.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";
import type { AssistantToolExecutors, TransferModificationService } from "../state.js";

const pendingMemory = () => ({
  ...createEmptyCounterpartyMemory(),
  pendingConfirmation: {
    confirmationId: "pending-transfer-1",
    type: "transfer" as const,
    status: "pending" as const,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    recipientEmail: "alex@example.com",
    amount: 50,
    currency: "ILS" as const,
    turnCreated: 1,
    version: 1
  },
  mode: "transfer_confirmation_pending" as const
});

test("pending transfer amount modification creates new confirmation and supersedes old", async () => {
  const modifications: Array<Parameters<TransferModificationService>[0]> = [];
  const conversationStore = createFakeConversationStore({ messages: [], memory: pendingMemory() });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-modify-pending", message: "Actually make it 70" },
    { tools: createFakeTools([]), conversationStore, transferModificationService: createFakeTransferModificationService(modifications) }
  );

  expect(result.intent).toBe("transfer_modify_pending");
  expect(result.supersededConfirmationId).toBe("pending-transfer-1");
  expect(result.confirmation?.id).toBe("pending-transfer-2");
  expect(result.confirmation?.amount).toBe(70);
  expect(result.confirmation?.recipientEmail).toBe("alex@example.com");
  expect(modifications[0].activePendingTransferId).toBe("pending-transfer-1");
  expect(modifications[0].modificationDraft.amount).toBe(70);
  expect(result.toolCalls).toStrictEqual([]);
  expect(result.message).toBe("I updated the pending transfer. Please review the new confirmation card before anything is sent.");
});

test("pending transfer modification keeps the same recipient when the user says same recipient but 70", async () => {
  const modifications: Array<Parameters<TransferModificationService>[0]> = [];
  const conversationStore = createFakeConversationStore({ messages: [], memory: pendingMemory() });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "transfer_modify_pending" }; },
    async extractTransferDraft() { return { recipientReference: "same recipient", amount: 70, currency: "ILS", currencyMentioned: false, currencySupported: true }; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-modify-pending-same-recipient-70", message: "same recipient but 70" },
    { tools: createFakeTools([]), conversationStore, llmProvider, transferModificationService: createFakeTransferModificationService(modifications) }
  );

  expect(result.intent).toBe("transfer_modify_pending");
  expect(result.confirmation?.recipientEmail).toBe("alex@example.com");
  expect(result.confirmation?.amount).toBe(70);
  expect(modifications[0].modificationDraft.amount).toBe(70);
  expect(modifications[0].resolvedCounterparty?.email).toBe("alex@example.com");
});

test("hebrew pending transfer amount modification returns hebrew new-card wording", async () => {
  const conversationStore = createFakeConversationStore({ messages: [], memory: pendingMemory() });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-modify-pending-hebrew", message: "בעצם תעביר 70" },
    { tools: createFakeTools([]), conversationStore, transferModificationService: createFakeTransferModificationService() }
  );

  expect(result.intent).toBe("transfer_modify_pending");
  expect(result.confirmation?.amount).toBe(70);
  expect(result.message).toBe("עדכנתי את ההעברה הממתינה. צריך לבדוק ולאשר את כרטיס האישור החדש לפני שמשהו נשלח.");
});

test("pending transfer modification can reuse the same amount as before", async () => {
  const modifications: Array<Parameters<TransferModificationService>[0]> = [];
  const conversationStore = createFakeConversationStore({ messages: [], memory: pendingMemory() });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "transfer_modify_pending" }; },
    async extractTransferDraft() { return { amountReferenceText: "same as before" }; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-modify-pending-same-amount-before", message: "use the same amount as before" },
    { tools: createFakeTools([]), conversationStore, llmProvider, transferModificationService: createFakeTransferModificationService(modifications) }
  );

  expect(result.intent).toBe("transfer_modify_pending");
  expect(result.confirmation?.recipientEmail).toBe("alex@example.com");
  expect(result.confirmation?.amount).toBe(50);
  expect(modifications[0].modificationDraft.amount).toBe(50);
  expect(modifications[0].modificationDraft.amountReferenceText).toBe("same as before");
  expect(result.supersededConfirmationId).toBe("pending-transfer-1");
});

test("pending transfer modification can change recipient when the user says send it to Sarah instead", async () => {
  const modifications: Array<Parameters<TransferModificationService>[0]> = [];
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore({ messages: [], memory: pendingMemory() });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "transfer_modify_pending" }; },
    async extractTransferDraft() { return { recipientReference: "Sarah" }; }
  });
  const tools: AssistantToolExecutors = {
    ...createFakeTools(executed),
    async resolveCounterpartyCandidates() {
      executed.push("resolveCounterpartyCandidates");
      return fakeResult({
        toolName: "resolveCounterpartyCandidates",
        data: { kind: "counterparty", status: "resolved", counterparty: { email: "sarah@example.com", maskedLabel: "s***@example.com", userLabel: "Sarah Example (sarah@example.com)", displayName: "Sarah Example" }, candidates: [{ id: "sarah@example.com", label: "Sarah Example (sarah@example.com)", value: "sarah@example.com" }] },
        summary: "Resolved counterparty: Sarah Example (s***@example.com).",
        userSummary: "Resolved counterparty: Sarah Example (sarah@example.com).",
        metadata: { recordCount: 1, resolutionStatus: "resolved", counterpartyEmail: "sarah@example.com", maskedLabel: "s***@example.com", displayName: "Sarah Example" }
      });
    }
  };

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-modify-pending-change-recipient", message: "send it to Sarah instead" },
    { tools, conversationStore, llmProvider, transferModificationService: createFakeTransferModificationService(modifications) }
  );

  expect(result.intent).toBe("transfer_modify_pending");
  expect(result.toolCalls).toStrictEqual(["resolveCounterpartyCandidates"]);
  expect(result.confirmation?.recipientEmail).toBe("sarah@example.com");
  expect(result.confirmation?.amount).toBe(50);
  expect(modifications[0].resolvedCounterparty?.email).toBe("sarah@example.com");
  expect(modifications[0].activePendingTransferId).toBe("pending-transfer-1");
  expect(executed).toStrictEqual(["resolveCounterpartyCandidates"]);
});

test("ambiguous pending transfer recipient replacement asks for clarification before modification", async () => {
  const modifications: Array<Parameters<TransferModificationService>[0]> = [];
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore({ messages: [], memory: pendingMemory() });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "transfer_modify_pending" }; },
    async extractTransferDraft() { return { recipientReference: "Sarah" }; }
  });
  const tools: AssistantToolExecutors = {
    ...createFakeTools(executed),
    async resolveCounterpartyCandidates() {
      executed.push("resolveCounterpartyCandidates");
      return fakeResult({
        toolName: "resolveCounterpartyCandidates",
        data: { kind: "counterparty", status: "ambiguous", candidates: [{ id: "sarah.a@example.com", label: "Sarah A (sarah.a@example.com)", value: "sarah.a@example.com" }, { id: "sarah.b@example.com", label: "Sarah B (sarah.b@example.com)", value: "sarah.b@example.com" }] },
        summary: "I found multiple possible counterparties: Sarah A (s***@example.com); Sarah B (s***@example.com).",
        userSummary: "I found multiple possible counterparties: Sarah A (sarah.a@example.com); Sarah B (sarah.b@example.com).",
        metadata: { recordCount: 2, resolutionStatus: "ambiguous", counterpartyCandidates: [{ counterpartyEmail: "sarah.a@example.com", maskedLabel: "s***@example.com", displayName: "Sarah A", confidence: "high" }, { counterpartyEmail: "sarah.b@example.com", maskedLabel: "s***@example.com", displayName: "Sarah B", confidence: "high" }] }
      });
    }
  };

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-modify-pending-ambiguous-recipient", message: "send it to Sarah instead" },
    { tools, conversationStore, llmProvider, transferModificationService: createFakeTransferModificationService(modifications) }
  );

  expect(result.intent).toBe("transfer_modify_pending");
  expect(result.toolCalls).toStrictEqual(["resolveCounterpartyCandidates"]);
  expect(result.confirmation).toBeUndefined();
  expect(modifications.length).toBe(0);
  expect(result.clarification?.expectedReplyType).toBe("recipient");
  expect(result.message).toMatch(/multiple matching counterparties/i);
  expect(executed).toStrictEqual(["resolveCounterpartyCandidates"]);
});

test("failed pending transfer modification does not create replacement confirmation", async () => {
  const modifications: Array<Parameters<TransferModificationService>[0]> = [];
  const conversationStore = createFakeConversationStore({ messages: [], memory: pendingMemory() });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-modify-pending-fail", message: "Actually make it 999999" },
    { tools: createFakeTools([]), conversationStore, transferModificationService: createFakeTransferModificationService(modifications, { failMessage: "Your current balance is not enough for that transfer." }) }
  );

  expect(result.intent).toBe("transfer_modify_pending");
  expect(result.confirmation).toBeUndefined();
  expect(result.supersededConfirmationId).toBeUndefined();
  expect(modifications.length).toBe(1);
  expect(result.message).toBe("Your current balance is not enough for that transfer.");
});
