/**
 * Full V2 graph entrypoint for LangGraph Studio / LangSmith.
 *
 * Studio only provides JSON state input, while the production V2 entrypoint
 * normally supplies identity and tool dependencies through `config.configurable`.
 * This graph keeps the same visible V2 topology (`prepare -> agent -> tools ->
 * finalize -> persist`) and injects DB-free eval-world dependencies at the node
 * boundary so Studio can run without a separate config editor.
 */
import {
  AIMessage,
  HumanMessage,
  RemoveMessage,
  SystemMessage,
  ToolMessage
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph
} from "@langchain/langgraph";

import {
  createMemoryWithCounterparties,
  createTransferModificationService,
  createTransferPreparationService
} from "../evals/support.js";
import {
  WORLD,
  worldCounterpartyEmails
} from "../evals/v2/world.js";
import { createV2WorldTools } from "../evals/v2/worldTools.js";
import { DEFAULT_ASSISTANT_ID, isAssistantId } from "../assistants.js";
import type { AssistantId } from "../assistants.js";
import type {
  ClarificationRequest,
  PendingConfirmationMemory,
  TransferConfirmation
} from "../state.js";

import { buildSystemPrompt } from "./prompt.js";
import { createV2ChatModel, isV2ModelConfigured } from "./model.js";
import { allTools } from "./tools/index.js";
import type { V2Configurable, V2TurnOutcome } from "./toolContext.js";
import {
  buildKnownCounterparties,
  detectLocale,
  pendingFromConfirmation
} from "./turn.js";

const STUDIO_TIMEZONE = "Asia/Jerusalem";

const StudioV2State = Annotation.Root({
  ...MessagesAnnotation.spec,

  /** Current turn text. Prefer this for Studio/LangSmith manual runs. */
  message: Annotation<string | undefined>(),
  /** Stable conversation id for trace metadata and fake tool context. */
  conversationId: Annotation<string | undefined>(),
  /** Optional assistant personality id; defaults to oshri. */
  assistantId: Annotation<AssistantId | undefined>(),
  /** Optional user id; defaults to the DB-free V2 eval world user. */
  userId: Annotation<string | undefined>(),
  /** Optional ISO timestamp; defaults to the current server time. */
  now: Annotation<string | undefined>(),
  /** Optional timezone; defaults to Asia/Jerusalem. */
  timezone: Annotation<string | undefined>(),

  responseMessage: Annotation<string | undefined>(),
  confirmation: Annotation<TransferConfirmation | undefined>(),
  clarification: Annotation<ClarificationRequest | undefined>(),
  supersededConfirmationId: Annotation<string | undefined>(),
  /** Studio-visible marker proving the run reached the final real node. */
  completed: Annotation<boolean | undefined>()
});

type StudioV2StateType = typeof StudioV2State.State;
type StudioTool = (typeof allTools)[number];
type StudioToolInvoke = (
  input: unknown,
  config?: LangGraphRunnableConfig
) => Promise<unknown>;
type StudioToolCall = {
  id?: string;
  name: string;
  args: unknown;
};

function messageType(message: BaseMessage | undefined): string | undefined {
  if (!message) {
    return undefined;
  }
  const maybeTyped = message as BaseMessage & {
    _getType?: () => string;
    type?: string;
  };
  if (typeof maybeTyped._getType === "function") {
    return maybeTyped._getType();
  }
  return typeof maybeTyped.type === "string" ? maybeTyped.type : undefined;
}

function isHumanMessageLike(message: BaseMessage | undefined): boolean {
  const type = messageType(message);
  return message instanceof HumanMessage || type === "human" || type === "user";
}

function isAiMessageLike(message: BaseMessage | undefined): boolean {
  const type = messageType(message);
  return message instanceof AIMessage || type === "ai" || type === "assistant";
}

function isToolMessageLike(message: BaseMessage | undefined): boolean {
  return messageType(message) === "tool";
}

function messageId(message: BaseMessage | undefined): string | undefined {
  const id = (message as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : undefined;
}

function toolCallIdOf(message: BaseMessage | undefined): string | undefined {
  const id = (message as { tool_call_id?: unknown } | undefined)?.tool_call_id;
  return typeof id === "string" ? id : undefined;
}

function parseRawToolCall(raw: unknown): StudioToolCall | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const call = raw as {
    id?: unknown;
    name?: unknown;
    args?: unknown;
    function?: { name?: unknown; arguments?: unknown };
  };
  if (typeof call.name === "string") {
    return {
      id: typeof call.id === "string" ? call.id : undefined,
      name: call.name,
      args: call.args ?? {}
    };
  }
  if (
    call.function &&
    typeof call.function.name === "string"
  ) {
    const rawArgs = call.function.arguments;
    let args: unknown = {};
    if (typeof rawArgs === "string" && rawArgs.trim()) {
      try {
        args = JSON.parse(rawArgs);
      } catch {
        args = {};
      }
    }
    return {
      id: typeof call.id === "string" ? call.id : undefined,
      name: call.function.name,
      args
    };
  }
  return null;
}

