import { Types } from "mongoose";
import { Transaction } from "../../models/Transaction.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";

export async function getTotalSentToCounterparty(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const counterparty = context.resolvedCounterparty;
  if (!counterparty) {
    return createToolResult({
      toolName: "getTotalSentToCounterparty",
      status: "empty",
      data: null,
      summary: "I need a specific recipient before I can total sent money.",
      metadata: {
        recordCount: 0
      }
    });
  }

  const totals = await Transaction.aggregate<{
    total: number;
    count: number;
  }>([
    {
      $match: {
        ownerId: new Types.ObjectId(context.userId),
        counterpartyEmail: counterparty.email,
        type: "debit"
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

  return createToolResult({
    toolName: "getTotalSentToCounterparty",
    status: count > 0 ? "ok" : "empty",
    data: {
      total,
      count
    },
    summary:
      count > 0
        ? `You have sent ${total.toFixed(2)} in total to ${counterparty.maskedLabel}.`
        : `No sent transactions were found with ${counterparty.maskedLabel}.`,
    userSummary:
      count > 0
        ? `You have sent ${total.toFixed(2)} in total to ${counterparty.userLabel ?? counterparty.email}.`
        : `No sent transactions were found with ${counterparty.userLabel ?? counterparty.email}.`,
    metadata: {
      recordCount: count,
      amount: total,
      counterpartyEmail: counterparty.email,
      maskedLabel: counterparty.maskedLabel
    },
    memoryUpdates: {
      counterparties: [
        {
          counterpartyId: counterparty.email.toLowerCase(),
          emailFullForBackendOnly: counterparty.email.toLowerCase(),
          emailMasked: counterparty.maskedLabel,
          displayName: counterparty.displayName ?? counterparty.maskedLabel,
          relation: "sent_to",
          source: "transaction"
        }
      ]
    }
  });
}
