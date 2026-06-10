export type User = {
  id: string;
  email: string;
  balance: number;
  role: UserRole;
  createdAt?: string;
  personalDetailsId: string;
  personalDetailsStatus: PersonalDetailsStatus;
  needsPersonalDetails: boolean;
};

export type UserRole =
  | "user"
  | "support_agent"
  | "sales_agent"
  | "support_manager"
  | "admin";

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

export type PublicUserProfile = {
  id: string;
  email: string;
  displayName: string;
  isVerified: boolean;
  memberSince?: string;
};

export type RelationshipStatus =
  | "self"
  | "no_history"
  | "has_history"
  | "verified_recipient";

export type UserRelationshipSummary = {
  viewerUserId: string;
  viewedUserId: string;
  totalSentToUser: number;
  totalReceivedFromUser: number;
  netAmount: number;
  transactionCount: number;
  lastTransactionAt: string | null;
  isVerifiedRecipient: boolean;
  canTransferToUser: boolean;
  relationshipStatus: RelationshipStatus;
};

export type RelationshipTransaction = {
  id: string;
  amount: number;
  direction: "sent" | "received";
  status: "completed";
  createdAt?: string;
  description?: string;
};

export type UserProfileResponse = {
  user: PublicUserProfile;
  relationship: UserRelationshipSummary;
  recentTransactions: RelationshipTransaction[];
};

