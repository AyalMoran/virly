import type { AssistantId } from "./assistants.js";

export type AssistantIntent =
  | "balance_inquiry"
  | "recent_transactions"
  | "last_sent_counterparty"
  | "counterparty_transactions"
  | "counterparty_total_sent"
  | "transfer_prepare"
  | "verified_recipients"
  | "transfer_limits"
  | "transfer_status"
  | "general_help"
  | "unsafe_request"
  | "unsupported";

export type AssistantToolName =
  | "getUserAccounts"
  | "getAccountBalance"
  | "getRecentTransactions"
  | "getLastSentCounterparty"
  | "getTransactionsWithCounterparty"
  | "getTotalSentToCounterparty"
  | "getVerifiedRecipients"
  | "getTransferLimits";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  createdAt?: Date;
};

export type ToolResultMetadata = {
  recordCount?: number;
  accountLabel?: string;
  transactionId?: string;
  counterpartyEmail?: string;
  maskedLabel?: string;
  amount?: number;
};

export type AssistantToolResult = {
  toolName: AssistantToolName;
  summary: string;
  metadata: ToolResultMetadata;
};

export type IntentClassification = {
  intent: AssistantIntent;
  refusalReason?: string;
};

export type TransferDraft = {
  recipientReference?: string | null;
  recipientEmail?: string | null;
  amount?: number | null;
  reason?: string | null;
};

export type ClassifyAssistantIntentInput = {
  userMessage: string;
  messages: ChatMessage[];
  counterpartyMemory: CounterpartyMemory;
};

export type CounterpartyRef = {
  email: string;
  maskedLabel: string;
  firstMentionedAtTurn: number;
  lastReferencedAtTurn: number;
};

export type CounterpartyMemory = {
  turn: number;
  lastCounterparty?: CounterpartyRef;
  mentionedCounterparties: CounterpartyRef[];
};

export type CounterpartyReferenceResolution =
  | {
      kind: "none";
      confidence: "low" | "medium" | "high";
    }
  | {
      kind: "last_counterparty";
      confidence: "low" | "medium" | "high";
    }
  | {
      kind: "ordinal_counterparty";
      ordinal: number;
      confidence: "low" | "medium" | "high";
    }
  | {
      kind: "named_counterparty";
      query: string;
      confidence: "low" | "medium" | "high";
    };

export type ResolveCounterpartyReferenceInput = {
  userMessage: string;
  intent: AssistantIntent;
  messages: ChatMessage[];
  memory: CounterpartyMemory;
  transferDraft?: TransferDraft;
};

export type ExtractTransferDraftInput = {
  userMessage: string;
  messages: ChatMessage[];
  counterpartyMemory: CounterpartyMemory;
};

export type TransferConfirmation = {
  id: string;
  type: "transfer";
  recipientEmail: string;
  recipientFirstName: string | null;
  recipientLastName: string | null;
  amount: number;
  reason: string | null;
  expiresAt: string;
};

export type ComposeAssistantResponseInput = {
  assistantId: AssistantId;
  userMessage: string;
  messages: ChatMessage[];
  intent: AssistantIntent;
  toolResults: AssistantToolResult[];
  counterpartyMemory: CounterpartyMemory;
  resolvedCounterparty?: CounterpartyRef;
  transferDraft?: TransferDraft;
  confirmation?: TransferConfirmation;
  refusalReason?: string;
  fallbackMessage: string;
};

export type AssistantLlmProvider = {
  classifyIntent(input: ClassifyAssistantIntentInput): Promise<IntentClassification>;
  extractTransferDraft(input: ExtractTransferDraftInput): Promise<TransferDraft>;
  resolveCounterpartyReference(
    input: ResolveCounterpartyReferenceInput
  ): Promise<CounterpartyReferenceResolution>;
  composeResponse(input: ComposeAssistantResponseInput): Promise<string>;
};

export type ConversationContext = {
  messages: ChatMessage[];
  memory: CounterpartyMemory;
};

export type ConversationSaveInput = {
  userId: string;
  conversationId: string;
  assistantId: AssistantId;
  messages: ChatMessage[];
  memory: CounterpartyMemory;
};

export type ConversationStore = {
  load(userId: string, conversationId: string): Promise<ConversationContext>;
  save(input: ConversationSaveInput): Promise<void>;
};

export type AssistantGraphState = {
  userId?: string;
  conversationId: string;
  requestId?: string;
  assistantId: AssistantId;
  messages: ChatMessage[];
  counterpartyMemory: CounterpartyMemory;
  currentTurn: number;
  detectedIntent?: AssistantIntent;
  selectedAccountId?: string;
  resolvedCounterparty?: CounterpartyRef;
  transferDraft?: TransferDraft;
  confirmation?: TransferConfirmation;
  requestedToolNames: AssistantToolName[];
  executedToolNames: AssistantToolName[];
  toolResults: AssistantToolResult[];
  clarificationMessage?: string;
  refusalReason?: string;
  responseMessage?: string;
};

export type ToolContext = {
  userId: string;
  conversationId: string;
  message: string;
  resolvedCounterparty?: CounterpartyRef;
};

export type ToolExecutor = (
  context: ToolContext
) => Promise<AssistantToolResult>;

export type AssistantToolExecutors = Record<AssistantToolName, ToolExecutor>;

export type AuditLogInput = {
  userId: string;
  conversationId: string;
  requestId?: string;
  assistantId: AssistantId;
  intent: AssistantIntent;
  toolsRequested: string[];
  toolsExecuted: string[];
  refusalReason?: string;
};

export type AuditLogger = (input: AuditLogInput) => Promise<void>;

export type RunAssistantInput = {
  userId?: string;
  conversationId: string;
  requestId?: string;
  assistantId?: AssistantId;
  message: string;
};

export type RunAssistantResult = {
  message: string;
  conversationId: string;
  assistantId: AssistantId;
  intent: AssistantIntent;
  toolCalls: AssistantToolName[];
  confirmation?: TransferConfirmation;
  refusalReason?: string;
};

export type PrepareTransferConfirmationInput = {
  userId: string;
  conversationId: string;
  assistantId: AssistantId;
  draft: TransferDraft;
  resolvedCounterparty?: CounterpartyRef;
};

export type PrepareTransferConfirmationResult =
  | {
      status: "ready";
      confirmation: TransferConfirmation;
    }
  | {
      status: "needs_clarification";
      message: string;
    };

export type TransferPreparationService = (
  input: PrepareTransferConfirmationInput
) => Promise<PrepareTransferConfirmationResult>;
