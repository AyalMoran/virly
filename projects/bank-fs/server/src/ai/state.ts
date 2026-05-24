import type { AssistantId } from "./assistants.js";

export const assistantIntentValues = [
  "balance_inquiry",
  "account_summary",
  "recent_transactions",
  "transaction_search",
  "transaction_summary",
  "transaction_count",
  "transaction_detail",
  "transaction_stats",
  "cashflow_summary",
  "counterparty_lookup",
  "recent_sent_counterparties",
  "recent_received_counterparties",
  "counterparty_summary",
  "counterparty_activity_timeline",
  "last_sent_counterparty",
  "counterparty_transactions",
  "counterparty_total_sent",
  "verified_recipients",
  "recipient_profile",
  "transfer_prepare",
  "transfer_modify_pending",
  "transfer_cancel_pending",
  "transfer_limits",
  "transfer_eligibility",
  "transfer_quote",
  "daily_transfer_usage",
  "transfer_status",
  "pending_ai_transfers",
  "pending_confirmation_status",
  "general_help",
  "unsafe_request",
  "unsupported"
] as const;

export type AssistantIntent = (typeof assistantIntentValues)[number];

export const assistantToolNames = [
  "getUserAccounts",
  "getAccountBalance",
  "getRecentTransactions",
  "getLastSentCounterparty",
  "getTransactionsWithCounterparty",
  "getTotalSentToCounterparty",
  "getVerifiedRecipients",
  "getTransferLimits",
  "getRecentSentCounterparties",
  "getRecentReceivedCounterparties",
  "getCounterpartySummary",
  "getCounterpartyActivityTimeline",
  "resolveCounterpartyCandidates",
  "searchTransactions",
  "getTransactionStats",
  "resolveTransactionReference",
  "getTransactionReceipt",
  "getTransferEligibility",
  "getTransferQuote",
  "getDailyTransferUsage",
  "getPendingAiTransfers",
  "resolvePendingTransferReference",
  "getCashflowSummary",
  "getMyProfile",
  "getAvailableActions"
] as const;

export type AssistantToolName = (typeof assistantToolNames)[number];
export type ReadOnlyToolName = AssistantToolName;

export type AiToolContext = {
  authenticatedUserId: string;
  conversationId: string;
  requestId: string;
  now: Date;
  timezone: string;
};

export type AiToolStatus = "ok" | "empty" | "error";

export type AiToolMemoryUpdate = {
  counterparties?: Array<{
    counterpartyId: string;
    emailFullForBackendOnly: string;
    emailMasked: string;
    displayName: string;
    firstName?: string | null;
    lastName?: string | null;
    relation: "sent_to" | "received_from" | "both";
    source: "transaction" | "verified_recipient" | "profile";
    lastInteractionAt?: string | null;
  }>;
  transactions?: Array<{
    transactionId: string;
    label: string;
    counterpartyId?: string | null;
    counterpartyLabel?: string | null;
    amount: number;
    currency: string;
    direction: "sent" | "received";
    occurredAt: string;
  }>;
  pendingTransfers?: Array<{
    pendingTransferId: string;
    label: string;
    recipientLabel: string;
    amount: number;
    currency: string;
    expiresAt: string;
  }>;
  dateRanges?: Array<{
    label: string;
    from: string;
    to: string;
  }>;
};

export type AiToolResult<TData> = {
  toolName: ReadOnlyToolName;
  status: AiToolStatus;
  data: TData | null;
  displayData?: unknown;
  memoryUpdates?: AiToolMemoryUpdate;
  error?: {
    code: string;
    message: string;
  };
};

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
  displayName?: string;
  counterparties?: Array<{
    counterpartyEmail: string;
    maskedLabel: string;
    displayName?: string;
  }>;
  resolutionStatus?: "resolved" | "ambiguous" | "unresolved";
  counterpartyCandidates?: Array<{
    counterpartyEmail: string;
    maskedLabel: string;
    displayName?: string;
    confidence?: "low" | "medium" | "high";
  }>;
  transactions?: Array<{
    transactionId: string;
    label: string;
    amount: number;
    currency: string;
    direction: "sent" | "received";
    occurredAt: string;
    counterpartyLabel?: string;
  }>;
  transactionResolutionStatus?: "resolved" | "ambiguous" | "unresolved";
  transactionCandidates?: Array<{
    transactionId: string;
    label: string;
    amount: number;
    currency: string;
    direction: "sent" | "received";
    occurredAt: string;
    counterpartyLabel?: string;
  }>;
  pendingTransfers?: Array<{
    pendingTransferId: string;
    label: string;
    recipientLabel: string;
    amount: number;
    currency: string;
    expiresAt: string;
  }>;
  pendingTransferResolutionStatus?: "resolved" | "ambiguous" | "unresolved";
  pendingTransferCandidates?: Array<{
    pendingTransferId: string;
    label: string;
    recipientLabel: string;
    amount: number;
    currency: string;
    expiresAt: string;
  }>;
  amount?: number;
};

