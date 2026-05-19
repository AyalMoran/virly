import { Transaction } from "../../models/Transaction.js";
import { User } from "../../models/User.js";
import {
  AssistantToolResult,
  ToolContext
} from "../state.js";

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "masked recipient";
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
}

export async function getVerifiedRecipients(
  context: ToolContext
): Promise<AssistantToolResult> {
  const transactions = await Transaction.find({ ownerId: context.userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("counterpartyEmail");
  const emails = [...new Set(transactions.map((transaction) => transaction.counterpartyEmail))];

  if (emails.length === 0) {
    return {
      toolName: "getVerifiedRecipients",
      summary: "No verified recipients were found from your recent transaction history.",
      metadata: {
        recordCount: 0
      }
    };
  }

  const verifiedUsers = await User.find({
    email: { $in: emails },
    isVerified: true
  }).select("email");
  const maskedRecipients = verifiedUsers.map((user) => maskEmail(user.email));

  return {
    toolName: "getVerifiedRecipients",
    summary:
      maskedRecipients.length > 0
        ? `Verified recipients from your history: ${maskedRecipients.join(", ")}.`
        : "No verified recipients were found from your recent transaction history.",
    metadata: {
      recordCount: maskedRecipients.length
    }
  };
}
