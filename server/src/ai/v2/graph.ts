/**
 * Graph v2 — the LLM-first agent loop (design §4).
 *
 *   prepare → agent ⇄ tools → finalize → persist
 *
 * The agent reasons over the whole thread, calls read-only tools (and the
 * money-proposing tools that only *prepare* a card), and answers. The entry owns
 * the `conversationStore` I/O: it restores the thread + memory, runs the loop,
 * assembles the `RunAssistantResult`, and persists a compact transcript.
 *
 * Phase 5 (transfer execution via interrupt/resume) is NOT wired: the money tools
 * build cards only; nothing here reaches `executeTransferWithSession`.
 */
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";

import { DEFAULT_ASSISTANT_ID } from "../assistants.js";
import type { AssistantId } from "../assistants.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";
import { assistantResponseFormatVersion } from "../responseBlocks.js";
import { readOnlyToolExecutors } from "../tools/index.js";
import {
  modifyAiPendingTransfer,
  prepareAiPendingTransfer
} from "../../services/aiPendingTransfer.service.js";
import type {
  CounterpartyMemory,
  RunAssistantInput,
  RunAssistantOptions,
  RunAssistantResult
} from "../state.js";

import { buildAgentNode } from "./agent.js";
import { aiToolCalls } from "./messages.js";
import {
  resolveLongTermStore,
  readConversationSummary,
  saveConversationSummary,
  upsertInteractedCounterparties,
  withLongTermCounterparties
} from "./memory/loop.js";
import {
  foldRollingSummary,
  SUMMARY_BUDGET_MESSAGES,
  trimToWindow
} from "./memory/summary.js";
import { createV2ChatModel, isV2ModelConfigured } from "./model.js";
import { finalizeNode } from "./nodes/finalize.js";
import { persistNode } from "./nodes/persist.js";
import { prepareNode } from "./nodes/prepare.js";
import { V2AgentState, type V2AgentStateType } from "./state.js";
import type { V2Configurable, V2TurnOutcome } from "./toolContext.js";
import { createV2ToolNode } from "./tools/index.js";
import {
  buildKnownCounterparties,
  collectCalledToolNames,
  deriveIntent,
  detectLocale,
  mapReadToolNames,
  pendingFromConfirmation
} from "./turn.js";

const V2_TIMEZONE = "Asia/Jerusalem";

function routeAgent(state: V2AgentStateType): "tools" | "finalize" {
  // aiToolCalls matches AIMessageChunk too (streaming-robust; see ./messages.ts).
  return aiToolCalls(state.messages.at(-1)).length > 0 ? "tools" : "finalize";
}


function buildGraph() {
  const model = createV2ChatModel();
  return new StateGraph(V2AgentState)
    .addNode("prepare", prepareNode)
    .addNode("agent", buildAgentNode(model))
    .addNode("tools", createV2ToolNode())
    .addNode("finalize", finalizeNode)
    .addNode("persist", persistNode)
    .addEdge(START, "prepare")
    .addEdge("prepare", "agent")
    .addConditionalEdges("agent", routeAgent, {
      tools: "tools",
      finalize: "finalize"
    })
    .addEdge("tools", "agent")
    .addEdge("finalize", "persist")
    .addEdge("persist", END)
    .compile();
}

let cachedGraph: ReturnType<typeof buildGraph> | undefined;

function getGraph() {
  if (!cachedGraph) {
    cachedGraph = buildGraph();
  }
  return cachedGraph;
}

export const assistantGraphV2 = getGraph();


function gracefulText(locale: "he" | "en" | "mixed" | "unknown"): string {
  return locale === "he"
    ? "מצטער, לא הצלחתי לעבד את הבקשה כרגע. נסה שוב עוד רגע."
    : "Sorry, I couldn't process that just now. Please try again shortly.";
}

function fallbackResult(
  input: RunAssistantInput,
  assistantId: AssistantId,
  message: string
): RunAssistantResult {
  return {
    message,
    responseMessage: message,
    responseFormatVersion: assistantResponseFormatVersion,
    conversationId: input.conversationId,
    assistantId,
    intent: "unsupported",
    toolCalls: [],
    toolResults: []
  };
}

