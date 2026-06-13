import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { createEmptyCounterpartyMemory } from "./counterpartyMemory.js";
import { runAssistantGraph } from "./graph.js";
import type {
  AssistantIntent,
  AssistantLlmProvider,
  ConversationContext,
  ConversationSaveInput,
  ConversationStore,
  CounterpartyMemory,
  PendingConfirmationMemory,
  TransferDraftExtraction,
  TransferModificationService,
  TransferPreparationService,
  TurnDelta
} from "./state.js";

/**
 * The exact failing dialogue from docs/ai-context-resolution-plan.md, resolved
 * end-to-end. The model (fake provider) only supplies references/expressions
 * via resolveTurnContext; deterministic code produces every money value and
 * validates every recipient. The anchor is a pending transfer of 62.41 ILS.
 */

const USER_ID = "507f1f77bcf86cd799439011";
const SGA_EMAIL = "sga@thunder.com";
const DENI_EMAIL = "deni@trailblazers.com";
const ANCHOR_AMOUNT = 62.41;

function pendingConfirmation(
  recipientEmail: string,
  amount: number
): PendingConfirmationMemory {
  return {
    confirmationId: "pending-anchor",
    type: "transfer",
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    recipientEmail,
    amount,
    currency: "ILS",
    turnCreated: 1,
    version: 1
  };
}

/**
 * Anchor memory: a pending card to `recipientEmail` for `amount`, a matching
 * pending_confirmation frame, and a "received from sga = 62.41" total so the
 * F2 amount reference resolves deterministically.
 */
function anchorMemory(recipientEmail: string, amount: number): CounterpartyMemory {
  return {
    ...createEmptyCounterpartyMemory(),
    mode: "transfer_confirmation_pending",
    pendingConfirmation: pendingConfirmation(recipientEmail, amount),
    transferIntentFrame: {
      status: "pending_confirmation",
      recipient: { email: recipientEmail, resolvedAtTurn: 1 },
      amount: { value: amount, currency: "ILS", resolvedAtTurn: 1 },
      lastUpdatedTurn: 1
    },
    entities: [
      {
        id: "total:received:sga@thunder.com",
        type: "total",
        turnIntroduced: 1,
        turnLastReferenced: 1,
        source: "tool_result",
        confidence: "high",
        counterpartyEmail: SGA_EMAIL,
        direction: "received",
        amount: ANCHOR_AMOUNT,
        currency: "ILS",
        aliases: []
      }
    ]
  };
}

