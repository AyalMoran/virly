import { getRepositories } from "../../repositories/index.js";
import { maskEmail } from "../counterpartyMemory.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  getAmountFromContext,
  getCurrencyFromContext,
  getDailyTransferUsage,
  getLimitReasons,
  getRecipientEmailFromContext,
  getSenderPreflightProfile,
  hasPriorDebitToRecipient,
  type TransferPreflightReason
} from "./transferPreflightHelpers.js";

export async function getTransferQuote(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const sender = await getSenderPreflightProfile(context.userId);
  if (!sender) {
    return createToolResult({
      toolName: "getTransferQuote",
      status: "error",
      data: null,
      summary: "I could not find your sender account.",
      metadata: { recordCount: 0 }
    });
  }

  const amount = getAmountFromContext(context);
  const recipientEmail = getRecipientEmailFromContext(context);
  const currency = getCurrencyFromContext(context);

  if (amount === undefined || !recipientEmail) {
    return createToolResult({
      toolName: "getTransferQuote",
      status: "error",
      data: null,
      summary:
        "I need both a recipient and a positive ILS amount before I can quote that transfer.",
      metadata: { recordCount: 0 }
    });
  }

  const [recipient, usage] = await Promise.all([
    getRepositories().users.findByEmail(recipientEmail),
    getDailyTransferUsage(context.userId)
  ]);
  const warnings: TransferPreflightReason[] = getLimitReasons({
    amount,
    balance: sender.balance,
    dailyRemaining: usage.remainingToday,
    currencySupported: currency.supported
  });

  if (!recipient) {
    warnings.push({
      code: "INVALID_RECIPIENT",
      message: "I could not find that recipient as a Virly user."
    });
  } else if (recipient.email.toLowerCase() === sender.email) {
    warnings.push({
      code: "INVALID_RECIPIENT",
      message: "You cannot transfer money to yourself."
    });
  }

  const remainingBalanceAfterTransfer = Number(
    (sender.balance - amount).toFixed(2)
  );

  if (
    recipient &&
    recipient.email.toLowerCase() !== sender.email &&
    !(await hasPriorDebitToRecipient({
      userId: context.userId,
      recipientEmail: recipient.email.toLowerCase()
    }))
  ) {
    warnings.push({
      code: "NEW_RECIPIENT",
      message: "This recipient does not appear in your prior sent-transfer history."
    });
  }

  if (
    remainingBalanceAfterTransfer >= 0 &&
    remainingBalanceAfterTransfer < 50
  ) {
    warnings.push({
      code: "LOW_REMAINING_BALANCE",
      message: "This would leave less than 50.00 ILS in your balance."
    });
  }

  const eligible = !warnings.some((warning) =>
    [
      "INSUFFICIENT_BALANCE",
      "EXCEEDS_PER_TRANSFER_LIMIT",
      "EXCEEDS_DAILY_LIMIT",
      "INVALID_RECIPIENT",
      "UNSUPPORTED_CURRENCY"
    ].includes(warning.code)
  );
  const recipientMaskedLabel = recipient
    ? maskEmail(recipient.email)
    : maskEmail(recipientEmail);
  const resolvedCounterparty = context.resolvedCounterparty;
  const recipientUserLabel =
    resolvedCounterparty?.email?.toLowerCase() === recipient?.email?.toLowerCase()
      ? (resolvedCounterparty?.userLabel ?? recipient?.email ?? recipientEmail)
      : (recipient?.email ?? recipientEmail);
  const amountCurrency = currency.supported ? "ILS" : (currency.currency ?? "unsupported currency");

  return createToolResult({
    toolName: "getTransferQuote",
    status: eligible ? "ok" : "error",
    data: {
      eligible,
      amount,
      currency: amountCurrency,
      recipientLabel: recipientMaskedLabel,
      currentBalance: sender.balance,
      remainingBalanceAfterTransfer,
      dailyUsed: usage.usedToday,
      dailyRemaining: usage.remainingToday,
      warnings: warnings.map((warning) => warning.code)
    },
    summary:
      `Transfer quote for ${amount.toFixed(2)} ${amountCurrency} to ${recipientMaskedLabel}: ` +
      `${eligible ? "eligible" : "not eligible"}. Current balance ${sender.balance.toFixed(2)} ILS, ` +
      `remaining after transfer ${remainingBalanceAfterTransfer.toFixed(2)} ILS. ` +
      `Daily used ${usage.usedToday.toFixed(2)} ILS, daily remaining ${usage.remainingToday.toFixed(2)} ILS.` +
      `${warnings.length > 0 ? ` Warnings: ${warnings.map((warning) => warning.message).join(" ")}` : ""} ` +
      "This quote does not create or send a transfer.",
    userSummary:
      `Transfer quote for ${amount.toFixed(2)} ${amountCurrency} to ${recipientUserLabel}: ` +
      `${eligible ? "eligible" : "not eligible"}. Current balance ${sender.balance.toFixed(2)} ILS, ` +
      `remaining after transfer ${remainingBalanceAfterTransfer.toFixed(2)} ILS. ` +
      `Daily used ${usage.usedToday.toFixed(2)} ILS, daily remaining ${usage.remainingToday.toFixed(2)} ILS.` +
      `${warnings.length > 0 ? ` Warnings: ${warnings.map((warning) => warning.message).join(" ")}` : ""} ` +
      "This quote does not create or send a transfer.",
    metadata: {
      recordCount: 1,
      amount: remainingBalanceAfterTransfer,
      maskedLabel: recipientMaskedLabel
    }
  });
}
