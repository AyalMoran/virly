export type User = {
  id: string;
  email: string;
  balance: number;
  createdAt?: string;
  personalDetailsId: string;
  personalDetailsStatus: PersonalDetailsStatus;
  needsPersonalDetails: boolean;
};

export type PersonalDetailsStatus = "not_provided" | "provided";

export type PersonalDetailsAddress = {
  country: string | null;
  stateRegion?: string | null;
  city: string | null;
  street: string | null;
  addressLine2?: string | null;
  postalCode: string | null;
};

export type PersonalDetails = {
  id: string;
  status: PersonalDetailsStatus;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  address: PersonalDetailsAddress;
  lastSkippedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Transaction = {
  id: string;
  amount: number;
  counterpartyEmail: string;
  reason?: string | null;
  date?: string;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AccountSummary = {
  balance: number;
  personalDetails: {
    id: string;
    status: PersonalDetailsStatus;
    firstName: string | null;
    needsPersonalDetails: boolean;
  };
  transactions: Transaction[];
  pagination: Pagination;
};

export type TransactionsResponse = {
  transactions: Transaction[];
  pagination: Pagination;
};

export type AuthSuccessResponse = {
  user: User;
  csrfToken?: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  phone: string;
};

export type LoginRequest = {
  email: string;
  password: string;
  rememberMe: boolean;
};

export type PersonalDetailsRequest = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  address: {
    country: string;
    stateRegion?: string | null;
    city: string;
    street: string;
    addressLine2?: string | null;
    postalCode: string;
  };
};

export type PersonalDetailsResponse = {
  personalDetails: PersonalDetails;
};

export type TransferRequest = {
  recipientEmail: string;
  amount: number;
  reason?: string;
};

export type TransferResponse = {
  message: string;
  newBalance: number;
  transaction: Transaction;
};

export type AssistantId = "oshri" | "chaya" | "yehuda" | "yohai_daniel";

export type AssistantIntent =
  | "balance_inquiry"
  | "account_summary"
  | "recent_transactions"
  | "transaction_search"
  | "transaction_summary"
  | "transaction_count"
  | "transaction_detail"
  | "transaction_stats"
  | "cashflow_summary"
  | "counterparty_lookup"
  | "recent_sent_counterparties"
  | "recent_received_counterparties"
  | "counterparty_summary"
  | "counterparty_activity_timeline"
  | "last_sent_counterparty"
  | "counterparty_transactions"
  | "counterparty_total_sent"
  | "counterparty_total_received"
  | "counterparty_net_total"
  | "verified_recipients"
  | "recipient_profile"
  | "transfer_prepare"
  | "transfer_modify_pending"
  | "transfer_cancel_pending"
  | "transfer_limits"
  | "transfer_eligibility"
  | "transfer_quote"
  | "daily_transfer_usage"
  | "transfer_status"
  | "pending_ai_transfers"
  | "pending_confirmation_status"
  | "general_help"
  | "unsafe_request"
  | "unsupported";

export type AiToolName =
  | "getUserAccounts"
  | "getAccountBalance"
  | "getRecentTransactions"
  | "getLastSentCounterparty"
  | "getTransactionsWithCounterparty"
  | "getTotalSentToCounterparty"
  | "getTotalReceivedFromCounterparty"
  | "getNetWithCounterparty"
  | "getVerifiedRecipients"
  | "getTransferLimits"
  | "getRecentSentCounterparties"
  | "getRecentReceivedCounterparties"
  | "getCounterpartySummary"
  | "getCounterpartyActivityTimeline"
  | "resolveCounterpartyCandidates"
  | "searchTransactions"
  | "getTransactionStats"
  | "resolveTransactionReference"
  | "getTransactionReceipt"
  | "getTransferEligibility"
  | "getTransferQuote"
  | "getDailyTransferUsage"
  | "getPendingAiTransfers"
  | "resolvePendingTransferReference"
  | "getCashflowSummary"
  | "getMyProfile"
  | "getAvailableActions";

export type AiToolStatus = "ok" | "empty" | "error";

export type AiClarificationReason =
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

export type AiClarificationExpectedReplyType =
  | "recipient"
  | "amount"
  | "amount_scope"
  | "currency"
  | "date_range"
  | "transaction"
  | "pending_transfer"
  | "yes_no"
  | "option_selection"
  | "free_text";

export type AiClarificationRequest = {
  reason: AiClarificationReason;
  message: string;
  expectedReplyType: AiClarificationExpectedReplyType;
  options?: Array<{
    id: string;
    label: string;
    value: string;
  }>;
};

export type AiToolCallResult = {
  toolName: AiToolName;
  status: AiToolStatus;
};

export type AiChatRequest = {
  message: string;
  conversationId?: string;
  assistantId?: AssistantId;
};

export type AiChatStreamPhase =
  | "accepted"
  | "understanding_request"
  | "resolving_context"
  | "checking_account_facts"
  | "preparing_confirmation"
  | "composing_response"
  | "completed";

export type AiChatStreamStatusEventType = "status";
export type AiChatStreamResultEventType = "result";
export type AiChatStreamErrorEventType = "error";

export type AiTransferConfirmationType = "transfer";
export type AiTransferConfirmationStatus = "pending";
export type AiTransferConfirmationCurrency = "ILS";
export type AiTransferWarningCode =
  | "MISSING_RECIPIENT_NAME"
  | "NEW_RECIPIENT"
  | "HIGH_AMOUNT"
  | "NEAR_DAILY_LIMIT"
  | "CURRENCY_ASSUMED";
export type AiConfirmationMethod = "POST";

export type AiTransferConfirmation = {
  id: string;
  version: number;
  type: AiTransferConfirmationType;
  status: AiTransferConfirmationStatus;
  recipientEmail: string;
  recipientFirstName: string | null;
  recipientLastName: string | null;
  amount: number;
  currency: AiTransferConfirmationCurrency;
  recipient?: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
    verified: boolean;
  };
  amountDetails?: {
    value: number;
    currency: AiTransferConfirmationCurrency;
    formatted: string;
  };
  reason: string | null;
  warnings?: Array<{
    code: AiTransferWarningCode;
    message: string;
  }>;
  expiresAt: string;
  confirmAction?: {
    method: AiConfirmationMethod;
    path: string;
    body: {
      action: "confirm";
      version: number;
    };
  };
  denyAction?: {
    method: AiConfirmationMethod;
    path: string;
    body: {
      action: "deny";
      version: number;
    };
  };
  supersedesId?: string | null;
};

