import { Transaction } from "../../models/Transaction.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  getCounterpartyDisplays,
  getDisplayOrFallback,
  getLimitFromMessage,
  normalizeCounterpartyEmail
} from "./counterpartyHelpers.js";

export async function getCounterpartyActivityTimeline(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const counterparty = context.resolvedCounterparty;
  if (!counterparty) {
    return createToolResult({
      toolName: "getCounterpartyActivityTimeline",
      status: "empty",
      data: [],
      summary: "I need a specific counterparty before I can show activity.",
      metadata: { recordCount: 0 }
    });
  }

  const email = normalizeCounterpartyEmail(counterparty.email);
  const limit = getLimitFromMessage(context.message, 5, 10);
  const transactions = await Transaction.find({
    ownerId: context.userId,
    counterpartyEmail: email
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("amount type reason createdAt");
  const displays = await getCounterpartyDisplays([email]);
  const display = getDisplayOrFallback(displays, email);

  if (transactions.length === 0) {
    return createToolResult({
      toolName: "getCounterpartyActivityTimeline",
      status: "empty",
      data: [],
      summary: `No recent activity was found with ${display.llmLabel}.`,
      userSummary: `No recent activity was found with ${display.userLabel}.`,
      metadata: {
        recordCount: 0,
        counterpartyEmail: email,
        maskedLabel: display.emailMasked,
        displayName: display.displayName
      }
    });
  }

  const summaries = transactions.map((transaction) => {
    const direction = transaction.type === "debit" ? "sent" : "received";
    const reason = transaction.reason ? ` for ${transaction.reason}` : "";
    return `${direction} ${transaction.amount.toFixed(2)} ILS${reason}`;
  });

  return createToolResult({
    toolName: "getCounterpartyActivityTimeline",
    status: "ok",
    data: summaries,
    summary: `Recent activity with ${display.llmLabel}: ${summaries.join("; ")}.`,
    userSummary: `Recent activity with ${display.userLabel}: ${summaries.join("; ")}.`,
    metadata: {
      recordCount: transactions.length,
      counterpartyEmail: email,
      maskedLabel: display.emailMasked,
      displayName: display.displayName
    },
    memoryUpdates: {
      counterparties: [
        {
          counterpartyId: display.counterpartyId,
          emailFullForBackendOnly: display.email,
          emailMasked: display.emailMasked,
          displayName: display.displayName,
          firstName: display.firstName,
          lastName: display.lastName,
          relation: "both",
          source: "transaction"
        }
      ]
    }
  });
}
