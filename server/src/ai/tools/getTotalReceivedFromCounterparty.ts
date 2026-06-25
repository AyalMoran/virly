import { getRepositories } from "../../repositories/index.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import { normalizeCounterpartyEmail } from "./counterpartyHelpers.js";

export async function getTotalReceivedFromCounterparty(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const counterparty = context.resolvedCounterparty;
  if (!counterparty) {
    return createToolResult({
      toolName: "getTotalReceivedFromCounterparty",
      status: "empty",
      data: null,
      summary:
        "I need a specific counterparty before I can total received money.",
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
  const total = totals.creditTotal;
  const count = totals.creditCount;
  const userLabel = counterparty.userLabel ?? counterparty.email;

  return createToolResult({
    toolName: "getTotalReceivedFromCounterparty",
    status: count > 0 ? "ok" : "empty",
    data: {
      total,
      count
    },
    summary:
      count > 0
        ? `${counterparty.maskedLabel} has sent you ${total.toFixed(2)} in total.`
        : `No received transactions were found from ${counterparty.maskedLabel}.`,
    userSummary:
      count > 0
        ? `${userLabel} has sent you ${total.toFixed(2)} in total.`
        : `No received transactions were found from ${userLabel}.`,
    userSummaryHe:
      count > 0
        ? `${userLabel} שלח/ה לך סך הכל ${total.toFixed(2)} ₪.`
        : `לא נמצאו העברות שהתקבלו מ-${userLabel}.`,
    metadata: {
      recordCount: count,
      amount: total,
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
          relation: "received_from",
          source: "transaction"
        }
      ],
      totals:
        count > 0
          ? [
              {
                id: `received:${counterpartyEmail}`,
                counterpartyEmail,
                direction: "received",
                amount: total,
                currency: "ILS",
                sourceToolName: "getTotalReceivedFromCounterparty",
                aliases: [
                  "that amount",
                  "that total",
                  "the total he sent me",
                  "the total they sent me",
                  `total received from ${counterparty.maskedLabel}`
                ]
              }
            ]
          : []
    }
  });
}
