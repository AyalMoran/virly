import { getToolDisplayData } from "./toolResults.js";
import type {
  AssistantGraphState,
  CurrencyCode,
  RuntimeToolResult,
  ToolResultMetadata,
  TransferConfirmation
} from "./state.js";

export const assistantResponseFormatVersion = 1 as const;

export type AssistantResponseFormatVersion =
  typeof assistantResponseFormatVersion;

export const assistantResponseBlockTypeValues = [
  "text",
  "account_summary",
  "transaction_list",
  "transaction_detail",
  "transaction_stats",
  "pending_transfers",
  "transfer_quote",
  "transfer_confirmation",
  "empty_state",
  "notice"
] as const;

export type AssistantResponseBlockType =
  (typeof assistantResponseBlockTypeValues)[number];

export type LocalizedText = {
  text: string;
  dir?: "rtl" | "ltr" | "auto";
};

export type AssistantMoneyValue = {
  amount: number;
  currency: CurrencyCode;
  formatted?: string;
};

export type AssistantKeyValueItem = {
  label: LocalizedText;
  value: LocalizedText | AssistantMoneyValue;
};

type AssistantResponseBlockBase<TType extends AssistantResponseBlockType> = {
  id: string;
  type: TType;
  title?: LocalizedText;
};

export type TextBlock = AssistantResponseBlockBase<"text"> & {
  text: LocalizedText;
};

