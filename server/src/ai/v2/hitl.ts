/**
 * Human-in-the-loop transfer path (design §8 / Phase 5).
 *
 * The resumable graph is the single v2 execution path:
 *
 *   prepare → summarize → agent ⇄ tools → finalize → (card? transferGate : persist)
 *   tools → summarize → agent  (summarize runs before every agent call)
 *   transferGate --interrupt--> [Confirm → executeTransfer | Deny] → persist
 *
 * It is compiled WITH a checkpointer so `interrupt()` can pause on a prepared
 * card and `Command({ resume })` can continue later from the authenticated
 * confirmation endpoint. This is the ONLY v2 graph: it is used by both the
 * production HITL flow and the conformance/eval harness (via runAssistant).
 */
import { HumanMessage } from "@langchain/core/messages";
import {
  END,
  MemorySaver,
  START,
  StateGraph,
  type BaseCheckpointSaver,
  type LangGraphRunnableConfig
} from "@langchain/langgraph";
import mongoose from "mongoose";

import { DEFAULT_ASSISTANT_ID } from "../assistants.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";
import { assistantResponseFormatVersion } from "../responseBlocks.js";
import { readOnlyToolExecutors } from "../tools/index.js";
import {
  modifyAiPendingTransfer,
  prepareAiPendingTransfer,
  respondToAiPendingTransfer
} from "../../services/aiPendingTransfer.service.js";
import type {
  RunAssistantInput,
  RunAssistantOptions,
  RunAssistantResult
} from "../state.js";

import { config } from "../../config.js";
import type { CommunicationProfile } from "../../domain/communicationProfile.js";
import { communicationProfileService } from "../../services/communicationProfile.service.js";
import { buildAgentNode } from "./agent.js";
import { aiToolCalls } from "./messages.js";
import { createMongoCheckpointer, getPostgresCheckpointer } from "./memory/checkpointer.js";
import {
  resolveLongTermStore,
  upsertInteractedCounterparties,
  withLongTermCounterparties
} from "./memory/loop.js";
import { mapStreamChunk } from "./streamEvents.js";
import { createV2ChatModel, isV2ModelConfigured } from "./model.js";
import { executeTransferNode } from "./nodes/executeTransfer.js";
import { finalizeNode } from "./nodes/finalize.js";
import { persistNode } from "./nodes/persist.js";
import { prepareNode } from "./nodes/prepare.js";
import { buildSummarizationNode } from "./nodes/summarize.js";
import { transferGateNode, type TransferResumePayload } from "./nodes/transferGate.js";
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
  // aiToolCalls matches AIMessageChunk too; under streaming the agent message is
  // a chunk, and `instanceof AIMessage` would wrongly route tool calls to finalize.
  return aiToolCalls(state.messages.at(-1)).length > 0 ? "tools" : "finalize";
}

/** After finalize, a prepared card pauses for human confirmation; else we're done. */
function routeAfterFinalize(state: V2AgentStateType): "transferGate" | "persist" {
  return state.confirmation ? "transferGate" : "persist";
}

export function buildResumableGraph(checkpointer: BaseCheckpointSaver) {
  const model = createV2ChatModel();
  return new StateGraph(V2AgentState)
    .addNode("prepare", prepareNode)
    .addNode("summarize", buildSummarizationNode(model))
    .addNode("agent", buildAgentNode(model))
    .addNode("tools", createV2ToolNode())
    .addNode("finalize", finalizeNode)
    .addNode("transferGate", transferGateNode, { ends: ["executeTransfer", "persist"] })
    .addNode("executeTransfer", executeTransferNode)
    .addNode("persist", persistNode)
    .addEdge(START, "prepare")
    .addEdge("prepare", "summarize")
    .addEdge("summarize", "agent")
    .addConditionalEdges("agent", routeAgent, { tools: "tools", finalize: "finalize" })
    .addEdge("tools", "summarize")
    .addConditionalEdges("finalize", routeAfterFinalize, {
      transferGate: "transferGate",
      persist: "persist"
    })
    .addEdge("executeTransfer", "persist")
    .addEdge("persist", END)
    .compile({ checkpointer });
}

type ResumableGraph = ReturnType<typeof buildResumableGraph>;

let cachedResumableGraph: ResumableGraph | undefined;

/** The production resumable graph, checkpointed in MongoDB when connected. */
function getResumableGraph(): ResumableGraph {
  if (!cachedResumableGraph) {
    let checkpointer: BaseCheckpointSaver;
    if (config.aiMemoryBackend === "postgres") {
      try {
        // Tables are created at boot by setupAiMemoryBackend().
        checkpointer = getPostgresCheckpointer();
      } catch {
        // Mirror the Mongo branch: degrade to in-memory if the saver can't be
        // built. Money state is not lost — pending transfers persist in their own
        // repository, independent of the graph checkpointer.
        checkpointer = new MemorySaver();
      }
    } else {
      try {
        checkpointer = createMongoCheckpointer(mongoose.connection.getClient());
      } catch {
        // No live Mongo connection (dev/degraded): fall back to in-memory.
        checkpointer = new MemorySaver();
      }
    }
    cachedResumableGraph = buildResumableGraph(checkpointer);
  }
  return cachedResumableGraph;
}

