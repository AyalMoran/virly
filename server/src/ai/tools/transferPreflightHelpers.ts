import { config } from "../../config.js";
import { Transaction } from "../../models/Transaction.js";
import { User } from "../../models/User.js";
import type { CurrencySlotValue, ToolContext } from "../state.js";
import { getExactAmountFromMessage } from "./transactionHelpers.js";

export type TransferPreflightWarningCode =
  | "INSUFFICIENT_BALANCE"
  | "EXCEEDS_PER_TRANSFER_LIMIT"
  | "EXCEEDS_DAILY_LIMIT"
  | "INVALID_RECIPIENT"
  | "UNSUPPORTED_CURRENCY"
  | "LOW_REMAINING_BALANCE"
  | "NEW_RECIPIENT";

export type TransferPreflightReason = {
  code: TransferPreflightWarningCode;
  message: string;
};

export type DailyTransferUsage = {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  transferCountToday: number;
  resetAt: Date;
};

export type SenderPreflightProfile = {
  id: string;
  email: string;
  balance: number;
};

export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function nextLocalDayStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

export function getAmountFromContext(context: ToolContext) {
  const slotAmount = context.requestSlots?.amount?.value;
  if (slotAmount && Number.isFinite(slotAmount) && slotAmount > 0) {
    return slotAmount;
  }

  return getExactAmountFromMessage(context.message);
}

export function getCurrencyFromContext(context: ToolContext): {
  currency: CurrencySlotValue | null;
  supported: boolean;
} {
  const amountSlot = context.requestSlots?.amount;
  const currency = amountSlot?.currency ?? null;

  if (amountSlot?.currencyMentioned && currency !== "ILS") {
    return {
      currency,
      supported: false
    };
  }

  return {
    currency: currency ?? "ILS",
    supported: true
  };
}

export function getRecipientEmailFromContext(context: ToolContext) {
  return (
    context.requestSlots?.counterparty?.explicitEmail ??
    context.resolvedCounterparty?.email
  )?.trim().toLowerCase();
}

export async function getSenderPreflightProfile(
  userId: string
): Promise<SenderPreflightProfile | null> {
  const sender = await User.findById(userId).select("email balance").lean<{
    _id: unknown;
    email: string;
    balance: number;
  } | null>();

  if (!sender) {
    return null;
  }

  return {
    id: String(sender._id),
    email: sender.email.toLowerCase(),
    balance: Number(sender.balance)
  };
}

export async function getDailyTransferUsage(
  userId: string,
  now = new Date()
): Promise<DailyTransferUsage> {
  const from = startOfLocalDay(now);
  const to = nextLocalDayStart(now);
  const debits = await Transaction.find({
    ownerId: userId,
    type: "debit",
    createdAt: {
      $gte: from,
      $lt: to
    }
  })
    .select("amount")
    .lean<Array<{ amount: number }>>();
  const usedToday = debits.reduce(
    (total, transaction) => total + transaction.amount,
    0
  );
  const dailyLimit = config.ai.dailyTransferLimit;

  return {
    dailyLimit,
    usedToday,
    remainingToday: Math.max(0, dailyLimit - usedToday),
    transferCountToday: debits.length,
    resetAt: to
  };
}

export function getMaxSendableNow(input: {
  balance: number;
  dailyRemaining: number;
}) {
  return Math.max(
    0,
    Math.min(input.balance, config.ai.perTransferLimit, input.dailyRemaining)
  );
}

export function getLimitReasons(input: {
  amount?: number;
  balance: number;
  dailyRemaining: number;
  currencySupported: boolean;
}) {
  const reasons: TransferPreflightReason[] = [];
  const amount = input.amount;

  if (!input.currencySupported) {
    reasons.push({
      code: "UNSUPPORTED_CURRENCY",
      message: "Only ILS transfers are supported right now."
    });
  }

  if (amount !== undefined && amount > input.balance) {
    reasons.push({
      code: "INSUFFICIENT_BALANCE",
      message: "Your current balance is not enough for that transfer."
    });
  }

  if (amount !== undefined && amount > config.ai.perTransferLimit) {
    reasons.push({
      code: "EXCEEDS_PER_TRANSFER_LIMIT",
      message: `That amount exceeds the per-transfer limit of ${config.ai.perTransferLimit.toFixed(2)} ILS.`
    });
  }

  if (amount !== undefined && amount > input.dailyRemaining) {
    reasons.push({
      code: "EXCEEDS_DAILY_LIMIT",
      message: `That amount exceeds your remaining daily limit of ${input.dailyRemaining.toFixed(2)} ILS.`
    });
  }

  return reasons;
}

export async function hasPriorDebitToRecipient(input: {
  userId: string;
  recipientEmail: string;
}) {
  const existing = await Transaction.exists({
    ownerId: input.userId,
    counterpartyEmail: input.recipientEmail,
    type: "debit"
  });

  return Boolean(existing);
}
