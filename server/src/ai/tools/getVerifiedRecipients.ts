import { Transaction } from "../../models/Transaction.js";
import { User } from "../../models/User.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import { getCounterpartyDisplays, getDisplayOrFallback } from "./counterpartyHelpers.js";

export async function getVerifiedRecipients(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const transactions = await Transaction.find({ ownerId: context.userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("counterpartyEmail");
  const emails = [...new Set(transactions.map((transaction) => transaction.counterpartyEmail))];

  if (emails.length === 0) {
    return createToolResult({
      toolName: "getVerifiedRecipients",
      status: "empty",
      data: [],
      summary: "No verified recipients were found from your recent transaction history.",
      metadata: {
        recordCount: 0
      }
    });
  }

  const verifiedUsers = await User.find({
    email: { $in: emails },
    isVerified: true
  }).select("email");
  const displays = await getCounterpartyDisplays(verifiedUsers.map((user) => user.email));
  const recipients = verifiedUsers.map((user) => getDisplayOrFallback(displays, user.email));

  return createToolResult({
    toolName: "getVerifiedRecipients",
    status: recipients.length > 0 ? "ok" : "empty",
    data: recipients.map((recipient) => recipient.userLabel),
    summary:
      recipients.length > 0
        ? `Verified recipients from your history: ${recipients.map((recipient) => recipient.llmLabel).join(", ")}.`
        : "No verified recipients were found from your recent transaction history.",
    userSummary:
      recipients.length > 0
        ? `Verified recipients from your history: ${recipients.map((recipient) => recipient.userLabel).join(", ")}.`
        : "No verified recipients were found from your recent transaction history.",
    metadata: {
      recordCount: recipients.length
    }
  });
}
