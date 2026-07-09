import { getRepositories } from "../../repositories/index.js";
import { toTransactionDto } from "../../utils/transaction-dto.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  getTransactionLimitAllowingAll,
  metadataFromTransactionRows,
  transactionMemoryUpdatesFromRows
} from "./transactionHelpers.js";

export async function getTransactionsWithCounterparty(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const counterparty = context.resolvedCounterparty;
  if (!counterparty) {
    return createToolResult({
      toolName: "getTransactionsWithCounterparty",
      status: "empty",
      data: [],
      summary: "I need a specific recipient before I can show transactions.",
      metadata: {
        recordCount: 0
      }
    });
  }

  const transactions = await getRepositories().transactions.recentWithCounterparty({
    ownerId: context.userId,
    counterpartyEmail: counterparty.email,
    limit: getTransactionLimitAllowingAll(context, 10)
  });

  if (transactions.length === 0) {
    return createToolResult({
      toolName: "getTransactionsWithCounterparty",
      status: "empty",
      data: [],
      summary: `No transactions were found with ${counterparty.maskedLabel}.`,
      userSummary: `No transactions were found with ${counterparty.userLabel ?? counterparty.email}.`,
      metadata: {
        recordCount: 0,
        counterpartyEmail: counterparty.email,
        maskedLabel: counterparty.maskedLabel
      }
    });
  }

  const summaries = transactions.map((transaction, index) => {
    const dto = toTransactionDto(transaction);
    const direction = (dto.amount < 0 ? "sent" : "received") as
      | "sent"
      | "received";
    const amount = Math.abs(dto.amount).toFixed(2);
    const reason = dto.reason ? ` for ${dto.reason}` : "";
    return {
      transactionId: dto.id,
      label: `${index + 1}. ${direction} ${amount} ILS with ${counterparty.userLabel ?? counterparty.email}`,
      llmLabel: `${index + 1}. ${direction} ${amount} ILS with ${counterparty.maskedLabel}`,
      amount: Math.abs(dto.amount),
      currency: "ILS" as const,
      direction,
      occurredAt: new Date(transaction.createdAt).toISOString(),
      counterpartyLabel: counterparty.userLabel ?? counterparty.email,
      counterpartyMaskedLabel: counterparty.maskedLabel,
      reason: dto.reason ?? null,
      status: "completed" as const,
      counterpartyEmail: counterparty.email
    };
  });

  return createToolResult({
    toolName: "getTransactionsWithCounterparty",
    status: "ok",
    data: summaries,
    summary: `Recent transactions with ${counterparty.maskedLabel}: ${summaries
      .map((summary) => {
        const reason = summary.reason ? ` for ${summary.reason}` : "";
        return `${summary.direction} ${summary.amount.toFixed(2)}${reason}`;
      })
      .join("; ")}.`,
    userSummary: `Recent transactions with ${counterparty.userLabel ?? counterparty.email}: ${summaries
      .map((summary) => {
        const reason = summary.reason ? ` for ${summary.reason}` : "";
        return `${summary.direction} ${summary.amount.toFixed(2)}${reason}`;
      })
      .join("; ")}.`,
    metadata: {
      ...metadataFromTransactionRows(summaries),
      counterpartyEmail: counterparty.email,
      maskedLabel: counterparty.maskedLabel
    },
    memoryUpdates: transactionMemoryUpdatesFromRows(summaries)
  });
}
