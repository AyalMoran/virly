import { Transaction } from "../../models/Transaction.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  metadataFromTransactionRows,
  summarizeTransactionRows,
  summarizeTransactionRowsForLlm,
  toSafeTransactionRows,
  transactionMemoryUpdatesFromRows
} from "./transactionHelpers.js";

export async function getRecentTransactions(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const dateRange = context.resolvedDateRange;
  const transactions = await Transaction.find({
    ownerId: context.userId,
    ...(dateRange
      ? {
          createdAt: {
            $gte: dateRange.from,
            $lt: dateRange.to
          }
        }
      : {})
  })
    .sort({ createdAt: -1 })
    .limit(5);

  if (transactions.length === 0) {
    return createToolResult({
      toolName: "getRecentTransactions",
      status: "empty",
      data: [],
      summary: "No recent transactions were found for your account.",
      metadata: {
        recordCount: 0
      }
    });
  }

  const rows = await toSafeTransactionRows(transactions);

  return createToolResult({
    toolName: "getRecentTransactions",
    status: "ok",
    data: rows,
    summary: `Recent transactions: ${summarizeTransactionRowsForLlm(rows).replace(/\b\d+\.\s*/g, "")}.`,
    userSummary: `Recent transactions: ${summarizeTransactionRows(rows).replace(/\b\d+\.\s*/g, "")}.`,
    metadata: {
      ...metadataFromTransactionRows(rows),
      recordCount: transactions.length
    },
    memoryUpdates: {
      ...transactionMemoryUpdatesFromRows(rows),
      ...(dateRange
        ? {
            dateRanges: [
              {
                label: dateRange.label,
                from: dateRange.from.toISOString(),
                to: dateRange.to.toISOString()
              }
            ]
          }
        : {})
    }
  });
}