function configurableFor(
  input: RunAssistantInput,
  options: RunAssistantOptions,
  turnOutcome: V2TurnOutcome,
  memoryKnownCounterparties: V2Configurable["knownCounterparties"],
  pendingConfirmation: V2Configurable["pendingConfirmation"],
  communicationProfile?: CommunicationProfile
): V2Configurable {
  return {
    userId: input.userId ?? "",
    conversationId: input.conversationId,
    assistantId: input.assistantId ?? DEFAULT_ASSISTANT_ID,
    message: input.message,
    now: new Date(),
    timezone: V2_TIMEZONE,
    locale: detectLocale(input.message),
    executors: options.tools ?? readOnlyToolExecutors,
    transferPreparationService:
      options.transferPreparationService ?? prepareAiPendingTransfer,
    transferModificationService:
      options.transferModificationService ?? modifyAiPendingTransfer,
    transferResponseService: respondToAiPendingTransfer,
    pendingConfirmation,
    turnOutcome,
    knownCounterparties: memoryKnownCounterparties,
    communicationProfile
  };
}

function hasInterrupt(state: unknown): boolean {
  const interrupts = (state as { __interrupt__?: unknown[] }).__interrupt__;
  return Array.isArray(interrupts) && interrupts.length > 0;
}

/**
 * Production HITL turn: invokes the resumable graph by `thread_id = conversationId`.
 * A transfer turn pauses at `transferGate` (checkpointed) and returns the card;
 * read-only turns complete normally.
 */
