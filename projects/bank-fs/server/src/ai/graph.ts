import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { DEFAULT_ASSISTANT_ID } from "./assistants.js";
import {
  createEmptyCounterpartyMemory,
  rememberCounterpartiesFromMetadata,
  rememberCounterparty,
  normalizeCounterpartyMemory,
  resolveCounterpartyReferenceDeterministic,
  resolveReferenceAgainstMemory,
  trimConversationMessages
} from "./counterpartyMemory.js";
import {
  extractRequestSlots,
  normalizeUserMessage
} from "./messageNormalization.js";
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
  ConversationStore,
  CounterpartyMemory,
  TransferDraft,
  TransferPreparationService,
  RunAssistantInput,
  RunAssistantResult
} from "./state.js";
import { readOnlyToolExecutors } from "./tools/index.js";
import { prepareAiPendingTransfer } from "../services/aiPendingTransfer.service.js";

const AssistantStateAnnotation = Annotation.Root({
  userId: Annotation<string | undefined>(),
  conversationId: Annotation<string>(),
  requestId: Annotation<string | undefined>(),
  assistantId: Annotation<AssistantGraphState["assistantId"]>(),
  messages: Annotation<AssistantGraphState["messages"]>(),
  counterpartyMemory: Annotation<AssistantGraphState["counterpartyMemory"]>(),
  currentTurn: Annotation<number>(),
  detectedIntent: Annotation<AssistantGraphState["detectedIntent"]>(),
  selectedAccountId: Annotation<string | undefined>(),
  normalizedMessage: Annotation<AssistantGraphState["normalizedMessage"]>(),
  requestSlots: Annotation<AssistantGraphState["requestSlots"]>(),
  resolvedCounterparty: Annotation<AssistantGraphState["resolvedCounterparty"]>(),
  transferDraft: Annotation<AssistantGraphState["transferDraft"]>(),
  confirmation: Annotation<AssistantGraphState["confirmation"]>(),
  requestedToolNames: Annotation<AssistantGraphState["requestedToolNames"]>(),
  executedToolNames: Annotation<AssistantGraphState["executedToolNames"]>(),
  toolResults: Annotation<AssistantGraphState["toolResults"]>(),
  clarificationRequest: Annotation<AssistantGraphState["clarificationRequest"]>(),
  clarificationMessage: Annotation<string | undefined>(),
  refusalReason: Annotation<string | undefined>(),
  responseMessage: Annotation<string | undefined>()
});

type GraphOptions = {
  tools: AssistantToolExecutors;
  llmProvider?: AssistantLlmProvider;
  conversationStore?: ConversationStore;
  transferPreparationService: TransferPreparationService;
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

function buildConversationLoader(conversationStore?: ConversationStore) {
  return async function loadConversationContext(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (!state.userId || !conversationStore) {
      return {};
    }

    const currentMessage = getUserMessage(state);
    const context = await conversationStore.load(
      state.userId,
      state.conversationId
    );
    const counterpartyMemory: CounterpartyMemory = {
      ...context.memory,
      turn: context.memory.turn + 1
    };

    return {
      messages: trimConversationMessages([
        ...context.messages,
        { role: "user", content: currentMessage, createdAt: new Date() }
      ]),
      counterpartyMemory,
      currentTurn: counterpartyMemory.turn
    };
  };
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
      llmProvider,
      {
        messages: state.messages,
        counterpartyMemory: state.counterpartyMemory
      }
    );
    return {
      detectedIntent: classification.intent,
      refusalReason: classification.refusalReason
    };
  };
}

function extractRequestSlotsNode(
  state: AssistantGraphState
): Partial<AssistantGraphState> {
  return {
    requestSlots: extractRequestSlots(
      getUserMessage(state),
      state.detectedIntent ?? "unsupported"
    )
  };
}

function normalizeMessageNode(
  state: AssistantGraphState
): Partial<AssistantGraphState> {
  return {
    normalizedMessage: normalizeUserMessage(getUserMessage(state))
  };
}

