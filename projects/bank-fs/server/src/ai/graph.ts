import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { DEFAULT_ASSISTANT_ID } from "./assistants.js";
import {
  createEmptyCounterpartyMemory,
  maskEmail,
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
import { buildToolInput } from "./toolInputs.js";
import {
  getUserVisibleSummary,
  getToolDisplayData,
  getResolutionResultData,
  toAssistantToolResult,
  toSafeToolSummary
} from "./toolResults.js";
import { applyToolMemoryUpdates } from "./toolMemory.js";
import type {
  AssistantGraphState,
  AssistantLlmProvider,
  AiGraphDebugEvent,
  AiGraphDebugEventInput,
  AmountResolutionService,
  AssistantToolName,
  AssistantToolExecutors,
  AuditLogger,
  ConversationStore,
  CounterpartyRef,
  CounterpartyMemory,
  ModifyPendingTransferConfirmationResult,
  PendingConfirmationMemory,
  RuntimeToolResult,
  TransferDraft,
  TransferModificationService,
  TransferPreparationService,
  RunAssistantInput,
  RunAssistantResult,
  RunAssistantOptions,
  RunAssistantProgressHandler,
  AiStreamPhase,
  RequiredResponseFact,
  ToolResultMetadata
} from "./state.js";
import { readOnlyToolExecutors } from "./tools/index.js";
import {
  maskEmailsInText,
  normalizeTransferDraftOutput,
  sanitizeMessagesForLlm
} from "./llm.js";
import { resolveContextualAmount } from "./amountResolution.js";
import { config } from "../config.js";
import {
  modifyAiPendingTransfer,
  prepareAiPendingTransfer
} from "../services/aiPendingTransfer.service.js";

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
  supersededConfirmationId: Annotation<AssistantGraphState["supersededConfirmationId"]>(),
  requestedToolNames: Annotation<AssistantGraphState["requestedToolNames"]>(),
  executedToolNames: Annotation<AssistantGraphState["executedToolNames"]>(),
  toolResults: Annotation<AssistantGraphState["toolResults"]>(),
  clarificationRequest: Annotation<AssistantGraphState["clarificationRequest"]>(),
  clarificationMessage: Annotation<string | undefined>(),
  refusalReason: Annotation<string | undefined>(),
  responseMessage: Annotation<string | undefined>(),
  debugTrace: Annotation<AssistantGraphState["debugTrace"]>()
});

type GraphOptions = {
  tools: AssistantToolExecutors;
  llmProvider?: AssistantLlmProvider;
  conversationStore?: ConversationStore;
  onProgress?: RunAssistantProgressHandler;
  amountResolutionService: AmountResolutionService;
  transferPreparationService: TransferPreparationService;
  transferModificationService: TransferModificationService;
};

type GraphNode = (
  state: AssistantGraphState
) => Partial<AssistantGraphState> | Promise<Partial<AssistantGraphState>>;

function getProgressPhaseForNode(
  nodeName: string,
  state: AssistantGraphState
): AiStreamPhase | undefined {
  if (
    nodeName === "normalizeUserMessage" ||
    nodeName === "classifyIntent" ||
    nodeName === "extractRequestSlots"
  ) {
    return "understanding_request";
  }

  if (
    nodeName === "extractTransferDraft" ||
    nodeName === "resolveCounterpartyReference" ||
    nodeName === "resolveContextualAmounts"
  ) {
    return "resolving_context";
  }

  if (nodeName === "routeReadOnlyTools") {
    return getReadOnlyToolsForIntent(state.detectedIntent ?? "unsupported").length > 0
      ? "checking_account_facts"
      : undefined;
  }

  if (
    (nodeName === "prepareTransferConfirmation" ||
      nodeName === "modifyPendingTransferConfirmation") &&
    (
      state.detectedIntent === "transfer_prepare" ||
      state.detectedIntent === "transfer_modify_pending" ||
      state.detectedIntent === "transfer_cancel_pending"
    )
  ) {
    return "preparing_confirmation";
  }

  if (nodeName === "composeResponse") {
    return "composing_response";
  }

  return undefined;
}

function appendDebugEvents(
  currentTrace: AiGraphDebugEvent[] | undefined,
  events: AiGraphDebugEventInput[]
) {
  const createdAt = new Date().toISOString();
  return [
    ...(currentTrace ?? []),
    ...events.map((event) => ({
      ...event,
      createdAt: event.createdAt ?? createdAt
    }))
  ];
}

function withDebugEvents(
  state: AssistantGraphState,
  changes: Partial<AssistantGraphState>,
  events: AiGraphDebugEventInput[]
): Partial<AssistantGraphState> {
  return {
    ...changes,
    debugTrace: appendDebugEvents(changes.debugTrace ?? state.debugTrace, events)
  };
}

function sanitizeErrorReason(error: unknown) {
  return error instanceof Error ? `error:${error.name}` : typeof error;
}

function getZodIssue(error: unknown) {
  if (!error || typeof error !== "object" || !("issues" in error)) {
    return undefined;
  }

  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    return undefined;
  }

  return issues[0] as {
    path?: Array<string | number>;
    code?: string;
    received?: string;
  };
}

function sanitizeString(value: string) {
  return value.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    (email) => maskEmail(email)
  );
}

function sanitizeTransferDraftSnapshot(draft?: TransferDraft | null) {
  if (!draft) {
    return {
      present: false,
      recipientEmail: null,
      recipientReferencePresent: false,
      recipientReferenceType: null,
      amount: null,
      amountTextPresent: false,
      amountReferenceTextPresent: false,
      currency: null,
      currencyMentioned: null,
      currencySupported: null,
      reasonPresent: false,
      missingFields: []
    };
  }

  return {
    present: true,
    recipientEmail: draft.recipientEmail
      ? maskEmail(draft.recipientEmail)
      : null,
    recipientReferencePresent: Boolean(draft.recipientReference),
    recipientReferenceType:
      draft.recipientReference == null ? null : typeof draft.recipientReference,
    amount: typeof draft.amount === "number" ? draft.amount : null,
    amountTextPresent: Boolean(draft.amountText),
    amountReferenceTextPresent: Boolean(draft.amountReferenceText),
    currency: draft.currency ?? null,
    currencyMentioned: draft.currencyMentioned ?? null,
    currencySupported: draft.currencySupported ?? null,
    reasonPresent: Boolean(draft.reason),
    missingFields: draft.missingFields ?? []
  };
}

function sanitizeStateSnapshot(state: AssistantGraphState) {
  return {
    intent: state.detectedIntent ?? null,
    requestedToolNames: state.requestedToolNames,
    executedToolNames: state.executedToolNames,
    clarificationReason: state.clarificationRequest?.reason ?? null,
    hasConfirmation: Boolean(state.confirmation),
    refusalReason: state.refusalReason ?? null,
    transferDraft: sanitizeTransferDraftSnapshot(state.transferDraft)
  };
}

function buildSchemaFailureEvent(input: {
  nodeName: string;
  schemaName: string;
  failureClass: AiGraphDebugEventInput["failureClass"];
  error: unknown;
  fallbackUsed: boolean;
  fallbackReason: string;
}): AiGraphDebugEventInput {
  const issue = getZodIssue(input.error);

  return {
    type: "failure",
    nodeName: input.nodeName,
    schemaName: input.schemaName,
    failureClass: input.failureClass,
    failedField: issue?.path?.join(".") || undefined,
    rawValueType: issue?.received ?? undefined,
    fallbackUsed: input.fallbackUsed,
    fallbackReason: input.fallbackReason,
    details: issue?.code ? { errorCode: sanitizeString(issue.code) } : undefined
  };
}

