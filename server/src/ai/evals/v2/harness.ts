

/**
 * Drives a {@link V2Scenario} through the assistant, turn by turn, with the live
 * LLM as the only live dependency. Conversation memory + tools + transfer
 * services are DB-free fakes so multi-turn context is exercised purely in-process.
 *
 * `runAssistantUnderTest` is the single indirection point: today it calls the
 * current graph; when the V2 graph ships behind `VIRLY_AI_GRAPH_VERSION`, only
 * this function changes and the whole suite re-targets v2.
 */
import { runAssistantGraph } from "../../graph.js";
import { trimConversationMessages } from "../../counterpartyMemory.js";
import {
  parseAmountExpression,
  resolveTurnDeltaAmount
} from "../../amountResolution.js";
import type { AssistantId } from "../../assistants.js";
import type {
  AmountResolutionService,
  AssistantLlmProvider,
  ConversationContext,
  ConversationSaveInput,
  ConversationStore,
  RunAssistantInput,
  RunAssistantOptions,
  RunAssistantResult
} from "../../state.js";
import {
  createMemoryWithCounterparties,
  createTransferModificationService,
  createTransferPreparationService
} from "../support.js";
import { WORLD, worldCounterpartyEmails } from "./world.js";
import { createV2WorldTools } from "./worldTools.js";
import type { V2Scenario, V2TurnExpectation } from "./types.js";

/**
 * Memory-only contextual amount resolver (no Mongo). Mirrors the deterministic
 * eval service: it values a parsed amount expression from bases already present
 * in conversation memory (totals/pending/discussed), so "the same I sent Dan"
 * resolves iff that figure was surfaced earlier in the conversation.
 */
export const dbFreeAmountResolutionService: AmountResolutionService = async (
  input
) => {
  const refText = input.transferDraft.amountReferenceText?.trim();
  if (!refText) {
    return { status: "unresolved", reason: "no_reference_text" };
  }
  const expr = parseAmountExpression(refText);
  if (!expr) {
    return { status: "unresolved", reason: "unparsed_reference" };
  }
  const value = resolveTurnDeltaAmount(
    input.counterpartyMemory,
    expr,
    input.resolvedCounterparty?.email
  );
  if (value == null) {
    return { status: "unresolved", reason: "no_base_in_memory" };
  }
  return {
    status: "resolved",
    amount: {
      amount: value,
      currency: "ILS",
      source: "discussed_amount",
      confidence: "high",
      explanation: "Resolved from world memory base."
    }
  };
};

function createSeededStore(emails: string[]): ConversationStore {
  let context: ConversationContext = {
    messages: [],
    memory: createMemoryWithCounterparties(emails)
  };
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

/** The single entrypoint indirection for the V1 -> V2 cutover. */
export function runAssistantUnderTest(
  input: RunAssistantInput,
  options: RunAssistantOptions
): Promise<RunAssistantResult> {
  return runAssistantGraph(input, options);
}

export type V2TurnRun = {
  index: number;
  expectation: V2TurnExpectation;
  result: RunAssistantResult;
};

export async function runScenarioLive(
  scenario: V2Scenario,
  assistantId: AssistantId,
  llmProvider: AssistantLlmProvider
): Promise<V2TurnRun[]> {
  const store = createSeededStore(
    scenario.seedCounterparties ?? worldCounterpartyEmails()
  );
  const tools = createV2WorldTools();
  const transferPreparationService = createTransferPreparationService();
  const transferModificationService = createTransferModificationService();
  const conversationId = `v2-${scenario.id}-${assistantId}`;
  const runs: V2TurnRun[] = [];

  for (const [index, expectation] of scenario.turns.entries()) {
    const result = await runAssistantUnderTest(
      {
        userId: WORLD.userId,
        conversationId,
        assistantId,
        message: expectation.userMessage
      },
      {
        tools,
        conversationStore: store,
        llmProvider,
        amountResolutionService: dbFreeAmountResolutionService,
        transferPreparationService,
        transferModificationService
      }
    );
    runs.push({ index, expectation, result });
  }

  return runs;
}