function applySlotDataToDraft(
  draft: TransferDraft,
  state: AssistantGraphState
): TransferDraft {
  const slots = state.requestSlots;
  const amount = slots?.amount;
  const counterparty = slots?.counterparty;
  const nextDraft: TransferDraft = {
    ...draft,
    recipientEmail:
      draft.recipientEmail ?? counterparty?.explicitEmail ?? undefined,
    recipientReference:
      draft.recipientReference ?? counterparty?.referenceText ?? undefined,
    amount: draft.amount ?? amount?.value ?? undefined,
    amountText: draft.amountText ?? amount?.rawText ?? undefined,
    currency: draft.currency ?? amount?.currency ?? undefined,
    currencyMentioned:
      draft.currencyMentioned ?? amount?.currencyMentioned ?? false,
    currencySupported:
      draft.currencySupported ?? amount?.currencySupported ?? true
  };

  const missingFields: TransferDraft["missingFields"] = [];
  if (!nextDraft.recipientEmail && !nextDraft.recipientReference) {
    missingFields.push("recipient");
  }
  if (!nextDraft.amount && !nextDraft.amountReferenceText) {
    missingFields.push("amount");
  }
  if (nextDraft.currencyMentioned && !nextDraft.currencySupported) {
    missingFields.push("currency");
  }

  return {
    ...nextDraft,
    missingFields
  };
}

