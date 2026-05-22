import { Transaction } from "../../models/Transaction.js";
import { maskEmail } from "../counterpartyMemory.js";
import type {
  AssistantToolResult,
  ToolContext
} from "../state.js";

export async function getLastSentCounterparty(
  context: ToolContext
): Promise<AssistantToolResult> {
  const transaction = await Transaction.findOne({
    ownerId: context.userId,
    type: "debit"
  })
    .sort({ createdAt: -1 })
    .select("counterpartyEmail");

  if (!transaction) {
    return {
      toolName: "getLastSentCounterparty",
      summary: "No sent transactions were found for your account.",
      metadata: {
        recordCount: 0
      }
    };
  }

  const maskedLabel = maskEmail(transaction.counterpartyEmail);

  return {
    toolName: "getLastSentCounterparty",
    summary: `The last person you sent money to was ${maskedLabel}.`,
    metadata: {
      recordCount: 1,
      counterpartyEmail: transaction.counterpartyEmail,
      maskedLabel
    }
  };
}
