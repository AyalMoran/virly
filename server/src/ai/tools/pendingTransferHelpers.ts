import { AiPendingTransfer } from "../../models/AiPendingTransfer.js";
import { maskEmail } from "../counterpartyMemory.js";
import type { ToolContext, ToolResultMetadata } from "../state.js";

type PendingTransferDocument = InstanceType<typeof AiPendingTransfer>;

export type PendingTransferScope = "current_conversation" | "all_user";

export type PendingTransferRow = {
  pendingTransferId: string;
  conversationId: string;
  label: string;
  llmLabel: string;
  recipientLabel: string;
  recipientMaskedLabel: string;
  recipientEmailMasked: string;
  amount: number;
  currency: "ILS";
  reason: string | null;
  status: "pending";
  expiresAt: string;
};

export function getPendingTransferScope(message: string): PendingTransferScope {
  return /\b(all|every|across conversations|all chats)\b/i.test(message) ||
    /(כל|בכל השיחות|כל האישורים)/.test(message)
    ? "all_user"
    : "current_conversation";
}

function getPendingId(pendingTransfer: PendingTransferDocument) {
  const id = (pendingTransfer as { _id?: unknown })._id;
  return id ? String(id) : pendingTransfer.id;
}

export function getPendingRecipientLabel(
  pendingTransfer: Pick<
    PendingTransferDocument,
    "recipientEmail" | "recipientFirstName" | "recipientLastName"
  >
) {
  const maskedEmail = maskEmail(pendingTransfer.recipientEmail);
  const name = [
    pendingTransfer.recipientFirstName,
    pendingTransfer.recipientLastName
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    userLabel: name
      ? `${name} (${pendingTransfer.recipientEmail})`
      : pendingTransfer.recipientEmail,
    llmLabel: name ? `${name} (${maskedEmail})` : maskedEmail,
    maskedEmail
  };
}

export function toPendingTransferRows(
  pendingTransfers: PendingTransferDocument[]
): PendingTransferRow[] {
  return pendingTransfers.map((pendingTransfer, index) => {
    const recipient = getPendingRecipientLabel(pendingTransfer);
    const amount = Number(pendingTransfer.amount);

    return {
      pendingTransferId: getPendingId(pendingTransfer),
      conversationId: pendingTransfer.conversationId,
      label: `${index + 1}. ${amount.toFixed(2)} ILS to ${recipient.userLabel}`,
      llmLabel: `${index + 1}. ${amount.toFixed(2)} ILS to ${recipient.llmLabel}`,
      recipientLabel: recipient.userLabel,
      recipientMaskedLabel: recipient.llmLabel,
      recipientEmailMasked: recipient.maskedEmail,
      amount,
      currency: "ILS",
      reason: pendingTransfer.reason ?? null,
      status: "pending",
      expiresAt: pendingTransfer.expiresAt.toISOString()
    };
  });
}

export async function findPendingTransfers(
  context: ToolContext,
  scope = getPendingTransferScope(context.message)
) {
  return AiPendingTransfer.find({
    userId: context.userId,
    status: "pending",
    expiresAt: { $gt: new Date() },
    ...(scope === "current_conversation"
      ? { conversationId: context.conversationId }
      : {})
  })
    .sort({ createdAt: -1 })
    .limit(10);
}

export function pendingTransferMetadata(
  rows: PendingTransferRow[],
  resolutionStatus?: "resolved" | "ambiguous" | "unresolved"
): ToolResultMetadata {
  return {
    recordCount: rows.length,
    pendingTransfers: rows.map((row) => ({
      pendingTransferId: row.pendingTransferId,
      label: row.llmLabel,
      recipientLabel: row.recipientMaskedLabel,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      expiresAt: row.expiresAt
    })),
    ...(resolutionStatus ? { pendingTransferResolutionStatus: resolutionStatus } : {}),
    ...(resolutionStatus
      ? {
          pendingTransferCandidates: rows.map((row) => ({
          pendingTransferId: row.pendingTransferId,
          label: row.llmLabel,
          recipientLabel: row.recipientMaskedLabel,
          amount: row.amount,
          currency: row.currency,
          status: row.status,
          expiresAt: row.expiresAt
          }))
        }
      : {})
  };
}