function extractTransferDraftDeterministic(message: string): TransferDraft {
  const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const amountMatch = message.match(
    /(?:\$|usd|nis|ils|shekels?|שקל|שח|ש״ח)?\s*(\d+(?:\.\d{1,2})?)/i
  );
  const amount = amountMatch ? Number(amountMatch[1]) : null;
  const referenceMatch = message.match(
    /\b(him|her|them|this person|that person|this recipient|that recipient)\b/i
  );

  const lowerMessage = message.toLowerCase();
  const unsupportedCurrency =
    /(\$|usd|dollar|dollars|דולר|€|eur|euro|euros|אירו|יורו)/i.test(lowerMessage);
  const ilsCurrency =
    /(₪|ils|nis|shekel|shekels|שקל|שח|ש״ח|ש"ח)/i.test(lowerMessage);

  return {
    recipientEmail: email?.toLowerCase() ?? null,
    recipientReference: email ? null : referenceMatch?.[0] ?? message.trim(),
    amount: Number.isFinite(amount) && amount ? amount : null,
    amountText: amountMatch?.[0]?.trim() ?? null,
    currency: unsupportedCurrency
      ? /(\$|usd|dollar|dollars|דולר)/i.test(lowerMessage)
        ? "USD"
        : "EUR"
      : ilsCurrency
        ? "ILS"
        : null,
    currencyMentioned: unsupportedCurrency || ilsCurrency,
    currencySupported: !unsupportedCurrency,
    reason: null
  };
}

function buildTransferDraftExtractor(llmProvider?: AssistantLlmProvider) {
  return async function extractTransferDraft(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (state.refusalReason || state.detectedIntent !== "transfer_prepare") {
      return {};
    }

    if (llmProvider) {
      try {
        const transferDraft = await llmProvider.extractTransferDraft({
          userMessage: getUserMessage(state),
          messages: state.messages,
          counterpartyMemory: state.counterpartyMemory
        });

        return { transferDraft: applySlotDataToDraft(transferDraft, state) };
      } catch (error) {
        console.warn(
          "AI transfer draft extractor failed; using deterministic fallback.",
          error instanceof Error ? error.message : error
        );
      }
    }

    return {
      transferDraft: applySlotDataToDraft(
        extractTransferDraftDeterministic(getUserMessage(state)),
        state
      )
    };
  };
}

function buildClarificationRequest(
  state: AssistantGraphState,
  reason: NonNullable<AssistantGraphState["clarificationRequest"]>["reason"],
  message: string,
  expectedReplyType: NonNullable<AssistantGraphState["clarificationRequest"]>["expectedReplyType"]
) {
  return {
    clarificationMessage: message,
    clarificationRequest: {
      reason,
      message,
      expectedReplyType
    }
  };
}

function needsCounterpartyResolution(state: AssistantGraphState) {
  return (
    state.detectedIntent === "counterparty_transactions" ||
    state.detectedIntent === "counterparty_total_sent" ||
    (state.detectedIntent === "transfer_prepare" &&
      !state.transferDraft?.recipientEmail)
  );
}

function buildCounterpartyResolver(llmProvider?: AssistantLlmProvider) {
  return async function resolveCounterpartyReference(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (state.refusalReason || !needsCounterpartyResolution(state)) {
      return {};
    }

    if (llmProvider) {
      try {
        const resolution = await llmProvider.resolveCounterpartyReference({
          userMessage: getUserMessage(state),
          intent: state.detectedIntent ?? "unsupported",
          messages: state.messages,
          memory: state.counterpartyMemory,
          transferDraft: state.transferDraft
        });
        const resolvedCounterparty = resolveReferenceAgainstMemory(
          state.counterpartyMemory,
          resolution
        );

        if (resolvedCounterparty) {
          return {
            resolvedCounterparty,
            counterpartyMemory: rememberCounterparty(
              state.counterpartyMemory,
              resolvedCounterparty,
              state.currentTurn
            )
          };
        }
      } catch (error) {
        console.warn(
          "AI counterparty resolver failed; using deterministic fallback.",
          error instanceof Error ? error.message : error
        );
      }
    }

    const deterministicCounterparty = resolveCounterpartyReferenceDeterministic(
      getUserMessage(state),
      state.counterpartyMemory
    );
    if (deterministicCounterparty) {
      return {
        resolvedCounterparty: deterministicCounterparty,
        counterpartyMemory: rememberCounterparty(
          state.counterpartyMemory,
          deterministicCounterparty,
          state.currentTurn
        )
      };
    }

    if (state.detectedIntent === "transfer_prepare") {
      return {};
    }

    return buildClarificationRequest(
      state,
      "ambiguous_reference",
      "Which recipient should I use for that question?",
      "recipient"
    );
  };
}

function buildTransferConfirmationPreparer(
  transferPreparationService: TransferPreparationService
) {
  return async function prepareTransferConfirmation(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (
      !state.userId ||
      state.refusalReason ||
      state.clarificationMessage ||
      state.detectedIntent !== "transfer_prepare"
    ) {
      return {};
    }

    if (state.transferDraft?.currencyMentioned && !state.transferDraft.currencySupported) {
      const currency = state.transferDraft.currency ?? "that currency";
      const amountText = state.transferDraft.amountText ?? "that amount";
      return buildClarificationRequest(
        state,
        "unsupported_currency",
        `I can prepare transfers only in ILS right now. Should I prepare ${amountText} as ILS instead of ${currency}?`,
        "yes_no"
      );
    }

    const result = await transferPreparationService({
      userId: state.userId,
      conversationId: state.conversationId,
      assistantId: state.assistantId,
      draft: state.transferDraft ?? {},
      resolvedCounterparty: state.resolvedCounterparty
    });

    if (result.status === "needs_clarification") {
      const amount = state.transferDraft?.amount;
      if (!state.transferDraft?.recipientEmail && !state.resolvedCounterparty) {
        return buildClarificationRequest(
          state,
          "missing_recipient",
          amount ? `Who should I send ₪${amount} to?` : result.message,
          "recipient"
        );
      }

      if (!state.transferDraft?.amount) {
        return buildClarificationRequest(
          state,
          "missing_amount",
          state.resolvedCounterparty
            ? `How much should I send to ${state.resolvedCounterparty.maskedLabel}?`
            : result.message,
          "amount"
        );
      }

      return buildClarificationRequest(
        state,
        "ambiguous_reference",
        result.message,
        "free_text"
      );
    }

    return { confirmation: result.confirmation };
  };
}

function buildToolRouter(tools: AssistantToolExecutors) {
  return async function routeReadOnlyTools(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (!state.userId || state.refusalReason || state.clarificationMessage) {
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
        message: getUserMessage(state),
        resolvedCounterparty: state.resolvedCounterparty
      });
      toolResults.push(toolResult);
      executedToolNames.push(toolName);
    }

    const counterpartyMemory = rememberCounterpartiesFromMetadata(
      state.counterpartyMemory,
      toolResults.map((result) => result.metadata),
      state.currentTurn
    );

    return {
      requestedToolNames,
      executedToolNames,
      toolResults,
      counterpartyMemory
    };
  };
}