export type AccountSummaryBlock =
  AssistantResponseBlockBase<"account_summary"> & {
    availableBalance: AssistantMoneyValue;
    accountLabel?: LocalizedText;
    items?: AssistantKeyValueItem[];
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

export type TransactionListBlock =
  AssistantResponseBlockBase<"transaction_list"> & {
    subtitle?: LocalizedText;
    transactions: AssistantTransactionItem[];
    summary?: {
      totalCount?: number;
      totalAmount?: AssistantMoneyValue;
    };
  };

export type TransactionDetailBlock =
  AssistantResponseBlockBase<"transaction_detail"> & {
    transaction: AssistantTransactionItem;
  };

export type TransactionStatsBlock =
  AssistantResponseBlockBase<"transaction_stats"> & {
    count: number;
    sentTotal?: AssistantMoneyValue;
    receivedTotal?: AssistantMoneyValue;
    net?: AssistantMoneyValue;
    items?: AssistantKeyValueItem[];
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

export type PendingTransfersBlock =
  AssistantResponseBlockBase<"pending_transfers"> & {
    pendingTransfers: PendingTransferItem[];
    summary?: {
      totalCount?: number;
    };
  };

export type TransferQuoteBlock =
  AssistantResponseBlockBase<"transfer_quote"> & {
    eligible: boolean;
    recipientLabel?: string;
    amount?: AssistantMoneyValue;
    currentBalance?: AssistantMoneyValue;
    remainingBalanceAfterTransfer?: AssistantMoneyValue;
    dailyUsed?: AssistantMoneyValue;
    dailyRemaining?: AssistantMoneyValue;
    warnings?: string[];
  };

export type TransferConfirmationBlock =
  AssistantResponseBlockBase<"transfer_confirmation"> & {
    confirmation: TransferConfirmation;
  };

export type EmptyStateBlock = AssistantResponseBlockBase<"empty_state"> & {
  message: LocalizedText;
};

export type NoticeBlock = AssistantResponseBlockBase<"notice"> & {
  tone: "info" | "warning" | "error" | "success";
  message: LocalizedText;
};

export type AssistantResponseBlock =
  | TextBlock
  | AccountSummaryBlock
  | TransactionListBlock
  | TransactionDetailBlock
  | TransactionStatsBlock
  | PendingTransfersBlock
  | TransferQuoteBlock
  | TransferConfirmationBlock
  | EmptyStateBlock
  | NoticeBlock;

const structuredIntentTitles = {
  account_summary: {
    he: "סיכום חשבון",
    en: "Account summary"
  },
  transaction_list: {
    he: "עסקאות",
    en: "Transactions"
  },
  transaction_detail: {
    he: "פרטי עסקה",
    en: "Transaction details"
  },
  transaction_stats: {
    he: "סטטיסטיקת עסקאות",
    en: "Transaction stats"
  },
  pending_transfers: {
    he: "העברות ממתינות",
    en: "Pending transfers"
  },
  transfer_quote: {
    he: "ציטוט העברה",
    en: "Transfer quote"
  },
  transfer_confirmation: {
    he: "אישור העברה",
    en: "Transfer confirmation"
  },
  empty_state: {
    he: "אין תוצאות",
    en: "No results"
  },
  notice: {
    he: "שים לב",
    en: "Notice"
  }
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isCurrency(value: unknown): value is CurrencyCode {
  return value === "ILS" || value === "USD" || value === "EUR";
}

function isHebrewState(state: AssistantGraphState) {
  return Boolean(state.normalizedMessage?.containsHebrew);
}

function text(state: AssistantGraphState, he: string, en: string): LocalizedText {
  return isHebrewState(state)
    ? { text: he, dir: "rtl" }
    : { text: en, dir: "auto" };
}

function title(
  state: AssistantGraphState,
  key: keyof typeof structuredIntentTitles
): LocalizedText {
  const value = structuredIntentTitles[key];
  return text(state, value.he, value.en);
}

function money(amount: number, currency: CurrencyCode = "ILS"): AssistantMoneyValue {
  return { amount, currency };
}

function getResult(
  state: AssistantGraphState,
  toolName: RuntimeToolResult["toolName"]
) {
  return state.toolResults.find((result) => result.toolName === toolName);
}

function getMetadata(result: RuntimeToolResult | undefined): ToolResultMetadata {
  return result ? getToolDisplayData(result).metadata : {};
}

function emptyState(
  state: AssistantGraphState,
  id: string,
  he: string,
  en: string
): EmptyStateBlock {
  return {
    id,
    type: "empty_state",
    title: title(state, "empty_state"),
    message: text(state, he, en)
  };
}

function notice(
  state: AssistantGraphState,
  id: string,
  tone: NoticeBlock["tone"],
  he: string,
  en: string
): NoticeBlock {
  return {
    id,
    type: "notice",
    title: title(state, "notice"),
    tone,
    message: text(state, he, en)
  };
}

function splitLabelEmail(label: string) {
  const email = label.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  const name = label
    .replace(/\s*\([^)]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\)\s*/g, " ")
    .replace(email ?? "", "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    name: name || label,
    email
  };
}

function transactionFromData(value: unknown): AssistantTransactionItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = getString(value.transactionId);
  const direction = value.direction === "sent" || value.direction === "received"
    ? value.direction
    : undefined;
  const amount = getFiniteNumber(value.amount);
  const currency = isCurrency(value.currency) ? value.currency : "ILS";
  const createdAt = getString(value.occurredAt) ?? getString(value.createdAt);
  const counterpartyLabel =
    getString(value.counterpartyLabel) ??
    getString(value.recipientLabel) ??
    getString(value.counterpartyMaskedLabel);

  if (!id || !direction || amount === undefined || !createdAt || !counterpartyLabel) {
    return undefined;
  }

  const counterparty = splitLabelEmail(counterpartyLabel);
  const status =
    value.status === "pending" ||
    value.status === "completed" ||
    value.status === "failed" ||
    value.status === "cancelled" ||
    value.status === "canceled"
      ? value.status
      : undefined;

  return {
    id,
    direction,
    counterpartyName: counterparty.name,
    ...(counterparty.email ? { counterpartyEmail: counterparty.email } : {}),
    amount: money(amount, currency),
    ...(status ? { status } : {}),
    createdAt,
    ...(getString(value.reference) ? { reference: getString(value.reference) } : {}),
    description: getString(value.reason) ?? null
  };
}

function transactionsFromResult(
  result: RuntimeToolResult | undefined
): AssistantTransactionItem[] {
  if (!result || result.status !== "ok") {
    return [];
  }

  const data = result.data;
  const values = Array.isArray(data) ? data : data ? [data] : [];
  return values.flatMap((value) => {
    const transaction = transactionFromData(value);
    return transaction ? [transaction] : [];
  });
}

function buildAccountSummaryBlocks(
  state: AssistantGraphState
): AssistantResponseBlock[] {
  const balanceResult = getResult(state, "getAccountBalance");
  const accountResult = getResult(state, "getUserAccounts");
  const balanceData = isRecord(balanceResult?.data) ? balanceResult.data : {};
  const balance =
    getFiniteNumber(balanceData.balance) ??
    getFiniteNumber(getMetadata(balanceResult).amount);
  const accountLabel =
    getString(getMetadata(accountResult).accountLabel) ??
    getString(getMetadata(balanceResult).accountLabel);

  if (balanceResult?.status === "empty" || accountResult?.status === "empty") {
    return [
      emptyState(
        state,
        "account-summary-empty",
        "לא נמצאו פרטי חשבון להצגה.",
        "No account details were found."
      )
    ];
  }

  if (balance === undefined) {
    return [];
  }

  return [
    {
      id: "account-summary",
      type: "account_summary",
      title: title(state, "account_summary"),
      availableBalance: money(balance, "ILS"),
      ...(accountLabel
        ? { accountLabel: { text: accountLabel, dir: "auto" as const } }
        : {}),
      items: [
        {
          label: text(state, "יתרה זמינה", "Available balance"),
          value: money(balance, "ILS")
        },
        ...(accountLabel
          ? [
              {
                label: text(state, "חשבון", "Account"),
                value: { text: accountLabel, dir: "auto" as const }
              }
            ]
          : [])
      ]
    }
  ];
}

function buildTransactionListBlocks(
  state: AssistantGraphState,
  toolName: RuntimeToolResult["toolName"],
  id: string
): AssistantResponseBlock[] {
  const result = getResult(state, toolName);
  if (!result) {
    return [];
  }

  if (result.status === "empty") {
    return [
      emptyState(
        state,
        `${id}-empty`,
        "לא נמצאו עסקאות שמתאימות לבקשה.",
        "No matching transactions were found."
      )
    ];
  }

  const transactions = transactionsFromResult(result);
  if (transactions.length === 0) {
    return [];
  }

  const recordCount = getFiniteNumber(getMetadata(result).recordCount);

  return [
    {
      id,
      type: "transaction_list",
      title: title(state, "transaction_list"),
      subtitle: text(
        state,
        `${recordCount ?? transactions.length} עסקאות`,
        `${recordCount ?? transactions.length} transactions`
      ),
      transactions,
      summary: {
        totalCount: recordCount ?? transactions.length
      }
    }
  ];
}

function buildTransactionDetailBlocks(
  state: AssistantGraphState
): AssistantResponseBlock[] {
  const result = getResult(state, "getTransactionReceipt");
  if (!result) {
    return [];
  }

  if (result.status === "empty") {
    return [
      emptyState(
        state,
        "transaction-detail-empty",
        "לא נמצאה העסקה המבוקשת.",
        "The requested transaction was not found."
      )
    ];
  }

  const transaction = transactionsFromResult(result)[0];
  if (!transaction) {
    return [];
  }

  return [
    {
      id: `transaction-detail-${transaction.id}`,
      type: "transaction_detail",
      title: title(state, "transaction_detail"),
      transaction
    }
  ];
}

function buildTransactionStatsBlocks(
  state: AssistantGraphState
): AssistantResponseBlock[] {
  const result = getResult(state, "getTransactionStats");
  if (!result) {
    return [];
  }

  if (result.status === "empty") {
    return [
      emptyState(
        state,
        "transaction-stats-empty",
        "לא נמצאו עסקאות לחישוב סטטיסטיקה.",
        "No transactions were found for stats."
      )
    ];
  }

  if (!isRecord(result.data)) {
    return [];
  }

  const count = getFiniteNumber(result.data.count);
  if (count === undefined) {
    return [];
  }

  const sentTotal = getFiniteNumber(result.data.sentTotal);
  const receivedTotal = getFiniteNumber(result.data.receivedTotal);
  const net = getFiniteNumber(result.data.net);

  return [
    {
      id: "transaction-stats",
      type: "transaction_stats",
      title: title(state, "transaction_stats"),
      count,
      ...(sentTotal !== undefined ? { sentTotal: money(sentTotal, "ILS") } : {}),
      ...(receivedTotal !== undefined
        ? { receivedTotal: money(receivedTotal, "ILS") }
        : {}),
      ...(net !== undefined ? { net: money(net, "ILS") } : {}),
      items: [
        {
          label: text(state, "מספר עסקאות", "Transaction count"),
          value: { text: String(count), dir: "ltr" }
        },
        ...(sentTotal !== undefined
          ? [
              {
                label: text(state, "סה\"כ נשלח", "Total sent"),
                value: money(sentTotal, "ILS")
              }
            ]
          : []),
        ...(receivedTotal !== undefined
          ? [
              {
                label: text(state, "סה\"כ התקבל", "Total received"),
                value: money(receivedTotal, "ILS")
              }
            ]
          : []),
        ...(net !== undefined
          ? [
              {
                label: text(state, "נטו", "Net"),
                value: money(net, "ILS")
              }
            ]
          : [])
      ]
    }
  ];
}

function pendingTransferFromData(value: unknown): PendingTransferItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = getString(value.pendingTransferId);
  const recipientLabel =
    getString(value.recipientLabel) ?? getString(value.recipientMaskedLabel);
  const amount = getFiniteNumber(value.amount);
  const currency = isCurrency(value.currency) ? value.currency : "ILS";
  const expiresAt = getString(value.expiresAt);

  if (!id || !recipientLabel || amount === undefined || !expiresAt) {
    return undefined;
  }

  return {
    id,
    recipientLabel,
    ...(getString(value.recipientEmailMasked)
      ? { recipientEmailMasked: getString(value.recipientEmailMasked) }
      : {}),
    amount: money(amount, currency),
    reason: getString(value.reason) ?? null,
    status: "pending",
    expiresAt,
    ...(getString(value.conversationId)
      ? { conversationId: getString(value.conversationId) }
      : {})
  };
}

