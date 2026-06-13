import type { BaseMessage } from "@langchain/core/messages";
import type { AssistantId } from "./assistants.js";
import type {
  AssistantResponseBlock,
  AssistantResponseFormatVersion
} from "./responseBlocks.js";
import type {
  ResponseSituation,
  ResponseStyleContext,
  RiskLevel,
  PersonalityLintResult
} from "./responseStyle.js";

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
  "counterparty_total_received",
  "counterparty_net_total",
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
  "getTotalReceivedFromCounterparty",
  "getNetWithCounterparty",
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

export type AiGraphFailureClass =
  | "classifier_failed"
  | "draft_schema_failed"
  | "draft_partial_recovered"
  | "resolver_failed"
  | "deterministic_fallback_used"
  | "contextual_amount_unresolved"
  | "clarification_started"
  | "clarification_resolved";

export type AiGraphDebugEventType =
  | "failure"
  | "fallback"
  | "clarification"
  | "node_transition"
  | "snapshot";

type AiGraphDebugValue =
  | string
  | number
  | boolean
  | null
  | AiGraphDebugValue[]
  | { [key: string]: AiGraphDebugValue };

export type AiGraphDebugEvent = {
  type: AiGraphDebugEventType;
  nodeName: string;
  createdAt: string;
  failureClass?: AiGraphFailureClass;
  schemaName?: string;
  failedField?: string;
  rawValueType?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  details?: Record<string, AiGraphDebugValue>;
  snapshot?: Record<string, AiGraphDebugValue>;
};

export type AiGraphDebugEventInput = Omit<
  AiGraphDebugEvent,
  "createdAt"
> & {
  createdAt?: string;
};