function toolCallsOf(message: BaseMessage | undefined): StudioToolCall[] {
  if (!isAiMessageLike(message)) {
    return [];
  }
  const maybeAi = message as BaseMessage & {
    tool_calls?: unknown;
    additional_kwargs?: { tool_calls?: unknown };
  };
  const candidates = Array.isArray(maybeAi.tool_calls)
    ? maybeAi.tool_calls
    : Array.isArray(maybeAi.additional_kwargs?.tool_calls)
      ? maybeAi.additional_kwargs.tool_calls
      : [];
  return candidates
    .map(parseRawToolCall)
    .filter((call): call is StudioToolCall => call !== null);
}

function routeAgent(state: StudioV2StateType): "tools" | "finalize" {
  const last = state.messages.at(-1);
  return toolCallsOf(last).length > 0 ? "tools" : "finalize";
}

function textOf(message: BaseMessage | undefined): string {
  if (!message) {
    return "";
  }
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  return content
    .map((part) =>
      typeof part === "string"
        ? part
        : "text" in part && typeof part.text === "string"
          ? part.text
          : ""
    )
    .join("");
}

function latestHumanText(messages: BaseMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isHumanMessageLike(message)) {
      return textOf(message).trim();
    }
  }
  return "";
}

function parseAssistantId(value: AssistantId | undefined): AssistantId {
  return value && isAssistantId(value) ? value : DEFAULT_ASSISTANT_ID;
}