function withNodeTrace(
  nodeName: string,
  node: GraphNode,
  onProgress?: RunAssistantProgressHandler
): GraphNode {
  return async (state) => {
    const progressPhase = getProgressPhaseForNode(nodeName, state);
    if (progressPhase && onProgress) {
      await onProgress({ phase: progressPhase, nodeName });
    }

    if (!config.ai.debugTrace) {
      return node(state);
    }

    const stateWithStartTrace: AssistantGraphState = {
      ...state,
      debugTrace: appendDebugEvents(state.debugTrace, [
        {
          type: "node_transition",
          nodeName,
          details: { phase: "started" }
        }
      ])
    };
    const result = await node(stateWithStartTrace);
    const mergedState = {
      ...stateWithStartTrace,
      ...result
    };

    return {
      ...result,
      debugTrace: appendDebugEvents(result.debugTrace ?? stateWithStartTrace.debugTrace, [
        {
          type: "node_transition",
          nodeName,
          details: { phase: "completed" },
          snapshot: sanitizeStateSnapshot(mergedState)
        }
      ])
    };
  };
}

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
    if (state.refusalReason || state.detectedIntent) {
      return {};
    }

    const diagnosticEvents: AiGraphDebugEventInput[] = [];
    const classification = await classifyAssistantIntent(
      getUserMessage(state),
      llmProvider,
      {
        messages: state.messages,
        counterpartyMemory: state.counterpartyMemory,
        diagnostics: (event) => {
          diagnosticEvents.push(event);
        }
      }
    );
    const changes = {
      detectedIntent: classification.intent,
      refusalReason: classification.refusalReason
    };

    return diagnosticEvents.length > 0
      ? withDebugEvents(state, changes, diagnosticEvents)
      : changes;
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