function composeDeterministicResponse(state: AssistantGraphState) {
  if (state.clarificationMessage) {
    return state.clarificationMessage;
  }

  if (state.refusalReason) {
    return state.refusalReason === "authentication_required"
      ? "Authentication is required to use the assistant."
      : buildRefusalMessage(state.refusalReason);
  }

  const intent = state.detectedIntent ?? "unsupported";
  if (intent === "general_help") {
    return "I can help with account questions such as balances, recent transactions, verified recipients, transfer limits, and preparing transfers for explicit confirmation.";
  }

  if (
    intent === "transfer_modify_pending" ||
    intent === "transfer_cancel_pending" ||
    intent === "pending_confirmation_status"
  ) {
    if (state.counterpartyMemory.pendingConfirmation?.status === "pending") {
      return "I cannot confirm a transfer from chat text. Please review the current confirmation card and use its Confirm or Deny button.";
    }

    return "I do not see an active transfer confirmation in this conversation. I can prepare a new transfer for explicit confirmation.";
  }

  if (intent === "transfer_status") {
    return "This app stores completed transaction history, but it does not expose a separate transfer status field yet. I can help review your recent transactions.";
  }

  if (intent === "unsupported") {
    return "I can help with account information, recent transactions, verified recipients, transfer limits, transfer preparation, and general app guidance.";
  }

  if (intent === "transfer_prepare" && state.confirmation) {
    return "Please review the transfer details and use the confirmation buttons before I send anything.";
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

    if (
      !llmProvider ||
      state.clarificationMessage ||
      state.refusalReason ||
      state.detectedIntent === "transfer_prepare"
    ) {
      return { responseMessage: fallbackMessage };
    }

    try {
      const responseMessage = await llmProvider.composeResponse({
        assistantId: state.assistantId,
        userMessage: getUserMessage(state),
        messages: state.messages,
        intent: state.detectedIntent ?? "unsupported",
        toolResults: state.toolResults,
        counterpartyMemory: state.counterpartyMemory,
        resolvedCounterparty: state.resolvedCounterparty,
        transferDraft: state.transferDraft,
        confirmation: state.confirmation,
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

function buildConversationSaver(conversationStore?: ConversationStore) {
  return async function saveConversation(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (!state.userId || !conversationStore) {
      return {};
    }

    const memory = normalizeCounterpartyMemory({
      ...state.counterpartyMemory,
      mode: state.clarificationRequest
        ? "awaiting_clarification"
        : state.confirmation
          ? "transfer_confirmation_pending"
          : state.detectedIntent === "transfer_prepare"
            ? "transfer_draft_in_progress"
            : state.toolResults.length > 0
              ? "answering_read_only"
              : "idle",
      clarification: state.clarificationRequest ?? null,
      pendingConfirmation: state.confirmation
        ? {
            confirmationId: state.confirmation.id,
            type: "transfer",
            status: "pending",
            createdAt: new Date().toISOString(),
            expiresAt: state.confirmation.expiresAt,
            recipientEmail: state.confirmation.recipientEmail,
            recipientFirstName: state.confirmation.recipientFirstName,
            recipientLastName: state.confirmation.recipientLastName,
            amount: state.confirmation.amount,
            currency: state.confirmation.currency,
            reason: state.confirmation.reason,
            turnCreated: state.currentTurn,
            version: state.confirmation.version
          }
        : state.counterpartyMemory.pendingConfirmation ?? null,
      answerFrames: [
        ...(state.counterpartyMemory.answerFrames ?? []),
        {
          id: `${state.conversationId}:${state.currentTurn}`,
          turn: state.currentTurn,
          intent: state.detectedIntent ?? "unsupported",
          userMessage: getUserMessage(state),
          assistantSummary:
            state.responseMessage ?? "I could not process that request.",
          primaryEntities: state.resolvedCounterparty
            ? [`counterparty:${state.resolvedCounterparty.email}`]
            : [],
          secondaryEntities: [],
          toolResultRefs: state.toolResults.map((result, index) => ({
            toolName: result.toolName,
            resultId: `${state.conversationId}:${state.currentTurn}:${index}`
          }))
        }
      ],
      entities: [
        ...(state.counterpartyMemory.entities ?? []),
        ...(state.resolvedCounterparty
          ? [
              {
                id: `counterparty:${state.resolvedCounterparty.email}`,
                type: "counterparty" as const,
                turnIntroduced: state.resolvedCounterparty.firstMentionedAtTurn,
                turnLastReferenced: state.currentTurn,
                source: "tool_result" as const,
                confidence: "high" as const,
                displayName: state.resolvedCounterparty.maskedLabel,
                email: state.resolvedCounterparty.email,
                aliases: [state.resolvedCounterparty.maskedLabel]
              }
            ]
          : []),
        ...(state.transferDraft?.amount
          ? [
              {
                id: `amount:${state.conversationId}:${state.currentTurn}`,
                type: "amount" as const,
                turnIntroduced: state.currentTurn,
                turnLastReferenced: state.currentTurn,
                source: "transfer_draft" as const,
                confidence: "high" as const,
                amount: state.transferDraft.amount,
                currency: state.transferDraft.currency ?? "ILS",
                aliases: state.transferDraft.amountText
                  ? [state.transferDraft.amountText]
                  : []
              }
            ]
          : [])
      ]
    });

    await conversationStore.save({
      userId: state.userId,
      conversationId: state.conversationId,
      assistantId: state.assistantId,
      messages: trimConversationMessages([
        ...state.messages,
        {
          role: "assistant",
          content: state.responseMessage ?? "I could not process that request.",
          createdAt: new Date()
        }
      ]),
      memory
    });

    return {};
  };
}

function buildAssistantGraph(options: GraphOptions) {
  return new StateGraph(AssistantStateAnnotation)
    .addNode("loadAuthenticatedContext", loadAuthenticatedContext)
    .addNode("loadConversationContext", buildConversationLoader(options.conversationStore))
    .addNode("normalizeUserMessage", normalizeMessageNode)
    .addNode("classifyIntent", buildIntentClassifier(options.llmProvider))
    .addNode("extractRequestSlots", extractRequestSlotsNode)
    .addNode("extractTransferDraft", buildTransferDraftExtractor(options.llmProvider))
    .addNode("resolveCounterpartyReference", buildCounterpartyResolver(options.llmProvider))
    .addNode(
      "prepareTransferConfirmation",
      buildTransferConfirmationPreparer(options.transferPreparationService)
    )
    .addNode("routeReadOnlyTools", buildToolRouter(options.tools))
    .addNode("composeResponse", buildResponseComposer(options.llmProvider))
    .addNode("saveConversation", buildConversationSaver(options.conversationStore))
    .addEdge(START, "loadAuthenticatedContext")
    .addEdge("loadAuthenticatedContext", "loadConversationContext")
    .addEdge("loadConversationContext", "normalizeUserMessage")
    .addEdge("normalizeUserMessage", "classifyIntent")
    .addEdge("classifyIntent", "extractRequestSlots")
    .addEdge("extractRequestSlots", "extractTransferDraft")
    .addEdge("extractTransferDraft", "resolveCounterpartyReference")
    .addEdge("resolveCounterpartyReference", "prepareTransferConfirmation")
    .addEdge("prepareTransferConfirmation", "routeReadOnlyTools")
    .addEdge("routeReadOnlyTools", "composeResponse")
    .addEdge("composeResponse", "saveConversation")
    .addEdge("saveConversation", END)
    .compile();
}

export async function runAssistantGraph(
  input: RunAssistantInput,
  options: RunAssistantOptions = {}
): Promise<RunAssistantResult> {
  const graph = buildAssistantGraph({
    tools: options.tools ?? readOnlyToolExecutors,
    llmProvider: options.llmProvider,
    conversationStore: options.conversationStore,
    transferPreparationService:
      options.transferPreparationService ?? prepareAiPendingTransfer
  });
  const emptyMemory = createEmptyCounterpartyMemory();
  const initialState: AssistantGraphState = {
    userId: input.userId,
    conversationId: input.conversationId,
    requestId: input.requestId,
    assistantId: input.assistantId ?? DEFAULT_ASSISTANT_ID,
    messages: [{ role: "user", content: input.message }],
    counterpartyMemory: emptyMemory,
    currentTurn: emptyMemory.turn + 1,
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
    confirmation: finalState.confirmation,
    refusalReason: finalState.refusalReason
  };
}
