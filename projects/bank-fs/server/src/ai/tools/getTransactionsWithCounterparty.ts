import { Transaction } from "../../models/Transaction.js";
import { toTransactionDto } from "../../utils/transaction-dto.js";
import type {
  AssistantToolResult,
  ToolContext
} from "../state.js";

export async function getTransactionsWithCounterparty(
  context: ToolContext
): Promise<AssistantToolResult> {
  const counterparty = context.resolvedCounterparty;
  if (!counterparty) {
    return {
      toolName: "getTransactionsWithCounterparty",
      summary: "I need a specific recipient before I can show transactions.",
      metadata: {
        recordCount: 0
      }
    };
  }

  const transactions = await Transaction.find({
    ownerId: context.userId,
    counterpartyEmail: counterparty.email
  })
    .sort({ createdAt: -1 })
    .limit(5);

  if (transactions.length === 0) {
    return {
      toolName: "getTransactionsWithCounterparty",
      summary: `No transactions were found with ${counterparty.maskedLabel}.`,
      metadata: {
        recordCount: 0,
        counterpartyEmail: counterparty.email,
        maskedLabel: counterparty.maskedLabel
      }
    };
  }

  const summaries = transactions.map((transaction) => {
    const dto = toTransactionDto(transaction);
    const direction = dto.amount < 0 ? "sent" : "received";
    const amount = Math.abs(dto.amount).toFixed(2);
    const reason = dto.reason ? ` for ${dto.reason}` : "";
    return `${direction} ${amount}${reason}`;
  });

  return {
    toolName: "getTransactionsWithCounterparty",
    summary: `Recent transactions with ${counterparty.maskedLabel}: ${summaries.join("; ")}.`,
    metadata: {
      recordCount: transactions.length,
      counterpartyEmail: counterparty.email,
      maskedLabel: counterparty.maskedLabel
    }
  };
}
