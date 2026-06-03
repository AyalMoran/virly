import { Types } from "mongoose";
import { Transaction } from "../../models/Transaction.js";
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
  const totals = await Transaction.aggregate<{
    _id: "credit" | "debit";
    total: number;
    count: number;
  }>([
    {
      $match: {
        ownerId: new Types.ObjectId(context.userId),
        counterpartyEmail,
        type: { $in: ["credit", "debit"] }
      }
    },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$amount" },
        count: { $sum: 1 }
      }
    }
  ]);

  const received = totals.find((total) => total._id === "credit");
  const sent = totals.find((total) => total._id === "debit");
  const receivedAmount = received?.total ?? 0;
  const sentAmount = sent?.total ?? 0;
  const receivedCount = received?.count ?? 0;
  const sentCount = sent?.count ?? 0;
  const recordCount = receivedCount + sentCount;
  const netAmount = receivedAmount - sentAmount;
  const userLabel = counterparty.userLabel ?? counterparty.email;
  const netDirection =
    netAmount > 0
      ? "they have sent you more"
      : netAmount < 0
        ? "you have sent them more"
        : "you are even";

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
