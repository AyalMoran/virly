import { Transaction } from "../../models/Transaction.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  buildTransactionFilter,
  getTransactionQueryContext,
  transactionMemoryUpdatesFromRows,
  toSafeTransactionRows
} from "./transactionHelpers.js";

function average(total: number, count: number) {
  return count > 0 ? total / count : 0;
}

function describeScope(context: ToolContext, visibility: "llm" | "user" = "llm") {
  const queryContext = getTransactionQueryContext(context);
  const parts: string[] = [];

  if (queryContext.direction !== "both") {
    parts.push(queryContext.direction);
  }

  if (queryContext.dateRange) {
    parts.push(queryContext.dateRange.label);
  }

  if (queryContext.amountFilters.minAmount !== undefined) {
    parts.push(`over ${queryContext.amountFilters.minAmount.toFixed(2)} ILS`);
  }

  if (queryContext.amountFilters.maxAmount !== undefined) {
    parts.push(`under ${queryContext.amountFilters.maxAmount.toFixed(2)} ILS`);
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

  return parts.length > 0 ? ` for ${parts.join(", ")}` : "";
}

export async function getTransactionStats(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const transactions = await Transaction.find(buildTransactionFilter(context))
    .sort({ createdAt: -1 })
    .limit(1000);
  const rows = await toSafeTransactionRows(transactions);

  if (rows.length === 0) {
    return createToolResult({
      toolName: "getTransactionStats",
      status: "empty",
      data: null,
      summary: `No transactions${describeScope(context, "llm")} were found.`,
      userSummary: `No transactions${describeScope(context, "user")} were found.`,
      metadata: { recordCount: 0 }
    });
  }

  const sentRows = rows.filter((row) => row.direction === "sent");
  const receivedRows = rows.filter((row) => row.direction === "received");
  const sentTotal = sentRows.reduce((total, row) => total + row.amount, 0);
  const receivedTotal = receivedRows.reduce((total, row) => total + row.amount, 0);
  const largestSent = sentRows.reduce(
    (largest, row) => (row.amount > largest ? row.amount : largest),
    0
  );
  const largestReceived = receivedRows.reduce(
    (largest, row) => (row.amount > largest ? row.amount : largest),
    0
  );
  const net = receivedTotal - sentTotal;

  return createToolResult({
    toolName: "getTransactionStats",
    status: "ok",
    data: {
      count: rows.length,
      sentTotal,
      receivedTotal,
      net
    },
    summary:
      `Transaction stats${describeScope(context, "llm")}: ${rows.length} total, ` +
      `sent ${sentTotal.toFixed(2)} ILS across ${sentRows.length}, ` +
      `received ${receivedTotal.toFixed(2)} ILS across ${receivedRows.length}, ` +
      `net ${net.toFixed(2)} ILS, average sent ${average(sentTotal, sentRows.length).toFixed(2)} ILS, ` +
      `average received ${average(receivedTotal, receivedRows.length).toFixed(2)} ILS` +
      `${largestSent ? `, largest sent ${largestSent.toFixed(2)} ILS` : ""}` +
      `${largestReceived ? `, largest received ${largestReceived.toFixed(2)} ILS` : ""}.`,
    userSummary:
      `Transaction stats${describeScope(context, "user")}: ${rows.length} total, ` +
      `sent ${sentTotal.toFixed(2)} ILS across ${sentRows.length}, ` +
      `received ${receivedTotal.toFixed(2)} ILS across ${receivedRows.length}, ` +
      `net ${net.toFixed(2)} ILS, average sent ${average(sentTotal, sentRows.length).toFixed(2)} ILS, ` +
      `average received ${average(receivedTotal, receivedRows.length).toFixed(2)} ILS` +
      `${largestSent ? `, largest sent ${largestSent.toFixed(2)} ILS` : ""}` +
      `${largestReceived ? `, largest received ${largestReceived.toFixed(2)} ILS` : ""}.`,
    metadata: {
      recordCount: rows.length,
      amount: net,
      transactions: rows.slice(0, 10).map((row) => ({
        transactionId: row.transactionId,
        label: row.llmLabel,
        amount: row.amount,
        currency: row.currency,
        direction: row.direction,
        occurredAt: row.occurredAt,
        counterpartyLabel: row.counterpartyMaskedLabel
      }))
    },
    memoryUpdates: transactionMemoryUpdatesFromRows(rows.slice(0, 10))
  });
}