function parseNow(value: string | undefined): Date {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function gracefulText(locale: "he" | "en" | "mixed" | "unknown"): string {
  return locale === "he"
    ? "מצטער, לא הצלחתי לעבד את הבקשה כרגע. נסה שוב עוד רגע."
    : "Sorry, I couldn't process that just now. Please try again shortly.";
}

function currentMessage(state: StudioV2StateType): string {
  return state.message?.trim() || latestHumanText(state.messages ?? []);
}

function pendingFromState(
  state: StudioV2StateType
): PendingConfirmationMemory | null {
  return state.confirmation ? pendingFromConfirmation(state.confirmation, 1) : null;
}

function buildStudioConfigurable(
  state: StudioV2StateType,
  turnOutcome: V2TurnOutcome
): V2Configurable {
  const message = currentMessage(state);
  const memory = createMemoryWithCounterparties(worldCounterpartyEmails());
  return {
    userId: state.userId?.trim() || WORLD.userId,
    conversationId: state.conversationId?.trim() || "studio-v2",
    assistantId: parseAssistantId(state.assistantId),
    message,
    now: parseNow(state.now),
    timezone: state.timezone?.trim() || STUDIO_TIMEZONE,
    locale: detectLocale(message),
    executors: createV2WorldTools(),
    transferPreparationService: createTransferPreparationService(),
    transferModificationService: createTransferModificationService(),
    pendingConfirmation: pendingFromState(state),
    turnOutcome,
    knownCounterparties: buildKnownCounterparties(memory)
  };
}

function withStudioConfig(
  config: LangGraphRunnableConfig,
  configurable: V2Configurable
): LangGraphRunnableConfig {
  return {
    ...config,
    configurable: {
      ...config.configurable,
      ...configurable,
      thread_id:
        typeof config.configurable?.thread_id === "string"
          ? config.configurable.thread_id
          : configurable.conversationId
    }
  };
}

function removeBrokenToolRounds(messages: BaseMessage[]): RemoveMessage[] {
  const removals: RemoveMessage[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const toolCalls = toolCallsOf(messages[index]);
    if (toolCalls.length === 0) {
      continue;
    }

    const expectedIds = new Set(
      toolCalls
        .map((call) => call.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );
    if (expectedIds.size === 0) {
      continue;
    }

    const followingToolIndexes: number[] = [];
    const foundIds = new Set<string>();
    for (
      let toolIndex = index + 1;
      toolIndex < messages.length && isToolMessageLike(messages[toolIndex]);
      toolIndex += 1
    ) {
      followingToolIndexes.push(toolIndex);
      const toolCallId = toolCallIdOf(messages[toolIndex]);
      if (toolCallId) {
        foundIds.add(toolCallId);
      }
    }

    const isComplete = [...expectedIds].every((id) => foundIds.has(id));
    if (isComplete) {
      continue;
    }

    for (const removeIndex of [index, ...followingToolIndexes]) {
      const id = messageId(messages[removeIndex]);
      if (id) {
        removals.push(new RemoveMessage({ id }));
      }
    }
  }
  return removals;
}

async function prepareStudioNode(
  state: StudioV2StateType
): Promise<Partial<StudioV2StateType>> {
  const message = state.message?.trim();
  const removals = removeBrokenToolRounds(state.messages ?? []);
  const resetCompletion = { completed: false };
  if (!message) {
    return removals.length
      ? { ...resetCompletion, messages: removals }
      : resetCompletion;
  }

  const last = state.messages.at(-1);
  if (isHumanMessageLike(last) && textOf(last).trim() === message) {
    return removals.length
      ? { ...resetCompletion, messages: removals }
      : resetCompletion;
  }

  return { ...resetCompletion, messages: [...removals, new HumanMessage(message)] };
}

function buildStudioAgentNode() {
  const model = createV2ChatModel();
  const boundModel = model.bindTools(allTools, { parallel_tool_calls: true });

  return async function agentStudioNode(
    state: StudioV2StateType,
    config: LangGraphRunnableConfig
  ): Promise<Partial<StudioV2StateType>> {
    const cfg = buildStudioConfigurable(state, { uiBlocks: [] });
    if (!currentMessage(state)) {
      return { messages: [new AIMessage("Enter a message to run the V2 graph.")] };
    }
    if (!isV2ModelConfigured()) {
      return { messages: [new AIMessage(gracefulText(cfg.locale))] };
    }

    const system = buildSystemPrompt({
      assistantId: cfg.assistantId,
      locale: cfg.locale,
      knownCounterparties: cfg.knownCounterparties,
      pendingConfirmation: cfg.pendingConfirmation,
      now: cfg.now,
      timezone: cfg.timezone
    });

    const aiMessage = await boundModel.invoke(
      [new SystemMessage(system), ...state.messages],
      withStudioConfig(config, cfg)
    );
    return { messages: [aiMessage] };
  };
}

function stringifyToolOutput(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output);
}

function createV2StudioToolNode() {
  const toolsByName: Map<string, StudioTool> = new Map(
    allTools.map((tool) => [tool.name, tool])
  );

  return async function toolsStudioNode(
    state: StudioV2StateType,
    config: LangGraphRunnableConfig
  ): Promise<Partial<StudioV2StateType>> {
    const last = state.messages.at(-1);
    const toolCalls = toolCallsOf(last);
    const turnOutcome: V2TurnOutcome = { uiBlocks: [] };
    const cfg = buildStudioConfigurable(state, turnOutcome);
    const toolConfig = withStudioConfig(config, cfg);

    const messages = await Promise.all(
      toolCalls.map(async (call, index) => {
        const tool = toolsByName.get(call.name);
        const toolCallId = call.id ?? `${call.name}-${index}`;
        if (!tool) {
          return new ToolMessage({
            tool_call_id: toolCallId,
            name: call.name,
            content: `The ${call.name} capability is unavailable right now.`
          });
        }

        try {
          const invoke = tool.invoke.bind(tool) as StudioToolInvoke;
          const output = await invoke(call.args, toolConfig);
          return new ToolMessage({
            tool_call_id: toolCallId,
            name: call.name,
            content: stringifyToolOutput(output)
          });
        } catch (error) {
          return new ToolMessage({
            tool_call_id: toolCallId,
            name: call.name,
            content: `That lookup failed: ${
              error instanceof Error ? error.message : "unknown error"
            }.`
          });
        }
      })
    );

    return {
      messages,
      confirmation: turnOutcome.confirmation ?? state.confirmation,
      clarification: turnOutcome.clarification,
      supersededConfirmationId: turnOutcome.supersededConfirmationId
    };
  };
}

async function finalizeStudioNode(
  state: StudioV2StateType
): Promise<Partial<StudioV2StateType>> {
  const lastAi = [...state.messages]
    .reverse()
    .find((message) => isAiMessageLike(message) && toolCallsOf(message).length === 0);
  const responseMessage = textOf(lastAi).trim();

  return {
    responseMessage,
    confirmation: state.supersededConfirmationId ? undefined : state.confirmation,
    clarification: state.clarification,
    supersededConfirmationId: state.supersededConfirmationId
  };
}

async function persistStudioNode(): Promise<Partial<StudioV2StateType>> {
  return { completed: true };
}

export const assistantGraphV2Studio = new StateGraph(StudioV2State)
  .addNode("prepare", prepareStudioNode)
  .addNode("agent", buildStudioAgentNode())
  .addNode("tools", createV2StudioToolNode())
  .addNode("finalize", finalizeStudioNode)
  .addNode("persist", persistStudioNode)
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
