import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { DEFAULT_ASSISTANT_ID } from "./assistants.js";
import { buildRefusalMessage } from "./policy.js";
import {
  classifyAssistantIntent,
  getReadOnlyToolsForIntent,
  isReadOnlyToolName
} from "./router.js";
import type {
  AssistantGraphState,
  AssistantLlmProvider,
  AssistantToolName,
  AssistantToolExecutors,
  AuditLogger,
  RunAssistantInput,
  RunAssistantResult
} from "./state.js";
import { readOnlyToolExecutors } from "./tools/index.js";

const AssistantStateAnnotation = Annotation.Root({
  userId: Annotation<string | undefined>(),
  conversationId: Annotation<string>(),
  requestId: Annotation<string | undefined>(),
  assistantId: Annotation<AssistantGraphState["assistantId"]>(),
  messages: Annotation<AssistantGraphState["messages"]>(),
  detectedIntent: Annotation<AssistantGraphState["detectedIntent"]>(),
  selectedAccountId: Annotation<string | undefined>(),
  requestedToolNames: Annotation<AssistantGraphState["requestedToolNames"]>(),
  executedToolNames: Annotation<AssistantGraphState["executedToolNames"]>(),
  toolResults: Annotation<AssistantGraphState["toolResults"]>(),
  refusalReason: Annotation<string | undefined>(),
  responseMessage: Annotation<string | undefined>()
});

type GraphOptions = {
  tools: AssistantToolExecutors;
  llmProvider?: AssistantLlmProvider;
};

export type RunAssistantOptions = Partial<GraphOptions> & {
  auditLogger?: AuditLogger;
};

function getUserMessage(state: AssistantGraphState) {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message.role === "user") {
      return message.content;
    }
  }

  return "";
}

function loadAuthenticatedContext(
  state: AssistantGraphState
): Partial<AssistantGraphState> {
  if (!state.userId) {
    return {
      detectedIntent: "unsafe_request",
      refusalReason: "authentication_required",
      responseMessage: "Authentication is required to use the assistant."
    };
  }

  return {};
}

function buildIntentClassifier(llmProvider?: AssistantLlmProvider) {
  return async function classifyIntent(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (state.refusalReason) {
      return {};
    }

    const classification = await classifyAssistantIntent(
      getUserMessage(state),
      llmProvider
    );
    return {
      detectedIntent: classification.intent,
      refusalReason: classification.refusalReason
    };
  };
}

function buildToolRouter(tools: AssistantToolExecutors) {
  return async function routeReadOnlyTools(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (!state.userId || state.refusalReason) {
      return {
        requestedToolNames: [],
        executedToolNames: [],
        toolResults: []
      };
    }

    const intent = state.detectedIntent ?? "unsupported";
    const requestedToolNames = getReadOnlyToolsForIntent(intent);
    const toolResults: AssistantGraphState["toolResults"] = [];
    const executedToolNames: AssistantToolName[] = [];

    for (const toolName of requestedToolNames) {
      if (!isReadOnlyToolName(toolName)) {
        return {
          requestedToolNames,
          executedToolNames,
          toolResults,
          refusalReason: "forbidden_tool_request"
        };
      }

      const toolResult = await tools[toolName]({
        userId: state.userId,
        conversationId: state.conversationId,
        message: getUserMessage(state)
      });
      toolResults.push(toolResult);
      executedToolNames.push(toolName);
    }

    return {
      requestedToolNames,
      executedToolNames,
      toolResults
    };
  };
}

function composeDeterministicResponse(state: AssistantGraphState) {
  if (state.refusalReason) {
    return state.refusalReason === "authentication_required"
      ? "Authentication is required to use the assistant."
      : buildRefusalMessage(state.refusalReason);
  }

  const intent = state.detectedIntent ?? "unsupported";
  if (intent === "general_help") {
    return "I can help with read-only account questions such as balances, recent transactions, verified recipients, and transfer limits. Transfers must be completed through the secure app flow.";
  }

  if (intent === "transfer_status") {
    return "This app stores completed transaction history, but it does not expose a separate transfer status field yet. I can help review your recent transactions.";
  }

  if (intent === "unsupported") {
    return "I can help with read-only account information, recent transactions, verified recipients, transfer limits, and general app guidance.";
  }

  if (state.toolResults.length === 0) {
    return "I could not find account information for that request. Please try again from your authenticated session.";
  }

  return state.toolResults.map((result) => result.summary).join(" ");
}

function buildResponseComposer(llmProvider?: AssistantLlmProvider) {
  return async function composeResponse(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    const fallbackMessage = composeDeterministicResponse(state);

    if (!llmProvider) {
      return { responseMessage: fallbackMessage };
    }

    try {
      const responseMessage = await llmProvider.composeResponse({
        assistantId: state.assistantId,
        userMessage: getUserMessage(state),
        intent: state.detectedIntent ?? "unsupported",
        toolResults: state.toolResults,
        refusalReason: state.refusalReason,
        fallbackMessage
      });

      return {
        responseMessage: responseMessage.trim() || fallbackMessage
      };
    } catch (error) {
      console.warn(
        "AI response composer failed; using deterministic fallback.",
        error instanceof Error ? error.message : error
      );
      return { responseMessage: fallbackMessage };
    }
  };
}

function buildAssistantGraph(options: GraphOptions) {
  return new StateGraph(AssistantStateAnnotation)
    .addNode("loadAuthenticatedContext", loadAuthenticatedContext)
    .addNode("classifyIntent", buildIntentClassifier(options.llmProvider))
    .addNode("routeReadOnlyTools", buildToolRouter(options.tools))
    .addNode("composeResponse", buildResponseComposer(options.llmProvider))
    .addEdge(START, "loadAuthenticatedContext")
    .addEdge("loadAuthenticatedContext", "classifyIntent")
    .addEdge("classifyIntent", "routeReadOnlyTools")
    .addEdge("routeReadOnlyTools", "composeResponse")
    .addEdge("composeResponse", END)
    .compile();
}

export async function runAssistantGraph(
  input: RunAssistantInput,
  options: RunAssistantOptions = {}
): Promise<RunAssistantResult> {
  const graph = buildAssistantGraph({
    tools: options.tools ?? readOnlyToolExecutors,
    llmProvider: options.llmProvider
  });
  const initialState: AssistantGraphState = {
    userId: input.userId,
    conversationId: input.conversationId,
    requestId: input.requestId,
    assistantId: input.assistantId ?? DEFAULT_ASSISTANT_ID,
    messages: [{ role: "user", content: input.message }],
    requestedToolNames: [],
    executedToolNames: [],
    toolResults: []
  };
  const finalState = (await graph.invoke(initialState)) as AssistantGraphState;
  const intent = finalState.detectedIntent ?? "unsupported";

  if (input.userId && options.auditLogger) {
    await options.auditLogger({
      userId: input.userId,
      conversationId: input.conversationId,
      requestId: input.requestId,
      assistantId: finalState.assistantId,
      intent,
      toolsRequested: finalState.requestedToolNames,
      toolsExecuted: finalState.executedToolNames,
      refusalReason: finalState.refusalReason
    });
  }

  return {
    message: finalState.responseMessage ?? "I could not process that request.",
    conversationId: input.conversationId,
    assistantId: finalState.assistantId,
    intent,
    toolCalls: finalState.executedToolNames,
    refusalReason: finalState.refusalReason
  };
}