export type ToolDisplayData = {
  summary: string;
  userSummary?: string;
  metadata: ToolResultMetadata;
};

export type AssistantToolResult = {
  toolName: AssistantToolName;
  summary: string;
  metadata: ToolResultMetadata;
};

export type PublicAiToolCallResult = {
  toolName: AssistantToolName;
  status: AiToolStatus;
};

export type IntentClassification = {
  intent: AssistantIntent;
  refusalReason?: string;
};

export type CurrencyCode = "ILS" | "USD" | "EUR";
export type CurrencySlotValue = CurrencyCode | "UNKNOWN";

export type NormalizedUserMessage = {
  originalText: string;
  detectedLanguages: Array<"he" | "en" | "mixed" | "unknown">;
  normalizedText: string;
  direction: "rtl" | "ltr" | "mixed";
  containsHebrew: boolean;
  containsCurrencySymbol: boolean;
  containsDateExpression: boolean;
};

export type RequestSlots = {
  intent: AssistantIntent;
  counterparty?: {
    referenceText?: string | null;
    explicitEmail?: string | null;
    explicitName?: string | null;
  };
  amount?: {
    rawText?: string | null;
    value?: number | null;
    currency?: CurrencySlotValue | null;
    currencyMentioned?: boolean;
    currencySupported?: boolean;
  };
  dateRange?: {
    rawText?: string | null;
    resolvedFrom?: string | null;
    resolvedTo?: string | null;
  };
  transactionDirection?: "sent" | "received" | "both" | null;
  ordinalReference?: {
    rawText: string;
    ordinal: number;
  } | null;
  pendingTransferReference?: {
    rawText: string;
    kind: "current_card" | "last_pending" | "specific";
  } | null;
};

export type TransferDraft = {
  recipientReference?: string | null;
  recipientEmail?: string | null;
  amount?: number | null;
  amountText?: string | null;
  amountReferenceText?: string | null;
  currency?: CurrencySlotValue | null;
  currencyMentioned?: boolean;
  currencySupported?: boolean;
  reason?: string | null;
  missingFields?: Array<"recipient" | "amount" | "currency" | "reason">;
};

export type ClassifyAssistantIntentInput = {
  userMessage: string;
  messages: ChatMessage[];
  counterpartyMemory: CounterpartyMemory;
};

export type CounterpartyRef = {
  email: string;
  maskedLabel: string;
  userLabel?: string;
  displayName?: string;
  aliases?: string[];
  firstMentionedAtTurn: number;
  lastReferencedAtTurn: number;
};

export type ConversationEntityType =
  | "counterparty"
  | "account"
  | "transaction"
  | "pending_transfer"
  | "transfer_draft"
  | "date_range"
  | "amount"
  | "currency";

export type ConversationEntity = {
  id: string;
  type: ConversationEntityType;
  turnIntroduced: number;
  turnLastReferenced: number;
  source: "tool_result" | "user_message" | "assistant_response" | "transfer_draft";
  confidence: "low" | "medium" | "high";
  displayName?: string;
  email?: string;
  userId?: string;
  transactionId?: string;
  pendingTransferId?: string;
  amount?: number;
  currency?: string;
  expiresAt?: string;
  dateRange?: {
    from: string;
    to: string;
    label?: string;
  };
  aliases: string[];
};

export type ConversationAnswerFrame = {
  id: string;
  turn: number;
  intent: AssistantIntent;
  userMessage: string;
  assistantSummary: string;
  primaryEntities: string[];
  secondaryEntities: string[];
  queryContext?: {
    dateRange?: {
      from: string;
      to: string;
      label?: string;
    };
    direction?: "sent" | "received" | "both";
    amountRange?: {
      min?: number;
      max?: number;
    };
  };
  toolResultRefs: Array<{
    toolName: AssistantToolName;
    resultId: string;
  }>;
};

export type PendingConfirmationMemory = {
  confirmationId: string;
  type: "transfer";
  status: "pending" | "confirmed" | "denied" | "expired" | "superseded";
  createdAt: string;
  expiresAt: string;
  recipientEmail: string;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  amount: number;
  currency: CurrencyCode;
  reason?: string | null;
  turnCreated: number;
  version: number;
};