function buildPendingTransfersBlocks(
  state: AssistantGraphState
): AssistantResponseBlock[] {
  const result = getResult(state, "getPendingAiTransfers");
  if (!result) {
    return [];
  }

  if (result.status === "empty") {
    return [
      emptyState(
        state,
        "pending-transfers-empty",
        "אין העברות ממתינות לאישור.",
        "There are no pending transfer confirmations."
      )
    ];
  }

  const values = Array.isArray(result.data) ? result.data : [];
  const pendingTransfers = values.flatMap((value) => {
    const pendingTransfer = pendingTransferFromData(value);
    return pendingTransfer ? [pendingTransfer] : [];
  });

  if (pendingTransfers.length === 0) {
    return [];
  }

  return [
    {
      id: "pending-transfers",
      type: "pending_transfers",
      title: title(state, "pending_transfers"),
      pendingTransfers,
      summary: {
        totalCount:
          getFiniteNumber(getMetadata(result).recordCount) ?? pendingTransfers.length
      }
    }
  ];
}

function buildTransferQuoteBlocks(
  state: AssistantGraphState
): AssistantResponseBlock[] {
  const result = getResult(state, "getTransferQuote");
  if (!result || !isRecord(result.data)) {
    return [];
  }

  const data = result.data;
  const eligible = data.eligible === true;
  const amount = getFiniteNumber(data.amount);
  const currency = isCurrency(data.currency) ? data.currency : "ILS";
  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((warning): warning is string => typeof warning === "string")
    : undefined;

  return [
    {
      id: "transfer-quote",
      type: "transfer_quote",
      title: title(state, "transfer_quote"),
      eligible,
      ...(getString(data.recipientLabel)
        ? { recipientLabel: getString(data.recipientLabel) }
        : {}),
      ...(amount !== undefined ? { amount: money(amount, currency) } : {}),
      ...(getFiniteNumber(data.currentBalance) !== undefined
        ? { currentBalance: money(getFiniteNumber(data.currentBalance) as number, "ILS") }
        : {}),
      ...(getFiniteNumber(data.remainingBalanceAfterTransfer) !== undefined
        ? {
            remainingBalanceAfterTransfer: money(
              getFiniteNumber(data.remainingBalanceAfterTransfer) as number,
              "ILS"
            )
          }
        : {}),
      ...(getFiniteNumber(data.dailyUsed) !== undefined
        ? { dailyUsed: money(getFiniteNumber(data.dailyUsed) as number, "ILS") }
        : {}),
      ...(getFiniteNumber(data.dailyRemaining) !== undefined
        ? {
            dailyRemaining: money(
              getFiniteNumber(data.dailyRemaining) as number,
              "ILS"
            )
          }
        : {}),
      ...(warnings ? { warnings } : {})
    }
  ];
}

