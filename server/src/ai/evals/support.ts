import {
  createEmptyCounterpartyMemory,
  rememberCounterparty,
  trimConversationMessages
} from "../counterpartyMemory.js";
import type {
  ConversationContext,
  ConversationSaveInput,
  ConversationStore,
  CounterpartyMemory,
  PendingConfirmationMemory,
  TransferModificationService,
  TransferPreparationService
} from "../state.js";
import type { AiEvalScenario } from "./types.js";

export function createMemoryWithCounterparties(
  emails: string[]
): CounterpartyMemory {
  return emails.reduce((memory, email, index) => {
    return rememberCounterparty(
      memory,
      {
        email,
        maskedLabel: `${email.slice(0, 1)}***@example.com`,
        userLabel: email,
        aliases: [email, email.split("@")[0] ?? email],
        firstMentionedAtTurn: index + 1,
        lastReferencedAtTurn: index + 1
      },
      index + 1
    );
  }, createEmptyCounterpartyMemory());
}

export function createPendingConfirmationMemory(
  scenario: AiEvalScenario
): PendingConfirmationMemory | null {
  const pending = scenario.setup?.pendingConfirmation;
  if (!pending) {
    return null;
  }

  return {
    confirmationId: "pending-transfer-1",
    type: "transfer",
    status: "pending",
    createdAt: new Date("2026-05-24T10:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-05-24T12:00:00.000Z").toISOString(),
    recipientEmail: pending.recipientEmail,
    amount: pending.amount,
    currency: pending.currency,
    turnCreated: 1,
    version: pending.version ?? 1
  };
}

export function buildInitialConversationContext(
  scenario: AiEvalScenario
): ConversationContext {
  const baseMemory = scenario.setup?.rememberedCounterparties?.length
    ? createMemoryWithCounterparties(scenario.setup.rememberedCounterparties)
    : createEmptyCounterpartyMemory();
  const pendingConfirmation = createPendingConfirmationMemory(scenario);

  return pendingConfirmation
    ? {
        messages: [],
        memory: {
          ...baseMemory,
          pendingConfirmation,
          mode: "transfer_confirmation_pending"
        }
      }
    : {
        messages: [],
        memory: baseMemory
      };
}

export function createInMemoryConversationStore(
  scenario: AiEvalScenario
): ConversationStore {
  let context = buildInitialConversationContext(scenario);

  return {
    async load() {
      return context;
    },
    async save(input: ConversationSaveInput) {
      context = {
        messages: trimConversationMessages(input.messages),
        memory: input.memory
      };
    }
  };
}

export function createTransferPreparationService(): TransferPreparationService {
  return async (input) => {
    if (!input.draft.amount) {
      return {
        status: "needs_clarification",
        message: "I need a valid positive amount before I can prepare that transfer."
      };
    }

    const recipientEmail =
      input.draft.recipientEmail ?? input.resolvedCounterparty?.email;
    if (!recipientEmail) {
      return {
        status: "needs_clarification",
        message:
          "I need to know which recipient you mean before I can prepare that transfer."
      };
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
        recipient: {
          email: recipientEmail,
          firstName: "Alex",
          lastName: "Example",
          displayName: "Alex Example",
          verified: true
        },
        amountDetails: {
          value: input.draft.amount,
          currency: "ILS",
          formatted: `₪${input.draft.amount}`
        },
        reason: input.draft.reason ?? null,
        warnings: [],
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        confirmAction: {
          method: "POST",
          path: "/api/ai/confirmations/pending-transfer-1",
          body: {
            action: "confirm",
            version: 1
          }
        },
        denyAction: {
          method: "POST",
          path: "/api/ai/confirmations/pending-transfer-1",
          body: {
            action: "deny",
            version: 1
          }
        }
      }
    };
  };
}

export function createTransferModificationService(): TransferModificationService {
  return async (input) => {
    const recipientEmail =
      input.modificationDraft.recipientEmail ??
      input.resolvedCounterparty?.email ??
      "alex@example.com";
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
        recipient: {
          email: recipientEmail,
          firstName: "Alex",
          lastName: "Example",
          displayName: "Alex Example",
          verified: true
        },
        amountDetails: {
          value: amount,
          currency: "ILS",
          formatted: `₪${amount}`
        },
        reason: input.modificationDraft.reason ?? null,
        warnings: [],
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        supersedesId: input.activePendingTransferId,
        confirmAction: {
          method: "POST",
          path: "/api/ai/confirmations/pending-transfer-2",
          body: {
            action: "confirm",
            version: 1
          }
        },
        denyAction: {
          method: "POST",
          path: "/api/ai/confirmations/pending-transfer-2",
          body: {
            action: "deny",
            version: 1
          }
        }
      }
    };
  };
}