export async function runAssistantGraphV2(
  input: RunAssistantInput,
  options: RunAssistantOptions = {}
): Promise<RunAssistantResult> {
  const assistantId = input.assistantId ?? DEFAULT_ASSISTANT_ID;
  const locale = detectLocale(input.message);

  // The agent needs a configured model to act; without a key, degrade gracefully.
  if (!isV2ModelConfigured()) {
    return fallbackResult(input, assistantId, gracefulText(locale));
  }

  // Default to the real DB executors/services for the production route (which
  // doesn't inject them); the conformance harness injects DB-free fakes instead.
  const executors = options.tools ?? readOnlyToolExecutors;
  const transferPreparationService =
    options.transferPreparationService ?? prepareAiPendingTransfer;
  const transferModificationService =
    options.transferModificationService ?? modifyAiPendingTransfer;

  const userId = input.userId ?? "";
  const store = options.conversationStore;
  const loaded = store
    ? await store.load(userId, input.conversationId)
    : { messages: [], memory: createEmptyCounterpartyMemory() };
  const memory = loaded.memory ?? createEmptyCounterpartyMemory();
  const priorMessages = loaded.messages ?? [];

  // Phase 6: long-term memory + rolling summary (all no-ops without a store).
  const longTermStore = resolveLongTermStore();
  const priorSummary = longTermStore
    ? await readConversationSummary(longTermStore, userId, input.conversationId)
    : undefined;
  const folded =
    priorMessages.length > SUMMARY_BUDGET_MESSAGES
      ? await foldRollingSummary(priorMessages, priorSummary, createV2ChatModel())
      : { runningSummary: priorSummary, recentMessages: priorMessages };
  const knownCounterparties = await withLongTermCounterparties(
    longTermStore,
    userId,
    buildKnownCounterparties(memory)
  );

  const turnOutcome: V2TurnOutcome = { uiBlocks: [] };
  const configurable: V2Configurable = {
    userId,
    conversationId: input.conversationId,
    assistantId,
    message: input.message,
    now: new Date(),
    timezone: V2_TIMEZONE,
    locale,
    executors,
    transferPreparationService,
    transferModificationService,
    pendingConfirmation: memory.pendingConfirmation ?? null,
    turnOutcome,
    knownCounterparties,
    runningSummary: folded.runningSummary
  };

  const turnMessage = new HumanMessage(input.message);
  let finalState: V2AgentStateType;
  try {
    finalState = (await getGraph().invoke(
      { messages: [...folded.recentMessages, turnMessage] },
      { configurable, recursionLimit: 25 }
    )) as V2AgentStateType;
  } catch {
    return fallbackResult(input, assistantId, gracefulText(locale));
  }

  const responseMessage =
    finalState.responseMessage?.trim() || gracefulText(locale);
  const calledToolNames = collectCalledToolNames(finalState.messages);
  const toolCalls = mapReadToolNames(calledToolNames);
  const intent = deriveIntent(turnOutcome);

  if (store) {
    const nextTurn = (memory.turn ?? 0) + 1;
    const nextPending = turnOutcome.confirmation
      ? pendingFromConfirmation(turnOutcome.confirmation, nextTurn)
      : turnOutcome.supersededConfirmationId
        ? null
        : (memory.pendingConfirmation ?? null);
    const nextMemory: CounterpartyMemory = {
      ...memory,
      turn: nextTurn,
      pendingConfirmation: nextPending
    };
    // Persist a compact, OpenAI-valid, BOUNDED transcript (recent window + this
    // turn's user + final assistant text); never raw tool round-trips.
    await store.save({
      userId,
      conversationId: input.conversationId,
      assistantId,
      messages: trimToWindow([
        ...folded.recentMessages,
        turnMessage,
        new AIMessage(responseMessage)
      ]),
      memory: nextMemory
    });

    // Phase 6: persist long-term memory (counterparties + rolling summary).
    if (longTermStore) {
      await upsertInteractedCounterparties(longTermStore, userId, nextMemory);
      if (folded.runningSummary) {
        await saveConversationSummary(
          longTermStore,
          userId,
          input.conversationId,
          folded.runningSummary
        );
      }
    }
  }

  if (userId && options.auditLogger) {
    await options.auditLogger({
      userId,
      conversationId: input.conversationId,
      requestId: input.requestId,
      assistantId,
      intent,
      toolsRequested: toolCalls,
      toolsExecuted: toolCalls,
      diagnostics: []
    });
  }

  return {
    message: responseMessage,
    responseMessage,
    responseFormatVersion: assistantResponseFormatVersion,
    ...(turnOutcome.uiBlocks.length > 0 ? { responseBlocks: turnOutcome.uiBlocks } : {}),
    conversationId: input.conversationId,
    assistantId,
    intent,
    toolCalls,
    toolResults: toolCalls.map((toolName) => ({ toolName, status: "ok" as const })),
    ...(turnOutcome.clarification ? { clarification: turnOutcome.clarification } : {}),
    ...(turnOutcome.confirmation ? { confirmation: turnOutcome.confirmation } : {}),
    ...(turnOutcome.supersededConfirmationId
      ? { supersededConfirmationId: turnOutcome.supersededConfirmationId }
      : {})
  };
}