export async function invokeV2Resumable(
  input: RunAssistantInput,
  options: RunAssistantOptions = {},
  graph: ResumableGraph = getResumableGraph()
): Promise<RunAssistantResult> {
  const assistantId = input.assistantId ?? DEFAULT_ASSISTANT_ID;
  const locale = detectLocale(input.message);
  if (!isV2ModelConfigured()) {
    const message =
      locale === "he"
        ? "מצטער, לא הצלחתי לעבד את הבקשה כרגע."
        : "Sorry, I couldn't process that just now.";
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

  const store = options.conversationStore;
  const loaded = store
    ? await store.load(input.userId ?? "", input.conversationId)
    : { messages: [], memory: createEmptyCounterpartyMemory() };
  const memory = loaded.memory ?? createEmptyCounterpartyMemory();

  const turnOutcome: V2TurnOutcome = { uiBlocks: [] };
  // Phase 6: hydrate cross-conversation counterparties (no-op without a store).
  const longTermStore = resolveLongTermStore();
  const knownCounterparties = await withLongTermCounterparties(
    longTermStore,
    input.userId ?? "",
    buildKnownCounterparties(memory)
  );
  let communicationProfile: CommunicationProfile | undefined;
  try {
    if (input.userId)
      communicationProfile = await communicationProfileService.getOrSeedForUser(
        input.userId,
        new Date()
      );
  } catch {
    communicationProfile = undefined; // degrade gracefully - never block the turn
  }
  const configurable = configurableFor(
    input,
    options,
    turnOutcome,
    knownCounterparties,
    memory.pendingConfirmation ?? null,
    communicationProfile
  );

  const out = (await graph.invoke(
    { messages: [new HumanMessage(input.message)] },
    { configurable: { ...configurable, thread_id: input.conversationId }, recursionLimit: 25 }
  )) as V2AgentStateType;

  const paused = hasInterrupt(out);
  const responseMessage =
    out.responseMessage?.trim() ||
    (turnOutcome.confirmation
      ? locale === "he"
        ? "הכנתי העברה לאישורך."
        : "I've prepared a transfer for your confirmation."
      : "");

  // Phase 9: audit continuity with v1 (tools requested/executed, intent).
  const toolCalls = mapReadToolNames(collectCalledToolNames(out.messages ?? []));
  const intent = deriveIntent(turnOutcome);
  if (input.userId && options.auditLogger) {
    await options.auditLogger({
      userId: input.userId,
      conversationId: input.conversationId,
      requestId: input.requestId,
      assistantId,
      intent,
      toolsRequested: toolCalls,
      toolsExecuted: toolCalls,
      diagnostics: []
    });
  }

  // Layer 2: feed cross-session long-term memory (counterparties). Best-effort;
  // a store outage must not fail the turn (upsert swallows its own errors).
  if (input.userId && longTermStore) {
    await upsertInteractedCounterparties(longTermStore, input.userId, memory);
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
    ...(paused && turnOutcome.confirmation ? { confirmation: turnOutcome.confirmation } : {}),
    ...(turnOutcome.supersededConfirmationId
      ? { supersededConfirmationId: turnOutcome.supersededConfirmationId }
      : {})
  };
}

export type V2StreamEnvelope =
  | { event: "token"; data: { text: string } }
  | { event: "status"; data: { label: string } }
  | { event: "block"; data: { block: unknown } }
  | { event: "result"; data: RunAssistantResult };

/**
 * Streaming HITL turn (design §7 / Phase 7): streams the resumable graph with
 * `streamMode: ["messages", "custom", "updates"]` and yields additive SSE
 * envelopes — `token` (LLM deltas), `status`/`block` (semantic events from
 * tools), then a final `result` matching the non-streaming response.
 */
export async function* streamAssistantV2(
  input: RunAssistantInput,
  options: RunAssistantOptions = {},
  graph: ResumableGraph = getResumableGraph()
): AsyncGenerator<V2StreamEnvelope> {
  const assistantId = input.assistantId ?? DEFAULT_ASSISTANT_ID;
  const locale = detectLocale(input.message);

  const store = options.conversationStore;
  const loaded = store
    ? await store.load(input.userId ?? "", input.conversationId)
    : { messages: [], memory: createEmptyCounterpartyMemory() };
  const memory = loaded.memory ?? createEmptyCounterpartyMemory();

  const turnOutcome: V2TurnOutcome = { uiBlocks: [] };
  const longTermStore = resolveLongTermStore();
  const knownCounterparties = await withLongTermCounterparties(
    longTermStore,
    input.userId ?? "",
    buildKnownCounterparties(memory)
  );
  let communicationProfile: CommunicationProfile | undefined;
  try {
    if (input.userId)
      communicationProfile = await communicationProfileService.getOrSeedForUser(
        input.userId,
        new Date()
      );
  } catch {
    communicationProfile = undefined; // degrade gracefully - never block the turn
  }
  const configurable = configurableFor(
    input,
    options,
    turnOutcome,
    knownCounterparties,
    memory.pendingConfirmation ?? null,
    communicationProfile
  );

  let finalText = "";
  const stream = await graph.stream(
    { messages: [new HumanMessage(input.message)] },
    {
      configurable: { ...configurable, thread_id: input.conversationId },
      streamMode: ["messages", "custom", "updates"],
      recursionLimit: 25
    }
  );

  for await (const chunk of stream) {
    const [mode, payload] = chunk as [string, unknown];
    if (mode === "updates") {
      const update = payload as Record<string, { responseMessage?: string } | undefined>;
      const finalized = update.finalize?.responseMessage ?? update.executeTransfer?.responseMessage;
      if (finalized) {
        finalText = finalized;
      }
    }
    for (const sse of mapStreamChunk(mode, payload)) {
      yield sse as V2StreamEnvelope;
    }
  }

  const responseMessage =
    finalText.trim() ||
    (turnOutcome.confirmation
      ? locale === "he"
        ? "הכנתי העברה לאישורך."
        : "I've prepared a transfer for your confirmation."
      : "");

  // Layer 2: feed cross-session long-term memory (counterparties). Best-effort;
  // a store outage must not fail the turn (upsert swallows its own errors).
  if (input.userId && longTermStore) {
    await upsertInteractedCounterparties(longTermStore, input.userId, memory);
  }

  yield {
    event: "result",
    data: {
      message: responseMessage,
      responseMessage,
      responseFormatVersion: assistantResponseFormatVersion,
      ...(turnOutcome.uiBlocks.length > 0 ? { responseBlocks: turnOutcome.uiBlocks } : {}),
      conversationId: input.conversationId,
      assistantId,
      intent: turnOutcome.confirmation ? "transfer_prepare" : "general_help",
      toolCalls: [],
      toolResults: [],
      ...(turnOutcome.clarification ? { clarification: turnOutcome.clarification } : {}),
      ...(turnOutcome.confirmation ? { confirmation: turnOutcome.confirmation } : {}),
      ...(turnOutcome.supersededConfirmationId
        ? { supersededConfirmationId: turnOutcome.supersededConfirmationId }
        : {})
    }
  };
}

/**
 * Resume a checkpointed transfer from the confirmation endpoint with the user's
 * Confirm/Deny. Returns the backend transfer-execution result (the same
 * `AiConfirmationResult` shape the v1 path returns).
 */
export async function resumeV2Confirmation(
  args: {
    userId: string;
    conversationId: string;
    payload: TransferResumePayload;
  },
  graph: ResumableGraph = getResumableGraph()
): Promise<unknown> {
  const { Command } = await import("@langchain/langgraph");
  const configurable: V2Configurable = {
    userId: args.userId,
    conversationId: args.conversationId,
    assistantId: DEFAULT_ASSISTANT_ID,
    message: "",
    now: new Date(),
    timezone: V2_TIMEZONE,
    locale: "en",
    executors: readOnlyToolExecutors,
    transferResponseService: respondToAiPendingTransfer,
    turnOutcome: { uiBlocks: [] },
    knownCounterparties: []
  };

  const out = (await graph.invoke(new Command({ resume: args.payload }), {
    configurable: { ...configurable, thread_id: args.conversationId }
  })) as V2AgentStateType;

  return out.transferResult;
}

/** Test seam: pending-card → memory mapping reused by the resumable persist. */
export { pendingFromConfirmation };