function createStore(
  memory: CounterpartyMemory
): ConversationStore & { saved: ConversationSaveInput[] } {
  let context: ConversationContext = {
    messages: [new HumanMessage("anchor"), new AIMessage("anchor reply")],
    memory
  };
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

function provider(config: {
  intent: AssistantIntent;
  delta: TurnDelta;
  extracted?: TransferDraftExtraction;
}): AssistantLlmProvider {
  return {
    async classifyIntent() {
      return { intent: config.intent };
    },
    async extractTransferDraft() {
      return config.extracted ?? {};
    },
    async resolveCounterpartyReference() {
      return { kind: "none", confidence: "low" };
    },
    async composeResponse(input) {
      return input.fallbackMessage;
    },
    async resolveTurnContext() {
      return config.delta;
    }
  };
}

function confirmationFor(recipientEmail: string, amount: number, version: number) {
  return {
    id: `pending-${version}`,
    version,
    type: "transfer" as const,
    status: "pending" as const,
    recipientEmail,
    recipientFirstName: null,
    recipientLastName: null,
    amount,
    currency: "ILS" as const,
    recipient: {
      email: recipientEmail,
      firstName: null,
      lastName: null,
      displayName: recipientEmail,
      verified: true
    },
    amountDetails: { value: amount, currency: "ILS" as const, formatted: `₪${amount}` },
    reason: null,
    warnings: [],
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    confirmAction: {
      method: "POST" as const,
      path: `/api/ai/confirmations/pending-${version}`,
      body: { action: "confirm" as const, version }
    },
    denyAction: {
      method: "POST" as const,
      path: `/api/ai/confirmations/pending-${version}`,
      body: { action: "deny" as const, version }
    }
  };
}

const preparationService: TransferPreparationService = async (input) => {
  const recipientEmail =
    input.draft.recipientEmail ?? input.resolvedCounterparty?.email;
  if (!recipientEmail || !input.draft.amount) {
    return { status: "needs_clarification", message: "missing details" };
  }
  return {
    status: "ready",
    confirmation: confirmationFor(recipientEmail, input.draft.amount, 1)
  };
};

const modificationService: TransferModificationService = async (input) => {
  const recipientEmail =
    input.modificationDraft.recipientEmail ?? input.resolvedCounterparty?.email;
  if (!recipientEmail || !input.modificationDraft.amount) {
    return { status: "needs_clarification", message: "missing details" };
  }
  return {
    status: "ready",
    supersededConfirmationId: input.activePendingTransferId,
    confirmation: confirmationFor(recipientEmail, input.modificationDraft.amount, 2)
  };
};

test('"double it" doubles the pending amount and keeps the recipient', async () => {
  const result = await runAssistantGraph(
    { userId: USER_ID, conversationId: "scenario-double", message: "double it" },
    {
      conversationStore: createStore(anchorMemory(SGA_EMAIL, ANCHOR_AMOUNT)),
      llmProvider: provider({
        intent: "transfer_modify_pending",
        delta: {
          action: "modify_amount",
          amountRef: {
            kind: "reference",
            expr: { base: "pending_amount", op: "mul", operand: 2 }
          },
          confidence: "high"
        }
      }),
      transferPreparationService: preparationService,
      transferModificationService: modificationService
    }
  );

  assert.equal(result.confirmation?.recipientEmail, SGA_EMAIL);
  assert.equal(result.confirmation?.amount, 124.82);
});

test('"send this to deni" reuses the pending amount for the new recipient', async () => {
  const result = await runAssistantGraph(
    {
      userId: USER_ID,
      conversationId: "scenario-this",
      message: `send this to ${DENI_EMAIL}`
    },
    {
      conversationStore: createStore(anchorMemory(SGA_EMAIL, ANCHOR_AMOUNT)),
      llmProvider: provider({
        intent: "transfer_prepare",
        delta: {
          action: "new_transfer",
          recipientRef: { kind: "explicit_email", email: DENI_EMAIL },
          amountRef: { kind: "reference", expr: { base: "pending_amount" } },
          confidence: "high"
        }
      }),
      transferPreparationService: preparationService,
      transferModificationService: modificationService
    }
  );

  assert.equal(result.confirmation?.recipientEmail, DENI_EMAIL);
  assert.equal(result.confirmation?.amount, ANCHOR_AMOUNT);
});

test('"the same amount sga sent me" keeps the active recipient deni (F2)', async () => {
  const result = await runAssistantGraph(
    {
      userId: USER_ID,
      conversationId: "scenario-f2",
      message: `the same amount ${SGA_EMAIL} sent me`
    },
    {
      conversationStore: createStore(anchorMemory(DENI_EMAIL, ANCHOR_AMOUNT)),
      llmProvider: provider({
        intent: "transfer_prepare",
        // The deterministic extractor grabs the only email (sga) as recipient;
        // the resolver must override it back to the active recipient (deni).
        extracted: { recipientEmail: SGA_EMAIL },
        delta: {
          action: "modify_amount",
          amountRef: {
            kind: "reference",
            expr: { base: "last_received_from" },
            sourceCounterparty: { email: SGA_EMAIL }
          },
          confidence: "high"
        }
      }),
      transferPreparationService: preparationService,
      transferModificationService: modificationService
    }
  );

  assert.equal(result.confirmation?.recipientEmail, DENI_EMAIL);
  assert.equal(result.confirmation?.amount, ANCHOR_AMOUNT);
});

test('"the amount we discussed" resolves to the anchor amount', async () => {
  const result = await runAssistantGraph(
    {
      userId: USER_ID,
      conversationId: "scenario-discussed",
      message: "the amount we discussed"
    },
    {
      conversationStore: createStore(anchorMemory(SGA_EMAIL, ANCHOR_AMOUNT)),
      llmProvider: provider({
        intent: "transfer_prepare",
        delta: {
          action: "modify_amount",
          amountRef: { kind: "reference", expr: { base: "discussed_amount" } },
          confidence: "high"
        }
      }),
      transferPreparationService: preparationService,
      transferModificationService: modificationService
    }
  );

  assert.equal(result.confirmation?.amount, ANCHOR_AMOUNT);
});

test("an unresolvable amount reference self-corrects in one repair pass", async () => {
  const memory: CounterpartyMemory = {
    ...createEmptyCounterpartyMemory(),
    entities: [
      {
        id: "total:received:sga@thunder.com",
        type: "total",
        turnIntroduced: 1,
        turnLastReferenced: 1,
        source: "tool_result",
        confidence: "high",
        counterpartyEmail: SGA_EMAIL,
        direction: "received",
        amount: ANCHOR_AMOUNT,
        currency: "ILS",
        aliases: []
      }
    ]
  };

  let resolveCalls = 0;
  const repairingProvider: AssistantLlmProvider = {
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
    async resolveTurnContext(input) {
      resolveCalls += 1;
      // First attempt names a base that cannot be valued (no pending card);
      // the repair pass (with repairError set) names the discussed amount.
      const base = input.repairError ? "discussed_amount" : "pending_amount";
      return {
        action: "new_transfer",
        recipientRef: { kind: "explicit_email", email: DENI_EMAIL },
        amountRef: { kind: "reference", expr: { base } },
        confidence: "high"
      };
    }
  };

  const result = await runAssistantGraph(
    {
      userId: USER_ID,
      conversationId: "scenario-repair",
      message: `send the discussed amount to ${DENI_EMAIL}`
    },
    {
      conversationStore: createStore(memory),
      llmProvider: repairingProvider,
      transferPreparationService: preparationService,
      transferModificationService: modificationService
    }
  );

  assert.equal(resolveCalls, 2);
  assert.equal(result.confirmation?.recipientEmail, DENI_EMAIL);
  assert.equal(result.confirmation?.amount, ANCHOR_AMOUNT);
});

test("a failing resolveTurnContext falls back to deterministic extraction", async () => {
  const failingProvider: AssistantLlmProvider = {
    async classifyIntent() {
      return { intent: "transfer_prepare" };
    },
    async extractTransferDraft() {
      return {
        recipientEmail: "alex@example.com",
        amount: 10,
        currency: "ILS",
        currencyMentioned: true,
        currencySupported: true
      };
    },
    async resolveCounterpartyReference() {
      return { kind: "none", confidence: "low" };
    },
    async composeResponse(input) {
      return input.fallbackMessage;
    },
    async resolveTurnContext() {
      throw new Error("resolver unavailable");
    }
  };

  const result = await runAssistantGraph(
    {
      userId: USER_ID,
      conversationId: "scenario-fallback",
      message: "send alex@example.com 10 shekels"
    },
    {
      conversationStore: createStore(createEmptyCounterpartyMemory()),
      llmProvider: failingProvider,
      transferPreparationService: preparationService,
      transferModificationService: modificationService
    }
  );

  // The deterministic extraction stands when the resolver fails.
  assert.equal(result.confirmation?.recipientEmail, "alex@example.com");
  assert.equal(result.confirmation?.amount, 10);
});
