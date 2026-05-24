import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  getAmountFromContext,
  getCurrencyFromContext,
  getDailyTransferUsage,
  getLimitReasons,
  getMaxSendableNow,
  getSenderPreflightProfile
} from "./transferPreflightHelpers.js";

export async function getTransferEligibility(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const sender = await getSenderPreflightProfile(context.userId);
  if (!sender) {
    return createToolResult({
      toolName: "getTransferEligibility",
      status: "error",
      data: null,
      summary: "I could not find your sender account.",
      metadata: { recordCount: 0 }
    });
  }

  const amount = getAmountFromContext(context);
  const currency = getCurrencyFromContext(context);
  const usage = await getDailyTransferUsage(context.userId);
  const maxSendableNow = getMaxSendableNow({
    balance: sender.balance,
    dailyRemaining: usage.remainingToday
  });
  const reasons = getLimitReasons({
    amount,
    balance: sender.balance,
    dailyRemaining: usage.remainingToday,
    currencySupported: currency.supported
  });
  const eligible = reasons.length === 0;

  if (amount === undefined) {
    return createToolResult({
      toolName: "getTransferEligibility",
      status: "ok",
      data: {
        eligible: true,
        maxSendableNow,
        balance: sender.balance,
        dailyRemaining: usage.remainingToday
      },
      summary:
        `You can send up to ${maxSendableNow.toFixed(2)} ILS right now. ` +
        `Balance: ${sender.balance.toFixed(2)} ILS. Daily remaining: ${usage.remainingToday.toFixed(2)} ILS.`,
      metadata: {
        recordCount: 1,
        amount: maxSendableNow
      }
    });
  }

  return createToolResult({
    toolName: "getTransferEligibility",
    status: eligible ? "ok" : "error",
    data: {
      eligible,
      amount,
      currency: currency.currency ?? "ILS",
      reasons: reasons.map((reason) => reason.code),
      maxSendableNow
    },
    summary: eligible
      ? `Yes, ${amount.toFixed(2)} ILS is eligible based on your balance and current limits. This does not create or send a transfer.`
      : `No, ${amount.toFixed(2)} ${currency.currency ?? "ILS"} is not eligible right now: ${reasons
          .map((reason) => reason.message)
          .join(" ")}`,
    metadata: {
      recordCount: 1,
      amount: maxSendableNow
    }
  });
}
