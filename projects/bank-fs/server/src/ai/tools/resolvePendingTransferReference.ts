import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import { maskEmail } from "../counterpartyMemory.js";
import {
  findPendingTransfers,
  pendingTransferMetadata,
  toPendingTransferRows
} from "./pendingTransferHelpers.js";

function getOrdinalFromMessage(message: string) {
  const normalized = message.toLowerCase();
  const ordinalMap: Array<[RegExp, number]> = [
    [/\b(first|1st)\b/, 1],
    [/\b(second|2nd)\b/, 2],
    [/\b(third|3rd)\b/, 3],
    [/(הראשון|ראשונה|ראשון)/, 1],
    [/(השני|השנייה|שני)/, 2],
    [/(השלישי|שלישית|שלישי)/, 3]
  ];

  return ordinalMap.find(([pattern]) => pattern.test(normalized))?.[1];
}

function clarificationRows(context: ToolContext) {
  if (context.clarification?.expectedReplyType !== "pending_transfer") {
    return [];
  }

  return (context.clarification.options ?? []).map((option, index) => ({
    pendingTransferId: option.id,
    conversationId: context.conversationId,
    label: option.label,
    llmLabel: option.label,
    recipientLabel: option.label,
    recipientMaskedLabel: option.label,
    recipientEmailMasked: option.label,
    amount: 0,
    currency: "ILS" as const,
    reason: null,
    status: "pending" as const,
    expiresAt: new Date(Date.now() + index).toISOString()
  }));
}

export async function resolvePendingTransferReference(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const memoryPending = context.counterpartyMemory?.pendingConfirmation;
  if (
    memoryPending?.status === "pending" &&
    new Date(memoryPending.expiresAt) > new Date()
  ) {
    const recipientName = [
      memoryPending.recipientFirstName,
      memoryPending.recipientLastName
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    const recipientLabel = recipientName
      ? `${recipientName} (${memoryPending.recipientEmail})`
      : memoryPending.recipientEmail;
    const recipientMaskedLabel = recipientName
      ? `${recipientName} (${maskEmail(memoryPending.recipientEmail)})`
      : maskEmail(memoryPending.recipientEmail);
    const row = {
      pendingTransferId: memoryPending.confirmationId,
      conversationId: context.conversationId,
      label: `${memoryPending.amount.toFixed(2)} ${memoryPending.currency} to ${recipientLabel}`,
      llmLabel: `${memoryPending.amount.toFixed(2)} ${memoryPending.currency} to ${recipientMaskedLabel}`,
      recipientLabel,
      recipientMaskedLabel,
      recipientEmailMasked: recipientMaskedLabel,
      amount: memoryPending.amount,
      currency: "ILS" as const,
      reason: memoryPending.reason ?? null,
      status: "pending" as const,
      expiresAt: memoryPending.expiresAt
    };

    return createToolResult({
      toolName: "resolvePendingTransferReference",
      status: "ok",
      data: {
        kind: "pending_transfer",
        status: "resolved",
        pendingTransferId: row.pendingTransferId,
        candidates: [
          {
            id: row.pendingTransferId,
            label: row.label,
            value: row.pendingTransferId
          }
        ]
      },
      summary: `Resolved pending transfer reference to ${row.llmLabel}.`,
      userSummary: `Resolved pending transfer reference to ${row.label}.`,
      metadata: {
        ...pendingTransferMetadata([row], "resolved"),
        recordCount: 1
      },
      memoryUpdates: {
        pendingTransfers: [
          {
            pendingTransferId: row.pendingTransferId,
            label: row.label,
            recipientLabel: row.recipientLabel,
            amount: row.amount,
            currency: row.currency,
            expiresAt: row.expiresAt
          }
        ]
      }
    });
  }

  const rows = clarificationRows(context);
  const fallbackRows = rows.length > 0
    ? rows
    : toPendingTransferRows(await findPendingTransfers(context));

  if (fallbackRows.length === 0) {
    return createToolResult({
      toolName: "resolvePendingTransferReference",
      status: "empty",
      data: {
        kind: "pending_transfer",
        status: "unresolved",
        candidates: []
      },
      summary: "No pending transfer confirmation was found in this conversation.",
      metadata: pendingTransferMetadata(fallbackRows, "unresolved")
    });
  }

  const ordinal = getOrdinalFromMessage(context.message);
  if (ordinal) {
    const row = fallbackRows[ordinal - 1];
    if (!row) {
      return createToolResult({
        toolName: "resolvePendingTransferReference",
        status: "empty",
        data: {
          kind: "pending_transfer",
          status: "unresolved",
          candidates: fallbackRows.map((candidate) => ({
            id: candidate.pendingTransferId,
            label: candidate.label,
            value: candidate.pendingTransferId
          }))
        },
        summary: `I could not find pending transfer number ${ordinal}.`,
        metadata: pendingTransferMetadata([], "unresolved")
      });
    }

    return createToolResult({
      toolName: "resolvePendingTransferReference",
      status: "ok",
      data: {
        kind: "pending_transfer",
        status: "resolved",
        pendingTransferId: row.pendingTransferId,
        candidates: [
          {
            id: row.pendingTransferId,
            label: row.label,
            value: row.pendingTransferId
          }
        ]
      },
      summary: `Resolved pending transfer reference to ${row.llmLabel}.`,
      userSummary: `Resolved pending transfer reference to ${row.label}.`,
      metadata: {
        ...pendingTransferMetadata([row], "resolved"),
        recordCount: 1
      }
    });
  }

  if (fallbackRows.length === 1) {
    return createToolResult({
      toolName: "resolvePendingTransferReference",
      status: "ok",
      data: {
        kind: "pending_transfer",
        status: "resolved",
        pendingTransferId: fallbackRows[0].pendingTransferId,
        candidates: [
          {
            id: fallbackRows[0].pendingTransferId,
            label: fallbackRows[0].label,
            value: fallbackRows[0].pendingTransferId
          }
        ]
      },
      summary: `Resolved pending transfer reference to ${fallbackRows[0].llmLabel}.`,
      userSummary: `Resolved pending transfer reference to ${fallbackRows[0].label}.`,
      metadata: {
        ...pendingTransferMetadata(fallbackRows, "resolved"),
        recordCount: 1
      }
    });
  }

  return createToolResult({
    toolName: "resolvePendingTransferReference",
    status: "ok",
    data: {
      kind: "pending_transfer",
      status: "ambiguous",
      candidates: fallbackRows.map((row) => ({
        id: row.pendingTransferId,
        label: row.label,
        value: row.pendingTransferId
      }))
    },
    summary: `I found multiple pending transfer confirmations: ${fallbackRows
      .map((row) => row.llmLabel)
      .join("; ")}.`,
    userSummary: `I found multiple pending transfer confirmations: ${fallbackRows
      .map((row) => row.label)
      .join("; ")}.`,
    metadata: pendingTransferMetadata(fallbackRows, "ambiguous")
  });
}