export type AiChatResponse = {
  message: string;
  conversationId: string;
  assistantId: AssistantId;
  intent: AssistantIntent;
  toolCalls: AiToolName[];
  toolResults?: AiToolCallResult[];
  clarification?: AiClarificationRequest;
  confirmation?: AiTransferConfirmation;
  supersededConfirmationId?: string;
};

export type AiChatStreamStatusEvent = {
  type: AiChatStreamStatusEventType;
  phase: AiChatStreamPhase;
  conversationId: string;
  assistantId: AssistantId;
};

export type AiChatStreamResultEvent = {
  type: AiChatStreamResultEventType;
  conversationId: string;
  assistantId: AssistantId;
  result: AiChatResponse;
};

export type AiChatStreamErrorEvent = {
  type: AiChatStreamErrorEventType;
  message: string;
};

export type AiChatStreamEvent =
  | AiChatStreamStatusEvent
  | AiChatStreamResultEvent
  | AiChatStreamErrorEvent;

export type AiConfirmationResponseStatus = "confirmed" | "denied";
export type AiConfirmationConfirmedStatus = "confirmed";
export type AiConfirmationDeniedStatus = "denied";
export type AiSupersededConfirmationErrorCode = "confirmation_superseded";

export type AiConfirmationResponse =
  | {
      status: AiConfirmationConfirmedStatus;
      message: string;
      newBalance: number;
      transaction: Transaction;
    }
  | {
      status: AiConfirmationDeniedStatus;
      message: string;
    };

export type AiConfirmationAction = "confirm" | "deny";

export type ApiIssue = {
  path: string;
  message: string;
};

export type ApiErrorBody = {
  message?: string;
  details?: string[];
  issues?: ApiIssue[];
};
