import { getRepositories } from "../../repositories/index.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import { normalizeCounterpartyEmail } from "./counterpartyHelpers.js";

export async function getNetWithCounterparty(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const counterparty = context.resolvedCounterparty;
  if (!counterparty) {
    return createToolResult({
      toolName: "getNetWithCounterparty",
      status: "empty",
      data: null,
      summary:
        "I need a specific counterparty before I can calculate the net total.",
      metadata: {
        recordCount: 0
      }
    });
  }

  const counterpartyEmail = normalizeCounterpartyEmail(counterparty.email);
  const totals = await getRepositories().transactions.getDirectionalTotals({
    ownerId: context.userId,
    counterpartyEmail
  });

  const receivedAmount = totals.creditTotal;
  const sentAmount = totals.debitTotal;
  const receivedCount = totals.creditCount;
  const sentCount = totals.debitCount;
  const recordCount = receivedCount + sentCount;
  const netAmount = receivedAmount - sentAmount;
  const userLabel = counterparty.userLabel ?? counterparty.email;
  const netDirection =
    netAmount > 0
      ? "they have sent you more"
      : netAmount < 0
        ? "you have sent them more"
        : "you are even";
  const netDirectionHe =
    netAmount > 0
      ? "הם שלחו לך יותר"
      : netAmount < 0
        ? "שלחת להם יותר"
        : "אתם שווים";

  return createToolResult({
    toolName: "getNetWithCounterparty",
    status: recordCount > 0 ? "ok" : "empty",
    data: {
      receivedAmount,
      sentAmount,
      netAmount,
      receivedCount,
      sentCount,
      count: recordCount
    },
    summary:
      recordCount > 0
        ? `Net with ${counterparty.maskedLabel}: received ${receivedAmount.toFixed(2)}, sent ${sentAmount.toFixed(2)}, net ${netAmount.toFixed(2)} (${netDirection}).`
        : `No transactions were found with ${counterparty.maskedLabel}.`,
    userSummary:
      recordCount > 0
        ? `Net with ${userLabel}: received ${receivedAmount.toFixed(2)}, sent ${sentAmount.toFixed(2)}, net ${netAmount.toFixed(2)} (${netDirection}).`
        : `No transactions were found with ${userLabel}.`,
    userSummaryHe:
      recordCount > 0
        ? `נטו מול ${userLabel}: קיבלת ${receivedAmount.toFixed(2)} ₪, שלחת ${sentAmount.toFixed(2)} ₪, נטו ${netAmount.toFixed(2)} ₪ (${netDirectionHe}).`
        : `לא נמצאו עסקאות מול ${userLabel}.`,
    metadata: {
      recordCount,
      amount: netAmount,
      netAmount,
      receivedAmount,
      sentAmount,
      counterpartyEmail,
      maskedLabel: counterparty.maskedLabel
    },
    memoryUpdates: {
      counterparties: [
        {
          counterpartyId: counterpartyEmail,
          emailFullForBackendOnly: counterpartyEmail,
          emailMasked: counterparty.maskedLabel,
          displayName: counterparty.displayName ?? counterparty.maskedLabel,
          relation: "both",
          source: "transaction"
        }
      ],
      totals:
        recordCount > 0
          ? [
              {
                id: `net:${counterpartyEmail}`,
                counterpartyEmail,
                direction: "net",
                amount: netAmount,
                currency: "ILS",
                sourceToolName: "getNetWithCounterparty",
                aliases: [
                  "that amount",
                  "that total",
                  "the net",
                  "the net total",
                  `net with ${counterparty.maskedLabel}`
                ]
              }
            ]
          : []
    }
  });
}
