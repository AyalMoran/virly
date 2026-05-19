import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { buildRefusalMessage } from "./policy.js";
import {
  classifyAssistantIntent,
  getReadOnlyToolsForIntent,
  isReadOnlyToolName
} from "./router.js";
import {
  AssistantGraphState,
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

function classifyIntent(state: AssistantGraphState): Partial<AssistantGraphState> {
  if (state.refusalReason) {
    return {};
  }

  const classification = classifyAssistantIntent(getUserMessage(state));
  return {
    detectedIntent: classification.intent,
    refusalReason: classification.refusalReason
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

function composeResponse(state: AssistantGraphState): Partial<AssistantGraphState> {
  if (state.refusalReason) {
    return {
      responseMessage:
        state.refusalReason === "authentication_required"
          ? "Authentication is required to use the assistant."
          : buildRefusalMessage(state.refusalReason)
    };
  }

  const intent = state.detectedIntent ?? "unsupported";
  if (intent === "general_help") {
    return {
      responseMessage:
        "I can help with read-only account questions such as balances, recent transactions, verified recipients, and transfer limits. Transfers must be completed through the secure app flow."
    };
  }

  if (intent === "transfer_status") {
    return {
      responseMessage:
        "This app stores completed transaction history, but it does not expose a separate transfer status field yet. I can help review your recent transactions."
    };
  }

  if (intent === "unsupported") {
    return {
      responseMessage:
        "I can help with read-only account information, recent transactions, verified recipients, transfer limits, and general app guidance."
    };
  }

  if (state.toolResults.length === 0) {
    return {
      responseMessage:
        "I could not find account information for that request. Please try again from your authenticated session."
    };
  }

  return {
    responseMessage: state.toolResults.map((result) => result.summary).join(" ")
  };
}

function buildAssistantGraph(options: GraphOptions) {
  return new StateGraph(AssistantStateAnnotation)
    .addNode("loadAuthenticatedContext", loadAuthenticatedContext)
    .addNode("classifyIntent", classifyIntent)
    .addNode("routeReadOnlyTools", buildToolRouter(options.tools))
    .addNode("composeResponse", composeResponse)
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
    tools: options.tools ?? readOnlyToolExecutors
  });
  const initialState: AssistantGraphState = {
    userId: input.userId,
    conversationId: input.conversationId,
    requestId: input.requestId,
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
      intent,
      toolsRequested: finalState.requestedToolNames,
      toolsExecuted: finalState.executedToolNames,
      refusalReason: finalState.refusalReason
    });
  }

  return {
    message: finalState.responseMessage ?? "I could not process that request.",
    conversationId: input.conversationId,
    intent,
    toolCalls: finalState.executedToolNames,
    refusalReason: finalState.refusalReason
  };
}
