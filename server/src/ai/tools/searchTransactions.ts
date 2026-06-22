import { getRepositories } from "../../repositories/index.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  buildTransactionFilterCriteria,
  getTransactionLimit,
  getTransactionQueryContext,
  getTransactionSortFromMessage,
  metadataFromTransactionRows,
  summarizeTransactionRows,
  summarizeTransactionRowsForLlm,
  transactionMemoryUpdatesFromRows,
  toSafeTransactionRows
} from "./transactionHelpers.js";

function describeFilters(context: ToolContext, visibility: "llm" | "user" = "llm") {
  const queryContext = getTransactionQueryContext(context);
  const parts: string[] = [];

  if (queryContext.direction !== "both") {
    parts.push(queryContext.direction);
  }

  if (queryContext.amountFilters.minAmount !== undefined) {
    parts.push(`over ${queryContext.amountFilters.minAmount.toFixed(2)} ILS`);
  }

  if (queryContext.amountFilters.maxAmount !== undefined) {
    parts.push(`under ${queryContext.amountFilters.maxAmount.toFixed(2)} ILS`);
  }

  if (queryContext.dateRange) {
    parts.push(queryContext.dateRange.label);
  }

  if (queryContext.reasonQuery) {
    parts.push(`reason matching "${queryContext.reasonQuery}"`);
  }

  if (visibility === "llm" && context.resolvedCounterparty?.maskedLabel) {
    parts.push(`with ${context.resolvedCounterparty.maskedLabel}`);
  }

  if (visibility === "user" && context.resolvedCounterparty?.email) {
    parts.push(
      `with ${context.resolvedCounterparty.userLabel ?? context.resolvedCounterparty.email}`
    );
  }

  return parts.length > 0 ? ` matching ${parts.join(", ")}` : "";
}

export async function searchTransactions(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const limit = getTransactionLimit(context, 10);
  const transactions = await getRepositories().transactions.listForOwnerFiltered(
    buildTransactionFilterCriteria(context, {
      limit,
      sort: getTransactionSortFromMessage(context.message)
    })
  );
  const rows = await toSafeTransactionRows(transactions);

  if (rows.length === 0) {
    return createToolResult({
      toolName: "searchTransactions",
      status: "empty",
      data: [],
      summary: `No transactions${describeFilters(context, "llm")} were found.`,
      userSummary: `No transactions${describeFilters(context, "user")} were found.`,
      metadata: {
        recordCount: 0
      }
    });
  }

  return createToolResult({
    toolName: "searchTransactions",
    status: "ok",
    data: rows,
    summary: `Transactions${describeFilters(context, "llm")}: ${summarizeTransactionRowsForLlm(rows)}.`,
    userSummary: `Transactions${describeFilters(context, "user")}: ${summarizeTransactionRows(rows)}.`,
    metadata: metadataFromTransactionRows(rows),
    memoryUpdates: transactionMemoryUpdatesFromRows(rows)
  });
}
