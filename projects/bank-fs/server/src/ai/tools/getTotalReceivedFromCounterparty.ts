import { Types } from "mongoose";
import { Transaction } from "../../models/Transaction.js";
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
  const totals = await Transaction.aggregate<{
    total: number;
    count: number;
  }>([
    {
      $match: {
        ownerId: new Types.ObjectId(context.userId),
        counterpartyEmail,
        type: "credit"
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
        count: { $sum: 1 }
      }
    }
  ]);
  const total = totals[0]?.total ?? 0;
  const count = totals[0]?.count ?? 0;
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
