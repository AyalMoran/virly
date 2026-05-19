import { Transaction } from "../../models/Transaction.js";
import { toTransactionDto } from "../../utils/transaction-dto.js";
import {
  AssistantToolResult,
  ToolContext
} from "../state.js";

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "masked recipient";
  }

  const visible = localPart.slice(0, 1);
  return `${visible}***@${domain}`;
}

export async function getRecentTransactions(
  context: ToolContext
): Promise<AssistantToolResult> {
  const transactions = await Transaction.find({ ownerId: context.userId })
    .sort({ createdAt: -1 })
    .limit(5);

  if (transactions.length === 0) {
    return {
      toolName: "getRecentTransactions",
      summary: "No recent transactions were found for your account.",
      metadata: {
        recordCount: 0
      }
    };
  }

  const summaries = transactions.map((transaction) => {
    const dto = toTransactionDto(transaction);
    const direction = dto.amount < 0 ? "sent" : "received";
    const amount = Math.abs(dto.amount).toFixed(2);
    return `${direction} ${amount} with ${maskEmail(dto.counterpartyEmail)}`;
  });

  return {
    toolName: "getRecentTransactions",
    summary: `Recent transactions: ${summaries.join("; ")}.`,
    metadata: {
      recordCount: transactions.length
    }
  };
}