export type UserRelationshipTransactionsResponse = {
  transactions: RelationshipTransaction[];
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

export type VideoSessionType = "support" | "sales";

export type VideoSessionStatus =
  | "requested"
  | "waiting_for_agent"
  | "active"
  | "ended"
  | "missed"
  | "cancelled"
  | "failed";

export type VideoSessionSource =
  | "dashboard"
  | "ai_assistant"
  | "transfer_flow"
  | "account_page";

export type VideoSession = {
  id: string;
  type: VideoSessionType;
  status: VideoSessionStatus;
  topic: string | null;
  userProblemSummary: string | null;
  source: VideoSessionSource;
  assignedAgentId: string | null;
  createdAt?: string;
  updatedAt?: string;
  startedAt: string | null;
  endedAt: string | null;
  userJoinedAt: string | null;
  agentJoinedAt: string | null;
};

export type AgentVideoSession = VideoSession & {
  user: {
    id: string;
    emailMasked: string | null;
  };
};

export type CreateVideoSessionRequest = {
  type: VideoSessionType;
  topic?: string;
  userProblemSummary?: string;
  source?: VideoSessionSource;
  locale?: string;
};

export type JitsiJoinConfig = {
  provider: "jitsi-jaas" | "jitsi-self-hosted" | "jitsi-public-demo" | "mock";
  domain: string;
  roomName: string;
  appId?: string;
  jwt?: string;
  configOverwrite: {
    prejoinPageEnabled: boolean;
    disableDeepLinking: boolean;
  };
  interfaceConfigOverwrite: {
    SHOW_JITSI_WATERMARK: boolean;
  };
  expiresAt: string;
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

export type AssistantResponseFormatVersion = 1;

export type AssistantResponseBlockType =
  | "text"
  | "account_summary"
  | "transaction_list"
  | "transaction_detail"
  | "transaction_stats"
  | "pending_transfers"
  | "transfer_quote"
  | "transfer_confirmation"
  | "transfer_status"
  | "transfer_limits"
  | "video_session_cta"
  | "empty_state"
  | "notice";

export type LocalizedText = {
  text: string;
  dir?: "rtl" | "ltr" | "auto";
};

export type AssistantMoneyValue = {
  amount: number;
  currency: AiTransferConfirmationCurrency | "USD" | "EUR";
  formatted?: string;
};

export type AssistantKeyValueItem = {
  label: LocalizedText;
  value: LocalizedText | AssistantMoneyValue;
};

export type AssistantTransactionItem = {
  id: string;
  direction: "sent" | "received";
  counterpartyName: string;
  counterpartyEmail?: string;
  amount: AssistantMoneyValue;
  status?: "pending" | "completed" | "failed" | "cancelled" | "canceled";
  createdAt: string;
  reference?: string;
  description?: string | null;
};

export type PendingTransferItem = {
  id: string;
  recipientLabel: string;
  recipientEmailMasked?: string;
  amount: AssistantMoneyValue;
  reason?: string | null;
  status: "pending";
  expiresAt: string;
  conversationId?: string;
};

export type AssistantResponseBlock =
  | {
      id: string;
      type: "text";
      title?: LocalizedText;
      text: LocalizedText;
    }
  | {
      id: string;
      type: "account_summary";
      title?: LocalizedText;
      availableBalance: AssistantMoneyValue;
      accountLabel?: LocalizedText;
      items?: AssistantKeyValueItem[];
    }
  | {
      id: string;
      type: "transaction_list";
      title?: LocalizedText;
      subtitle?: LocalizedText;
      transactions: AssistantTransactionItem[];
      summary?: {
        totalCount?: number;
        totalAmount?: AssistantMoneyValue;
      };
    }
  | {
      id: string;
      type: "transaction_detail";
      title?: LocalizedText;
      transaction: AssistantTransactionItem;
    }
  | {
      id: string;
      type: "transaction_stats";
      title?: LocalizedText;
      count: number;
      sentTotal?: AssistantMoneyValue;
      receivedTotal?: AssistantMoneyValue;
      net?: AssistantMoneyValue;
      items?: AssistantKeyValueItem[];
    }
  | {
      id: string;
      type: "pending_transfers";
      title?: LocalizedText;
      pendingTransfers: PendingTransferItem[];
      summary?: {
        totalCount?: number;
      };
    }
  | {
      id: string;
      type: "transfer_quote";
      title?: LocalizedText;
      eligible: boolean;
      recipientLabel?: string;
      amount?: AssistantMoneyValue;
      currentBalance?: AssistantMoneyValue;
      remainingBalanceAfterTransfer?: AssistantMoneyValue;
      dailyUsed?: AssistantMoneyValue;
      dailyRemaining?: AssistantMoneyValue;
      warnings?: string[];
    }
  | {
      id: string;
      type: "transfer_confirmation";
      title?: LocalizedText;
      confirmation: AiTransferConfirmation;
    }
  | {
      id: string;
      type: "transfer_status";
      title?: LocalizedText;
      status:
        | "pending"
        | "confirmed"
        | "denied"
        | "expired"
        | "superseded"
        | "cancelled"
        | "canceled"
        | "failed"
        | "unknown";
      recipientLabel?: string;
      amount?: AssistantMoneyValue;
      reason?: string | null;
      expiresAt?: string;
      message?: LocalizedText;
    }
  | {
      id: string;
      type: "transfer_limits";
      title?: LocalizedText;
      eligible?: boolean;
      amount?: AssistantMoneyValue;
      balance?: AssistantMoneyValue;
      perTransferLimit?: AssistantMoneyValue;
      dailyTransferLimit?: AssistantMoneyValue;
      dailyUsed?: AssistantMoneyValue;
      dailyRemaining?: AssistantMoneyValue;
      maxSendableNow?: AssistantMoneyValue;
      transferCountToday?: number;
      resetAt?: string;
      reasons?: string[];
    }
  | {
      id: string;
      type: "video_session_cta";
      title?: LocalizedText;
      sessionId: string;
      sessionType: VideoSessionType;
      status: VideoSessionStatus;
      ctaLabel: LocalizedText;
      appPath: string;
      message?: LocalizedText;
    }
  | {
      id: string;
      type: "empty_state";
      title?: LocalizedText;
      message: LocalizedText;
    }
  | {
      id: string;
      type: "notice";
      title?: LocalizedText;
      tone: "info" | "warning" | "error" | "success";
      message: LocalizedText;
    };

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
  responseMessage?: string;
  responseFormatVersion: AssistantResponseFormatVersion;
  responseBlocks?: AssistantResponseBlock[];
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