function buildTransferConfirmationBlocks(
  state: AssistantGraphState
): AssistantResponseBlock[] {
  if (!state.confirmation) {
    return [];
  }

  return [
    {
      id: `transfer-confirmation-${state.confirmation.id}`,
      type: "transfer_confirmation",
      title: title(state, "transfer_confirmation"),
      confirmation: state.confirmation
    }
  ];
}

/**
 * Function type: AI response presentation builder.
 *
 * @brief Converts trusted graph/tool state into typed UI response blocks.
 */
export function buildAssistantResponseBlocks(
  state: AssistantGraphState
): AssistantResponseBlock[] {
  switch (state.detectedIntent) {
    case "balance_inquiry":
    case "account_summary":
      return buildAccountSummaryBlocks(state);

    case "recent_transactions":
    case "transfer_status":
      return buildTransactionListBlocks(
        state,
        "getRecentTransactions",
        "recent-transactions"
      );

    case "transaction_search":
      return buildTransactionListBlocks(
        state,
        "searchTransactions",
        "transaction-search"
      );

    case "counterparty_transactions":
      return buildTransactionListBlocks(
        state,
        "getTransactionsWithCounterparty",
        "counterparty-transactions"
      );

    case "transaction_detail":
      return buildTransactionDetailBlocks(state);

    case "transaction_summary":
    case "transaction_count":
    case "transaction_stats":
      return buildTransactionStatsBlocks(state);

    case "pending_ai_transfers":
      return buildPendingTransfersBlocks(state);

    case "transfer_quote":
      return buildTransferQuoteBlocks(state);

    case "transfer_prepare":
    case "transfer_modify_pending":
      return buildTransferConfirmationBlocks(state);

    default:
      return [];
  }
}

export function buildStructuredResponseFallbackMessage(
  state: AssistantGraphState,
  blocks: AssistantResponseBlock[]
) {
  if (blocks.length === 0) {
    return undefined;
  }

  const firstType = blocks[0]?.type;
  if (firstType === "empty_state") {
    return isHebrewState(state) ? "לא מצאתי תוצאות להצגה." : "I found no results to show.";
  }

  if (firstType === "transfer_confirmation") {
    return isHebrewState(state)
      ? "צריך לבדוק ולאשר את פרטי ההעברה בכרטיס."
      : "Please review and confirm the transfer card.";
  }

  if (firstType === "transfer_quote") {
    return isHebrewState(state)
      ? "זה ציטוט ההעברה לפי הנתונים הקיימים."
      : "Here is the transfer quote from the available data.";
  }

  return isHebrewState(state)
    ? "מצאתי את הנתונים הרלוונטיים:"
    : "Here are the relevant details:";
}
