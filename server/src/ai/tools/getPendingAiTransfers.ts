import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  findPendingTransfers,
  getPendingTransferScope,
  pendingTransferMetadata,
  toPendingTransferRows
} from "./pendingTransferHelpers.js";

export async function getPendingAiTransfers(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const scope = getPendingTransferScope(context.message);
  const pendingTransfers = await findPendingTransfers(context, scope);
  const rows = toPendingTransferRows(pendingTransfers);
  const scopeText =
    scope === "all_user" ? "across all conversations" : "in this conversation";

  if (rows.length === 0) {
    return createToolResult({
      toolName: "getPendingAiTransfers",
      status: "empty",
      data: [],
      summary: `No pending transfer confirmations were found ${scopeText}.`,
      metadata: pendingTransferMetadata(rows),
      memoryUpdates: { pendingTransfers: [] }
    });
  }

  return createToolResult({
    toolName: "getPendingAiTransfers",
    status: "ok",
    data: rows,
    summary: `Pending transfer confirmations ${scopeText}: ${rows
      .map((row) => `${row.llmLabel}${row.reason ? ` for ${row.reason}` : ""}, expires ${row.expiresAt}`)
      .join("; ")}.`,
    userSummary: `Pending transfer confirmations ${scopeText}: ${rows
      .map((row) => `${row.label}${row.reason ? ` for ${row.reason}` : ""}, expires ${row.expiresAt}`)
      .join("; ")}.`,
    metadata: pendingTransferMetadata(rows),
    memoryUpdates: {
      pendingTransfers: rows.map((row) => ({
        pendingTransferId: row.pendingTransferId,
        label: row.label,
        recipientLabel: row.recipientLabel,
        amount: row.amount,
        currency: row.currency,
        expiresAt: row.expiresAt
      }))
    }
  });
}
