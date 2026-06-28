
import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyCounterpartyMemory,
  createEmptyTransferIntentFrame,
  normalizeCounterpartyMemory
} from "../counterpartyMemory.js";
import { runAssistantGraph } from "../graph.js";
import type {
  AssistantLlmProvider,
  ConversationContext,
  ConversationSaveInput,
  ConversationStore,
  CounterpartyMemory,
  TransferIntentFrame,
  TransferModificationService,
  TransferPreparationService
} from "../state.js";

const USER_ID = "507f1f77bcf86cd799439011";

function createStore(
  memory: CounterpartyMemory = createEmptyCounterpartyMemory()
): ConversationStore & { saved: ConversationSaveInput[] } {
  let context: ConversationContext = { messages: [], memory };
  const saved: ConversationSaveInput[] = [];
  return {
    saved,
    async load() {
      return context;
    },
    async save(input) {
      saved.push(input);
      context = { messages: input.messages, memory: input.memory };
    }
  };
}

function fakeProvider(
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

function echoPreparationService(): TransferPreparationService {
  return async (input) => {
    const recipientEmail =
      input.draft.recipientEmail ?? input.resolvedCounterparty?.email;
    if (!recipientEmail || !input.draft.amount) {
      return { status: "needs_clarification", message: "missing details" };
    }
    const amount = input.draft.amount;
    return {
      status: "ready",
      confirmation: {
        id: "pending-1",
        version: 1,
        type: "transfer",
        status: "pending",
        recipientEmail,
        recipientFirstName: null,
        recipientLastName: null,
        amount,
        currency: "ILS",
        recipient: {
          email: recipientEmail,
          firstName: null,
          lastName: null,
          displayName: recipientEmail,
          verified: true
        },
        amountDetails: { value: amount, currency: "ILS", formatted: `₪${amount}` },
        reason: null,
        warnings: [],
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        confirmAction: {
          method: "POST",
          path: "/api/ai/confirmations/pending-1",
          body: { action: "confirm", version: 1 }
        },
        denyAction: {
          method: "POST",
          path: "/api/ai/confirmations/pending-1",
          body: { action: "deny", version: 1 }
        }
      }
    };
  };
}

function echoModificationService(): TransferModificationService {
  return async (input) => {
    const recipientEmail =
      input.modificationDraft.recipientEmail ?? input.resolvedCounterparty?.email;
    const amount = input.modificationDraft.amount;
    if (!recipientEmail || !amount) {
      return { status: "needs_clarification", message: "missing details" };
    }
    return {
      status: "ready",
      supersededConfirmationId: input.activePendingTransferId,
      confirmation: {
        id: "pending-2",
        version: 2,
        type: "transfer",
        status: "pending",
        recipientEmail,
        recipientFirstName: null,
        recipientLastName: null,
        amount,
        currency: "ILS",
        recipient: {
          email: recipientEmail,
          firstName: null,
          lastName: null,
          displayName: recipientEmail,
          verified: true
        },
        amountDetails: { value: amount, currency: "ILS", formatted: `₪${amount}` },
        reason: null,
        warnings: [],
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        confirmAction: {
          method: "POST",
          path: "/api/ai/confirmations/pending-2",
          body: { action: "confirm", version: 2 }
        },
        denyAction: {
          method: "POST",
          path: "/api/ai/confirmations/pending-2",
          body: { action: "deny", version: 2 }
        }
      }
    };
  };
}

test("normalizeCounterpartyMemory deserializes an absent frame as idle (additive)", () => {
  const legacy = {
    turn: 3,
    mentionedCounterparties: []
  };

  const normalized = normalizeCounterpartyMemory(legacy);

  assert.deepEqual(
    normalized.transferIntentFrame,
    createEmptyTransferIntentFrame()
  );
  assert.equal(normalized.transferIntentFrame?.status, "idle");
});

test("normalizeCounterpartyMemory round-trips a populated frame", () => {
  const frame: TransferIntentFrame = {
    status: "pending_confirmation",
    recipient: { email: "sga@thunder.com", resolvedAtTurn: 1 },
    amount: { value: 62.41, currency: "ILS", resolvedAtTurn: 1 },
    lastUpdatedTurn: 1
  };

  const normalized = normalizeCounterpartyMemory({
    turn: 1,
    mentionedCounterparties: [],
    transferIntentFrame: frame
  });

  assert.equal(normalized.transferIntentFrame?.status, "pending_confirmation");
  assert.equal(normalized.transferIntentFrame?.recipient?.email, "sga@thunder.com");
  assert.equal(normalized.transferIntentFrame?.amount?.value, 62.41);
  assert.equal(normalized.transferIntentFrame?.lastUpdatedTurn, 1);
});

test("a transfer-intent slot set on turn 1 survives to turn 2", async () => {
  const store = createStore();
  const provider = fakeProvider({
    async classifyIntent(input) {
      return /what can you do/i.test(input.userMessage)
        ? { intent: "general_help" }
        : { intent: "transfer_prepare" };
    },
    async extractTransferDraft() {
      return {
        recipientEmail: "alex@example.com",
        amount: 25,
        currency: "ILS",
        currencyMentioned: true,
        currencySupported: true
      };
    }
  });

  await runAssistantGraph(
    { userId: USER_ID, conversationId: "frame-survives", message: "send alex@example.com 25 shekels" },
    {
      conversationStore: store,
      llmProvider: provider,
      transferPreparationService: echoPreparationService()
    }
  );

  const frameAfterTurn1 = store.saved.at(-1)?.memory.transferIntentFrame;
  assert.equal(frameAfterTurn1?.status, "pending_confirmation");
  assert.equal(frameAfterTurn1?.recipient?.email, "alex@example.com");
  assert.equal(frameAfterTurn1?.amount?.value, 25);

  // Turn 2: an unrelated non-transfer turn must not erase the frame.
  await runAssistantGraph(
    { userId: USER_ID, conversationId: "frame-survives", message: "what can you do?" },
    {
      conversationStore: store,
      llmProvider: provider,
      transferPreparationService: echoPreparationService()
    }
  );

  const frameAfterTurn2 = store.saved.at(-1)?.memory.transferIntentFrame;
  assert.equal(frameAfterTurn2?.recipient?.email, "alex@example.com");
  assert.equal(frameAfterTurn2?.amount?.value, 25);
});

test('changing the recipient keeps the established amount from the frame', async () => {
  const store = createStore();
  const provider = fakeProvider({
    async classifyIntent() {
      return { intent: "transfer_prepare" };
    },
    async extractTransferDraft(input) {
      if (/rani/i.test(input.userMessage)) {
        return { recipientEmail: "rani@example.com" };
      }
      return {
        recipientEmail: "alex@example.com",
        amount: 25,
        currency: "ILS",
        currencyMentioned: true,
        currencySupported: true
      };
    }
  });

  // Turn 1: prepare 25 to alex (creates the pending card + frame).
  const first = await runAssistantGraph(
    { userId: USER_ID, conversationId: "change-recipient", message: "send alex@example.com 25 shekels" },
    {
      conversationStore: store,
      llmProvider: provider,
      transferPreparationService: echoPreparationService()
    }
  );
  assert.equal(first.confirmation?.recipientEmail, "alex@example.com");
  assert.equal(first.confirmation?.amount, 25);

  // Turn 2: change only the recipient — the amount is inherited from the frame.
  const second = await runAssistantGraph(
    { userId: USER_ID, conversationId: "change-recipient", message: "actually send it to rani@example.com instead" },
    {
      conversationStore: store,
      llmProvider: provider,
      transferPreparationService: echoPreparationService(),
      transferModificationService: echoModificationService()
    }
  );

  assert.equal(second.confirmation?.recipientEmail, "rani@example.com");
  assert.equal(second.confirmation?.amount, 25);
});