function getAmountScopeSelection(message: string) {
  const normalized = message.toLowerCase();

  if (
    /\b(total|previous answer|that total|that amount|answer total)\b/i.test(
      normalized
    ) ||
    /(הסכום הזה|הסכום ההוא|הסה"כ|הסך|הנטו|התשובה הקודמת)/.test(message)
  ) {
    return "last_answer_total";
  }

  if (
    /\b(last sent|last amount|last transfer|what i sent|previous transfer)\b/i.test(
      normalized
    ) ||
    /(האחרון|העברה אחרונה|מה ששלחתי)/.test(message)
  ) {
    return "last_sent_transaction";
  }

  return undefined;
}

function resolveClarificationReplyNode(
  state: AssistantGraphState
): Partial<AssistantGraphState> {
  const clarification = state.counterpartyMemory.clarification;
  if (
    clarification?.expectedReplyType !== "amount_scope" ||
    clarification.resumeIntent !== "transfer_prepare" ||
    !clarification.resumeDraft
  ) {
    return {};
  }

  const selectedScope = getAmountScopeSelection(getUserMessage(state));
  if (!selectedScope) {
    return {};
  }

  const amountReferenceText =
    selectedScope === "last_answer_total"
      ? "that amount"
      : "what I sent him last time";
  const transferDraft: TransferDraft = {
    ...clarification.resumeDraft,
    amount: null,
    amountText: null,
    amountReferenceText
  };
  const resolvedCounterparty = transferDraft.recipientEmail
    ? undefined
    : resolveCounterpartyReferenceDeterministic(
        transferDraft.recipientReference ?? "",
        state.counterpartyMemory
      );

  return withDebugEvents(
    state,
    {
      detectedIntent: "transfer_prepare",
      transferDraft,
      resolvedCounterparty,
      clarificationRequest: undefined,
      clarificationMessage: undefined,
      counterpartyMemory: {
        ...state.counterpartyMemory,
        clarification: null
      }
    },
    [
      {
        type: "clarification",
        nodeName: "resolveClarificationReply",
        failureClass: "clarification_resolved",
        fallbackUsed: false,
        fallbackReason: selectedScope,
        details: {
          expectedReplyType: "amount_scope"
        }
      }
    ]
  );
}

function applySlotDataToDraft(
  draft: TransferDraft,
  state: AssistantGraphState
): TransferDraft {
  const slots = state.requestSlots;
  const amount = slots?.amount;
  const counterparty = slots?.counterparty;
  const nextDraft: TransferDraft = {
    recipientEmail:
      draft.recipientEmail ?? counterparty?.explicitEmail ?? undefined,
    recipientReference:
      draft.recipientReference ?? counterparty?.referenceText ?? undefined,
    amount: draft.amount ?? amount?.value ?? undefined,
    amountText: draft.amountText ?? amount?.rawText ?? undefined,
    amountReferenceText: draft.amountReferenceText,
    currency: draft.currency ?? amount?.currency ?? undefined,
    currencyMentioned:
      draft.currencyMentioned ?? amount?.currencyMentioned ?? false,
    currencySupported:
      draft.currencySupported ?? amount?.currencySupported ?? true,
    reason: draft.reason
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

function extractTransferDraftDeterministic(
  message: string,
  intent: AssistantGraphState["detectedIntent"]
): TransferDraft {
  const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const amountMatch = message.match(
    /(?:\$|usd|nis|ils|shekels?|שקל|שח|ש״ח)?\s*(\d+(?:\.\d{1,2})?)/i
  );
  const amount = amountMatch ? Number(amountMatch[1]) : null;
  const referenceMatch = message.match(
    /\b(he|him|she|her|they|them|him again|her again|them again|same person|same recipient|the guy|the person from before|the last one|this person|that person|this recipient|that recipient)\b/i
  );
  const amountReferenceMatch =
    message.match(
      /\b(same amount\s+(?:i\s+sent\s+(?:him|her|them)|(?:he|she|they)\s+sent\s+me)|what\s+(?:he|she|they)\s+sent\s+me|what\s+i\s+sent\s+(?:him|her|them)|same amount(?:\s+again)?|same as before|same as last time|(?:that|this)\s+(?:amount|total|net)|the\s+(?:last|previous)\s+(?:amount|total|net))\b/i
    ) ??
    message.match(
      /(אותה כמות|אותו סכום|כמו קודם|כמו פעם שעברה|מה שהוא שלח לי|מה שהיא שלחה לי|מה שהם שלחו לי|מה ששלחתי לו|מה ששלחתי לה|מה ששלחתי להם|הסכום הזה|הסכום ההוא|הסכום האחרון|הסה"כ הזה|הסך הזה|הנטו הזה)/
    );
  const reasonMatch =
    message.match(/\b(?:add|set|change)?\s*reason\s+(?:to\s+)?(.{1,80})$/i) ??
    message.match(/(?:סיבה|הסיבה)\s+(.{1,80})$/);
  const recipientNameMatch =
    message.match(/\b(?:to|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s+instead)?\b/) ??
    message.match(/(?:אל|ל)\s*([\u0590-\u05ff]{2,}(?:\s+[\u0590-\u05ff]{2,})?)/);

  const lowerMessage = message.toLowerCase();
  const unsupportedCurrency =
    /(\$|usd|dollar|dollars|דולר|€|eur|euro|euros|אירו|יורו)/i.test(lowerMessage);
  const ilsCurrency =
    /(₪|ils|nis|shekel|shekels|שקל|שח|ש״ח|ש"ח)/i.test(lowerMessage);

  return {
    recipientEmail: email?.toLowerCase() ?? null,
    recipientReference: email
      ? null
      : referenceMatch?.[0] ??
        recipientNameMatch?.[1] ??
        (intent === "transfer_prepare" ? message.trim() : null),
    amount: Number.isFinite(amount) && amount ? amount : null,
    amountText: amountMatch?.[0]?.trim() ?? null,
    amountReferenceText: amount
      ? null
      : amountReferenceMatch?.[0]?.trim() ?? null,
    currency: unsupportedCurrency
      ? /(\$|usd|dollar|dollars|דולר)/i.test(lowerMessage)
        ? "USD"
        : "EUR"
      : ilsCurrency
        ? "ILS"
        : null,
    currencyMentioned: unsupportedCurrency || ilsCurrency,
    currencySupported: !unsupportedCurrency,
    reason: reasonMatch?.[1]?.trim() ?? null
  };
}

function buildTransferDraftExtractor(llmProvider?: AssistantLlmProvider) {
  return async function extractTransferDraft(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (
      state.refusalReason ||
      state.transferDraft ||
      (state.detectedIntent !== "transfer_prepare" &&
        state.detectedIntent !== "transfer_modify_pending")
    ) {
      return {};
    }

    if (llmProvider) {
      try {
        const rawTransferDraft = await llmProvider.extractTransferDraft({
          userMessage: getUserMessage(state),
          messages: state.messages,
          counterpartyMemory: state.counterpartyMemory
        });
        const transferDraft = normalizeTransferDraftOutput(rawTransferDraft);
        const debugEvents = [
          ...(rawTransferDraft.debugEvents ?? []),
          ...(transferDraft.debugEvents ?? [])
        ];
        const nextTransferDraft = applySlotDataToDraft(transferDraft, state);
        const changes = { transferDraft: nextTransferDraft };

        return debugEvents.length
          ? withDebugEvents(state, changes, debugEvents)
          : changes;
      } catch (error) {
        const deterministicDraft = applySlotDataToDraft(
          extractTransferDraftDeterministic(
            getUserMessage(state),
            state.detectedIntent
          ),
          state
        );

        return withDebugEvents(
          state,
          { transferDraft: deterministicDraft },
          [
            buildSchemaFailureEvent({
              nodeName: "extractTransferDraft",
              schemaName: "transferDraftSchema",
              failureClass: "draft_schema_failed",
              error,
              fallbackUsed: true,
              fallbackReason: sanitizeErrorReason(error)
            }),
            {
              type: "fallback",
              nodeName: "extractTransferDraft",
              failureClass: "deterministic_fallback_used",
              fallbackUsed: true,
              fallbackReason: "transfer_draft_extractor_failed",
              snapshot: {
                transferDraft: sanitizeTransferDraftSnapshot(deterministicDraft)
              }
            }
          ]
        );
      }
    }

    const deterministicDraft = applySlotDataToDraft(
      extractTransferDraftDeterministic(
        getUserMessage(state),
        state.detectedIntent
      ),
      state
    );

    return withDebugEvents(
      state,
      { transferDraft: deterministicDraft },
      [
        {
          type: "fallback",
          nodeName: "extractTransferDraft",
          failureClass: "deterministic_fallback_used",
          fallbackUsed: true,
          fallbackReason: "llm_provider_unavailable",
          snapshot: {
            transferDraft: sanitizeTransferDraftSnapshot(deterministicDraft)
          }
        }
      ]
    );
  };
}

function buildClarificationRequest(
  state: AssistantGraphState,
  reason: NonNullable<AssistantGraphState["clarificationRequest"]>["reason"],
  message: string,
  expectedReplyType: NonNullable<AssistantGraphState["clarificationRequest"]>["expectedReplyType"],
  extras: Pick<
    NonNullable<AssistantGraphState["clarificationRequest"]>,
    "options" | "resumeIntent" | "resumeDraft"
  > = {}
) {
  return withDebugEvents(
    state,
    {
      clarificationMessage: message,
      clarificationRequest: {
        reason,
        message,
        expectedReplyType,
        ...extras
      }
    },
    [
      {
        type: "clarification",
        nodeName: "buildClarificationRequest",
        failureClass: "clarification_started",
        fallbackUsed: false,
        fallbackReason: reason,
        details: {
          expectedReplyType
        }
      }
    ]
  );
}

function needsCounterpartyResolution(state: AssistantGraphState) {
  return (
    state.detectedIntent === "counterparty_transactions" ||
    state.detectedIntent === "counterparty_total_sent" ||
    state.detectedIntent === "counterparty_total_received" ||
    state.detectedIntent === "counterparty_net_total" ||
    (state.detectedIntent === "transfer_prepare" &&
      !state.transferDraft?.recipientEmail) ||
    (state.detectedIntent === "transfer_modify_pending" &&
      Boolean(state.transferDraft?.recipientReference) &&
      !state.transferDraft?.recipientEmail)
  );
}

function canUseCounterpartyResolverTool(state: AssistantGraphState) {
  return getReadOnlyToolsForIntent(state.detectedIntent ?? "unsupported").includes(
    "resolveCounterpartyCandidates"
  );
}

function resolvePendingConfirmationRecipientReference(
  state: AssistantGraphState
): CounterpartyRef | undefined {
  const pending = state.counterpartyMemory.pendingConfirmation;
  const recipientReference = state.transferDraft?.recipientReference?.trim();
  if (
    state.detectedIntent !== "transfer_modify_pending" ||
    pending?.status !== "pending" ||
    !recipientReference
  ) {
    return undefined;
  }

  if (
    !/\b(same\s+(person|recipient|counterparty)|this\s+(person|recipient)|that\s+(person|recipient))\b/i.test(
      recipientReference
    ) &&
    !/(אותו|אותה|אותו אחד|אותה אחת|האדם הזה|הנמען הזה|הנמען הקודם|האדם הקודם|האחרון)/.test(
      recipientReference
    )
  ) {
    return undefined;
  }

  const displayName = [
    pending.recipientFirstName,
    pending.recipientLastName
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    email: pending.recipientEmail.toLowerCase(),
    maskedLabel: maskEmail(pending.recipientEmail),
    userLabel: displayName
      ? `${displayName} (${pending.recipientEmail.toLowerCase()})`
      : pending.recipientEmail.toLowerCase(),
    displayName: displayName || undefined,
    firstMentionedAtTurn: pending.turnCreated,
    lastReferencedAtTurn: state.currentTurn
  };
}

function getRequestedToolNamesForState(
  state: AssistantGraphState
): AssistantToolName[] {
  const intent = state.detectedIntent ?? "unsupported";
  const requestedToolNames = [...getReadOnlyToolsForIntent(intent)];

  if (
    intent === "transfer_modify_pending" &&
    state.transferDraft?.recipientReference &&
    !state.transferDraft.recipientEmail &&
    !state.resolvedCounterparty
  ) {
    requestedToolNames.push("resolveCounterpartyCandidates");
  }

  return [...new Set(requestedToolNames)];
}

function buildCounterpartyResolver(llmProvider?: AssistantLlmProvider) {
  return async function resolveCounterpartyReference(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (state.refusalReason || !needsCounterpartyResolution(state)) {
      return {};
    }

    const pendingConfirmationCounterparty =
      resolvePendingConfirmationRecipientReference(state);
    if (pendingConfirmationCounterparty) {
      return {
        resolvedCounterparty: pendingConfirmationCounterparty,
        counterpartyMemory: rememberCounterparty(
          state.counterpartyMemory,
          pendingConfirmationCounterparty,
          state.currentTurn
        )
      };
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
        const deterministicCounterparty = resolveCounterpartyReferenceDeterministic(
          getUserMessage(state),
          state.counterpartyMemory
        );
        const diagnosticEvents: AiGraphDebugEventInput[] = [
          buildSchemaFailureEvent({
            nodeName: "resolveCounterpartyReference",
            schemaName: "referenceResolutionSchema",
            failureClass: "resolver_failed",
            error,
            fallbackUsed: true,
            fallbackReason: sanitizeErrorReason(error)
          }),
          {
            type: "fallback",
            nodeName: "resolveCounterpartyReference",
            failureClass: "deterministic_fallback_used",
            fallbackUsed: true,
            fallbackReason: "counterparty_resolver_failed"
          }
        ];

        if (deterministicCounterparty) {
          return withDebugEvents(
            state,
            {
              resolvedCounterparty: deterministicCounterparty,
              counterpartyMemory: rememberCounterparty(
                state.counterpartyMemory,
                deterministicCounterparty,
                state.currentTurn
              )
            },
            diagnosticEvents
          );
        }

        if (
          state.detectedIntent === "transfer_prepare" ||
          state.detectedIntent === "transfer_modify_pending"
        ) {
          return withDebugEvents(state, {}, diagnosticEvents);
        }

        if (canUseCounterpartyResolverTool(state)) {
          return withDebugEvents(state, {}, diagnosticEvents);
        }

        return withDebugEvents(
          state,
          buildClarificationRequest(
            state,
            "ambiguous_reference",
            "Which recipient should I use for that question?",
            "recipient"
          ),
          diagnosticEvents
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

    if (
      state.detectedIntent === "transfer_prepare" ||
      state.detectedIntent === "transfer_modify_pending"
    ) {
      return {};
    }

    if (canUseCounterpartyResolverTool(state)) {
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
        const clarification = buildClarificationRequest(
          state,
          "missing_amount",
          state.resolvedCounterparty
            ? `How much should I send to ${state.resolvedCounterparty.userLabel ?? state.resolvedCounterparty.email}?`
            : result.message,
          "amount"
        );

        return state.transferDraft?.amountReferenceText
          ? withDebugEvents(state, clarification, [
              {
                type: "failure",
                nodeName: "prepareTransferConfirmation",
                failureClass: "contextual_amount_unresolved",
                fallbackUsed: false,
                fallbackReason: "amount_reference_text_without_resolved_amount",
                details: {
                  amountReferenceTextPresent: true
                }
              }
            ])
          : clarification;
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

function buildContextualAmountResolver(
  amountResolutionService: AmountResolutionService
) {
  return async function resolveContextualAmounts(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (
      !state.userId ||
      state.refusalReason ||
      state.clarificationMessage ||
      (
        state.detectedIntent !== "transfer_prepare" &&
        state.detectedIntent !== "transfer_modify_pending"
      ) ||
      !state.transferDraft?.amountReferenceText ||
      state.transferDraft.amount
    ) {
      return {};
    }

    const result = await amountResolutionService({
      userId: state.userId,
      conversationId: state.conversationId,
      transferDraft: state.transferDraft,
      resolvedCounterparty: state.resolvedCounterparty,
      counterpartyMemory: state.counterpartyMemory
    });

    if (result.status !== "resolved") {
      const clarification =
        result.reason === "ambiguous_amount_scope"
          ? buildClarificationRequest(
              state,
              "ambiguous_amount",
              "Do you mean the last amount from that counterparty, or the total from the previous answer?",
              "amount_scope",
              {
                resumeIntent: "transfer_prepare",
                resumeDraft: state.transferDraft,
                options: [
                  {
                    id: "last_sent_transaction",
                    label: "Last sent amount",
                    value: "last_sent_transaction"
                  },
                  {
                    id: "last_answer_total",
                    label: "Previous answer total",
                    value: "last_answer_total"
                  }
                ]
              }
            )
          : {};

      return withDebugEvents(
        state,
        clarification,
        [
          {
            type: "failure",
            nodeName: "resolveContextualAmounts",
            failureClass: "contextual_amount_unresolved",
            fallbackUsed: false,
            fallbackReason: result.reason,
            details: {
              amountReferenceTextPresent: true
            }
          }
        ]
      );
    }

    const transferDraft: TransferDraft = {
      ...state.transferDraft,
      amount: result.amount.amount,
      currency: result.amount.currency,
      currencyMentioned: state.transferDraft.currencyMentioned ?? false,
      currencySupported: true,
      amountText:
        state.transferDraft.amountText ??
        `${result.amount.amount.toFixed(2)} ${result.amount.currency}`
    };

    return withDebugEvents(
      state,
      { transferDraft },
      [
        {
          type: "snapshot",
          nodeName: "resolveContextualAmounts",
          fallbackUsed: false,
          fallbackReason: result.amount.source,
          details: {
            source: result.amount.source,
            confidence: result.amount.confidence
          },
          snapshot: {
            transferDraft: sanitizeTransferDraftSnapshot(transferDraft)
          }
        }
      ]
    );
  };
}

function getActivePendingConfirmationId(state: AssistantGraphState) {
  const pending = state.counterpartyMemory.pendingConfirmation;
  return pending?.status === "pending" ? pending.confirmationId : undefined;
}

function buildPendingTransferModifier(
  transferModificationService: TransferModificationService
) {
  return async function modifyPendingTransferConfirmation(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    if (
      !state.userId ||
      state.refusalReason ||
      state.clarificationMessage ||
      state.detectedIntent !== "transfer_modify_pending"
    ) {
      return {};
    }

    const activePendingTransferId = getActivePendingConfirmationId(state);
    if (!activePendingTransferId) {
      return buildClarificationRequest(
        state,
        "ambiguous_reference",
        "I do not see an active pending transfer to update. Please prepare a new transfer.",
        "free_text"
      );
    }

    const result: ModifyPendingTransferConfirmationResult =
      await transferModificationService({
        userId: state.userId,
        conversationId: state.conversationId,
        assistantId: state.assistantId,
        activePendingTransferId,
        modificationDraft: state.transferDraft ?? {},
        resolvedCounterparty: state.resolvedCounterparty
      });

    if (result.status === "needs_clarification") {
      return buildClarificationRequest(
        state,
        "ambiguous_reference",
        result.message,
        "free_text"
      );
    }

    return {
      confirmation: result.confirmation,
      supersededConfirmationId: result.supersededConfirmationId
    };
  };
}

function resolvedCounterpartyFromResolutionData(
  data: {
    kind: "counterparty";
    status: "resolved";
    counterparty: {
      email: string;
      maskedLabel: string;
      userLabel?: string;
      displayName?: string;
    };
  },
  turn: number
): CounterpartyRef | undefined {
  return {
    email: data.counterparty.email.toLowerCase(),
    maskedLabel: data.counterparty.maskedLabel,
    userLabel: data.counterparty.userLabel,
    displayName: data.counterparty.displayName,
    firstMentionedAtTurn: turn,
    lastReferencedAtTurn: turn
  };
}

function buildResolutionClarification(result: RuntimeToolResult) {
  const resolution = getResolutionResultData(result);
  if (!resolution || resolution.status === "resolved") {
    return undefined;
  }

  if (resolution.status === "ambiguous") {
    const labels = (resolution.candidates ?? [])
      .map((candidate) => candidate.label)
      .join(", ");
    const message =
      resolution.kind === "counterparty"
        ? labels
          ? `I found multiple matching counterparties: ${labels}. Which one do you mean?`
          : "I found multiple matching counterparties. Which one do you mean?"
        : resolution.kind === "transaction"
          ? labels
            ? `I found multiple matching transactions: ${labels}. Which one do you mean?`
            : "I found multiple matching transactions. Which one do you mean?"
          : labels
            ? `I found multiple pending transfer confirmations: ${labels}. Which one do you mean?`
            : "I found multiple pending transfer confirmations. Which one do you mean?";

    return {
      message,
      request: {
        reason:
          resolution.kind === "counterparty"
            ? ("ambiguous_recipient" as const)
            : resolution.kind === "transaction"
              ? ("ambiguous_transaction" as const)
              : ("ambiguous_pending_transfer" as const),
        expectedReplyType:
          resolution.kind === "counterparty"
            ? ("recipient" as const)
            : resolution.kind === "transaction"
              ? ("transaction" as const)
              : ("pending_transfer" as const),
        options: resolution.candidates?.map((candidate) => ({
          id: candidate.id,
          label: candidate.label,
          value: candidate.value
        }))
      }
    };
  }

  return {
    message:
      resolution.kind === "counterparty"
        ? "I could not find a matching counterparty in your transaction history."
        : resolution.kind === "transaction"
          ? "I could not resolve which transaction you mean. Ask about a numbered item from the latest transaction list, such as the second one."
          : "I could not resolve which pending transfer you mean.",
    request: {
      reason: "unresolved_reference" as const,
      expectedReplyType:
        resolution.kind === "counterparty"
          ? ("recipient" as const)
          : resolution.kind === "transaction"
            ? ("transaction" as const)
            : ("pending_transfer" as const),
      options: resolution.candidates?.map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        value: candidate.value
      }))
    }
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
    const requestedToolNames = getRequestedToolNamesForState(state);
    const toolResults: AssistantGraphState["toolResults"] = [];
    const executedToolNames: AssistantToolName[] = [];
    let resolvedCounterparty = state.resolvedCounterparty;
    let counterpartyMemory = state.counterpartyMemory;

    for (const toolName of requestedToolNames) {
      if (
        toolName === "resolveCounterpartyCandidates" &&
        intent === "transfer_quote" &&
        state.requestSlots?.counterparty?.explicitEmail
      ) {
        continue;
      }

      if (
        toolName === "resolveCounterpartyCandidates" &&
        resolvedCounterparty &&
        (intent === "counterparty_total_received" ||
          intent === "counterparty_net_total")
      ) {
        continue;
      }

      if (!isReadOnlyToolName(toolName)) {
        return {
          requestedToolNames,
          executedToolNames,
          toolResults,
          refusalReason: "forbidden_tool_request"
        };
      }

      const toolExecutor = tools[toolName];
      if (!toolExecutor) {
        return {
          requestedToolNames,
          executedToolNames,
          toolResults,
          clarificationMessage:
            "That account tool is not available yet. I can still help with balances, recent transactions, verified recipients, transfer limits, and preparing transfers for confirmation."
        };
      }

      const toolResult = await toolExecutor(
        buildToolInput(toolName, {
          ...state,
          resolvedCounterparty,
          counterpartyMemory,
          toolResults
        })
      );
      toolResults.push(toolResult);
      executedToolNames.push(toolName);

      counterpartyMemory = applyToolMemoryUpdates(
        counterpartyMemory,
        toolResult.memoryUpdates,
        state.currentTurn
      );

      const resolution = getResolutionResultData(toolResult);
      if (resolution?.kind === "counterparty" && resolution.status === "resolved") {
        const nextResolvedCounterparty = resolvedCounterpartyFromResolutionData(
          resolution,
          state.currentTurn
        );
        if (nextResolvedCounterparty) {
          resolvedCounterparty = nextResolvedCounterparty;
          counterpartyMemory = rememberCounterparty(
            counterpartyMemory,
            nextResolvedCounterparty,
            state.currentTurn
          );
          continue;
        }
      }

      const clarification = buildResolutionClarification(toolResult);
      if (clarification) {
        return {
          requestedToolNames,
          executedToolNames,
          toolResults,
          counterpartyMemory: {
            ...counterpartyMemory,
            clarification: {
              reason: clarification.request.reason,
              message: clarification.message,
              expectedReplyType: clarification.request.expectedReplyType,
              options: clarification.request.options
            }
          },
          resolvedCounterparty,
          clarificationMessage: clarification.message,
          clarificationRequest: {
            reason: clarification.request.reason,
            message: clarification.message,
            expectedReplyType: clarification.request.expectedReplyType,
            options: clarification.request.options
          }
        };
      }
    }

    return {
      requestedToolNames,
      executedToolNames,
      toolResults,
      counterpartyMemory,
      resolvedCounterparty
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
    intent === "transfer_cancel_pending" ||
    intent === "pending_confirmation_status"
  ) {
    if (state.counterpartyMemory.pendingConfirmation?.status === "pending") {
      return "I cannot confirm a transfer from chat text. Please review the current confirmation card and use its Confirm or Deny button.";
    }

    return "I do not see an active transfer confirmation in this conversation. I can prepare a new transfer for explicit confirmation.";
  }

  if (intent === "transfer_modify_pending") {
    if (state.confirmation) {
        return state.normalizedMessage?.containsHebrew
          ? "עדכנתי את ההעברה הממתינה. צריך לבדוק ולאשר את כרטיס האישור החדש לפני שמשהו נשלח."
          : "I updated the pending transfer. Please review the new confirmation card before anything is sent.";
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

  return state.toolResults
    .map((result) => getUserVisibleSummary(result))
    .join(" ");
}

function collectResponseLabelReplacements(
  value: unknown,
  replacements: Array<[from: string, to: string]> = []
) {
  if (!value || typeof value !== "object") {
    return replacements;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectResponseLabelReplacements(item, replacements);
    }
    return replacements;
  }

  const record = value as Record<string, unknown>;
  const llmLabel = typeof record.llmLabel === "string" ? record.llmLabel : undefined;
  const label = typeof record.label === "string" ? record.label : undefined;
  const maskedLabel =
    typeof record.maskedLabel === "string" ? record.maskedLabel : undefined;
  const emailMasked =
    typeof record.emailMasked === "string" ? record.emailMasked : undefined;
  const userLabel =
    typeof record.userLabel === "string" ? record.userLabel : undefined;
  const recipientMaskedLabel =
    typeof record.recipientMaskedLabel === "string"
      ? record.recipientMaskedLabel
      : undefined;
  const recipientLabel =
    typeof record.recipientLabel === "string" ? record.recipientLabel : undefined;
  const recipientEmailMasked =
    typeof record.recipientEmailMasked === "string"
      ? record.recipientEmailMasked
      : undefined;
  const counterpartyMaskedLabel =
    typeof record.counterpartyMaskedLabel === "string"
      ? record.counterpartyMaskedLabel
      : undefined;
  const counterpartyLabel =
    typeof record.counterpartyLabel === "string"
      ? record.counterpartyLabel
      : undefined;

  if (llmLabel && label && llmLabel !== label) {
    replacements.push([llmLabel, label]);
  }

  if (llmLabel && userLabel && llmLabel !== userLabel) {
    replacements.push([llmLabel, userLabel]);
  }

  if (maskedLabel && userLabel && maskedLabel !== userLabel) {
    replacements.push([maskedLabel, userLabel]);
  }

  if (emailMasked && userLabel && emailMasked !== userLabel) {
    replacements.push([emailMasked, userLabel]);
  }

  if (recipientMaskedLabel && recipientLabel && recipientMaskedLabel !== recipientLabel) {
    replacements.push([recipientMaskedLabel, recipientLabel]);
  }

  if (recipientEmailMasked && recipientLabel && recipientEmailMasked !== recipientLabel) {
    replacements.push([recipientEmailMasked, recipientLabel]);
  }

  if (
    counterpartyMaskedLabel &&
    counterpartyLabel &&
    counterpartyMaskedLabel !== counterpartyLabel
  ) {
    replacements.push([counterpartyMaskedLabel, counterpartyLabel]);
  }

  for (const nested of Object.values(record)) {
    collectResponseLabelReplacements(nested, replacements);
  }

  return replacements;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hydrateUserVisibleResponse(
  message: string,
  state: AssistantGraphState
) {
  const replacements: Array<[from: string, to: string]> = [];
  const activeConfirmation =
    state.confirmation ?? state.counterpartyMemory.pendingConfirmation ?? null;

  if (
    state.resolvedCounterparty?.maskedLabel &&
    state.resolvedCounterparty.userLabel &&
    state.resolvedCounterparty.maskedLabel !== state.resolvedCounterparty.userLabel
  ) {
    replacements.push([
      state.resolvedCounterparty.maskedLabel,
      state.resolvedCounterparty.userLabel
    ]);
  }

  for (const counterparty of state.counterpartyMemory.mentionedCounterparties ?? []) {
    if (counterparty.maskedLabel !== counterparty.userLabel && counterparty.userLabel) {
      replacements.push([counterparty.maskedLabel, counterparty.userLabel]);
    }
  }

  for (const result of state.toolResults) {
    collectResponseLabelReplacements(result.data, replacements);
  }

  if (activeConfirmation) {
    const userLabel = buildUserVisibleRecipientLabel({
      recipientEmail: activeConfirmation.recipientEmail,
      recipientFirstName: activeConfirmation.recipientFirstName,
      recipientLastName: activeConfirmation.recipientLastName
    });
    const maskedEmail = maskEmail(activeConfirmation.recipientEmail);
    if (maskedEmail !== userLabel) {
      replacements.push([maskedEmail, userLabel]);
    }

    const maskedRecipientLabel =
      "recipient" in activeConfirmation
        ? activeConfirmation.recipient.displayName
          ? `${activeConfirmation.recipient.displayName} (${maskedEmail})`
          : maskedEmail
        : buildUserVisibleRecipientLabel({
            recipientEmail: activeConfirmation.recipientEmail,
            recipientFirstName: activeConfirmation.recipientFirstName,
            recipientLastName: activeConfirmation.recipientLastName
          }).replace(activeConfirmation.recipientEmail, maskedEmail);
    if (maskedRecipientLabel !== userLabel) {
      replacements.push([maskedRecipientLabel, userLabel]);
    }
  }

  return [...new Map(
    replacements
      .filter(([from, to]) => from && to && from !== to)
      .sort((left, right) => right[0].length - left[0].length)
      .map((pair) => [pair.join("\u0000"), pair])
  ).values()].reduce(
    (text, [from, to]) => text.replace(new RegExp(escapeRegExp(from), "g"), to),
    message
  );
}

function hasUnsafeMoneyMovementClaim(message: string) {
  const normalized = message.toLowerCase();

  return (
    /\b(i\s+)?(sent|submitted|completed|confirmed|approved|processed)\b.*\b(transfer|payment|money|funds)\b/i.test(
      normalized
    ) ||
    /\b(transfer|payment|money|funds)\b.*\b(has been|was|is now)\s+(sent|submitted|completed|confirmed|approved|processed)\b/i.test(
      normalized
    ) ||
    /(ההעברה|התשלום).*?(נשלחה|בוצעה|אושרה)/.test(message)
  );
}

function hasMaskedLabelLeak(message: string, state: AssistantGraphState) {
  const knownMaskedLabels = new Set<string>();
  const activeConfirmation =
    state.confirmation ?? state.counterpartyMemory.pendingConfirmation ?? null;

  const addMaskedLabel = (
    maskedLabel: string | undefined,
    userLabel: string | undefined
  ) => {
    if (maskedLabel && userLabel && maskedLabel !== userLabel) {
      knownMaskedLabels.add(maskedLabel);
    }
  };

  addMaskedLabel(
    state.resolvedCounterparty?.maskedLabel,
    state.resolvedCounterparty?.userLabel
  );

  for (const counterparty of state.counterpartyMemory.mentionedCounterparties) {
    addMaskedLabel(counterparty.maskedLabel, counterparty.userLabel);
  }

  for (const result of state.toolResults) {
    const replacements: Array<[from: string, to: string]> = [];
    collectResponseLabelReplacements(result.data, replacements);
    for (const [from, to] of replacements) {
      addMaskedLabel(from, to);
    }
  }

  if (activeConfirmation) {
    const userLabel = buildUserVisibleRecipientLabel({
      recipientEmail: activeConfirmation.recipientEmail,
      recipientFirstName: activeConfirmation.recipientFirstName,
      recipientLastName: activeConfirmation.recipientLastName
    });
    const maskedEmail = maskEmail(activeConfirmation.recipientEmail);
    addMaskedLabel(maskedEmail, userLabel);

    const maskedRecipientLabel =
      "recipient" in activeConfirmation
        ? activeConfirmation.recipient.displayName
          ? `${activeConfirmation.recipient.displayName} (${maskedEmail})`
          : maskedEmail
        : buildUserVisibleRecipientLabel({
            recipientEmail: activeConfirmation.recipientEmail,
            recipientFirstName: activeConfirmation.recipientFirstName,
            recipientLastName: activeConfirmation.recipientLastName
          }).replace(activeConfirmation.recipientEmail, maskedEmail);
    addMaskedLabel(maskedRecipientLabel, userLabel);
  }

  return [...knownMaskedLabels].some((maskedLabel) => message.includes(maskedLabel));
}

const requiredAmountMetadataFields = [
  "amount",
  "sentAmount",
  "receivedAmount",
  "netAmount"
] as const satisfies ReadonlyArray<keyof ToolResultMetadata>;
const requiredStatusValues = [
  "pending",
  "completed",
  "resolved",
  "expired",
  "denied",
  "failed",
  "cancelled",
  "canceled"
] as const;
const requiredCurrencyValues = ["ILS", "USD", "EUR"] as const;
const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function amountToCents(amount: number) {
  return Math.round(amount * 100);
}

function sanitizeTransferDraftForLlm(
  draft: AssistantGraphState["transferDraft"]
) {
  if (!draft) {
    return null;
  }

  return {
    ...draft,
    recipientReference: draft.recipientReference
      ? maskEmailsInText(draft.recipientReference)
      : draft.recipientReference,
    recipientEmailMasked: draft.recipientEmail
      ? maskEmail(draft.recipientEmail)
      : null
  };
}

function buildUserVisibleRecipientLabel(input: {
  recipientEmail: string;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
}) {
  const name = [input.recipientFirstName, input.recipientLastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return name ? `${name} (${input.recipientEmail})` : input.recipientEmail;
}

function sanitizeConfirmationForLlm(
  confirmation: AssistantGraphState["confirmation"] | PendingConfirmationMemory | null | undefined
) {
  if (!confirmation) {
    return null;
  }

  const recipientEmail = confirmation.recipientEmail;
  const amount =
    "amountDetails" in confirmation
      ? confirmation.amountDetails.value
      : confirmation.amount;
  const currency =
    "amountDetails" in confirmation
      ? confirmation.amountDetails.currency
      : confirmation.currency;
  const formattedAmount =
    "amountDetails" in confirmation
      ? confirmation.amountDetails.formatted
      : `${confirmation.amount.toFixed(2)} ${confirmation.currency}`;
  const reason = "reason" in confirmation ? confirmation.reason ?? null : null;

  return {
    status: confirmation.status,
    recipientMaskedLabel: maskEmail(recipientEmail),
    amount,
    currency,
    formattedAmount,
    reason,
    warningCodes:
      "warnings" in confirmation
        ? confirmation.warnings.map((warning) => warning.code)
        : [],
    expiresAt: confirmation.expiresAt
  };
}

function extractEmails(text: string) {
  return [...text.matchAll(emailPattern)].map((match) => match[0].toLowerCase());
}

function getEmailFromLabel(label: string | undefined) {
  if (!label) {
    return undefined;
  }

  return extractEmails(label)[0];
}

function addRequiredResponseFact(
  facts: Map<string, RequiredResponseFact>,
  fact: RequiredResponseFact,
  dedupeKey: string
) {
  facts.set(dedupeKey, fact);
}

function collectRequiredFactsFromData(
  value: unknown,
  source: string,
  facts: Map<string, RequiredResponseFact>
) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectRequiredFactsFromData(item, `${source}[${index}]`, facts)
    );
    return;
  }

  const record = value as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status.toLowerCase() : undefined;
  if (status && requiredStatusValues.includes(status as typeof requiredStatusValues[number])) {
    addRequiredResponseFact(
      facts,
      {
        kind: "status",
        source: `${source}.status`,
        value: status
      },
      `${source}.status:${status}`
    );
  }

  const currency =
    typeof record.currency === "string" &&
    requiredCurrencyValues.includes(record.currency as typeof requiredCurrencyValues[number])
      ? (record.currency as typeof requiredCurrencyValues[number])
      : undefined;
  if (currency) {
    addRequiredResponseFact(
      facts,
      {
        kind: "currency",
        source: `${source}.currency`,
        value: currency
      },
      `${source}.currency:${currency}`
    );
  }

  const occurredAt =
    typeof record.occurredAt === "string" ? record.occurredAt : undefined;
  if (occurredAt) {
    addRequiredResponseFact(
      facts,
      {
        kind: "date",
        source: `${source}.occurredAt`,
        value: occurredAt
      },
      `${source}.occurredAt:${occurredAt}`
    );
  }

  const expiresAt =
    typeof record.expiresAt === "string" ? record.expiresAt : undefined;
  if (expiresAt) {
    addRequiredResponseFact(
      facts,
      {
        kind: "date",
        source: `${source}.expiresAt`,
        value: expiresAt
      },
      `${source}.expiresAt:${expiresAt}`
    );
  }

  const safeRecipientValue =
    typeof record.counterpartyMaskedLabel === "string"
      ? record.counterpartyMaskedLabel
      : typeof record.recipientMaskedLabel === "string"
        ? record.recipientMaskedLabel
        : undefined;
  const userRecipientValue =
    typeof record.counterpartyLabel === "string"
      ? record.counterpartyLabel
      : typeof record.recipientLabel === "string"
        ? record.recipientLabel
        : undefined;
  const userRecipientEmail =
    typeof record.counterpartyEmail === "string"
      ? record.counterpartyEmail.toLowerCase()
      : getEmailFromLabel(userRecipientValue);

  if (safeRecipientValue && (userRecipientValue || userRecipientEmail)) {
    addRequiredResponseFact(
      facts,
      {
        kind: "recipient",
        source: `${source}.recipient`,
        value: safeRecipientValue,
        ...(userRecipientValue ? { userValue: userRecipientValue } : {}),
        ...(userRecipientEmail ? { userEmail: userRecipientEmail } : {})
      },
      `${source}.recipient:${safeRecipientValue}:${userRecipientEmail ?? userRecipientValue ?? ""}`
    );
  }

  Object.entries(record).forEach(([key, nested]) => {
    if (nested && typeof nested === "object") {
      collectRequiredFactsFromData(nested, `${source}.${key}`, facts);
    }
  });
}

function buildRequiredResponseFacts(
  state: AssistantGraphState
): RequiredResponseFact[] {
  const requiredFacts = new Map<string, RequiredResponseFact>();

  for (const result of state.toolResults) {
    if (result.status !== "ok") {
      continue;
    }

    const metadata = getToolDisplayData(result).metadata;
    for (const field of requiredAmountMetadataFields) {
      const amount = metadata[field];
      if (typeof amount === "number" && Number.isFinite(amount)) {
        requiredFacts.set(
          `${result.toolName}:${field}:${amountToCents(amount)}`,
          {
            kind: "amount",
            source: `${result.toolName}.${field}`,
            value: amount.toFixed(2),
            numericValue: amount
          }
        );
      }
    }

    collectRequiredFactsFromData(result.data, result.toolName, requiredFacts);
  }

  const activeConfirmation =
    state.confirmation ?? state.counterpartyMemory.pendingConfirmation ?? null;
  if (activeConfirmation) {
    addRequiredResponseFact(
      requiredFacts,
      {
        kind: "recipient",
        source: "confirmation.recipient",
        value: maskEmail(activeConfirmation.recipientEmail),
        ...(state.confirmation
          ? { userValue: state.confirmation.recipient.displayName }
          : {}),
        userEmail: activeConfirmation.recipientEmail.toLowerCase()
      },
      `confirmation.recipient:${activeConfirmation.recipientEmail.toLowerCase()}`
    );
    addRequiredResponseFact(
      requiredFacts,
      {
        kind: "status",
        source: "confirmation.status",
        value: activeConfirmation.status
      },
      `confirmation.status:${activeConfirmation.status}`
    );
    addRequiredResponseFact(
      requiredFacts,
      {
        kind: "date",
        source: "confirmation.expiresAt",
        value: activeConfirmation.expiresAt
      },
      `confirmation.expiresAt:${activeConfirmation.expiresAt}`
    );
    addRequiredResponseFact(
      requiredFacts,
      {
        kind: "amount",
        source: "confirmation.amount",
        value: activeConfirmation.amount.toFixed(2),
        numericValue: activeConfirmation.amount
      },
      `confirmation.amount:${amountToCents(activeConfirmation.amount)}`
    );
    addRequiredResponseFact(
      requiredFacts,
      {
        kind: "currency",
        source: "confirmation.currency",
        value: activeConfirmation.currency
      },
      `confirmation.currency:${activeConfirmation.currency}`
    );
  }

  return [...requiredFacts.values()];
}

function extractNumericCents(message: string) {
  const matches = message.match(/[-+]?\d[\d,]*(?:\.\d+)?/g) ?? [];

  return matches
    .map((match) => Number(match.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value))
    .map(amountToCents);
}

function hasMissingRequiredAmountFact(
  message: string,
  requiredResponseFacts: RequiredResponseFact[]
) {
  const requiredAmounts = requiredResponseFacts
    .filter((fact) => fact.kind === "amount")
    .map((fact) => amountToCents(fact.numericValue));
  if (requiredAmounts.length === 0) {
    return false;
  }

  const responseAmounts = new Set(extractNumericCents(message));
  return requiredAmounts.some((amount) => !responseAmounts.has(amount));
}

function hasContradictingRequiredRecipientFact(
  message: string,
  requiredResponseFacts: RequiredResponseFact[]
) {
  const allowedEmails = new Set(
    requiredResponseFacts
      .filter(
        (fact): fact is Extract<RequiredResponseFact, { kind: "recipient" }> =>
          fact.kind === "recipient" && Boolean(fact.userEmail)
      )
      .map((fact) => fact.userEmail as string)
  );
  if (allowedEmails.size === 0) {
    return false;
  }

  const mentionedEmails = extractEmails(message);
  return mentionedEmails.some((email) => !allowedEmails.has(email));
}

function hasContradictingRequiredStatusFact(
  message: string,
  requiredResponseFacts: RequiredResponseFact[]
) {
  const allowedStatuses = new Set(
    requiredResponseFacts
      .filter(
        (fact): fact is Extract<RequiredResponseFact, { kind: "status" }> =>
          fact.kind === "status"
      )
      .map((fact) => fact.value.toLowerCase())
  );
  if (allowedStatuses.size === 0) {
    return false;
  }

  const normalized = message.toLowerCase();
  const mentionedStatuses = requiredStatusValues.filter((status) =>
    new RegExp(`\\b${status}\\b`, "i").test(normalized)
  );
  if (mentionedStatuses.length === 0) {
    return false;
  }

  return mentionedStatuses.some((status) => !allowedStatuses.has(status));
}

function hasContradictingRequiredDateFact(
  message: string,
  requiredResponseFacts: RequiredResponseFact[]
) {
  const allowedDates = requiredResponseFacts.filter(
    (fact): fact is Extract<RequiredResponseFact, { kind: "date" }> =>
      fact.kind === "date"
  );
  if (allowedDates.length === 0) {
    return false;
  }

  const mentionedDates = message.match(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\.\d{3}Z)?\b/g) ?? [];
  if (mentionedDates.length === 0) {
    return false;
  }

  return mentionedDates.some((mentionedDate) =>
    !allowedDates.some((fact) =>
      fact.value === mentionedDate ||
      fact.value.startsWith(mentionedDate) ||
      mentionedDate.startsWith(fact.value.slice(0, 10))
    )
  );
}

function detectMentionedCurrencies(message: string) {
  const mentioned = new Set<typeof requiredCurrencyValues[number]>();
  // TODO:  improve regex robustness
  if (/₪|\bILS\b|\bNIS\b|\bshekels?\b/i.test(message)) {
    mentioned.add("ILS");
  }
  if (/\$|\bUSD\b|\bdollars?\b/i.test(message)) {
    mentioned.add("USD");
  }
  if (/€|\bEUR\b|\beuros?\b/i.test(message)) {
    mentioned.add("EUR");
  }

  return [...mentioned];
}

function hasContradictingRequiredCurrencyFact(
  message: string,
  requiredResponseFacts: RequiredResponseFact[]
) {
  const allowedCurrencies = new Set(
    requiredResponseFacts
      .filter(
        (fact): fact is Extract<RequiredResponseFact, { kind: "currency" }> =>
          fact.kind === "currency"
      )
      .map((fact) => fact.value)
  );
  if (allowedCurrencies.size === 0) {
    return false;
  }

  const mentionedCurrencies = detectMentionedCurrencies(message);
  if (mentionedCurrencies.length === 0) {
    return false;
  }

  return mentionedCurrencies.some((currency) => !allowedCurrencies.has(currency));
}

function getResponsePostCheckFailure(
  message: string,
  state: AssistantGraphState,
  requiredResponseFacts: RequiredResponseFact[]
) {
  if (hasUnsafeMoneyMovementClaim(message)) {
    return "unsafe_money_movement_claim";
  }

  if (hasMaskedLabelLeak(message, state)) {
    return "masked_label_leak";
  }

  if (hasMissingRequiredAmountFact(message, requiredResponseFacts)) {
    return "missing_required_amount_fact";
  }

  if (hasContradictingRequiredCurrencyFact(message, requiredResponseFacts)) {
    return "contradicting_required_currency_fact";
  }

  if (hasContradictingRequiredRecipientFact(message, requiredResponseFacts)) {
    return "contradicting_required_recipient_fact";
  }

  if (hasContradictingRequiredStatusFact(message, requiredResponseFacts)) {
    return "contradicting_required_status_fact";
  }

  if (hasContradictingRequiredDateFact(message, requiredResponseFacts)) {
    return "contradicting_required_date_fact";
  }

  return undefined;
}

function buildResponseComposer(llmProvider?: AssistantLlmProvider) {
  return async function composeResponse(
    state: AssistantGraphState
  ): Promise<Partial<AssistantGraphState>> {
    const assistantToolResults = state.toolResults.map(toAssistantToolResult);
    const safeToolSummaries = state.toolResults.map(toSafeToolSummary);
    const safeConversationSummary = {
      recentMessages: sanitizeMessagesForLlm(state.messages)
        .slice(-6)
        .map((message) => ({
          role: message.role,
          content: message.content
        }))
    };
    const safeResolvedReferences = {
      resolvedCounterpartyMaskedLabel: state.resolvedCounterparty?.maskedLabel,
      transferDraft: sanitizeTransferDraftForLlm(state.transferDraft),
      confirmation: sanitizeConfirmationForLlm(
        state.confirmation ?? state.counterpartyMemory.pendingConfirmation
      )
    };
    const requiredResponseFacts = buildRequiredResponseFacts(state);
    const userFallbackMessage = composeDeterministicResponse(state);
    const llmFallbackMessage = assistantToolResults.length > 0
      ? assistantToolResults.map((result) => result.summary).join(" ")
      : userFallbackMessage;

    if (
      !llmProvider ||
      state.clarificationMessage ||
      state.refusalReason ||
      state.detectedIntent === "transfer_prepare" ||
      state.detectedIntent === "transfer_modify_pending"
    ) {
      return { responseMessage: userFallbackMessage };
    }

    try {
      const responseMessage = await llmProvider.composeResponse({
        assistantId: state.assistantId,
        userMessage: getUserMessage(state),
        intent: state.detectedIntent ?? "unsupported",
        safeToolSummaries,
        safeConversationSummary,
        safeResolvedReferences,
        requiredResponseFacts,
        refusalReason: state.refusalReason,
        fallbackMessage: llmFallbackMessage
      });

      const hydratedMessage =
        hydrateUserVisibleResponse(
          responseMessage.trim() || userFallbackMessage,
          state
        ) || userFallbackMessage;
      const postCheckFailure = getResponsePostCheckFailure(
        hydratedMessage,
        state,
        requiredResponseFacts
      );

      if (postCheckFailure) {
        return withDebugEvents(
          state,
          { responseMessage: userFallbackMessage },
          [
            {
              type: "fallback",
              nodeName: "composeResponse",
              failureClass: "deterministic_fallback_used",
              fallbackUsed: true,
              fallbackReason: `response_post_check_failed:${postCheckFailure}`
            }
          ]
        );
      }

      return {
        responseMessage: hydratedMessage
      };
    } catch (error) {
      return withDebugEvents(
        state,
        { responseMessage: userFallbackMessage },
        [
          {
            type: "fallback",
            nodeName: "composeResponse",
            failureClass: "deterministic_fallback_used",
            fallbackUsed: true,
            fallbackReason: `response_composer_failed:${sanitizeErrorReason(error)}`
          }
        ]
      );
    }
  };
}

function buildConversationSaver(conversationStore?: ConversationStore) {
  function buildAnswerFrameQueryContext(state: AssistantGraphState) {
    const totalResult = [...state.toolResults].reverse().find((result) =>
      [
        "getTotalSentToCounterparty",
        "getTotalReceivedFromCounterparty",
        "getNetWithCounterparty"
      ].includes(result.toolName)
    );

    if (!totalResult || totalResult.status !== "ok") {
      return undefined;
    }

    const metadata = getToolDisplayData(totalResult).metadata;
    const direction =
      totalResult.toolName === "getTotalSentToCounterparty"
        ? ("sent" as const)
        : totalResult.toolName === "getTotalReceivedFromCounterparty"
          ? ("received" as const)
          : ("both" as const);

    return {
      counterpartyEmail: metadata.counterpartyEmail,
      direction,
      amountRole: "total" as const
    };
  }

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
          primaryEntities:
            state.counterpartyMemory.entities
              ?.slice(-5)
              .map((entity) => entity.id) ?? [],
          secondaryEntities: [],
          queryContext: buildAnswerFrameQueryContext(state),
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
                displayName:
                  state.resolvedCounterparty.userLabel ??
                  state.resolvedCounterparty.email,
                email: state.resolvedCounterparty.email,
                aliases: state.resolvedCounterparty.aliases ?? [
                  state.resolvedCounterparty.userLabel ??
                    state.resolvedCounterparty.email,
                  state.resolvedCounterparty.maskedLabel
                ]
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
    .addNode(
      "loadAuthenticatedContext",
      withNodeTrace(
        "loadAuthenticatedContext",
        loadAuthenticatedContext,
        options.onProgress
      )
    )
    .addNode(
      "loadConversationContext",
      withNodeTrace(
        "loadConversationContext",
        buildConversationLoader(options.conversationStore),
        options.onProgress
      )
    )
    .addNode(
      "normalizeUserMessage",
      withNodeTrace(
        "normalizeUserMessage",
        normalizeMessageNode,
        options.onProgress
      )
    )
    .addNode(
      "resolveClarificationReply",
      withNodeTrace(
        "resolveClarificationReply",
        resolveClarificationReplyNode,
        options.onProgress
      )
    )
    .addNode(
      "classifyIntent",
      withNodeTrace(
        "classifyIntent",
        buildIntentClassifier(options.llmProvider),
        options.onProgress
      )
    )
    .addNode(
      "extractRequestSlots",
      withNodeTrace(
        "extractRequestSlots",
        extractRequestSlotsNode,
        options.onProgress
      )
    )
    .addNode(
      "extractTransferDraft",
      withNodeTrace(
        "extractTransferDraft",
        buildTransferDraftExtractor(options.llmProvider),
        options.onProgress
      )
    )
    .addNode(
      "resolveCounterpartyReference",
      withNodeTrace(
        "resolveCounterpartyReference",
        buildCounterpartyResolver(options.llmProvider),
        options.onProgress
      )
    )
    .addNode(
      "resolveContextualAmounts",
      withNodeTrace(
        "resolveContextualAmounts",
        buildContextualAmountResolver(options.amountResolutionService),
        options.onProgress
      )
    )
    .addNode(
      "prepareTransferConfirmation",
      withNodeTrace(
        "prepareTransferConfirmation",
        buildTransferConfirmationPreparer(options.transferPreparationService),
        options.onProgress
      )
    )
    .addNode(
      "modifyPendingTransferConfirmation",
      withNodeTrace(
        "modifyPendingTransferConfirmation",
        buildPendingTransferModifier(options.transferModificationService),
        options.onProgress
      )
    )
    .addNode(
      "routeReadOnlyTools",
      withNodeTrace(
        "routeReadOnlyTools",
        buildToolRouter(options.tools),
        options.onProgress
      )
    )
    .addNode(
      "composeResponse",
      withNodeTrace(
        "composeResponse",
        buildResponseComposer(options.llmProvider),
        options.onProgress
      )
    )
    .addNode(
      "saveConversation",
      withNodeTrace(
        "saveConversation",
        buildConversationSaver(options.conversationStore),
        options.onProgress
      )
    )
    .addEdge(START, "loadAuthenticatedContext")
    .addEdge("loadAuthenticatedContext", "loadConversationContext")
    .addEdge("loadConversationContext", "resolveClarificationReply")
    .addEdge("resolveClarificationReply", "normalizeUserMessage")
    .addEdge("normalizeUserMessage", "classifyIntent")
    .addEdge("classifyIntent", "extractRequestSlots")
    .addEdge("extractRequestSlots", "extractTransferDraft")
    .addEdge("extractTransferDraft", "resolveCounterpartyReference")
    .addEdge("resolveCounterpartyReference", "resolveContextualAmounts")
    .addEdge("resolveContextualAmounts", "routeReadOnlyTools")
    .addEdge("routeReadOnlyTools", "prepareTransferConfirmation")
    .addEdge("prepareTransferConfirmation", "modifyPendingTransferConfirmation")
    .addEdge("modifyPendingTransferConfirmation", "composeResponse")
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
    onProgress: options.onProgress,
    amountResolutionService:
      options.amountResolutionService ?? resolveContextualAmount,
    transferPreparationService:
      options.transferPreparationService ?? prepareAiPendingTransfer,
    transferModificationService:
      options.transferModificationService ?? modifyAiPendingTransfer
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
      refusalReason: finalState.refusalReason,
      diagnostics: finalState.debugTrace ?? []
    });
  }

  return {
    message: finalState.responseMessage ?? "I could not process that request.",
    conversationId: input.conversationId,
    assistantId: finalState.assistantId,
    intent,
    toolCalls: finalState.executedToolNames,
    toolResults: finalState.toolResults.map((result) => ({
      toolName: result.toolName,
      status: result.status
    })),
    clarification: finalState.clarificationRequest,
    confirmation: finalState.confirmation,
    supersededConfirmationId: finalState.supersededConfirmationId,
    refusalReason: finalState.refusalReason
  };
}
