import { fakeResult } from "./_aiSafetyKit1.js";
import { createFakePhaseThreeTransactionTools } from "./_aiSafetyKit2.js";
import type {
  AssistantToolExecutors,
  ToolContext
} from "../state.js";

export function createFakePhaseFourTransferTools(executed: string[]): AssistantToolExecutors {
  return {
    ...createFakePhaseThreeTransactionTools(executed),
    async getTransferEligibility(context: ToolContext) {
      executed.push("getTransferEligibility");
      return fakeResult({
        toolName: "getTransferEligibility",
        data: { eligible: true, maxSendableNow: 500 },
        summary: context.requestSlots?.amount?.value
          ? "Yes, that amount is eligible. This does not create or send a transfer."
          : "You can send up to 500.00 ILS right now.",
        metadata: { recordCount: 1, amount: 500 }
      });
    },
    async getTransferQuote(context: ToolContext) {
      executed.push(`getTransferQuote:${context.resolvedCounterparty?.email ?? context.requestSlots?.counterparty?.explicitEmail ?? "none"}`);
      const maskedRecipient = context.resolvedCounterparty?.maskedLabel ?? "a***@example.com";
      const userRecipient = context.resolvedCounterparty?.userLabel ?? context.requestSlots?.counterparty?.explicitEmail ?? "alex@example.com";
      return fakeResult({
        toolName: "getTransferQuote",
        data: { eligible: true, remainingBalanceAfterTransfer: 75, recipientLabel: maskedRecipient },
        summary: `Transfer quote for 50.00 ILS to ${maskedRecipient}: eligible. This quote does not create or send a transfer.`,
        userSummary: `Transfer quote for 50.00 ILS to ${userRecipient}: eligible. This quote does not create or send a transfer.`,
        metadata: { recordCount: 1, amount: 75 }
      });
    },
    async getDailyTransferUsage() {
      executed.push("getDailyTransferUsage");
      return fakeResult({
        toolName: "getDailyTransferUsage",
        data: { dailyLimit: 1000, usedToday: 120, remainingToday: 880, transferCountToday: 2, resetAt: new Date("2026-05-25T00:00:00.000Z") },
        summary: "Daily transfer usage: used 120.00 ILS of 1000.00 ILS today, with 880.00 ILS remaining.",
        metadata: { recordCount: 2, amount: 880 }
      });
    },
    async getPendingAiTransfers(context: ToolContext) {
      executed.push(/all|כל/.test(context.message) ? "getPendingAiTransfers:all_user" : "getPendingAiTransfers:current_conversation");
      return fakeResult({
        toolName: "getPendingAiTransfers",
        data: [{ pendingTransferId: "pending-transfer-1", label: "1. 50.00 ILS to Alex Example (alex@example.com)", recipientLabel: "Alex Example (alex@example.com)", recipientMaskedLabel: "Alex Example (a***@example.com)", recipientEmailMasked: "a***@example.com", amount: 50, currency: "ILS", status: "pending", expiresAt: "2026-05-24T12:00:00.000Z" }],
        memoryUpdates: { pendingTransfers: [{ pendingTransferId: "pending-transfer-1", label: "1. 50.00 ILS to Alex Example (alex@example.com)", recipientLabel: "Alex Example (alex@example.com)", amount: 50, currency: "ILS", expiresAt: "2026-05-24T12:00:00.000Z" }] },
        summary: "Pending transfer confirmations in this conversation: 1. 50.00 ILS to Alex Example (a***@example.com).",
        userSummary: "Pending transfer confirmations in this conversation: 1. 50.00 ILS to Alex Example (alex@example.com).",
        metadata: { recordCount: 1, pendingTransfers: [{ pendingTransferId: "pending-transfer-1", label: "1. 50.00 ILS to Alex Example (a***@example.com)", recipientLabel: "Alex Example (a***@example.com)", amount: 50, currency: "ILS", status: "pending", expiresAt: "2026-05-24T12:00:00.000Z" }] }
      });
    },
    async resolvePendingTransferReference() {
      executed.push("resolvePendingTransferReference");
      return fakeResult({
        toolName: "resolvePendingTransferReference",
        data: { kind: "pending_transfer", status: "resolved", pendingTransferId: "pending-transfer-1", candidates: [{ id: "pending-transfer-1", label: "1. 50.00 ILS to Alex Example (alex@example.com)", value: "pending-transfer-1" }] },
        summary: "Resolved pending transfer reference to 1. 50.00 ILS to Alex Example (a***@example.com).",
        userSummary: "Resolved pending transfer reference to 1. 50.00 ILS to Alex Example (alex@example.com).",
        metadata: { recordCount: 1, pendingTransferResolutionStatus: "resolved", pendingTransferCandidates: [{ pendingTransferId: "pending-transfer-1", label: "1. 50.00 ILS to Alex Example (a***@example.com)", recipientLabel: "Alex Example (a***@example.com)", amount: 50, currency: "ILS", expiresAt: "2026-05-24T12:00:00.000Z" }] }
      });
    }
  };
}