export type ClarificationRequest = {
  reason:
    | "missing_recipient"
    | "ambiguous_recipient"
    | "missing_amount"
    | "ambiguous_amount"
    | "unsupported_currency"
    | "missing_date_range"
    | "ambiguous_reference"
    | "ambiguous_transaction"
    | "ambiguous_pending_transfer"
    | "unresolved_reference";
  message: string;
  options?: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  expectedReplyType:
    | "recipient"
    | "amount"
    | "currency"
    | "date_range"
    | "transaction"
    | "pending_transfer"
    | "yes_no"
    | "option_selection"
    | "free_text";
};

export type ConversationMode =
  | "idle"
  | "answering_read_only"
  | "awaiting_clarification"
  | "transfer_draft_in_progress"
  | "transfer_confirmation_pending"
  | "transfer_confirmed"
  | "transfer_denied";

export type CounterpartyMemory = {
  turn: number;
  lastCounterparty?: CounterpartyRef;
  mentionedCounterparties: CounterpartyRef[];
  entities?: ConversationEntity[];
  answerFrames?: ConversationAnswerFrame[];
  pendingConfirmation?: PendingConfirmationMemory | null;
  clarification?: ClarificationRequest | null;
  mode?: ConversationMode;
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
  version: number;
  type: "transfer";
  status: "pending";
  recipientEmail: string;
  recipientFirstName: string | null;
  recipientLastName: string | null;
  amount: number;
  currency: CurrencyCode;
  recipient: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
    verified: boolean;
  };
  amountDetails: {
    value: number;
    currency: CurrencyCode;
    formatted: string;
  };
  reason: string | null;
  warnings: Array<{
    code:
      | "MISSING_RECIPIENT_NAME"
      | "NEW_RECIPIENT"
      | "HIGH_AMOUNT"
      | "NEAR_DAILY_LIMIT"
      | "CURRENCY_ASSUMED";
    message: string;
  }>;
  expiresAt: string;
  supersedesId?: string | null;
  confirmAction: {
    method: "POST";
    path: string;
    body: {
      action: "confirm";
      version: number;
    };
  };
  denyAction: {
    method: "POST";
    path: string;
    body: {
      action: "deny";
      version: number;
    };
  };
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
  normalizedMessage?: NormalizedUserMessage;
  requestSlots?: RequestSlots;
  resolvedCounterparty?: CounterpartyRef;
  transferDraft?: TransferDraft;
  confirmation?: TransferConfirmation;
  supersededConfirmationId?: string;
  requestedToolNames: AssistantToolName[];
  executedToolNames: AssistantToolName[];
  toolResults: RuntimeToolResult[];
  clarificationRequest?: ClarificationRequest;
  clarificationMessage?: string;
  refusalReason?: string;
  responseMessage?: string;
};

export type ToolContext = {
  userId: string;
  conversationId: string;
  message: string;
  resolvedCounterparty?: CounterpartyRef;
  resolvedTransactionId?: string;
  counterpartyMemory?: CounterpartyMemory;
  clarification?: ClarificationRequest | null;
  requestSlots?: RequestSlots;
  currentTurn?: number;
  resolvedDateRange?: {
    from: Date;
    to: Date;
    label: string;
  };
};

export type RuntimeToolResult<TData = unknown> = AiToolResult<TData> & {
  displayData?: ToolDisplayData;
};

export type ToolExecutor<TInput = ToolContext, TData = unknown> = (
  input: TInput
) => Promise<RuntimeToolResult<TData>>;

export type AssistantToolExecutors = Partial<Record<AssistantToolName, ToolExecutor>>;

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
  toolResults?: PublicAiToolCallResult[];
  clarification?: ClarificationRequest;
  confirmation?: TransferConfirmation;
  supersededConfirmationId?: string;
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

export type ModifyPendingTransferConfirmationInput = {
  userId: string;
  conversationId: string;
  assistantId: AssistantId;
  activePendingTransferId: string;
  modificationDraft: TransferDraft;
  resolvedCounterparty?: CounterpartyRef;
};

export type ModifyPendingTransferConfirmationResult =
  | {
      status: "ready";
      confirmation: TransferConfirmation;
      supersededConfirmationId: string;
    }
  | {
      status: "needs_clarification";
      message: string;
    };

export type TransferModificationService = (
  input: ModifyPendingTransferConfirmationInput
) => Promise<ModifyPendingTransferConfirmationResult>;
