import type { FilterQuery, SortOrder } from "mongoose";
import { Transaction } from "../../models/Transaction.js";
import type { ToolContext, ToolResultMetadata } from "../state.js";
import { resolveCommonDateRange } from "../dateResolution.js";
import {
  getCounterpartyDisplays,
  getDisplayOrFallback,
  getLimitFromMessage,
  normalizeCounterpartyEmail
} from "./counterpartyHelpers.js";

type TransactionDocument = InstanceType<typeof Transaction>;

export type SafeTransactionRow = {
  transactionId: string;
  label: string;
  llmLabel: string;
  direction: "sent" | "received";
  amount: number;
  currency: "ILS";
  counterpartyLabel: string;
  counterpartyMaskedLabel: string;
  counterpartyEmail: string;
  reason: string | null;
  occurredAt: string;
  status: "completed";
};

export type TransactionAmountFilters = {
  minAmount?: number;
  maxAmount?: number;
};

export type TransactionDateRange = {
  from: Date;
  to: Date;
  label: string;
};

export function getTransactionDirection(transaction: Pick<TransactionDocument, "type">) {
  return transaction.type === "debit" ? "sent" : "received";
}

export function resolveDateRangeFromMessage(message: string, now = new Date()) {
  const resolved = resolveCommonDateRange(message, "Asia/Jerusalem", now);
  return resolved
    ? {
        from: new Date(resolved.resolvedFrom),
        to: new Date(resolved.resolvedTo),
        label: resolved.label
      }
    : undefined;
}

export function getDirectionFromMessage(context: ToolContext) {
  const normalized = context.message.toLowerCase();
  const slotDirection = context.requestSlots?.transactionDirection;
  if (slotDirection) {
    return slotDirection;
  }

  if (
    /\b(received|incoming|deposit)\b/i.test(normalized) ||
    /\b(who|which person|which people)\b.*\b(sent|paid|transferred)\b.*\b(me|to me)\b/i.test(normalized) ||
    /(קיבלתי|נכנס|ממי|מי.*?(שלח|העביר).*?(לי|אליי|אלי))/.test(context.message)
  ) {
    return "received";
  }

  if (/\b(sent|paid|transferred|payment|transfer)\b/i.test(normalized) || /(שלחתי|העברתי|תשלומים|העברות)/.test(context.message)) {
    return "sent";
  }

  return "both";
}

export function getAmountFiltersFromMessage(message: string) {
  const minMatch =
    message.match(/\b(?:over|above|more than|greater than|at least)\s+(\d+(?:\.\d{1,2})?)/i) ??
    message.match(/(?:מעל|יותר מ|לפחות)\s*(\d+(?:\.\d{1,2})?)/);
  const maxMatch =
    message.match(/\b(?:under|below|less than|at most)\s+(\d+(?:\.\d{1,2})?)/i) ??
    message.match(/(?:מתחת|פחות מ|עד)\s*(\d+(?:\.\d{1,2})?)/);

  return {
    minAmount: minMatch ? Number(minMatch[1]) : undefined,
    maxAmount: maxMatch ? Number(maxMatch[1]) : undefined
  };
}

