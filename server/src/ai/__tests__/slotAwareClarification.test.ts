

import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";
import { runAssistantGraph } from "../graph.js";
import type {
  AssistantLlmProvider,
  ConversationContext,
  ConversationSaveInput,
  ConversationStore,
  CounterpartyMemory,
  TransferPreparationService
} from "../state.js";

const USER_ID = "507f1f77bcf86cd799439011";

function createStore(
  memory: CounterpartyMemory
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
      return { intent: "transfer_prepare" };
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

const neverReadyPreparationService: TransferPreparationService = async () => ({
  status: "needs_clarification",
  message: "I need a valid positive amount before I can prepare that transfer."
});

test("amount-resolution failure with a known frame recipient asks only the amount (F5)", async () => {
  const store = createStore({
    ...createEmptyCounterpartyMemory(),
    transferIntentFrame: {
      status: "building",
      recipient: { email: "shai@example.com", resolvedAtTurn: 1 },
      lastUpdatedTurn: 1
    }
  });

  const provider = fakeProvider({
    async extractTransferDraft() {
      // A reference the deterministic resolver cannot satisfy (no pending card).
      return { amountReferenceText: "double it" };
    }
  });

  const result = await runAssistantGraph(
    { userId: USER_ID, conversationId: "f5-known-recipient", message: "double it" },
    {
      conversationStore: store,
      llmProvider: provider,
      transferPreparationService: neverReadyPreparationService
    }
  );

  expect(result.clarification).toBeTruthy();
  expect(result.clarification?.expectedReplyType).toBe("amount");
  expect(result.clarification?.message ?? "").toMatch(/shai@example\.com/);
  // It must NOT drop both slots ("whom and how much?").
  expect(result.clarification?.message ?? "").not.toMatch(/whom|to whom|ובאיזה סכום/i);
  expect(result.confirmation).toBeUndefined();
});

test("missing recipient with a known amount asks only the recipient", async () => {
  const store = createStore(createEmptyCounterpartyMemory());

  const provider = fakeProvider({
    async extractTransferDraft() {
      return {
        amount: 25,
        currency: "ILS",
        currencyMentioned: true,
        currencySupported: true
      };
    }
  });

  const result = await runAssistantGraph(
    { userId: USER_ID, conversationId: "missing-recipient-known-amount", message: "send 25 shekels" },
    {
      conversationStore: store,
      llmProvider: provider,
      transferPreparationService: neverReadyPreparationService
    }
  );

  expect(result.clarification).toBeTruthy();
  expect(result.clarification?.expectedReplyType).toBe("recipient");
  expect(result.clarification?.message ?? "").toMatch(/25/);
  // It must ask only for the recipient, not also for the amount.
  expect(result.clarification?.message ?? "").not.toMatch(/how much|ובאיזה סכום/i);
  expect(result.confirmation).toBeUndefined();
});