export type AiDiagnosticsRecorder = (
  event: AiGraphDebugEventInput
) => void;

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
  totals?: Array<{
    id: string;
    counterpartyEmail?: string;
    direction: "sent" | "received" | "net";
    amount: number;
    currency: "ILS";
    sourceToolName: AssistantToolName;
    aliases: string[];
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

export type StoredChatRole = "user" | "assistant";

/**
 * The persisted/on-disk + provider-projection message shape.
 * MongoDB stores conversation history as `{ role, content, createdAt }`;
 * this type is the boundary representation, distinct from the in-graph
 * `BaseMessage[]` history introduced by the messages migration.
 */
export type StoredChatMessage = {
  role: StoredChatRole;
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
    status?: "completed";
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
    status?: "pending";
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
  sentAmount?: number;
  receivedAmount?: number;
  netAmount?: number;
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

export type SafeToolSummary = {
  toolName: AssistantToolName;
  summary: string;
  metadata: Record<string, unknown>;
};

export type SafeConversationSummary = {
  recentMessages: Array<{
    role: StoredChatRole;
    content: string;
  }>;
};

export type SafeTransferDraft = {
  recipientReference?: string | null;
  recipientEmailMasked?: string | null;
  amount?: number | null;
  amountText?: string | null;
  amountReferenceText?: string | null;
  currency?: CurrencyCode | "UNKNOWN" | null;
  currencyMentioned?: boolean;
  currencySupported?: boolean;
  reason?: string | null;
};

export type SafeTransferConfirmation = {
  status: PendingConfirmationMemory["status"];
  recipientMaskedLabel: string;
  amount: number;
  currency: CurrencyCode;
  formattedAmount: string;
  reason: string | null;
  warningCodes: TransferConfirmation["warnings"][number]["code"][];
  expiresAt: string;
};

export type SafeResolvedReferences = {
  resolvedCounterpartyMaskedLabel?: string;
  transferDraft?: SafeTransferDraft | null;
  confirmation?: SafeTransferConfirmation | null;
};

export type RequiredResponseFact = {
  kind: "amount";
  source: string;
  value: string;
  numericValue: number;
} | {
  kind: "currency";
  source: string;
  value: CurrencyCode;
} | {
  kind: "recipient";
  source: string;
  value: string;
  userValue?: string;
  userEmail?: string;
} | {
  kind: "date";
  source: string;
  value: string;
} | {
  kind: "status";
  source: string;
  value: string;
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

export type AiUserRequest = {
  intent: AssistantIntent;
  language: "he" | "en" | "mixed" | "unknown";
  operation:
    | "read"
    | "prepare_transfer"
    | "modify_pending_transfer"
    | "clarify"
    | "help"
    | "unsafe";
  counterpartyRef?: {
    rawText: string;
    kind:
      | "explicit_email"
      | "visible_label"
      | "name"
      | "pronoun"
      | "ordinal"
      | "last_counterparty"
      | "current_pending_recipient";
    email?: string | null;
    query?: string | null;
    ordinal?: number | null;
  };
  amountRef?: {
    rawText: string;
    kind:
      | "literal"
      | "same_as_last_transfer"
      | "same_as_last_sent_to_counterparty"
      | "same_as_last_received_from_counterparty"
      | "same_as_previous_answer_total"
      | "same_as_pending_transfer"
      | "unknown";
    value?: number | null;
    currency?: CurrencySlotValue | null;
  };
  dateRangeRef?: {
    rawText: string;
    kind:
      | "today"
      | "yesterday"
      | "this_week"
      | "last_week"
      | "this_month"
      | "last_month"
      | "relative"
      | "unknown";
    resolvedFrom?: string | null;
    resolvedTo?: string | null;
  };
  direction?: "sent" | "received" | "both" | null;
  reason?: string | null;
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

export type TransferDraftExtraction = TransferDraft & {
  debugEvents?: AiGraphDebugEventInput[];
};

/**
 * The base value an amount expression draws from before deterministic
 * arithmetic is applied. The LLM only ever names a source; deterministic code
 * resolves it to a concrete number.
 */
export type AmountSource =
  | "literal"
  | "pending_amount"
  | "discussed_amount"
  | "last_received_from"
  | "last_sent_to"
  | "answer_total";

export type AmountExprOp = "mul" | "div" | "add" | "sub";

/**
 * A compositional amount expression: a base source plus an optional arithmetic
 * operation. All arithmetic is performed by `evaluateAmountExpr`; the model
 * never emits the resulting money value.
 */
export type AmountExpr = {
  base: AmountSource;
  op?: AmountExprOp;
  operand?: number;
};

export type ResolvedAmountRef = {
  amount: number;
  currency: "ILS";
  source:
    | "literal_user_message"
    | "last_pending_transfer"
    | "pending_confirmation"
    | "discussed_amount"
    | "last_sent_transaction"
    | "last_received_transaction"
    | "last_answer_total_sent"
    | "last_answer_total_received"
    | "last_answer_total_net"
    | "clarification_reply";
  confidence: "low" | "medium" | "high";
  explanation: string;
};

export type ClassifyAssistantIntentInput = {
  userMessage: string;
  messages: StoredChatMessage[];
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
  | "total"
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
  counterpartyEmail?: string;
  direction?: "sent" | "received" | "both" | "net";
  sourceToolName?: AssistantToolName;
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
    counterpartyEmail?: string;
    dateRange?: {
      from: string;
      to: string;
      label?: string;
    };
    direction?: "sent" | "received" | "both";
    amountRole?: "literal" | "total" | "last_transaction";
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

export const clarificationReasonValues = [
  "missing_recipient",
  "ambiguous_recipient",
  "missing_amount",
  "ambiguous_amount",
  "unsupported_currency",
  "missing_date_range",
  "ambiguous_reference",
  "ambiguous_transaction",
  "ambiguous_pending_transfer",
  "unresolved_reference"
] as const;

export const clarificationReplyTypeValues = [
  "recipient",
  "amount",
  "amount_scope",
  "currency",
  "date_range",
  "transaction",
  "pending_transfer",
  "yes_no",
  "option_selection",
  "free_text"
] as const;

export type ClarificationRequest = {
  reason: (typeof clarificationReasonValues)[number];
  message: string;
  expectedReplyType: (typeof clarificationReplyTypeValues)[number];
  resumeIntent?: AssistantIntent;
  resumeOperation?: AiUserRequest["operation"];
  resumeDraft?: TransferDraft;
  options?: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  safeResumeStateVersion?: number;
  createdAt?: string;
  expiresAt?: string;
};

export type ConversationMode =
  | "idle"
  | "answering_read_only"
  | "awaiting_clarification"
  | "transfer_draft_in_progress"
  | "transfer_confirmation_pending"
  | "transfer_confirmed"
  | "transfer_denied";

/**
 * Persistent, cross-turn transfer-intent frame. Accumulates the recipient and
 * amount slots across a transfer dialogue; unset slots are inherited from the
 * prior turn. Rides inside the already-persisted `counterpartyMemory`
 * (additive — absent field deserializes to an idle frame, no backfill).
 */
export type TransferIntentFrameRecipient = {
  email?: string;
  displayName?: string;
  query?: string;
  resolvedAtTurn?: number;
};

export type TransferIntentFrameAmount = {
  expr?: AmountExpr;
  value?: number;
  currency: CurrencyCode;
  resolvedAtTurn?: number;
};

export type TransferIntentFrame = {
  status: "idle" | "building" | "pending_confirmation";
  recipient?: TransferIntentFrameRecipient;
  amount?: TransferIntentFrameAmount;
  reason?: string;
  lastUpdatedTurn: number;
};

export type CounterpartyMemory = {
  turn: number;
  lastCounterparty?: CounterpartyRef;
  mentionedCounterparties: CounterpartyRef[];
  entities?: ConversationEntity[];
  answerFrames?: ConversationAnswerFrame[];
  pendingConfirmation?: PendingConfirmationMemory | null;
  clarification?: ClarificationRequest | null;
  transferIntentFrame?: TransferIntentFrame;
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
  messages: StoredChatMessage[];
  memory: CounterpartyMemory;
  transferDraft?: TransferDraft;
};

export type ExtractTransferDraftInput = {
  userMessage: string;
  messages: StoredChatMessage[];
  counterpartyMemory: CounterpartyMemory;
};

export const transferConfirmationTypeValues = ["transfer"] as const;
export const transferConfirmationStatusValues = ["pending"] as const;
export const transferConfirmationCurrencyValues = ["ILS"] as const;
export const transferWarningCodeValues = [
  "MISSING_RECIPIENT_NAME",
  "NEW_RECIPIENT",
  "HIGH_AMOUNT",
  "NEAR_DAILY_LIMIT",
  "CURRENCY_ASSUMED"
] as const;
export const confirmationActionMethodValues = ["POST"] as const;
export const confirmationActionValues = ["confirm", "deny"] as const;
export const confirmationResponseStatusValues = [
  "confirmed",
  "denied"
] as const;
export const confirmationSupersededErrorValues = [
  "confirmation_superseded"
] as const;

export type TransferConfirmation = {
  id: string;
  version: number;
  type: (typeof transferConfirmationTypeValues)[number];
  status: (typeof transferConfirmationStatusValues)[number];
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
    code: (typeof transferWarningCodeValues)[number];
    message: string;
  }>;
  expiresAt: string;
  supersedesId?: string | null;
  confirmAction: {
    method: (typeof confirmationActionMethodValues)[number];
    path: string;
    body: {
      action: (typeof confirmationActionValues)[0];
      version: number;
    };
  };
  denyAction: {
    method: (typeof confirmationActionMethodValues)[number];
    path: string;
    body: {
      action: (typeof confirmationActionValues)[1];
      version: number;
    };
  };
};

export type ComposeAssistantResponseInput = {
  assistantId: AssistantId;
  userMessage: string;
  intent: AssistantIntent;
  responseStyleContext: ResponseStyleContext;
  safeToolSummaries: SafeToolSummary[];
  safeConversationSummary: SafeConversationSummary;
  safeResolvedReferences: SafeResolvedReferences;
  requiredResponseFacts: RequiredResponseFact[];
  structuredResponse?: {
    responseFormatVersion: AssistantResponseFormatVersion;
    blockTypes: AssistantResponseBlock["type"][];
    blockCount: number;
    introFallbackMessage: string;
  };
  refusalReason?: string;
  fallbackMessage: string;
  personalityLintFeedback?: string;
};

/**
 * The structured turn-context delta the LLM resolver emits. It expresses *what
 * the user means* (coreference, intent, arithmetic) as references and
 * expressions only — never an authoritative email or money value. Deterministic
 * code resolves and validates every recipient and amount.
 */
export type TurnDeltaAction =
  | "new_transfer"
  | "change_recipient"
  | "modify_amount"
  | "set_reason"
  | "read_only"
  | "confirm"
  | "cancel"
  | "other";

export type TurnDeltaRecipientRef = {
  kind:
    | "explicit_email"
    | "pronoun"
    | "name"
    | "ordinal"
    | "current_pending_recipient"
    | "last_counterparty";
  email?: string;
  query?: string;
  ordinal?: number;
};

export type TurnDeltaAmountRef = {
  kind: "literal" | "reference";
  expr?: AmountExpr;
  value?: number;
  /**
   * The counterparty an amount expression's base draws from, when that is
   * distinct from the transfer recipient. This is the structural F2 fix:
   * "the same amount sga@… sent me" names sga as the *amount's* counterparty,
   * never the recipient.
   */
  sourceCounterparty?: {
    email?: string;
    query?: string;
  };
};

export type TurnDelta = {
  action: TurnDeltaAction;
  recipientRef?: TurnDeltaRecipientRef;
  amountRef?: TurnDeltaAmountRef;
  reason?: string;
  confidence: "low" | "medium" | "high";
};

export type ResolveTurnContextInput = {
  userMessage: string;
  messages: StoredChatMessage[];
  counterpartyMemory: CounterpartyMemory;
  /**
   * Set on a one-shot repair pass when the prior delta could not be resolved
   * deterministically (e.g. an unresolvable amount reference). The resolver is
   * asked once more with this hint before the graph falls back to clarifying.
   */
  repairError?: string;
};

export type AssistantLlmProvider = {
  classifyIntent(input: ClassifyAssistantIntentInput): Promise<IntentClassification>;
  extractTransferDraft(input: ExtractTransferDraftInput): Promise<TransferDraftExtraction>;
  resolveCounterpartyReference(
    input: ResolveCounterpartyReferenceInput
  ): Promise<CounterpartyReferenceResolution>;
  composeResponse(input: ComposeAssistantResponseInput): Promise<string>;
  /**
   * Optional 5th method: resolves multi-turn coreference/intent into a
   * TurnDelta. When absent or on failure, the deterministic pipeline
   * (buildAiUserRequest + extractTransferDraft) is the fallback.
   */
  resolveTurnContext?(input: ResolveTurnContextInput): Promise<TurnDelta>;
};

export type ConversationContext = {
  messages: BaseMessage[];
  memory: CounterpartyMemory;
};

export type ConversationSaveInput = {
  userId: string;
  conversationId: string;
  assistantId: AssistantId;
  messages: BaseMessage[];
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
  messages: BaseMessage[];
  counterpartyMemory: CounterpartyMemory;
  currentTurn: number;
  detectedIntent?: AssistantIntent;
  selectedAccountId?: string;
  normalizedMessage?: NormalizedUserMessage;
  requestSlots?: RequestSlots;
  userRequest?: AiUserRequest;
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
  responseSituation?: ResponseSituation;
  riskLevel?: RiskLevel;
  responseStyleContext?: ResponseStyleContext;
  responsePersonalityLint?: PersonalityLintResult;
  responseMessage?: string;
  responseFormatVersion?: AssistantResponseFormatVersion;
  responseBlocks?: AssistantResponseBlock[];
  debugTrace?: AiGraphDebugEvent[];
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
  userRequest?: AiUserRequest;
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
  diagnostics?: AiGraphDebugEvent[];
};

export type AuditLogger = (input: AuditLogInput) => Promise<void>;

export const aiStreamPhases = [
  "accepted",
  "understanding_request",
  "resolving_context",
  "checking_account_facts",
  "preparing_confirmation",
  "composing_response",
  "completed"
] as const;

export type AiStreamPhase = (typeof aiStreamPhases)[number];

export const aiStreamStatusEventTypeValues = ["status"] as const;
export const aiStreamResultEventTypeValues = ["result"] as const;
export const aiStreamErrorEventTypeValues = ["error"] as const;

export type RunAssistantProgressEvent = {
  phase: AiStreamPhase;
  nodeName: string;
};

export type RunAssistantProgressHandler = (
  event: RunAssistantProgressEvent
) => void | Promise<void>;

export type RunAssistantInput = {
  userId?: string;
  conversationId: string;
  requestId?: string;
  assistantId?: AssistantId;
  message: string;
};

export type RunAssistantResult = {
  message: string;
  responseMessage: string;
  responseFormatVersion: AssistantResponseFormatVersion;
  responseBlocks?: AssistantResponseBlock[];
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

export type RunAssistantOptions = {
  tools?: Partial<AssistantToolExecutors>;
  llmProvider?: AssistantLlmProvider;
  conversationStore?: ConversationStore;
  amountResolutionService?: AmountResolutionService;
  transferPreparationService?: TransferPreparationService;
  transferModificationService?: TransferModificationService;
  auditLogger?: AuditLogger;
  onProgress?: RunAssistantProgressHandler;
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

export type AmountResolutionInput = {
  userId: string;
  conversationId: string;
  transferDraft: TransferDraft;
  resolvedCounterparty?: CounterpartyRef;
  counterpartyMemory: CounterpartyMemory;
};

export type AmountResolutionResult =
  | {
      status: "resolved";
      amount: ResolvedAmountRef;
    }
  | {
      status: "unresolved";
      reason: string;
    };

export type AmountResolutionService = (
  input: AmountResolutionInput
) => Promise<AmountResolutionResult>;

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