export function getExactAmountFromMessage(message: string) {
  const amount = Number(
    message.match(
      /(?:[$€₪]|usd|eur|nis|ils|shekels?|dollars?|euros?|שקל|שח|ש״ח|ש"ח)?\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:[$€₪]|usd|eur|nis|ils|shekels?|dollars?|euros?|שקל|שח|ש״ח|ש"ח)/i
    )?.[1] ?? message.match(/\b(\d+(?:\.\d{1,2})?)\b/)?.[1]
  );

  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

export function getReasonQueryFromMessage(message: string) {
  return (
    message.match(
      /\b(?:reason|for)\s+["']?([\p{L}\d _-]{2,40}?)(?=\s+(?:today|yesterday|this week|last week|this month|last month|over|under|above|below|more than|less than)|$|["'])/iu
    )?.[1]?.trim() ??
    message.match(
      /(?:סיבה|עבור|על)\s+([\u0590-\u05ff\d _-]{2,40}?)(?=\s+(?:היום|אתמול|השבוע|שבוע שעבר|החודש|חודש שעבר|מעל|מתחת|פחות|יותר)|$)/
    )?.[1]?.trim()
  );
}

export function getTransactionSortFromMessage(message: string): TransactionSort {
  if (/\b(oldest|first)\b/i.test(message)) {
    return { createdAt: 1 };
  }

  if (/\b(biggest|largest|highest)\b/i.test(message) || /(הכי גדול|הגדולות)/.test(message)) {
    return { amount: -1 };
  }

  if (/\b(smallest|lowest)\b/i.test(message) || /(הכי קטן|הקטנות)/.test(message)) {
    return { amount: 1 };
  }

  return { createdAt: -1 };
}

export function getTransactionSortLabel(message: string) {
  if (/\b(oldest|first)\b/i.test(message)) {
    return "oldest";
  }

  if (/\b(biggest|largest|highest)\b/i.test(message) || /(הכי גדול|הגדולות)/.test(message)) {
    return "largest amount";
  }

  if (/\b(smallest|lowest)\b/i.test(message) || /(הכי קטן|הקטנות)/.test(message)) {
    return "smallest amount";
  }

  return "newest";
}

export function getTransactionQueryContext(context: ToolContext) {
  const amountFilters = getAmountFiltersFromMessage(context.message);
  return {
    direction: getDirectionFromMessage(context),
    amountFilters,
    dateRange: context.resolvedDateRange ?? resolveDateRangeFromMessage(context.message),
    reasonQuery: getReasonQueryFromMessage(context.message),
    sortLabel: getTransactionSortLabel(context.message)
  };
}

export function buildTransactionFilter(context: ToolContext): FilterQuery<TransactionDocument> {
  const {
    direction,
    amountFilters,
    dateRange,
    reasonQuery
  } = getTransactionQueryContext(context);
  const filter: FilterQuery<TransactionDocument> = {
    ownerId: context.userId
  };

  if (direction === "sent") {
    filter.type = "debit";
  } else if (direction === "received") {
    filter.type = "credit";
  }

  if (context.resolvedCounterparty?.email) {
    filter.counterpartyEmail = normalizeCounterpartyEmail(
      context.resolvedCounterparty.email
    );
  }

  if (amountFilters.minAmount !== undefined || amountFilters.maxAmount !== undefined) {
    filter.amount = {
      ...(amountFilters.minAmount !== undefined ? { $gte: amountFilters.minAmount } : {}),
      ...(amountFilters.maxAmount !== undefined ? { $lte: amountFilters.maxAmount } : {})
    };
  }

  if (dateRange) {
    filter.createdAt = {
      $gte: dateRange.from,
      $lt: dateRange.to
    };
  }

  if (reasonQuery) {
    filter.reason = new RegExp(reasonQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  return filter;
}

export function getTransactionLimit(context: ToolContext, defaultLimit = 10) {
  return getLimitFromMessage(context.message, defaultLimit, 50);
}

function getTransactionId(transaction: TransactionDocument) {
  const id = (transaction as { _id?: unknown })._id;
  return id ? String(id) : transaction.id;
}

export async function toSafeTransactionRows(
  transactions: TransactionDocument[]
): Promise<SafeTransactionRow[]> {
  const displays = await getCounterpartyDisplays(
    transactions.map((transaction) => transaction.counterpartyEmail)
  );

  return transactions.map((transaction, index) => {
    const display = getDisplayOrFallback(displays, transaction.counterpartyEmail);
    const direction = getTransactionDirection(transaction);
    const amount = Math.abs(transaction.amount);
    const label = `${index + 1}. ${direction} ${amount.toFixed(2)} ILS with ${display.userLabel}`;
    const llmLabel = `${index + 1}. ${direction} ${amount.toFixed(2)} ILS with ${display.llmLabel}`;

    return {
      transactionId: getTransactionId(transaction),
      label,
      llmLabel,
      direction,
      amount,
      currency: "ILS",
      counterpartyLabel: display.userLabel,
      counterpartyMaskedLabel: display.emailMasked,
      counterpartyEmail: display.email,
      reason: transaction.reason ?? null,
      occurredAt: transaction.createdAt?.toISOString() ?? new Date(0).toISOString(),
      status: "completed"
    };
  });
}

export function summarizeTransactionRows(rows: SafeTransactionRow[]) {
  return rows
    .map((row) => `${row.label}${row.reason ? ` for ${row.reason}` : ""}`)
    .join("; ");
}

export function summarizeTransactionRowsForLlm(rows: SafeTransactionRow[]) {
  return rows
    .map((row) => `${row.llmLabel}${row.reason ? ` for ${row.reason}` : ""}`)
    .join("; ");
}

export function metadataFromTransactionRows(
  rows: SafeTransactionRow[]
): ToolResultMetadata {
  return {
    recordCount: rows.length,
    transactions: rows.map((row) => ({
      transactionId: row.transactionId,
      label: row.llmLabel,
      amount: row.amount,
      currency: row.currency,
      direction: row.direction,
      occurredAt: row.occurredAt,
      status: row.status,
      counterpartyLabel: row.counterpartyMaskedLabel
    })),
    counterparties: rows.map((row) => ({
      counterpartyEmail: row.counterpartyEmail,
      maskedLabel: row.counterpartyMaskedLabel,
      displayName: row.counterpartyMaskedLabel
    }))
  };
}

export function transactionMemoryUpdatesFromRows(rows: SafeTransactionRow[]) {
  return {
    transactions: rows.map((row) => ({
      transactionId: row.transactionId,
      label: row.label,
      counterpartyLabel: row.counterpartyLabel,
      amount: row.amount,
      currency: row.currency,
      direction: row.direction,
      occurredAt: row.occurredAt
    }))
  };
}

export function sortForTransactionMemory(
  left: { turnLastReferenced: number; turnIntroduced: number },
  right: { turnLastReferenced: number; turnIntroduced: number }
) {
  if (left.turnLastReferenced !== right.turnLastReferenced) {
    return right.turnLastReferenced - left.turnLastReferenced;
  }

  return left.turnIntroduced - right.turnIntroduced;
}

export type TransactionSort = Record<string, SortOrder>;
