import { Transaction } from "../../models/Transaction.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  metadataFromTransactionRows,
  transactionMemoryUpdatesFromRows,
  toSafeTransactionRows
} from "./transactionHelpers.js";

export async function getTransactionReceipt(
  context: ToolContext
): Promise<RuntimeToolResult> {
  if (!context.resolvedTransactionId) {
    return createToolResult({
      toolName: "getTransactionReceipt",
      status: "empty",
      data: null,
      summary: "I need a specific transaction before I can show details.",
      metadata: { recordCount: 0 }
    });
  }

  const transaction = await Transaction.findOne({
    _id: context.resolvedTransactionId,
    ownerId: context.userId
  });

  if (!transaction) {
    return createToolResult({
      toolName: "getTransactionReceipt",
      status: "empty",
      data: null,
      summary: "No matching transaction was found in your account history.",
      metadata: { recordCount: 0 }
    });
  }

  const [row] = await toSafeTransactionRows([transaction]);
  if (!row) {
    return createToolResult({
      toolName: "getTransactionReceipt",
      status: "empty",
      data: null,
      summary: "No matching transaction was found in your account history.",
      metadata: { recordCount: 0 }
    });
  }

  return createToolResult({
    toolName: "getTransactionReceipt",
    status: "ok",
    data: row,
    summary:
      `Transaction details: ${row.direction} ${row.amount.toFixed(2)} ${row.currency} ` +
      `with ${row.counterpartyMaskedLabel} on ${new Date(row.occurredAt).toISOString()}. ` +
      `Status: ${row.status}${row.reason ? `. Reason: ${row.reason}` : ""}.`,
    userSummary:
      `Transaction details: ${row.direction} ${row.amount.toFixed(2)} ${row.currency} ` +
      `with ${row.counterpartyLabel} on ${new Date(row.occurredAt).toISOString()}. ` +
      `Status: ${row.status}${row.reason ? `. Reason: ${row.reason}` : ""}.`,
    metadata: {
      ...metadataFromTransactionRows([row]),
      transactionId: row.transactionId
    },
    memoryUpdates: transactionMemoryUpdatesFromRows([row])
  });
}
