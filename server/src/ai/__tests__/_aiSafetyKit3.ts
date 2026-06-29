import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { app } from "../../app.js";
import { config } from "../../config.js";
import { createToken } from "../../utils/auth.js";
import { hashCsrfToken } from "../../utils/session.js";
import {
  createEmptyCounterpartyMemory,
  rememberCounterparty,
  trimConversationMessages
} from "../counterpartyMemory.js";
import { runAssistantGraph } from "../graph.js";
import type {
  AssistantLlmProvider,
  AuditLogInput,
  ConversationContext,
  ConversationSaveInput,
  ConversationStore,
  CounterpartyMemory,
  TransferModificationService,
  TransferPreparationService
} from "../state.js";
import { fakeResult, createFakeTools } from "./_aiSafetyKit1.js";

export { app, config, createToken, hashCsrfToken, runAssistantGraph, AIMessage };
export type { AssistantLlmProvider, AuditLogInput, ConversationContext, ConversationSaveInput, ConversationStore, CounterpartyMemory, TransferModificationService, TransferPreparationService, BaseMessage };
export { createEmptyCounterpartyMemory, rememberCounterparty, createFakeTools, fakeResult };

export function createFakeLlmProvider(overrides: Partial<AssistantLlmProvider>): AssistantLlmProvider {
  return {
    async classifyIntent() { return { intent: "unsupported" }; },
    async extractTransferDraft() { return {}; },
    async resolveCounterpartyReference() { return { kind: "none", confidence: "low" }; },
    async composeResponse(input) { return input.fallbackMessage; },
    ...overrides
  };
}

export function createFakeConversationStore(
  initial?: ConversationContext
): ConversationStore & { saved: ConversationSaveInput[] } {
  let context: ConversationContext = initial ?? {
    messages: [],
    memory: createEmptyCounterpartyMemory()
  };
  const saved: ConversationSaveInput[] = [];
  return {
    saved,
    async load() { return context; },
    async save(input) {
      saved.push(input);
      context = { messages: trimConversationMessages(input.messages), memory: input.memory };
    }
  };
}

export function createFakeTransferPreparationService(
  confirmations: Array<Parameters<TransferPreparationService>[0]> = []
): TransferPreparationService {
  return async (input) => {
    confirmations.push(input);
    if (!input.draft.amount) {
      return { status: "needs_clarification", message: "I need a valid positive amount before I can prepare that transfer." };
    }
    const recipientEmail = input.draft.recipientEmail ?? input.resolvedCounterparty?.email;
    if (!recipientEmail) {
      return { status: "needs_clarification", message: "I need to know which recipient you mean before I can prepare that transfer." };
    }
    return {
      status: "ready",
      confirmation: {
        id: "pending-transfer-1",
        version: 1,
        type: "transfer",
        status: "pending",
        recipientEmail,
        recipientFirstName: "Alex",
        recipientLastName: "Example",
        amount: input.draft.amount,
        currency: "ILS",
        recipient: { email: recipientEmail, firstName: "Alex", lastName: "Example", displayName: "Alex Example", verified: true },
        amountDetails: { value: input.draft.amount, currency: "ILS", formatted: `₪${input.draft.amount}` },
        reason: input.draft.reason ?? null,
        warnings: [],
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        confirmAction: { method: "POST", path: "/api/ai/confirmations/pending-transfer-1", body: { action: "confirm", version: 1 } },
        denyAction: { method: "POST", path: "/api/ai/confirmations/pending-transfer-1", body: { action: "deny", version: 1 } }
      }
    };
  };
}

export function createFakeTransferModificationService(
  modifications: Array<Parameters<TransferModificationService>[0]> = [],
  options: { failMessage?: string } = {}
): TransferModificationService {
  return async (input) => {
    modifications.push(input);
    if (options.failMessage) {
      return { status: "needs_clarification", message: options.failMessage };
    }
    const recipientEmail = input.modificationDraft.recipientEmail ?? input.resolvedCounterparty?.email ?? "alex@example.com";
    const amount = input.modificationDraft.amount ?? 50;
    return {
      status: "ready",
      supersededConfirmationId: input.activePendingTransferId,
      confirmation: {
        id: "pending-transfer-2",
        version: 1,
        type: "transfer",
        status: "pending",
        recipientEmail,
        recipientFirstName: "Alex",
        recipientLastName: "Example",
        amount,
        currency: "ILS",
        recipient: { email: recipientEmail, firstName: "Alex", lastName: "Example", displayName: "Alex Example", verified: true },
        amountDetails: { value: amount, currency: "ILS", formatted: `₪${amount}` },
        reason: input.modificationDraft.reason ?? null,
        warnings: [],
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        supersedesId: input.activePendingTransferId,
        confirmAction: { method: "POST", path: "/api/ai/confirmations/pending-transfer-2", body: { action: "confirm", version: 1 } },
        denyAction: { method: "POST", path: "/api/ai/confirmations/pending-transfer-2", body: { action: "deny", version: 1 } }
      }
    };
  };
}

export function createMemoryWithCounterparties(emails: string[]): CounterpartyMemory {
  return emails.reduce((memory, email, index) => {
    return rememberCounterparty(
      memory,
      { email, maskedLabel: `${email.slice(0, 1)}***@example.com`, userLabel: email, aliases: [email, email.split("@")[0] ?? email], firstMentionedAtTurn: index + 1, lastReferencedAtTurn: index + 1 },
      index + 1
    );
  }, createEmptyCounterpartyMemory());
}

export function createAuthHeaders() {
  const csrfToken = "test-csrf-token";
  const authToken = createToken("507f1f77bcf86cd799439011", hashCsrfToken(csrfToken));
  return {
    Cookie: `virly_auth=${encodeURIComponent(authToken)}; virly_csrf=${encodeURIComponent(csrfToken)}`,
    "X-CSRF-Token": csrfToken
  };
}

export async function collectGraphNodeTransitions(
  input: Parameters<typeof runAssistantGraph>[0],
  options: Parameters<typeof runAssistantGraph>[1]
) {
  const previousDebugTrace = config.ai.debugTrace;
  const auditLogs: AuditLogInput[] = [];
  config.ai.debugTrace = true;
  try {
    const result = await runAssistantGraph(input, {
      ...options,
      auditLogger: async (auditInput) => {
        auditLogs.push(auditInput);
        await options?.auditLogger?.(auditInput);
      }
    });
    const nodeNames = (auditLogs[0]?.diagnostics ?? [])
      .filter((event) => event.type === "node_transition")
      .map((event) => event.nodeName);
    return { result, nodeNames };
  } finally {
    config.ai.debugTrace = previousDebugTrace;
  }
}
